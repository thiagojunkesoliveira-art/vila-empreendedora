'use strict';
// ================= Pixel art, drawn in code =================
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function sprite(w, h, draw) {
  const c = canvas(w, h), g = c.getContext('2d');
  const P = (x, y, col, pw = 1, ph = 1) => { g.fillStyle = col; g.fillRect(x, y, pw, ph); };
  draw(P, g, w, h);
  return c;
}
// 1px dark outline around opaque pixels: makes sprites read clearly.
function outline(c, col = '#16140f') {
  const w = c.width, h = c.height, g = c.getContext('2d');
  const d = g.getImageData(0, 0, w, h).data;
  const a = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[(y * w + x) * 4 + 3]);
  g.fillStyle = col;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (a(x, y)) continue;
    if (a(x + 1, y) > 128 || a(x - 1, y) > 128 || a(x, y + 1) > 128 || a(x, y - 1) > 128) g.fillRect(x, y, 1, 1);
  }
  return c;
}
// Filled blob made of circles, shaded from the top-left.
function blob(P, circles, pal, seed) {
  const r = mulberry32(seed);
  let minX = 99, maxX = 0, minY = 99, maxY = 0;
  for (const [cx, cy, rr] of circles) { minX = Math.min(minX, cx - rr); maxX = Math.max(maxX, cx + rr); minY = Math.min(minY, cy - rr); maxY = Math.max(maxY, cy + rr); }
  for (let y = Math.floor(minY); y <= maxY; y++) for (let x = Math.floor(minX); x <= maxX; x++) {
    let best = -1;
    for (const [cx, cy, rr] of circles) { const q = 1 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / rr; if (q > best) best = q; }
    if (best < 0) continue;
    const top = (y - minY) / (maxY - minY + 1), left = (x - minX) / (maxX - minX + 1);
    let shade = top * 0.75 + left * 0.25 + (r() - 0.5) * 0.25;
    if (best < 0.12) shade += 0.35;
    P(x, y, pal[Math.max(0, Math.min(pal.length - 1, Math.floor(shade * pal.length)))]);
  }
}

// ---------- Ground (drawn straight into cached chunks) ----------
const GPAL = {
  [G.GRASS]: ['#5b7443', '#536b3d', '#637d49', '#6f8a52'],
  [G.DIRT]: ['#6f5b40', '#655238', '#7a664a', '#5c4a33'],
  [G.ROAD]: ['#3c3e41', '#37393c', '#414346', '#2f3134'],
  [G.WATER]: ['#2d5568', '#284d5f', '#33607a', '#3f7590'],
  [G.FLOOR]: ['#6b4f35', '#5f452e', '#76583b', '#523b27'],
  [G.TILE]: ['#76746c', '#6c6a63', '#807e76', '#5e5c56'],
};
function drawGround(g, type, tx, ty, px, py, nb) {
  const pal = GPAL[type];
  const r = mulberry32((tx * 7349 + ty * 9151) ^ 0x5bd1);
  g.fillStyle = pal[0];
  g.fillRect(px, py, TS, TS);
  const P = (x, y, c, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(px + x, py + y, w, h); };
  if (type === G.GRASS) {
    for (let i = 0; i < 10; i++) P(Math.floor(r() * 16), Math.floor(r() * 16), r() < 0.5 ? pal[1] : pal[2]);
    for (let i = 0; i < 3; i++) { const x = Math.floor(r() * 15), y = Math.floor(r() * 14); P(x, y, pal[3]); P(x, y + 1, pal[2]); }
    if (r() < 0.06) { const x = Math.floor(r() * 14), y = Math.floor(r() * 14); P(x, y, r() < 0.5 ? '#d9c86a' : '#c9d3e0'); }
  } else if (type === G.DIRT) {
    for (let i = 0; i < 9; i++) P(Math.floor(r() * 16), Math.floor(r() * 16), pal[1 + Math.floor(r() * 3)]);
  } else if (type === G.ROAD) {
    for (let i = 0; i < 12; i++) P(Math.floor(r() * 16), Math.floor(r() * 16), pal[1 + Math.floor(r() * 2)]);
    if (r() < 0.25) { let x = Math.floor(r() * 12), y = Math.floor(r() * 12); for (let i = 0; i < 6; i++) { P(x, y, pal[3]); x += r() < 0.5 ? 1 : 0; y += 1; } }
    if (nb.lineH && tx % 3 !== 0) P(2, 7, '#8a7a45', 12, 2);
    if (nb.lineV && ty % 3 !== 0) P(7, 2, '#8a7a45', 2, 12);
  } else if (type === G.WATER) {
    for (let i = 0; i < 5; i++) P(Math.floor(r() * 14), Math.floor(r() * 16), pal[1], 3, 1);
    for (let i = 0; i < 3; i++) P(Math.floor(r() * 13), Math.floor(r() * 16), pal[2], 3, 1);
    if (!nb.n) { P(0, 0, '#6f8a5a', 16, 1); P(0, 1, pal[3], 16, 1); }
  } else if (type === G.FLOOR) {
    for (let y = 0; y < 16; y += 4) { P(0, y, pal[3], 16, 1); P(((ty * 5 + y) % 16), y + 1, pal[1], 1, 3); }
    for (let i = 0; i < 6; i++) P(Math.floor(r() * 16), Math.floor(r() * 16), pal[2]);
  } else if (type === G.TILE) {
    P(0, 0, pal[3], 16, 1); P(0, 8, pal[3], 16, 1); P(0, 0, pal[3], 1, 16); P(8, 0, pal[3], 1, 16);
    for (let i = 0; i < 6; i++) P(Math.floor(r() * 16), Math.floor(r() * 16), pal[r() < 0.5 ? 1 : 2]);
  }
}

