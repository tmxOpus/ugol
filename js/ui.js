// «Уголь» — интерфейс: HUD, экраны, досье, допрос, блокнот, игровой цикл.
'use strict';

const $ = (s) => document.querySelector(s);
const SAVE_KEY = 'ugol_save_v2';
const TIME_SCALE = 3; // реальных секунд на игровую минуту при ×1

let S = null;
let tab = 'train';
let thermal = false;
let curCar = 7;
let notesView = 'recs';
let linkMode = false;
let linkSel = [];
let acc = 0;
let lastTs = 0;
let lastHud = 0;
let lastScr = 0;
let touching = false;
let FC = null; // кэш прогноза
let IQ = null; // текущий допрос
const modalQueue = [];
let modalRender = null;

// ---------- форматирование ----------
const pad = (n) => String(n).padStart(2, '0');
function clockOf(t, frac = 0) {
  const m = ((Math.floor(t) % DAY) + DAY) % DAY;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}:${pad(Math.floor(frac * 60))}`;
}
function hm(t) { return clockOf(t).slice(0, 5); }
function fmtTemp(x) { const r = Math.round(x); return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r) + '°'; }
function fmtH(h) {
  if (h >= 999) return '∞';
  if (h < 1) return Math.max(0, Math.round(h * 60)) + ' МИН';
  return Math.floor(h) + ' Ч';
}
function fmtKg(kg) { return kg >= 1000 ? (kg / 1000).toFixed(1).replace('.', ',') + ' Т' : Math.round(kg) + ' КГ'; }
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function gradeText(g) { return g > 0 ? `ПОДЪЁМ ${g}‰` : g < 0 ? `СПУСК ${-g}‰` : 'ПЛОЩАДКА'; }

// ---------- сохранение и защита данных ----------
// Сохранение лежит в localStorage в «конверте» с контрольной суммой.
// Перед перезаписью предыдущая целая копия уходит в резервный слот.
// При загрузке и импорте данные проверяются и очищаются: битый или чужой файл
// не ломает игру и не может внедрить разметку на страницу.
const SAVE_FORMAT = 'ugol-save';
const BAK_KEY = SAVE_KEY + '_bak';
const MAX_SAVE_BYTES = 3 * 1024 * 1024;
let lastBackupAt = 0;
let saveWarned = false;

function checksum(str) {
  // FNV-1a, 32 бита — ловит повреждение данных
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
function wrapSave(state) {
  const data = JSON.stringify(state, (k, v) => (k === '_saved' ? undefined : v));
  return JSON.stringify({ format: SAVE_FORMAT, v: 2, at: Date.now(), sum: checksum(data), data });
}
// очистка: только простые типы, строки без угловых скобок, разумные размеры
function sanitize(v, depth = 0) {
  if (depth > 12) throw new Error('глубина');
  if (v === null || typeof v === 'boolean') return v;
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error('число'); return v; }
  if (typeof v === 'string') return v.replace(/[<>]/g, '').slice(0, 4000);
  if (Array.isArray(v)) { if (v.length > 5000) throw new Error('массив'); return v.map((x) => sanitize(x, depth + 1)); }
  if (typeof v === 'object') {
    const out = {};
    const keys = Object.keys(v);
    if (keys.length > 5000) throw new Error('объект');
    for (const k of keys) { if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue; out[k] = sanitize(v[k], depth + 1); }
    return out;
  }
  throw new Error('тип');
}
function validState(st) {
  return st && typeof st === 'object' && st.v === 2 && Number.isFinite(st.t) && Number.isFinite(st.wseed) &&
    Array.isArray(st.people) && st.people.length > 0 && st.people.length < 500 &&
    Array.isArray(st.cars) && st.cars.length === CAR_COUNT && Array.isArray(st.records) && Array.isArray(st.route) &&
    st.pos && Number.isFinite(st.pos.e) && Number.isFinite(st.pos.d) && st.people.every((p) => p && typeof p.id === 'string' && typeof p.last === 'string' && p.look);
}
// разобрать конверт (или старый формат без конверта) → состояние или null
function unwrapSave(raw, strict) {
  if (!raw || raw.length > MAX_SAVE_BYTES) return { err: 'файл слишком большой или пустой' };
  let env;
  try { env = JSON.parse(raw); } catch (e) { return { err: 'это не файл сохранения' }; }
  let state;
  if (env && env.format === SAVE_FORMAT && typeof env.data === 'string') {
    if (checksum(env.data) !== env.sum) return { err: 'файл повреждён или изменён вручную' };
    try { state = JSON.parse(env.data); } catch (e) { return { err: 'данные внутри файла повреждены' }; }
  } else if (!strict && env && env.v === 2) state = env; // старое сохранение без конверта
  else return { err: 'это не сохранение «Угля»' };
  try { state = sanitize(state); } catch (e) { return { err: 'недопустимые данные (' + e.message + ')' }; }
  if (!validState(state)) return { err: 'сохранение не подходит к этой версии игры' };
  state.events = []; // события не переносятся
  return { state, at: env.at || null };
}

function save() {
  if (!S || S.ended) return;
  try {
    const now = Date.now();
    // раз в минуту предыдущая целая копия становится резервной
    if (now - lastBackupAt > 60000) {
      const prev = localStorage.getItem(SAVE_KEY);
      if (prev && unwrapSave(prev).state) localStorage.setItem(BAK_KEY, prev);
      lastBackupAt = now;
    }
    localStorage.setItem(SAVE_KEY, wrapSave(S));
  } catch (e) {
    if (!saveWarned) { saveWarned = true; toast('Не удалось сохранить рейс: нет места или хранилище недоступно. Скачай копию в меню.', 'СОХРАНЕНИЕ', true); }
  }
}
function loadSave() {
  for (const key of [SAVE_KEY, BAK_KEY]) {
    let raw = null;
    try { raw = localStorage.getItem(key); } catch (e) { return null; }
    if (!raw) continue;
    const r = unwrapSave(raw);
    if (r.state && !r.state.ended) {
      if (key === BAK_KEY) r.restored = true;
      return r;
    }
  }
  return null;
}
function clearSave() { try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(BAK_KEY); } catch (e) { /* */ } }

function exportSave() {
  if (S && !S.ended) save();
  let raw = null;
  try { raw = S && !S.ended ? wrapSave(S) : localStorage.getItem(SAVE_KEY); } catch (e) { /* */ }
  if (!raw) { toast('Нечего сохранять — рейс не начат.', 'СОХРАНЕНИЕ'); return; }
  const d = new Date();
  const name = `ugol-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
  const file = new File([raw], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: 'Сохранение «Уголь»' }).catch(() => {});
    return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast(`Копия сохранена: ${name}`, 'СОХРАНЕНИЕ');
}
function importSave(file) {
  if (!file) return;
  if (file.size > MAX_SAVE_BYTES) { toast('Файл слишком большой для сохранения.', 'СОХРАНЕНИЕ', true); return; }
  const fr = new FileReader();
  fr.onload = () => {
    const r = unwrapSave(String(fr.result), true);
    if (!r.state) { toast('Не загружено: ' + r.err + '.', 'СОХРАНЕНИЕ', true); return; }
    if (r.state.ended) { toast('Этот рейс уже закончен.', 'СОХРАНЕНИЕ', true); return; }
    try { localStorage.setItem(SAVE_KEY, wrapSave(r.state)); } catch (e) { /* играем без записи */ }
    closeAllModals();
    continueGame(r.state);
    toast('Рейс загружен из файла.', 'СОХРАНЕНИЕ');
  };
  fr.onerror = () => toast('Не удалось прочитать файл.', 'СОХРАНЕНИЕ', true);
  fr.readAsText(file);
}

// попросить у браузера постоянное хранилище, чтобы система не стёрла сохранение
let storagePersistent = null;
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persisted().then((p) => p || navigator.storage.persist()).then((p) => { storagePersistent = p; }).catch(() => {});
}

function savesSheet() {
  const has = (() => { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } })();
  const bak = (() => { try { return !!localStorage.getItem(BAK_KEY); } catch (e) { return false; } })();
  return `<button class="close" data-act="close">ЗАКРЫТЬ ✕</button>
    <div class="lbl">МЕНЮ</div><h2>Звук и данные</h2>
    <div class="btn-grid">
      <button class="btn ${settings.sound ? 'mark-on' : ''}" data-act="set-sound">ЗВУК: ${settings.sound ? 'ВКЛ' : 'ВЫКЛ'}<small>колёса, ветер, сигналы</small></button>
      <button class="btn ${settings.music ? 'mark-on' : ''}" data-act="set-music">МУЗЫКА: ${settings.music ? 'ВКЛ' : 'ВЫКЛ'}<small>радио в вагоне</small></button>
    </div>
    <div class="grp">СОХРАНЕНИЯ</div>
    <div class="fields">
      <div><span class="lbl">ТЕКУЩИЙ РЕЙС</span>${S && !S.ended ? 'идёт · ' + hm(S.t) + ' · КМ ' + Math.floor(S.odo) : has ? 'есть сохранение' : 'нет'}</div>
      <div><span class="lbl">АВТОСОХРАНЕНИЕ</span>каждые 5 секунд, с контрольной суммой${bak ? ' · есть резервная копия' : ''}</div>
      <div><span class="lbl">ХРАНИЛИЩЕ</span>${storagePersistent ? 'постоянное — система не удалит' : 'обычное — установи игру на экран «Домой», чтобы iOS не очистила данные'}</div>
    </div>
    <p class="dim">Всё хранится только на этом устройстве, никуда не отправляется. Чтобы перенести рейс или подстраховаться, скачай копию в файл.</p>
    <div class="btn-grid">
      <button class="btn primary" data-act="export">СКАЧАТЬ КОПИЮ<small>файл .json</small></button>
      <button class="btn" data-act="import">ЗАГРУЗИТЬ ИЗ ФАЙЛА<small>проверка целостности</small></button>
      ${S && !S.ended ? '<button class="btn wide" data-act="to-title">В ГЛАВНОЕ МЕНЮ<small>рейс сохранён</small></button>' : ''}
    </div>`;
}

// ---------- тосты / баннер ----------
function toast(text, who = 'РАЦИЯ', red = false) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (red ? ' red' : '');
  el.innerHTML = `<span class="who">${esc(who)} · ${hm(S ? S.t : 0)}</span>${esc(text)}`;
  box.appendChild(el);
  while (box.children.length > 2) box.firstChild.remove();
  setTimeout(() => el.classList.add('out'), 5200);
  setTimeout(() => el.remove(), 5800);
}
function banner(text) {
  const b = $('#banner');
  b.textContent = text;
  b.classList.remove('show');
  void b.offsetWidth;
  b.classList.add('show');
}

// ---------- модальные окна ----------
function openModal(render) {
  modalRender = render;
  $('#modal').classList.remove('hidden');
  rerenderModal();
  $('#sheet').scrollTop = 0;
}
function pushModal(render) {
  if (modalRender) modalQueue.push(render);
  else openModal(render);
}
function rerenderModal() { if (modalRender) $('#sheet').innerHTML = modalRender(); }
function closeModal() {
  modalRender = null;
  IQ = null;
  $('#modal').classList.add('hidden');
  if (modalQueue.length) openModal(modalQueue.shift());
  renderAll();
}
function isRunning() { return S && !S.ended && !modalRender && S.mul > 0 && $('#title').classList.contains('hidden'); }

function setMul(m) {
  S.mul = m;
  document.querySelectorAll('#time-seg button').forEach((b) => b.classList.toggle('on', +b.dataset.mul === m));
}
function pause() { if (S) setMul(0); }

// ---------- действие, которое стоит времени ----------
function act(minutes, fn) {
  advance(S, minutes);
  const r = fn ? fn() : null;
  handleEvents();
  renderAll();
  save();
  return r;
}
function walkTo(car, p) {
  const m = Math.abs(S.playerCar - car) * 3;
  S.playerCar = car;
  if (p) {
    const sec = p.seat <= 36 ? Math.floor((p.seat - 1) / 4) : 8 - Math.floor((p.seat - 37) / 2);
    S.chiefX = 9.2 - (18.4 / 9) * (sec + 0.5) + 0.5;
  } else S.chiefX = 0;
  return m;
}

