// «Уголь» — мир: рельеф, станции, сеть путей, названия, маршруты.
// Координаты в километрах, ось Y направлена вниз (как на экране).
'use strict';

const WORLD_W = 1500;
const WORLD_H = 1000;
const KM0 = 6620; // километраж станции отправления

// ---------- шум ----------
function hash2(x, y, s) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s, oct = 4) {
  let f = 0, amp = 0.5, fr = 1;
  for (let i = 0; i < oct; i++) { f += amp * vnoise(x * fr, y * fr, s + i * 31); amp *= 0.5; fr *= 2.03; }
  return f / 0.9375;
}

// ---------- генерация ----------
function genWorld(seed) {
  for (let k = 0; k < 40; k++) {
    const w = tryWorld(seed + k * 7919);
    if (w) return w;
  }
  throw new Error('world');
}

function tryWorld(seed) {
  const r = rng(seed);
  const W = { seed, nodes: [], edges: [], hs: seed % 100000 };
  // высоты, м
  W.height = (x, y) => {
    const n = fbm(x / 260, y / 260, W.hs, 5);
    const north = Math.max(0, 1 - y / WORLD_H) * 0.25;
    return Math.max(0, (n - 0.35) * 1500 + north * 600);
  };
  W.forest = (x, y) => fbm(x / 40 + 100, y / 40, W.hs + 5, 3);
  W.isLake = (x, y) => W.height(x, y) <= 0 && fbm(x / 60, y / 60, W.hs + 9, 2) > 0.45;

  // крупные станции — диск Пуассона
  const majors = [];
  const minD = 150;
  for (let tries = 0; tries < 6000 && majors.length < 70; tries++) {
    const x = 60 + r() * (WORLD_W - 120), y = 60 + r() * (WORLD_H - 120);
    const h = W.height(x, y);
    if (h > 900 && r() < 0.7) continue; // в горах реже
    if (majors.every((m) => (m.x - x) ** 2 + (m.y - y) ** 2 >= minD * minD)) majors.push({ x, y });
  }
  // граф Габриэля → минимальное остовное дерево + часть лишних рёбер
  const cand = [];
  for (let i = 0; i < majors.length; i++) {
    for (let j = i + 1; j < majors.length; j++) {
      const a = majors[i], b = majors[j];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const rr = ((a.x - b.x) ** 2 + (a.y - b.y) ** 2) / 4;
      let ok = true;
      for (let k = 0; k < majors.length && ok; k++) {
        if (k === i || k === j) continue;
        if ((majors[k].x - mx) ** 2 + (majors[k].y - my) ** 2 < rr) ok = false;
      }
      if (ok) cand.push({ i, j, len: Math.sqrt(rr) * 2 });
    }
  }
  cand.sort((a, b) => a.len - b.len);
  const parent = majors.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const links = [];
  for (const c of cand) {
    const a = find(c.i), b = find(c.j);
    if (a !== b) { parent[a] = b; links.push(c); }
    else if (r() < 0.32 && c.len < 330) links.push(c);
  }

  // узлы крупных станций
  for (const m of majors) W.nodes.push({ id: W.nodes.length, x: m.x, y: m.y, major: true, edges: [] });
  // пути с изгибами и промежуточными станциями
  for (const l of links) {
    const A = W.nodes[l.i], B = W.nodes[l.j];
    const pts = curve(r, A, B);
    // разбить на перегоны промежуточными станциями
    const cum = cumLen(pts);
    const total = cum[cum.length - 1];
    const cuts = [];
    let at = 25 + r() * 35;
    while (at < total - 22) { cuts.push(at); at += 28 + r() * 38; }
    let prevNode = A.id, prevIdx = 0;
    let prevPt = pts[0];
    let piece = [prevPt];
    let ci = 0;
    for (let i = 1; i < pts.length; i++) {
      while (ci < cuts.length && cum[i] >= cuts[ci]) {
        const t = (cuts[ci] - cum[i - 1]) / (cum[i] - cum[i - 1]);
        const p = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
        piece.push(p);
        const n = { id: W.nodes.length, x: p[0], y: p[1], major: false, edges: [] };
        W.nodes.push(n);
        addEdge(W, prevNode, n.id, piece);
        prevNode = n.id; piece = [p];
        ci++;
      }
      piece.push(pts[i]);
    }
    addEdge(W, prevNode, B.id, piece);
    void prevIdx; void prevPt;
  }

  // типы станций
  for (const n of W.nodes) {
    if (n.major) n.type = n.edges.length >= 3 ? 'узловая' : 'станция';
    else {
      const q = r();
      n.type = q < 0.22 ? 'станция' : q < 0.55 ? 'полустанок' : q < 0.93 ? 'разъезд' : 'заброшенная';
    }
  }

  // старт и финиш: две узловые, путь 330–400 км
  const juncs = W.nodes.filter((n) => n.type === 'узловая');
  let best = null;
  for (const a of juncs) {
    const dist = dijkstraAll(W, a.id);
    for (const b of juncs) {
      if (b.id === a.id) continue;
      const d = dist.d[b.id];
      if (d < 330 || d > 400) continue;
      const path = pathFrom(dist.prev, a.id, b.id);
      if (path.length < 6) continue;
      const score = Math.abs(d - 360) + (a.x > b.x ? 0 : 5) + r() * 10;
      if (!best || score < best.score) best = { a: a.id, b: b.id, d, path, score };
    }
  }
  if (!best) return null;
  W.start = best.a;
  W.dest = best.b;

  // точка встречи банды — заброшенный «Угольный» за 20 км до финиша
  const pathEdges = edgesOfPath(W, best.path);
  let acc = 0;
  const L = best.d;
  const meetAt = L - 20;
  for (let i = 0; i < pathEdges.length; i++) {
    const { e, dir } = pathEdges[i];
    if (acc + e.len >= meetAt) {
      const along = meetAt - acc;
      const sa = dir > 0 ? along : e.len - along;
      const fromNodeId = best.path[i], toNodeId = best.path[i + 1];
      if (along < 3) W.meet = fromNodeId;
      else if (e.len - along < 3) W.meet = toNodeId;
      else W.meet = splitEdge(W, e, sa);
      break;
    }
    acc += e.len;
  }
  const meetNode = W.nodes[W.meet];
  meetNode.type = 'заброшенная';
  // пересчитать путь с новым узлом
  let route = shortest(W, W.start, W.dest);
  W.defaultRoute = route.nodes;
  // Шахтёрский — полустанок примерно на 3/4 пути
  const distOn = distancesAlong(W, route.nodes);
  let bestS = null;
  for (let i = 1; i < route.nodes.length - 1; i++) {
    const id = route.nodes[i];
    if (id === W.meet) continue;
    const d = distOn[i];
    if (d < route.len * 0.55 || d > route.len - 35) continue;
    const sc = Math.abs(d - route.len * 0.74);
    if (!bestS || sc < bestS.sc) bestS = { id, sc };
  }
  if (!bestS) return null;
  W.shakht = bestS.id;

  // названия
  nameWorld(W, r);
  W.nodes[W.start].name = 'Кедровый Лог';
  W.nodes[W.dest].name = 'Усть-Кута';
  meetNode.name = 'Угольный';
  W.nodes[W.shakht].name = 'Шахтёрский';
  W.nodes[W.shakht].type = 'полустанок';

  // уголь, стоянки, связь
  const onDefault = new Set(W.defaultRoute);
  for (const n of W.nodes) {
    n.stop = { 'узловая': 20, 'станция': 15, 'полустанок': 10 }[n.type] || 0;
    n.radio = n.type === 'узловая' || n.type === 'станция';
    n.coal = { 'узловая': 6000, 'станция': 1800, 'полустанок': 700 }[n.type] || 0;
    if (n.type === 'заброшенная' && r() < 0.4) n.coal = 300; // забытая куча
    if (onDefault.has(n.id) && n.id !== W.start && n.id !== W.dest) n.coal = 0; // по расписанию угля в пути нет
  }
  W.nodes[W.shakht].coal = 1200;
  W.nodes[W.shakht].stop = 10;
  meetNode.coal = 0;
  meetNode.stop = 0;
  W.nodes[W.dest].stop = 0;

  // километраж от станции отправления
  const dAll = dijkstraAll(W, W.start);
  for (const n of W.nodes) {
    n.km = Math.round(KM0 + dAll.d[n.id]);
    if (n.type === 'разъезд' && !n.name.startsWith('Разъезд')) n.name = `Разъезд ${n.km} км`;
  }
  W.meetKm = Math.round(KM0 + distancesAlong(W, W.defaultRoute)[W.defaultRoute.indexOf(W.meet)]);

  buildGrades(W);
  buildIndex(W);
  genLakes(W, r);
  genRivers(W, r);
  genBridges(W);
  return W;
}