// ---------- Objects ----------
const SPR = {};
function buildSprites() {
  const leaf = [['#86a65a', '#6f8f48', '#5c7a3c', '#4a6631', '#3a5227'], ['#93a255', '#7c8b45', '#677539', '#525e2d', '#414b24'], ['#a39a52', '#8a8243', '#716b37', '#5b562c', '#454121']];
  SPR.tree = leaf.map((pal, i) => outline(sprite(22, 28, (P) => {
    P(9, 18, '#5a3d26', 4, 8); P(9, 18, '#6e4c30', 1, 8); P(12, 18, '#45301e', 1, 8); P(8, 25, '#45301e', 6, 1);
    blob(P, [[11, 10, 8.5], [6, 14, 5.5], [16, 14, 5.5], [11, 15, 6]], pal, 11 + i);
  })));
  SPR.pine = [0, 1].map((i) => outline(sprite(18, 28, (P) => {
    P(8, 21, '#4e3622', 3, 6);
    const pal = i ? ['#5d7e52', '#4c6a44', '#3d5737', '#2f452b'] : ['#55784a', '#46653e', '#385233', '#2b4028'];
    const layers = [[9, 2, 3, 7], [9, 7, 5, 8], [9, 12, 7, 9]];
    const r = mulberry32(5 + i);
    for (const [cx, top, half, h] of layers) for (let y = 0; y < h; y++) {
      const w = Math.round(half * (y + 1) / h);
      for (let x = -w; x <= w; x++) P(cx + x, top + y, pal[Math.min(3, Math.floor((x + w) / (2 * w + 1) * 2.2 + y / h * 1.4 + r() * 0.5))]);
    }
  })));
  SPR.rock = [0, 1, 2].map((i) => outline(sprite(16, 14, (P) => {
    blob(P, i === 2 ? [[6, 8, 5], [11, 9, 4.5]] : [[8, 8, 6.5], [5, 9, 4]], ['#b2b0a8', '#9a9890', '#86847d', '#706e68', '#5c5a55'], 3 + i);
    P(5, 5, '#c8c6be', 2, 1);
  })));
  SPR.scrap = [0, 1].map((i) => outline(sprite(16, 14, (P) => {
    P(2, 7, '#7d5236', 7, 4); P(3, 7, '#9a6640', 5, 1); P(7, 4, '#7d8288', 6, 5); P(8, 4, '#9aa0a6', 4, 1);
    P(1, 10, '#2a2826', 5, 3); P(2, 11, '#47423d', 3, 1); P(10, 9, '#a06b3e', 5, 3); P(11, 9, '#c0864f', 3, 1);
    if (i) { P(4, 3, '#6d7378', 3, 4); P(12, 2, '#8a5a35', 2, 4); }
  })));
  SPR.car = [['#6f4a35', '#8a5c40', '#563826'], ['#4a5a66', '#5d707e', '#38454f'], ['#6b6a3c', '#86844b', '#51502d']].map((c) => outline(sprite(16, 16, (P) => {
    P(2, 1, c[2], 12, 15); P(3, 1, c[0], 10, 14); P(3, 1, c[1], 10, 2);
    P(4, 4, '#2a3238', 8, 3); P(5, 4, '#3d4a52', 3, 1); P(4, 11, '#2a3238', 8, 2);
    P(1, 3, '#1e1d1b', 1, 3); P(14, 3, '#1e1d1b', 1, 3); P(1, 11, '#1e1d1b', 1, 3); P(14, 11, '#1e1d1b', 1, 3);
    P(6, 8, '#9a5b33', 3, 2); P(10, 13, '#9a5b33', 2, 1);
  })));
  SPR.bush = outline(sprite(16, 13, (P) => {
    blob(P, [[8, 7, 6.5], [4, 8, 4], [12, 8, 4]], ['#7b9a52', '#668444', '#526d37', '#40562b'], 9);
    for (const [x, y] of [[5, 6], [9, 4], [11, 8], [6, 9], [8, 7]]) { P(x, y, '#c4433a'); P(x, y - 1, '#e0675a'); }
  }));
  SPR.crate = outline(sprite(14, 14, (P) => {
    P(1, 3, '#8a6640', 12, 10); P(1, 3, '#a47c4f', 12, 2); P(1, 7, '#6e5232', 12, 1); P(1, 10, '#6e5232', 12, 1);
    P(1, 3, '#7d8288', 2, 2); P(11, 3, '#7d8288', 2, 2); P(1, 11, '#7d8288', 2, 2); P(11, 11, '#7d8288', 2, 2);
    P(6, 5, '#d8b25a', 2, 2);
  }));
  SPR.stump = outline(sprite(12, 10, (P) => { P(2, 3, '#5a3d26', 8, 6); P(2, 3, '#b08a5a', 8, 3); P(4, 4, '#8f6c45', 4, 1); }));
  SPR.door = outline(sprite(16, 22, (P) => {
    P(0, 0, '#6e5232', 16, 7); P(0, 0, '#8a6640', 16, 1);
    P(0, 7, '#523a22', 16, 15); P(2, 8, '#8a6640', 12, 14); P(2, 8, '#a47c4f', 12, 1);
    P(7, 8, '#6e5232', 1, 14); P(10, 14, '#d8b25a', 2, 2); P(2, 12, '#6e5232', 12, 1); P(2, 18, '#6e5232', 12, 1);
  }));
  SPR.fire = [0, 1, 2].map((f) => sprite(16, 18, (P) => {
    for (const [x, y] of [[2, 13], [5, 15], [9, 15], [12, 13], [3, 11], [12, 10]]) { P(x, y, '#8a877e', 3, 2); P(x, y, '#a19e95', 2, 1); }
    P(4, 12, '#5a3d26', 8, 2); P(5, 11, '#6e4c30', 6, 1);
    const r = mulberry32(70 + f);
    for (let y = 0; y < 9; y++) {
      const w = Math.max(0, Math.round((9 - y) * 0.45 + (r() - 0.5) * 2));
      for (let x = -w; x <= w; x++) P(8 + x + (f === 1 ? (y % 3 === 0 ? 1 : 0) : 0), 11 - y, y < 3 ? '#f08a2c' : y < 6 ? (Math.abs(x) < w ? '#ffc04a' : '#f08a2c') : '#ffe08a');
    }
  }));
  SPR.torch = [0, 1, 2].map((f) => sprite(8, 16, (P) => {
    P(3, 7, '#5a3d26', 2, 9); P(2, 6, '#3d2c1c', 4, 2);
    const h = 4 + (f % 2);
    for (let y = 0; y < h; y++) { const w = y < h - 2 ? 1 : 0; for (let x = -w; x <= w; x++) P(4 + x - (f === 2 && y > 1 ? 1 : 0), 5 - y, y === 0 ? '#f08a2c' : '#ffd06a'); }
  }));
  SPR.bench = outline(sprite(16, 16, (P) => {
    P(1, 4, '#8a6640', 14, 6); P(1, 4, '#a47c4f', 14, 1); P(1, 9, '#6e5232', 14, 1);
    P(2, 10, '#523a22', 2, 5); P(12, 10, '#523a22', 2, 5);
    P(3, 5, '#9aa0a6', 4, 1); P(3, 6, '#6e5232', 1, 2); P(9, 5, '#7d8288', 1, 3); P(10, 5, '#c4433a', 3, 2); P(13, 6, '#d8b25a', 1, 1);
  }));
  SPR.bed = outline(sprite(14, 16, (P) => {
    P(1, 1, '#6e5232', 12, 15); P(2, 2, '#d9d4c4', 10, 4); P(3, 3, '#efebdf', 8, 2);
    P(2, 6, '#5e7a8a', 10, 9); P(2, 6, '#7895a6', 10, 1); P(2, 10, '#4c6575', 10, 1);
  }));
  SPR.farm = [0, 1, 2, 3].map((st) => sprite(16, 16, (P) => {
    P(1, 1, '#4a3826', 14, 14); P(1, 1, '#5c4630', 14, 1);
    for (let y = 3; y < 15; y += 4) P(2, y, '#3a2c1e', 12, 1);
    for (let y = 2; y < 14; y += 4) for (let x = 3; x < 14; x += 4) {
      if (st === 1) { P(x, y + 1, '#7cb04a'); }
      if (st === 2) { P(x, y, '#6f9a44', 1, 2); P(x - 1, y, '#8cbf56'); P(x + 1, y, '#8cbf56'); }
      if (st === 3) { P(x, y - 1, '#5e8a3c', 1, 3); P(x - 1, y, '#7cb04a'); P(x + 1, y - 1, '#7cb04a'); P(x - 1, y + 1, '#d0483c', 2, 2); P(x - 1, y + 1, '#ec6a5a'); }
    }
  }));
  SPR.spikes = outline(sprite(16, 14, (P) => {
    for (let i = 0; i < 4; i++) { const x = 1 + i * 4; P(x, 6, '#6e5232', 2, 7); P(x, 3, '#8a6640', 2, 3); P(x, 2, '#c8c2b2', 2, 1); }
    P(0, 11, '#523a22', 16, 2);
  }));
  SPR.turret = outline(sprite(16, 16, (P) => {
    P(2, 8, '#55534d', 12, 7); P(2, 8, '#6c6a63', 12, 1); P(4, 5, '#7d8288', 8, 6); P(5, 5, '#9aa0a6', 6, 1); P(7, 7, '#2a2826', 2, 2);
  }));
  SPR.chest = outline(sprite(14, 13, (P) => {
    P(1, 2, '#8a6640', 12, 10); P(1, 2, '#a47c4f', 12, 3); P(1, 5, '#523a22', 12, 1); P(6, 4, '#d8b25a', 2, 3); P(1, 2, '#6e5232', 1, 10); P(12, 2, '#6e5232', 1, 10);
  }));
  SPR.bench2 = outline(sprite(16, 16, (P) => {
    P(2, 10, '#6c6a63', 3, 5); P(11, 10, '#6c6a63', 3, 5); P(2, 10, '#86847d', 1, 5); P(11, 10, '#86847d', 1, 5);
    P(1, 4, '#9c9a92', 14, 6); P(1, 4, '#b8b6ae', 14, 1); P(1, 9, '#6c6a63', 14, 1); P(5, 6, '#86847d', 1, 3); P(10, 5, '#86847d', 1, 4);
    P(3, 2, '#4a4c50', 5, 3); P(2, 2, '#4a4c50', 1, 1); P(3, 2, '#6a6c70', 5, 1); // anvil
    P(10, 3, '#7a5634', 4, 1); P(12, 2, '#8a9096', 2, 2); // hammer
  }));
  SPR.bench3 = outline(sprite(16, 16, (P) => {
    P(2, 10, '#3a3c3e', 2, 5); P(12, 10, '#3a3c3e', 2, 5); P(3, 13, '#3a3c3e', 10, 1);
    P(1, 5, '#6a7076', 14, 5); P(1, 5, '#9aa0a6', 14, 1); P(1, 9, '#4a4c50', 14, 1); P(4, 7, '#c9b06a', 1, 1); P(11, 7, '#c9b06a', 1, 1);
    P(2, 2, '#4a4c50', 4, 3); P(2, 2, '#7d8288', 4, 1); P(6, 3, '#4a4c50', 1, 1); // vise
    P(9, 2, '#b0453a', 5, 3); P(9, 2, '#d0604f', 5, 1); P(11, 1, '#3a3c3e', 1, 1); // toolbox
  }));
  SPR.sapling = outline(sprite(12, 12, (P) => {
    P(5, 5, '#6e4c30', 1, 6); P(3, 10, '#4a3826', 6, 1);
    P(3, 3, '#7cb04a', 3, 2); P(6, 2, '#8cbf56', 3, 2); P(4, 1, '#9ccf66', 2, 1); P(2, 5, '#6f9a44', 2, 1); P(7, 4, '#6f9a44', 2, 1);
  }));
  const fruitLeaf = ['#9cbf5c', '#86a84e', '#709140', '#5b7934', '#476129'];
  SPR.fruit = [0, 1, 2, 3].map((st) => outline(sprite(22, 28, (P) => {
    if (st === 0) { P(10, 20, '#6e4c30', 2, 6); P(8, 25, '#4a3826', 6, 1); blob(P, [[11, 19, 3.5]], fruitLeaf, 61); return; }
    const big = st >= 2;
    P(10, big ? 17 : 19, '#5a3d26', 3, big ? 9 : 7); P(10, big ? 17 : 19, '#6e4c30', 1, big ? 9 : 7); P(9, 25, '#45301e', 5, 1);
    blob(P, big ? [[11, 10, 8], [6, 14, 5], [16, 14, 5], [11, 15, 5.5]] : [[11, 15, 5.5], [8, 17, 3.5], [14, 17, 3.5]], fruitLeaf, 63 + st);
    if (st === 3) for (const [x, y] of [[6, 10], [10, 6], [15, 9], [8, 15], [13, 14], [17, 15], [11, 11]]) { P(x, y, '#e2702e', 2, 2); P(x, y, '#f6a050'); }
  })));
  // animals face right; frame 0/1 walk
  const flip = (c) => { const f = canvas(c.width, c.height), g = f.getContext('2d'); g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(c, 0, 0); return f; };
  const animal = (w, h, draw) => [0, 1].map((fr) => { const c = outline(sprite(w, h, (P) => draw(P, fr))); return [c, flip(c)]; });
  SPR.animal = {
    galinha: animal(11, 11, (P, fr) => {
      P(fr ? 4 : 3, 8, '#e8a83a', 1, 2); P(fr ? 5 : 6, 8, '#e8a83a', 1, 2);
      blob(P, [[4.5, 6, 3.5], [6.5, 5.5, 3]], ['#f6f2e8', '#e6e0d2', '#d2cbbb', '#b8b09e'], 5);
      P(0, 3, '#e6e0d2', 2, 3); P(7, 1, '#f6f2e8', 3, 4); P(8, 0, '#d8443a', 2, 1); P(9, 2, '#1e1a16'); P(10, 3, '#e8a83a'); P(9, 4, '#d8443a');
    }),
    ovelha: animal(15, 12, (P, fr) => {
      for (const [x, d] of [[3, 0], [5, 1], [9, 0], [11, 1]]) P(x + (fr && d ? 1 : 0) - (fr && !d ? 1 : 0), 8, '#3a3530', 1, 3);
      blob(P, [[5, 5.5, 4], [9, 5.5, 4], [7, 4, 4], [7, 7, 3.5]], ['#f4f1ea', '#e4e0d6', '#cfcabe', '#b6b0a3'], 7);
      P(11, 3, '#4a4540', 3, 4); P(12, 2, '#4a4540', 2, 1); P(13, 4, '#e8e2d2'); P(10, 3, '#3a3530', 1, 2);
    }),
    vaca: animal(19, 15, (P, fr) => {
      for (const [x, d] of [[3, 0], [6, 1], [10, 0], [13, 1]]) { const xx = x + (fr ? (d ? 1 : -1) : 0); P(xx, 10, '#efebe2', 2, 3); P(xx, 13, '#3a3530', 2, 1); }
      P(2, 3, '#efebe2', 13, 8); P(2, 3, '#ffffff', 13, 1); P(2, 10, '#cfc9bc', 13, 1);
      P(4, 4, '#2a2826', 3, 3); P(9, 6, '#2a2826', 4, 2); P(11, 3, '#2a2826', 2, 2); P(3, 8, '#2a2826', 2, 1);
      P(14, 2, '#efebe2', 4, 6); P(16, 6, '#e0a0a0', 2, 2); P(15, 3, '#1e1a16'); P(14, 1, '#d8cfb8'); P(17, 1, '#d8cfb8'); P(13, 3, '#2a2826', 1, 2);
      P(1, 3, '#2a2826', 1, 5); P(9, 10, '#e8b0b0', 2, 1);
    }),
  };
}

