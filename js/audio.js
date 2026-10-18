// «Уголь» — звук: стук колёс, ветер, часы. Всё синтезируется, без файлов.
'use strict';

const Sound = {
  ctx: null, on: true, wind: null, windGain: null, nextClack: 0, nextTick: 0, master: null,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.on ? 0.8 : 0;
    this.master.connect(ctx.destination);
    // буфер шума
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    // ветер
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.7;
    this.windFilter = bp;
    const g = ctx.createGain(); g.gain.value = 0.05;
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start();
    this.windGain = g;
    Music.init(ctx, this.master);
  },

  toggle() {
    this.on = !this.on;
    if (this.master) this.master.gain.value = this.on ? 0.8 : 0;
    return this.on;
  },

  burst(time, freq, dur, vol) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(time, Math.random()); src.stop(time + dur + 0.02);
  },

  tickSound(time) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'square'; o.frequency.value = 2200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
    o.connect(g); g.connect(this.master);
    o.start(time); o.stop(time + 0.04);
  },

  sting(kind) {
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const notes = kind === 'bad' ? [220, 207] : kind === 'good' ? [440, 660] : [520];
    notes.forEach((fq, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle'; o.frequency.value = fq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.16);
      g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.16 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.16 + 0.5);
      o.connect(g); g.connect(this.master);
      o.start(t + i * 0.16); o.stop(t + i * 0.16 + 0.55);
    });
  },

  // вызывается каждый кадр
  update(S, running) {
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const bliz = S && blizzard(S);
    // внутри вагона ветер слышен глуше
    const target = (bliz ? 0.16 : 0.05) * (1 - 0.6 * (Music.level || 0));
    this.windGain.gain.setTargetAtTime(target, now, 0.8);
    this.windFilter.frequency.setTargetAtTime(bliz ? 650 : 420 + Math.sin(now * 0.3) * 80, now, 0.5);
    const moving = S && S.speed > 0 && running;
    if (moving) {
      if (this.nextClack < now) this.nextClack = now + 0.05;
      while (this.nextClack < now + 0.2) {
        const t = this.nextClack;
        this.burst(t, 900, 0.07, 0.25);
        this.burst(t + 0.13, 800, 0.07, 0.2);
        const period = Math.max(0.7, 2.2 - S.speed / 25);
        this.nextClack += period;
      }
    } else if (S && S.stop && S.stop.noCoal) {
      if (this.nextTick < now) this.nextTick = now + 0.05;
      while (this.nextTick < now + 0.2) { this.tickSound(this.nextTick); this.nextTick += 1; }
    }
  },
};

