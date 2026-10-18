// «Уголь» — дело «Уголь из вагона 9» (написано вручную, как в плане разработки).
'use strict';

const KEY_PEOPLE = [
  {
    id: 'sedov', sex: 'М', first: 'Григорий', patr: 'Павлович', last: 'Седов', age: 47, birth: '12.03.1979', birthplace: 'Усть-Кут',
    job: 'Вахтовик, буровик', car: 7, seat: 23, bags: '2 места, 38 кг', purpose: 'Домой с вахты',
    marks: ['рыжая ушанка', 'шрам на левой руке', 'курит'], traits: ['молчун'], role: 'thief',
    look: { face: 3, skin: '#d9a07a', hair: '#4a3020', hairStyle: 'short', beard: 'stubble', mustache: false, glasses: false, hat: 'ushanka', hatColor: '#c0622a', coat: '#3b4a6b', scarf: null, brows: 1, wrinkles: 1, mole: false },
  },
  {
    id: 'laptev', sex: 'Ж', first: 'Ирина', patr: 'Сергеевна', last: 'Лаптева', age: 39, birth: '05.11.1987', birthplace: 'Иркутск',
    job: 'Товаровед', car: 7, seat: 21, bags: '1 место, 12 кг', purpose: 'К сестре на свадьбу',
    marks: ['красный маникюр', 'громко смеётся'], traits: ['болтливый'], role: 'alibi',
    look: { face: 1, skin: '#f0c3a0', hair: '#7a5232', hairStyle: 'bob', beard: null, mustache: false, glasses: false, hat: null, hatColor: '#8a3a3a', coat: '#5a4632', scarf: '#8a3a3a', brows: 2, wrinkles: 0, mole: true },
  },
  {
    id: 'shubin', sex: 'М', first: 'Олег', patr: 'Викторович', last: 'Шубин', age: 52, birth: '30.07.1974', birthplace: 'Бодайбо',
    job: 'Снабженец', car: 8, seat: 5, bags: '3 места, 64 кг', purpose: 'К брату в гости, на неделю',
    marks: ['серый свитер', 'усы', 'очки'], traits: ['подозрительный'], role: 'courier',
    look: { face: 4, skin: '#c98d68', hair: '#9a9aa2', hairStyle: 'crop', beard: null, mustache: true, glasses: true, hat: null, hatColor: '#5a6680', coat: '#6d6d78', scarf: null, brows: 0, wrinkles: 2, mole: false },
  },
  {
    id: 'kravets', sex: 'Ж', first: 'Анна', patr: 'Ильинична', last: 'Кравец', age: 78, birth: '02.02.1948', birthplace: 'Киренск',
    job: 'Пенсионерка, бывшая учительница', car: 9, seat: 33, bags: '1 место, 9 кг', purpose: 'К внукам',
    marks: ['бессонница', 'очки на цепочке'], traits: ['наблюдательный'], role: null,
    look: { face: 5, skin: '#e9b48f', hair: '#d8d8dc', hairStyle: 'bun', beard: null, mustache: false, glasses: true, hat: 'kerchief', hatColor: '#4a6a8a', coat: '#3a3346', scarf: null, brows: 0, wrinkles: 3, mole: false },
  },
  {
    id: 'ershov', sex: 'М', first: 'Денис', patr: 'Андреевич', last: 'Ершов', age: 20, birth: '17.09.2005', birthplace: 'Братск',
    job: 'Студент горного института', car: 9, seat: 35, bags: '1 место, 14 кг', purpose: 'Домой после сессии',
    marks: ['наушники', 'синий пуховик'], traits: ['молчун'], role: null,
    look: { face: 0, skin: '#f0c3a0', hair: '#2a1d16', hairStyle: 'short', beard: null, mustache: false, glasses: false, hat: 'knit', hatColor: '#394a63', coat: '#2b3d55', scarf: null, brows: 2, wrinkles: 0, mole: false },
  },
  {
    id: 'matveev', sex: 'М', first: 'Пётр', patr: 'Сергеевич', last: 'Матвеев', age: 34, birth: '21.01.1992', birthplace: 'Тайшет',
    job: 'Вахтовик, сварщик', car: 9, seat: 36, bags: '2 места, 30 кг', purpose: 'Домой с вахты',
    marks: ['перегар', 'татуировка на кисти'], traits: ['пьяный'], role: null,
    look: { face: 2, skin: '#d9a07a', hair: '#a07040', hairStyle: 'crop', beard: 'full', mustache: true, glasses: false, hat: null, hatColor: '#6d6d78', coat: '#2f3b33', scarf: null, brows: 1, wrinkles: 0, mole: false },
  },
  {
    id: 'belova', sex: 'Ж', first: 'Софья', patr: 'Игоревна', last: 'Белова', age: 19, birth: '08.04.2007', birthplace: 'Ангарск',
    job: 'Студентка педагогического', car: 8, seat: 12, bags: '1 место, 11 кг', purpose: 'Домой на каникулы',
    marks: ['белая шапка с помпоном'], traits: ['наблюдательный'], role: null,
    look: { face: 1, skin: '#f0c3a0', hair: '#c9a26a', hairStyle: 'long', beard: null, mustache: false, glasses: false, hat: 'knit', hatColor: '#d8d8dc', coat: '#3a5a4a', scarf: '#d9a441', brows: 2, wrinkles: 0, mole: false },
  },
];