// ---------- события симуляции ----------
function handleEvents() {
  while (S.events.length) {
    const ev = S.events.shift();
    switch (ev.type) {
      case 'journal':
        addRec(S, ev.rec, {});
        markNew();
        break;
      case 'banner': banner(ev.text); break;
      case 'blizzard':
        banner('МЕТЕЛЬ');
        toast('Метель. Скорость падает, тепло выдувает — котлы едят больше.', 'КОЧЕГАР МИХАЛЫЧ');
        break;
      case 'boxLow':
        toast(`Вагон ${ev.n}: угля в ящике почти не осталось. Подкинь вёдрами из тендера или переведи людей.`, 'КОЧЕГАР МИХАЛЫЧ', true);
        pause();
        break;
      case 'carCold':
        toast(`Вагон ${ev.n}: ниже +10°. Люди мёрзнут!`, 'ПРОВОДНИК', true);
        Sound.sting('bad');
        pause();
        break;
      case 'blizzardEnd': toast('Метель стихла.', 'КОЧЕГАР МИХАЛЫЧ'); break;
      case 'warn':
        if (S.theftLog.some((l) => l.kg > 0)) {
          S.flags.alert = true;
          addRec(S, 'r_warn', { kind: 'report', text: 'Михалыч, 01:30: «Начальник, уголь в тендере уходит быстрее, чем по расчёту. Не нравится мне это».' });
          markNew();
          toast('Начальник, уголь в тендере уходит быстрее, чем по расчёту. Не нравится мне это.', 'КОЧЕГАР МИХАЛЫЧ', true);
          Sound.sting('bad');
          pause();
        }
        break;
      case 'morning': morningReport(); break;
      case 'arrive':
        toast(`Стоянка: ${ev.station}.` + (ev.coal ? ` На станции есть уголь: ${ev.coal} кг.` : ''), 'МАШИНИСТ');
        if (ev.coal) { pause(); Sound.sting(); }
        break;
      case 'pass': toast(`Проследовали: ${ev.station}.`, 'МАШИНИСТ'); break;
      case 'depart': toast(`Отправились со станции ${ev.station}.`, 'МАШИНИСТ'); break;
      case 'noCoal':
        banner('ПОЕЗД ВСТАЛ');
        Sound.sting('bad');
        pause();
        pushModal(survivalSheet);
        break;
      case 'sledges':
        banner('САНИ');
        thermal = true;
        toast('Тепловизор: в лесу тёплые точки. Идут к поезду. Сани.', 'ТЕПЛОВИЗОР', true);
        Sound.sting('bad');
        pause();
        break;
      case 'sledgesBlocked':
        toast('У тамбуров стучали и дёргали двери — но они заперты. Сани ушли ни с чем.', 'ПРОВОДНИК');
        break;
      case 'escape': {
        const names = ev.pids.map((id) => shortName(personById(S, id))).join(', ');
        banner('УШЛИ В ТАЙГУ');
        toast(`Пропали из поезда: ${names}. Следы ведут к саням.`, 'ПРОВОДНИК', true);
        Sound.sting('bad');
        pause();
        break;
      }
      case 'sledgesLeave': toast('Тёплые точки уходят в лес.', 'ТЕПЛОВИЗОР'); break;
      case 'helpArrive':
        banner('ПОМОЩЬ');
        toast('Подошёл маневровый с углём из Усть-Куты: +2,5 т в тендер. Можно ехать!', 'МАШИНИСТ');
        Sound.sting('good');
        break;
      case 'helpFail': {
        const p = personById(S, ev.pid);
        toast(`Помощь так и не пришла. ${shortName(p)} до станции не дошёл — похоже, ушёл к своим.`, 'РАЦИЯ', true);
        S.help = null;
        Sound.sting('bad');
        pause();
        break;
      }
      case 'death': {
        const p = personById(S, ev.pid);
        S.ended = true;
        S.result = { fail: `${fullName(p)} погиб(ла) от холода в вагоне ${p.car}.` };
        clearSave();
        pushModal(endSheet);
        break;
      }
      case 'finish':
        S.ended = true;
        clearSave();
        banner('УСТЬ-КУТА');
        pushModal(endSheet);
        break;
    }
  }
}

function isMarked(pid) { return !!(S.marked && S.marked.includes(pid)); }
function markNew() { S.unread = (S.unread || 0) + 1; }

function morningReport() {
  const kg = S.theftLog.reduce((a, l) => a + l.kg, 0);
  const box = S.theftLog.reduce((a, l) => a + (l.box || 0), 0);
  banner('УТРО');
  pause();
  if (kg <= 0) {
    addRec(S, 'r_morning', { kind: 'report', text: 'Михалыч, 06:00: «Ночь прошла спокойно, расход по расчёту».' });
    markNew();
    return;
  }
  S.flags.alert = true;
  const text = `Михалыч, 06:00: «Из ящика вагона 9 пропало ${Math.round(box)} кг. В тендере недостача около ${(kg / 1000).toFixed(1).replace('.', ',')} т против расчёта. Кто-то ворует, начальник».`;
  addRec(S, 'r_morning', { kind: 'report', text });
  markNew();
  const total = S.tender + kg;
  pushModal(() => `
    <button class="close" data-act="close">ЗАКРЫТЬ ✕</button>
    <div class="lbl">РАПОРТ КОЧЕГАРА · 06:00</div>
    <h2>Уголь уходит быстрее, чем должен</h2>
    <div class="metric"><div class="lbl">НЕДОСТАЧА ЗА НОЧЬ</div><div class="big alarm" style="color:var(--alarm)">−${fmtKg(kg + box)}</div></div>
    <div class="report-bar"><span>ТЕНДЕР</span><i id="rb" style="height:${(total / 11000) * 100}%"></i></div>
    <p>Из ящика вагона 9 пропало <b class="amber">${Math.round(box)} кг</b>. В тендере недостача около <b class="amber">${(kg / 1000).toFixed(1).replace('.', ',')} т</b> против расчёта.</p>
    <p class="dim">Опроси пассажиров, особенно вагоны 7–9. Сверяй показания с журналом проводника и связывай противоречия нитью в блокноте. Осмотр рук и обуви — 2 минуты. Для обыска нужна хотя бы одна улика, иначе будет жалоба. Чтобы полиция в Усть-Куте осудила задержанного, нужно минимум 2 улики.</p>
    <p class="dim">И смотри на прогноз угля: если не хватит до Усть-Куты — экономь (ЭКО), собирай уголь из ящиков пустых вагонов, бери уголь на Шахтёрском.</p>
    <button class="btn primary" style="width:100%" data-act="close">ЯСНО</button>`);
  setTimeout(() => { const el = document.getElementById('rb'); if (el) el.style.height = (S.tender / 11000) * 100 + '%'; }, 250);
}

// ---------- HUD ----------
function renderHud(frac) {
  $('#hud-km').textContent = 'КМ ' + Math.floor(S.odo);
  $('#hud-clock').textContent = clockOf(S.t, frac);
  $('#hud-temp').textContent = fmtTemp(outsideTemp(S.t, S));
  $('#hud-grade').textContent = S.stop ? 'СТОЯНКА' : gradeText(curGrade(S));
  const fc = FC;
  const coalEl = $('#hud-coal');
  coalEl.textContent = fc.enough ? fmtH(fc.coalHours) + ' ✓' : fmtH(fc.coalHours);
  coalEl.classList.toggle('alarm', !fc.enough);
  $('#hud-dest').textContent = fmtH(fc.destHours);
  const sig = hasSignal(S);
  $('#hud-sig').textContent = sig ? 'ЕСТЬ' : 'НЕТ СИГНАЛА';
  $('#hud-sig').classList.toggle('alarm', !sig);
  $('#notes-dot').classList.toggle('on', (S.unread || 0) > 0 && tab !== 'notes');
}

function renderStrip() {
  let h = '';
  if (S.stop && S.stop.noCoal) {
    const canGo = S.tender >= 40;
    h = `<div class="strip-in warn"><div class="t alarm">ПОЕЗД СТОИТ · КМ ${Math.floor(S.odo)} · ТЕНДЕР ПУСТ${S.help ? ` · ПОМОЩЬ ≈ ${hm(S.help.eta)}` : ''}</div>
      ${canGo ? `<button class="btn primary" data-act="go-on">ЕХАТЬ ДАЛЬШЕ <small>${fmtKg(S.tender)}</small></button>` : ''}
      <button class="btn" data-act="survival">СТОЯНКА В ТАЙГЕ</button></div>`;
  } else if (S.stop) {
    const st = S.stop;
    const coal = st.node != null ? S.stationCoal[st.node] ?? 0 : 0;
    const take = Math.min(800, coal, Math.max(0, 11000 - S.tender));
    if (st.until === null) h = '';
    else h = `<div class="strip-in"><div class="t">СТОЯНКА · ${esc(st.station.toUpperCase())} · ОТПРАВЛЕНИЕ ${hm(st.until)} · УГЛЯ НА СТАНЦИИ ${fmtKg(coal)}</div>
      ${take > 0 ? `<button class="btn primary" data-act="st-coal">ВЗЯТЬ УГОЛЬ <small>${Math.round(take)} КГ · 30 МИН</small></button>` : ''}
      <button class="btn" data-act="st-wait">СТОЯТЬ +30 МИН</button>
      <button class="btn" data-act="st-depart">ОТПРАВЛЕНИЕ</button></div>`;
  }
  const el = $('#strip');
  if (el.dataset.h !== h) { el.innerHTML = h; el.dataset.h = h; }
}

