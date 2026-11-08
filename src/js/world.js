'use strict';
// ================= World: generation and tile queries =================
const W = {
  ground: new Uint8Array(WW * WH),
  obj: new Uint8Array(WW * WH),
  hp: new Uint16Array(WW * WH),
  roadH: new Uint8Array(WW * WH), // road line markings
  roadV: new Uint8Array(WW * WH),
  pois: [],          // named buildings
  houses: [],        // {x,y,w,h,poi}
  spawn: { x: 44, y: 100 },
  built: new Set(),  // indices of player structures
  counts: new Map(),
};
const idx = (x, y) => y * WW + x;
const inb = (x, y) => x >= 0 && y >= 0 && x < WW && y < WH;
const objAt = (x, y) => (inb(x, y) ? W.obj[idx(x, y)] : O.RUIN);
const groundAt = (x, y) => (inb(x, y) ? W.ground[idx(x, y)] : G.WATER);
const countObj = (o) => W.counts.get(o) || 0;

function setObj(x, y, o, hp) {
  if (!inb(x, y)) return;
  const i = idx(x, y), old = W.obj[i];
  if (old) W.counts.set(old, (W.counts.get(old) || 0) - 1);
  W.obj[i] = o;
  W.hp[i] = hp !== undefined ? hp : (o && OBJ[o] ? OBJ[o].hp : 0);
  if (o) W.counts.set(o, (W.counts.get(o) || 0) + 1);
  if (o && OBJ[o] && OBJ[o].build) W.built.add(i); else W.built.delete(i);
}
function rebuildIndex() {
  W.built.clear();
  W.counts.clear();
  for (let i = 0; i < W.obj.length; i++) {
    const o = W.obj[i];
    if (!o) continue;
    W.counts.set(o, (W.counts.get(o) || 0) + 1);
    if (OBJ[o] && OBJ[o].build) W.built.add(i);
  }
}
// Blocks people (player and survivors)?
function solidAt(x, y) {
  if (!inb(x, y)) return true;
  if (W.ground[idx(x, y)] === G.WATER) return true;
  const o = W.obj[idx(x, y)];
  return !!(o && OBJ[o] && OBJ[o].solid);
}
// Blocks zombies? Doors and walls block them (they attack instead).
function zSolidAt(x, y) {
  if (solidAt(x, y)) return true;
  const o = objAt(x, y);
  return !!(o && OBJ[o] && (OBJ[o].door || (OBJ[o].build && !OBJ[o].spikes && OBJ[o].solid)));
}
function poiAt(x, y) { return W.pois.find((p) => x >= p.x && y >= p.y && x < p.x + p.w && y < p.y + p.h) || null; }