const JOURNAL_SRC = 'ЖУРНАЛ ПРОВОДНИКА';
const REC = {
  j2130: { kind: 'journal', t: T(21, 30), text: '21:30 — в в. 9 растопила котёл, ящик полный.' },
  j2330: { kind: 'journal', t: T(23, 30), text: '23:30 — в тамбуре в. 8 долго курили Седов (в. 7, м. 23) и мужчина в сером свитере, с усами.' },
  j0100: { kind: 'journal', t: T(1, 0), text: '01:00 — метель. Тамбурные двери на ночь прикрыла, на замок не запирала.' },
  j0210: { kind: 'journal', t: T(2, 10), text: '02:10 — носила чай в купе 4, в. 7.' },
  j0305: { kind: 'journal', t: T(3, 5), text: '03:05 — обход: в купе Лаптевой (в. 7) свет не горит, тихо.' },
  j0530: { kind: 'journal', t: T(5, 30), text: '05:30 — Лаптева спрашивала, во сколько будем у {MEET}-го километра.' },

  p_soot: { kind: 'physical', text: 'Седов: сажа на рукаве и под ногтями.', against: ['sedov'] },
  p_boots: { kind: 'physical', text: 'Седов: валенки мокрые, в снегу.', against: ['sedov'] },
  p_bags: { kind: 'physical', text: 'Багаж Седова: три пустых мешка, пахнут углём.', against: ['sedov'] },
  p_map: { kind: 'physical', text: 'Багаж Лаптевой: карта участка, карандашом: «КМ {MEET} — сани».', against: ['laptev'], meet: true },
  p_sable: { kind: 'physical', text: 'Багаж Шубина: 40 соболиных шкурок без бирок. Контрабанда.', against: ['shubin'], contraband: true },
  p_car9: { kind: 'physical', text: 'Вагон 9: у котла рассыпан уголь, мокрые следы валенок ведут в тамбур.' },
  p_car7: { kind: 'physical', text: 'Вагон 7: под нижней полкой места 23 — угольная пыль.', against: ['sedov'] },
  p_ershov: { kind: 'physical', text: 'Ершов: руки чистые, сажи нет.' },

  c_sedov: { kind: 'confession', text: 'Седов: «Ладно. Уголь брал я. Мешками — в тамбур и в снег. Велели, чтоб поезд встал где надо. Ирина Сергеевна знает, кто велел».', against: ['sedov', 'laptev'] },
  c_laptev: { kind: 'confession', text: 'Лаптева: «Я только сказала, что он был у меня! Меня попросили. Это груз Олега Викторовича из восьмого, он тут главный».', against: ['laptev', 'shubin'] },
  c_shubin: { kind: 'confession', text: 'Шубин: «Шкурки мои. Сани ждут у Угольного. Больше ничего не скажу».', against: ['shubin'] },
  c_ershov: { kind: 'testimony', who: 'ershov', text: 'Ершов (признался): «Ходил в восьмой, к Соне. Шёл обратно в начале четвёртого — в тамбуре девятого мужик в рыжей ушанке завязывал мешок. Руки чёрные. Я спрятался».' },
  c_belova: { kind: 'testimony', who: 'belova', text: 'Белова: «Да, Денис был у меня, ушёл в начале четвёртого. Только маме не говорите».' },
  sedov_where2: { kind: 'testimony', who: 'sedov', text: 'Седов (новая версия): «Свет выключили, чтоб соседям не мешать. С фонариком играли».' },
  laptev_where2: { kind: 'testimony', who: 'laptev', text: 'Лаптева (новая версия): «Глаза устали, свет выключили. Сидели, разговаривали».' },
};