// ---------- экраны ----------
function renderAll() {
  if (!S) return;
  FC = forecast(S);
  renderHud(acc);
  renderStrip();
  renderScreen();
  document.querySelectorAll('#mode-seg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === S.mode));
  document.querySelectorAll('#time-seg button').forEach((b) => b.classList.toggle('on', +b.dataset.mul === S.mul));
  const tb = $('#btn-tambour');
  tb.textContent = S.tamboursLocked ? 'ТАМБУРЫ: ЗАПЕРТЫ' : 'ТАМБУРЫ: ОТКРЫТЫ';
  tb.classList.toggle('lock', S.tamboursLocked);
  $('#btn-thermal').classList.toggle('on', thermal);
  if (modalRender && !IQ) rerenderModal();
}

function renderScreen() {
  if (tab === 'car') $('#scr-car').innerHTML = carScreen();
  else if (tab === 'people') $('#scr-people').innerHTML = peopleScreen();
  else if (tab === 'map') $('#scr-map').innerHTML = mapScreen();
  else if (tab === 'notes') $('#scr-notes').innerHTML = notesScreen();
  else if (tab === 'train') renderTrainForecast();
}

function renderTrainForecast() {
  const fc = FC;
  const ns = nextStop(S);
  const st = ns.node;
  $('#train-forecast').innerHTML = `
    <div class="lbl">${thermal ? 'ПРОГНОЗ: В ВАГОНАХ К УТРУ' : 'ДО СТАНЦИИ · ' + esc(st.name.toUpperCase())}</div>
    <div class="big" style="color:${thermal ? 'var(--orange)' : 'var(--amber)'}">${thermal ? fmtTemp(avgLiveTemp()) : (ns.dist < 1 ? (ns.dist * 1000).toFixed(0) + ' М' : Math.round(ns.dist) + ' КМ')}</div>
    <div class="lbl" style="margin-top:6px">УГОЛЬ НА ХОД</div>
    <div class="big ${fc.enough ? '' : 'alarm'}" style="font-size:30px;color:${fc.enough ? '#eef2fa' : 'var(--alarm)'}">${fmtH(fc.coalHours)} <span class="lbl">/ ДО КОНЦА ${fmtH(fc.destHours)}</span></div>`;
  $('#train-mode-lbl').textContent = thermal ? '· ТЕПЛОВИЗОР' : '';
}

function avgLiveTemp() {
  const live = S.cars.filter((c) => carPeople(S, c.n).length);
  if (!live.length) return 0;
  return live.reduce((a, c) => a + c.T, 0) / live.length;
}

function boxBurnEst(car) {
  if (!car.heat) return 0;
  const tOut = outsideTemp(S.t, S);
  return 6.5 * Math.max(0.25, (22 - tOut) / 65) * (car.windows ? 0.72 : 1);
}

// --- вагон ---
function carSVG(car) {
  const ppl = carPeople(S, car.n);
  const warm = Math.max(0, Math.min(1, (car.T - 4) / 18));
  const body = car.locked ? '#2a3550' : `rgb(${Math.round(60 + 190 * warm)},${Math.round(70 + 50 * warm)},${Math.round(120 - 60 * warm)})`;
  const stroke = car.T < 10 ? '#8fb3d9' : '#7a5cc8';
  let s = `<svg class="car-svg" viewBox="0 0 400 246" xmlns="http://www.w3.org/2000/svg">
    <defs><radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ff9a3c" stop-opacity=".55"/><stop offset="1" stop-color="#ff9a3c" stop-opacity="0"/></radialGradient></defs>`;
  if (car.heat && car.box > 0) s += `<circle cx="352" cy="120" r="70" fill="url(#glow)"/>`;
  s += `<rect x="338" y="20" width="10" height="26" fill="none" stroke="${stroke}" stroke-width="2"/>`;
  s += `<path d="M30 190 L30 70 Q30 45 55 45 L345 45 Q370 45 370 70 L370 190 Z" fill="#141c38" stroke="${stroke}" stroke-width="2"/>`;
  // купе
  for (let i = 0; i < 9; i++) {
    const x = 38 + i * 32;
    s += `<rect x="${x}" y="70" width="29" height="110" rx="3" fill="${body}" opacity="${car.locked ? 0.5 : 0.95}"/>`;
    if (car.windows) {
      for (let k = 0; k < 5; k++) s += `<rect x="${x + 3}" y="${78 + k * 5}" width="23" height="3" rx="1" fill="#dfe6f2"/>`;
    } else {
      s += `<rect x="${x + 4}" y="78" width="21" height="22" rx="4" fill="#141c38"/>`;
    }
    s += `<rect x="${x + 4}" y="128" width="21" height="3" fill="#3a2a7a"/><rect x="${x + 4}" y="160" width="21" height="3" fill="#3a2a7a"/>`;
  }
  // люди — точки
  ppl.slice(0, 18).forEach((p, i) => {
    const x = 50 + (i % 9) * 32, y = i < 9 ? 112 : 146;
    s += `<circle cx="${x}" cy="${y}" r="5" fill="${p.health < 40 ? '#8fb3d9' : '#ffd38a'}"/>`;
  });
  // котёл
  s += `<rect x="334" y="70" width="28" height="110" rx="4" fill="#141c38" stroke="${stroke}" stroke-width="2"/>`;
  if (car.heat && car.box > 0) s += `<path d="M340 170 Q344 150 348 160 Q352 140 356 170 Z" fill="#ff8a2a"/>`;
  s += `<rect x="38" y="182" width="324" height="3" fill="#f5b13d" opacity=".7"/>`;
  // колёса и рельсы
  for (const x of [70, 110, 290, 330]) s += `<circle cx="${x}" cy="203" r="15" fill="none" stroke="#3b4f8a" stroke-width="2"/>`;
  s += `<rect x="0" y="219" width="400" height="3" fill="#3b4f8a"/>`;
  // угольный ящик с выноской
  const fill = Math.max(0, Math.min(1, car.box / BOX_MAX));
  s += `<rect x="180" y="192" width="76" height="22" rx="3" fill="#141c38" stroke="#7a5cc8" stroke-width="2"/>`;
  s += `<rect x="183" y="${211 - 16 * fill}" width="70" height="${16 * fill}" fill="#2a2a34"/>`;
  for (let i = 0; i < Math.round(fill * 8); i++) s += `<circle cx="${190 + i * 8}" cy="${206 - (i % 2) * 4}" r="3" fill="#0a0a10"/>`;
  s += `<path d="M172 186 v-6 h6 M264 186 v-6 h-6 M172 218 v6 h6 M264 218 v6 h-6" stroke="#f5b13d" stroke-width="2" fill="none"/>`;
  s += `<text x="218" y="242" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-size="10" letter-spacing="2" fill="#f5b13d">УГОЛЬНЫЙ ЯЩИК</text>`;
  s += `</svg>`;
  return s;
}

function carScreen() {
  const car = S.cars[curCar - 1];
  const ppl = carPeople(S, car.n);
  const rate = boxBurnEst(car);
  const hrs = rate > 0 ? car.box / rate : 99;
  const pct = (car.box / BOX_MAX) * 100;
  const walk = Math.abs(S.playerCar - car.n) * 3;
  return `
    <div class="car-nav"><button data-act="car-prev">‹</button><div class="scr-head" style="margin:0"><span class="num">02</span> · ВАГОН ${car.n}${S.playerCar === car.n ? ' · <span class="amber">ВЫ ЗДЕСЬ</span>' : ''}</div><button data-act="car-next">›</button></div>
    <div class="metric"><div class="lbl">ЗАПАС УГЛЯ В ЯЩИКЕ · ${Math.round(car.box)} КГ</div>
    <div class="big orange ${hrs < 4 ? 'alarm' : ''}">${car.heat ? fmtH(hrs) : 'ОТКЛ'}</div></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    ${carSVG(car)}
    <div class="stats">
      <div class="stat"><div class="lbl">ВНУТРИ</div><div class="big ${car.T < 10 ? 'cold' : 'amber'}">${fmtTemp(car.T)}</div></div>
      <div class="stat"><div class="lbl">ЛЮДЕЙ</div><div class="big">${ppl.length}</div></div>
      <div class="stat"><div class="lbl">КОТЁЛ</div><div class="big ${car.heat ? 'amber' : 'alarm'}">${car.heat ? 'ВКЛ' : 'ОТКЛ'}</div></div>
    </div>
    <div class="lbl" style="margin-top:6px">${car.heat ? 'РАБОТАЕТ БЕЗ ЭЛЕКТРИЧЕСТВА' : 'КОТЁЛ ПОГАШЕН — ВАГОН ОСТЫВАЕТ'}${car.locked ? ' · ВАГОН ЗАКРЫТ' : ''}</div>
    <div class="btn-grid">
      <button class="btn" data-act="heat" data-n="${car.n}">${car.heat ? 'ПОГАСИТЬ КОТЁЛ' : 'РАСТОПИТЬ КОТЁЛ'}<small>0 мин</small></button>
      <button class="btn" data-act="windows" data-n="${car.n}">${car.windows ? 'СНЯТЬ ОДЕЯЛА' : 'ЗАВЕСИТЬ ОКНА'}<small>${car.windows ? '5' : '15'} мин · −28% потерь</small></button>
      <button class="btn" data-act="coal-in" data-n="${car.n}" ${S.tender < 100 || car.box > BOX_MAX - 20 ? 'disabled' : ''}>ВЁДРА ИЗ ТЕНДЕРА<small>+100 кг · 10 мин</small></button>
      <button class="btn" data-act="coal-out" data-n="${car.n}" ${car.box < 20 ? 'disabled' : ''}>ЯЩИК → ТЕНДЕР<small>−${Math.min(100, Math.floor(car.box))} кг · 10 мин</small></button>
      <button class="btn wide" data-act="inspect-car" data-n="${car.n}">ОСМОТРЕТЬ ВАГОН: ТАМБУРЫ, ЯЩИК<small>${40 + walk} мин</small></button>
    </div>
    <div class="lbl">ПАССАЖИРЫ ВАГОНА ${car.n}</div>
    <div class="plist">${ppl.length ? ppl.sort((a, b) => a.seat - b.seat).map(personRow).join('') : '<div class="dim" style="padding:8px 0">Пусто.</div>'}</div>`;
}

function personRow(p) {
  const car = S.cars[p.car - 1];
  const ev = evidenceAgainst(S, p.id).length;
  return `<button class="prow" data-act="person" data-id="${p.id}">
    <div class="ph">${portraitSVG(p, { cold: car.T < 10 ? Math.min(1, (10 - car.T) / 15) : 0 })}</div>
    <div><div class="nm">${isMarked(p.id) ? '<span class="amber">⚑ </span>' : ''}${esc(shortName(p))}${p.detained ? '<span class="tag">ЗАДЕРЖАН</span>' : ''}${ev ? `<span class="tag amber">УЛИК ${ev}</span>` : ''}</div>
    <div class="sub">${p.sex}, ${p.age} · м. ${p.seat} · ${esc(p.marks[0])}</div></div>
    <div class="meters"><span title="здоровье"><i style="width:${p.health}%;${p.health < 40 ? 'background:var(--alarm)' : ''}"></i></span><span class="m" title="настроение"><i style="width:${p.mood}%"></i></span></div>
  </button>`;
}

// --- люди ---
function peopleScreen() {
  const live = S.cars.filter((c) => carPeople(S, c.n).length > 0);
  const coal = live.reduce((a, c) => a + c.box, 0);
  const rate = live.reduce((a, c) => a + boxBurnEst(c), 0);
  const hrs = rate > 0 ? coal / rate : 99;
  const lockedCoal = S.cars.filter((c) => c.locked && c.box >= 10).reduce((a, c) => a + c.box, 0);
  const words = ['', 'ОДИН ЖИЛОЙ ВАГОН', 'ДВА ЖИЛЫХ ВАГОНА', 'ТРИ ЖИЛЫХ ВАГОНА', 'ЧЕТЫРЕ ЖИЛЫХ ВАГОНА'];
  let h = `<div class="scr-head"><span class="num">03</span> · ЛЮДИ</div>
    <div class="metric"><div class="lbl">УГОЛЬ НА ${words[live.length] || live.length + ' ЖИЛЫХ ВАГОНОВ'}</div>
    <div class="big">${fmtH(hrs)}</div></div>
    <div class="bar"><i style="width:${Math.min(100, (coal / (live.length * BOX_MAX || 1)) * 100)}%"></i></div>
    <div class="lbl">НАЖМИ НА ВАГОН: ПЕРЕСЕЛИТЬ, ЗАКРЫТЬ, ЗАБРАТЬ УГОЛЬ</div>`;
  if (lockedCoal > 0) h += `<div class="btn-grid"><button class="btn wide" data-act="collect-all">УГОЛЬ ЗАКРЫТЫХ ВАГОНОВ → ТЕНДЕР<small>+${Math.round(lockedCoal)} кг · ${S.cars.filter((c) => c.locked && c.box >= 10).length * 10} мин</small></button></div>`;
  h += `<div class="cars-grid">`;
  for (const c of S.cars) {
    const ppl = carPeople(S, c.n);
    const cls = c.locked ? '' : ppl.length && c.T < 10 ? 'cold' : ppl.length ? 'live' : '';
    h += `<button class="carcard ${cls}" data-act="pcar" data-n="${c.n}">
      <div class="h"><span>ВАГОН ${c.n}</span><span>${c.locked ? '' : fmtTemp(c.T)}</span></div>
      <div class="dots">${ppl.map((p) => `<i class="${!p.alive ? 'd' : c.T < 10 ? 'c' : ''}${isMarked(p.id) ? ' mk' : ''}"></i>`).join('')}</div>
      ${c.locked ? '<span class="lockic">🔒</span>' : ''}
    </button>`;
  }
  h += `</div>`;
  const det = S.people.filter((p) => p.detained);
  if (det.length) h += `<div class="lbl" style="margin-top:16px">СЛУЖЕБНОЕ КУПЕ · ЗАДЕРЖАННЫЕ</div><div class="plist">${det.map(personRow).join('')}</div>`;
  return h;
}

function peopleCarSheet(n) {
  return () => {
    const c = S.cars[n - 1];
    const ppl = carPeople(S, n);
    const targets = S.cars.filter((x) => x.n !== n && !x.locked);
    let h = `<button class="close" data-act="close">ЗАКРЫТЬ ✕</button>
      <div class="lbl">ВАГОН ${n} · ${fmtTemp(c.T)} · ЯЩИК ${Math.round(c.box)} КГ</div>
      <h2>${ppl.length ? ppl.length + ' чел.' : c.locked ? 'Закрыт' : 'Пусто'}</h2>`;
    if (ppl.length) {
      h += `<div class="lbl">ПЕРЕСЕЛИТЬ ВСЕХ В… · 20 МИН · НАСТРОЕНИЕ −8</div><div class="btn-grid" style="grid-template-columns:repeat(5,1fr)">`;
      for (const t of targets) h += `<button class="btn" data-act="move-all" data-from="${n}" data-to="${t.n}" style="min-height:40px">${t.n}<small>${carPeople(S, t.n).length}</small></button>`;
      h += `</div>`;
    }
    h += `<div class="btn-grid">`;
    if (!ppl.length && !c.locked) h += `<button class="btn" data-act="lock-car" data-n="${n}">ЗАКРЫТЬ ВАГОН<small>гасит котёл · 5 мин</small></button>`;
    if (c.locked) h += `<button class="btn" data-act="unlock-car" data-n="${n}">ОТКРЫТЬ ВАГОН<small>5 мин</small></button>`;
    if (c.box >= 10) h += `<button class="btn" data-act="collect" data-n="${n}">ЯЩИК → ТЕНДЕР<small>+${Math.round(c.box)} кг · 10 мин</small></button>`;
    h += `<button class="btn" data-act="car-open" data-n="${n}">СХЕМА ВАГОНА<small>котёл, окна</small></button></div>`;
    if (ppl.length) h += `<div class="plist">${ppl.sort((a, b) => a.seat - b.seat).map(personRow).join('')}</div>`;
    return h;
  };
}

// --- маршрут ---
function routeTable() {
  // остановки по маршруту: расстояние, время прибытия, уголь
  const rows = [];
  let dist = 0, hours = 0, coal = S.tender, emptyAt = null;
  const prof = [];
  let elev = 0;
  for (const L of routeLegs(S)) {
    for (let d = L.from; d < L.to; d += 0.5) {
      const st = Math.min(0.5, L.to - d);
      const g = gradeOn(L.e, L.dir, d);
      const need = burnPerKm(g, S.mode, false) * st;
      if (emptyAt === null) { if (coal < need) emptyAt = dist; else coal -= need; }
      hours += st / speedKmh(g, S.mode, false);
      dist += st;
      elev += g * st;
      if (prof.length === 0 || dist - prof[prof.length - 1][0] >= 2) prof.push([dist, elev]);
    }
    const n = WORLD.nodes[L.node];
    rows.push({ n, dist, eta: S.t + hours * 60 });
    hours += (n.stop || 0) / 60;
    if (n.stop && emptyAt === null) coal += 0;
  }
  return { rows, dist, prof, emptyAt };
}

function profileSVG(rt) {
  const W = 340, H = 110, P = rt.prof;
  if (P.length < 2) return '';
  const minE = Math.min(...P.map((p) => p[1])), maxE = Math.max(...P.map((p) => p[1]), minE + 50);
  const x = (d) => 4 + (d / rt.dist) * (W - 8);
  const y = (e) => H - 22 - ((e - minE) / (maxE - minE)) * (H - 40);
  let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;margin:6px 0 10px">`;
  s += `<path d="M${x(0)} ${H - 18} ` + P.map((p) => `L${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(' ') + ` L${x(rt.dist)} ${H - 18} Z" fill="#f5b13d22"/>`;
  s += `<path d="` + P.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(' ') + `" stroke="#f5b13d" stroke-width="1.6" fill="none"/>`;
  for (const r of rt.rows) {
    if (!r.n.stop && r.n.id !== WORLD.meet && r.n.id !== WORLD.dest) continue;
    const col = r.n.id === WORLD.meet && (hasRec(S, 'p_map') || hasRec(S, 'c_shubin')) ? '#ff5a3c' : '#dfe6f2';
    s += `<rect x="${x(r.dist) - 3}" y="${H - 15}" width="6" height="6" fill="#14213d" stroke="${col}" stroke-width="1.2"/>`;
  }
  if (rt.emptyAt !== null) {
    s += `<line x1="${x(rt.emptyAt)}" y1="6" x2="${x(rt.emptyAt)}" y2="${H - 18}" stroke="#ff5a3c" stroke-dasharray="3 3"/>`;
    s += `<text x="${Math.min(W - 70, x(rt.emptyAt) + 4)}" y="14" font-size="9" fill="#ff5a3c" font-family="ui-monospace,Menlo,monospace">УГОЛЬ КОНЧИТСЯ</text>`;
  }
  s += `<text x="4" y="${H - 1}" font-size="9" fill="#7f8cab" font-family="ui-monospace,Menlo,monospace">СЕЙЧАС</text>`;
  s += `<text x="${W - 4}" y="${H - 1}" text-anchor="end" font-size="9" fill="#7f8cab" font-family="ui-monospace,Menlo,monospace">${Math.round(rt.dist)} КМ</text>`;
  return s + `</svg>`;
}

function mapScreen() {
  const ns = nextStop(S);
  const nr = nearestRadio(S);
  const rt = routeTable();
  const known = hasRec(S, 'p_map') || hasRec(S, 'c_shubin');
  let h = `<div class="scr-head"><span class="num">04</span> · МАРШРУТ</div>
    <div class="stats" style="grid-template-columns:1fr 1fr">
      <div><div class="lbl">ТЕМПЕРАТУРА ВОЗДУХА</div><div class="big cold" style="font-size:40px">${fmtTemp(outsideTemp(S.t, S))}</div>
      <div class="lbl" style="margin-top:6px">ДО СТАНЦИИ</div><div class="big amber" style="font-size:40px">${Math.round(ns.dist)} КМ</div>
      <div class="lbl">${esc(ns.node.name.toUpperCase())}</div></div>
      <div><div class="lbl">ПЕШКОМ ПО СУГРОБАМ</div><div class="big" style="font-size:40px">${fmtH(nr.d * 1.3 / 2.5)}</div><div class="lbl">ДО ${esc(nr.n.name.toUpperCase())}</div>
      <div class="lbl" style="margin-top:6px">СКОРОСТЬ</div><div class="big" style="font-size:30px">${Math.round(S.speed)} КМ/Ч</div></div>
    </div>
    <div class="btn-grid"><button class="btn primary" data-act="map-world">КАРТА МИРА<small>выбрать путь</small></button>
    ${S.wp != null ? `<button class="btn" data-act="route-reset">КРАТЧАЙШИЙ ПУТЬ<small>убрать заезд</small></button>` : `<button class="btn" data-act="map-follow">К ПОЕЗДУ<small>вид сверху</small></button>`}</div>
    <div class="lbl">ПРОФИЛЬ ПУТИ ДО УСТЬ-КУТЫ · ${Math.round(rt.dist)} КМ${S.wp != null ? ' · ЧЕРЕЗ ' + esc(WORLD.nodes[S.wp].name.toUpperCase()) : ''}</div>
    ${profileSVG(rt)}
    <div class="lbl">СТАНЦИИ ПО МАРШРУТУ</div><div class="plist">`;
  for (const r of rt.rows) {
    const n = r.n;
    if (n.type === 'разъезд' && n.id !== WORLD.dest) continue;
    const coal = S.stationCoal[n.id] ?? 0;
    const red = n.id === WORLD.meet && known;
    h += `<button class="prow" data-act="station" data-id="${n.id}">
      <div style="width:12px;height:12px;border:2px solid ${red ? 'var(--alarm)' : n.stop ? 'var(--amber)' : 'var(--dim)'};flex:none;${n.type === 'узловая' ? 'background:var(--amber)' : ''}"></div>
      <div><div class="nm ${red ? 'alarm' : ''}">${esc(n.name)}${red ? ' · САНИ?' : ''}</div>
      <div class="sub">${n.type} · ${Math.round(r.dist)} км · ≈ ${hm(r.eta)}${n.stop ? ' · стоянка ' + n.stop + ' мин' : ''}</div></div>
      <div class="sub" style="margin-left:auto;text-align:right">${coal ? '<span class="amber">УГОЛЬ ' + fmtKg(coal) + '</span>' : ''}${n.radio ? '<br>СВЯЗЬ' : ''}</div>
    </button>`;
  }
  return h + `</div>`;
}

function stationSheet(id) {
  return () => {
    const n = WORLD.nodes[id];
    const coal = S.stationCoal[n.id] ?? 0;
    const onRoute = S.route.includes(id);
    // сравнение маршрутов
    const cur = routeLength(S);
    let alt = null;
    if (!onRoute && id !== WORLD.dest) {
      const saveR = S.route.slice(), saveW = S.wp;
      planRoute(S, id);
      alt = { len: routeLength(S), fc: forecast(S) };
      S.route = saveR; S.wp = saveW;
    }
    const known = hasRec(S, 'p_map') || hasRec(S, 'c_shubin');
    return `<button class="close" data-act="close">ЗАКРЫТЬ ✕</button>
      <div class="lbl">КМ ${n.km} · ${n.type.toUpperCase()}${onRoute ? ' · <span class="amber">ПО МАРШРУТУ</span>' : ''}</div>
      <h2 class="${n.id === WORLD.meet && known ? 'alarm' : ''}">${esc(n.name)}</h2>
      <div class="fields">
        <div><span class="lbl">УГОЛЬ НА СТАНЦИИ</span>${coal ? fmtKg(coal) : 'нет'}</div>
        <div><span class="lbl">СТОЯНКА</span>${n.stop ? n.stop + ' мин' : 'без остановки'}</div>
        <div><span class="lbl">СВЯЗЬ</span>${n.radio ? 'есть' : 'нет'}</div>
        ${n.id === WORLD.meet && known ? '<div class="alarm">Здесь банду ждут сани.</div>' : ''}
      </div>
      ${alt ? `<p>Заезд через эту станцию: путь до Усть-Куты <b class="amber">${Math.round(alt.len)} км</b> вместо ${Math.round(cur)} км, в пути ≈ ${fmtH(alt.fc.destHours)}. Угля в тендере ${alt.fc.enough ? 'хватит' : '<b class="alarm">не хватит</b>'} без дозаправки.</p>` : ''}
      <div class="btn-grid">
        ${alt ? `<button class="btn primary" data-act="route-via" data-id="${id}">ЕХАТЬ ЧЕРЕЗ НЕЁ<small>маршрут изменится</small></button>` : ''}
        ${S.wp != null ? `<button class="btn" data-act="route-reset">КРАТЧАЙШИЙ ПУТЬ<small>до Усть-Куты</small></button>` : ''}
        <button class="btn" data-act="show-node" data-id="${id}">ПОКАЗАТЬ НА КАРТЕ</button>
      </div>`;
  };
}

// --- блокнот ---
const KIND_LABEL = { report: 'РАПОРТ КОЧЕГАРА', journal: 'ЖУРНАЛ ПРОВОДНИКА', testimony: 'ПОКАЗАНИЕ', physical: 'УЛИКА', confession: 'ПРИЗНАНИЕ' };
function recSrc(r) {
  if (r.kind === 'testimony' && r.who) {
    const p = personById(S, r.who);
    return `ПОКАЗАНИЕ · ${p ? shortName(p).toUpperCase() : ''} · ${hm(r.t)}`;
  }
  return (KIND_LABEL[r.kind] || 'ЗАПИСЬ') + (r.kind === 'physical' || r.kind === 'confession' ? ' · ' + hm(r.t) : '');
}

function notesScreen() {
  let h = `<div class="scr-head"><span class="num">05</span> · БЛОКНОТ</div>
    <div class="tabs2"><button class="btn ${notesView === 'recs' ? 'primary' : ''}" data-act="nv" data-v="recs">ЗАПИСИ ${S.records.length}</button>
    <button class="btn ${notesView === 'case' ? 'primary' : ''}" data-act="nv" data-v="case">ДЕЛО${(S.marked || []).length ? ' · ⚑' + S.marked.length : ''}</button></div>`;
  if (notesView === 'case') return h + caseView();
  h += `<div class="linkbar"><button class="btn ${linkMode ? 'danger' : ''}" data-act="link">${linkMode ? `ВЫБЕРИ 2 ЗАПИСИ (${linkSel.length}/2) · ОТМЕНА` : '🧵 СВЯЗАТЬ НИТЬЮ'}</button><button class="btn ghost" data-act="hint" style="flex:0 0 auto">ПОДСКАЗКА</button></div>`;
  if (S.contras.length) {
    h += `<div class="grp">НИТКИ · ПРОТИВОРЕЧИЯ</div>`;
    for (const key of S.contras) {
      const [a, b] = key.split('|');
      const c = CONTRAS.find((x) => x.a === a && x.b === b);
      const p = personById(S, c.against);
      h += `<div class="contra"><b class="alarm">${esc(shortName(p))} лжёт</b><br>${esc(recText(S, a))}<br><span class="dim">⟷</span> ${esc(recText(S, b))}</div>`;
    }
  }
  const groups = [['report', 'РАПОРТЫ'], ['journal', 'ЖУРНАЛ ПРОВОДНИКА'], ['physical', 'УЛИКИ'], ['confession', 'ПРИЗНАНИЯ'], ['testimony', 'ПОКАЗАНИЯ']];
  if (!S.records.length) h += `<p class="dim">Пока пусто. Записи журнала проводника, рапорты и показания пассажиров будут появляться здесь сами.</p>`;
  for (const [k, name] of groups) {
    const list = S.records.filter((r) => r.kind === k);
    if (!list.length) continue;
    h += `<div class="grp">${name}</div>`;
    const sorted = k === 'testimony' ? list.slice().sort((a, b) => (a.who || '').localeCompare(b.who || '') || a.t - b.t) : list;
    for (const r of sorted) {
      h += `<button class="rec k-${r.kind} ${linkSel.includes(r.id) ? 'sel' : ''} ${r.t >= (S.seenUntil || 0) ? 'new' : ''}" data-act="rec" data-id="${r.id}"><span class="src">${esc(recSrc(r))}</span>${esc(r.text)}</button>`;
    }
  }
  return h;
}

function caseView() {
  const ids = new Set();
  for (const p of S.people) if (evidenceAgainst(S, p.id).length || p.detained) ids.add(p.id);
  const marked = (S.marked || []).map((id) => personById(S, id)).filter(Boolean);
  let h = '';
  // сомнительные пассажиры — помечены игроком
  h += `<div class="grp">⚑ СОМНИТЕЛЬНЫЕ · ${marked.length}</div>`;
  if (!marked.length) h += `<p class="dim">Пока никого. Открой досье пассажира и нажми «Пометить как сомнительного» — он появится здесь, даже если улик ещё нет.</p>`;
  for (const p of marked) {
    const ev = evidenceAgainst(S, p.id).length;
    h += `<div class="mrow"><button class="prow" data-act="person" data-id="${p.id}">
      <div class="ph">${portraitSVG(p)}</div>
      <div><div class="nm">${esc(fullName(p))}${p.detained ? '<span class="tag">ЗАДЕРЖАН</span>' : ''}${p.gone ? '<span class="tag">СБЕЖАЛ</span>' : ''}</div>
      <div class="sub">вагон ${p.car} · м. ${p.seat} · ${esc(p.marks.join(', '))}</div>
      <div class="sub">улик: <b class="${ev >= 2 ? 'amber' : ''}">${ev}</b> · помечен в ${hm(S.markedAt && S.markedAt[p.id] != null ? S.markedAt[p.id] : S.t)}</div></div></button>
      <button class="unmark" data-act="mark" data-id="${p.id}" aria-label="Снять пометку">✕</button></div>`;
  }
  h += `<div class="grp" style="margin-top:18px">УЛИКИ</div><p class="dim">Полиция в Усть-Куте осудит задержанного, только если против него минимум 2 улики. Задержание невиновного — штраф и статья в газете.</p>`;
  if (!ids.size) h += `<p class="dim">Улик пока нет.</p>`;
  for (const id of ids) {
    const p = personById(S, id);
    const ev = evidenceAgainst(S, id);
    h += `<button class="prow" data-act="person" data-id="${id}" style="margin-top:8px">
      <div class="ph">${portraitSVG(p)}</div>
      <div><div class="nm">${isMarked(id) ? '<span class="amber">⚑ </span>' : ''}${esc(fullName(p))}${p.detained ? '<span class="tag">ЗАДЕРЖАН</span>' : ''}${p.gone ? '<span class="tag">СБЕЖАЛ</span>' : ''}</div>
      <div class="sub">вагон ${p.car} · улик: <b class="${ev.length >= 2 ? 'amber' : ''}">${ev.length}</b></div></div></button>`;
    for (const e of ev) h += `<div class="contra" style="border-left-color:${e.type === 'contra' ? 'var(--alarm)' : 'var(--orange)'}">${esc(e.text)}</div>`;
  }
  return h;
}

function hintText() {
  for (const c of CONTRAS) {
    if (S.contras.includes(c.a + '|' + c.b)) continue;
    if (hasRec(S, c.a) && hasRec(S, c.b)) return `Сравни две записи: «${short2(recText(S, c.a))}» и «${short2(recText(S, c.b))}». Свяжи их нитью — или предъяви на допросе.`;
  }
  if (!S.flags.alert) return 'Пока всё спокойно. Изучи пассажиров на экране ЛЮДИ и следи за прогнозом угля — ночью может случиться что угодно. Можно ускорить время.';
  if (!hasRec(S, 'kravets_saw') && S.t >= T(3, 5)) return 'Кража была из ящика вагона 9. Опроси тех, кто там едет: «Кого видели ночью?», «Что слышали?».';
  if (!hasRec(S, 'sedov_where')) return 'Журнал проводника упоминает Седова из вагона 7. Спроси его, где он был ночью.';
  if (!hasRec(S, 'p_soot')) return 'Вор угля оставляет следы: сажа на руках, мокрая обувь. Осмотр занимает 2 минуты — но следы со временем пропадают.';
  if (!hasRec(S, 'ershov_where') && hasRec(S, 'matveev_saw')) return 'Матвеев видел пустую полку соседа. Спроси Ершова, где он был ночью.';
  if (!hasRec(S, 'p_map')) return 'Зачем им уголь? Сообщники часто везут с собой что-то важное. Обыск багажа (нужна улика) может многое объяснить.';
  if (!hasRec(S, 'shubin_know_sedov')) return 'С кем Седов курил в тамбуре в 23:30? Серый свитер, усы — посмотри приметы в досье. Спроси его, знает ли он Седова.';
  if (!hasRec(S, 'p_sable')) return 'Курьер везёт груз. Вес багажа, который не сходится с целью поездки, — повод присмотреться.';
  return 'Улик достаточно? Задерживай, пока не поздно, — и следи, чтобы поезд не встал у ' + S.meetKm + '-го километра. Можно и объехать это место другим маршрутом — посмотри карту.';
}
function short2(s) { return s.length > 70 ? s.slice(0, 68) + '…' : s; }

// ---------- досье ----------
function dossierSheet(pid, note) {
  return () => {
    const p = personById(S, pid);
    const car = S.cars[p.car - 1];
    const ev = evidenceAgainst(S, pid);
    const walk = p.detained ? Math.abs(S.playerCar - 1) * 3 : Math.abs(S.playerCar - p.car) * 3;
    const cd = (S.interrogated[pid] || 0) > S.t;
    const night = isNight();
    let h = `<button class="close" data-act="close">ЗАКРЫТЬ ✕</button>
      <div class="lbl">ДОСЬЕ ${isMarked(pid) ? '· <span class="amber">⚑ СОМНИТЕЛЬНЫЙ</span> ' : ''}${p.detained ? '· <span class="alarm">ЗАДЕРЖАН</span>' : ''}${p.broken ? ' · <span class="amber">ПРИЗНАЛСЯ</span>' : ''}</div>
      <h2>${esc(p.last)}</h2>
      <div class="dossier">
        <div class="ph">${portraitSVG(p, { cold: car.T < 10 ? Math.min(1, (10 - car.T) / 15) : 0 })}</div>
        <div class="fields">
          <div><span class="lbl">ФИО</span>${esc(fullName(p))}</div>
          <div><span class="lbl">ПОЛ, ВОЗРАСТ</span>${p.sex}, ${p.age}</div>
          <div><span class="lbl">РОДИЛСЯ</span>${esc(p.birth)}, ${esc(p.birthplace)}</div>
          <div><span class="lbl">ПРОФЕССИЯ</span>${esc(p.job)}</div>
        </div>
      </div>
      <div class="fields" style="margin-top:10px">
        <div><span class="lbl">БИЛЕТ</span>Вагон ${p.car}, место ${p.seat} · ${esc(p.from)} → ${esc(p.to)}</div>
        <div><span class="lbl">БАГАЖ</span>${esc(p.bags)}</div>
        <div><span class="lbl">ЦЕЛЬ ПОЕЗДКИ (В АНКЕТЕ)</span>«${esc(p.purpose)}»</div>
        <div><span class="lbl">ОСОБЫЕ ПРИМЕТЫ</span>${esc(p.marks.join(', '))}</div>
        ${S.interrogated[pid] ? `<div><span class="lbl">ХАРАКТЕР</span>${esc(p.traits.join(', '))}</div>` : ''}
        <div><span class="lbl">ЗДОРОВЬЕ · НАСТРОЕНИЕ</span>${Math.round(p.health)}% · ${Math.round(p.mood)}%</div>
        ${ev.length ? `<div><span class="lbl">УЛИКИ ПРОТИВ</span><b class="${ev.length >= 2 ? 'amber' : ''}">${ev.length}</b> — см. блокнот → дело</div>` : ''}
      </div>`;
    if (note) h += `<div class="chat"><div class="a">${esc(note)}</div></div>`;
    if (!p.alive) return h + `<p class="alarm">Погиб(ла) от холода.</p>`;
    if (p.gone) return h + `<p class="alarm">Покинул(а) поезд.</p>`;
    h += `<div class="btn-grid">
      <button class="btn primary" data-act="interrogate" data-id="${pid}" ${cd ? 'disabled' : ''}>ДОПРОСИТЬ<small>${cd ? 'отдыхает до ' + hm(S.interrogated[pid]) : 15 + walk + ' мин' + (night && !p.detained ? ' · разбудить' : '')}</small></button>
      <button class="btn" data-act="inspect" data-id="${pid}">ОСМОТРЕТЬ<small>руки, обувь · ${2 + walk} мин</small></button>
      <button class="btn" data-act="search" data-id="${pid}" ${p.searched ? 'disabled' : ''}>ОБЫСКАТЬ БАГАЖ<small>${p.searched ? 'уже обыскан' : (20 + walk) + ' мин' + (ev.length ? '' : ' · без улик — жалоба')}</small></button>
      ${p.detained ? `<button class="btn" disabled>В СЛУЖЕБНОМ КУПЕ<small>сдадим полиции</small></button>` : `<button class="btn danger" data-act="detain" data-id="${pid}">ЗАДЕРЖАТЬ<small>улик: ${ev.length} · ${5 + walk} мин</small></button>`}
      <button class="btn wide ${isMarked(pid) ? 'mark-on' : ''}" data-act="mark" data-id="${pid}">${isMarked(pid) ? '⚑ ПОМЕЧЕН КАК СОМНИТЕЛЬНЫЙ' : '⚐ ПОМЕТИТЬ КАК СОМНИТЕЛЬНОГО'}<small>${isMarked(pid) ? 'нажми, чтобы снять пометку' : 'появится в блокноте → дело · 0 мин'}</small></button>
    </div>`;
    return h;
  };
}
function isNight() { const m = S.t % DAY; return m >= 23 * 60 || m < 6 * 60; }

function openDossier(pid, note) {
  S.seen = S.seen || [];
  if (!S.seen.includes(pid)) S.seen.push(pid);
  if (modalRender) { modalRender = dossierSheet(pid, note); IQ = null; rerenderModal(); $('#sheet').scrollTop = 0; }
  else openModal(dossierSheet(pid, note));
}

// ---------- допрос ----------
function startInterrogation(pid) {
  const p = personById(S, pid);
  const walk = p.detained ? walkTo(1) : walkTo(p.car, p);
  act(15 + walk, () => {
    if (isNight() && !p.detained) p.mood = Math.max(0, p.mood - 8);
  });
  if (S.ended) return;
  IQ = { pid, log: [], patience: patienceOf(p), menu: null };
  IQ.log.push({ sys: `ДОПРОС · ${hm(S.t)} · ${isNight() ? 'НОЧЬ, РАЗБУДИЛИ' : 'ВАГОН ' + p.car}` });
  modalRender = interrogationSheet;
  $('#modal').classList.remove('hidden');
  rerenderModal();
}

function interrogationSheet() {
  const p = personById(S, IQ.pid);
  const pips = Array.from({ length: patienceOf(p) + 2 }, (_, i) => `<i class="${i < IQ.patience ? '' : 'off'}"></i>`).slice(0, Math.max(IQ.patience, patienceOf(p))).join('');
  let h = `<button class="close" data-act="end-iq">ЗАКОНЧИТЬ ✕</button>
    <div class="lbl">ДОПРОС · ТЕРПЕНИЕ<span class="pips">${pips}</span></div>
    <div style="display:flex;gap:10px;align-items:center;margin-top:8px">
      <div style="width:60px;height:70px;border-radius:8px;overflow:hidden;flex:none">${portraitSVG(p)}</div>
      <div><h2 style="margin:0;font-size:24px">${esc(fullName(p))}</h2><div class="lbl">ВАГОН ${p.car} · М. ${p.seat} · ${esc(p.marks[0].toUpperCase())}</div></div>
    </div>
    <div class="chat">`;
  for (const m of IQ.log) {
    if (m.sys) h += `<div class="sys ${m.red ? 'red' : ''}">${esc(m.sys)}</div>`;
    if (m.q) h += `<div class="q">${esc(m.q)}</div>`;
    if (m.a) h += `<div class="a">${esc(m.a)}</div>`;
  }
  h += `</div>`;
  if (IQ.patience <= 0) {
    h += `<p class="dim">${esc(p.first)} больше не хочет разговаривать. Можно вернуться через час.</p><button class="btn primary" style="width:100%" data-act="end-iq">ЗАКОНЧИТЬ ДОПРОС</button>`;
    return h;
  }
  h += `<div class="qbtns">`;
  if (IQ.menu === 'present') {
    h += `<div class="lbl">ПРЕДЪЯВИТЬ…</div>`;
    const list = S.records.filter((r) => r.who !== p.id);
    if (!list.length) h += `<p class="dim">Нечего предъявить.</p>`;
    for (const r of list) h += `<button class="btn" data-act="pr" data-id="${r.id}"><span><span class="lbl" style="display:block">${esc(recSrc(r))}</span>${esc(short2(r.text))}</span></button>`;
    h += `<button class="btn ghost" data-act="iq-menu" data-m="">‹ НАЗАД</button>`;
  } else if (IQ.menu === 'know') {
    h += `<div class="lbl">ЗНАЕТЕ ЛИ ВЫ…</div>`;
    const list = (S.seen || []).filter((id) => id !== p.id).map((id) => personById(S, id));
    if (!list.length) h += `<p class="dim">Сначала открой досье других пассажиров.</p>`;
    for (const o of list) h += `<button class="btn" data-act="q" data-q="know" data-arg="${o.id}">${esc(fullName(o))} <small>в. ${o.car}</small></button>`;
    h += `<button class="btn ghost" data-act="iq-menu" data-m="">‹ НАЗАД</button>`;
  } else {
    h += `<button class="btn" data-act="q" data-q="about">Расскажите о себе.</button>`;
    h += `<button class="btn" data-act="q" data-q="purpose">Зачем едете в Усть-Куту?</button>`;
    if (nightQuestionsOpen(S)) {
      h += `<button class="btn" data-act="q" data-q="where">Где вы были ночью?</button>`;
      h += `<button class="btn" data-act="q" data-q="saw">Кого видели ночью?</button>`;
      h += `<button class="btn" data-act="q" data-q="heard">Что слышали ночью?</button>`;
    }
    h += `<button class="btn" data-act="iq-menu" data-m="know">Знаете ли вы… ›</button>`;
    h += `<button class="btn" data-act="iq-menu" data-m="present" style="border-color:var(--amber);color:var(--amber)">Предъявить… ›</button>`;
  }
  h += `</div>`;
  return h;
}

const Q_TEXT = { about: 'Расскажите о себе.', purpose: 'Зачем едете в Усть-Куту?', where: 'Где вы были ночью?', saw: 'Кого видели ночью?', heard: 'Что слышали ночью?' };

function doAsk(q, arg) {
  const p = personById(S, IQ.pid);
  const qt = q === 'know' ? `Знаете ${fullName(personById(S, arg))}?` : Q_TEXT[q];
  const r = ask(S, p, q, arg);
  IQ.patience -= 1;
  IQ.log.push({ q: qt, a: r.text });
  if (r.recs.length) { IQ.log.push({ sys: 'ЗАПИСАНО В БЛОКНОТ' }); S.unread = (S.unread || 0) + r.recs.length; }
  IQ.menu = null;
  afterIq();
}

function doPresent(recId) {
  const p = personById(S, IQ.pid);
  const r = present(S, p, recId);
  IQ.patience -= 1;
  IQ.log.push({ q: 'Предъявляю: ' + short2(recText(S, recId)), a: r.text });
  for (const c of r.contras) IQ.log.push({ sys: `ПРОТИВОРЕЧИЕ! УЛИКА ПРОТИВ: ${shortName(personById(S, c.against)).toUpperCase()}`, red: true });
  if (r.contras.length) Sound.sting('good');
  if (r.broke) { IQ.log.push({ sys: 'ПРИЗНАНИЕ ЗАПИСАНО', red: true }); IQ.patience = Math.max(IQ.patience, 1); Sound.sting('good'); }
  else if (r.recs.length) IQ.log.push({ sys: 'НОВАЯ ВЕРСИЯ ЗАПИСАНА — СМЕНА ПОКАЗАНИЙ' });
  S.unread = (S.unread || 0) + r.recs.length;
  IQ.menu = null;
  afterIq();
}

function afterIq() {
  if (IQ.patience <= 0) S.interrogated[IQ.pid] = S.t + 60;
  else S.interrogated[IQ.pid] = S.interrogated[IQ.pid] || 1;
  rerenderModal();
  const sh = $('#sheet');
  sh.scrollTop = sh.scrollHeight;
  save();
}

// ---------- стоянка в тайге ----------
function survivalSheet() {
  const live = S.cars.filter((c) => carPeople(S, c.n).length);
  const nr = nearestRadio(S);
  const foot = nr.d * 1.3 / 2.5;
  const sig = hasSignal(S);
  return `<button class="close" data-act="close">ЗАКРЫТЬ ✕</button>
    <div class="lbl">СТОЯНКА В ТАЙГЕ · КМ ${Math.floor(S.odo)} · ${fmtTemp(outsideTemp(S.t, S))}</div>
    <h2>Поезд встал</h2>
    <p>Тендер пуст — тяги нет. Котлы вагонов работают без электричества, на угле из ящиков. До Усть-Куты по маршруту ${Math.round(routeLength(S))} км.</p>
    ${S.residue > 0 ? `<button class="btn" style="width:100%;margin-bottom:8px" data-act="surv-fire"><span><b class="amber">01 · ОГОНЬ</b><br><small>Выгрести остатки из тендера (${S.residue} кг) в ящики жилых вагонов · 30 мин</small></span></button>` : ''}
    <button class="btn" style="width:100%;margin-bottom:8px" data-act="surv-people"><span><b class="amber">02 · ЛЮДИ</b><br><small>Переселить всех в несколько вагонов (сейчас жилых: ${live.length}), пустые закрыть, их уголь — в тендер или соседям</small></span></button>
    <button class="btn" style="width:100%;margin-bottom:8px" data-act="surv-windows"><span><b class="amber">03 · ОКНА</b><br><small>Завесить окна одеялами во всех жилых вагонах: −28% потерь тепла, темно · 40 мин</small></span></button>
    ${S.help ? `<p class="dim">Помощь в пути. Ожидается около ${hm(S.help.eta)}.</p>` : `
    <button class="btn" style="width:100%;margin-bottom:8px" data-act="surv-help"><span><b class="amber">04 · ПОМОЩЬ</b><br><small>${sig ? 'Есть связь — вызвать помощь по рации (≈3 ч)' : `Нет сигнала. Послать человека пешком до станции ${esc(nr.n.name)}: ${Math.round(nr.d * 1.3)} км по сугробам ≈ ${fmtH(foot)}. Кого?`}</small></span></button>`}
    <p class="dim">Если хватит угля в ящиках пустых вагонов — переложи его в тендер и дотяни до станции.</p>`;
}

function helpSheet() {
  const cands = S.people.filter((p) => p.alive && !p.detained && !p.gone && p.age >= 18 && p.age <= 60 && p.health > 60);
  let h = `<button class="close" data-act="survival">‹ НАЗАД</button>
    <div class="lbl">04 · ПОМОЩЬ</div><h2>Кого послать?</h2>
    <p class="dim">Пешком по сугробам до ближайшей станции со связью. Если послать не того — он уйдёт к своим, а помощь не придёт.</p><div class="plist">`;
  for (const p of cands) h += personRow(p).replace('data-act="person"', 'data-act="send"');
  return h + `</div>`;
}

// ---------- конец рейса ----------
function endSheet() {
  if (S.result && S.result.fail) {
    return `<div class="lbl">РЕЙС ПРОВАЛЕН · ${hm(S.t)}</div><h2 class="alarm">Человек погиб</h2>
      <p>${esc(S.result.fail)}</p><p class="dim">Ниже +10° в вагоне люди теряют здоровье. Дети и пожилые — быстрее. Следи за углём в ящиках и переселяй людей в тёплые вагоны.</p>
      <button class="btn primary" style="width:100%" data-act="new-game">НОВЫЙ РЕЙС</button>`;
  }
  const r = evaluate(S);
  let h = `<div class="lbl">ПРИБЫТИЕ · УСТЬ-КУТА · ${hm(S.t)}</div><h2>${r.fail ? 'Рейс провален' : 'Рейс окончен'}</h2>
    <div class="stars">${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}</div>`;
  if (r.fail) h += `<p class="alarm">${esc(r.fail)}</p>`;
  for (const [a, b, m] of r.lines) h += `<div class="res-line"><span><b>${esc(a)}</b><br><span class="dim">${esc(b)}</span></span><b class="${m < 0 ? 'alarm' : m > 0 ? 'amber' : 'dim'}">${m > 0 ? '+' : ''}${m.toLocaleString('ru-RU')} ₽</b></div>`;
  h += `<div class="res-line" style="border:0"><b>ИТОГО</b><b class="amber" style="font-size:16px">${r.money.toLocaleString('ru-RU')} ₽</b></div>
    <p class="dim">Банда: Седов (вор угля), Лаптева (алиби), Шубин (курьер с соболем). Поймано с доказанной виной: ${r.caught} из 3.</p>
    <button class="btn primary" style="width:100%" data-act="new-game">НОВЫЙ РЕЙС</button>`;
  return h;
}

// ---------- обучение ----------
const HOW = [
  ['Рейс', 'Кедровый Лог → Усть-Кута, около 360 км тайги, ночь, до −43°. Ты — начальник поезда. Довези всех живыми и вовремя (по расписанию — 12:30).'],
  ['Карта', 'Мир большой: сеть путей, узловые станции, полустанки, разъезды. На вкладке ПОЕЗД двумя пальцами приближай и отдаляй. Кнопка ПОЕЗД держит камеру на составе, кнопка ОСМОТР отпускает её — тогда можно водить картой пальцем. Нажми на станцию, чтобы проложить маршрут через неё — например, за углём. Приблизь свой вагон до упора — увидишь пассажиров и купе сверху, а в вагоне играет радио.'],
  ['Уголь', 'Тендер локомотива (11 т) — на тягу. Кончится — поезд встанет. В каждом вагоне свой угольный ящик — на отопление. Можно переносить уголь вёдрами туда и обратно.'],
  ['Прогноз', 'Главные цифры наверху: УГОЛЬ НА ХОД и ДО КОНЦА. Если угля меньше, чем пути, цифра красная. Режим ЭКО тратит меньше угля, но едет медленнее.'],
  ['Время', 'Игра идёт сама: на ×1 игровая минута длится 3 секунды, есть ×4 и ×16. Каждое действие стоит времени: допрос — 15 мин, обыск — 20, проход через вагон — 3.'],
  ['Расследование', 'Ночью кто-то ворует уголь. Допрашивай, сверяй показания с журналом проводника, связывай противоречия нитью в блокноте или предъявляй их на допросе. Осматривай руки и обувь, обыскивай багаж. Для осуждения нужно 2 улики.'],
  ['Холод', 'Ниже +10° в вагоне люди теряют здоровье. Если кто-то погибнет — рейс провален. Пустые вагоны можно закрыть, а их уголь забрать.'],
];
function howSheet(i, startAfter) {
  return () => `<div class="lbl">КАК ИГРАТЬ · ${i + 1}/${HOW.length}</div><h2>${HOW[i][0]}</h2><p>${HOW[i][1]}</p>
    <div class="btn-grid">${i > 0 ? `<button class="btn" data-act="how" data-i="${i - 1}" data-s="${startAfter ? 1 : 0}">‹ НАЗАД</button>` : '<span></span>'}
    ${i < HOW.length - 1 ? `<button class="btn primary" data-act="how" data-i="${i + 1}" data-s="${startAfter ? 1 : 0}">ДАЛЕЕ ›</button>` : `<button class="btn primary" data-act="${startAfter ? 'start' : 'close'}">${startAfter ? 'В ПУТЬ' : 'ПОНЯТНО'}</button>`}</div>`;
}

// ---------- обработчик нажатий ----------
const ACTIONS = {
  close: () => closeModal(),
  tab: (d) => setTab(d.tab),
  'car-prev': () => { curCar = curCar > 1 ? curCar - 1 : CAR_COUNT; renderScreen(); },
  'car-next': () => { curCar = curCar < CAR_COUNT ? curCar + 1 : 1; renderScreen(); },
  'car-open': (d) => { curCar = +d.n; if (modalRender) closeModal(); setTab('car'); },
  heat: (d) => { const c = S.cars[d.n - 1]; c.heat = !c.heat; renderAll(); save(); },
  windows: (d) => {
    const c = S.cars[d.n - 1];
    act((c.windows ? 5 : 15) + walkTo(c.n), () => {
      c.windows = !c.windows;
      if (c.windows) carPeople(S, c.n).forEach((p) => (p.mood -= 5));
    });
  },
  'coal-in': (d) => {
    const c = S.cars[d.n - 1];
    act(10 + walkTo(c.n), () => { const k = Math.min(100, S.tender, BOX_MAX - c.box); S.tender -= k; c.box += k; });
  },
  'coal-out': (d) => {
    const c = S.cars[d.n - 1];
    act(10 + walkTo(c.n), () => { const k = Math.min(100, c.box); c.box -= k; S.tender += k; });
  },
  'inspect-car': (d) => {
    const n = +d.n;
    const r = act(40 + walkTo(n), () => inspectCar(S, n));
    if (r) toast(r.text, `ОСМОТР ВАГОНА ${n}`, !!(r.recs && r.recs.length));
    if (r && r.recs) S.unread = (S.unread || 0) + r.recs.length;
  },
  person: (d) => openDossier(d.id),
  pcar: (d) => openModal(peopleCarSheet(+d.n)),
  'move-all': (d) => {
    const from = +d.from, to = +d.to;
    act(20 + walkTo(from), () => {
      for (const p of carPeople(S, from)) { p.car = to; p.mood = Math.max(0, p.mood - 8); }
    });
    toast(`Пассажиры вагона ${from} переселены в вагон ${to}.`, 'ПРОВОДНИК');
    modalRender = peopleCarSheet(from); rerenderModal();
  },
  'lock-car': (d) => { const c = S.cars[d.n - 1]; act(5 + walkTo(c.n), () => { c.locked = true; c.heat = false; }); closeModal(); },
  'unlock-car': (d) => { const c = S.cars[d.n - 1]; act(5 + walkTo(c.n), () => { c.locked = false; }); closeModal(); },
  collect: (d) => {
    const c = S.cars[d.n - 1];
    act(10 + walkTo(c.n), () => { S.tender += c.box; c.box = 0; });
    toast(`Уголь из ящика вагона ${c.n} перенесён в тендер.`, 'КОЧЕГАР МИХАЛЫЧ');
    if (modalRender) { modalRender = peopleCarSheet(c.n); rerenderModal(); }
  },
  'collect-all': () => {
    const cars = S.cars.filter((c) => c.locked && c.box >= 10);
    let kg = 0;
    act(cars.length * 10, () => { for (const c of cars) { kg += c.box; S.tender += c.box; c.box = 0; } });
    toast(`Собрали ${Math.round(kg)} кг из закрытых вагонов в тендер.`, 'КОЧЕГАР МИХАЛЫЧ');
  },
  interrogate: (d) => startInterrogation(d.id),
  inspect: (d) => {
    const p = personById(S, d.id);
    const r = act(2 + walkTo(p.detained ? 1 : p.car, p), () => inspect(S, p));
    if (r.recs && r.recs.length) { S.unread = (S.unread || 0) + r.recs.length; Sound.sting('good'); }
    openDossier(p.id, 'Осмотр: ' + r.text);
  },
  search: (d) => {
    const p = personById(S, d.id);
    const basis = evidenceAgainst(S, p.id).length > 0;
    if (!basis && !d.ok) {
      modalRender = () => `<div class="lbl">ОБЫСК БЕЗ УЛИК</div><h2>Точно?</h2><p>Против ${esc(shortName(p))} нет ни одной улики. Пассажир напишет жалобу, вагон будет недоволен. Три жалобы за рейс — штраф от Управления дороги. Сейчас жалоб: ${S.complaints}.</p>
        <div class="btn-grid"><button class="btn" data-act="person" data-id="${p.id}">ОТМЕНА</button><button class="btn danger" data-act="search" data-id="${p.id}" data-ok="1">ОБЫСКАТЬ</button></div>`;
      rerenderModal();
      return;
    }
    const r = act(20 + walkTo(p.detained ? 1 : p.car, p), () => {
      p.searched = true;
      if (!basis) {
        S.complaints += 1;
        p.mood = Math.max(0, p.mood - 20);
        carPeople(S, p.car).forEach((o) => (o.mood = Math.max(0, o.mood - 5)));
      }
      return search(S, p);
    });
    if (r.recs && r.recs.length) { S.unread = (S.unread || 0) + r.recs.length; Sound.sting('good'); }
    if (!basis) toast(`${shortName(p)} пишет жалобу в Управление дороги. Жалоб за рейс: ${S.complaints}.`, 'ПРОВОДНИК', true);
    if (r.recs && r.recs.includes('p_map')) banner('КМ ' + S.meetKm);
    openDossier(p.id, 'Обыск: ' + r.text);
  },
  detain: (d) => {
    const p = personById(S, d.id);
    const ev = evidenceAgainst(S, p.id).length;
    if (!d.ok) {
      modalRender = () => `<div class="lbl">ЗАДЕРЖАНИЕ</div><h2>${esc(shortName(p))}</h2><p>Улик против: <b class="${ev >= 2 ? 'amber' : 'alarm'}">${ev}</b>. Задержанного запрут в служебном купе и сдадут транспортной полиции в Усть-Куте.</p>
        <p class="dim">Виновен и улик ≥ 2 — премия. Виновен, но улик мало — отпустят. Невиновен — штраф и статья в газете.</p>
        <div class="btn-grid"><button class="btn" data-act="person" data-id="${p.id}">ОТМЕНА</button><button class="btn danger" data-act="detain" data-id="${p.id}" data-ok="1">ЗАДЕРЖАТЬ</button></div>`;
      rerenderModal();
      return;
    }
    act(5 + walkTo(p.car, p), () => { p.detained = true; carPeople(S, p.car).forEach((o) => (o.mood = Math.max(0, o.mood - 3))); });
    banner('ЗАДЕРЖАН');
    toast(`${fullName(p)} задержан и заперт в служебном купе.`, 'НАЧАЛЬНИК ПОЕЗДА');
    openDossier(p.id);
  },
  'end-iq': () => { const pid = IQ.pid; IQ = null; openDossier(pid); },
  'iq-menu': (d) => { IQ.menu = d.m || null; rerenderModal(); },
  q: (d) => doAsk(d.q, d.arg),
  pr: (d) => doPresent(d.id),
  nv: (d) => { notesView = d.v; linkMode = false; linkSel = []; renderScreen(); },
  link: () => { linkMode = !linkMode; linkSel = []; renderScreen(); },
  rec: (d) => {
    if (!linkMode) return;
    if (linkSel.includes(d.id)) linkSel = linkSel.filter((x) => x !== d.id);
    else linkSel.push(d.id);
    if (linkSel.length === 2) {
      const r = linkRecords(S, linkSel[0], linkSel[1]);
      if (r && r.isNew) { toast(`Противоречие! Улика против: ${shortName(personById(S, r.c.against))}.`, 'БЛОКНОТ', true); Sound.sting('good'); }
      else if (r) toast('Эта нитка уже натянута.', 'БЛОКНОТ');
      else toast('Эти записи друг другу не противоречат.', 'БЛОКНОТ');
      linkSel = []; linkMode = false;
      save();
    }
    renderScreen();
  },
  hint: () => toast(hintText(), 'ПОДСКАЗКА'),
  'st-coal': () => {
    const st = S.stop; if (!st || st.node == null) return;
    st.until = Math.max(st.until, S.t + 31);
    act(30, () => {
      const left = S.stationCoal[st.node] ?? 0;
      const k = Math.min(800, left, Math.max(0, 11000 - S.tender));
      S.stationCoal[st.node] = left - k;
      S.tender += k;
      toast(`Погрузили ${k} кг. На станции осталось ${left - k} кг.`, 'КОЧЕГАР МИХАЛЫЧ');
    });
  },
  'st-wait': () => { if (S.stop) { S.stop.until += 30; renderAll(); } },
  'st-depart': () => { depart(S); handleEvents(); renderAll(); },
  'go-on': () => { S.stop = null; S.moving = true; toast('Поехали. Дотянем, если повезёт.', 'МАШИНИСТ'); closeModalIfSurvival(); renderAll(); },
  survival: () => { if (modalRender) { modalRender = survivalSheet; rerenderModal(); } else openModal(survivalSheet); },
  'surv-fire': () => {
    const live = S.cars.filter((c) => carPeople(S, c.n).length);
    act(30, () => {
      const per = S.residue / Math.max(1, live.length);
      for (const c of live) { c.box = Math.min(BOX_MAX + 100, c.box + per); c.heat = true; }
      S.residue = 0;
    });
    toast('Остатки угля разнесли по жилым вагонам.', 'КОЧЕГАР МИХАЛЫЧ');
  },
  'surv-people': () => { closeModal(); setTab('people'); },
  'surv-windows': () => {
    act(40, () => { for (const c of S.cars) if (carPeople(S, c.n).length && !c.windows) { c.windows = true; carPeople(S, c.n).forEach((p) => (p.mood -= 5)); } });
    toast('Окна завесили одеялами и матрасами. Темно, но теплее.', 'ПРОВОДНИК');
  },
  'surv-help': () => {
    if (hasSignal(S)) {
      S.help = { pid: null, eta: S.t + 180, fake: false, done: false };
      toast('Связались с Усть-Кутой. Вышлют маневровый с углём, ждать около трёх часов.', 'РАЦИЯ');
      renderAll(); rerenderModal();
      return;
    }
    modalRender = helpSheet; rerenderModal();
  },
  send: (d) => {
    const p = personById(S, d.id);
    const hours = nearestRadio(S).d * 1.3 / 2.5;
    S.help = { pid: p.id, eta: S.t + Math.round(hours * 60) + 60, fake: !!p.role, done: false };
    p.gone = true;
    toast(`${shortName(p)} ушёл пешком к ${nearestRadio(S).n.name}. Если дойдёт — помощь будет около ${hm(S.help.eta)}.`, 'НАЧАЛЬНИК ПОЕЗДА');
    modalRender = survivalSheet; rerenderModal(); renderAll(); save();
  },
  thermal: () => { thermal = !thermal; renderAll(); },
  export: () => exportSave(),
  'set-sound': () => { settings.sound = !settings.sound; Sound.init(); applySettings(); rerenderModal(); },
  'set-music': () => { settings.music = !settings.music; Sound.init(); applySettings(); rerenderModal(); },
  import: () => $('#file-import').click(),
  menu: () => { pause(); openModal(savesSheet); },
  'to-title': () => { save(); closeAllModals(); setMul(0); S = null; refreshTitle(); $('#title').classList.remove('hidden'); },
  mark: (d) => {
    S.marked = S.marked || []; S.markedAt = S.markedAt || {};
    const p = personById(S, d.id);
    if (isMarked(d.id)) { S.marked = S.marked.filter((x) => x !== d.id); delete S.markedAt[d.id]; toast(`${shortName(p)}: пометка снята.`, 'БЛОКНОТ'); }
    else { S.marked.push(d.id); S.markedAt[d.id] = S.t; S.seen = S.seen || []; if (!S.seen.includes(d.id)) S.seen.push(d.id); toast(`${shortName(p)} помечен как сомнительный — смотри блокнот → дело.`, 'БЛОКНОТ'); }
    save();
    if (modalRender && !IQ) rerenderModal();
    renderScreen();
  },
  station: (d) => openModalOrReplace(stationSheet(+d.id)),
  'route-via': (d) => { planRoute(S, +d.id); toast(`Новый маршрут: через ${WORLD.nodes[+d.id].name}.`, 'ДИСПЕТЧЕР'); closeModal(); save(); },
  'route-reset': () => { planRoute(S); toast('Маршрут: кратчайший до Усть-Куты.', 'ДИСПЕТЧЕР'); if (modalRender) closeModal(); else renderAll(); save(); },
  'show-node': (d) => { if (modalRender) closeModal(); setTab('train'); View.showNode(+d.id); },
  'map-world': () => { setTab('train'); View.world(); },
  'map-follow': () => { setTab('train'); View.follow(); },
  tambour: () => {
    act(5, () => { S.tamboursLocked = !S.tamboursLocked; });
    toast(S.tamboursLocked ? 'Тамбуры заперты. Курильщики недовольны.' : 'Тамбуры открыты.', 'ПРОВОДНИК');
  },
  'new-game': () => { closeAllModals(); newGame(); },
  start: () => { closeModal(); setMul(1); Sound.init(); },
  how: (d) => openModalOrReplace(howSheet(+d.i, d.s === '1')),
};

function closeModalIfSurvival() { if (modalRender === survivalSheet) closeModal(); }
function closeAllModals() { modalQueue.length = 0; modalRender = null; IQ = null; $('#modal').classList.add('hidden'); }
function openModalOrReplace(r) { if (modalRender) { modalRender = r; rerenderModal(); } else openModal(r); }

function setTab(t) {
  tab = t;
  document.querySelectorAll('.scr').forEach((s) => s.classList.toggle('on', s.id === 'scr-' + t));
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  if (t === 'notes') { S.unread = 0; }
  if (t !== 'notes') { S.seenUntil = S.t; }
  linkMode = false; linkSel = [];
  renderAll();
  const scr = $('#scr-' + t);
  if (scr) scr.scrollTop = 0;
  if (t === 'train') View.resize();
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && !el.disabled) {
    Sound.init();
    const fn = ACTIONS[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el.dataset); }
    return;
  }
  if (e.target.id === 'modal' && modalRender && !IQ && modalRender !== endSheet && !String(modalRender).includes('КАК ИГРАТЬ')) closeModal();
});
document.addEventListener('pointerdown', () => { touching = true; });
document.addEventListener('pointerup', () => { setTimeout(() => (touching = false), 60); });

