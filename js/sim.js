// «Уголь» — симуляция рейса: время, путь, уголь, тепло, люди, кражи.
// Без DOM: всё состояние в объекте S, события уходят в S.events.
'use strict';

const DAY = 1440;
const T = (h, m = 0) => (h < 12 ? DAY : 0) + h * 60 + m; // 21:00 → 1260, 03:00 → 1620

const SPEED = { eco: 23, norm: 31, full: 39 };
const BURN = { eco: 0.8, norm: 1, full: 1.3 };
const CAR_COUNT = 10;
const CAR_CAP = 54;
const BOX_MAX = 200;
let WORLD = null; // сеть путей (js/world.js), строится из S.wseed

function outsideTemp(t, S) {
  // днём −24°, к 05:00 −43°
  const h = ((t % DAY) + DAY) % DAY / 60;
  const d = Math.cos(((h - 5) / 24) * Math.PI * 2); // 1 в 05:00
  let temp = -33.5 - 9.5 * d;
  if (S && blizzard(S)) temp -= 4;
  return temp;
}

function blizzard(S) {
  return S.t >= T(1, 0) && S.t < T(2, 30);
}

function speedKmh(g, mode, bliz) {
  let v = SPEED[mode] * (g > 0 ? 1 - g * 0.035 : 1 + -g * 0.012);
  if (bliz) v *= 0.75;
  return v;
}

function burnPerKm(g, mode, bliz) {
  return 25 * Math.max(0.45, 1 + g * 0.09) * BURN[mode] * (bliz ? 1.2 : 1);
}

// ---------- положение и маршрут ----------
function curEdge(S) { return WORLD.edges[S.pos.e]; }
function curGrade(S) { return gradeOn(curEdge(S), S.pos.dir, S.pos.d); }
function gradeNow(S) { return curGrade(S); }

// точка на текущем ребре (d — пройдено от начала ребра по ходу)
function posXY(S, extra = 0) {
  const e = curEdge(S);
  const d = Math.min(e.len, S.pos.d + extra);
  return pointOnEdge(e, S.pos.dir > 0 ? d : e.len - d);
}

// остаток маршрута в виде отрезков {e, dir, from, to, node(в конце)}
function routeLegs(S) {
  const legs = [];
  const atNode = S.stop && S.stop.node != null;
  let from;
  if (!atNode) {
    const e = curEdge(S);
    const node = S.pos.dir > 0 ? e.b : e.a;
    legs.push({ e, dir: S.pos.dir, from: S.pos.d, to: e.len, node });
    from = node;
  } else from = S.stop.node;
  const rest = atNode ? S.route : S.route.slice(1);
  for (const n of rest) {
    const e = edgeBetween(WORLD, from, n);
    if (!e) break;
    legs.push({ e, dir: e.a === from ? 1 : -1, from: 0, to: e.len, node: n });
    from = n;
  }
  return legs;
}

// пройти по маршруту: колбэк(уклон, шаг км) → false, чтобы остановиться
function walkRoute(S, fn, untilNode = null) {
  for (const L of routeLegs(S)) {
    for (let d = L.from; d < L.to; d += 0.5) {
      const step = Math.min(0.5, L.to - d);
      if (fn(gradeOn(L.e, L.dir, d), step) === false) return;
    }
    if (untilNode !== null && L.node === untilNode) return;
  }
}

function routeLength(S) { let s = 0; walkRoute(S, (g, st) => { s += st; }); return s; }

function coalNeeded(S, untilNode, mode = 'norm') {
  let c = 0;
  walkRoute(S, (g, st) => { c += burnPerKm(g, mode, false) * st; }, untilNode);
  return c;
}

// прогноз: на сколько часов хватит тендера и сколько ехать до конца
function forecast(S) {
  let coal = S.tender, hours = 0, toDest = 0, empty = false, dist = 0;
  const mode = S.mode;
  walkRoute(S, (g, st) => {
    const v = speedKmh(g, mode, false);
    toDest += st / v;
    dist += st;
    if (empty) return;
    const need = burnPerKm(g, mode, false) * st;
    if (coal < need) { empty = true; return; }
    coal -= need;
    hours += st / v;
  });
  if (!empty) hours += coal / (25 * BURN[mode]) / SPEED[mode];
  // стоянки по маршруту
  for (const n of S.route) toDest += (WORLD.nodes[n].stop || 0) / 60;
  return { coalHours: hours, destHours: toDest, enough: !empty, dist };
}

