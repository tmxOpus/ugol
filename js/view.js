// «Уголь» — вид мира на вкладке «Поезд»: камера, зум, рельеф, лес, пути, станции,
// паровоз и вагоны, разрез вагона начальника с пассажирами. Рисуется каждый кадр.
'use strict';

const View = (() => {
  // размеры состава, км
  const M = 0.001;
  const UNITS = [{ k: 'loco', len: 21 * M }, { k: 'tender', len: 11 * M }];
  for (let n = 1; n <= 10; n++) UNITS.push({ k: 'car', n, len: 24.5 * M });
  const GAP = 1.3 * M;
  const TRAIN_LEN = UNITS.reduce((a, u) => a + u.len + GAP, 0);

  const Z_MIN = 0.22, Z_MAX = 130000, Z_DEFAULT = 1800, Z_INTERIOR = 4500;

  let cv, ctx, CW = 0, CH = 0, DPR = 1;
  const cam = { x: 0, y: 0, z: Z_DEFAULT, tz: Z_DEFAULT, rot: 0, follow: true, init: false };
  let terrain = null, terrainSeed = null;
  let hits = [], unitHits = [];
  const puffs = [];
  let lastT = 0;
  const snow = Array.from({ length: 160 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + 0.4, v: Math.random() * 0.5 + 0.5 }));
  const blob = (n, k) => { const p = new Path2D(); for (let i = 0; i <= n * 2; i++) { const a = (i * Math.PI) / n, rr = i % 2 ? k : 1; p.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } p.closePath(); return p; };
  const PINE = (() => { const p = new Path2D(); for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; p.moveTo(Math.cos(a) * 0.55 + 0.42, Math.sin(a) * 0.55); p.arc(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0.42, 0, 7); } p.arc(0, 0, 0.6, 0, 7); return p; })();
  const SPRUCE_IN = blob(8, 0.5);
  const BUSH = (() => { const p = new Path2D(); p.arc(-0.3, 0, 0.45, 0, 7); p.moveTo(0.75, -0.1); p.arc(0.3, -0.1, 0.45, 0, 7); p.moveTo(0.45, 0.35); p.arc(0, 0.35, 0.45, 0, 7); return p; })();
  const ROCK = (() => { const p = new Path2D(); [[1, 0], [0.5, 0.8], [-0.4, 0.9], [-1, 0.2], [-0.7, -0.7], [0.2, -1], [0.85, -0.6]].forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath(); return p; })();
  const STAR = (() => { const p = new Path2D(); for (let i = 0; i < 16; i++) { const a = (i * Math.PI) / 8, rr = i % 2 ? 0.42 : 1; p.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } p.closePath(); return p; })();

  // ---------- камера ----------
  function C() { return [CW / 2, CH * 0.5]; }
  function w2s(x, y) {
    const [cx, cy] = C();
    const dx = (x - cam.x) * cam.z, dy = (y - cam.y) * cam.z;
    const c = Math.cos(cam.rot), s = Math.sin(cam.rot);
    return [cx + c * dx - s * dy, cy + s * dx + c * dy];
  }
  function s2w(sx, sy) {
    const [cx, cy] = C();
    const u = (sx - cx) / cam.z, v = (sy - cy) / cam.z;
    const c = Math.cos(cam.rot), s = Math.sin(cam.rot);
    return [cam.x + c * u + s * v, cam.y - s * u + c * v];
  }
  function setWorld() {
    const [cx, cy] = C();
    const z = cam.z * DPR, c = Math.cos(cam.rot), s = Math.sin(cam.rot);
    ctx.setTransform(z * c, z * s, -z * s, z * c, cx * DPR, cy * DPR);
  }
  // локальная система объекта: метры, ось X — вперёд по ходу, Y — вправо
  function setLocal(x, y, ang) {
    const [sx, sy] = w2s(x, y);
    const k = cam.z * M * DPR, a = cam.rot + ang, c = Math.cos(a), s = Math.sin(a);
    ctx.setTransform(k * c, k * s, -k * s, k * c, sx * DPR, sy * DPR);
  }
  function local2s(o, lx, ly) {
    const c = Math.cos(o.ang), s = Math.sin(o.ang);
    return w2s(o.x + (c * lx - s * ly) * M, o.y + (s * lx + c * ly) * M);
  }
  function setScreen() { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
  function viewBox(margin = 0) {
    const pts = [s2w(0, 0), s2w(CW, 0), s2w(0, CH), s2w(CW, CH)];
    const m = margin / cam.z;
    return [Math.min(...pts.map((p) => p[0])) - m, Math.min(...pts.map((p) => p[1])) - m, Math.max(...pts.map((p) => p[0])) + m, Math.max(...pts.map((p) => p[1])) + m];
  }
  function zoomAt(sx, sy, f) {
    const nz = Math.max(Z_MIN, Math.min(Z_MAX, cam.z * f));
    if (cam.follow) { cam.z = nz; cam.tz = nz; return; }
    const before = s2w(sx, sy);
    cam.z = nz; cam.tz = nz;
    const after = s2w(sx, sy);
    cam.x += before[0] - after[0];
    cam.y += before[1] - after[1];
  }
  function fitZoom() { return Math.min(CW / WORLD_W, CH / WORLD_H) * 0.95; }

  // ---------- геометрия состава ----------
  function chain(extra) {
    const e = WORLD.edges[S.pos.e];
    const d = S.pos.d + extra;
    const out = [];
    const nextNode = S.route[0];
    if (d > e.len && S.route.length >= 2 && nextNode !== undefined && !WORLD.nodes[nextNode].stop && !S.stop) {
      const ne = edgeBetween(WORLD, nextNode, S.route[1]);
      if (ne) out.push({ e: ne, dir: ne.a === nextNode ? 1 : -1, dist: Math.min(ne.len, d - e.len) });
      out.push({ e, dir: S.pos.dir, dist: e.len });
    } else out.push({ e, dir: S.pos.dir, dist: Math.min(d, e.len) });
    for (const t of S.trail) out.push({ e: WORLD.edges[t.e], dir: t.dir, dist: WORLD.edges[t.e].len });
    return out;
  }
  function back(ch, b) {
    for (const c of ch) {
      if (b <= c.dist) {
        const s = c.dist - b;
        return pointOnEdge(c.e, c.dir > 0 ? s : c.e.len - s);
      }
      b -= c.dist;
    }
    const l = ch[ch.length - 1];
    return pointOnEdge(l.e, l.dir > 0 ? 0 : l.e.len);
  }
  function placeUnits(ch) {
    const res = [];
    let o = 0;
    for (const u of UNITS) {
      const f = back(ch, o), r = back(ch, o + u.len);
      res.push({ u, x: (f.x + r.x) / 2, y: (f.y + r.y) / 2, ang: Math.atan2(f.y - r.y, f.x - r.x), front: f });
      o += u.len + GAP;
    }
    return res;
  }

  // ---------- рельеф ----------
  function buildTerrain() {
    const w = 500, h = Math.round(500 * WORLD_H / WORLD_W);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    const sx = WORLD_W / w, sy = WORLD_H / h;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const x = i * sx, y = j * sy;
      const ht = WORLD.height(x, y);
      const hx = WORLD.height(x + sx, y) - ht;
      const shade = Math.max(-1, Math.min(1, -hx / 40));
      let r, gg, b;
      if (WORLD.isLake(x, y)) { r = 14; gg = 24; b = 48; }
      else {
        const t = Math.min(1, ht / 1300);
        r = 20 + t * 16 + shade * 6; gg = 32 + t * 20 + shade * 8; b = 62 + t * 28 + shade * 12;
        if (ht > 1150) { r += 12; gg += 14; b += 18; }
        const f = WORLD.forest(x, y);
        if (f > 0.5 && hash2(i, j, 3) < (f - 0.45) * 1.6) { r *= 0.55; gg *= 0.6; b *= 0.68; }
      }
      const k = (j * w + i) * 4;
      img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    terrain = c;
    terrainSeed = WORLD.seed;
  }

  // ---------- лес ----------
  const TIERS = [
    { cs: 3, r: 1.0, dens: 0.55, clear: 0.6 },
    { cs: 0.35, r: 0.11, dens: 0.6, clear: 0.12 },
    { cs: 0.045, r: 0.014, dens: 0.62, clear: 0.016 },
    { cs: 0.008, r: 0.0034, dens: 0.6, clear: 0.0055 },
  ];
  function drawTrees(bb) {
    for (let ti = 0; ti < TIERS.length; ti++) {
      const T = TIERS[ti];
      const px = T.cs * cam.z;
      if (px < 14 || px > 420) continue;
      const alpha = Math.min(1, (px - 14) / 20) * Math.min(1, (420 - px) / 120);
      const x0 = Math.floor(bb[0] / T.cs), x1 = Math.ceil(bb[2] / T.cs);
      const y0 = Math.floor(bb[1] / T.cs), y1 = Math.ceil(bb[3] / T.cs);
      if ((x1 - x0) * (y1 - y0) > 4000) continue;
      ctx.globalAlpha = alpha;
      const [cx, cy] = C();
      const zc = cam.z * DPR, c = Math.cos(cam.rot), s = Math.sin(cam.rot);
      for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
        const h = hash2(gx, gy, 77 + ti);
        const x = (gx + hash2(gx, gy, 5 + ti)) * T.cs, y = (gy + hash2(gx, gy, 9 + ti)) * T.cs;
        if (x < 0 || y < 0 || x > WORLD_W || y > WORLD_H) continue;
        const f = WORLD.forest(x, y);
        if (h > T.dens * (0.4 + f)) continue;
        if (WORLD.isLake(x, y)) continue;
        const rr = T.r * (0.7 + hash2(gx, gy, 13) * 0.6);
        if (trackDist(WORLD, x, y) < T.clear + rr) continue;
        if (riverDist(WORLD, x, y) < rr + T.clear * 0.5) continue;
        // вид дерева: ель, сосна, берёза, куст, камень
        const q = hash2(gx, gy, 33), ht = ti >= 2 ? WORLD.height(x, y) : 0;
        let kind = 'spruce';
        if (ti >= 2) {
          if (ht > 950) kind = q < 0.4 ? 'rock' : q < 0.55 ? 'bush' : 'spruce';
          else if (f > 0.6) kind = q < 0.62 ? 'spruce' : q < 0.88 ? 'pine' : 'birch';
          else kind = q < 0.3 ? 'birch' : q < 0.55 ? 'bush' : q < 0.8 ? 'spruce' : 'pine';
        } else if (q < 0.3) kind = 'pine';
        const sc = kind === 'bush' ? 0.45 : kind === 'birch' ? 0.6 : kind === 'rock' ? 0.5 : 1;
        const dx = (x - cam.x), dy = (y - cam.y);
        const k = rr * sc * zc, ang = hash2(gx, gy, 21) * 6.28 + cam.rot;
        const ca = Math.cos(ang) * k, sa = Math.sin(ang) * k;
        const ex = cx * DPR + (c * dx - s * dy) * zc, ey = cy * DPR + (s * dx + c * dy) * zc;
        const shape = kind === 'pine' ? PINE : kind === 'bush' ? BUSH : kind === 'rock' ? ROCK : kind === 'birch' ? PINE : STAR;
        // тень
        if (ti >= 2 && !thermal) {
          ctx.setTransform(ca, sa, -sa, ca, ex + k * 0.35, ey + k * 0.45);
          ctx.fillStyle = 'rgba(5,10,25,.45)';
          ctx.fill(shape);
        }
        ctx.setTransform(ca, sa, -sa, ca, ex, ey);
        if (thermal) { ctx.fillStyle = '#10185a'; ctx.fill(shape); continue; }
        if (kind === 'spruce') {
          ctx.fillStyle = '#0b1430'; ctx.fill(STAR);
          if (ti >= 2) { ctx.fillStyle = '#13224a'; ctx.fill(SPRUCE_IN); }
        } else if (kind === 'pine') {
          ctx.fillStyle = '#0e1a3a'; ctx.fill(PINE);
          if (ti >= 2) { ctx.fillStyle = '#18284f'; ctx.beginPath(); ctx.arc(-0.15, -0.15, 0.45, 0, 7); ctx.fill(); }
        } else if (kind === 'birch') {
          ctx.globalAlpha = alpha * 0.55;
          ctx.fillStyle = '#7d8bb0'; ctx.fill(PINE);
          ctx.globalAlpha = alpha;
          ctx.fillStyle = '#d8dfee'; ctx.beginPath(); ctx.arc(0, 0, 0.14, 0, 7); ctx.fill();
        } else if (kind === 'bush') {
          ctx.fillStyle = '#1a2a52'; ctx.fill(BUSH);
        } else {
          ctx.fillStyle = '#34405f'; ctx.fill(ROCK);
          ctx.fillStyle = '#c9d4ea'; ctx.globalAlpha = alpha * 0.5;
          ctx.beginPath(); ctx.moveTo(-0.6, -0.5); ctx.lineTo(0.2, -0.9); ctx.lineTo(0.7, -0.5); ctx.lineTo(0, -0.3); ctx.fill();
          ctx.globalAlpha = alpha;
        }
        // снег на ветках
        if (ti >= 1 && kind !== 'rock') {
          ctx.fillStyle = '#c9d4ea';
          ctx.globalAlpha = alpha * 0.35;
          ctx.fillRect(-0.3, -0.25, 0.14, 0.14); ctx.fillRect(0.15, 0.1, 0.12, 0.12);
          ctx.globalAlpha = alpha;
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------- пути ----------
  function strokeEdge(e, from = 0, to = e.len) {
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < e.pts.length; i++) {
      if (e.cum[i] < from - 4 || e.cum[i] > to + 4) continue;
      const p = e.pts[i];
      if (!started) { ctx.moveTo(p[0] - cam.x, p[1] - cam.y); started = true; } else ctx.lineTo(p[0] - cam.x, p[1] - cam.y);
    }
    ctx.stroke();
  }
  function offsetStroke(e, off, bb) {
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < e.pts.length; i++) {
      const p = e.pts[i];
      if (p[0] < bb[0] - 5 || p[0] > bb[2] + 5 || p[1] < bb[1] - 5 || p[1] > bb[3] + 5) { started = false; continue; }
      const a = e.pts[Math.max(0, i - 1)], b = e.pts[Math.min(e.pts.length - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      const x = p[0] - (dy / l) * off - cam.x, y = p[1] + (dx / l) * off - cam.y;
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  function inBox(e, bb) { const b = e.bbox; return !(b[2] < bb[0] || b[0] > bb[2] || b[3] < bb[1] || b[1] > bb[3]); }

  function drawTracks(bb, routeEdges) {
    setWorld();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const z = cam.z;
    const vis = WORLD.edges.filter((e) => inBox(e, bb));
    if (z < 400) {
      ctx.strokeStyle = thermal ? '#3a4ab0' : '#8d9dc4';
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = Math.min(2.4, 1 + z * 0.01) / z;
      for (const e of vis) strokeEdge(e);
      ctx.globalAlpha = 1;
    } else {
      // насыпь
      ctx.strokeStyle = thermal ? '#18207a' : '#1b2846';
      ctx.lineWidth = 0.0065;
      for (const e of vis) strokeEdge(e);
      if (z > 2500) {
        // шпалы
        ctx.strokeStyle = thermal ? '#222c90' : '#2e2a38';
        ctx.lineWidth = 0.0026;
        ctx.setLineDash([0.00026, 0.00032]);
        for (const e of vis) strokeEdge(e);
        ctx.setLineDash([]);
      }
      ctx.strokeStyle = thermal ? '#5a6ad8' : '#a9b8d8';
      if (z > 1200) {
        ctx.lineWidth = Math.max(0.6 / z, 0.00008);
        for (const e of vis) { offsetStroke(e, 0.00076, bb); offsetStroke(e, -0.00076, bb); }
      } else {
        ctx.lineWidth = 1.6 / z;
        for (const e of vis) strokeEdge(e);
      }
    }
    // маршрут
    if (z < 2500) {
      ctx.strokeStyle = '#f5b13d';
      ctx.globalAlpha = z < 400 ? 0.9 : Math.max(0, 1 - (z - 400) / 2100) * 0.8;
      ctx.lineWidth = (z < 400 ? 2.6 : 3) / z;
      ctx.setLineDash([7 / z, 5 / z]);
      for (const L of routeEdges) if (inBox(L.e, bb)) strokeEdge(L.e);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }

  // ---------- вода ----------
  function bboxHit(b, bb, m = 0) { return !(b[2] < bb[0] - m || b[0] > bb[2] + m || b[3] < bb[1] - m || b[1] > bb[3] + m); }
  function drawWater(bb) {
    setWorld();
    const z = cam.z;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const ice = thermal ? '#0c1250' : '#2a4272', bank = thermal ? '#0a0e40' : '#16223f';
    // озёра — замёрзшие
    for (const l of WORLD.lakes) {
      if (!bboxHit(l.bbox, bb)) continue;
      ctx.beginPath();
      l.pts.forEach((p, i) => (i ? ctx.lineTo(p[0] - cam.x, p[1] - cam.y) : ctx.moveTo(p[0] - cam.x, p[1] - cam.y)));
      ctx.closePath();
      ctx.lineWidth = Math.max(2.5 / z, 0.03); ctx.strokeStyle = bank; ctx.stroke();
      ctx.fillStyle = ice; ctx.fill();
      if (!thermal && z > 8) {
        // трещины и снежные полосы на льду
        ctx.save(); ctx.clip();
        const r = rng(Math.round(l.x * 7 + l.y));
        ctx.strokeStyle = 'rgba(210,225,255,.22)'; ctx.lineWidth = 1 / z;
        for (let i = 0; i < 14; i++) {
          let x = l.x + (r() - 0.5) * l.R * 1.4, y = l.y + (r() - 0.5) * l.R;
          ctx.beginPath(); ctx.moveTo(x - cam.x, y - cam.y);
          for (let k = 0; k < 6; k++) { x += (r() - 0.5) * l.R * 0.35; y += (r() - 0.5) * l.R * 0.35; ctx.lineTo(x - cam.x, y - cam.y); }
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(200,215,240,.07)';
        for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse(l.x + (r() - 0.5) * l.R - cam.x, l.y + (r() - 0.5) * l.R * 0.8 - cam.y, l.R * 0.4, l.R * 0.08, r() * 3, 0, 7); ctx.fill(); }
        ctx.restore();
      }
    }
    // реки — подо льдом
    for (const rv of WORLD.rivers) {
      if (!bboxHit(rv.bbox, bb, 1)) continue;
      const P = rv.pts;
      if (z < 25) {
        ctx.strokeStyle = thermal ? '#0c1250' : '#3a5a94'; ctx.lineWidth = 1.3 / z;
        ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(p[0] - cam.x, p[1] - cam.y) : ctx.moveTo(p[0] - cam.x, p[1] - cam.y))); ctx.stroke();
        continue;
      }
      for (const pass of [0, 1, 2]) {
        if (pass === 2 && (thermal || z < 400)) break;
        ctx.strokeStyle = pass === 0 ? bank : pass === 1 ? ice : 'rgba(215,230,255,.13)';
        for (let i = 1; i < P.length; i++) {
          const a = P[i - 1], b = P[i];
          if (Math.max(a[0], b[0]) < bb[0] - 1 || Math.min(a[0], b[0]) > bb[2] + 1 || Math.max(a[1], b[1]) < bb[1] - 1 || Math.min(a[1], b[1]) > bb[3] + 1) continue;
          const w = rv.w[i];
          ctx.lineWidth = pass === 0 ? Math.max(w * 1.5, 2.6 / z) : pass === 1 ? Math.max(w, 1.4 / z) : w * 0.25;
          // сгладить меандр: кривая через середины
          const pa = P[Math.max(0, i - 2)], m0x = (pa[0] + a[0]) / 2, m0y = (pa[1] + a[1]) / 2;
          ctx.beginPath();
          ctx.moveTo((i > 1 ? (P[i - 2][0] + a[0]) / 2 : a[0]) - cam.x, (i > 1 ? (P[i - 2][1] + a[1]) / 2 : a[1]) - cam.y);
          ctx.quadraticCurveTo(a[0] - cam.x, a[1] - cam.y, (a[0] + b[0]) / 2 - cam.x, (a[1] + b[1]) / 2 - cam.y);
          if (i === P.length - 1) ctx.lineTo(b[0] - cam.x, b[1] - cam.y);
          ctx.stroke();
          void m0x; void m0y;
        }
      }
    }
  }

  // ---------- мосты ----------
  function drawBridges(bb) {
    const z = cam.z;
    if (z < 20) return;
    for (const br of WORLD.bridges) {
      if (br.x < bb[0] - 1 || br.x > bb[2] + 1 || br.y < bb[1] - 1 || br.y > bb[3] + 1) continue;
      if (z < 250) {
        // условный знак моста
        const [sx, sy] = w2s(br.x, br.y);
        setScreen();
        const a = br.ang + cam.rot, c = Math.cos(a), s2 = Math.sin(a), nx = -s2, ny = c;
        ctx.strokeStyle = thermal ? '#5a6ad8' : '#dfe6f2'; ctx.lineWidth = 1.4;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(sx - c * 7 + nx * 4 * side - nx * side * 2, sy - s2 * 7 + ny * 4 * side - ny * side * 2);
          ctx.lineTo(sx - c * 5 + nx * 4 * side, sy - s2 * 5 + ny * 4 * side);
          ctx.lineTo(sx + c * 5 + nx * 4 * side, sy + s2 * 5 + ny * 4 * side);
          ctx.lineTo(sx + c * 7 + nx * 4 * side - nx * side * 2, sy + s2 * 7 + ny * 4 * side - ny * side * 2);
          ctx.stroke();
        }
        continue;
      }
      setLocal(br.x, br.y, br.ang);
      const L = br.len * 1000;
      // опоры
      ctx.fillStyle = '#0d1226';
      for (let x = -L / 2 + 18; x < L / 2 - 10; x += 22) ctx.fillRect(x - 1.5, -4.6, 3, 9.2);
      // устои
      ctx.fillStyle = '#2a3354'; ctx.fillRect(-L / 2 - 4, -4, 6, 8); ctx.fillRect(L / 2 - 2, -4, 6, 8);
      // тень и настил
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(-L / 2, -2.6, L, 7.2);
      ctx.fillStyle = thermal ? '#18207a' : '#1e2540'; ctx.fillRect(-L / 2, -3.2, L, 6.4);
      // шпалы и рельсы
      if (z > 2500) {
        ctx.fillStyle = '#2e2a38';
        for (let x = -L / 2; x < L / 2; x += 0.6) ctx.fillRect(x, -1.3, 0.25, 2.6);
      }
      ctx.strokeStyle = thermal ? '#5a6ad8' : '#a9b8d8'; ctx.lineWidth = Math.max(0.12, 1 / (z * M));
      ctx.beginPath(); ctx.moveTo(-L / 2, -0.76); ctx.lineTo(L / 2, -0.76); ctx.moveTo(-L / 2, 0.76); ctx.lineTo(L / 2, 0.76); ctx.stroke();
      // фермы
      ctx.strokeStyle = thermal ? '#7a8ae0' : '#5f73a8'; ctx.lineWidth = Math.max(0.35, 1.2 / (z * M));
      for (const yy of [-2.9, 2.9]) {
        ctx.beginPath(); ctx.moveTo(-L / 2, yy); ctx.lineTo(L / 2, yy); ctx.stroke();
      }
      ctx.lineWidth = Math.max(0.2, 0.8 / (z * M));
      ctx.beginPath();
      for (let x = -L / 2, k = 0; x < L / 2; x += 4, k++) {
        ctx.moveTo(x, -2.9); ctx.lineTo(x + 4, k % 2 ? -2.9 : 2.9);
        ctx.moveTo(x, 2.9); ctx.lineTo(x + 4, k % 2 ? 2.9 : -2.9);
      }
      ctx.stroke();
      // снег на настиле
      ctx.fillStyle = 'rgba(220,230,250,.08)'; ctx.fillRect(-L / 2, -3.2, L, 1.2);
    }
  }

  // ---------- станции ----------
  function drawStations(bb, routeSet) {
    const z = cam.z;
    const known = hasRec(S, 'p_map') || hasRec(S, 'c_shubin');
    stationHits = [];
    // платформы вблизи
    if (z > 250) {
      for (const n of WORLD.nodes) {
        if (n.x < bb[0] - 1 || n.x > bb[2] + 1 || n.y < bb[1] - 1 || n.y > bb[3] + 1) continue;
        if (n.type === 'разъезд') continue;
        const e = WORLD.edges[n.edges[0]];
        const p = pointOnEdge(e, e.a === n.id ? 0.05 : e.len - 0.05);
        const ang = p.ang;
        setLocal(n.x, n.y, ang);
        const big = n.type === 'узловая' ? 1.6 : 1;
        if (n.type === 'заброшенная') {
          ctx.fillStyle = '#1a2440'; ctx.fillRect(-60, 5, 120, 6);
          ctx.strokeStyle = '#3a4a70'; ctx.lineWidth = 0.4; ctx.strokeRect(-12, 16, 18, 10);
        } else {
          ctx.fillStyle = thermal ? '#1a2280' : '#2a3a62';
          ctx.fillRect(-110 * big, 3.2, 220 * big, 5);
          ctx.fillRect(-110 * big, -8.2, 220 * big, 5);
          ctx.fillStyle = thermal ? '#c05a2a' : '#3a2a26';
          ctx.fillRect(-14 * big, 12, 28 * big, 10);
          ctx.fillStyle = '#f5b13d';
          for (let i = -2; i <= 2; i++) ctx.fillRect(i * 5 * big - 1.5, 11.5, 3, 1);
          // фонари
          ctx.globalCompositeOperation = 'lighter';
          for (let i = -4; i <= 4; i++) {
            const gr = ctx.createRadialGradient(i * 25 * big, 5.5, 0, i * 25 * big, 5.5, 9);
            gr.addColorStop(0, isNightNow() ? 'rgba(255,190,90,.35)' : 'rgba(255,190,90,.08)'); gr.addColorStop(1, 'rgba(255,190,90,0)');
            ctx.fillStyle = gr; ctx.fillRect(i * 25 * big - 9, -3.5, 18, 18);
          }
          ctx.globalCompositeOperation = 'source-over';
        }
      }
    }
    // значки и подписи
    setScreen();
    ctx.textBaseline = 'middle';
    for (const n of WORLD.nodes) {
      if (n.x < bb[0] - 30 / z || n.x > bb[2] + 30 / z || n.y < bb[1] - 30 / z || n.y > bb[3] + 30 / z) continue;
      const [sx, sy] = w2s(n.x, n.y);
      const onRoute = routeSet.has(n.id) || n.id === WORLD.start;
      const imp = n.id === WORLD.start || n.id === WORLD.dest;
      const big = n.type === 'узловая' || imp;
      if (z < 250) {
        if (n.type === 'разъезд' && z < 6) continue;
        if (z < 1.2 && !big && !(onRoute && n.stop) && !(n.id === WORLD.meet && known) && S.wp !== n.id) continue;
        const sz = big ? 9 : n.type === 'разъезд' ? 3 : 6;
        let col = n.type === 'заброшенная' ? '#6f7a99' : onRoute ? '#f5b13d' : '#dfe6f2';
        if (n.id === WORLD.meet && known) col = '#ff5a3c';
        ctx.fillStyle = '#14213d'; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
        ctx.fillRect(sx - sz / 2, sy - sz / 2, sz, sz); ctx.strokeRect(sx - sz / 2, sy - sz / 2, sz, sz);
        if (big) { ctx.fillStyle = col; ctx.fillRect(sx - 2, sy - 2, 4, 4); }
        if (S.wp === n.id) { ctx.strokeStyle = '#f5b13d'; ctx.beginPath(); ctx.arc(sx, sy, 10, 0, 7); ctx.stroke(); }
      }
      const showLabel = imp || (big && z > 0.33) || (n.stop && z > 2.5) || (n.type !== 'разъезд' && z > 6) || z > 18;
      if (showLabel && (z < 2000 || Math.hypot(sx - CW / 2, sy - CH / 2) < CW)) {
        ctx.font = `${big ? 600 : 400} ${big ? 11 : 10}px ui-monospace, Menlo, monospace`;
        let col = onRoute ? '#f5b13d' : '#c4cde0';
        if (n.id === WORLD.meet && known) col = '#ff5a3c';
        ctx.fillStyle = col;
        ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
        ctx.fillText(n.name.toUpperCase(), sx + 9, sy - 1);
        if (z > 3 && n.type !== 'разъезд') {
          ctx.font = '9px ui-monospace, Menlo, monospace';
          ctx.fillStyle = '#7f8cab';
          ctx.fillText(`КМ ${n.km} · ${n.type.toUpperCase()}${S.stationCoal[n.id] ? ' · УГОЛЬ' : ''}`, sx + 9, sy + 10);
        }
        ctx.shadowBlur = 0;
      }
      stationHits.push({ id: n.id, sx, sy });
    }
    // точка встречи
    if (known) {
      const m = WORLD.nodes[WORLD.meet];
      const [sx, sy] = w2s(m.x, m.y);
      ctx.strokeStyle = '#ff5a3c'; ctx.setLineDash([3, 4]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(14, 1.5 * cam.z), 0, 7); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#ff5a3c'; ctx.font = '600 10px ui-monospace, Menlo, monospace';
      ctx.fillText('САНИ?', sx - 16, sy - Math.max(20, 1.5 * cam.z + 8));
    }
  }
  let stationHits = [];

  // ---------- сани ----------
  function drawSledges(time) {
    if (!S.sledges) return;
    const m = WORLD.nodes[WORLD.meet];
    const k = Math.min(1, (S.t - (S.stop ? S.stop.since + 15 : S.t)) / 30);
    setScreen();
    for (let i = 0; i < 7; i++) {
      const a = 2.2 + i * 0.13;
      const dist = (0.45 - k * 0.35) + i * 0.01;
      const x = m.x + Math.cos(a) * dist + Math.sin(time / 900 + i) * 0.004, y = m.y + Math.sin(a) * dist;
      const [sx, sy] = w2s(x, y);
      ctx.fillStyle = '#ffb347'; ctx.shadowColor = '#ff8a2a'; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(3, Math.min(8, cam.z * 0.0008)), 0, 7); ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  // ---------- состав ----------
  function tempColor(T, a = 1) {
    const w = Math.max(0, Math.min(1, T / 24));
    return `rgba(${Math.round(40 + 215 * w)},${Math.round(40 + 120 * w)},${Math.round(160 - 130 * w)},${a})`;
  }

  function drawLoco(o, moving) {
    setLocal(o.x, o.y, o.ang);
    const hot = thermal;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; rr(-10.2, -1.9, 21, 3.9, 1.2); ctx.fill();
    ctx.fillStyle = hot ? '#8a3a8a' : '#1a2647'; rr(-10.5, -1.55, 21, 3.1, 0.8); ctx.fill();
    // котёл
    ctx.fillStyle = hot ? '#ff8a2a' : '#273a66'; rr(-4.2, -0.95, 13.8, 1.9, 0.9); ctx.fill();
    if (!hot) { ctx.fillStyle = '#3b5288'; ctx.fillRect(-4, -0.25, 13.4, 0.22); }
    for (let x = -3; x < 9; x += 2.2) { ctx.fillStyle = hot ? '#ffb070' : '#1c2a4f'; ctx.fillRect(x, -0.95, 0.12, 1.9); }
    // дымовая коробка
    ctx.fillStyle = hot ? '#ff6a1a' : '#121a30'; rr(9.4, -1.0, 1.3, 2.0, 0.7); ctx.fill();
    // труба, сухопарник, песочница
    circ(7.8, 0, 0.5, hot ? '#ffd060' : '#0a0f1e');
    if (moving && !hot) circ(7.8, 0, 0.28, '#ff9a3c');
    circ(3.2, 0, 0.55, hot ? '#ff9a4a' : '#31477a');
    circ(0.6, 0, 0.45, hot ? '#ff9a4a' : '#31477a');
    // будка
    ctx.fillStyle = hot ? '#c0602a' : '#2d4170'; rr(-10.2, -1.55, 5.8, 3.1, 0.5); ctx.fill();
    ctx.strokeStyle = '#4a6090'; ctx.lineWidth = 0.08; ctx.strokeRect(-9.6, -1.2, 4.6, 2.4);
    ctx.fillStyle = '#f5b13d'; ctx.fillRect(-6, -1.55, 0.9, 0.12); ctx.fillRect(-6, 1.43, 0.9, 0.12);
    // прожектор
    circ(10.75, 0, 0.25, '#ffe7a0');
    // буфер
    ctx.fillStyle = '#8a3a3a'; ctx.fillRect(10.6, -1.3, 0.25, 2.6);
  }

  function drawTender(o) {
    setLocal(o.x, o.y, o.ang);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; rr(-5.3, -1.8, 11, 3.8, 0.8); ctx.fill();
    ctx.fillStyle = thermal ? '#3a2a8a' : '#1c2a4f'; rr(-5.5, -1.5, 11, 3, 0.5); ctx.fill();
    ctx.fillStyle = '#07080e'; ctx.fillRect(-4.6, -1.15, 9.2, 2.3);
    const fill = Math.max(0, Math.min(1, S.tender / 11000));
    const n = Math.round(fill * 60);
    const r = rng(5);
    for (let i = 0; i < n; i++) {
      const x = -4.3 + r() * 8.6, y = -0.95 + r() * 1.9;
      ctx.fillStyle = i % 5 ? '#151722' : '#2b2e3e';
      ctx.beginPath(); ctx.arc(x, y, 0.22 + r() * 0.18, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#4a6090'; ctx.fillRect(-5.5, -1.5, 11, 0.1); ctx.fillRect(-5.5, 1.4, 11, 0.1);
  }

  function windowGlow(o, car) {
    const ppl = carPeople(S, car.n).length;
    if (car.locked || !ppl || thermal) return;
    const night = isNightNow();
    const warm = Math.max(0, Math.min(1, car.T / 22));
    const a = (night ? 0.55 : 0.12) * (0.35 + 0.65 * warm) * (car.windows ? 0.15 : 1);
    setLocal(o.x, o.y, o.ang);
    ctx.globalCompositeOperation = 'lighter';
    for (const side of [-1, 1]) {
      const g = ctx.createLinearGradient(0, side * 1.7, 0, side * 7);
      g.addColorStop(0, `rgba(245,170,60,${a})`);
      g.addColorStop(1, 'rgba(245,170,60,0)');
      ctx.fillStyle = g;
      for (let i = 0; i < 9; i++) {
        const x = -9.2 + i * 2.04 + 0.35;
        ctx.beginPath();
        ctx.moveTo(x + 0.1, side * 1.7); ctx.lineTo(x + 1.25, side * 1.7);
        ctx.lineTo(x + 1.75, side * 7); ctx.lineTo(x - 0.4, side * 7);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawCarRoof(o, car, alpha = 1) {
    setLocal(o.x, o.y, o.ang);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; rr(-12, -1.9, 24.5, 4, 1); ctx.fill();
    if (thermal) {
      ctx.shadowColor = tempColor(car.T); ctx.shadowBlur = 30 * Math.max(0, car.T / 24) * cam.z * M;
      ctx.fillStyle = tempColor(car.T); rr(-12.2, -1.6, 24.4, 3.2, 0.9); ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = car.locked ? '#18213d' : '#22345f'; rr(-12.2, -1.6, 24.4, 3.2, 0.9); ctx.fill();
      ctx.strokeStyle = '#0d1428'; ctx.lineWidth = 0.12; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 0.06;
      for (let x = -11; x <= 11; x += 1) { ctx.beginPath(); ctx.moveTo(x, -1.5); ctx.lineTo(x, 1.5); ctx.stroke(); }
      ctx.fillStyle = '#dfe6f2'; ctx.fillRect(-2.5, -0.06, 5, 0.12);
      for (const x of [-8.5, -4, 4, 8.5]) circ(x, 0, 0.28, '#0d1428');
      // труба котла
      circ(10.1, -1.0, 0.22, car.heat && car.box > 0 ? '#ff9a3c' : '#0d1428');
    }
    // переходные площадки
    ctx.fillStyle = '#0d1428'; ctx.fillRect(12.2, -0.8, 0.5, 1.6); ctx.fillRect(-12.7, -0.8, 0.5, 1.6);
    ctx.globalAlpha = 1;
  }

  // разрез вагона: вид сверху без крыши
  function seatPos(seat) {
    // возвращает {x, y, berth:'main'|'side', upper, lying-angle}
    const sx0 = 9.2, sw = 18.4 / 9;
    if (seat <= 36) {
      const sec = Math.floor((seat - 1) / 4), k = (seat - 1) % 4;
      const x0 = sx0 - sw * (sec + 1);
      const A = k < 2;
      return { x: A ? x0 + 0.38 : x0 + sw - 0.38, y: -0.7, side: false, upper: k % 2 === 1, sec };
    }
    const j = Math.max(0, Math.min(17, seat - 37));
    const sec = 8 - Math.floor(j / 2);
    const x0 = sx0 - sw * (sec + 1);
    return { x: x0 + sw / 2, y: 1.3, side: true, upper: j % 2 === 1, sec };
  }

  function drawInterior(o, car, alpha) {
    setLocal(o.x, o.y, o.ang);
    ctx.globalAlpha = alpha;
    const night = isNightNow();
    const cold = Math.max(0, Math.min(1, (12 - car.T) / 22));
    // корпус и пол
    ctx.fillStyle = '#0d1428'; rr(-12.3, -1.7, 24.6, 3.4, 0.9); ctx.fill();
    ctx.fillStyle = '#1f2440'; ctx.fillRect(-12, -1.55, 24, 3.1);
    // ковровая дорожка в коридоре
    ctx.fillStyle = '#4a2a2e'; ctx.fillRect(-9.2, 0.38, 18.4, 0.44);
    ctx.fillStyle = '#5a3a32'; ctx.fillRect(-9.2, 0.42, 18.4, 0.04); ctx.fillRect(-9.2, 0.74, 18.4, 0.04);
    const sw = 18.4 / 9;
    for (let sec = 0; sec < 9; sec++) {
      const x0 = 9.2 - sw * (sec + 1);
      // перегородки
      ctx.fillStyle = '#3a4670';
      ctx.fillRect(x0 - 0.03, -1.55, 0.06, 1.75);
      // полки
      for (const bx of [x0 + 0.08, x0 + sw - 0.68]) {
        ctx.fillStyle = '#2c3762'; ctx.fillRect(bx, -1.5, 0.6, 1.62);
        ctx.fillStyle = '#4a5a8a'; ctx.fillRect(bx + 0.05, -1.45, 0.5, 1.52);
        ctx.fillStyle = '#c9d0e2'; ctx.fillRect(bx + 0.08, -1.42, 0.44, 0.26);
      }
      // столик у окна
      ctx.fillStyle = '#6a4a2e'; ctx.fillRect(x0 + 0.72, -1.5, sw - 1.44, 0.5);
      if (night) circ(x0 + sw / 2, -1.25, 0.07, '#f5b13d');
      // боковая полка
      ctx.fillStyle = '#2c3762'; ctx.fillRect(x0 + 0.12, 1.0, sw - 0.24, 0.5);
      ctx.fillStyle = '#4a5a8a'; ctx.fillRect(x0 + 0.16, 1.04, sw - 0.32, 0.42);
      ctx.fillStyle = '#c9d0e2'; ctx.fillRect(x0 + sw - 0.5, 1.07, 0.3, 0.36);
      // окна
      const glass = car.windows ? '#d8deea' : night ? '#0a1024' : '#3a5a8a';
      ctx.fillStyle = glass;
      ctx.fillRect(x0 + 0.5, -1.62, sw - 1.0, 0.1);
      ctx.fillRect(x0 + 0.3, 1.52, sw - 0.6, 0.1);
    }
    ctx.fillStyle = '#3a4670'; ctx.fillRect(-9.23, -1.55, 0.06, 1.75);
    // котёл и угольный ящик — у переднего тамбура
    ctx.fillStyle = '#2a2236'; ctx.fillRect(9.2, -1.55, 1.6, 1.75);
    const fire = car.heat && car.box > 0;
    if (fire) {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(10.1, -1.0, 0, 10.1, -1.0, 2.2);
      g.addColorStop(0, 'rgba(255,140,50,.55)'); g.addColorStop(1, 'rgba(255,140,50,0)');
      ctx.fillStyle = g; ctx.fillRect(7.9, -3.2, 4.4, 4.4);
      ctx.globalCompositeOperation = 'source-over';
    }
    circ(10.1, -1.0, 0.42, fire ? '#ff7a2a' : '#3a3a4a');
    circ(10.1, -1.0, 0.22, fire ? '#ffd27a' : '#22222c');
    ctx.fillStyle = '#141420'; ctx.fillRect(9.3, -0.45, 1.3, 0.6);
    const fill = Math.max(0, Math.min(1, car.box / BOX_MAX));
    const r = rng(car.n);
    for (let i = 0; i < Math.round(fill * 14); i++) circ(9.4 + r() * 1.1, -0.38 + r() * 0.45, 0.07, '#05060a');
    // туалет — в заднем конце
    ctx.fillStyle = '#26304e'; ctx.fillRect(-10.8, -1.55, 1.6, 1.75);
    circ(-10.1, -0.8, 0.22, '#c9d0e2');
    // тамбуры
    ctx.fillStyle = '#151b33'; ctx.fillRect(10.8, -1.55, 1.3, 3.1); ctx.fillRect(-12.1, -1.55, 1.3, 3.1);
    ctx.strokeStyle = S.tamboursLocked ? '#f5b13d' : '#3a4670'; ctx.lineWidth = 0.06;
    ctx.strokeRect(10.85, -1.0, 1.2, 2.0); ctx.strokeRect(-12.05, -1.0, 1.2, 2.0);
    // светильники в коридоре
    ctx.globalCompositeOperation = 'lighter';
    for (let sec = 0; sec < 9; sec++) {
      const x = 9.2 - sw * (sec + 0.5);
      const g = ctx.createRadialGradient(x, 0.6, 0, x, 0.6, 1.5);
      const a = night ? 0.16 : 0.08;
      g.addColorStop(0, `rgba(255,200,120,${a})`); g.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 1.5, -0.9, 3, 3);
    }
    ctx.globalCompositeOperation = 'source-over';
    // пассажиры
    const ppl = carPeople(S, car.n);
    for (const p of ppl) {
      const sp = seatPos(p.seat);
      const lying = night && !(p.id === 'kravets');
      drawFigure(o, p, sp, lying);
    }
    // начальник поезда
    const cx = S.chiefX ?? 0;
    drawChief(o, cx, 0.6);
    // холод
    if (cold > 0) { setLocal(o.x, o.y, o.ang); ctx.fillStyle = `rgba(110,160,230,${cold * 0.35})`; ctx.fillRect(-12, -1.55, 24, 3.1); }
    // стены
    setLocal(o.x, o.y, o.ang);
    ctx.strokeStyle = '#5a6a9a'; ctx.lineWidth = 0.1; rr(-12.2, -1.6, 24.4, 3.2, 0.8); ctx.stroke();
    ctx.globalAlpha = 1;
    // подписи вблизи
    if (cam.z > 9000) {
      setScreen();
      ctx.font = '600 9px ui-monospace, Menlo, monospace';
      ctx.fillStyle = '#f5b13d';
      const [bx, by] = local2s(o, 10.0, -0.1);
      ctx.fillText('[ КОТЁЛ · ЯЩИК ' + Math.round(car.box) + ' КГ ]', bx + 8, by);
      const [tx, ty] = local2s(o, -10.1, -0.8);
      ctx.fillStyle = '#7f8cab'; ctx.fillText('WC', tx - 6, ty);
    }
  }

  function drawFigure(o, p, sp, lying) {
    const L = p.look;
    const off = sp.upper ? 0.14 : 0;
    setLocal(o.x, o.y, o.ang);
    let hx, hy;
    if (lying) {
      if (!sp.side) {
        // поперёк вагона, голова к окну
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(sp.x - 0.24 + off, -1.25, 0.5, 1.35);
        ctx.fillStyle = blanket(p); rr(sp.x - 0.24 + off, -1.15, 0.48, 1.22, 0.12); ctx.fill();
        hx = sp.x + off; hy = -1.3;
      } else {
        ctx.fillStyle = blanket(p); rr(sp.x - 0.7, 1.05 + off * 0.2, 1.22, 0.4, 0.12); ctx.fill();
        hx = sp.x + 0.68; hy = 1.25;
      }
    } else {
      if (!sp.side) { hx = sp.x + off * 0.5; hy = -0.6 + (sp.upper ? -0.45 : 0); }
      else { hx = sp.x + (sp.upper ? 0.4 : -0.3); hy = 1.25; }
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ell(hx + 0.04, hy + 0.05, 0.26, 0.2);
      ctx.fillStyle = L.coat; ell(hx, hy, 0.25, 0.19);
    }
    const head = L.hat ? L.hatColor : L.hair;
    circ(hx, hy, 0.13, L.skin);
    if (L.hat === 'ushanka' || L.hat === 'knit' || L.hat === 'kerchief') circ(hx, hy, 0.135, head);
    else { ctx.fillStyle = head; ctx.beginPath(); ctx.arc(hx, hy, 0.13, Math.PI * 0.6, Math.PI * 2.4); ctx.fill(); }
    if (p.health < 40) { ctx.strokeStyle = '#8fb3d9'; ctx.lineWidth = 0.04; ctx.beginPath(); ctx.arc(hx, hy, 0.2, 0, 7); ctx.stroke(); }
    const [sx, sy] = local2s(o, hx, hy);
    hits.push({ pid: p.id, sx, sy, r: Math.max(14, 0.4 * cam.z * M) });
  }
  function blanket(p) { const c = ['#5a3a4a', '#3a4a6a', '#6a5a3a', '#3a5a4a', '#5a4a6a']; return c[p.seat % c.length]; }

  function drawChief(o, x, y) {
    setLocal(o.x, o.y, o.ang);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ell(x + 0.04, y + 0.05, 0.27, 0.21);
    ctx.fillStyle = '#26365f'; ell(x, y, 0.26, 0.2);
    ctx.fillStyle = '#f5b13d'; ctx.fillRect(x - 0.03, y - 0.2, 0.06, 0.4);
    circ(x, y, 0.13, '#1a2440');
    circ(x + 0.03, y, 0.05, '#f5b13d');
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, 0.8);
    g.addColorStop(0, 'rgba(245,177,61,.25)'); g.addColorStop(1, 'rgba(245,177,61,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
    ctx.globalCompositeOperation = 'source-over';
  }

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function circ(x, y, r, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
  function ell(x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 7); ctx.fill(); }
  function isNightNow() { const m = S.t % DAY; return m >= 20 * 60 || m < 7 * 60; }

  function drawTrain(ch, time, dt) {
    const z = cam.z;
    unitHits = [];
    hits = [];
    const moving = S.speed > 0 && !S.stop;
    if (z < 150) {
      const p = back(ch, TRAIN_LEN / 2);
      const [sx, sy] = w2s(p.x, p.y);
      setScreen();
      const pulse = (time / 1000) % 1.6 / 1.6;
      ctx.strokeStyle = `rgba(245,177,61,${1 - pulse})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, 6 + pulse * 18, 0, 7); ctx.stroke();
      ctx.fillStyle = '#f5b13d'; ctx.shadowColor = '#f5b13d'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(sx, sy, 5, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      ctx.font = '800 15px "Avenir Next Condensed","Arial Narrow",sans-serif';
      ctx.fillText('ВЫ', sx - 26, sy + 5);
      return;
    }
    if (z < 700) {
      setWorld();
      ctx.strokeStyle = '#f5b13d'; ctx.lineCap = 'butt';
      ctx.shadowColor = '#f5b13d'; ctx.shadowBlur = 10;
      ctx.lineWidth = Math.max(4 / z, 0.0034);
      ctx.beginPath();
      for (let b = 0; b <= TRAIN_LEN; b += 0.01) { const p = back(ch, b); if (b === 0) ctx.moveTo(p.x - cam.x, p.y - cam.y); else ctx.lineTo(p.x - cam.x, p.y - cam.y); }
      ctx.stroke(); ctx.shadowBlur = 0;
      const p = back(ch, 0);
      const [sx, sy] = w2s(p.x, p.y);
      setScreen(); ctx.fillStyle = '#f5b13d'; ctx.font = '800 15px "Avenir Next Condensed","Arial Narrow",sans-serif';
      ctx.fillText('ВЫ', sx + 10, sy);
      return;
    }
    const units = placeUnits(ch);
    // фара ночью
    if (isNightNow() && !thermal) {
      const lo = units[0];
      setLocal(lo.x, lo.y, lo.ang);
      const g = ctx.createLinearGradient(10, 0, 120, 0);
      g.addColorStop(0, 'rgba(255,231,160,.45)'); g.addColorStop(1, 'rgba(255,231,160,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(10.6, -0.5); ctx.lineTo(120, -14); ctx.lineTo(120, 14); ctx.lineTo(10.6, 0.5); ctx.fill();
    }
    for (const o of units) if (o.u.k === 'car') windowGlow(o, S.cars[o.u.n - 1]);
    const interiorA = Math.max(0, Math.min(1, (z - Z_INTERIOR) / 2500));
    for (const o of units) {
      if (o.u.k === 'loco') drawLoco(o, moving);
      else if (o.u.k === 'tender') drawTender(o);
      else {
        const car = S.cars[o.u.n - 1];
        const chief = o.u.n === S.playerCar;
        if (chief && interiorA > 0) {
          drawInterior(o, car, interiorA);
          if (interiorA < 1) drawCarRoof(o, car, 1 - interiorA);
        } else drawCarRoof(o, car);
        const [sx, sy] = w2s(o.x, o.y);
        unitHits.push({ n: o.u.n, sx, sy, o });
      }
    }
    // дым из трубы
    const lo = units[0];
    if (moving && !thermal) {
      const c = Math.cos(lo.ang), s = Math.sin(lo.ang);
      if (Math.random() < 0.6) puffs.push({ x: lo.x + c * 7.8 * M, y: lo.y + s * 7.8 * M, r: 0.6, age: 0, vx: (Math.random() - 0.5) * 0.002, vy: (Math.random() - 0.5) * 0.002 });
    }
    setWorld();
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i];
      p.age += dt; p.r += dt * 2.6; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.age > 3.5) { puffs.splice(i, 1); continue; }
      ctx.fillStyle = `rgba(200,210,230,${0.22 * (1 - p.age / 3.5)})`;
      ctx.beginPath(); ctx.arc(p.x - cam.x, p.y - cam.y, p.r * M, 0, 7); ctx.fill();
    }
    if (puffs.length > 140) puffs.splice(0, puffs.length - 140);
    // подписи вагонов
    if (z < Z_INTERIOR + 1500) {
      setScreen();
      const la = z < Z_INTERIOR ? 1 : Math.max(0, 1 - (z - Z_INTERIOR) / 1500);
      ctx.globalAlpha = la;
      ctx.font = '10px ui-monospace, Menlo, monospace';
      ctx.textBaseline = 'middle';
      for (const h of unitHits) {
        const car = S.cars[h.n - 1];
        const ppl = carPeople(S, h.n).length;
        const [ex, ey] = local2s(h.o, 0, 2.6);
        const [fx, fy] = local2s(h.o, 0, 1.6);
        const dx = ex - fx, dy = ey - fy, l = Math.hypot(dx, dy) || 1;
        const lx = fx + (dx / l) * 26, ly = fy + (dy / l) * 26;
        ctx.strokeStyle = 'rgba(223,230,242,.4)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(fx + (dx / l) * 4, fy + (dy / l) * 4); ctx.lineTo(lx, ly); ctx.stroke();
        const left = dx < 0;
        let label = `${h.n} · ${car.locked ? 'ЗАКРЫТ' : fmtTemp(car.T)}`;
        if (car.T < 10 && ppl) label += ' ❄';
        if (car.heat && car.box < 25 && ppl) label += ' ЯЩИК!';
        if (h.n === 9 && S.flags.alert) label += ' КРАЖА';
        ctx.fillStyle = car.T < 10 && ppl ? '#8fb3d9' : '#dfe6f2';
        const tw = ctx.measureText(label).width;
        ctx.fillText(label, left ? lx - tw - 4 : lx + 4, ly);
        if (h.n === S.playerCar) {
          ctx.fillStyle = '#f5b13d'; ctx.font = '800 14px "Avenir Next Condensed","Arial Narrow",sans-serif';
          const [ox, oy] = local2s(h.o, 0, -2.4);
          const odx = ox - fx, ody = oy - fy;
          ctx.fillText('ВЫ', ox + (odx > 0 ? 6 : -26), oy);
          ctx.font = '10px ui-monospace, Menlo, monospace';
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---------- кадр ----------
  function draw(time, extraKm) {
    if (!WORLD || !S) return;
    if (!CW) resize();
    const dt = lastT ? Math.min(0.1, (time - lastT) / 1000) : 0.016;
    lastT = time;
    if (terrainSeed !== WORLD.seed) buildTerrain();

    const ch = chain(extraKm);
    // камера следует за поездом
    if (cam.follow) {
      const zf = Math.max(0, Math.min(1, (Math.log(cam.z) - Math.log(1200)) / (Math.log(Z_INTERIOR) - Math.log(1200))));
      let b0 = TRAIN_LEN / 2;
      let ofs = 0;
      for (const u of UNITS) { if (u.k === 'car' && u.n === S.playerCar) break; ofs += u.len + GAP; }
      const bChief = ofs + 12.25 * M;
      const b = b0 + (bChief - b0) * zf;
      const p = back(ch, b);
      const f = back(ch, Math.max(0, b - 0.06)), r = back(ch, b + 0.06);
      // плавно только при возврате к поезду, дальше — жёстко за ним
      cam.lock = cam.init ? Math.min(1, (cam.lock || 0) + dt * 1.5) : 1;
      const k = cam.lock >= 1 ? 1 : 1 - Math.exp(-dt * 8);
      cam.x += (p.x - cam.x) * k; cam.y += (p.y - cam.y) * k;
      const heading = Math.atan2(f.y - r.y, f.x - r.x);
      const rf = Math.max(0, Math.min(1, (Math.log(cam.z) - Math.log(30)) / (Math.log(300) - Math.log(30))));
      let target = (-heading - Math.PI / 2) * rf;
      if (rf < 1) {
        const full = -heading - Math.PI / 2;
        let d = ((full - 0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        target = d * rf;
      }
      let d = ((target - cam.rot + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      cam.rot += d * (cam.init ? 1 - Math.exp(-dt * 4) : 1);
      cam.init = true;
    } else if (cam.toNorth) {
      let d = ((0 - cam.rot + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      cam.rot += d * (1 - Math.exp(-dt * 5));
      if (Math.abs(d) < 0.001) cam.toNorth = false;
    }
    if (cam.tz !== cam.z) {
      const k = 1 - Math.exp(-dt * 8);
      const nz = Math.exp(Math.log(cam.z) + (Math.log(cam.tz) - Math.log(cam.z)) * k);
      if (!cam.follow && cam.anchor) {
        const before = s2w(cam.anchor[0], cam.anchor[1]);
        cam.z = nz;
        const after = s2w(cam.anchor[0], cam.anchor[1]);
        cam.x += before[0] - after[0]; cam.y += before[1] - after[1];
      } else cam.z = nz;
      if (Math.abs(Math.log(cam.z / cam.tz)) < 0.002) cam.z = cam.tz;
    }

    const bb = viewBox(40);
    // фон
    setScreen();
    if (thermal) { ctx.fillStyle = '#141c66'; ctx.fillRect(0, 0, CW, CH); }
    else {
      const g = ctx.createRadialGradient(CW / 2, CH * 0.45, 20, CW / 2, CH * 0.45, CH * 0.8);
      g.addColorStop(0, '#22365e'); g.addColorStop(1, '#14213d');
      ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
    }
    // рельеф
    const ta = cam.z < 60 ? 1 : Math.max(0, 1 - (cam.z - 60) / 600);
    if (ta > 0 && !thermal) {
      setWorld();
      ctx.globalAlpha = ta;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(terrain, -cam.x, -cam.y, WORLD_W, WORLD_H);
      ctx.globalAlpha = 1;
    } else if (!thermal && cam.z > 300) {
      // снег под ногами
      setScreen();
      ctx.fillStyle = 'rgba(40,60,100,.18)'; ctx.fillRect(0, 0, CW, CH);
    }
    const legs = routeLegs(S);
    const routeSet = new Set(S.route);
    drawWater(bb);
    drawTracks(bb, legs);
    drawBridges(bb);
    drawTrees(bb);
    drawStations(bb, routeSet);
    drawSledges(time);
    drawTrain(ch, time, dt);

    // снег на экране
    setScreen();
    const bliz = blizzard(S);
    ctx.fillStyle = thermal ? '#6a7ad8' : '#dfe6f2';
    const run = typeof isRunning === 'function' && isRunning();
    for (const f of snow) {
      f.y += (0.0012 + (bliz ? 0.004 : 0)) * f.v * (run ? 1 : 0.3) * dt * 60;
      f.x += (bliz ? 0.002 : 0.0002) * f.v * dt * 60;
      if (f.y > 1) { f.y = 0; f.x = Math.random(); }
      if (f.x > 1) f.x = 0;
      ctx.globalAlpha = 0.45 + f.r / 4;
      ctx.beginPath(); ctx.arc(f.x * CW, f.y * CH, f.r * (bliz ? 1.3 : 1), 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (S.stop && S.stop.noCoal && !thermal) { ctx.fillStyle = 'rgba(10,15,30,.25)'; ctx.fillRect(0, 0, CW, CH); }
    // масштабная линейка
    const scaleKm = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 250].find((k) => k * cam.z > 60) || 250;
    ctx.fillStyle = '#7f8cab'; ctx.fillRect(CW - 16 - scaleKm * cam.z, CH - 10, scaleKm * cam.z, 2);
    ctx.font = '9px ui-monospace, Menlo, monospace';
    ctx.fillText(scaleKm < 1 ? Math.round(scaleKm * 1000) + ' М' : scaleKm + ' КМ', CW - 16 - scaleKm * cam.z, CH - 16);
  }

  // ---------- ввод ----------
  const ptrs = new Map();
  let drag = null;
  function onDown(e) {
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    drag = { moved: false, t: performance.now(), x: e.offsetX, y: e.offsetY, pinch: ptrs.size === 2 ? pinchInfo() : null };
  }
  function pinchInfo() {
    const [a, b] = [...ptrs.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }
  function onMove(e) {
    if (!ptrs.has(e.pointerId) || !drag) return;
    const prev = ptrs.get(e.pointerId);
    ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (ptrs.size === 2) {
      const p = pinchInfo();
      if (drag.pinch) {
        zoomAt(p.mx, p.my, p.d / drag.pinch.d);
        if (!cam.follow) panBy(p.mx - drag.pinch.mx, p.my - drag.pinch.my);
      }
      drag.pinch = p; drag.moved = true;
      return;
    }
    const dx = e.offsetX - prev.x, dy = e.offsetY - prev.y;
    if (!drag.moved && Math.hypot(e.offsetX - drag.x, e.offsetY - drag.y) < 7) return;
    if (!drag.moved) { drag.moved = true; }
    // в режиме «Поезд» камера жёстко держит состав — перетаскивание ничего не сдвигает
    if (cam.follow) return;
    cam.anchor = null;
    panBy(dx, dy);
  }
  function panBy(dx, dy) {
    const a = s2w(0, 0), b = s2w(dx, dy);
    cam.x -= b[0] - a[0]; cam.y -= b[1] - a[1];
  }
  function onUp(e) {
    ptrs.delete(e.pointerId);
    if (drag && !drag.moved && ptrs.size === 0 && performance.now() - drag.t < 500) tap(e.offsetX, e.offsetY);
    if (ptrs.size === 0) drag = null;
    else drag.pinch = null;
  }
  function onWheel(e) {
    e.preventDefault();
    const f = Math.exp(-e.deltaY * 0.0018);
    cam.anchor = [e.offsetX, e.offsetY];
    cam.tz = Math.max(Z_MIN, Math.min(Z_MAX, cam.tz * f));
  }
  function tap(x, y) {
    for (const h of hits) if (Math.hypot(h.sx - x, h.sy - y) < h.r) { View.onPerson(h.pid); return; }
    if (cam.z >= 700) {
      let best = null;
      for (const h of unitHits) {
        const d = Math.hypot(h.sx - x, h.sy - y);
        if (d < Math.max(30, 12.5 * M * cam.z) && (!best || d < best.d)) best = { n: h.n, d };
      }
      if (best) {
        if (cam.z >= Z_INTERIOR && best.n === S.playerCar) return;
        View.onCar(best.n, cam.z >= Z_INTERIOR);
        return;
      }
    }
    let best = null;
    for (const h of stationHits) {
      const d = Math.hypot(h.sx - x, h.sy - y);
      if (d < 22 && (!best || d < best.d)) best = { id: h.id, d };
    }
    if (best) View.onStation(best.id);
  }

  function resize() {
    const r = cv.getBoundingClientRect();
    DPR = Math.min(2, window.devicePixelRatio || 1);
    CW = r.width; CH = r.height;
    cv.width = Math.round(CW * DPR); cv.height = Math.round(CH * DPR);
  }

  function init(canvas) {
    cv = canvas; ctx = cv.getContext('2d');
    cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    cv.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', resize);
  }

  return {
    init, draw, resize, cam,
    zoomIn() { cam.anchor = null; cam.tz = Math.min(Z_MAX, cam.tz * 2.2); if (!cam.follow) cam.anchor = [CW / 2, CH / 2]; },
    zoomOut() { cam.anchor = null; cam.tz = Math.max(Z_MIN, cam.tz / 2.2); if (!cam.follow) cam.anchor = [CW / 2, CH / 2]; },
    follow() { cam.follow = true; cam.lock = 0; if (cam.tz < 300) cam.tz = Z_DEFAULT; },
    free() { cam.follow = false; cam.anchor = null; cam.toNorth = true; },
    world() { cam.follow = false; cam.anchor = null; cam.toNorth = true; cam.tz = fitZoom(); cam.x = WORLD_W / 2; cam.y = WORLD_H / 2; },
    interior() { if (!cam.follow) cam.lock = 0; cam.follow = true; cam.tz = Math.max(18000, Math.min(26000, CH / 0.026)); },
    showNode(id) { const n = WORLD.nodes[id]; cam.follow = false; cam.toNorth = true; cam.anchor = null; cam.x = n.x; cam.y = n.y; cam.tz = 40; },
    onPerson() {}, onCar() {}, onStation() {},
  };
})();

globalThis.View = View;