// Противоречия: пара записей → против кого
const CONTRAS = [
  { a: 'sedov_where', b: 'j0305', against: 'sedov' },
  { a: 'laptev_where', b: 'j0305', against: 'laptev' },
  { a: 'sedov_where', b: 'kravets_saw', against: 'sedov' },
  { a: 'sedov_where', b: 'c_ershov', against: 'sedov' },
  { a: 'sedov_know_shubin', b: 'j2330', against: 'sedov' },
  { a: 'shubin_know_sedov', b: 'j2330', against: 'shubin' },
  { a: 'laptev_purpose', b: 'j0530', against: 'laptev' },
  { a: 'laptev_purpose', b: 'p_map', against: 'laptev' },
  { a: 'ershov_where', b: 'matveev_saw', against: 'ershov' },
  { a: 'belova_where', b: 'c_ershov', against: 'belova' },
];

// Ответы ключевых персонажей. Значение — строка, [{after, text, rec}] или {text, rec}.
const AFTER3 = T(3, 5);
const DIALOG = {
  sedov: {
    about: 'Буровик. Месяц на вахте. Домой еду.',
    purpose: { text: 'Домой. С вахты.', rec: 'sedov_purpose' },
    where: { text: 'В карты играли. С Ириной Сергеевной, у неё. До четырёх. Потом спал.', rec: 'sedov_where' },
    saw: 'Никого. Карты, говорю же.',
    heard: 'Ничего.',
    know: {
      laptev: 'Соседка. В карты играем.',
      shubin: { text: 'Не знаю такого.', rec: 'sedov_know_shubin' },
    },
    present: {
      j0305: { lie: true, rec: 'sedov_where2', text: 'Ну… свет выключили. Чтоб соседям не мешать. С фонариком играли.' },
      kravets_saw: { lie: true, text: 'Мало ли в поезде рыжих шапок.' },
      c_ershov: { lie: true, text: 'Пацан врёт. Сам небось и таскал.' },
      p_soot: { lie: true, text: 'Курил в тамбуре — вот и сажа. Отстаньте.' },
      p_boots: { lie: true, text: 'Снег в тамбуре намело. Что мне, разуваться?' },
      p_bags: { lie: true, text: 'Мешки под картошку. Домой везу.' },
      p_car7: { lie: true, text: 'Пыль везде, поезд-то угольный.' },
      j2330: { lie: true, needs: 'sedov_know_shubin', text: 'Ну курили. Мужик и мужик. Имени не спрашивал.', alt: 'Курили, да. Это не запрещено.' },
      c_laptev: { breaks: true },
    },
    broken: 'c_sedov',
  },
  laptev: {
    about: 'Товаровед я, в Иркутске. Работа нервная, а тут — отдых! Чаёк, колёса стучат…',
    purpose: { text: 'К сестре на свадьбу! В Усть-Куту, в субботу. Платье везу — закачаетесь.', rec: 'laptev_purpose' },
    where: { text: 'Мы с Григорием Павловичем в карты играли, у меня. До четырёх! В дурака. Он проигрывал, кстати.', rec: 'laptev_where' },
    saw: 'Только Григория. Ну и проводница ходила, чай носила.',
    heard: 'Да тихо было. Колёса стучат, и всё.',
    know: {
      sedov: 'Хороший мужчина, вежливый. В карты играли.',
      shubin: 'Первый раз слышу. А кто это?',
    },
    present: {
      j0305: { lie: true, rec: 'laptev_where2', text: 'Свет?.. Ну… глаза устали, выключили. Сидели, разговаривали.' },
      j0530: { lie: true, text: 'Просто спросила! Сестра там встречать будет… рядом.' },
      p_map: { lie: true, text: 'Это не моё! Подкинули! Я карты вообще не понимаю.' },
      c_sedov: { breaks: true },
      kravets_saw: { text: 'Рыжая шапка? Я-то тут при чём?' },
    },
    broken: 'c_laptev',
  },
  shubin: {
    about: 'Снабженец. Был. Сейчас так, по делам.',
    purpose: { text: 'К брату. На недельку.', rec: 'shubin_purpose' },
    where: 'Спал. Как убитый.',
    saw: { text: 'Студентик этот шастал ночью, из девятого. Вот его и трясите.', rec: 'shubin_saw' },
    heard: 'Ничего.',
    know: {
      sedov: { text: 'Не знаю никакого Седова.', rec: 'shubin_know_sedov' },
      laptev: 'Нет.',
    },
    present: {
      j2330: { lie: true, needs: 'shubin_know_sedov', text: 'Ну курили. Мужик и мужик, имени не спрашивал.', alt: 'Курили. Это теперь преступление?' },
      c_laptev: { lie: true, text: 'Баба врёт со страху. Какой ещё груз?' },
      c_sedov: { lie: true, text: 'Я его не знаю. Пусть что хочет говорит.' },
      p_sable: { breaks: true },
      p_map: { text: 'Карта как карта. Я тут при чём?' },
    },
    broken: 'c_shubin',
  },
  kravets: {
    about: 'Учительницей сорок лет. А теперь бессонница, милок. Лежу, слушаю поезд.',
    purpose: 'К внукам, в Усть-Куту. Пирожки везу.',
    where: 'Не спала. Лежала, слушала. Я у самого котла сплю.',
    saw: [{ after: 0, text: 'Пока никого, всё тихо.' }, { after: AFTER3, text: 'Около трёх к котлу прошёл мужчина в рыжей шапке. Потом хлопнула дверь тамбура, и холодом потянуло.', rec: 'kravets_saw' }],
    heard: [{ after: 0, text: 'Колёса да ветер.' }, { after: AFTER3, text: 'Скрежет — как совком по углю. Минут десять.', rec: 'kravets_heard' }],
    know: {},
    present: {},
  },
  ershov: {
    about: 'Студент, горный. Домой после сессии.',
    purpose: 'Домой. Сессию сдал.',
    where: { text: 'Спал. Всю ночь.', rec: 'ershov_where' },
    saw: 'Никого.',
    heard: 'Ничего, я в наушниках.',
    know: { belova: 'Ну… видел. Из восьмого.' },
    present: {
      matveev_saw: { breaks: true },
      c_belova: { breaks: true },
      shubin_saw: { text: 'Шастал? Кто это сказал? Я… спал.' },
    },
    broken: 'c_ershov',
    secret: true,
  },
  matveev: {
    about: 'Сварщик я. Вахта кончилась — отмечаем, ик.',
    purpose: 'Домой! К жене. Если пустит.',
    where: 'Спал… ну, выпили. Проснулся около трёх — по нужде.',
    saw: [{ after: 0, text: 'Да никого. Темно.' }, { after: AFTER3, text: 'Студент, сосед мой, — полка пустая была. Около трёх. Куда шлялся — не знаю.', rec: 'matveev_saw' }],
    heard: [{ after: 0, text: 'Храп свой, ха.' }, { after: AFTER3, text: 'Дверь тамбурная хлопала. Холодом тянуло.', rec: 'matveev_heard' }],
    know: { ershov: 'Сосед, студент. Тихий.' },
    present: {},
  },
  belova: {
    about: 'Студентка, педагогический. На каникулы домой.',
    purpose: 'Домой на каникулы.',
    where: { text: 'Спала. Всю ночь.', rec: 'belova_where' },
    saw: 'Никого.',
    heard: 'Ничего.',
    know: { ershov: 'Ну… знакомы. Немного.' },
    present: {
      c_ershov: { breaks: true },
    },
    broken: 'c_belova',
    secret: true,
  },
};