function curve(r, A, B) {
  const dx = B.x - A.x, dy = B.y - A.y;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len, ny = dx / len;
  const a1 = (r() - 0.5) * 0.22 * len, a2 = (r() - 0.5) * 0.12 * len, a3 = (r() - 0.5) * 0.04 * len;
  const ph = r() * 6.28;
  const n = Math.max(6, Math.ceil(len / 3));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const env = Math.sin(Math.PI * t);
    const off = env * (a1 + a2 * Math.sin(2 * Math.PI * t + ph) + a3 * Math.sin(7 * Math.PI * t + ph * 2));
    pts.push([A.x + dx * t + nx * off, A.y + dy * t + ny * off]);
  }
  return pts;
}

function cumLen(pts) {
  const c = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return c;
}

function addEdge(W, a, b, pts) {
  const e = { id: W.edges.length, a, b, pts, cum: cumLen(pts) };
  e.len = e.cum[e.cum.length - 1];
  W.edges.push(e);
  W.nodes[a].edges.push(e.id);
  W.nodes[b].edges.push(e.id);
  return e;
}

function splitEdge(W, e, s) {
  // разрезать ребро e в точке s (от узла a) новым узлом
  const p = pointOnEdge(e, s);
  const n = { id: W.nodes.length, x: p.x, y: p.y, major: false, edges: [] };
  W.nodes.push(n);
  let i = 1;
  while (i < e.cum.length - 1 && e.cum[i] < s) i++;
  const first = e.pts.slice(0, i).concat([[p.x, p.y]]);
  const second = [[p.x, p.y]].concat(e.pts.slice(i));
  // e становится первой половиной
  W.nodes[e.b].edges = W.nodes[e.b].edges.filter((x) => x !== e.id);
  const oldB = e.b;
  e.b = n.id; e.pts = first; e.cum = cumLen(first); e.len = e.cum[e.cum.length - 1];
  n.edges.push(e.id);
  addEdge(W, n.id, oldB, second);
  return n.id;
}