// ---------- Walls, fences and gates that connect to their neighbors ----------
// mask bits: 1 north, 2 east, 4 south, 8 west. Sprites are 16x22 and drawn 6px above the tile.
const WALLPAL = {
  wood: { top: '#8a6640', face: '#74532f', line: '#523a22', hi: '#a47c4f', dark: '#2e2012' },
  stone: { top: '#9c9a92', face: '#7e7c75', line: '#5f5d58', hi: '#b8b6ae', dark: '#34332f' },
  ruin: { top: '#8a877e', face: '#6c6a63', line: '#55534d', hi: '#a19e95', dark: '#2e2d29' },
};
const WALLC = {};
function wallSprite(kind, m) {
  const key = kind + m;
  if (WALLC[key]) return WALLC[key];
  const c = WALLPAL[kind];
  const N = m & 1, E = m & 2, Sd = m & 4, Wd = m & 8;
  const vertical = (N || Sd) && !(E || Wd);
  const spr = sprite(16, 22, (P) => {
    const r = mulberry32(kind.length * 131 + m * 17);
    const capEnd = Sd ? 22 : 7;
    P(0, 0, c.top, 16, capEnd);
    // top of the wall
    if (kind === 'wood') {
      if (vertical) for (let y = N ? 2 : 1; y < capEnd; y += 4) { P(1, y, c.line, 14, 1); P(2, y + 1, c.hi, 12, 1); }
      else for (let x = 0; x < 16; x += 4) { P(x, 0, c.line, 1, capEnd); P(x + 1, N ? 0 : 1, c.hi, 2, Math.max(1, capEnd - (N ? 1 : 2))); }
    } else {
      for (let y = 0; y < capEnd; y += 4) { const o = (y / 4) % 2 ? 0 : 5; for (let x = o; x < 16; x += 10) P(x, y, c.face, 1, Math.min(4, capEnd - y)); if (y + 3 < capEnd) P(0, y + 3, c.face, 16, 1); }
      for (let i = 0; i < capEnd; i++) P(Math.floor(r() * 16), Math.floor(r() * capEnd), r() < 0.6 ? c.hi : c.face);
    }
    // front face, only on the lowest wall of a column
    if (!Sd) {
      P(0, 7, c.line, 16, 1); P(0, 8, c.face, 16, 13);
      if (kind === 'wood') for (let x = 0; x < 16; x += 4) P(x, 8, c.line, 1, 13);
      else for (let y = 8; y < 21; y += 4) { const o = (y / 4) % 2 ? 0 : 4; for (let x = o; x < 16; x += 8) P(x, y, c.line, 1, Math.min(4, 21 - y)); if (y + 3 < 21) P(0, y + 3, c.line, 16, 1); }
      for (let i = 0; i < 6; i++) P(Math.floor(r() * 16), 9 + Math.floor(r() * 11), r() < 0.5 ? c.hi : c.line);
      P(0, 21, c.dark, 16, 1);
    }
    // outer edges (none where it joins a neighbor)
    if (!N) { P(0, 0, c.dark, 16, 1); P(1, 1, c.hi, 14, 1); }
    if (!Wd) P(0, 0, c.dark, 1, 22);
    if (!E) P(15, 0, c.dark, 1, 22);
  });
  WALLC[key] = spr;
  return spr;
}
function doorSprite(m) {
  const key = 'door' + m;
  if (WALLC[key]) return WALLC[key];
  const vertical = (m & 5) && !(m & 10);
  let spr;
  if (!vertical) spr = SPR.door;
  else {
    // a door inside a north-south wall, seen from above
    spr = canvas(16, 22);
    const g = spr.getContext('2d');
    g.drawImage(wallSprite('wood', m), 0, 0);
    const P = (x, y, col, w = 1, h = 1) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    const y0 = m & 1 ? 0 : 2, y1 = m & 4 ? 22 : 7;
    P(3, y0, '#2e2012', 10, y1 - y0); P(4, y0, '#a47c4f', 8, y1 - y0); P(4, y0, '#c49a62', 1, y1 - y0); P(8, y0, '#8a6640', 1, y1 - y0);
    if (y1 > 12) P(9, 11, '#d8b25a', 2, 2);
  }
  WALLC[key] = spr;
  return spr;
}
// Fences: posts with rails toward each connected side.
function fenceSprite(m, gate) {
  const key = (gate ? 'gate' : 'fence') + m;
  if (WALLC[key]) return WALLC[key];
  const wood = '#8a6640', hi = '#b08a5a', dk = '#5a3d26';
  const vertical = (m & 5) && !(m & 10);
  const spr = outline(sprite(16, 22, (P) => {
    if (gate) {
      if (vertical) { P(6, 0, dk, 4, 22); P(6, 0, hi, 1, 22); P(7, 4, wood, 2, 14); P(5, 9, '#d8b25a', 1, 2); }
      else { P(0, 9, dk, 16, 9); P(1, 10, wood, 14, 7); P(1, 10, hi, 14, 1); for (let x = 1; x < 15; x += 3) P(x, 10, dk, 1, 7); for (let i = 0; i < 12; i++) P(2 + i, 16 - Math.floor(i / 2), hi); P(13, 12, '#d8b25a', 1, 2); }
      return;
    }
    if (m & 2) { P(8, 11, wood, 8, 2); P(8, 11, hi, 8, 1); P(8, 16, wood, 8, 2); P(8, 16, hi, 8, 1); }
    if (m & 8) { P(0, 11, wood, 8, 2); P(0, 11, hi, 8, 1); P(0, 16, wood, 8, 2); P(0, 16, hi, 8, 1); }
    if (m & 1) { P(7, 0, wood, 2, 9); P(7, 0, hi, 1, 9); }
    if (m & 4) { P(7, 14, wood, 2, 8); P(7, 14, hi, 1, 8); }
    P(6, 8, dk, 4, 12); P(6, 8, wood, 3, 12); P(6, 8, hi, 1, 12); P(6, 7, hi, 4, 1);
  }));
  WALLC[key] = spr;
  return spr;
}

