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
    const target = bliz ? 0.16 : 0.05;
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

globalThis.Sound = Sound;