// ближайшая остановка по маршруту
function nextStop(S) {
  let acc = 0;
  for (const L of routeLegs(S)) {
    acc += L.to - L.from;
    const n = WORLD.nodes[L.node];
    if (n.stop || L.node === WORLD.dest) return { node: n, dist: acc };
  }
  return { node: WORLD.nodes[WORLD.dest], dist: acc };
}

function hasSignal(S) {
  const p = S.stop && S.stop.node != null ? WORLD.nodes[S.stop.node] : posXY(S);
  return WORLD.nodes.some((n) => n.radio && Math.hypot(n.x - p.x, n.y - p.y) <= 15);
}

function nearestRadio(S) {
  const p = posXY(S);
  let best = null;
  for (const n of WORLD.nodes) {
    if (!n.radio) continue;
    const d = Math.hypot(n.x - p.x, n.y - p.y);
    if (!best || d < best.d) best = { n, d };
  }
  return best;
}

// проложить маршрут (через точку wp или кратчайший)
function planRoute(S, wp = null) {
  const atNode = S.stop && S.stop.node != null;
  const base = atNode ? S.stop.node : S.route[0];
  let nodes;
  if (wp !== null && wp !== base) {
    const a = shortest(WORLD, base, wp).nodes;
    const b = shortest(WORLD, wp, WORLD.dest).nodes;
    nodes = a.concat(b.slice(1));
  } else nodes = shortest(WORLD, base, WORLD.dest).nodes;
  S.route = atNode ? nodes.slice(1) : nodes;
  S.wp = wp;
}

function enterNext(S, fromNode) {
  const to = S.route[0];
  const e = edgeBetween(WORLD, fromNode, to);
  S.trail.unshift({ e: S.pos.e, dir: S.pos.dir });
  if (S.trail.length > 4) S.trail.length = 4;
  S.pos = { e: e.id, dir: e.a === fromNode ? 1 : -1, d: 0 };
}

// ---------- люди и вагоны ----------

function carPeople(S, n) {
  return S.people.filter((p) => p.car === n && !p.detained && !p.gone && p.alive);
}

function newCars() {
  const cars = [];
  for (let n = 1; n <= CAR_COUNT; n++) {
    cars.push({ n, box: 170 + ((n * 37) % 30), T: 21, heat: true, windows: false, locked: false, burned: 0 });
  }
  return cars;
}

function carBurnPerHour(S, car, tOut) {
  // кг/ч — пропорционально теплу, которое котёл отдаёт
  return (car.out || 0) / 16 * 6.5;
}

// ---------- шаг симуляции: 1 игровая минута ----------