// ---------- People and zombies ----------
const PALS = {
  player: { skin: '#e2b48a', hair: '#3b2a1e', shirt: '#4f6b7d', shirt2: '#3e5767', pants: '#3a3a44', shoes: '#26221d' },
  s1: { skin: '#c99068', hair: '#1f1a16', shirt: '#9a6a3a', shirt2: '#7d5530', pants: '#45453f', shoes: '#26221d' },
  s2: { skin: '#f0c9a0', hair: '#a0602e', shirt: '#6f8a4a', shirt2: '#5a713c', pants: '#3a3d48', shoes: '#26221d' },
  s3: { skin: '#8d5e3e', hair: '#141210', shirt: '#a04848', shirt2: '#843a3a', pants: '#3f3b36', shoes: '#26221d' },
  s4: { skin: '#e8bf98', hair: '#d8c08a', shirt: '#7a6a9a', shirt2: '#62557e', pants: '#4a4440', shoes: '#26221d' },
  z1: { skin: '#8fa47a', hair: '#3a3a2c', shirt: '#6b6152', shirt2: '#544c40', pants: '#3e3f3a', shoes: '#2a2620', zombie: true },
  z2: { skin: '#a4b07a', hair: '#2c2a22', shirt: '#5a6a7a', shirt2: '#475563', pants: '#3a3a3e', shoes: '#2a2620', zombie: true },
  z3: { skin: '#7a8a68', hair: '#2a2a22', shirt: '#7a4a3a', shirt2: '#5e382c', pants: '#34332e', shoes: '#2a2620', zombie: true },
  z4: { skin: '#9cc060', hair: '#3a4a22', shirt: '#56603a', shirt2: '#454d2e', pants: '#3a3a30', shoes: '#2a2620', zombie: true, tox: true },
  z5: { skin: '#8a7a70', hair: '#201c18', shirt: '#4a2a2a', shirt2: '#381f1f', pants: '#2a2826', shoes: '#1a1814', zombie: true },
  z6: { skin: '#8fa47a', hair: '#3a3a2c', shirt: '#2e3f5c', shirt2: '#24324a', pants: '#2a2e38', shoes: '#1a1814', zombie: true, helmet: true },
  z7: { skin: '#b4b878', hair: '#4a4a30', shirt: '#7a7a50', shirt2: '#62623e', pants: '#3e3f3a', shoes: '#2a2620', zombie: true, bloat: true },
  z8: { skin: '#7a8a68', hair: '#2a2a22', shirt: '#4a4238', shirt2: '#3a3430', pants: '#34332e', shoes: '#2a2620', zombie: true },
  z9: { skin: '#c8c0b0', hair: '#5a1a1a', shirt: '#3a2a3a', shirt2: '#2c202c', pants: '#2a2826', shoes: '#1a1814', zombie: true, scream: true },
};
// dir: 0 down, 1 up, 2 left, 3 right. frame: 0 stand, 1/2 walk.
function charSprite(p, dir, frame) {
  return outline(sprite(16, 18, (P) => {
    const z = !!p.zombie;
    const step = frame === 1 ? 1 : frame === 2 ? -1 : 0;
    // legs
    if (dir < 2) {
      P(6, 12, p.pants, 2, 3 + (step > 0 ? 0 : 1)); P(9, 12, p.pants, 2, 3 + (step < 0 ? 0 : 1));
      P(6, 15 + (step > 0 ? -1 : 0), p.shoes, 2, 1); P(9, 15 + (step < 0 ? -1 : 0), p.shoes, 2, 1);
    } else {
      P(7 + step, 12, p.pants, 2, 3); P(8 - step, 12, p.pants, 2, 3);
      P(7 + step, 15, p.shoes, 2, 1); P(8 - step, 15, p.shoes, 2, 1);
    }
    // body
    P(5, 7, p.shirt, 7, 5); P(5, 11, p.shirt2, 7, 1);
    if (z) { P(6, 9, p.shirt2, 2, 2); P(10, 8, p.skin, 1, 2); }
    // arms
    if (z) {
      if (dir === 0) { P(4, 8, p.skin, 1, 4); P(12, 8, p.skin, 1, 4); P(4, 11, p.skin, 1, 1); }
      else if (dir === 1) { P(4, 7, p.shirt2, 1, 3); P(12, 7, p.shirt2, 1, 3); }
      else { const ax = dir === 2 ? 1 : 11; P(ax, 8, p.skin, 4, 1); P(ax, 9, p.skin, 4, 1); }
    } else {
      if (dir < 2) { P(4, 7 - (step > 0 ? 1 : 0), p.shirt2, 1, 3); P(12, 7 - (step < 0 ? 1 : 0), p.shirt2, 1, 3); P(4, 10 - (step > 0 ? 1 : 0), p.skin, 1, 1); P(12, 10 - (step < 0 ? 1 : 0), p.skin, 1, 1); }
      else { const ax = 8 + step; P(ax, 8, p.shirt2, 2, 3); P(ax, 11, p.skin, 2, 1); }
    }
    // head
    P(5, 1, p.skin, 7, 6);
    if (dir === 1) { P(5, 1, p.hair, 7, 5); P(5, 6, p.skin, 7, 1); }
    else {
      P(5, 0, p.hair, 7, 2); P(5, 1, p.hair, 1, 3); P(11, 1, p.hair, 1, 3);
      const eye = z ? '#d8443a' : '#1e1a16';
      if (dir === 0) { P(7, 4, eye); P(9, 4, eye); if (z) P(7, 6, '#4a3a30', 3, 1); }
      else if (dir === 2) { P(6, 4, eye); P(9, 1, p.hair, 3, 4); P(5, 1, p.skin, 1, 3); }
      else { P(10, 4, eye); P(5, 1, p.hair, 3, 4); P(11, 1, p.skin, 1, 3); }
    }
    if (p.tox) { P(6, 2, '#c8ec6a'); P(10, 9, '#c8ec6a'); }
    if (p.bloat) { P(4, 7, p.shirt, 9, 5); P(5, 9, p.skin, 7, 3); P(6, 10, '#d8d870'); P(9, 9, '#d8d870'); P(10, 11, '#d8d870'); P(4, 11, p.shirt2, 9, 1); }
    if (p.helmet) {
      P(4, 0, '#4a4f58', 9, 3); P(4, 0, '#6a707a', 9, 1);
      if (dir === 0) P(5, 3, '#9ab0c8', 7, 1); else if (dir === 2) P(4, 3, '#9ab0c8', 3, 1); else if (dir === 3) P(10, 3, '#9ab0c8', 3, 1);
    }
    if (p.scream && dir === 0) { P(7, 5, '#5a1010', 3, 2); P(8, 5, '#200808'); }
  }));
}
const CHAR = {};
function charFrames(key) {
  if (!CHAR[key]) {
    const p = PALS[key];
    CHAR[key] = [0, 1, 2, 3].map((d) => [0, 1, 2].map((f) => charSprite(p, d, f)));
  }
  return CHAR[key];
}

