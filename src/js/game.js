'use strict';
// ================= Game rules: player, gathering, building, crafting, zombies, survivors =================
const SAVE_KEY = 'ultimo-abrigo-mundo-v1';
let S = null;              // saved state
const Z = [];              // zombies (not saved)
const BUL = [];            // projectiles
const FX = [];             // particles and floating text
const NPC_ON = [];         // reserved
const MSG = [];            // messages for the interface
let nextZid = 1;

function say(msg, type = 'info') { MSG.push({ msg, type }); }

// ---------- New game / state ----------
function newGame() {
  const seed = (Math.random() * 2 ** 31) | 0;
  generateWorld(seed);
  S = {
    v: 3, v31: true, seed, created: Date.now(), last: Date.now(), day: 1, time: DAY_LEN * 0.05, played: 0,
    res: { madeira: 0, pedra: 0, sucata: 0, comida: 6, tecido: 0, pecas: 0, municao: 0, curativo: 1, sementes: 2, mudas: 0 },
    items: [], hotbar: [null, null, null, null, null, null], sel: 0, head: null, body: null,
    player: { x: W.spawn.x * TS + 8, y: W.spawn.y * TS + 8, hp: 100, hunger: 100, stam: 100, dir: 0 },
    tut: 0, sound: true,
    stats: { walked: 0, kills: 0, crates: 0, built: 0, deaths: 0, crafted: 0, nights: 0, planted: 0, tamed: 0, repaired: 0 },
    surv: [], npcs: [], animals: [], regrow: [], farms: {}, grow: {}, nextId: 1,
  };
  placeStrandedSurvivors();
  spawnAnimals(16, true);
  return S;
}
function placeStrandedSurvivors() {
  const homes = W.houses.filter((h) => !h.poi).sort(() => Math.random() - 0.5).slice(0, 9);
  const specs = Object.keys(SPECS);
  homes.forEach((h, i) => {
    const [tx, ty] = freeTileNear(h.x + Math.floor(h.w / 2), h.y + Math.floor(h.h / 2), 3);
    S.npcs.push({ id: S.nextId++, name: uniqueName(), spec: specs[i % specs.length], pal: 's' + (1 + (i % 4)), x: tx * TS + 8, y: ty * TS + 8, home: [h.x, h.y, h.w, h.h], dir: 0 });
  });
}
function uniqueName() {
  const used = new Set([...S.surv, ...S.npcs].map((s) => s.name));
  for (let i = 0; i < 40; i++) { const n = pick(NAMES); if (!used.has(n)) return n; }
  return pick(NAMES);
}

// ---------- Resources ----------
const capOf = (k) => (k === 'pecas' ? 9999 : k === 'municao' ? 300 + 150 * countObj(O.CHEST) : 200 + 150 * countObj(O.CHEST));
function gain(k, n, x, y) {
  const room = Math.max(0, capOf(k) - S.res[k]);
  const g = Math.min(room, Math.floor(n));
  if (g > 0) { S.res[k] += g; if (x !== undefined) floatText(x, y - 10, `+${g} ${RES[k]}`, '#e8dcb0'); }
  else if (n > 0 && x !== undefined) floatText(x, y - 10, `${RES[k]} cheio`, '#d88a6a');
  return g;
}
const canPay = (c) => Object.keys(c).every((k) => S.res[k] >= c[k]);
function pay(c) { if (!canPay(c)) return false; for (const k in c) S.res[k] -= c[k]; return true; }

// ---------- Items ----------
const itemById = (id) => S.items.find((i) => i.id === id);
function heldItem() { const id = S.hotbar[S.sel]; return id ? itemById(id) : null; }
const itemMax = (it) => Math.round(ITEMS[it.base].dur * RAR[it.r].m);
const istat = (it, k) => (ITEMS[it.base][k] || 0) * (k === 'dmg' || k === 'armor' ? RAR[it.r].m : 1);
function rollRarity(luck = 0) {
  const w = [70, 22 + luck * 3, 6 + luck * 2, 1.6 + luck, 0.4 + luck * 0.4];
  return wpick(w.map((x, i) => [i, x]));
}
function addItem(base, r) {
  const it = { id: S.nextId++, base, r, dur: 0 };
  it.dur = itemMax(it);
  S.items.push(it);
  const k = ITEMS[base].kind;
  if (k === 'head' && !S.head) S.head = it.id;
  else if (k === 'body' && !S.body) S.body = it.id;
  else if (k !== 'head' && k !== 'body') { const e = S.hotbar.indexOf(null); if (e >= 0) S.hotbar[e] = it.id; }
  return it;
}
function removeItem(id) {
  S.items = S.items.filter((i) => i.id !== id);
  S.hotbar = S.hotbar.map((h) => (h === id ? null : h));
  if (S.head === id) S.head = null;
  if (S.body === id) S.body = null;
  for (const s of S.surv) if (s.item === id) s.item = null;
}
function wearItem(it, n = 1) {
  if (!it) return;
  it.dur -= n;
  if (it.dur <= 0) { say(`${ITEMS[it.base].n} quebrou.`, 'bad'); removeItem(it.id); sfx('break'); }
}
function armorValue() {
  let a = 0;
  for (const id of [S.head, S.body]) { const it = id && itemById(id); if (it) a += istat(it, 'armor'); }
  return a;
}
// Best bench built anywhere: unlocks structures. Crafting uses the bench you are standing at.
function benchLevel() { return countObj(O.BENCH3) ? 3 : countObj(O.BENCH2) ? 2 : countObj(O.BENCH) ? 1 : 0; }
function craftItem(base, tier) {
  const d = ITEMS[base];
  if (d.tier > tier) return say(`Precisa da ${BENCH_NAMES[d.tier]}.`, 'bad');
  if (!pay(d.cost)) return say('Faltam recursos.', 'bad');
  const it = addItem(base, rollRarity(tier - 1));
  S.stats.crafted++;
  say(`Fabricado: ${d.n} (${RAR[it.r].n}).`, it.r >= 2 ? 'rare' : 'good');
  sfx('craft');
  return it;
}
function craftMake(m, tier) {
  if (m.tier > tier) return say(`Precisa da ${BENCH_NAMES[m.tier]}.`, 'bad');
  if (!pay(m.cost)) return say('Faltam recursos.', 'bad');
  for (const k in m.give) gain(k, m.give[k]);
  sfx('craft');
}
function scrapItem(id) {
  const it = itemById(id);
  if (!it) return;
  const c = ITEMS[it.base].cost;
  removeItem(id);
  for (const k in c) gain(k, Math.floor(c[k] * 0.4));
}

// ---------- Geometry and movement ----------
const tileOf = (px) => Math.floor(px / TS);
// Feet box collision. solidFn(tx, ty).
function blocked(x, y, solidFn, r = 4) {
  const x0 = tileOf(x - r), x1 = tileOf(x + r), y0 = tileOf(y - 3), y1 = tileOf(y + 2);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solidFn(tx, ty)) return true;
  return false;
}
function moveEnt(e, dx, dy, solidFn, r = 4) {
  if (dx && !blocked(e.x + dx, e.y, solidFn, r)) e.x += dx;
  if (dy && !blocked(e.x, e.y + dy, solidFn, r)) e.y += dy;
}
const dirOf = (dx, dy) => (Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 2 : 3) : (dy < 0 ? 1 : 0));
function lineClear(x0, y0, x1, y1) {
  const n = Math.ceil(dist(x0, y0, x1, y1) / 6);
  for (let i = 1; i < n; i++) { const x = lerp(x0, x1, i / n), y = lerp(y0, y1, i / n); if (solidAt(tileOf(x), tileOf(y))) return false; }
  return true;
}

// ---------- Effects ----------
function burst(x, y, col, n = 6, spd = 40) {
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = rnd(0.3, 1) * spd; FX.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: rnd(0.3, 0.6), col }); }
}
function floatText(x, y, txt, col) { FX.push({ x, y, vx: 0, vy: -18, life: 1.1, txt, col }); }