function stepMinute(S) {
  if (S.ended) return;
  const dt = 1 / 60; // ч
  const tOut = outsideTemp(S.t, S);
  const bliz = blizzard(S);

  // --- движение ---
  if (S.stop) {
    if (S.stop.until !== null && S.t >= S.stop.until) depart(S);
  } else if (S.moving) {
    const g = curGrade(S);
    const v = speedKmh(g, S.mode, bliz);
    let dkm = v * dt;
    const need = burnPerKm(g, S.mode, bliz) * dkm;
    if (S.tender >= need) {
      S.tender -= need;
      S.speed = v;
      S.burnRate = need * 60;
      // движение по рёбрам с переходом через узлы
      let guard = 0;
      while (dkm > 0 && guard++ < 5) {
        const e = curEdge(S);
        const left = e.len - S.pos.d;
        if (dkm < left) { S.pos.d += dkm; S.odo += dkm; dkm = 0; break; }
        S.pos.d = e.len; S.odo += left; dkm -= left;
        const node = S.route.shift();
        if (arriveNode(S, node)) break; // остановка или финиш
        enterNext(S, node);
      }
    } else {
      S.tender = 0;
      S.moving = false;
      S.speed = 0;
      S.burnRate = 0;
      noCoalStop(S);
    }
  }
  if (!S.moving || S.stop) { S.speed = 0; }

  // --- отопление и температура ---
  for (const car of S.cars) {
    const ppl = carPeople(S, car.n).length;
    let loss = 0.25 * (car.windows ? 0.72 : 1) * (bliz ? 1.3 : 1);
    const body = ppl * 0.05;
    let out = 0;
    if (car.heat && car.box > 0) {
      const desired = loss * (22 - tOut) - body + (22 - car.T) * 0.6;
      out = Math.max(0, Math.min(22, desired));
    }
    car.out = out;
    const burn = carBurnPerHour(S, car, tOut) * dt;
    if (car.heat) {
      car.box = Math.max(0, car.box - burn);
      car.burned += burn;
    }
    car.T += (out + body - loss * (car.T - tOut)) * dt;
    // кочегар предупреждает, когда ящик жилого вагона почти пуст
    if (car.heat && ppl > 0 && car.box < 30 && !car.lowWarned) { car.lowWarned = true; emit(S, 'boxLow', { n: car.n }); }
    if (car.box >= 60) car.lowWarned = false;
    if (ppl > 0 && car.T < 10 && !car.coldWarned) { car.coldWarned = true; emit(S, 'carCold', { n: car.n }); }
    if (car.T >= 14) car.coldWarned = false;
  }

  // --- здоровье и настроение ---
  for (const p of S.people) {
    if (!p.alive || p.gone) continue;
    const car = S.cars[(p.detained ? 1 : p.car) - 1];
    const Tc = car.T;
    if (Tc < 10) {
      const vuln = p.age >= 65 || p.age < 12 ? 1.7 : 1;
      p.health -= (10 - Tc) * 0.012 * vuln;
    } else if (Tc > 16 && p.health < 100) {
      p.health = Math.min(100, p.health + 0.02);
    }
    if (Tc < 16) p.mood -= (16 - Tc) * 0.008;
    if (S.tamboursLocked) p.mood -= 0.004;
    if (carPeople(S, p.car).length > CAR_CAP) p.mood -= 0.01;
    if (S.stop && S.stop.noCoal) p.mood -= 0.006;
    p.mood = Math.max(0, Math.min(100, p.mood));
    if (p.health <= 0) {
      p.health = 0;
      p.alive = false;
      emit(S, 'death', { pid: p.id });
    }
  }

  // --- банда ---
  gangStep(S);

  // --- журнал, рапорты, события по времени ---
  timedStep(S);

  // --- помощь ---
  if (S.help && !S.help.done && S.t >= S.help.eta) {
    S.help.done = true;
    if (S.help.fake) {
      emit(S, 'helpFail', { pid: S.help.pid });
    } else {
      S.tender += 2500;
      emit(S, 'helpArrive', {});
      if (S.stop && S.stop.noCoal) {
        S.stop = null;
        S.moving = true;
      }
    }
  }

  S.t += 1;
}

function emit(S, type, data) {
  S.events.push({ type, t: S.t, ...data });
}

// прибытие в узел: true — поезд остановился (станция, финиш)
function arriveNode(S, id) {
  const n = WORLD.nodes[id];
  if (id === WORLD.dest) {
    S.moving = false;
    S.ended = true;
    S.stop = { node: id, station: n.name, until: null };
    emit(S, 'finish', {});
    return true;
  }
  if (!S.route.length) planRoute(S); // на всякий случай
  if (S.wp === id) S.wp = null;
  if (n.stop) {
    const coal = S.stationCoal[id] ?? 0;
    S.stop = { node: id, station: n.name, until: S.t + n.stop, coal };
    emit(S, 'arrive', { station: n.name, coal });
    return true;
  }
  emit(S, 'pass', { station: n.name });
  return false;
}

function depart(S) {
  if (!S.stop || S.stop.noCoal) return;
  const id = S.stop.node;
  emit(S, 'depart', { station: S.stop.station });
  S.stop = null;
  S.moving = true;
  if (id != null && S.route.length) enterNext(S, id);
}

function noCoalStop(S) {
  S.stop = { station: null, node: null, until: null, noCoal: true, since: S.t };
  emit(S, 'noCoal', {});
}

// ---------- банда ----------

const THEFTS = [T(23, 40), T(1, 20), T(3, 0), T(4, 30)];