$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setTab(b.dataset.tab); });
$('#time-seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { Sound.init(); setMul(+b.dataset.mul); } });
$('#mode-seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { S.mode = b.dataset.mode; renderAll(); save(); } });
$('#btn-thermal').addEventListener('click', () => ACTIONS.thermal());
$('#btn-tambour').addEventListener('click', () => ACTIONS.tambour());

// ---------- вид поезда ----------
const cv = $('#train-canvas');
View.init(cv);
View.onPerson = (pid) => openDossier(pid);
View.onCar = (n, inside) => {
  if (inside) {
    // перейти в другой вагон, не выходя из вида сверху
    const m = Math.abs(S.playerCar - n) * 3;
    act(m, () => { S.playerCar = n; S.chiefX = 0; });
    toast(`Начальник перешёл в вагон ${n}.`, 'НАЧАЛЬНИК ПОЕЗДА');
    return;
  }
  curCar = n; setTab('car');
};
View.onStation = (id) => openModal(stationSheet(id));
let DPR = Math.min(2, window.devicePixelRatio || 1);
const snow = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + 0.4, v: Math.random() * 0.5 + 0.5 }));
window.addEventListener('resize', () => resizeTitle());
function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
document.querySelectorAll('.zoom-tools').forEach((el) => el.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  ({ in: View.zoomIn, out: View.zoomOut, follow: View.follow, free: View.free })[b.dataset.z]();
  syncCamButtons();
}));
function syncCamButtons() {
  const f = View.cam.follow;
  document.querySelector('[data-z="follow"]').classList.toggle('on', f);
  document.querySelector('[data-z="free"]').classList.toggle('on', !f);
}