function pointOnEdge(e, s) {
  s = Math.max(0, Math.min(e.len, s));
  let lo = 0, hi = e.cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (e.cum[m] <= s) lo = m; else hi = m; }
  const seg = e.cum[hi] - e.cum[lo] || 1;
  const t = (s - e.cum[lo]) / seg;
  const a = e.pts[lo], b = e.pts[hi];
  return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}

function otherEnd(e, n) { return e.a === n ? e.b : e.a; }
function edgeBetween(W, a, b) {
  let best = null;
  for (const id of W.nodes[a].edges) {
    const e = W.edges[id];
    if (otherEnd(e, a) === b && (!best || e.len < best.len)) best = e;
  }
  return best;
}

// ---------- маршруты ----------
function dijkstraAll(W, src) {
  const n = W.nodes.length;
  const d = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  d[src] = 0;
  for (;;) {
    let u = -1, best = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && d[i] < best) { best = d[i]; u = i; }
    if (u < 0) break;
    done[u] = 1;
    for (const id of W.nodes[u].edges) {
      const e = W.edges[id];
      const v = otherEnd(e, u);
      if (d[u] + e.len < d[v]) { d[v] = d[u] + e.len; prev[v] = u; }
    }
  }
  return { d, prev };
}
function pathFrom(prev, a, b) {
  const p = [];
  for (let v = b; v !== -1; v = prev[v]) { p.push(v); if (v === a) break; }
  p.reverse();
  return p[0] === a ? p : [];
}
function shortest(W, a, b) {
  const r = dijkstraAll(W, a);
  return { nodes: pathFrom(r.prev, a, b), len: r.d[b] };
}
function edgesOfPath(W, nodes) {
  const out = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const e = edgeBetween(W, nodes[i], nodes[i + 1]);
    out.push({ e, dir: e.a === nodes[i] ? 1 : -1 });
  }
  return out;
}
function distancesAlong(W, nodes) {
  const d = [0];
  const es = edgesOfPath(W, nodes);
  for (let i = 0; i < es.length; i++) d.push(d[i] + es[i].e.len);
  return d;
}

