// «Уголь» — генераторы: случайные числа, имена, пассажиры, портреты.
'use strict';

function rng(seed) {
  let s = seed >>> 0 || 1;
  const f = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.int = (a, b) => a + Math.floor(f() * (b - a + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  return f;
}

const NAMES = {
  M: {
    old: ['Геннадий', 'Валерий', 'Виктор', 'Анатолий', 'Борис', 'Василий', 'Николай', 'Юрий', 'Владимир'],
    mid: ['Сергей', 'Андрей', 'Алексей', 'Дмитрий', 'Игорь', 'Олег', 'Роман', 'Евгений', 'Павел', 'Михаил'],
    young: ['Матвей', 'Артём', 'Кирилл', 'Никита', 'Егор', 'Илья', 'Даниил', 'Максим', 'Тимофей'],
  },
  F: {
    old: ['Валентина', 'Галина', 'Людмила', 'Тамара', 'Нина', 'Зинаида', 'Раиса', 'Антонина'],
    mid: ['Елена', 'Ольга', 'Наталья', 'Ирина', 'Татьяна', 'Светлана', 'Марина', 'Юлия'],
    young: ['София', 'Алиса', 'Полина', 'Дарья', 'Анастасия', 'Вероника', 'Ксения', 'Варвара'],
  },
  fathers: ['Иван', 'Пётр', 'Сергей', 'Николай', 'Василий', 'Александр', 'Михаил', 'Андрей', 'Юрий', 'Виктор', 'Геннадий', 'Алексей', 'Дмитрий', 'Евгений', 'Аркадий'],
  // [м, ж]
  surnames: [
    ['Иванов', 'Иванова'], ['Кузнецов', 'Кузнецова'], ['Морозов', 'Морозова'], ['Лебедев', 'Лебедева'],
    ['Соколов', 'Соколова'], ['Попов', 'Попова'], ['Кедров', 'Кедрова'], ['Зайцев', 'Зайцева'],
    ['Белых', 'Белых'], ['Седых', 'Седых'], ['Тарасов', 'Тарасова'], ['Голубев', 'Голубева'],
    ['Никитин', 'Никитина'], ['Сорокин', 'Сорокина'], ['Ильин', 'Ильина'], ['Борисов', 'Борисова'],
    ['Гончаренко', 'Гончаренко'], ['Шевчук', 'Шевчук'], ['Ковальский', 'Ковальская'], ['Верхоланцев', 'Верхоланцева'],
    ['Тюрин', 'Тюрина'], ['Окунев', 'Окунева'], ['Рыбаков', 'Рыбакова'], ['Шестаков', 'Шестакова'],
    ['Хабибуллин', 'Хабибуллина'], ['Цыренов', 'Цыренова'], ['Номоконов', 'Номоконова'], ['Аюшеев', 'Аюшеева'],
  ],
};

function patronymic(father, sex) {
  const irregular = { 'Пётр': ['Петрович', 'Петровна'], 'Илья': ['Ильич', 'Ильинична'], 'Никита': ['Никитич', 'Никитична'] };
  if (irregular[father]) return irregular[father][sex === 'М' ? 0 : 1];
  let base = father;
  if (base.endsWith('ий')) return base.slice(0, -2) + (sex === 'М' ? 'ьевич' : 'ьевна');
  if (base.endsWith('ей') || base.endsWith('ай')) return base.slice(0, -1) + (sex === 'М' ? 'евич' : 'евна');
  return base + (sex === 'М' ? 'ович' : 'овна');
}

const PLACES = ['Иркутск', 'Чита', 'Братск', 'Усть-Кут', 'Тайшет', 'Улан-Удэ', 'Северобайкальск', 'Бодайбо', 'Нерюнгри', 'Тында', 'Ангарск', 'Красноярск', 'Новосибирск', 'Слюдянка', 'Киренск'];
const JOBS = {
  young: ['Студент', 'Студентка', 'Курсант', 'Продавец', 'Официант', 'Монтажник'],
  mid: ['Вахтовик, буровик', 'Вахтовик, сварщик', 'Водитель лесовоза', 'Фельдшер', 'Учитель', 'Инженер', 'Бухгалтер', 'Охотовед', 'Механик', 'Повар', 'Электрик', 'Продавец'],
  old: ['Пенсионер', 'Пенсионерка', 'Сторож', 'Бывший шахтёр'],
};
const PURPOSES = [
  'К дочери на день рождения', 'Домой с вахты', 'На вахту', 'В больницу на обследование', 'К внукам', 'В командировку',
  'На похороны дяди', 'Домой после сессии', 'К жене', 'Устраиваться на работу', 'В гости к брату', 'На свадьбу друга',
];
const TRAITS = ['болтливый', 'наблюдательный', 'пьяный', 'подозрительный', 'молчун'];
const MARKS = ['родинка на щеке', 'очки', 'седая борода', 'кашляет', 'хромает', 'татуировка на кисти', 'громкий смех', 'вязаный шарф', 'зелёный пуховик', 'серая шапка', 'красный платок', 'синий пуховик'];

function ageGroup(age) { return age >= 55 ? 'old' : age >= 28 ? 'mid' : 'young'; }

function randomPerson(r, id, car, seat) {
  const sex = r.chance(0.5) ? 'М' : 'Ж';
  const age = r.chance(0.12) ? r.int(62, 84) : r.int(19, 58);
  const g = ageGroup(age);
  const first = r.pick(NAMES[sex === 'М' ? 'M' : 'F'][g]);
  const sur = r.pick(NAMES.surnames)[sex === 'М' ? 0 : 1];
  const patr = patronymic(r.pick(NAMES.fathers), sex);
  const year = 2026 - age;
  const birth = `${String(r.int(1, 28)).padStart(2, '0')}.${String(r.int(1, 12)).padStart(2, '0')}.${year - (r.chance(0.6) ? 1 : 0)}`;
  let job = r.pick(JOBS[g]);
  if (sex === 'М') job = job.replace('Студентка', 'Студент').replace('Пенсионерка', 'Пенсионер');
  else job = job.replace(/^Студент$/, 'Студентка').replace(/^Пенсионер$/, 'Пенсионерка').replace('Бывший шахтёр', 'Пенсионерка');
  const bagsN = r.int(1, 2);
  const kg = r.int(6, 24) * bagsN;
  const traits = [r.pick(TRAITS)];
  return {
    id, sex, first, patr, last: sur, age, birth, birthplace: r.pick(PLACES), job,
    car, seat, from: 'Кедровый Лог', to: 'Усть-Кута', bags: `${bagsN} ${bagsN === 1 ? 'место' : 'места'}, ${kg} кг`,
    purpose: r.pick(PURPOSES), marks: [r.pick(MARKS)], traits,
    look: randomLook(r, sex, age),
    health: 100, mood: r.int(55, 80), alive: true, detained: false, gone: false, role: null, lies: 0, broken: false,
  };
}

const SKIN = ['#e9b48f', '#d9a07a', '#c98d68', '#b97a58', '#f0c3a0'];
const HAIR = ['#2a1d16', '#4a3020', '#7a5232', '#a07040', '#1c1c22', '#c9a26a'];
const COATS = ['#3b4a6b', '#4d3a2e', '#2f3b33', '#5a4632', '#3a3346', '#2b3d55', '#6b4a2a'];
const HATS = ['#5a6680', '#7a4632', '#394a63', '#6d6d78', '#8a3a3a', '#3a5a4a'];

function randomLook(r, sex, age) {
  const grey = age > 50 && r.chance(0.7);
  return {
    face: r.int(0, 5),
    skin: r.pick(SKIN),
    hair: grey ? (age > 65 ? '#d8d8dc' : '#9a9aa2') : r.pick(HAIR),
    hairStyle: sex === 'М' ? r.pick(['short', 'short', 'bald', 'crop']) : r.pick(['long', 'bun', 'bob', 'long']),
    beard: sex === 'М' && age > 25 && r.chance(0.35) ? r.pick(['full', 'stubble', 'goatee']) : null,
    mustache: sex === 'М' && age > 25 && r.chance(0.3),
    glasses: r.chance(age > 50 ? 0.45 : 0.18),
    hat: r.chance(0.55) ? (sex === 'Ж' && age > 55 ? 'kerchief' : r.pick(['ushanka', 'knit', 'ushanka'])) : null,
    hatColor: r.pick(HATS),
    coat: r.pick(COATS),
    scarf: r.chance(0.35) ? r.pick(['#8a3a3a', '#d9a441', '#4a6a8a', '#6a4a7a']) : null,
    brows: r.int(0, 2),
    wrinkles: age > 45 ? Math.min(3, Math.floor((age - 40) / 12)) : 0,
    mole: r.chance(0.15),
  };
}

// --------- портрет SVG ---------
let PORTRAIT_UID = 0;
function portraitSVG(p, opts = {}) {
  const L = p.look;
  const uid = 'pt' + (PORTRAIT_UID++);
  const cold = opts.cold || 0; // 0..1
  const angry = (p.mood ?? 70) < 30;
  const faces = [
    [26, 31], [24, 32], [27, 30], [25, 33], [28, 31], [24, 30],
  ];
  const [rx, ry] = faces[L.face % faces.length];
  const cx = 60, cy = 62;
  let s = `<svg viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg" class="portrait">`;
  s += `<defs>
    <radialGradient id="${uid}bg" cx="50%" cy="100%" r="90%"><stop offset="0" stop-color="#3a2a1a"/><stop offset=".55" stop-color="#1a2440"/><stop offset="1" stop-color="#121a30"/></radialGradient>
    <linearGradient id="${uid}lamp" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffb347" stop-opacity=".45"/><stop offset=".6" stop-color="#ffb347" stop-opacity="0"/></linearGradient>
  </defs>`;
  s += `<rect width="120" height="140" fill="url(#${uid}bg)"/>`;
  // плечи / одежда
  s += `<path d="M10 140 C14 108 34 98 60 98 C86 98 106 108 110 140 Z" fill="${L.coat}"/>`;
  s += `<path d="M60 98 L52 140 M60 98 L68 140" stroke="#00000033" stroke-width="2"/>`;
  // шея
  s += `<rect x="51" y="84" width="18" height="18" rx="6" fill="${L.skin}"/>`;
  if (L.scarf) s += `<path d="M38 100 Q60 112 82 100 L80 92 Q60 102 40 92 Z" fill="${L.scarf}"/>`;
  // волосы сзади
  if (!L.hat && (L.hairStyle === 'long' || L.hairStyle === 'bob')) {
    const len = L.hairStyle === 'long' ? 100 : 82;
    s += `<path d="M${cx - rx - 5} ${cy - 6} Q${cx - rx - 8} ${len} ${cx - rx + 4} ${len} L${cx + rx - 4} ${len} Q${cx + rx + 8} ${len} ${cx + rx + 5} ${cy - 6} Q${cx} ${cy - ry - 12} ${cx - rx - 5} ${cy - 6}Z" fill="${L.hair}"/>`;
  }
  // уши
  s += `<ellipse cx="${cx - rx}" cy="${cy + 2}" rx="4" ry="6" fill="${L.skin}"/><ellipse cx="${cx + rx}" cy="${cy + 2}" rx="4" ry="6" fill="${L.skin}"/>`;
  // лицо
  s += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${L.skin}"/>`;
  // морщины
  for (let i = 0; i < L.wrinkles; i++) s += `<path d="M${cx - 10} ${cy - 18 - i * 3} q10 -2 20 0" stroke="#00000030" fill="none" stroke-width="1"/>`;
  if (L.wrinkles > 1) s += `<path d="M${cx - 14} ${cy + 10} q-2 6 2 10 M${cx + 14} ${cy + 10} q2 6 -2 10" stroke="#00000030" fill="none"/>`;
  // волосы спереди
  if (!L.hat) {
    if (L.hairStyle === 'short' || L.hairStyle === 'crop') {
      const h = L.hairStyle === 'crop' ? 6 : 10;
      s += `<path d="M${cx - rx - 1} ${cy - 4} Q${cx - rx} ${cy - ry - h} ${cx} ${cy - ry - h + 2} Q${cx + rx} ${cy - ry - h} ${cx + rx + 1} ${cy - 4} Q${cx + 10} ${cy - ry + 6} ${cx - rx - 1} ${cy - 4}Z" fill="${L.hair}"/>`;
    } else if (L.hairStyle === 'bald') {
      s += `<path d="M${cx - rx} ${cy - 2} Q${cx - rx - 2} ${cy - 14} ${cx - rx + 6} ${cy - 18} L${cx - rx + 4} ${cy}Z M${cx + rx} ${cy - 2} Q${cx + rx + 2} ${cy - 14} ${cx + rx - 6} ${cy - 18} L${cx + rx - 4} ${cy}Z" fill="${L.hair}"/>`;
    } else {
      s += `<path d="M${cx - rx - 3} ${cy + 2} Q${cx - rx - 2} ${cy - ry - 10} ${cx + 4} ${cy - ry - 6} Q${cx + rx + 4} ${cy - ry - 4} ${cx + rx + 3} ${cy + 2} Q${cx + rx - 6} ${cy - ry + 10} ${cx - 2} ${cy - ry + 8} Q${cx - rx + 4} ${cy - ry + 12} ${cx - rx - 3} ${cy + 2}Z" fill="${L.hair}"/>`;
      if (L.hairStyle === 'bun') s += `<circle cx="${cx}" cy="${cy - ry - 10}" r="9" fill="${L.hair}"/>`;
    }
  }
  // брови
  const by = cy - 9;
  const tilt = angry ? 3 : [0, 1, -1][L.brows];
  s += `<path d="M${cx - 16} ${by - tilt} L${cx - 5} ${by + (angry ? 2 : 0)}" stroke="${L.hair === '#d8d8dc' ? '#8a8a90' : L.hair}" stroke-width="3" stroke-linecap="round"/>`;
  s += `<path d="M${cx + 16} ${by - tilt} L${cx + 5} ${by + (angry ? 2 : 0)}" stroke="${L.hair === '#d8d8dc' ? '#8a8a90' : L.hair}" stroke-width="3" stroke-linecap="round"/>`;
  // глаза
  s += `<circle cx="${cx - 10}" cy="${cy - 2}" r="2.6" fill="#1a1a22"/><circle cx="${cx + 10}" cy="${cy - 2}" r="2.6" fill="#1a1a22"/>`;
  if (L.glasses) s += `<g fill="none" stroke="#2a2a34" stroke-width="1.8"><rect x="${cx - 17}" y="${cy - 8}" width="13" height="11" rx="3"/><rect x="${cx + 4}" y="${cy - 8}" width="13" height="11" rx="3"/><path d="M${cx - 4} ${cy - 3} h8"/></g>`;
  // нос
  s += `<path d="M${cx} ${cy - 2} Q${cx - 4} ${cy + 9} ${cx + 2} ${cy + 10}" stroke="#00000040" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  // рот
  const my = cy + 18;
  s += angry
    ? `<path d="M${cx - 7} ${my + 2} Q${cx} ${my - 3} ${cx + 7} ${my + 2}" stroke="#6a3030" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
    : `<path d="M${cx - 7} ${my} Q${cx} ${my + 3} ${cx + 7} ${my}" stroke="#6a3030" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  // борода/усы
  if (L.beard === 'full') s += `<path d="M${cx - rx + 2} ${cy + 4} Q${cx - rx + 4} ${cy + ry + 8} ${cx} ${cy + ry + 8} Q${cx + rx - 4} ${cy + ry + 8} ${cx + rx - 2} ${cy + 4} Q${cx + 12} ${cy + 16} ${cx} ${cy + 14} Q${cx - 12} ${cy + 16} ${cx - rx + 2} ${cy + 4}Z" fill="${L.hair}"/>`;
  if (L.beard === 'goatee') s += `<path d="M${cx - 6} ${my + 4} Q${cx} ${my + 14} ${cx + 6} ${my + 4}Z" fill="${L.hair}"/>`;
  if (L.beard === 'stubble') s += `<ellipse cx="${cx}" cy="${cy + 18}" rx="${rx - 6}" ry="10" fill="#00000022"/>`;
  if (L.mustache || L.beard === 'full') s += `<path d="M${cx - 9} ${my - 3} Q${cx} ${my - 8} ${cx + 9} ${my - 3} Q${cx} ${my - 4} ${cx - 9} ${my - 3}Z" fill="${L.hair}" stroke="${L.hair}" stroke-width="2"/>`;
  if (L.mole) s += `<circle cx="${cx + 13}" cy="${cy + 8}" r="1.6" fill="#5a3a2a"/>`;
  if (p.scar) s += `<path d="M${cx - 18} ${cy + 2} l8 8" stroke="#a05a50" stroke-width="2"/>`;
  // шапки
  if (L.hat === 'ushanka') {
    s += `<path d="M${cx - rx - 8} ${cy + 14} L${cx - rx - 8} ${cy - 10} Q${cx - rx - 6} ${cy - ry - 16} ${cx} ${cy - ry - 18} Q${cx + rx + 6} ${cy - ry - 16} ${cx + rx + 8} ${cy - 10} L${cx + rx + 8} ${cy + 14} L${cx + rx - 1} ${cy + 14} L${cx + rx - 1} ${cy - 8} Q${cx} ${cy - ry + 2} ${cx - rx + 1} ${cy - 8} L${cx - rx + 1} ${cy + 14}Z" fill="${L.hatColor}"/>`;
    s += `<path d="M${cx - rx + 2} ${cy - ry - 4} Q${cx} ${cy - ry - 12} ${cx + rx - 2} ${cy - ry - 4}" stroke="#00000033" stroke-width="2" fill="none"/>`;
  } else if (L.hat === 'knit') {
    s += `<path d="M${cx - rx - 3} ${cy - 8} Q${cx - rx} ${cy - ry - 20} ${cx} ${cy - ry - 20} Q${cx + rx} ${cy - ry - 20} ${cx + rx + 3} ${cy - 8}Z" fill="${L.hatColor}"/>`;
    s += `<rect x="${cx - rx - 4}" y="${cy - 14}" width="${rx * 2 + 8}" height="8" rx="3" fill="${L.hatColor}" stroke="#00000033"/>`;
    s += `<circle cx="${cx}" cy="${cy - ry - 22}" r="5" fill="${L.hatColor}"/>`;
  } else if (L.hat === 'kerchief') {
    s += `<path d="M${cx - rx - 6} ${cy + 18} Q${cx - rx - 8} ${cy - ry - 14} ${cx} ${cy - ry - 14} Q${cx + rx + 8} ${cy - ry - 14} ${cx + rx + 6} ${cy + 18} L${cx + rx - 2} ${cy + 6} Q${cx + rx - 2} ${cy - ry + 2} ${cx} ${cy - ry + 2} Q${cx - rx + 2} ${cy - ry + 2} ${cx - rx + 2} ${cy + 6}Z" fill="${L.hatColor}"/>`;
    s += `<path d="M${cx - 8} ${cy + ry + 2} l8 8 l8 -8" fill="${L.hatColor}"/>`;
  }
  // подсветка лампой снизу
  s += `<rect width="120" height="140" fill="url(#${uid}lamp)"/>`;
  if (cold > 0) s += `<rect width="120" height="140" fill="#5a8ad8" opacity="${(0.45 * cold).toFixed(2)}" style="mix-blend-mode:color"/>`;
  if (!p.alive) s += `<rect width="120" height="140" fill="#000" opacity=".55"/>`;
  s += `</svg>`;
  return s;
}

Object.assign(globalThis, { rng, randomPerson, randomLook, portraitSVG, patronymic, TRAITS, PURPOSES });