const MORNING = T(6, 0);
const WARN = T(1, 30);

function buildCase(S) {
  const r = rng(S.seed);
  // ключевые люди
  for (const k of KEY_PEOPLE) {
    S.people.push({ ...k, look: { ...k.look }, health: 100, mood: 66, alive: true, detained: false, gone: false, lies: 0, broken: false, key: true, from: 'Кедровый Лог', to: 'Усть-Кута', scar: false });
  }
  // остальные пассажиры
  const used = new Set(S.people.map((p) => p.car + ':' + p.seat));
  const perCar = [3, 4, 3, 4, 4, 3, 2, 2, 2, 4];
  let n = 0;
  for (let c = 1; c <= CAR_COUNT; c++) {
    for (let i = 0; i < perCar[c - 1]; i++) {
      let seat;
      do seat = r.int(1, 54); while (used.has(c + ':' + seat));
      used.add(c + ':' + seat);
      const p = randomPerson(r, 'p' + n++, c, seat);
      p.mood = r.int(55, 80);
      S.people.push(p);
    }
  }
  // события по времени
  for (const [id, rec] of Object.entries(REC)) {
    if (rec.kind === 'journal') S.timed.push({ t: rec.t, type: 'journal', rec: id });
  }
  S.timed.push({ t: T(23, 0), type: 'banner', text: 'НОЧЬ' });
  S.timed.push({ t: T(1, 0), type: 'blizzard', text: 'МЕТЕЛЬ' });
  S.timed.push({ t: T(2, 30), type: 'blizzardEnd' });
  S.timed.push({ t: T(3, 0), type: 'banner', text: 'В ТРИ ЧАСА' });
  S.timed.push({ t: WARN, type: 'warn' });
  S.timed.push({ t: MORNING, type: 'morning' });
  S.meetKm = WORLD.meetKm;
}