// ---------- титульный экран ----------
const tcv = $('#title-canvas');
const tctx = tcv.getContext('2d');
let TW = 0, TH = 0;
function resizeTitle() {
  const r = tcv.getBoundingClientRect();
  TW = r.width; TH = r.height;
  tcv.width = Math.round(TW * DPR); tcv.height = Math.round(TH * DPR);
}
function drawTitle(time) {
  if (!TW) { DPR = Math.min(2, window.devicePixelRatio || 1); resizeTitle(); }
  const c = tctx;
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.fillStyle = '#14213d'; c.fillRect(0, 0, TW, TH);
  const r = rng(9);
  for (let i = 0; i < 700; i++) {
    const x = r() * TW, y = r() * TH;
    c.fillStyle = '#0b1430'; c.beginPath(); c.arc(x, y, 2 + r() * 4, 0, 7); c.fill();
  }
  const x = TW * 0.5;
  c.strokeStyle = '#dfe6f2'; c.setLineDash([10, 6]); c.globalAlpha = 0.8;
  c.beginPath(); c.moveTo(x, 0); c.lineTo(x, TH); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
  const t = time / 1000;
  const y0 = TH * 0.12 + Math.sin(t * 0.3) * 4;
  c.shadowColor = '#f5b13d'; c.shadowBlur = 12;
  for (let i = 0; i < 14; i++) {
    c.fillStyle = i % 5 === 4 ? '#c98a2a' : '#f5b13d';
    roundRect(c, x - 5, y0 + i * 15, 10, 12, 2); c.fill();
  }
  c.shadowBlur = 0;
  c.strokeStyle = '#8fa0ff'; c.setLineDash([2, 5]);
  c.beginPath(); c.moveTo(x, y0); c.bezierCurveTo(x + 60, y0 - 40, x + 80, y0 - 60, TW * 0.82, TH * 0.06); c.stroke(); c.setLineDash([]);
  c.strokeStyle = '#dfe6f2'; c.strokeRect(TW * 0.82 - 7, TH * 0.06 - 7, 14, 14);
  c.fillStyle = '#dfe6f2'; c.fillRect(TW * 0.82 - 3, TH * 0.06 - 3, 6, 6);
  c.fillStyle = '#dfe6f2';
  for (const f of snow) { c.globalAlpha = 0.6; c.beginPath(); c.arc(f.x * TW, ((f.y + t * 0.03 * f.v) % 1) * TH, f.r, 0, 7); c.fill(); }
  c.globalAlpha = 1;
}