function gangStep(S) {
  const thief = S.people.find((p) => p.role === 'thief');
  // кражи
  for (let i = 0; i < THEFTS.length; i++) {
    if (S.t !== THEFTS[i]) continue;
    const blocked = !thief || thief.detained || thief.gone || S.tamboursLocked;
    if (blocked) {
      S.theftLog.push({ t: S.t, kg: 0, blocked: true });
      continue;
    }
    const remaining = THEFTS.length - i;
    // вор крадёт столько, чтобы поезд встал у точки встречи
    let steal;
    const meetIdx = S.route.indexOf(WORLD.meet);
    if (meetIdx >= 0) {
      let stockAhead = 0;
      for (const n of S.route.slice(0, meetIdx)) if (WORLD.nodes[n].stop) stockAhead += S.stationCoal[n] ?? 0;
      const target = coalNeeded(S, WORLD.meet, 'norm') - 40 - stockAhead;
      steal = (S.tender - target) / remaining;
    } else steal = 150; // маршрут сменили — крадёт по привычке
    
    steal = Math.max(0, Math.min(1300, steal));
    steal = Math.round(steal / 10) * 10;
    S.tender -= steal;
    const box = S.cars[8];
    const fromBox = Math.min(10, box.box);
    box.box -= fromBox;
    S.theftLog.push({ t: S.t, kg: steal, box: fromBox });
    S.stolen += steal + fromBox;
  }

  // точка встречи
  if (S.stop && S.stop.noCoal && meetDist(S) <= 12) {
    const since = S.t - S.stop.since;
    const free = S.people.filter((p) => p.role && !p.detained && !p.gone);
    if (since === 15 && free.length) {
      S.sledges = true;
      emit(S, 'sledges', {});
    }
    if (since === 45 && S.sledges) {
      if (S.tamboursLocked) {
        emit(S, 'sledgesBlocked', {});
      } else if (free.length) {
        for (const p of free) p.gone = true;
        emit(S, 'escape', { pids: free.map((p) => p.id) });
      }
    }
    if (since === 150 && S.sledges) {
      S.sledges = false;
      emit(S, 'sledgesLeave', {});
    }
  }
}

function meetDist(S) {
  const p = posXY(S), m = WORLD.nodes[WORLD.meet];
  return Math.hypot(p.x - m.x, p.y - m.y);
}

function timedStep(S) {
  for (const ev of S.timed) {
    if (!ev.done && S.t >= ev.t) {
      ev.done = true;
      emit(S, ev.type, ev);
    }
  }
}

// ---------- действия, которые стоят времени ----------

function advance(S, minutes) {
  for (let i = 0; i < minutes && !S.ended; i++) stepMinute(S);
}

function newState(seed) {
  WORLD = genWorld(seed);
  const start = WORLD.start;
  const S = {
    v: 2,
    seed,
    wseed: WORLD.seed,
    t: T(21, 0),
    odo: KM0,
    pos: null,
    route: [],
    trail: [],
    wp: null,
    mode: 'norm',
    moving: true,
    speed: 0,
    burnRate: 0,
    stop: null,
    tender: 11000,
    cars: newCars(),
    people: [],
    records: [],
    contras: [],
    complaints: 0,
    playerCar: 5,
    tamboursLocked: false,
    stationCoal: {},
    theftLog: [],
    stolen: 0,
    sledges: false,
    help: null,
    events: [],
    timed: [],
    flags: {},
    interrogated: {},
    ended: false,
    result: null,
    mul: 1,
  };
  // стоим на станции отправления, маршрут — кратчайший
  S.stop = { node: start, station: WORLD.nodes[start].name, until: S.t + 1 };
  planRoute(S);
  S.pos = { e: WORLD.nodes[start].edges[0], dir: 1, d: 0 };
  const e0 = edgeBetween(WORLD, start, S.route[0]);
  S.pos = { e: e0.id, dir: e0.a === start ? 1 : -1, d: 0.36 }; // состав целиком у платформы
  S.odo += 0.36;
  S.stop = null;
  for (const n of WORLD.nodes) if (n.coal) S.stationCoal[n.id] = n.coal;
  return S;
}

function loadWorld(S) { WORLD = genWorld(S.wseed); WORLD.seed = S.wseed; }

Object.assign(globalThis, {
  DAY, T, SPEED, BURN, CAR_COUNT, CAR_CAP, BOX_MAX, THEFTS,
  outsideTemp, blizzard, speedKmh, burnPerKm, coalNeeded, forecast, routeLegs, routeLength, walkRoute,
  nextStop, hasSignal, nearestRadio, planRoute, posXY, curGrade, gradeNow, meetDist, loadWorld,
  carPeople, stepMinute, advance, newState, emit, depart, carBurnPerHour,
});