// ---------- записи блокнота ----------

function hasRec(S, id) { return S.records.some((r) => r.id === id); }

function addRec(S, id, extra) {
  if (hasRec(S, id)) return false;
  const base = REC[id] || {};
  const text = (base.text || '').replace('{MEET}', S.meetKm);
  S.records.push({ id, t: S.t, kind: base.kind || 'testimony', text, ...extra });
  // противоречия, которые следуют из признания, учитываются сразу
  return true;
}

function recText(S, id) {
  const r = S.records.find((x) => x.id === id);
  return r ? r.text : ((REC[id] && REC[id].text) || id).replace('{MEET}', S.meetKm);
}

function personById(S, id) { return S.people.find((p) => p.id === id); }
function fullName(p) { return `${p.last} ${p.first} ${p.patr}`; }
function shortName(p) { return `${p.last} ${p.first[0]}. ${p.patr[0]}.`; }

// ---------- допрос ----------

function pickAnswer(spec, t) {
  if (!spec) return null;
  if (typeof spec === 'string') return { text: spec };
  if (Array.isArray(spec)) {
    let a = spec[0];
    for (const x of spec) if (t >= x.after) a = x;
    return a;
  }
  return spec;
}

function hashStr(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

function genericAnswer(S, p, q) {
  const r = rng(hashStr(p.id + q + S.seed));
  const tr = p.traits[0];
  const night = {
    where: {
      'болтливый': ['Спал, ну как спал — ворочался. Сосед храпит как трактор! Часа в два вставал воды попить.', 'Ой, полночи в телефоне сидел, а связи нет. Потом уснул.'],
      'наблюдательный': ['Лёг в 23:40, проснулся в 05:50. Ночью не вставал.', 'Спал. Около полуночи выходил к проводнице за кипятком, вернулся через пять минут.'],
      'пьяный': ['Спал… кажется. Голова болит.', 'А который час был? Спал я.'],
      'подозрительный': ['Спал. А вы почему меня спрашиваете? Других спросите.', 'Спал. Вещи свои под голову положил — тут всякие ходят.'],
      'молчун': ['Спал.', 'Спал. Всю ночь.'],
    },
    saw: {
      'болтливый': ['Проводница ходила, с чаем. Больше никого, темнота же!'],
      'наблюдательный': ['Проводница проходила около двух. Больше никого.'],
      'пьяный': ['Кого-то видел… или снилось.'],
      'подозрительный': ['В нашем вагоне — никого. А вот в соседних — не знаю, не знаю…'],
      'молчун': ['Никого.'],
    },
    heard: {
      'болтливый': ['Ветер выл страшно! И колёса. И кто-то кашлял.'],
      'наблюдательный': ['Около часа ветер усилился. Метель, наверное.'],
      'пьяный': ['Колёса. Тук-тук.'],
      'подозрительный': ['Дверь где-то хлопала. Ходят тут…'],
      'молчун': ['Колёса.'],
    },
  };
  if (q === 'about') return { text: `${p.job}. ${tr === 'болтливый' ? 'Еду вот, а что делать — жизнь такая!' : tr === 'молчун' ? '' : 'Ничего особенного.'}`.trim() };
  if (q === 'purpose') return { text: p.purpose + '.' };
  if (night[q]) {
    const arr = night[q][tr] || night[q]['молчун'];
    return { text: r.pick(arr), rec: `g_${p.id}_${q}` };
  }
  return { text: 'Не знаю.' };
}

function nightQuestionsOpen(S) { return !!S.flags.alert; }

function patienceOf(p) {
  let n = 3;
  if (p.traits.includes('болтливый')) n += 2;
  if (p.traits.includes('молчун')) n -= 1;
  if (p.mood > 60) n += 1;
  if (p.mood < 25) n -= 1;
  return Math.max(2, n);
}

// вопрос → {text, newRecs[], contraFound[]}
function ask(S, p, q, arg) {
  const d = DIALOG[p.id];
  const out = { text: '', recs: [], contras: [] };
  if (p.mood < 20 && !d) { out.text = 'Не буду я с вами разговаривать. Замёрзли тут все из-за вас.'; return out; }
  let ans;
  if (q === 'know') {
    const target = personById(S, arg);
    ans = (d && d.know && pickAnswer(d.know[arg], S.t)) || (target && target.car === p.car ? { text: 'Сосед по вагону. Видел, а так — не знаю.' } : { text: 'Нет, не знаю.' });
    if (ans && !ans.rec) ans = { ...ans, rec: null };
  } else if (d && d[q]) {
    ans = pickAnswer(d[q], S.t);
  } else {
    ans = genericAnswer(S, p, q);
  }
  out.text = ans.text;
  if (ans.rec) {
    const label = shortName(p) + ': «' + ans.text + '»';
    if (addRec(S, ans.rec, { kind: 'testimony', who: p.id, text: label })) out.recs.push(ans.rec);
  }
  return out;
}

function present(S, p, recId) {
  const d = DIALOG[p.id];
  const out = { text: '', recs: [], contras: [], broke: false };
  const re = d && d.present && d.present[recId];
  if (!re) {
    out.text = p.broken ? 'Я уже всё сказал(а).' : 'Не понимаю, при чём тут я.';
    return out;
  }
  if (re.breaks || (p.broken && d.broken)) {
    breakPerson(S, p, out);
    // противоречие, которое вскрыло секрет
    for (const c of CONTRAS) if (c.against === p.id && (c.a === recId || c.b === recId)) foundContra(S, c, out);
    return out;
  }
  if (re.needs && !hasRec(S, re.needs)) {
    out.text = re.alt || re.text;
    return out;
  }
  out.text = re.text;
  if (re.rec && addRec(S, re.rec, {})) out.recs.push(re.rec);
  // противоречия с этой уликой
  for (const c of CONTRAS) {
    if (c.against !== p.id) continue;
    if ((c.a === recId && hasRec(S, c.b)) || (c.b === recId && hasRec(S, c.a))) foundContra(S, c, out);
  }
  if (re.lie) {
    p.lies = (p.lies || 0) + 1;
    if (p.role && p.lies >= 2) breakPerson(S, p, out, true);
  }
  return out;
}

function breakPerson(S, p, out, afterLies) {
  const d = DIALOG[p.id];
  if (p.broken) { out.text = 'Я уже всё сказал(а).'; return; }
  p.broken = true;
  out.broke = true;
  const id = d.broken;
  out.text = (afterLies ? '…Хватит. ' : '') + REC[id].text.replace('{MEET}', S.meetKm).replace(/^[^:]+: /, '');
  if (addRec(S, id, {})) out.recs.push(id);
}

function foundContra(S, c, out) {
  const key = c.a + '|' + c.b;
  if (S.contras.includes(key)) return false;
  S.contras.push(key);
  if (out) out.contras.push(c);
  return true;
}

// Связать две записи нитью в блокноте
function linkRecords(S, a, b) {
  const c = CONTRAS.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  if (!c) return null;
  if (!hasRec(S, c.a) || !hasRec(S, c.b)) return null;
  const isNew = foundContra(S, c);
  return { c, isNew };
}

// Улики против человека
function evidenceAgainst(S, pid) {
  const list = [];
  for (const r of S.records) {
    const base = REC[r.id];
    if (base && base.against && base.against.includes(pid)) list.push({ type: 'rec', id: r.id, text: r.text });
  }
  for (const key of S.contras) {
    const [a, b] = key.split('|');
    const c = CONTRAS.find((x) => x.a === a && x.b === b);
    if (c && c.against === pid) list.push({ type: 'contra', id: key, text: 'Противоречие: ' + short(recText(S, a)) + ' ⟷ ' + short(recText(S, b)) });
  }
  return list;
}

function short(s) { return s.length > 46 ? s.slice(0, 44) + '…' : s; }

// ---------- осмотр, обыск ----------

function lastTheft(S) {
  const x = S.theftLog.filter((l) => l.kg > 0);
  return x.length ? x[x.length - 1].t : null;
}

function inspect(S, p) {
  if (p.id === 'sedov') {
    const lt = lastTheft(S);
    if (lt === null) return { text: 'Руки чистые, обувь сухая.' };
    const recs = [];
    let text = 'На рукаве и под ногтями — сажа.';
    if (addRec(S, 'p_soot', {})) recs.push('p_soot');
    if (S.t - lt <= 150) {
      text += ' Валенки мокрые, в снегу.';
      if (addRec(S, 'p_boots', {})) recs.push('p_boots');
    } else text += ' Валенки сухие.';
    return { text, recs };
  }
  if (p.id === 'ershov') {
    addRec(S, 'p_ershov', {});
    return { text: 'Руки чистые, сажи нет. Обувь сухая.', recs: ['p_ershov'] };
  }
  if (p.id === 'matveev') return { text: 'Руки в окалине от сварки, но не в угле. Пахнет перегаром.' };
  return { text: 'Руки чистые, обувь сухая.' };
}

function search(S, p) {
  const lt = lastTheft(S);
  if (p.id === 'sedov' && lt !== null) { addRec(S, 'p_bags', {}); return { text: 'Свитер, бритва, тушёнка. На дне — три пустых мешка, пахнут углём.', recs: ['p_bags'] }; }
  if (p.id === 'laptev') { addRec(S, 'p_map', {}); return { text: 'Платье в чехле, косметичка. В подкладке — карта участка, карандашом: «КМ ' + S.meetKm + ' — сани».', recs: ['p_map'] }; }
  if (p.id === 'shubin') { addRec(S, 'p_sable', {}); return { text: 'Под свитерами — 40 соболиных шкурок без бирок. Браконьерские.', recs: ['p_sable'] }; }
  return { text: 'Одежда, еда в дорогу, лекарства. Ничего подозрительного.' };
}

function inspectCar(S, n) {
  const lt = lastTheft(S);
  if (n === 9 && lt !== null) { addRec(S, 'p_car9', {}); return { text: 'У котла рассыпан уголь, мокрые следы валенок ведут в тамбур. В тамбуре — снег.', recs: ['p_car9'] }; }
  if (n === 7 && lt !== null) { addRec(S, 'p_car7', {}); return { text: 'Под нижней полкой места 23 — угольная пыль.', recs: ['p_car7'] }; }
  return { text: 'Ничего необычного. Котёл, ящик, тамбуры в порядке.' };
}

// ---------- итог рейса ----------

function evaluate(S) {
  const res = { lines: [], money: 0, rep: 0, stars: 0, fail: null };
  const dead = S.people.filter((p) => !p.alive);
  if (dead.length) res.fail = `Погибли от холода: ${dead.map(shortName).join(', ')}.`;
  // билеты
  const alive = S.people.filter((p) => p.alive && !p.gone && !p.role).length;
  res.money += alive * 900;
  res.lines.push(['Билеты', `${alive} пасс. × 900 ₽`, alive * 900]);
  // опоздание: расписание — 11:30
  const late = Math.max(0, S.t - (DAY + 12 * 60 + 30));
  if (late > 0) {
    const fine = Math.round(late / 60 * 3000);
    res.money -= fine;
    res.lines.push(['Опоздание', `${Math.floor(late / 60)} ч ${late % 60} мин`, -fine]);
  } else res.lines.push(['Прибытие', 'по расписанию', 5000]), res.money += 5000;
  // задержанные
  for (const p of S.people.filter((x) => x.detained)) {
    const ev = evidenceAgainst(S, p.id).length;
    if (p.role && ev >= 2) { res.money += 30000; res.rep += 2; res.lines.push([shortName(p), `виновен, улик: ${ev} — осуждён`, 30000]); }
    else if (p.role) { res.lines.push([shortName(p), `виновен, но улик мало (${ev}) — отпущен`, 0]); }
    else { res.money -= 20000; res.rep -= 2; res.lines.push([shortName(p), 'невиновен — статья в газете', -20000]); }
  }
  for (const p of S.people.filter((x) => x.role && !x.detained)) {
    res.lines.push([shortName(p), p.gone ? 'ушёл к саням в тайгу' : 'сошёл с поезда на станции', 0]);
    res.rep -= 1;
  }
  if (hasRec(S, 'p_sable')) { res.money += 15000; res.lines.push(['Контрабанда', 'соболь изъят', 15000]); }
  if (S.complaints >= 3) { res.money -= 10000; res.rep -= 1; res.lines.push(['Жалобы', `${S.complaints} — штраф Управления`, -10000]); }
  const caught = S.people.filter((p) => p.role && p.detained && evidenceAgainst(S, p.id).length >= 2).length;
  res.caught = caught;
  res.stars = res.fail ? 0 : 1 + (caught >= 1 ? 1 : 0) + (caught === 3 ? 1 : 0);
  return res;
}

Object.assign(globalThis, {
  KEY_PEOPLE, REC, CONTRAS, DIALOG, MORNING, WARN, JOURNAL_SRC,
  buildCase, hasRec, addRec, recText, personById, fullName, shortName, ask, present, linkRecords,
  evidenceAgainst, inspect, search, inspectCar, evaluate, nightQuestionsOpen, patienceOf, lastTheft,
});