// ---------- цикл ----------
function loop(ts) {
  requestAnimationFrame(loop);
  try { frame(ts); } catch (e) { console.error(e); }
}
function frame(ts) {
  const dt = lastTs ? Math.min(0.25, (ts - lastTs) / 1000) : 0;
  lastTs = ts;
  const titleOn = !$('#title').classList.contains('hidden');
  if (titleOn) {
    drawTitle(ts);
  } else if (S) {
    if (isRunning()) {
      acc += (dt * S.mul) / TIME_SCALE;
      let steps = 0;
      while (acc >= 1 && steps < 40) {
        acc -= 1; steps++;
        stepMinute(S);
        if (S.events.length) { handleEvents(); if (!isRunning()) { acc = 0; break; } }
      }
    }
    if (ts - lastHud > 120) {
      lastHud = ts;
      FC = FC && ts - (FC._ts || 0) < 500 ? FC : Object.assign(forecast(S), { _ts: ts });
      renderHud(isRunning() ? acc : 0);
      renderStrip();
      if (tab === 'train') { renderTrainForecast(); syncCamButtons(); }
    }
    if (isRunning() && ts - lastScr > 1000 && tab !== 'train' && tab !== 'notes' && !touching) {
      lastScr = ts;
      const scr = $('#scr-' + tab);
      const st = scr.scrollTop;
      renderScreen();
      scr.scrollTop = st;
    }
    if (tab === 'train') {
      const extra = isRunning() && S.moving && !S.stop ? (S.speed / 60) * acc : 0;
      View.draw(ts, extra);
    }
    Sound.update(S, isRunning());
    Sound.music.update(musicLevel());
    if (ts - (S._saved || 0) > 5000) { S._saved = ts; save(); }
  }
}

