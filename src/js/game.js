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
    v: 3, seed, created: Date.now(), last: Date.now(), day: 1, time: DAY_LEN * 0.05, played: 0,
    res: { madeira: 0, pedra: 0, sucata: 0, comida: 6, tecido: 0, pecas: 0, municao: 0, curativo: 1 },
    items: [], hotbar: [null, null, null, null, null, null], sel: 0, head: null, body: null,
    player: { x: W.spawn.x * TS + 8, y: W.spawn.y * TS + 8, hp: 100, hunger: 100, dir: 0 },
    bench: 1, tut: 0, sound: true,
    stats: { walked: 0, kills: 0, crates: 0, built: 0, deaths: 0, crafted: 0, nights: 0 },
    surv: [], npcs: [], regrow: [], farms: {}, nextId: 1,
  };
  placeStrandedSurvivors();
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
function craftItem(base) {
  const d = ITEMS[base];
  if (d.tier > S.bench) return say(`Precisa da bancada nível ${d.tier}.`, 'bad');
  if (!pay(d.cost)) return say('Faltam recursos.', 'bad');
  const it = addItem(base, rollRarity(S.bench - 1));
  S.stats.crafted++;
  say(`Fabricado: ${d.n} (${RAR[it.r].n}).`, it.r >= 2 ? 'rare' : 'good');
  sfx('craft');
  return it;
}
function craftMake(m) {
  if (m.tier > S.bench) return say(`Precisa da bancada nível ${m.tier}.`, 'bad');
  if (!pay(m.cost)) return say('Faltam recursos.', 'bad');
  for (const k in m.give) gain(k, m.give[k]);
  sfx('craft');
}
function upgradeBench() {
  const c = BENCH_UP[S.bench + 1];
  if (!c) return;
  if (!pay(c)) return say('Faltam recursos.', 'bad');
  S.bench++;
  say(`Bancada nível ${S.bench}! Novas receitas liberadas.`, 'good');
  sfx('build');
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
  actCd = 1 / spd;
  // zombies in the swing arc come first
  let hitZ = false;
  for (const z of Z) {
    const dd = dist(p.x, p.y - 4, z.x, z.y - 4);
    if (dd > range + z.r) continue;
    let da = Math.atan2(z.y - p.y, z.x - p.x) - ang;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) > 1.1) continue;
    hurtZombie(z, d ? istat(it, 'dmg') : 5, Math.cos(ang) * 60, Math.sin(ang) * 60);
    hitZ = true;
  }
  FX.push({ swing: true, x: p.x, y: p.y - 6, a: ang, life: 0.15, r: range });
  if (hitZ) { if (it) wearItem(it); sfx('hit'); return; }
  // otherwise gather the tile under the mouse
  const tx = tileOf(mouseW.x), ty = tileOf(mouseW.y);
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
    for (const k in od.end || {}) gain(k, irnd(od.end[k][0], od.end[k][1]), cx, cy - 8);
    setObj(tx, ty, o === O.TREE || o === O.PINE ? O.STUMP : 0);
    if (od.regrow) S.regrow.push([i, o, S.day + od.regrow]);
    burst(cx, cy, '#6e5232', 10, 50);
  }
  void fx; void fy;
}
const LOOT = {
  casa: [['comida', 0.6, 1, 4], ['tecido', 0.55, 1, 3], ['madeira', 0.3, 2, 5], ['sucata', 0.4, 2, 5], ['municao', 0.22, 3, 8], ['curativo', 0.15, 1, 1], ['pecas', 0.12, 1, 1]],
  'Supermercado': [['comida', 0.95, 3, 8], ['tecido', 0.6, 2, 4], ['curativo', 0.25, 1, 2], ['sucata', 0.3, 2, 4]],
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
    const pool = poi && poi.n === 'Delegacia' ? ['pistol', 'shotgun', 'machete', 'helmet', 'vest', 'rifle'] : ['spear', 'bat', 'machete', 'axe2', 'pick2', 'helmet', 'armor', 'pistol'];
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
  const tx = tileOf(p.x), ty = tileOf(p.y - 4);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = tx + dx, y = ty + dy, o = objAt(x, y);
    if (!(o === O.CRATE || o === O.BENCH || o === O.FARM || o === O.BED || o === O.CHEST)) continue;
    const d = dist(p.x, p.y - 4, x * TS + 8, y * TS + 8);
    if (d < bd) { bd = d; best = { k: 'tile', o, x, y }; }
  }
  return best;
}
function interactLabel(t) {
  if (!t) return '';
  if (t.k === 'npc') return `Recrutar ${t.e.name} (${t.e.spec})`;
  if (t.k === 'surv') return `Falar com ${t.e.name}`;
  if (t.o === O.CRATE) return 'Abrir caixa';
  if (t.o === O.BENCH) return 'Usar bancada';
  if (t.o === O.FARM) return farmStage(idx(t.x, t.y)) >= 3 ? 'Colher' : 'Horta crescendo';
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
  if (b.tier && S.bench < b.tier) return `Bancada nível ${b.tier}`;
  if (dist(S.player.x, S.player.y, tx * TS + 8, ty * TS + 8) > 7 * TS) return 'Muito longe';
  const g = groundAt(tx, ty);
  if (g === G.WATER) return 'Na água não';
  const o = objAt(tx, ty);
  if (o && o !== O.STUMP) return 'Ocupado';
  if (OBJ[b.o].solid || OBJ[b.o].wall) {
    const occupied = [S.player, ...Z, ...S.surv, ...S.npcs].some((e) => tileOf(e.x) === tx && (tileOf(e.y) === ty || tileOf(e.y - 3) === ty));
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
  if (b.o === O.FARM) S.farms[idx(tx, ty)] = 0;
  S.stats.built++;
  sfx('build');
  burst(tx * TS + 8, ty * TS + 12, '#a47c4f', 5, 25);
  return null;
}
function dismantle(tx, ty) {
  const o = objAt(tx, ty);
  if (!o || !OBJ[o].build) return;
  if (o === O.FIRE && countObj(O.FIRE) <= 1 && S.day <= 1) return say('Mantenha pelo menos uma fogueira no primeiro dia.', 'warn');
  const b = BUILD.find((x) => x.o === o);
  if (b) for (const k in b.cost) gain(k, Math.floor(b.cost[k] * 0.5));
  const i = idx(tx, ty);
  setObj(tx, ty, 0);
  delete S.farms[i];
  for (const s of S.surv) if (s.bed === i) s.bed = null;
  sfx('break');
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
function useTile(t) {
  if (t.o === O.CRATE) openCrate(t.x, t.y);
  else if (t.o === O.FARM) { if (!harvest(idx(t.x, t.y))) say('Ainda está crescendo.'); }
  else if (t.o === O.BED) say('Você renasce na cama se morrer. Sobreviventes também precisam de camas.');
  else if (t.o === O.CHEST) say(`Cada baú aumenta o limite de recursos em 150 (agora: ${capOf('madeira')}).`);
}

// ---------- Zombies ----------
function spawnZombie(type, tx, ty, night) {
  const d = ZT[type];
  const sc = Math.pow(1.1, S.day - 1);
  Z.push({ id: nextZid++, t: type, x: tx * TS + 8, y: ty * TS + 8, hp: d.hp * sc, max: d.hp * sc, spd: d.spd * rnd(0.9, 1.1), dmg: d.dmg * Math.pow(1.05, S.day - 1), r: d.r,
    cd: 0, spitCd: 2, dir: 0, anim: Math.random() * 4, night, wx: 0, wy: 0, wt: 0, kb: [0, 0], atk: 0 });
}
function hurtZombie(z, dmg, kx = 0, ky = 0) {
  z.hp -= dmg;
  z.kb = [kx, ky];
  z.flash = 0.12;
  floatText(z.x, z.y - 18, String(Math.round(dmg)), '#f0e0c0');
  burst(z.x, z.y - 8, '#6a2a22', 3, 30);
  if (z.hp <= 0) killZombie(z);
}
function killZombie(z) {
  const i = Z.indexOf(z);
  if (i < 0) return;
  Z.splice(i, 1);
  S.stats.kills++;
  burst(z.x, z.y - 6, '#5a2a22', 10, 50);
  if (Math.random() < (ZT[z.t].boss ? 1 : 0.25)) {
    const loot = ZT[z.t].boss ? { pecas: irnd(3, 5), municao: irnd(15, 30) } : pick([{ municao: irnd(2, 5) }, { tecido: 1 }, { sucata: irnd(1, 3) }, { comida: 1 }]);
    for (const k in loot) gain(k, loot[k], z.x, z.y);
  }
  sfx('zdie');
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
  const count = 2 + n * 2;
  const types = Object.keys(ZT).filter((k) => !ZT[k].boss && n >= ZT[k].from);
  for (let i = 0; i < count; i++) {
    const p = spawnPointAround(bx, by, 20, 27);
    if (p) spawnZombie(i < 2 ? 'comum' : pick(types), p[0], p[1], true);
  }
  if (n % 5 === 0) { const p = spawnPointAround(bx, by, 22, 26); if (p) spawnZombie('colosso', p[0], p[1], true); }
  say(n % 5 === 0 ? `Noite ${n}: uma horda com um Colosso está vindo!` : `Noite ${n}: a horda está vindo!`, 'bad');
  sfx('alarm');
  S.secondWave = n >= 3 ? 40 : -1;
}
function secondWave() {
  const n = S.day;
  const [bx, by] = baseCenter();
  const types = Object.keys(ZT).filter((k) => !ZT[k].boss && n >= ZT[k].from);
  for (let i = 0; i < n; i++) { const p = spawnPointAround(bx, by, 20, 27); if (p) spawnZombie(pick(types), p[0], p[1], true); }
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
  say(`Dia ${S.day}. Você sobreviveu à noite.`, 'good');
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
      if (pt && dist(pt[0], pt[1], bx, by) > 12) spawnZombie(S.day >= 3 && Math.random() < 0.3 ? 'veloz' : 'comum', pt[0], pt[1], false);
    }
  }
  FF.t -= dt;
  if (FF.t <= 0) { FF.t = 0.35; buildFlowField(); }
  for (const z of [...Z]) {
    const zt = ZT[z.t];
    z.cd -= dt; z.flash = Math.max(0, (z.flash || 0) - dt);
    if (z.kb[0] || z.kb[1]) { moveEnt(z, z.kb[0] * dt, z.kb[1] * dt, zSolidAt, z.r); z.kb = [z.kb[0] * 0.8, z.kb[1] * 0.8]; if (Math.abs(z.kb[0]) + Math.abs(z.kb[1]) < 2) z.kb = [0, 0]; }
    const dp = dist(z.x, z.y, p.x, p.y);
    if (dp > 48 * TS) { Z.splice(Z.indexOf(z), 1); continue; }
    // nearest living target among player and survivors
    let tgt = p.hp > 0 ? p : null, td = tgt ? dp : Infinity;
    for (const s of S.surv) { const d = dist(z.x, z.y, s.x, s.y); if (d < td) { td = d; tgt = s; } }
    const aggro = z.night || td < (isNight() ? 200 : 110);
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
    // melee
    if (tgt && td < z.r + 9) {
      if (z.cd <= 0) {
        z.cd = 1; z.atk = 0.2;
        if (tgt === p) hurtPlayer(z.dmg); else hurtSurv(tgt, z.dmg);
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
      const sp = z.spd * (aggro ? 1 : 0.4) * (S.player.hp <= 0 ? 0.5 : 1);
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
    delete S.farms[i];
    for (const s of S.surv) if (s.bed === i) s.bed = null;
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
    if (s.task) {
      const [tx, ty] = s.task;
      const o = objAt(tx, ty);
      const adj = Math.max(Math.abs(tx - stx), Math.abs(ty - sty)) <= 1;
      const valid = s.spec === 'Agricultor' ? o === O.FARM && farmStage(idx(tx, ty)) >= 3 : OBJ[o] && OBJ[o].give && !OBJ[o].build;
      if (!valid) { s.task = null; continue; }
      if (!adj) { if (!goTo(s, tx, ty, true)) s.task = null; continue; }
      s.dir = dirOf(tx * TS + 8 - s.x, ty * TS + 8 - s.y);
      if (s.cd <= 0) {
        s.cd = 1.6;
        if (s.spec === 'Agricultor') { harvest(idx(tx, ty), s); s.task = null; }
        else hitObject(tx, ty, 2, s.x, s.y);
      }
      continue;
    }
    if (s.cd > 0) continue;
    s.cd = 1.5;
    const want = s.spec === 'Lenhador' ? (o) => o === O.TREE || o === O.PINE
      : s.spec === 'Minerador' ? (o) => o === O.ROCK || o === O.SCRAP
      : s.spec === 'Agricultor' ? (o, i) => o === O.FARM && farmStage(i) >= 3 : null;
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
  const run = KEYS.has('ShiftLeft') || KEYS.has('ShiftRight');
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
  p.hunger = Math.max(0, p.hunger - dt * (run && (mx || my) ? 0.32 : 0.2));
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
  const base = { stats: {}, farms: {}, regrow: [], surv: [], npcs: [], items: [], hotbar: [null, null, null, null, null, null] };
  for (const k in base) if (o[k] === undefined) o[k] = base[k];
  for (const k of RES_ORDER) if (typeof o.res[k] !== 'number') o.res[k] = 0;
  S = o;
  for (const s of S.surv) { s.path = null; s.task = null; s.cd = 0; s.anim = 0; }
  return true;
}