// ---------- Icons (resources and items), also used in the interface ----------
const ICON = {};
const ICON_DRAW = {};
function buildIcons() {
  const I = (k, draw) => { ICON_DRAW[k] = draw; ICON[k] = outline(sprite(16, 16, draw)); };
  I('madeira', (P) => { P(2, 5, '#7a5634', 12, 7); P(2, 5, '#946a42', 12, 2); P(11, 5, '#c49a62', 3, 7); P(12, 7, '#9a7448', 1, 3); P(4, 9, '#5e4128', 5, 1); });
  I('pedra', (P) => blob(P, [[8, 9, 5.5], [5, 10, 3.5]], ['#b2b0a8', '#9a9890', '#86847d', '#706e68'], 4));
  I('sucata', (P) => { P(4, 4, '#8a9096', 8, 8); P(6, 2, '#8a9096', 4, 12); P(2, 6, '#8a9096', 12, 4); P(6, 6, '#3a3c3e', 4, 4); P(5, 4, '#b0b6bc', 3, 1); P(10, 10, '#a06b3e', 3, 2); });
  I('comida', (P) => { P(4, 4, '#9aa0a6', 8, 10); P(4, 4, '#c8ccd0', 8, 1); P(4, 7, '#c4433a', 8, 4); P(5, 8, '#e0675a', 3, 1); P(4, 13, '#6d7378', 8, 1); });
  I('tecido', (P) => { P(3, 4, '#c8c0a8', 10, 8); P(3, 4, '#ddd6c0', 10, 2); P(10, 4, '#a89f88', 3, 8); P(11, 6, '#8a8270', 1, 4); P(5, 8, '#b0a890', 4, 1); });
  I('pecas', (P) => { P(3, 3, '#2f6a4a', 10, 10); P(4, 4, '#3d8a5e', 8, 1); P(5, 6, '#c9b06a', 6, 1); P(5, 9, '#c9b06a', 4, 1); P(9, 8, '#1e1e1e', 2, 3); for (let i = 0; i < 4; i++) { P(4 + i * 2, 1, '#c9b06a', 1, 2); P(4 + i * 2, 13, '#c9b06a', 1, 2); } });
  I('municao', (P) => { for (const x of [3, 7, 11]) { P(x, 6, '#c9a24a', 3, 8); P(x, 4, '#b07040', 3, 2); P(x + 1, 3, '#b07040', 1, 1); P(x, 12, '#8a7036', 3, 2); } });
  I('curativo', (P) => { P(2, 5, '#e8e2d2', 12, 6); P(2, 5, '#f6f2e8', 12, 1); P(7, 6, '#c4433a', 2, 4); P(6, 7, '#c4433a', 4, 2); });
  I('axe1', (P) => { for (let i = 0; i < 11; i++) P(3 + i, 13 - i, '#7a5634', 2, 1); P(8, 2, '#8a877e', 5, 6); P(8, 2, '#a19e95', 5, 1); });
  I('axe2', (P) => { for (let i = 0; i < 11; i++) P(3 + i, 13 - i, '#5a3d26', 2, 1); P(8, 2, '#8a9096', 6, 6); P(13, 3, '#c8ccd0', 1, 4); P(8, 2, '#b0b6bc', 6, 1); });
  I('pick1', (P) => { for (let i = 0; i < 11; i++) P(3 + i, 13 - i, '#7a5634', 2, 1); P(5, 2, '#8a877e', 9, 2); P(4, 3, '#8a877e', 2, 2); P(13, 3, '#8a877e', 2, 2); });
  I('pick2', (P) => { for (let i = 0; i < 11; i++) P(3 + i, 13 - i, '#5a3d26', 2, 1); P(5, 2, '#8a9096', 9, 2); P(4, 3, '#b0b6bc', 2, 2); P(13, 3, '#b0b6bc', 2, 2); });
  I('spear', (P) => { for (let i = 0; i < 12; i++) P(2 + i, 14 - i, '#7a5634', 1, 1); P(12, 1, '#a19e95', 3, 3); P(13, 0, '#c8c6be', 2, 2); });
  I('bat', (P) => { for (let i = 0; i < 10; i++) P(3 + i, 13 - i, '#9a7448', 2 + (i > 4 ? 1 : 0), 2); P(11, 3, '#c8ccd0'); P(9, 6, '#c8ccd0'); P(12, 5, '#c8ccd0'); P(3, 12, '#3a2c1e', 2, 2); });
  I('machete', (P) => { P(2, 12, '#3a2c1e', 4, 2); for (let i = 0; i < 9; i++) P(5 + i, 11 - i, '#b0b6bc', 2, 2); P(13, 2, '#d8dce0', 1, 1); });
  I('pistol', (P) => { P(3, 5, '#4a4c50', 10, 3); P(3, 5, '#6a6c70', 10, 1); P(4, 8, '#3a3c3e', 3, 5); P(7, 8, '#3a3c3e', 2, 1); });
  I('shotgun', (P) => { P(1, 6, '#4a4c50', 14, 2); P(1, 6, '#6a6c70', 14, 1); P(2, 8, '#7a5634', 6, 2); P(1, 9, '#7a5634', 3, 4); P(9, 8, '#3a3c3e', 3, 1); });
  I('rifle', (P) => { P(0, 7, '#3e4044', 16, 2); P(0, 7, '#5e6064', 16, 1); P(1, 9, '#5a3d26', 6, 2); P(0, 10, '#5a3d26', 3, 4); P(6, 5, '#2a2c2e', 4, 2); P(8, 9, '#2a2c2e', 2, 3); });
  I('helmet', (P) => { P(3, 5, '#6b6f58', 10, 6); P(2, 10, '#5a5e4a', 12, 2); P(4, 5, '#83876c', 8, 1); P(4, 4, '#6b6f58', 8, 1); });
  I('armor', (P) => { P(3, 3, '#7d8288', 10, 11); P(3, 3, '#9aa0a6', 10, 1); P(6, 3, '#4a4c50', 4, 2); P(4, 7, '#a06b3e', 3, 3); P(9, 9, '#a06b3e', 3, 3); P(3, 13, '#5a5e64', 10, 1); });
  I('vest', (P) => { P(3, 3, '#3e4a3a', 10, 11); P(3, 3, '#56664f', 10, 1); P(6, 3, '#2a3228', 4, 3); P(4, 7, '#2a3228', 8, 1); P(4, 10, '#2a3228', 8, 1); P(5, 8, '#56664f', 2, 2); P(9, 8, '#56664f', 2, 2); });
  I('fist', (P) => { P(5, 5, '#e2b48a', 6, 6); P(5, 5, '#f0c9a0', 6, 1); P(5, 7, '#c99068', 6, 1); P(11, 7, '#e2b48a', 2, 3); });
  I('sementes', (P) => { P(4, 5, '#b89a6a', 8, 9); P(5, 4, '#a08458', 6, 1); P(6, 2, '#8a7048', 4, 2); P(4, 5, '#cdb07c', 8, 1); P(6, 8, '#6a8a3c', 1, 1); P(9, 10, '#6a8a3c', 1, 1); P(7, 11, '#6a8a3c', 1, 1); P(5, 13, '#8a7048', 6, 1); });
  I('mudas', (P) => { P(3, 11, '#6e5232', 10, 3); P(3, 11, '#8a6640', 10, 1); P(7, 5, '#6e4c30', 2, 6); P(4, 4, '#7cb04a', 4, 3); P(9, 3, '#8cbf56', 4, 3); P(5, 4, '#9ccf66', 2, 1); P(10, 3, '#a8dc70', 2, 1); });
  I('hammer', (P) => { for (let i = 0; i < 10; i++) P(3 + i, 13 - i, '#7a5634', 2, 1); P(9, 1, '#6a6c70', 6, 4); P(9, 1, '#9aa0a6', 6, 1); P(14, 2, '#4a4c50', 1, 2); });
  I('sledge', (P) => { for (let i = 0; i < 10; i++) P(3 + i, 13 - i, '#6e4c30', 2, 1); P(8, 0, '#86847d', 8, 6); P(8, 0, '#a19e95', 8, 1); P(8, 5, '#5c5a55', 8, 1); });
  I('axe3', (P) => { for (let i = 0; i < 11; i++) P(3 + i, 13 - i, '#3a2c1e', 2, 1); P(8, 1, '#a8b4c0', 7, 7); P(14, 2, '#e8f0f8', 1, 5); P(8, 1, '#d0dae4', 7, 1); P(9, 7, '#7a8692', 5, 1); });
  I('pick3', (P) => { for (let i = 0; i < 11; i++) P(3 + i, 13 - i, '#3a2c1e', 2, 1); P(4, 2, '#a8b4c0', 11, 2); P(4, 2, '#d0dae4', 11, 1); P(3, 3, '#e8f0f8', 2, 3); P(14, 3, '#e8f0f8', 2, 3); });
  I('smg', (P) => { P(2, 5, '#3e4044', 12, 3); P(2, 5, '#5e6064', 12, 1); P(14, 6, '#2a2c2e', 2, 1); P(6, 8, '#2a2c2e', 2, 6); P(9, 8, '#3a3c3e', 2, 3); P(1, 6, '#3a3c3e', 1, 4); });
  I('ovos', (P) => { P(5, 4, '#f4ecd8', 6, 9); P(4, 6, '#f4ecd8', 8, 5); P(6, 3, '#f4ecd8', 4, 1); P(6, 5, '#ffffff', 2, 2); P(10, 9, '#d8ccb0', 1, 2); });
  I('lã', (P) => blob(P, [[6, 8, 4.5], [10, 8, 4], [8, 6, 4]], ['#f4f1ea', '#e4e0d6', '#cfcabe', '#b6b0a3'], 8));
  I('leite', (P) => { P(4, 5, '#9aa0a6', 8, 9); P(4, 5, '#c8ccd0', 8, 1); P(5, 6, '#f6f4ee', 6, 2); P(3, 3, '#6d7378', 1, 3); P(12, 3, '#6d7378', 1, 3); P(4, 2, '#6d7378', 8, 1); P(4, 13, '#6d7378', 8, 1); });
  // structure icons for the build bar
  ICON[O.WALL_W] = wallSprite('wood', 0); ICON[O.WALL_S] = wallSprite('stone', 0); ICON[O.DOOR] = SPR.door; ICON[O.FIRE] = SPR.fire[0]; ICON[O.TORCH] = SPR.torch[0];
  ICON[O.BENCH] = SPR.bench; ICON[O.BENCH2] = SPR.bench2; ICON[O.BENCH3] = SPR.bench3; ICON[O.BED] = SPR.bed; ICON[O.FARM] = SPR.farm[3];
  ICON[O.SPIKES] = SPR.spikes; ICON[O.TURRET] = SPR.turret; ICON[O.CHEST] = SPR.chest;
  ICON[O.FENCE] = fenceSprite(10); ICON[O.GATE] = fenceSprite(10, true); ICON[O.SAPLING] = SPR.sapling; ICON[O.FRUIT] = SPR.fruit[3];
}
// Smaller copy of an item icon for the character's hand (12px, crisp, outlined).
const HELD = {};
function heldSprite(k) {
  if (HELD[k]) return HELD[k];
  const src = sprite(16, 16, ICON_DRAW[k]);
  const sd = src.getContext('2d').getImageData(0, 0, 16, 16).data;
  const c = canvas(14, 14), g = c.getContext('2d');
  const out = g.createImageData(14, 14);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    const sx = Math.min(15, Math.floor((x + 0.5) * 16 / 12)), sy = Math.min(15, Math.floor((y + 0.5) * 16 / 12));
    const si = (sy * 16 + sx) * 4, di = ((y + 1) * 14 + x + 1) * 4;
    for (let k2 = 0; k2 < 4; k2++) out.data[di + k2] = sd[si + k2];
  }
  g.putImageData(out, 0, 0);
  HELD[k] = outline(c);
  return HELD[k];
}
const ICON_URL = {};
function iconURL(k) {
  if (!ICON_URL[k]) {
    const src = ICON[k];
    const c = canvas(src.width * 3, src.height * 3), g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(src, 0, 0, c.width, c.height);
    ICON_URL[k] = c.toDataURL();
  }
  return ICON_URL[k];
}