// ---------- музыка и настройки звука ----------
// музыка «радио в купе» слышна, когда камера подлетает к вагону, и громче всего внутри
function musicLevel() {
  if (!S || tab !== 'train' || !$('#title').classList.contains('hidden') || document.hidden) return 0;
  const z = View.cam.z;
  return Math.max(0, Math.min(1, (Math.log(z) - Math.log(2500)) / (Math.log(9000) - Math.log(2500))));
}
const SETTINGS_KEY = 'ugol_settings';
const settings = (() => {
  try { const v = JSON.parse(localStorage.getItem(SETTINGS_KEY)); if (v && typeof v === 'object') return { sound: v.sound !== false, music: v.music !== false }; } catch (e) { /* */ }
  return { sound: true, music: true };
})();
function applySettings() {
  Sound.on = settings.sound;
  if (Sound.master) Sound.master.gain.value = settings.sound ? 0.8 : 0;
  Sound.music.on = settings.music;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* */ }
}
applySettings();
document.addEventListener('visibilitychange', () => {
  if (!Sound.ctx) return;
  if (document.hidden) Sound.ctx.suspend(); else Sound.ctx.resume();
});

// ---------- старт ----------
function newGame() {
  clearSave();
  S = newState((Date.now() % 1e9) | 0);
  buildCase(S);
  View.cam.init = false; View.cam.follow = true; View.cam.tz = View.cam.z = 1800;
  S.residue = 250;
  S.seen = [];
  thermal = false; curCar = 7; notesView = 'recs';
  $('#banner').classList.remove('show'); $('#toasts').innerHTML = '';
  $('#title').classList.add('hidden');
  setTab('train');
  setMul(0);
  openModal(howSheet(0, true));
}
function continueGame(s) {
  S = s;
  loadWorld(S);
  View.cam.init = false; View.cam.follow = true;
  S.events = S.events || [];
  $('#title').classList.add('hidden');
  setTab('train');
  setMul(0);
  toast('Рейс продолжается. Нажми ×1, чтобы пустить время.', 'НАЧАЛЬНИК ПОЕЗДА');
}