// ---------- музыка в вагоне ----------
// Собственный медленный вальс-романс в ля миноре «как по радио в купе»:
// баян ведёт мелодию, гитара — бас и аккорды на 2-ю и 3-ю долю.
// Всё синтезируется на лету; звук пропущен через «радио» — узкая полоса, треск, плавание тона.
const Music = {
  on: true, bus: null, tone: null, level: 0, next: 0, step: 0, crackle: null,
  BPM: 84,
  // мелодия: [нота MIDI или 0 — пауза, длительность в долях]; 16 тактов по 3 доли
  MEL: [
    [76, 2], [72, 1], [71, 1], [72, 1], [69, 1], [74, 2], [77, 1], [76, 1], [74, 1], [72, 1],
    [71, 2], [68, 1], [71, 1], [74, 1], [76, 1], [72, 3], [69, 2], [0, 1],
    [77, 2], [81, 1], [79, 1], [77, 1], [76, 1], [74, 2], [71, 1], [76, 1], [74, 1], [72, 1],
    [72, 2], [69, 1], [74, 1], [77, 1], [76, 1], [71, 2], [68, 1], [69, 3],
  ],
  // аккорды по тактам: [бас, бас-квинта, голоса]
  CH: [
    [45, 52, [57, 60, 64]], [45, 52, [57, 60, 64]], [50, 45, [57, 62, 65]], [50, 45, [57, 62, 65]],
    [40, 47, [56, 59, 62]], [40, 47, [56, 59, 62]], [45, 52, [57, 60, 64]], [45, 52, [57, 60, 64]],
    [50, 45, [57, 62, 65]], [50, 45, [57, 62, 65]], [43, 50, [55, 59, 62]], [48, 43, [55, 60, 64]],
    [41, 48, [57, 60, 65]], [50, 45, [57, 62, 65]], [40, 47, [56, 59, 62]], [45, 52, [57, 60, 64]],
  ],

  init(ctx, master) {
    if (this.bus) return;
    this.ctx = ctx;
    this.bus = ctx.createGain(); this.bus.gain.value = 0;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 170;
    this.tone = ctx.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 1200; this.tone.Q.value = 0.8;
    this.bus.connect(hp); hp.connect(this.tone); this.tone.connect(master);
    // треск старого приёмника
    const n = ctx.createBufferSource();
    const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.02 + (Math.random() < 0.0007 ? (Math.random() * 2 - 1) * 0.6 : 0);
    n.buffer = buf; n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.6;
    this.crackle = ctx.createGain(); this.crackle.gain.value = 0;
    n.connect(bp); bp.connect(this.crackle); this.crackle.connect(this.tone);
    n.start();
    // «плавание» тона, как у старой плёнки/радио
    this.wow = ctx.createOscillator(); this.wow.frequency.value = 0.55;
    this.wowAmt = ctx.createGain(); this.wowAmt.gain.value = 6; // центов
    this.wow.connect(this.wowAmt); this.wow.start();
  },

  midi(m) { return 440 * Math.pow(2, (m - 69) / 12); },

  bayan(t, m, dur) {
    const ctx = this.ctx, f = this.midi(m);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.06);
    g.gain.setTargetAtTime(0.07, t + 0.06, 0.3);
    g.gain.setTargetAtTime(0.0001, t + dur - 0.05, 0.07);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1900; lp.Q.value = 1.2;
    const vib = ctx.createOscillator(); vib.frequency.value = 5.2;
    const va = ctx.createGain(); va.gain.value = 7;
    vib.connect(va);
    // три язычка: два чуть расстроены (тремоло «мюзет»), один октавой ниже
    for (const [type, mul, det, vol] of [['sawtooth', 1, -7, 1], ['sawtooth', 1, 7, 1], ['square', 0.5, 0, 0.45]]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * mul; o.detune.value = det;
      va.connect(o.detune); this.wowAmt.connect(o.detune);
      const og = ctx.createGain(); og.gain.value = vol;
      o.connect(og); og.connect(lp);
      o.start(t); o.stop(t + dur + 0.4);
    }
    vib.start(t); vib.stop(t + dur + 0.4);
    lp.connect(g); g.connect(this.bus);
  },

  pluck(t, m, vol, decay) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = this.midi(m);
    this.wowAmt.connect(o.detune);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g); g.connect(this.bus);
    o.start(t); o.stop(t + decay + 0.05);
  },

  // расписать музыку на ближайшие 0,3 с
  schedule(now) {
    const beat = 60 / this.BPM;
    if (this.next < now) this.next = now + 0.05;
    while (this.next < now + 0.3) {
      const total = this.MEL.reduce((a, x) => a + x[1], 0); // 48 долей
      const b = this.step % total;
      const bar = Math.floor(b / 3), inBar = b % 3;
      const [bass, fifth, chord] = this.CH[bar];
      const t = this.next;
      if (inBar === 0) this.pluck(t, bar % 2 ? fifth : bass, 0.16, 1.3);
      else chord.forEach((m, i) => this.pluck(t + i * 0.012, m, 0.045, 0.45));
      // мелодия: нота начинается на этой доле?
      let acc = 0;
      for (const [m, d] of this.MEL) {
        if (acc === b && m) this.bayan(t, m, d * beat);
        acc += d;
        if (acc > b) break;
      }
      this.step++;
      this.next += beat;
    }
  },

  // level 0..1 — насколько близко камера к вагону
  update(level) {
    if (!this.bus) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const target = this.on ? level : 0;
    this.level = target;
    this.bus.gain.setTargetAtTime(target * 0.9, now, 0.6);
    this.crackle.gain.setTargetAtTime(target * 0.5, now, 0.6);
    // снаружи вагона звук глухой, внутри — как из динамика в купе
    this.tone.frequency.setTargetAtTime(700 + 2600 * target, now, 0.5);
    if (target > 0.01) this.schedule(now);
    else this.next = 0;
  },
};
Sound.music = Music;

globalThis.Sound = Sound;