// ---------- уклоны ----------
function buildGrades(W) {
  for (const e of W.edges) {
    const n = Math.max(1, Math.ceil(e.len / 2));
    e.g = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const s0 = i * 2, s1 = Math.min(e.len, s0 + 2);
      const p0 = pointOnEdge(e, s0), p1 = pointOnEdge(e, s1);
      const dh = W.height(p1.x, p1.y) - W.height(p0.x, p0.y);
      e.g[i] = Math.max(-12, Math.min(12, Math.round(dh / Math.max(0.5, s1 - s0) / 1)));
    }
  }
}
function gradeOn(e, dir, d) {
  const s = dir > 0 ? d : e.len - d;
  const i = Math.max(0, Math.min(e.g.length - 1, Math.floor(s / 2)));
  return dir > 0 ? e.g[i] : -e.g[i];
}

// ---------- пространственный индекс (для деревьев) ----------
const IDX_CELL = 5;
function buildIndex(W) {
  W.idx = new Map();
  for (const e of W.edges) {
    for (let i = 1; i < e.pts.length; i++) {
      const a = e.pts[i - 1], b = e.pts[i];
      const x0 = Math.floor(Math.min(a[0], b[0]) / IDX_CELL), x1 = Math.floor(Math.max(a[0], b[0]) / IDX_CELL);
      const y0 = Math.floor(Math.min(a[1], b[1]) / IDX_CELL), y1 = Math.floor(Math.max(a[1], b[1]) / IDX_CELL);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const k = x * 4096 + y;
        if (!W.idx.has(k)) W.idx.set(k, []);
        W.idx.get(k).push(a[0], a[1], b[0], b[1]);
      }
    }
    e.bbox = e.pts.reduce((bb, p) => [Math.min(bb[0], p[0]), Math.min(bb[1], p[1]), Math.max(bb[2], p[0]), Math.max(bb[3], p[1])], [1e9, 1e9, -1e9, -1e9]);
  }
}
function trackDist(W, x, y) {
  const k = Math.floor(x / IDX_CELL) * 4096 + Math.floor(y / IDX_CELL);
  const segs = W.idx.get(k);
  if (!segs) return 99;
  let best = 99;
  for (let i = 0; i < segs.length; i += 4) {
    const ax = segs[i], ay = segs[i + 1], bx = segs[i + 2], by = segs[i + 3];
    const dx = bx - ax, dy = by - ay;
    const L2 = dx * dx + dy * dy || 1;
    let t = ((x - ax) * dx + (y - ay) * dy) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = ax + dx * t - x, ey = ay + dy * t - y;
    const d = Math.sqrt(ex * ex + ey * ey);
    if (d < best) best = d;
  }
  return best;
}