function refreshTitle() {
  const saved = loadSave();
  $('#btn-continue').hidden = !saved;
  $('#btn-continue').onclick = () => {
    Sound.init();
    const r = loadSave();
    if (!r) { refreshTitle(); return; }
    continueGame(r.state);
    if (r.restored) toast('Основное сохранение было повреждено — рейс восстановлен из резервной копии.', 'СОХРАНЕНИЕ', true);
  };
}
refreshTitle();
$('#btn-new').onclick = () => {
  Sound.init();
  if (loadSave()) {
    openModal(() => `<div class="lbl">НОВЫЙ РЕЙС</div><h2>Начать заново?</h2>
      <p>Текущий рейс будет удалён с устройства. Можно сначала скачать его копию в файл.</p>
      <div class="btn-grid"><button class="btn" data-act="export">СКАЧАТЬ КОПИЮ</button><button class="btn danger" data-act="new-game">НАЧАТЬ ЗАНОВО</button>
      <button class="btn ghost wide" data-act="close">ОТМЕНА</button></div>`);
    return;
  }
  newGame();
};
$('#btn-saves').onclick = () => openModal(savesSheet);
$('#file-import').addEventListener('change', (e) => { importSave(e.target.files[0]); e.target.value = ''; });
$('#btn-how').onclick = () => { openModal(howSheet(0, false)); };

document.addEventListener('visibilitychange', () => { if (document.hidden && S) { save(); if (!S.ended) setMul(0); } });
window.addEventListener('pagehide', () => { if (S) save(); });
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ---------- офлайн: service worker хранит игру на устройстве ----------
function offlineState(text, ok) {
  const el = $('#offline-state');
  if (el) { el.textContent = text; el.style.color = ok ? 'var(--good)' : ''; el.style.marginTop = '6px'; }
}
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const ready = () => offlineState('✓ ИГРА СОХРАНЕНА — РАБОТАЕТ БЕЗ ИНТЕРНЕТА', true);
    if (navigator.serviceWorker.controller) ready();
    else { offlineState('СОХРАНЯЮ ИГРУ ДЛЯ ОФЛАЙНА…'); navigator.serviceWorker.addEventListener('controllerchange', ready); }
    void reg;
  }).catch(() => offlineState('ОФЛАЙН-РЕЖИМ НЕДОСТУПЕН'));
} else if (location.protocol === 'http:') {
  offlineState('ОФЛАЙН ВКЛЮЧИТСЯ ПО HTTPS-АДРЕСУ');
}
requestAnimationFrame(loop);