// ---------- Generation ----------
function generateWorld(seed) {
  W.ground.fill(G.GRASS); W.obj.fill(0); W.hp.fill(0); W.roadH.fill(0); W.roadV.fill(0);
  W.pois = []; W.houses = [];
  const R = mulberry32(seed);
  const sx = 44, sy = 100;
  W.spawn = { x: sx, y: sy };
  const nearStart = (x, y, r) => Math.hypot(x - sx, y - sy) < r;
  const TOWN = { x0: 104, x1: 192, y0: 46, y1: 168 };
  const inTown = (x, y, m = 0) => x >= TOWN.x0 - m && x <= TOWN.x1 + m && y >= TOWN.y0 - m && y <= TOWN.y1 + m;

  // dirt and water
  for (let y = 0; y < WH; y++) for (let x = 0; x < WW; x++) {
    const i = idx(x, y);
    if (fbm(x / 11, y / 11, seed + 3) > 0.66) W.ground[i] = G.DIRT;
    if (!nearStart(x, y, 14) && !inTown(x, y, 4) && fbm(x / 17, y / 17, seed + 7) < 0.27) W.ground[i] = G.WATER;
  }
  // roads (2 wide)
  const road = (x0, y0, x1, y1) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inb(x, y)) {
      const i = idx(x, y);
      W.ground[i] = G.ROAD;
      if (x1 - x0 > y1 - y0 && y === y0) W.roadH[i] = 1;
      if (y1 - y0 > x1 - x0 && x === x0) W.roadV[i] = 1;
    }
  };
  road(sx + 4, 100, TOWN.x1, 101);
  for (const y of [62, 128, 152]) road(TOWN.x0, y, TOWN.x1, y + 1);
  for (const x of [112, 140, 168, 186]) road(x, TOWN.y0, x + 1, TOWN.y1);
  road(TOWN.x0, TOWN.y0, TOWN.x0 + 1, TOWN.y1);

  // buildings
  const free = (x0, y0, w, h) => {
    for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++) {
      if (!inb(x, y)) return false;
      const g = W.ground[idx(x, y)];
      if (g === G.ROAD || g === G.WATER || g === G.FLOOR || g === G.TILE) return false;
    }
    return true;
  };
  const house = (x0, y0, w, h, poi) => {
    const floor = poi ? G.TILE : G.FLOOR;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) W.ground[idx(x, y)] = floor;
    // door on the side closest to a road
    const sides = [['n', y0], ['s', y0 + h - 1]];
    let doorSide = 's';
    for (let d = 1; d < 6; d++) {
      if (inb(x0 + 2, y0 - d) && W.ground[idx(x0 + 2, y0 - d)] === G.ROAD) { doorSide = 'n'; break; }
      if (inb(x0 + 2, y0 + h - 1 + d) && W.ground[idx(x0 + 2, y0 + h - 1 + d)] === G.ROAD) { doorSide = 's'; break; }
    }
    const dx = x0 + 1 + Math.floor(R() * (w - 3));
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const edge = x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1;
      if (!edge) continue;
      const isDoor = (doorSide === 'n' ? y === y0 : y === y0 + h - 1) && (x === dx || x === dx + 1);
      if (isDoor) continue;
      if (!poi && R() < 0.1 && x !== x0 && x !== x0 + w - 1) continue; // broken walls
      setObj(x, y, O.RUIN);
    }
    void sides;
    const nCrates = poi ? 4 + Math.floor(R() * 3) : 1 + (R() < 0.45 ? 1 : 0);
    for (let k = 0; k < nCrates; k++) {
      const cx = x0 + 1 + Math.floor(R() * (w - 2)), cy = y0 + 1 + Math.floor(R() * (h - 2));
      if (!W.obj[idx(cx, cy)] && !(cx >= dx - 1 && cx <= dx + 2)) setObj(cx, cy, O.CRATE);
    }
    const hs = { x: x0, y: y0, w, h, poi: poi || null };
    W.houses.push(hs);
    return hs;
  };
  const POIS = [['Supermercado', 13, 9], ['Hospital', 12, 10], ['Delegacia', 11, 9], ['Posto de gasolina', 10, 7]];
  for (const [n, w, h] of POIS) {
    for (let t = 0; t < 300; t++) {
      const x = TOWN.x0 + 4 + Math.floor(R() * (TOWN.x1 - TOWN.x0 - w - 6)), y = TOWN.y0 + 3 + Math.floor(R() * (TOWN.y1 - TOWN.y0 - h - 6));
      if (free(x, y, w, h)) { house(x, y, w, h, n); W.pois.push({ n, x, y, w, h }); break; }
    }
  }
  for (let t = 0; t < 900; t++) {
    const w = 6 + Math.floor(R() * 4), h = 5 + Math.floor(R() * 3);
    const x = TOWN.x0 + 2 + Math.floor(R() * (TOWN.x1 - TOWN.x0 - w - 3)), y = TOWN.y0 + 2 + Math.floor(R() * (TOWN.y1 - TOWN.y0 - h - 3));
    if (free(x, y, w, h)) house(x, y, w, h, null);
  }
  // a few cabins in the woods
  for (let t = 0, made = 0; t < 400 && made < 6; t++) {
    const x = 10 + Math.floor(R() * 90), y = 10 + Math.floor(R() * 180);
    if (!nearStart(x, y, 22) && free(x, y, 6, 5)) { house(x, y, 6, 5, null); made++; }
  }

  // nature and junk
  for (let y = 0; y < WH; y++) for (let x = 0; x < WW; x++) {
    const i = idx(x, y);
    if (W.obj[i]) continue;
    const g = W.ground[i];
    if (x < 2 || y < 2 || x >= WW - 2 || y >= WH - 2) { if (g !== G.WATER) setObj(x, y, O.PINE); continue; }
    if (g === G.WATER || g === G.FLOOR || g === G.TILE) continue;
    if (g === G.ROAD) { if (R() < 0.022) setObj(x, y, O.CAR); continue; }
    if (nearStart(x, y, 5)) continue;
    const town = inTown(x, y);
    const r = R();
    if (town) {
      if (r < 0.025) setObj(x, y, O.SCRAP);
      else if (r < 0.04) setObj(x, y, O.TREE);
      else if (r < 0.048) setObj(x, y, O.BUSH);
      else if (r < 0.055) setObj(x, y, O.ROCK);
      continue;
    }
    const forest = fbm(x / 13, y / 13, seed + 11);
    const rocky = fbm(x / 9, y / 9, seed + 19);
    const near = nearStart(x, y, 12) ? 0.5 : 1;
    if (r < Math.max(0, forest - 0.42) * 1.1 * near) setObj(x, y, y < 70 || forest > 0.62 ? O.PINE : O.TREE);
    else if (R() < (rocky > 0.62 ? 0.09 : 0.012) * near) setObj(x, y, O.ROCK);
    else if (R() < 0.012) setObj(x, y, O.BUSH);
    else if (R() < 0.003) setObj(x, y, O.SCRAP);
  }
  // guaranteed basics next to the start
  const around = [[4, -3, O.TREE], [5, 2, O.TREE], [-4, 3, O.TREE], [-5, -2, O.PINE], [3, 5, O.ROCK], [-3, -5, O.ROCK], [6, -1, O.ROCK], [-6, 1, O.BUSH], [2, -6, O.TREE], [7, 4, O.TREE]];
  for (const [dx, dy, o] of around) if (W.ground[idx(sx + dx, sy + dy)] !== G.WATER) setObj(sx + dx, sy + dy, o);
  setObj(sx, sy - 2, O.FIRE);
  rebuildIndex();
}

// Free tile to stand on near (x, y).
function freeTileNear(x, y, maxR = 6) {
  for (let r = 0; r <= maxR; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    if (!solidAt(x + dx, y + dy) && !zSolidAt(x + dx, y + dy)) return [x + dx, y + dy];
  }
  return [x, y];
}