// ---------- озёра, реки, мосты ----------
function pointInPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function genLakes(W, r) {
  W.lakes = [];
  for (let t = 0; t < 900 && W.lakes.length < 30; t++) {
    const x = 30 + r() * (WORLD_W - 60), y = 30 + r() * (WORLD_H - 60);
    const h = W.height(x, y);
    if (h > 300 && r() > 0.08) continue;
    const R = 1.5 + r() * r() * 14;
    if (trackDist(W, x, y) < R + 2) continue;
    if (W.lakes.some((l) => Math.hypot(l.x - x, l.y - y) < l.R + R + 3)) continue;
    const pts = [];
    const n = 36, ph = r() * 100;
    let ok = true;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = 0.7 + 0.55 * fbm(Math.cos(a) * 1.3 + ph, Math.sin(a) * 1.3 + ph, W.hs + 41, 3);
      const px = x + Math.cos(a) * R * k, py = y + Math.sin(a) * R * k * 0.8;
      if (trackDist(W, px, py) < 0.6) { ok = false; break; }
      pts.push([px, py]);
    }
    if (!ok) continue;
    const bb = pts.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [1e9, 1e9, -1e9, -1e9]);
    W.lakes.push({ x, y, R, pts, bbox: bb });
  }
  W.isLake = (x, y) => {
    for (const l of W.lakes) {
      const b = l.bbox;
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      if (pointInPoly(l.pts, x, y)) return l;
    }
    return null;
  };
}

function genRivers(W, r) {
  W.rivers = [];
  W.ridx = new Map();
  const H = (x, y) => W.height(x, y);
  // реки, которые пересекают основной маршрут (будут мосты)
  const forced = [];
  const legs = edgesOfPath(W, W.defaultRoute);
  const total = legs.reduce((a, l) => a + l.e.len, 0);
  for (const frac of [0.22, 0.5, 0.83]) {
    let acc = 0;
    for (const { e, dir } of legs) {
      if (acc + e.len >= total * frac) {
        const along = total * frac - acc;
        const p = pointOnEdge(e, dir > 0 ? along : e.len - along);
        const side = r() < 0.5 ? 1 : -1;
        const nx = -Math.sin(p.ang) * side, ny = Math.cos(p.ang) * side;
        forced.push({ x: p.x + nx * 70, y: p.y + ny * 70, tx: p.x - nx * 140, ty: p.y - ny * 140 });
        break;
      }
      acc += e.len;
    }
  }
  for (let t = 0; t < 500 && W.rivers.length < 24; t++) {
    const F = forced[t];
    let x = F ? F.x : 40 + r() * (WORLD_W - 80), y = F ? F.y : 40 + r() * (WORLD_H - 80);
    if (!F && H(x, y) < 420) continue;
    if (!F && W.rivers.some((rv) => rv.pts.some((p) => Math.hypot(p[0] - x, p[1] - y) < 45))) continue;
    const pts = [[x, y]];
    let dx = 0, dy = 0, len = 0, end = null;
    for (let i = 0; i < 320; i++) {
      const gx = (H(x + 1.5, y) - H(x - 1.5, y)) / 3, gy = (H(x, y + 1.5) - H(x, y - 1.5)) / 3;
      const gl = Math.hypot(gx, gy);
      let nx = gl > 0.5 ? -gx / gl : dx, ny = gl > 0.5 ? -gy / gl : dy;
      if (F) { const tx = F.tx - x, ty = F.ty - y, tl = Math.hypot(tx, ty) || 1; nx = nx * 0.25 + (tx / tl) * 0.75; ny = ny * 0.25 + (ty / tl) * 0.75; }
      if (!nx && !ny) { const a = r() * 6.28; nx = Math.cos(a); ny = Math.sin(a); }
      // инерция + меандры
      const m = (fbm(x / 25, y / 25, W.hs + 61, 2) - 0.5) * 1.4;
      let ax = nx * 0.55 + dx * 0.45, ay = ny * 0.55 + dy * 0.45;
      const ca = Math.cos(m), sa = Math.sin(m);
      [ax, ay] = [ax * ca - ay * sa, ax * sa + ay * ca];
      const al = Math.hypot(ax, ay) || 1;
      dx = ax / al; dy = ay / al;
      x += dx * 2.5; y += dy * 2.5; len += 2.5;
      if (x < 2 || y < 2 || x > WORLD_W - 2 || y > WORLD_H - 2) { pts.push([x, y]); end = 'edge'; break; }
      pts.push([x, y]);
      if (W.isLake(x, y)) { end = 'lake'; break; }
      if (F && Math.hypot(F.tx - x, F.ty - y) < 5) { end = 'target'; break; }
      const near = riverDist(W, x, y);
      if (near < 1.2 && len > 10) { end = 'join'; break; }
    }
    if (len < 45 && !F) continue;
    const rv = { pts, w: [] };
    let acc = 0;
    for (let i = 0; i < pts.length; i++) {
      if (i) acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      rv.w.push(0.012 + Math.min(0.2, acc / 2200)); // ширина, км
    }
    rv.bbox = pts.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [1e9, 1e9, -1e9, -1e9]);
    W.rivers.push(rv);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const x0 = Math.floor(Math.min(a[0], b[0]) / IDX_CELL), x1 = Math.floor(Math.max(a[0], b[0]) / IDX_CELL);
      const y0 = Math.floor(Math.min(a[1], b[1]) / IDX_CELL), y1 = Math.floor(Math.max(a[1], b[1]) / IDX_CELL);
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
        const k = cx * 4096 + cy;
        if (!W.ridx.has(k)) W.ridx.set(k, []);
        W.ridx.get(k).push(a[0], a[1], b[0], b[1], rv.w[i]);
      }
    }
  }
}