// ---------- Day and night ----------
const dayFrac = () => S.time / DAY_LEN;
const isNight = () => dayFrac() >= NIGHT_START;
function darkness() {
  const f = dayFrac();
  if (f < 0.04) return 0.75 * (1 - f / 0.04);
  if (f < 0.52) return 0;
  if (f < NIGHT_START) return 0.75 * ((f - 0.52) / (NIGHT_START - 0.52));
  return 0.75;
}
function clockText() {
  const h = (6 + dayFrac() * 24) % 24, m = Math.floor((h % 1) * 6) * 10;
  return `${String(Math.floor(h)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function baseCenter() {
  let best = null;
  for (const i of W.built) { const o = W.obj[i]; if (o === O.FIRE || o === O.BED || o === O.BENCH) { best = i; if (o === O.FIRE) break; } }
  if (best === null) return [tileOf(S.player.x), tileOf(S.player.y)];
  return [best % WW, Math.floor(best / WW)];
}

// ---------- Player actions ----------
let actCd = 0;
let mouseW = { x: 0, y: 0 };      // mouse in world pixels
const REACH = 30;
function useHeld(dt) {
  if (actCd > 0) return;
  const p = S.player, it = heldItem(), d = it ? ITEMS[it.base] : null;
  const ang = Math.atan2(mouseW.y - (p.y - 6), mouseW.x - p.x);
  p.dir = dirOf(Math.cos(ang), Math.sin(ang));
  if (d && d.kind === 'gun') {
    if (S.res.municao < 1) { actCd = 0.6; say('Sem munição. Fabrique na bancada.', 'bad'); sfx('click'); return; }
    S.res.municao--;
    const n = d.pellets || 1;
    for (let i = 0; i < n; i++) {
      const a = ang + (Math.random() - 0.5) * d.spread * 2;
      BUL.push({ x: p.x + Math.cos(ang) * 8, y: p.y - 6 + Math.sin(ang) * 8, vx: Math.cos(a) * 340, vy: Math.sin(a) * 340, dmg: istat(it, 'dmg'), range: d.range, pierce: d.pierce || 0, from: 'p' });
    }
    actCd = 1 / d.spd;
    wearItem(it);
    sfx('shoot');
    return;
  }
  const spd = d ? d.spd : 2.2, range = d ? d.range : 18;
  const tx = tileOf(mouseW.x), ty = tileOf(mouseW.y);
  // hammer on a damaged structure: repair it
  if (d && d.kind === 'hammer') {
    const o = objAt(tx, ty), od = OBJ[o];
    if (od && od.build && W.hp[idx(tx, ty)] < od.hp && dist(p.x, p.y - 4, tx * TS + 8, ty * TS + 8) <= REACH + 8) { actCd = 1 / spd; repair(tx, ty, it); return; }
  }
  actCd = 1 / spd;
  // zombies and wild animals in the swing arc come first
  const inArc = (e, r) => {
    if (dist(p.x, p.y - 4, e.x, e.y - 4) > range + r) return false;
    let da = Math.atan2(e.y - p.y, e.x - p.x) - ang;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    return Math.abs(da) <= 1.1;
  };
  let hitZ = false;
  const kb = 60 * (d && d.knock ? d.knock : 1);
  for (const z of [...Z]) {
    if (!inArc(z, z.r)) continue;
    hurtZombie(z, d ? istat(it, 'dmg') : 5, Math.cos(ang) * kb, Math.sin(ang) * kb);
    hitZ = true;
  }
  for (const a of [...S.animals]) {
    if (a.tame || !inArc(a, ANIMALS[a.t].r)) continue;
    hurtAnimal(a, d ? istat(it, 'dmg') : 4);
    hitZ = true;
  }
  FX.push({ swing: true, x: p.x, y: p.y - 6, a: ang, life: 0.15, r: range });
  if (hitZ) { if (it) wearItem(it); sfx('hit'); return; }
  // otherwise gather the tile under the mouse
  if (dist(p.x, p.y - 4, tx * TS + 8, ty * TS + 8) > REACH) return;
  const o = objAt(tx, ty);
  if (o === O.CRATE) { openCrate(tx, ty); return; }
  const od = OBJ[o];
  if (!od || !od.give) return;
  const power = d && d.kind === od.tool ? d.power * (1 + 0.15 * it.r) : od.hand ? 1 : 1;
  hitObject(tx, ty, power, p.x, p.y);
  if (it) wearItem(it);
}
function hitObject(tx, ty, power, fx, fy) {
  const i = idx(tx, ty), o = W.obj[i], od = OBJ[o];
  const dmg = Math.min(W.hp[i], Math.max(1, Math.round(power)));
  W.hp[i] -= dmg;
  const cx = tx * TS + 8, cy = ty * TS + 10;
  for (const k in od.give) gain(k, od.give[k] * dmg, cx, cy);
  for (const k in od.bonus || {}) if (Math.random() < od.bonus[k] * dmg) gain(k, 1, cx, cy - 8);
  burst(cx, cy - 4, o === O.ROCK ? '#a19e95' : o === O.SCRAP || o === O.CAR ? '#9a6640' : o === O.BUSH ? '#c4433a' : '#a47c4f', 4, 30);
  sfx(od.tool === 'pick' ? 'mine' : 'chop');
  if (W.hp[i] <= 0) {
    for (const k in od.end || {}) { const n = irnd(od.end[k][0], od.end[k][1]); if (n > 0) gain(k, n, cx, cy - 8); }
    setObj(tx, ty, o === O.TREE || o === O.PINE ? O.STUMP : 0);
    if (od.regrow) S.regrow.push([i, o, S.day + od.regrow]);
    burst(cx, cy, '#6e5232', 10, 50);
  }
  void fx; void fy;
}
const LOOT = {
  casa: [['comida', 0.6, 1, 4], ['tecido', 0.55, 1, 3], ['madeira', 0.3, 2, 5], ['sucata', 0.4, 2, 5], ['municao', 0.22, 3, 8], ['curativo', 0.15, 1, 1], ['pecas', 0.12, 1, 1], ['sementes', 0.25, 1, 3]],
  'Supermercado': [['comida', 0.95, 3, 8], ['tecido', 0.6, 2, 4], ['curativo', 0.25, 1, 2], ['sucata', 0.3, 2, 4], ['sementes', 0.6, 2, 5]],
  'Hospital': [['curativo', 0.8, 1, 3], ['tecido', 0.7, 2, 5], ['pecas', 0.3, 1, 2], ['comida', 0.3, 1, 3]],
  'Delegacia': [['municao', 0.85, 8, 20], ['sucata', 0.4, 3, 6], ['pecas', 0.25, 1, 2], ['curativo', 0.2, 1, 1]],
  'Posto de gasolina': [['sucata', 0.8, 4, 10], ['pecas', 0.45, 1, 2], ['comida', 0.4, 1, 4], ['tecido', 0.3, 1, 2]],
};
function openCrate(tx, ty) {
  const poi = poiAt(tx, ty);
  const table = LOOT[poi ? poi.n : 'casa'];
  const cx = tx * TS + 8, cy = ty * TS + 8;
  let got = 0;
  for (const [k, ch, a, b] of table) if (Math.random() < ch) { got += gain(k, irnd(a, b), cx, cy - 10 * got); }
  const itemCh = poi ? (poi.n === 'Delegacia' ? 0.35 : 0.12) : 0.07;
  if (Math.random() < itemCh) {
    const pool = poi && poi.n === 'Delegacia' ? ['pistol', 'shotgun', 'machete', 'helmet', 'vest', 'rifle', 'smg'] : ['spear', 'bat', 'machete', 'axe2', 'pick2', 'helmet', 'armor', 'pistol', 'hammer', 'sledge'];
    const it = addItem(pick(pool), rollRarity(poi ? 2 : 1));
    say(`Achou: ${ITEMS[it.base].n} (${RAR[it.r].n})!`, it.r >= 2 ? 'rare' : 'good');
  }
  setObj(tx, ty, 0);
  S.stats.crates++;
  sfx('open');
  burst(cx, cy, '#a47c4f', 8, 40);
}
function eat() {
  if (S.res.comida < 1) return say('Sem comida.', 'bad');
  if (S.player.hunger > 95) return say('Você está satisfeito.');
  S.res.comida--; S.player.hunger = Math.min(100, S.player.hunger + 30); sfx('eat');
}
function heal() {
  if (S.res.curativo < 1) return say('Sem curativos.', 'bad');
  if (S.player.hp >= 100) return say('Sua vida está cheia.');
  S.res.curativo--; S.player.hp = Math.min(100, S.player.hp + 40); sfx('eat');
}

// ---------- Interaction (E) ----------
function interactTarget() {
  const p = S.player;
  let best = null, bd = 30;
  for (const n of S.npcs) { const d = dist(p.x, p.y, n.x, n.y); if (d < bd) { bd = d; best = { k: 'npc', e: n }; } }
  for (const s of S.surv) { const d = dist(p.x, p.y, s.x, s.y); if (d < bd - 4) { bd = d; best = { k: 'surv', e: s }; } }
  for (const a of S.animals) { const d = dist(p.x, p.y, a.x, a.y); if (d < bd - 2) { bd = d; best = { k: 'animal', e: a }; } }
  const tx = tileOf(p.x), ty = tileOf(p.y - 4);
  const USE = new Set([O.CRATE, O.BENCH, O.BENCH2, O.BENCH3, O.FARM, O.BED, O.CHEST, O.FRUIT, O.SAPLING]);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = tx + dx, y = ty + dy, o = objAt(x, y);
    if (!USE.has(o)) continue;
    const d = dist(p.x, p.y - 4, x * TS + 8, y * TS + 8);
    if (d < bd) { bd = d; best = { k: 'tile', o, x, y }; }
  }
  return best;
}
function interactLabel(t) {
  if (!t) return '';
  if (t.k === 'npc') return `Recrutar ${t.e.name} (${t.e.spec})`;
  if (t.k === 'surv') return `Falar com ${t.e.name}`;
  if (t.k === 'animal') {
    const a = t.e, d = ANIMALS[a.t];
    if (!a.tame) return `Alimentar ${d.n.toLowerCase()} (${d.food} comida) · ${a.fed}/${d.feeds}`;
    if (a.prod >= d.every) return `Pegar ${d.item}`;
    return a.follow ? `${d.n}: ficar aqui` : `${d.n}: me seguir`;
  }
  if (t.o === O.CRATE) return 'Abrir caixa';
  if (OBJ[t.o].bench) return `Usar ${OBJ[t.o].n.toLowerCase()}`;
  if (t.o === O.FARM) return farmStage(idx(t.x, t.y)) >= 3 ? 'Colher' : 'Horta crescendo';
  if (t.o === O.FRUIT) return fruitStage(idx(t.x, t.y)) >= 3 ? 'Colher frutas' : 'Árvore frutífera crescendo';
  if (t.o === O.SAPLING) return 'Muda crescendo';
  if (t.o === O.BED) return 'Cama';
  if (t.o === O.CHEST) return 'Baú (+150 de espaço)';
  return '';
}
function freeBeds() {
  const used = new Set(S.surv.map((s) => s.bed).filter((b) => b !== null));
  return [...W.built].filter((i) => W.obj[i] === O.BED && !used.has(i));
}
function recruit(n) {
  const beds = freeBeds();
  // the player keeps one bed for themselves when there are several
  if (!beds.length) return say(`${n.name}: "Eu vou, mas preciso de uma cama no seu abrigo."`, 'warn');
  S.npcs = S.npcs.filter((x) => x !== n);
  const s = { id: n.id, name: n.name, spec: n.spec, pal: n.pal, x: n.x, y: n.y, hp: 100, bed: beds[0], item: null, path: null, task: null, cd: 0, dir: 0, anim: 0, mode: 'home' };
  S.surv.push(s);
  say(`${s.name} (${s.spec}) vai para o seu abrigo!`, 'good');
  sfx('good');
}

// ---------- Building ----------
function canPlace(b, tx, ty) {
  if (!inb(tx, ty)) return 'Fora do mapa';
  if (b.tier && benchLevel() < b.tier) return `Precisa da ${BENCH_NAMES[b.tier]}`;
  if (dist(S.player.x, S.player.y, tx * TS + 8, ty * TS + 8) > 7 * TS) return 'Muito longe';
  const g = groundAt(tx, ty);
  if (g === G.WATER) return 'Na água não';
  if (b.ground && g !== G.GRASS && g !== G.DIRT) return 'Só na terra ou na grama';
  const o = objAt(tx, ty);
  if (o && o !== O.STUMP) return 'Ocupado';
  if (OBJ[b.o].solid || OBJ[b.o].wall) {
    const occupied = [S.player, ...Z, ...S.surv, ...S.npcs, ...S.animals].some((e) => tileOf(e.x) === tx && (tileOf(e.y) === ty || tileOf(e.y - 3) === ty));
    if (occupied) return 'Alguém está aí';
  }
  if (!canPay(b.cost)) return 'Faltam recursos';
  return null;
}
function place(b, tx, ty) {
  const why = canPlace(b, tx, ty);
  if (why) return why;
  pay(b.cost);
  setObj(tx, ty, b.o);
  const i = idx(tx, ty);
  if (b.o === O.FARM) S.farms[i] = 0;
  if (OBJ[b.o].plant) { S.grow[i] = 0; S.stats.planted = (S.stats.planted || 0) + 1; }
  S.stats.built++;
  sfx('build');
  burst(tx * TS + 8, ty * TS + 12, OBJ[b.o].plant ? '#7cb04a' : '#a47c4f', 5, 25);
  return null;
}
function clearTileState(i) {
  delete S.farms[i];
  delete S.grow[i];
  for (const s of S.surv) if (s.bed === i) s.bed = null;
}
function dismantle(tx, ty) {
  const o = objAt(tx, ty);
  if (!o || !OBJ[o].build) return;
  if (o === O.FIRE && countObj(O.FIRE) <= 1 && S.day <= 1) return say('Mantenha pelo menos uma fogueira no primeiro dia.', 'warn');
  const b = BUILD.find((x) => x.o === o);
  if (b) for (const k in b.cost) gain(k, Math.floor(b.cost[k] * 0.5));
  const i = idx(tx, ty);
  setObj(tx, ty, 0);
  clearTileState(i);
  sfx('break');
}
// Hammer: each hit restores 30% of the structure (more with better rarity) for 1 unit of its main material.
function repair(tx, ty, it) {
  const i = idx(tx, ty), o = W.obj[i], od = OBJ[o];
  const b = BUILD.find((x) => x.o === o);
  const mat = b ? Object.keys(b.cost).find((k) => ['madeira', 'pedra', 'sucata'].includes(k)) || Object.keys(b.cost)[0] : 'madeira';
  if (S.res[mat] < 1) { say(`Falta ${RES[mat].toLowerCase()} para consertar.`, 'bad'); sfx('click'); return; }
  S.res[mat]--;
  const add = Math.min(od.hp - W.hp[i], Math.round(od.hp * 0.3 * RAR[it.r].m));
  W.hp[i] += add;
  S.stats.repaired = (S.stats.repaired || 0) + 1;
  floatText(tx * TS + 8, ty * TS - 4, `+${add}`, '#9ad06a');
  burst(tx * TS + 8, ty * TS + 6, '#e8dcb0', 4, 25);
  FX.push({ swing: true, x: S.player.x, y: S.player.y - 6, a: Math.atan2(ty * TS + 8 - S.player.y, tx * TS + 8 - S.player.x), life: 0.15, r: 18 });
  sfx('repair');
  wearItem(it);
  if (W.hp[i] >= od.hp) say(`${od.n} consertada.`, 'good');
}
const farmStage = (i) => { const g = S.farms[i] || 0; return g >= 120 ? 3 : g >= 70 ? 2 : g >= 25 ? 1 : 0; };
function harvest(i, byWho) {
  if (farmStage(i) < 3) return false;
  S.farms[i] = 0;
  const x = (i % WW) * TS + 8, y = Math.floor(i / WW) * TS + 8;
  gain('comida', irnd(3, 5), x, y);
  if (!byWho) sfx('pickup');
  return true;
}
// Saplings become trees; fruit trees grow, then give fruit again and again.
const SAPLING_TIME = 240, FRUIT_GROWN = 170, FRUIT_RIPE = 300;
const fruitStage = (i) => { const g = S.grow[i] || 0; return g >= FRUIT_RIPE ? 3 : g >= FRUIT_GROWN ? 2 : g >= 60 ? 1 : 0; };
function harvestFruit(i, byWho) {
  if (fruitStage(i) < 3) return false;
  S.grow[i] = FRUIT_GROWN;
  const x = (i % WW) * TS + 8, y = Math.floor(i / WW) * TS;
  gain('comida', irnd(3, 5), x, y);
  if (Math.random() < 0.4) gain('sementes', 1, x, y - 8);
  if (!byWho) sfx('pickup');
  return true;
}
function updatePlants(dt, boost) {
  for (const k in S.grow) {
    const i = Number(k), o = W.obj[i];
    if (o !== O.SAPLING && o !== O.FRUIT) { delete S.grow[k]; continue; }
    S.grow[k] = Math.min(FRUIT_RIPE, S.grow[k] + dt * boost);
    if (o === O.SAPLING && S.grow[k] >= SAPLING_TIME) {
      const x = i % WW, y = Math.floor(i / WW);
      const blocked = [S.player, ...Z, ...S.surv, ...S.animals].some((e) => tileOf(e.x) === x && tileOf(e.y - 3) === y);
      if (blocked) continue;
      delete S.grow[k];
      setObj(x, y, O.TREE);
      burst(x * TS + 8, y * TS + 4, '#7cb04a', 8, 30);
    }
  }
}
function useTile(t) {
  if (t.o === O.CRATE) openCrate(t.x, t.y);
  else if (t.o === O.FARM) { if (!harvest(idx(t.x, t.y))) say('Ainda está crescendo.'); }
  else if (t.o === O.FRUIT) { if (!harvestFruit(idx(t.x, t.y))) say('As frutas ainda não estão maduras.'); }
  else if (t.o === O.SAPLING) say(`Vira árvore em uns ${Math.max(1, Math.ceil((SAPLING_TIME - (S.grow[idx(t.x, t.y)] || 0)) / 60))} min.`);
  else if (t.o === O.BED) say('Você renasce na cama se morrer. Sobreviventes também precisam de camas.');
  else if (t.o === O.CHEST) say(`Cada baú aumenta o limite de recursos em 150 (agora: ${capOf('madeira')}).`);
}

// ---------- Zombies ----------
// Difficulty: zombies get tougher every day.
function zScale(day) {
  const d = day - 1;
  return { hp: 1 + 0.12 * d + 0.004 * d * d, dmg: 1 + 0.06 * d, spd: 1 + Math.min(0.25, 0.012 * d) };
}
function threatOf(day) { let t = THREAT[0]; for (const x of THREAT) if (day >= x[0]) t = x; return t; }
function zTypesFor(day) { return Object.keys(ZT).filter((k) => !ZT[k].boss && day >= ZT[k].from); }
function pickZType(day, daytime) {
  let types = zTypesFor(day);
  if (daytime) types = types.filter((k) => ['comum', 'rastejante', 'veloz'].includes(k) || (day >= 10 && Math.random() < 0.15));
  // ordinary zombies become a smaller share as days pass
  return wpick(types.map((k) => [k, k === 'comum' ? Math.max(3, ZT.comum.w - day * 0.4) : ZT[k].w]));
}
function spawnZombie(type, tx, ty, night) {
  const d = ZT[type];
  const sc = zScale(S.day);
  const hp = d.hp * sc.hp * (d.boss ? 1 + 0.1 * Math.floor(S.day / 5) : 1);
  Z.push({ id: nextZid++, t: type, x: tx * TS + 8, y: ty * TS + 8, hp, max: hp, spd: d.spd * sc.spd * rnd(0.9, 1.1), dmg: d.dmg * sc.dmg, r: d.r,
    cd: 0, spitCd: 2, dir: 0, anim: Math.random() * 4, night, wx: 0, wy: 0, wt: 0, kb: [0, 0], atk: 0, fuse: 0, rage: 0, scd: 0 });
}
function hurtZombie(z, dmg, kx = 0, ky = 0) {
  const zt = ZT[z.t];
  if (zt.armor) dmg = Math.max(1, dmg - zt.armor);
  z.hp -= dmg;
  z.kb = [kx, ky];
  z.flash = 0.12;
  floatText(z.x, z.y - 18, String(Math.round(dmg)), zt.armor ? '#b8c8dc' : '#f0e0c0');
  burst(z.x, z.y - 8, '#6a2a22', 3, 30);
  if (z.hp <= 0) killZombie(z);
}
function killZombie(z) {
  const i = Z.indexOf(z);
  if (i < 0) return;
  Z.splice(i, 1);
  S.stats.kills++;
  burst(z.x, z.y - 6, '#5a2a22', 10, 50);
  const zt = ZT[z.t];
  if (Math.random() < (zt.boss ? 1 : 0.25)) {
    const loot = zt.boss ? { pecas: irnd(3, 5), municao: irnd(15, 30) } : pick([{ municao: irnd(2, 5) }, { tecido: 1 }, { sucata: irnd(1, 3) }, { comida: 1 }]);
    for (const k in loot) gain(k, loot[k], z.x, z.y);
  }
  sfx('zdie');
  if (zt.boom) explode(z.x, z.y - 4, z.dmg * 4);
}
// Inchado: blows up when it dies or reaches you. Hurts everyone close and breaks structures.
function explode(x, y, dmg) {
  const R0 = 34;
  for (let k = 0; k < 26; k++) { const a = Math.random() * 7, s = rnd(20, 90); FX.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: rnd(0.3, 0.7), col: pick(['#f0a040', '#e0603a', '#9cc060', '#5a4a30']) }); }
  sfx('boom');
  const p = S.player, f = (d) => 1 - (d / R0) * 0.5;
  let d = dist(x, y, p.x, p.y - 6);
  if (p.hp > 0 && d < R0) hurtPlayer(dmg * f(d));
  for (const s of [...S.surv]) { d = dist(x, y, s.x, s.y - 6); if (d < R0) hurtSurv(s, dmg * f(d)); }
  for (const a of [...S.animals]) { d = dist(x, y, a.x, a.y - 4); if (d < R0) hurtAnimal(a, dmg * f(d), true); }
  for (const z of [...Z]) { d = dist(x, y, z.x, z.y - 6); if (d < R0) hurtZombie(z, dmg * 0.6 * f(d)); }
  const tx = tileOf(x), ty = tileOf(y);
  for (let yy = ty - 1; yy <= ty + 1; yy++) for (let xx = tx - 1; xx <= tx + 1; xx++) { const o = objAt(xx, yy); if (OBJ[o] && OBJ[o].build) damageStructure(xx, yy, dmg * 2.5); }
}
// Gritador: screams once it sees you; nearby zombies charge, and more come.
function scream(z) {
  z.scd = 25;
  for (const o of Z) if (dist(o.x, o.y, z.x, z.y) < 12 * TS) { o.night = true; o.rage = 7; }
  if (Z.length < 90) for (let k = 0; k < 2 + Math.floor(S.day / 8); k++) { const p = spawnPointAround(tileOf(z.x), tileOf(z.y), 6, 10); if (p) spawnZombie(pickZType(S.day, !isNight()), p[0], p[1], true); }
  floatText(z.x, z.y - 24, 'AAAAH!', '#f2a497');
  say('Um Gritador chamou a horda!', 'bad');
  sfx('scream');
}
function spawnPointAround(cx, cy, r0, r1) {
  for (let t = 0; t < 40; t++) {
    const a = Math.random() * Math.PI * 2, r = rnd(r0, r1);
    const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
    if (inb(x, y) && !zSolidAt(x, y) && objAt(x, y) !== O.SPIKES) return [x, y];
  }
  return null;
}
function startNight() {
  S.stats.nights++;
  const n = S.day;
  const [bx, by] = baseCenter();
  const count = Math.min(44, 2 + n * 2);
  for (let i = 0; i < count; i++) {
    const p = spawnPointAround(bx, by, 20, 27);
    if (p) spawnZombie(i < 2 ? 'comum' : pickZType(n, false), p[0], p[1], true);
  }
  if (n % 5 === 0) { const p = spawnPointAround(bx, by, 22, 26); if (p) spawnZombie('colosso', p[0], p[1], true); }
  say(n % 5 === 0 ? `Noite ${n}: uma horda com um Colosso está vindo!` : `Noite ${n}: a horda está vindo!`, 'bad');
  const fresh = zTypesFor(n).filter((k) => ZT[k].from === n);
  if (fresh.length) say(`Novo perigo esta noite: ${fresh.map((k) => ZT[k].n).join(', ')}.`, 'warn');
  sfx('alarm');
  S.secondWave = n >= 3 ? 40 : -1;
}
function secondWave() {
  const n = S.day;
  const [bx, by] = baseCenter();
  for (let i = 0; i < Math.min(24, n); i++) { const p = spawnPointAround(bx, by, 20, 27); if (p) spawnZombie(pickZType(n, false), p[0], p[1], true); }
}
function newDay() {
  S.day++;
  S.time = 0;
  // regrowth
  S.regrow = S.regrow.filter(([i, o, d]) => {
    if (d > S.day) return true;
    const cur = W.obj[i];
    if (cur && cur !== O.STUMP) return false;
    const x = i % WW, y = Math.floor(i / WW);
    if (dist(S.player.x, S.player.y, x * TS + 8, y * TS + 8) < 40) return true;
    setObj(x, y, o);
    return false;
  });
  // new supplies show up in a few houses
  let crates = countObj(O.CRATE);
  for (let k = 0; k < 8 && crates < 110; k++) {
    const h = pick(W.houses);
    const x = h.x + 1 + Math.floor(Math.random() * (h.w - 2)), y = h.y + 1 + Math.floor(Math.random() * (h.h - 2));
    if (!W.obj[idx(x, y)]) { setObj(x, y, O.CRATE); crates++; }
  }
  // survivors eat
  for (const s of [...S.surv]) {
    if (S.res.comida >= 2) S.res.comida -= 2;
    else { s.hp -= 25; say(`${s.name} passou fome.`, 'warn'); if (s.hp <= 0) killSurv(s, 'de fome'); }
  }
  // night zombies wander off at dawn
  for (const z of Z) z.night = false;
  // wild animals come back to the forest
  if (S.animals.filter((a) => !a.tame).length < 12) spawnAnimals(3, false);
  say(`Dia ${S.day}. Você sobreviveu à noite.`, 'good');
  const th = threatOf(S.day);
  if (th[0] === S.day && S.day > 1) say(`Ameaça: ${th[1]}. Os zumbis estão mais fortes.`, 'warn');
  sfx('good');
}

// ---------- Flow field for zombie pathing ----------
const FF = { R: 34, cx: 0, cy: 0, d: new Float32Array(69 * 69), t: 0 };
function zCost(x, y) {
  if (!inb(x, y)) return Infinity;
  const i = idx(x, y);
  if (W.ground[i] === G.WATER) return Infinity;
  const o = W.obj[i];
  if (!o) return 1;
  const od = OBJ[o];
  if (!od.build) return od.solid ? Infinity : 1;
  if (od.spikes) return 3;
  if (od.solid || od.door) return 1 + W.hp[i] / 20;
  return 1;
}
function buildFlowField() {
  const R = FF.R, N = 2 * R + 1;
  FF.cx = tileOf(S.player.x); FF.cy = tileOf(S.player.y - 3);
  const d = FF.d;
  d.fill(Infinity);
  const h = new Heap();
  const src = new Set();
  const seed = (x, y, c) => { const lx = x - FF.cx + R, ly = y - FF.cy + R; if (lx < 0 || ly < 0 || lx >= N || ly >= N) return; const k = ly * N + lx; src.add(k); if (c < d[k]) { d[k] = c; h.push(c, k); } };
  if (S.player.hp > 0) seed(FF.cx, FF.cy, 0);
  for (const s of S.surv) seed(tileOf(s.x), tileOf(s.y - 3), 2);
  for (const i of W.built) { const o = W.obj[i]; if (OBJ[o].home || o === O.FARM) seed(i % WW, Math.floor(i / WW), 8); }
  while (h.size) {
    const k = h.pop(), c = d[k];
    const lx = k % N, ly = (k / N) | 0, x = lx + FF.cx - R, y = ly + FF.cy - R;
    // stepping from a neighbor into k costs k's own cost (walls are expensive);
    // targets cost 1 because zombies attack them instead of entering
    const enter = src.has(k) ? 1 : zCost(x, y);
    for (const [dx, dy] of DIRS8) {
      const nx = lx + dx, ny = ly + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const wx = nx + FF.cx - R, wy = ny + FF.cy - R;
      if (!isFinite(zCost(wx, wy))) continue;
      if (dx && dy && (!isFinite(zCost(x + dx, y)) || !isFinite(zCost(x, y + dy)) || zSolidAt(x + dx, y) || zSolidAt(x, y + dy))) continue;
      const nc = c + (isFinite(enter) ? enter : 1) * (dx && dy ? 1.414 : 1);
      const nk = ny * N + nx;
      if (nc < d[nk]) { d[nk] = nc; h.push(nc, nk); }
    }
  }
}
function ffAt(x, y) {
  const R = FF.R, N = 2 * R + 1, lx = x - FF.cx + R, ly = y - FF.cy + R;
  if (lx < 0 || ly < 0 || lx >= N || ly >= N) return Infinity;
  return FF.d[ly * N + lx];
}

function updateZombies(dt) {
  const p = S.player;
  // spawning during the day
  S.zSpawn = (S.zSpawn || 0) - dt;
  const dayCap = Math.min(28, 7 + S.day * 2);
  if (S.zSpawn <= 0) {
    S.zSpawn = 3;
    if (Z.filter((z) => !z.night).length < dayCap) {
      const pt = spawnPointAround(tileOf(p.x), tileOf(p.y), 17, 30);
      const [bx, by] = baseCenter();
      if (pt && dist(pt[0], pt[1], bx, by) > 12) spawnZombie(pickZType(S.day, true), pt[0], pt[1], false);
    }
  }
  FF.t -= dt;
  if (FF.t <= 0) { FF.t = 0.35; buildFlowField(); }
  for (const z of [...Z]) {
    if (!Z.includes(z)) continue; // removed by an explosion this frame
    const zt = ZT[z.t];
    z.cd -= dt; z.flash = Math.max(0, (z.flash || 0) - dt); z.rage = Math.max(0, (z.rage || 0) - dt); z.scd = Math.max(0, (z.scd || 0) - dt);
    if (z.kb[0] || z.kb[1]) { moveEnt(z, z.kb[0] * dt, z.kb[1] * dt, zSolidAt, z.r); z.kb = [z.kb[0] * 0.8, z.kb[1] * 0.8]; if (Math.abs(z.kb[0]) + Math.abs(z.kb[1]) < 2) z.kb = [0, 0]; }
    // a lit fuse goes off no matter what
    if (z.fuse > 0) { z.fuse -= dt; if (z.fuse <= 0) { z.hp = 0; killZombie(z); } continue; }
    const dp = dist(z.x, z.y, p.x, p.y);
    if (dp > 48 * TS) { Z.splice(Z.indexOf(z), 1); continue; }
    // nearest living target among player, survivors and tamed animals
    let tgt = p.hp > 0 ? p : null, td = tgt ? dp : Infinity;
    for (const s of S.surv) { const d = dist(z.x, z.y, s.x, s.y); if (d < td) { td = d; tgt = s; } }
    for (const a of S.animals) { if (!a.tame) continue; const d = dist(z.x, z.y, a.x, a.y); if (d < td && d < 90) { td = d; tgt = a; } }
    const aggro = z.night || z.rage > 0 || td < (isNight() ? 200 : 110);
    if (zt.scream && z.scd <= 0 && tgt && td < 130 && lineClear(z.x, z.y - 6, tgt.x, tgt.y - 6)) scream(z);
    // spit attack
    if (zt.spit && tgt && td < zt.spit && lineClear(z.x, z.y - 6, tgt.x, tgt.y - 6)) {
      z.spitCd -= dt;
      if (z.spitCd <= 0) {
        z.spitCd = 2.6;
        const a = Math.atan2(tgt.y - z.y, tgt.x - z.x);
        BUL.push({ x: z.x, y: z.y - 8, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, dmg: z.dmg, range: zt.spit + 20, from: 'z', spit: true });
      }
      if (td < zt.spit * 0.6) continue;
    }
    // melee (an Inchado lights its fuse instead)
    if (tgt && td < z.r + 9) {
      if (zt.boom) { z.fuse = 0.8; sfx('fuse'); continue; }
      if (z.cd <= 0) {
        z.cd = 1; z.atk = 0.2;
        if (tgt === p) hurtPlayer(z.dmg); else if (tgt.t && ANIMALS[tgt.t]) hurtAnimal(tgt, z.dmg, true); else hurtSurv(tgt, z.dmg);
      }
      continue;
    }
    let mx = 0, my = 0;
    const tx = tileOf(z.x), ty = tileOf(z.y - 3);
    if (aggro) {
      const here = ffAt(tx, ty);
      if (isFinite(here) && (z.night || td < 220)) {
        let best = here, bx = 0, by = 0;
        for (const [dx, dy] of DIRS8) {
          const v = ffAt(tx + dx, ty + dy);
          if (dx && dy && (zSolidAt(tx + dx, ty) || zSolidAt(tx, ty + dy))) continue;
          if (v < best) { best = v; bx = dx; by = dy; }
        }
        if (bx || by) {
          const nx = tx + bx, ny = ty + by;
          if (zSolidAt(nx, ny) && OBJ[objAt(nx, ny)] && OBJ[objAt(nx, ny)].build) {
            // structure in the way: attack it
            if (zt.boom) { z.fuse = 0.8; sfx('fuse'); continue; }
            if (z.cd <= 0) { z.cd = 1; z.atk = 0.2; damageStructure(nx, ny, z.dmg * (zt.big ? 2 : 1)); }
            z.dir = dirOf(bx, by);
            continue;
          }
          mx = nx * TS + 8 - z.x; my = ny * TS + 11 - z.y;
        } else if (tgt) { mx = tgt.x - z.x; my = tgt.y - z.y; }
      } else if (tgt) { mx = tgt.x - z.x; my = tgt.y - z.y; }
    } else {
      z.wt -= dt;
      if (z.wt <= 0) { z.wt = rnd(2, 5); const a = Math.random() * Math.PI * 2; z.wx = Math.cos(a); z.wy = Math.sin(a); if (Math.random() < 0.4) { z.wx = 0; z.wy = 0; } }
      mx = z.wx; my = z.wy;
    }
    const ml = Math.hypot(mx, my);
    if (ml > 0.01) {
      const sp = z.spd * (aggro ? 1 : 0.4) * (S.player.hp <= 0 ? 0.5 : 1) * (z.rage > 0 ? 1.35 : 1);
      moveEnt(z, mx / ml * sp * dt, my / ml * sp * dt, zSolidAt, z.r);
      z.dir = dirOf(mx, my);
      z.anim += dt * 6;
    }
    // spikes
    const st = objAt(tileOf(z.x), tileOf(z.y - 2));
    if (st === O.SPIKES) {
      hurtZombieDot(z, 12 * dt);
      const i = idx(tileOf(z.x), tileOf(z.y - 2));
      W.hp[i] = Math.max(0, W.hp[i] - 3 * dt);
      if (W.hp[i] <= 0) setObj(tileOf(z.x), tileOf(z.y - 2), 0);
    }
  }
  // keep zombies apart
  for (let i = 0; i < Z.length; i++) for (let j = i + 1; j < Z.length; j++) {
    const a = Z[i], b = Z[j], d = dist(a.x, a.y, b.x, b.y), m = a.r + b.r;
    if (d > 0 && d < m) { const push = (m - d) / 2, ux = (a.x - b.x) / d, uy = (a.y - b.y) / d; moveEnt(a, ux * push, uy * push, zSolidAt, a.r); moveEnt(b, -ux * push, -uy * push, zSolidAt, b.r); }
  }
}
function hurtZombieDot(z, dmg) { z.hp -= dmg; if (z.hp <= 0) killZombie(z); }
function damageStructure(tx, ty, dmg) {
  const i = idx(tx, ty);
  const hp = W.hp[i] - dmg;
  burst(tx * TS + 8, ty * TS + 8, '#8a6640', 3, 25);
  sfx('thud');
  if (hp <= 0) {
    const o = W.obj[i];
    setObj(tx, ty, 0);
    clearTileState(i);
    say(`Os zumbis destruíram: ${OBJ[o].n}.`, 'bad');
    burst(tx * TS + 8, ty * TS + 8, '#6e5232', 12, 60);
  } else W.hp[i] = Math.round(hp);
}
function hurtPlayer(dmg) {
  const p = S.player;
  if (p.hp <= 0) return;
  const a = armorValue();
  const real = dmg * (1 - a / (a + 15));
  p.hp -= real;
  p.hurt = 0.25;
  for (const id of [S.head, S.body]) { const it = id && itemById(id); if (it) wearItem(it); }
  floatText(p.x, p.y - 20, `-${Math.round(real)}`, '#ff7a6a');
  sfx('hurt');
  if (p.hp <= 0) playerDied();
}
function playerDied() {
  const p = S.player;
  p.hp = 0;
  S.stats.deaths++;
  const lost = {};
  for (const k of ['madeira', 'pedra', 'sucata', 'comida']) { const l = Math.floor(S.res[k] * 0.25); if (l) { S.res[k] -= l; lost[k] = l; } }
  S.deathTimer = 3;
  S.lastLoss = lost;
  sfx('lose');
}
function respawn() {
  const p = S.player;
  const beds = [...W.built].filter((i) => W.obj[i] === O.BED);
  let tx = W.spawn.x, ty = W.spawn.y;
  if (beds.length) { tx = beds[0] % WW; ty = Math.floor(beds[0] / WW); }
  const [fx, fy] = freeTileNear(tx, ty, 4);
  p.x = fx * TS + 8; p.y = fy * TS + 10;
  p.hp = 60; p.hunger = Math.max(p.hunger, 50);
  for (const z of [...Z]) if (dist(z.x, z.y, p.x, p.y) < 10 * TS) Z.splice(Z.indexOf(z), 1);
  S.deathTimer = 0;
}

// ---------- Projectiles ----------
function updateBullets(dt) {
  for (const b of [...BUL]) {
    const sx = b.vx * dt, sy = b.vy * dt;
    b.x += sx; b.y += sy; b.range -= Math.hypot(sx, sy);
    // shots fly over the player's own structures but stop at trees, rocks and ruins
    const bt = objAt(tileOf(b.x), tileOf(b.y + 4));
    const overOwn = b.from !== 'z' && OBJ[bt] && OBJ[bt].build;
    let gone = b.range <= 0 || (!overOwn && solidAt(tileOf(b.x), tileOf(b.y + 4)));
    if (!gone && b.from !== 'z') {
      for (const z of Z) {
        if (b.hit && b.hit.includes(z.id)) continue;
        if (dist(b.x, b.y, z.x, z.y - 6) < z.r + 4) {
          hurtZombie(z, b.dmg, b.vx * 0.15, b.vy * 0.15);
          (b.hit = b.hit || []).push(z.id);
          if (b.pierce > 0) b.pierce--; else { gone = true; break; }
        }
      }
    } else if (!gone) {
      const p = S.player;
      if (p.hp > 0 && dist(b.x, b.y, p.x, p.y - 6) < 8) { hurtPlayer(b.dmg); gone = true; }
      for (const s of S.surv) if (!gone && dist(b.x, b.y, s.x, s.y - 6) < 8) { hurtSurv(s, b.dmg); gone = true; }
    }
    if (gone) { BUL.splice(BUL.indexOf(b), 1); if (b.spit) burst(b.x, b.y, '#9cc060', 5, 30); }
  }
}

// ---------- Survivors ----------
function hurtSurv(s, dmg) {
  s.hp -= dmg;
  s.hurt = 0.25;
  floatText(s.x, s.y - 20, `-${Math.round(dmg)}`, '#ff9a8a');
  if (s.hp <= 0) killSurv(s, 'atacado por zumbis');
}
function killSurv(s, why) {
  S.surv = S.surv.filter((x) => x !== s);
  say(`${s.name} morreu ${why}.`, 'bad');
  burst(s.x, s.y - 6, '#6a2a22', 12, 50);
}
function survPassable(x, y) {
  if (!inb(x, y) || solidAt(x, y)) return Infinity;
  return objAt(x, y) === O.SPIKES ? 8 : 1;
}
function nearestObj(cx, cy, r, test) {
  let best = null, bd = Infinity;
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (!inb(x, y) || !test(W.obj[idx(x, y)], idx(x, y))) continue;
    const d = Math.abs(x - cx) + Math.abs(y - cy);
    if (d < bd) { bd = d; best = [x, y]; }
  }
  return best;
}
function walkPath(s, dt, spd) {
  if (!s.path || !s.path.length) return true;
  const [tx, ty] = s.path[0];
  const gx = tx * TS + 8, gy = ty * TS + 11;
  const dx = gx - s.x, dy = gy - s.y, d = Math.hypot(dx, dy);
  if (d < 2) { s.path.shift(); return !s.path.length; }
  const st = Math.min(d, spd * dt);
  const ox = s.x, oy = s.y;
  moveEnt(s, dx / d * st, dy / d * st, solidAt, 3);
  if (Math.abs(s.x - ox) + Math.abs(s.y - oy) < 0.01) { s.stuck = (s.stuck || 0) + dt; if (s.stuck > 1) { s.path = null; s.stuck = 0; return true; } }
  s.dir = dirOf(dx, dy);
  s.anim += dt * 8;
  return false;
}
function goTo(s, tx, ty, near) {
  const p = findPath(tileOf(s.x), tileOf(s.y - 3), tx, ty, survPassable, near ? 3000 : 3000, near);
  s.path = p ? p.slice(1) : null;
  return !!p;
}
function updateSurvivors(dt) {
  const night = isNight();
  const hasFarmer = S.surv.some((s) => s.spec === 'Agricultor');
  for (const i in S.farms) S.farms[i] = Math.min(140, S.farms[i] + dt * (hasFarmer ? 1.5 : 1));
  updatePlants(dt, hasFarmer ? 1.3 : 1);
  for (const s of S.surv) {
    s.cd -= dt;
    s.hurt = Math.max(0, (s.hurt || 0) - dt);
    if (s.hp < 100) s.hp = Math.min(100, s.hp + dt * 0.5);
    if (s.bed !== null && W.obj[s.bed] !== O.BED) s.bed = null;
    if (s.bed === null) { const b = freeBeds(); if (b.length) s.bed = b[0]; }
    const home = s.bed !== null ? [s.bed % WW, Math.floor(s.bed / WW)] : baseCenter();
    const stx = tileOf(s.x), sty = tileOf(s.y - 3);
    const far = Math.abs(stx - home[0]) + Math.abs(sty - home[1]);
    // far from home (just recruited): head back, teleporting if no path is found
    if (far > 40) {
      if (!s.path) { if (!goTo(s, home[0], home[1], true)) { s.lost = (s.lost || 0) + dt; if (s.lost > 8) { const [fx, fy] = freeTileNear(home[0], home[1], 3); s.x = fx * TS + 8; s.y = fy * TS + 11; s.lost = 0; } } }
      walkPath(s, dt, 52);
      continue;
    }
    // guards fight
    if (s.spec === 'Guarda' || !night) {
      let zn = null, zd = s.spec === 'Guarda' ? 9 * TS : 2.5 * TS;
      for (const z of Z) { const d = dist(s.x, s.y, z.x, z.y); if (d < zd) { zd = d; zn = z; } }
      if (zn) {
        const it = s.item && itemById(s.item);
        const d = it ? ITEMS[it.base] : null;
        if (d && d.kind === 'gun' && S.res.municao > 0 && zd < d.range && lineClear(s.x, s.y - 6, zn.x, zn.y - 6)) {
          if (s.cd <= 0) {
            s.cd = 1 / d.spd; S.res.municao--;
            const a = Math.atan2(zn.y - s.y, zn.x - s.x);
            BUL.push({ x: s.x, y: s.y - 6, vx: Math.cos(a) * 340, vy: Math.sin(a) * 340, dmg: istat(it, 'dmg'), range: d.range, pierce: d.pierce || 0, from: 's' });
            s.dir = dirOf(Math.cos(a), Math.sin(a));
          }
        } else if (zd < 16 + zn.r) {
          if (s.cd <= 0) { s.cd = d ? 1 / d.spd : 0.9; hurtZombie(zn, (d && d.kind !== 'gun' ? istat(it, 'dmg') : 7) * (s.spec === 'Guarda' ? 1.3 : 0.7)); s.dir = dirOf(zn.x - s.x, zn.y - s.y); }
        } else if (s.spec === 'Guarda') {
          s.path = null;
          const dx = zn.x - s.x, dy = zn.y - s.y, dd = Math.hypot(dx, dy);
          moveEnt(s, dx / dd * 50 * dt, dy / dd * 50 * dt, solidAt, 3);
          s.dir = dirOf(dx, dy); s.anim += dt * 8;
        }
        continue;
      }
    }
    // night: everyone else goes to bed
    if (night && s.spec !== 'Guarda') {
      if (far > 0) { if (!s.path) goTo(s, home[0], home[1], false); walkPath(s, dt, 48); }
      s.sleep = far === 0;
      continue;
    }
    s.sleep = false;
    // work
    if (s.path && s.path.length) { walkPath(s, dt, 40); continue; }
    // farmer: collect eggs, wool and milk from tamed animals
    if (s.atask) {
      const a = S.animals.find((x) => x.id === s.atask);
      if (!a || !a.tame || a.follow || a.prod < ANIMALS[a.t].every) { s.atask = null; continue; }
      if (dist(s.x, s.y, a.x, a.y) < 18) { if (s.cd <= 0) { s.cd = 1.2; a.prod = 0; const d = ANIMALS[a.t]; for (const k in d.prod) gain(k, d.prod[k], a.x, a.y - 10); s.atask = null; } }
      else if (!goTo(s, tileOf(a.x), tileOf(a.y - 3), true)) s.atask = null;
      continue;
    }
    if (s.task) {
      const [tx, ty] = s.task;
      const o = objAt(tx, ty);
      const adj = Math.max(Math.abs(tx - stx), Math.abs(ty - sty)) <= 1;
      const valid = s.spec === 'Agricultor' ? (o === O.FARM && farmStage(idx(tx, ty)) >= 3) || (o === O.FRUIT && fruitStage(idx(tx, ty)) >= 3) : OBJ[o] && OBJ[o].give && !OBJ[o].build;
      if (!valid) { s.task = null; continue; }
      if (!adj) { if (!goTo(s, tx, ty, true)) s.task = null; continue; }
      s.dir = dirOf(tx * TS + 8 - s.x, ty * TS + 8 - s.y);
      if (s.cd <= 0) {
        s.cd = 1.6;
        if (s.spec === 'Agricultor') { if (o === O.FRUIT) harvestFruit(idx(tx, ty), s); else harvest(idx(tx, ty), s); s.task = null; }
        else hitObject(tx, ty, 2, s.x, s.y);
      }
      continue;
    }
    if (s.cd > 0) continue;
    s.cd = 1.5;
    if (s.spec === 'Agricultor') {
      const a = S.animals.find((x) => x.tame && !x.follow && x.prod >= ANIMALS[x.t].every && Math.abs(tileOf(x.x) - home[0]) + Math.abs(tileOf(x.y) - home[1]) < 16);
      if (a) { s.atask = a.id; continue; }
    }
    const want = s.spec === 'Lenhador' ? (o) => o === O.TREE || o === O.PINE
      : s.spec === 'Minerador' ? (o) => o === O.ROCK || o === O.SCRAP
      : s.spec === 'Agricultor' ? (o, i) => (o === O.FARM && farmStage(i) >= 3) || (o === O.FRUIT && fruitStage(i) >= 3) : null;
    if (want) {
      const t = nearestObj(home[0], home[1], 12, want);
      if (t) { s.task = t; continue; }
    }
    // idle: wander near home
    if (Math.random() < 0.4) { const [wx, wy] = freeTileNear(home[0] + irnd(-3, 3), home[1] + irnd(-3, 3), 2); goTo(s, wx, wy, false); }
  }
}
function updateNpcs(dt) {
  for (const n of S.npcs) {
    n.t = (n.t || 0) - dt;
    if (n.t <= 0) { n.t = rnd(2, 5); const a = Math.random() * Math.PI * 2; n.mx = Math.random() < 0.5 ? 0 : Math.cos(a); n.my = Math.random() < 0.5 ? 0 : Math.sin(a); }
    if (n.mx || n.my) {
      const [hx, hy, hw, hh] = n.home;
      const nx = n.x + n.mx * 14 * dt, ny = n.y + n.my * 14 * dt;
      if (tileOf(nx) > hx && tileOf(nx) < hx + hw - 1 && tileOf(ny) > hy && tileOf(ny) < hy + hh - 1) { moveEnt(n, n.mx * 14 * dt, n.my * 14 * dt, solidAt, 3); n.dir = dirOf(n.mx, n.my); n.anim = (n.anim || 0) + dt * 6; }
    }
  }
}

// ---------- Animals ----------
function spawnAnimals(n, anywhere) {
  const p = S.player;
  for (let k = 0, made = 0; k < n * 40 && made < n; k++) {
    const x = irnd(6, 98), y = irnd(6, WH - 7);
    const g = groundAt(x, y);
    if ((g !== G.GRASS && g !== G.DIRT) || solidAt(x, y) || objAt(x, y)) continue;
    const dp = Math.hypot(x - tileOf(p.x), y - tileOf(p.y));
    if (dp < (anywhere ? 9 : 22)) continue;
    const t = wpick(Object.keys(ANIMALS).map((a) => [a, ANIMALS[a].w]));
    // animals come in small groups
    for (let j = 0; j < (t === 'galinha' ? 2 : 1) + (Math.random() < 0.4 ? 1 : 0) && made < n; j++) {
      const [fx, fy] = freeTileNear(x + irnd(-1, 1), y + irnd(-1, 1), 2);
      S.animals.push({ id: S.nextId++, t, x: fx * TS + 8, y: fy * TS + 10, hp: ANIMALS[t].hp, tame: false, fed: 0, follow: false, home: null, prod: 0, dir: 3, anim: 0, wt: 0, mx: 0, my: 0, flee: 0, hurt: 0 });
      made++;
    }
  }
}
// Animals stop at walls, fences and closed gates, unless they are following you.
function animalSolid(a) { return a.follow ? solidAt : (x, y) => solidAt(x, y) || !!(OBJ[objAt(x, y)] && OBJ[objAt(x, y)].door); }
function hurtAnimal(a, dmg, byZombie) {
  a.hp -= dmg;
  a.hurt = 0.2;
  if (!a.tame) a.flee = 3;
  floatText(a.x, a.y - 14, `-${Math.round(dmg)}`, '#ff9a8a');
  burst(a.x, a.y - 6, '#8a3a2a', 3, 25);
  if (a.hp > 0) return;
  S.animals = S.animals.filter((x) => x !== a);
  const d = ANIMALS[a.t];
  burst(a.x, a.y - 4, '#8a3a2a', 8, 40);
  if (a.tame) say(`Os zumbis mataram sua ${d.n.toLowerCase()}.`, 'bad');
  else if (!byZombie) gain('comida', d.meat, a.x, a.y - 8);
}
function feedAnimal(a) {
  const d = ANIMALS[a.t];
  if (S.res.comida < d.food) return say(`Precisa de ${d.food} comida para alimentar.`, 'bad');
  S.res.comida -= d.food;
  a.fed++;
  a.flee = 0;
  for (let k = 0; k < 3; k++) FX.push({ x: a.x + rnd(-4, 4), y: a.y - 12, vx: rnd(-8, 8), vy: -20, life: 0.8, txt: '♥', col: '#f07a8a' });
  sfx('eat');
  if (a.fed >= d.feeds) {
    a.tame = true; a.follow = true; a.home = null; a.prod = d.every * 0.5;
    S.stats.tamed = (S.stats.tamed || 0) + 1;
    say(`${d.n} domesticada! Ela segue você. Aperte E para ela ficar num lugar.`, 'good');
    sfx('good');
  }
}
function useAnimal(a) {
  const d = ANIMALS[a.t];
  if (!a.tame) return feedAnimal(a);
  if (a.prod >= d.every) {
    a.prod = 0;
    for (const k in d.prod) gain(k, d.prod[k], a.x, a.y - 10);
    sfx('pickup');
    return;
  }
  a.follow = !a.follow;
  if (!a.follow) { a.home = [tileOf(a.x), tileOf(a.y - 3)]; say(`A ${d.n.toLowerCase()} fica aqui. Cerque com cerca para ela não sair.`); }
  else { a.home = null; say(`A ${d.n.toLowerCase()} segue você.`); }
}
function updateAnimals(dt, boost) {
  const p = S.player;
  const running = p.moving && p.running;
  for (const a of S.animals) {
    const d = ANIMALS[a.t];
    a.hurt = Math.max(0, a.hurt - dt);
    if (a.tame) { a.prod = Math.min(d.every, a.prod + dt * boost); if (a.hp < d.hp) a.hp = Math.min(d.hp, a.hp + dt * 0.3); }
    const dp = dist(a.x, a.y, p.x, p.y);
    if (!a.tame && running && dp < 48) a.flee = Math.max(a.flee, 1.5);
    a.flee = Math.max(0, a.flee - dt);
    let mx = 0, my = 0, sp = d.spd;
    if (a.tame && a.follow && p.hp > 0) {
      if (dp > 20 * TS) { const [fx, fy] = freeTileNear(tileOf(p.x), tileOf(p.y), 3); a.x = fx * TS + 8; a.y = fy * TS + 10; }
      else if (dp > 22) { mx = p.x - a.x; my = p.y - a.y; sp = Math.max(d.spd, dp > 60 ? 95 : 70); }
    } else if (a.flee > 0) { mx = a.x - p.x; my = a.y - p.y; sp = d.spd * 2.2; }
    else {
      a.wt -= dt;
      if (a.wt <= 0) {
        a.wt = rnd(1.5, 4.5);
        const ang = Math.random() * Math.PI * 2;
        [a.mx, a.my] = Math.random() < 0.45 ? [0, 0] : [Math.cos(ang), Math.sin(ang)];
        // tamed animals left somewhere stay close to that spot
        if (a.tame && a.home) { const hx = a.home[0] * TS + 8 - a.x, hy = a.home[1] * TS + 10 - a.y; if (Math.hypot(hx, hy) > 3 * TS) { const l = Math.hypot(hx, hy); a.mx = hx / l; a.my = hy / l; } }
      }
      mx = a.mx; my = a.my; sp = d.spd * 0.5;
    }
    const l = Math.hypot(mx, my);
    if (l > 0.01) {
      const ox = a.x, oy = a.y;
      moveEnt(a, mx / l * sp * dt, my / l * sp * dt, animalSolid(a), 3);
      a.moving = Math.abs(a.x - ox) + Math.abs(a.y - oy) > 0.01;
      if (Math.abs(mx) > 0.05) a.dir = mx < 0 ? 2 : 3;
      a.anim += dt * 7;
      if (!a.moving && !a.follow) a.wt = 0;
    } else a.moving = false;
  }
}

// ---------- Turrets ----------
function updateTurrets(dt) {
  S.turretCd = S.turretCd || {};
  for (const i of W.built) {
    if (W.obj[i] !== O.TURRET) continue;
    const cd = (S.turretCd[i] || 0) - dt;
    S.turretCd[i] = cd;
    if (cd > 0) continue;
    const x = (i % WW) * TS + 8, y = Math.floor(i / WW) * TS + 4;
    let zn = null, zd = 8 * TS;
    for (const z of Z) { const d = dist(x, y, z.x, z.y - 6); if (d < zd) { zd = d; zn = z; } }
    if (!zn || S.res.municao < 1) continue;
    S.res.municao--;
    S.turretCd[i] = 0.7;
    const a = Math.atan2(zn.y - 6 - y, zn.x - x);
    S.turretAng = S.turretAng || {};
    S.turretAng[i] = a;
    BUL.push({ x, y, vx: Math.cos(a) * 360, vy: Math.sin(a) * 360, dmg: 12, range: 8 * TS + 10, from: 't' });
    sfx('shootSoft');
  }
}

// ---------- Main update ----------
const KEYS = new Set();
let mouseDown = false;
function updatePlayer(dt) {
  const p = S.player;
  if (p.hp <= 0) { S.deathTimer -= dt; return; }
  let mx = 0, my = 0;
  if (KEYS.has('KeyW') || KEYS.has('ArrowUp')) my -= 1;
  if (KEYS.has('KeyS') || KEYS.has('ArrowDown')) my += 1;
  if (KEYS.has('KeyA') || KEYS.has('ArrowLeft')) mx -= 1;
  if (KEYS.has('KeyD') || KEYS.has('ArrowRight')) mx += 1;
  // stamina: running drains it; when it runs out you must catch your breath before running again
  if (p.stam === undefined) p.stam = 100;
  const wantRun = KEYS.has('ShiftLeft') || KEYS.has('ShiftRight');
  const run = wantRun && (mx || my) && !p.tired && p.stam > 0;
  if (run) {
    p.stam = Math.max(0, p.stam - STAM.drain * dt);
    p.restT = STAM.delay;
    if (p.stam <= 0) { p.tired = true; say('Sem fôlego! Espere a estamina voltar.', 'warn'); }
  } else {
    p.restT = Math.max(0, (p.restT || 0) - dt);
    if (p.restT <= 0) p.stam = Math.min(100, p.stam + (mx || my ? STAM.regenWalk : STAM.regen) * dt * (p.hunger <= 0 ? 0.5 : 1));
    if (p.tired && p.stam >= STAM.recover) p.tired = false;
  }
  p.running = !!run;
  if (mx || my) {
    const l = Math.hypot(mx, my), sp = (run ? 92 : 62) * (p.hunger <= 0 ? 0.7 : 1);
    const ox = p.x, oy = p.y;
    moveEnt(p, mx / l * sp * dt, my / l * sp * dt, solidAt);
    S.stats.walked += Math.hypot(p.x - ox, p.y - oy);
    if (!mouseDown) p.dir = dirOf(mx, my);
    p.anim = (p.anim || 0) + dt * (run ? 11 : 8);
    p.moving = true;
  } else p.moving = false;
  // hunger and health
  p.hunger = Math.max(0, p.hunger - dt * (run ? 0.32 : 0.2));
  if (p.hunger <= 0) { p.hp -= dt * 0.6; if (p.hp <= 0) playerDied(); }
  else if (p.hunger > 55 && p.hp < 100) p.hp = Math.min(100, p.hp + dt * 0.35);
  p.hurt = Math.max(0, (p.hurt || 0) - dt);
  actCd -= dt;
  if (mouseDown && !UIS.build && !UIS.panel) useHeld(dt);
}
function update(dt) {
  if (!S) return;
  S.played += dt;
  const wasNight = isNight();
  S.time += dt;
  if (!wasNight && isNight()) startNight();
  if (S.secondWave > 0) { S.secondWave -= dt; if (S.secondWave <= 0) secondWave(); }
  if (S.time >= DAY_LEN) newDay();
  updatePlayer(dt);
  if (S.player.hp <= 0 && S.deathTimer <= 0) respawn();
  updateZombies(dt);
  updateBullets(dt);
  updateSurvivors(dt);
  updateAnimals(dt, S.surv.some((s) => s.spec === 'Agricultor') ? 1.3 : 1);
  updateNpcs(dt);
  updateTurrets(dt);
  for (const f of [...FX]) { f.life -= dt; if (f.life <= 0) { FX.splice(FX.indexOf(f), 1); continue; } if (!f.swing) { f.x += f.vx * dt; f.y += f.vy * dt; if (!f.txt) f.vy += 120 * dt; } }
  checkTutorial();
}
function checkTutorial() {
  const st = TUTORIAL[S.tut];
  if (st && st.done()) { S.tut++; sfx('good'); if (S.tut >= TUTORIAL.length) say('Tutorial concluído! Agora o mundo é seu.', 'good'); }
}

// ---------- Save / load ----------
function save() {
  if (!S) return false;
  S.last = Date.now();
  try {
    const data = { ...S, world: { obj: bytesToB64(W.obj), hp: bytesToB64(new Uint8Array(W.hp.buffer)) } };
    delete data.turretCd; delete data.turretAng;
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) { return false; }
}
function validSave(o) { return o && o.v === 3 && o.world && typeof o.world.obj === 'string' && o.player && o.res; }
function load() {
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (e) {}
  if (!raw) return false;
  let o;
  try { o = JSON.parse(raw); } catch (e) { return false; }
  if (!validSave(o)) return false;
  generateWorld(o.seed);
  try {
    const obj = b64ToBytes(o.world.obj), hp = b64ToBytes(o.world.hp);
    if (obj.length !== W.obj.length || hp.length !== W.hp.length * 2) return false;
    W.obj.set(obj);
    W.hp.set(new Uint16Array(hp.buffer));
  } catch (e) { return false; }
  rebuildIndex();
  delete o.world;
  const base = { stats: {}, farms: {}, grow: {}, regrow: [], surv: [], npcs: [], animals: null, items: [], hotbar: [null, null, null, null, null, null] };
  for (const k in base) if (o[k] === undefined) o[k] = base[k];
  for (const k of RES_ORDER) if (typeof o.res[k] !== 'number') o.res[k] = 0;
  if (typeof o.player.stam !== 'number') o.player.stam = 100;
  S = o;
  // worlds from 3.0: the bench level becomes a real stone bench or metal workshop
  if (!S.v31) {
    const lvl = S.bench || 1;
    if (lvl >= 2) { const i = [...W.built].find((j) => W.obj[j] === O.BENCH); if (i !== undefined) setObj(i % WW, Math.floor(i / WW), lvl >= 3 ? O.BENCH3 : O.BENCH2); }
    S.v31 = true;
  }
  if (!S.animals) { S.animals = []; spawnAnimals(16, false); }
  for (const s of S.surv) { s.path = null; s.task = null; s.atask = null; s.cd = 0; s.anim = 0; }
  return true;
}