// расстояние до берега реки (отрицательное — в воде)
function riverDist(W, x, y) {
  const segs = W.ridx && W.ridx.get(Math.floor(x / IDX_CELL) * 4096 + Math.floor(y / IDX_CELL));
  if (!segs) return 99;
  let best = 99;
  for (let i = 0; i < segs.length; i += 5) {
    const ax = segs[i], ay = segs[i + 1], bx = segs[i + 2], by = segs[i + 3];
    const dx = bx - ax, dy = by - ay;
    const L2 = dx * dx + dy * dy || 1;
    let t = ((x - ax) * dx + (y - ay) * dy) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(ax + dx * t - x, ay + dy * t - y) - segs[i + 4] / 2;
    if (d < best) best = d;
  }
  return best;
}

function segX(ax, ay, bx, by, cx, cy, dx, dy) {
  const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (!d) return null;
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [ax + (bx - ax) * t, ay + (by - ay) * t];
}

function genBridges(W) {
  W.bridges = [];
  for (const e of W.edges) {
    for (let i = 1; i < e.pts.length; i++) {
      const a = e.pts[i - 1], b = e.pts[i];
      for (const rv of W.rivers) {
        const bb = rv.bbox;
        if (Math.max(a[0], b[0]) < bb[0] || Math.min(a[0], b[0]) > bb[2] || Math.max(a[1], b[1]) < bb[1] || Math.min(a[1], b[1]) > bb[3]) continue;
        for (let j = 1; j < rv.pts.length; j++) {
          const c = rv.pts[j - 1], d = rv.pts[j];
          const X = segX(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]);
          if (!X) continue;
          if (W.bridges.some((q) => Math.hypot(q.x - X[0], q.y - X[1]) < 0.3)) continue;
          const ta = Math.atan2(b[1] - a[1], b[0] - a[0]);
          const ra = Math.atan2(d[1] - c[1], d[0] - c[0]);
          const cross = Math.abs(Math.sin(ta - ra)) || 0.3;
          W.bridges.push({ x: X[0], y: X[1], ang: ta, len: rv.w[j] / Math.max(0.35, cross) + 0.03, e: e.id });
        }
      }
    }
  }
}

// ---------- названия ----------
const NM = {
  adj: [['Кедровый', 'Кедровая', 'Кедровое'], ['Красный', 'Красная', 'Красное'], ['Тихий', 'Тихая', 'Тихое'], ['Медвежий', 'Медвежья', 'Медвежье'],
    ['Каменный', 'Каменная', 'Каменное'], ['Сосновый', 'Сосновая', 'Сосновое'], ['Светлый', 'Светлая', 'Светлое'], ['Глухой', 'Глухая', 'Глухое'],
    ['Чёрный', 'Чёрная', 'Чёрное'], ['Студёный', 'Студёная', 'Студёное'], ['Высокий', 'Высокая', 'Высокое'], ['Ольховый', 'Ольховая', 'Ольховое'],
    ['Лосиный', 'Лосиная', 'Лосиное'], ['Ясный', 'Ясная', 'Ясное']],
  noun: [['Лог', 0], ['Ключ', 0], ['Яр', 0], ['Бор', 0], ['Ручей', 0], ['Распадок', 0], ['Камень', 0], ['Сопка', 1], ['Падь', 1], ['Грива', 1], ['Озеро', 2], ['Поле', 2], ['Плёсо', 2]],
  whole: ['Листвянка', 'Песчаное', 'Березовка', 'Сосновка', 'Таёжный', 'Кедровка', 'Слюдянка', 'Ольховка', 'Каменка', 'Ключевой', 'Североморск', 'Лесогорск', 'Звёздный', 'Горняцкий', 'Подгорное', 'Хребтовая', 'Лиственничный', 'Еловка', 'Мостовой', 'Заречье'],
  rivers: ['Илга', 'Онота', 'Бирюса', 'Чуна', 'Ия', 'Тыя', 'Мама', 'Витим', 'Олёкма', 'Нюя', 'Илим', 'Тасеева'],
  roots: ['Кедр', 'Берёз', 'Сосн', 'Ольх', 'Камен', 'Лесн', 'Глин', 'Песч', 'Луг', 'Мох', 'Рябин', 'Черёмух', 'Медвед', 'Бобр', 'Лис', 'Сов', 'Гор', 'Студен', 'Ельн', 'Брусн', 'Талов', 'Ягодн', 'Окунь', 'Хариус', 'Тайм', 'Соболь', 'Снеж', 'Морозн'],
  suf: ['овка', 'ово', 'инск', 'ая', 'ое', 'иха', 'анка', 'ец', 'ики', 'овск', 'янка'],
  native: ['Тукчи', 'Амджир', 'Эвонкит', 'Кунерма', 'Улькан', 'Ирбо', 'Чара', 'Таксимо', 'Ангаракан', 'Икабья', 'Сюльбан', 'Эльген', 'Делюн', 'Ханда'],
};
function nameWorld(W, r) {
  const used = new Set(['Кедровый Лог', 'Усть-Кута', 'Угольный', 'Шахтёрский']);
  const pick = (gen) => { for (let i = 0; i < 40; i++) { const s = gen(); if (!used.has(s)) { used.add(s); return s; } } return null; };
  let post = 1;
  for (const n of W.nodes) {
    const h = W.height(n.x, n.y);
    const north = n.y < WORLD_H * 0.3;
    let name = null;
    if (n.type === 'разъезд') { n.name = 'Разъезд'; continue; }
    if ((h > 700 || north) && r() < 0.55) name = pick(() => r.pick(NM.native));
    if (!name && r() < 0.25) name = pick(() => {
      const rv = r.pick(NM.rivers);
      const f = r();
      return f < 0.4 ? 'Усть-' + rv : f < 0.7 ? 'Верхняя ' + rv : 'Нижняя ' + rv;
    });
    if (!name && r() < 0.5) name = pick(() => { const [nn, g] = r.pick(NM.noun); return r.pick(NM.adj)[g] + ' ' + nn; });
    if (!name && r() < 0.4) name = pick(() => r.pick(NM.whole));
    if (!name) name = pick(() => r.pick(NM.roots) + r.pick(NM.suf));
    if (!name) name = (n.type === 'заброшенная' ? 'Блокпост ' : 'Полустанок ') + post++;
    n.name = name;
  }
}

Object.assign(globalThis, {
  WORLD_W, WORLD_H, KM0, genWorld, pointOnEdge, otherEnd, edgeBetween, shortest, edgesOfPath, distancesAlong,
  gradeOn, trackDist, riverDist, fbm, hash2, vnoise,
});
