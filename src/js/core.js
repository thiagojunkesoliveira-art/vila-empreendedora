'use strict';
// ================= Engine: state, economy, survivors, items, tech, progression =================
const SAVE_KEY = 'ultimo-abrigo-v1';
let S = null;        // saved game state
let RATES = null;    // last computed rates (not saved)
let OFF = null;      // collects notes while simulating offline time
const UIQ = [];      // notifications waiting for the interface

const rnd = (a, b) => a + Math.random() * (b - a);
const irnd = (a, b) => Math.floor(rnd(a, b + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function wpick(entries) {
  let t = 0;
  for (const e of entries) t += Math.max(0, e[1]);
  let r = Math.random() * t;
  for (const e of entries) { r -= Math.max(0, e[1]); if (r <= 0) return e[0]; }
  return entries[entries.length - 1][0];
}

function notify(msg, type = 'info') {
  if (OFF) { OFF.notes.push(msg); return; }
  UIQ.push({ msg, type });
}
function addLog(msg, type = 'info') {
  S.log.unshift({ t: Date.now(), msg, type });
  if (S.log.length > 60) S.log.length = 60;
}

// ---------- State ----------
function newState(keep) {
  const st = {
    v: 1, created: Date.now(), last: Date.now(), played: 0,
    res: { wood: 20, metal: 8, food: 30, water: 30, fuel: 5, ammo: 20, meds: 2, parts: 0, samples: 0, alloy: 0 },
    bld: Object.fromEntries(BLD_ORDER.map((k) => [k, 0])),
    surv: [], nextId: 1, items: [], traps: { estaca: 0, mina: 0 }, craft: [],
    tech: { done: [], cur: null },
    exp: [], visits: {}, auto: {}, pending: [], reports: [],
    horde: { wave: 1, timer: 300, seed: (Math.random() * 2 ** 31) | 0, best: 0, inBattle: false, early: false, fails: 0 },
    wall: { hp: 60 },
    level: 1, xp: 0, manual: null, radioCd: 0, starving: false,
    stats: { kills: 0, won: 0, lost: 0, bosses: 0, exps: 0, crafted: 0, gathered: 0, dead: 0, recruited: 0,
      research: 0, builds: 0, totalXp: 0, bestRarity: -1, maxWave: 0, played: 0 },
    ach: [], quest: 0, log: [], sound: true,
    prestige: { pts: 0, total: 0, count: 0, perks: {} },
  };
  if (keep) {
    st.prestige = keep.prestige;
    st.ach = keep.ach;
    st.stats = keep.stats;
    st.sound = keep.sound;
    st.quest = keep.quest;
  }
  S = st;
  const lead = makeSurv({ name: 'Você', spec: 'Líder', prod: 1.1 });
  lead.leader = true;
  lead.job = 'coleta';
  st.surv.push(lead);
  const gun = makeItem('pistola', 0);
  st.items.push(gun);
  lead.eq.w = gun.id;
  st.items.push(makeItem('faca', 0));
  // Prestige head start
  const ini = perk('inicio');
  if (ini) {
    for (const k of MAIN_RES) st.res[k] = Math.round(st.res[k] * (1 + 0.5 * ini));
    st.res.wood += 40 * ini;
    st.res.metal += 25 * ini;
    for (let i = 0; i < Math.floor(ini / 2); i++) {
      st.bld.barracas = Math.max(st.bld.barracas, Math.ceil((st.surv.length) / 2));
      st.surv.push(makeSurv({}));
    }
  }
  addLog('Você encontrou um abrigo abandonado. Hora de sobreviver.', 'good');
  return st;
}

// ---------- Helpers ----------
const L = (k) => (S.bld[k] || 0);
const has = (t) => !!S && S.tech.done.includes(t);
const perk = (k) => (S && S.prestige.perks[k]) || 0;
const survById = (id) => S.surv.find((s) => s.id === id);
const itemById = (id) => S.items.find((i) => i.id === id);
const atBase = () => S.surv.filter((s) => !s.away);
function wallTechMult() { return (has('barricadas') ? 1.3 : 1) * (has('concreto') ? 1.5 : 1) * (1 + 0.1 * perk('muro')); }
function towerMult() { return (has('holofotes') ? 1.35 : 1) * (1 + 0.1 * perk('muro')); }
const wallMax = () => F.wallHp(L('muralha')) * wallTechMult();
const wallArmor = () => Math.min(0.7, F.wallArm(L('muralha')) + (has('concreto') ? 0.1 : 0));
const globalMult = () => (1 + 0.02 * S.ach.length) * (1 + 0.1 * perk('prod'));

function capOf(k) {
  if (!RES[k]) return Infinity;
  let c = RES[k].cap * F.capMult(L('deposito')) * (1 + 0.15 * perk('armazem'));
  if ((k === 'food' || k === 'water') && has('conservas')) c *= 1.5;
  if (k === 'ammo') c += 100 * L('arsenal');
  if (k === 'meds') c += 10 * L('enfermaria');
  if (k === 'fuel') c += 20 * L('gerador') + 20 * L('destilaria');
  return Math.floor(c);
}
// Adds up to the storage limit; returns what was actually stored.
function gain(k, amt) {
  if (!(amt > 0)) return 0;
  const cur = S.res[k] || 0;
  const room = Math.max(0, capOf(k) - cur);
  const a = Math.min(room, amt);
  S.res[k] = cur + a;
  return a;
}
function gainAll(obj) {
  const got = {};
  for (const k in obj) { const g = gain(k, obj[k]); if (g > 0) got[k] = g; }
  return got;
}
function canAfford(c) {
  for (const k in c) if ((S.res[k] || 0) + 1e-9 < c[k]) return false;
  return true;
}
function spend(c) {
  if (!canAfford(c)) return false;
  for (const k in c) S.res[k] = Math.max(0, S.res[k] - c[k]);
  return true;
}
function scaleCost(cost, mult) {
  const o = {};
  for (const k in cost) { const v = Math.ceil(cost[k] * mult); if (v > 0) o[k] = v; }
  return o;
}

// ---------- XP & level ----------
const xpNeed = (l) => Math.round(60 * Math.pow(l, 1.55));
function gainXp(x) {
  x = Math.round(x);
  if (x <= 0) return;
  S.xp += x;
  S.stats.totalXp += x;
  while (S.xp >= xpNeed(S.level)) {
    S.xp -= xpNeed(S.level);
    S.level++;
    const news = unlocksAt(S.level);
    notify(`Nível ${S.level}!${news.length ? ' Liberado: ' + news.join(', ') : ''}`, 'level');
    addLog(`Você chegou ao nível ${S.level}.${news.length ? ' Liberado: ' + news.join(', ') + '.' : ''}`, 'good');
    sfx('level');
  }
}
function unlocksAt(l) {
  const out = [];
  for (const k of BLD_ORDER) if (BLD[k].unlock === l) out.push(BLD[k].n);
  for (const k of PLACE_ORDER) if (PLACES[k].unlock === l) out.push(PLACES[k].n);
  for (const k in TECH) if (TECH[k].lvl === l && !TECH[k].req) out.push('pesquisa ' + TECH[k].n);
  return out;
}

// ---------- Buildings ----------
function costMult() {
  const e = S.surv.filter((s) => s.spec === 'Engenheiro' && !s.away).length;
  return 1 - Math.min(0.15, 0.03 * e);
}
function bldCost(k) {
  const b = BLD[k], lv = L(k);
  const c = scaleCost(b.cost, Math.pow(b.g, lv) * costMult());
  if (b.late && lv >= 2) {
    const lc = scaleCost(b.late, Math.pow(1.35, lv - 2));
    for (const r in lc) c[r] = (c[r] || 0) + lc[r];
  }
  return c;
}
const bldUnlocked = (k) => S.level >= BLD[k].unlock;
function build(k) {
  const b = BLD[k];
  if (!bldUnlocked(k)) return notify(`Libera no nível ${b.unlock}.`, 'bad');
  if (L(k) >= b.max) return notify('Nível máximo.', 'bad');
  const c = bldCost(k);
  if (!spend(c)) return notify('Recursos insuficientes.', 'bad');
  const oldWall = wallMax();
  S.bld[k]++;
  if (k === 'muralha') S.wall.hp += wallMax() - oldWall;
  S.stats.builds++;
  gainXp(6 + 4 * S.bld[k]);
  addLog(`${b.n} ${S.bld[k] === 1 ? 'construída' : 'melhorada para o nível ' + S.bld[k]}.`, 'good');
  sfx('build');
  return true;
}

// ---------- Survivors ----------
const maxHp = (s) => 100 + 10 * (s.lvl - 1);
const survXpNeed = (l) => Math.round(40 * Math.pow(l, 1.5));
const capPeople = () => F.people(L('barracas'));
function uniqueName() {
  const used = new Set(S.surv.map((s) => s.name));
  for (let i = 0; i < 30; i++) {
    const n = pick(NAMES);
    if (!used.has(n)) return n;
  }
  return pick(NAMES) + ' ' + pick(SURNAMES);
}
function makeSurv(o) {
  const spec = o.spec || pick(['Engenheiro', 'Médico', 'Soldado', 'Coletor', 'Agricultor']);
  const s = { id: S.nextId++, name: o.name || uniqueName(), spec, lvl: o.lvl || 1, xp: 0,
    prod: o.prod || Math.round(rnd(0.8, 1.3) * 100) / 100, hp: 0, job: 'livre',
    eq: { w: null, h: null, b: null }, inf: false, away: false, down: false, treat: 0 };
  s.hp = maxHp(s);
  return s;
}
function survXp(s, x) {
  s.xp += x;
  while (s.xp >= survXpNeed(s.lvl) && s.lvl < 30) {
    s.xp -= survXpNeed(s.lvl);
    s.lvl++;
    s.hp = Math.min(maxHp(s), s.hp + 10);
    if (!s.leader) notify(`${s.name} subiu para o nível ${s.lvl}.`, 'good');
  }
}
function effProd(s) {
  let p = s.prod * (1 + 0.05 * (s.lvl - 1));
  if (s.hp / maxHp(s) < 0.5) p *= 0.6;
  if (S.starving) p *= 0.4;
  if (s.inf) p *= 0.8;
  return p;
}
function survStatus(s) {
  const out = [];
  if (s.away) out.push(['Em expedição', 'away']);
  if (s.down) out.push(['Inconsciente', 'bad']);
  if (s.inf) out.push(['Infectado', 'tox']);
  if (s.hp / maxHp(s) < 0.5 && !s.down) out.push(['Ferido', 'warn']);
  if (S.starving && !s.away) out.push(['Faminto', 'warn']);
  if (!out.length) out.push(['Saudável', 'ok']);
  return out;
}
function canHouse() { return S.surv.length < capPeople(); }
function recruit(data) {
  const s = makeSurv(data);
  S.surv.push(s);
  S.stats.recruited++;
  addLog(`${s.name} (${s.spec}) entrou para o grupo.`, 'good');
  return s;
}
// A found survivor joins if there is room; otherwise waits outside the gate.
function offerSurvivor(data) {
  if (canHouse()) { const s = recruit(data); notify(`${s.name} (${s.spec}) entrou para o grupo!`, 'good'); return 'joined'; }
  S.pending.push({ ...data, name: data.name || uniqueName(), prod: data.prod || Math.round(rnd(0.8, 1.3) * 100) / 100, pid: S.nextId++ });
  if (S.pending.length > 4) S.pending.shift();
  notify('Um sobrevivente espera no portão, mas as barracas estão cheias.', 'warn');
  return 'waiting';
}
function acceptPending(pid) {
  const i = S.pending.findIndex((p) => p.pid === pid);
  if (i < 0) return;
  if (!canHouse()) return notify('Barracas cheias. Melhore as Barracas.', 'bad');
  const [p] = S.pending.splice(i, 1);
  recruit(p);
  sfx('good');
}
function dismissPending(pid) { S.pending = S.pending.filter((p) => p.pid !== pid); }
function killSurvivor(s, cause) {
  if (s.leader) { s.hp = 1; s.down = true; return; }
  for (const sl in s.eq) s.eq[sl] = null; // equipment stays in the inventory
  S.surv = S.surv.filter((x) => x.id !== s.id);
  S.stats.dead++;
  addLog(`${s.name} morreu ${cause}.`, 'bad');
  notify(`${s.name} morreu ${cause}.`, 'bad');
}
function expel(id) {
  const s = survById(id);
  if (!s || s.leader || s.away) return;
  for (const sl in s.eq) s.eq[sl] = null;
  S.surv = S.surv.filter((x) => x.id !== id);
  addLog(`${s.name} deixou o abrigo.`, 'info');
}
function treat(id) {
  const s = survById(id);
  if (!s || !s.inf || s.away) return;
  if (!spend({ meds: 1 })) return notify('Sem medicamentos.', 'bad');
  s.inf = false;
  s.hp = Math.min(maxHp(s), s.hp + 15);
  notify(`${s.name} foi tratado.`, 'good');
}

// ---------- Jobs ----------
const jobCount = (j) => S.surv.filter((s) => s.job === j).length;
function jobSlots(j) {
  if (j === 'livre' || j === 'defesa') return Infinity;
  if (j === 'coleta') return F.gatherSlots(L('coleta'));
  return F.slots(L(JOBS[j].bld));
}
const jobOpen = (j) => !JOBS[j].bld || L(JOBS[j].bld) > 0;
function assign(id, j) {
  const s = survById(id);
  if (!s || !JOBS[j] || s.job === j) return;
  if (!jobOpen(j)) return notify(`Construa ${BLD[JOBS[j].bld].n} primeiro.`, 'bad');
  if (jobCount(j) >= jobSlots(j)) return notify(`Sem vagas em ${JOBS[j].n}. Melhore a construção.`, 'bad');
  s.job = j;
}
// Output multiplier from workers in a building.
function workBonus(j) {
  let b = 0;
  for (const s of S.surv) {
    if (s.job !== j || s.away || s.down) continue;
    const m = s.spec === JOBS[j].match ? 1.8 : (s.spec === 'Engenheiro' ? 1.2 : 1);
    b += 0.35 * effProd(s) * m;
  }
  return 1 + b;
}

// ---------- Power & rates ----------
function powerInfo() {
  let demand = 0;
  for (const k of BLD_ORDER) if (BLD[k].pw && L(k) > 0) demand += BLD[k].pw * (1 + Math.floor((L(k) - 1) / 4));
  if (has('hidroponia')) demand += 2;
  const supply = F.power(L('gerador')) * (has('eletrica') ? 1.5 : 1);
  const fuelOk = S.res.fuel > 0.01;
  const eff = fuelOk ? supply : 0;
  return { demand, supply, fuelOk, ratio: demand ? Math.min(1, eff / demand) : 1, load: supply ? Math.min(1, demand / supply) : 0 };
}
const pf = (ratio) => 0.3 + 0.7 * ratio;

// Per-second production (p) and consumption (c), with per-minute breakdowns.
function computeRates() {
  const R = { p: {}, c: {}, bp: {}, bc: {} };
  for (const k of ALL_RES) { R.p[k] = 0; R.c[k] = 0; R.bp[k] = []; R.bc[k] = []; }
  const P = (k, v, label) => { if (v > 0) { R.p[k] += v / 60; R.bp[k].push([label, v]); } };
  const C = (k, v, label) => { if (v > 0) { R.c[k] += v / 60; R.bc[k].push([label, v]); } };
  const gm = globalMult();
  const pw = powerInfo();
  R.pw = pw;
  const hydro = has('hidroponia') ? 1.5 * (pf(pw.ratio) > 0.99 ? 1 : 0.7) : 1;
  P('food', F.food(L('horta')) * workBonus('horta') * gm * (has('agricultura') ? 1.25 : 1) * hydro, 'Horta');
  P('water', F.water(L('reservatorio')) * workBonus('reservatorio') * gm * (has('filtros') ? 1.25 : 1) * hydro, 'Reservatório');
  let gw = 0, gmt = 0;
  for (const s of S.surv) {
    if (s.job !== 'coleta' || s.away || s.down) continue;
    const m = effProd(s) * (s.spec === 'Coletor' ? 1.6 : 1);
    gw += 8 * m; gmt += 3 * m;
  }
  const gmul = F.gatherMult(L('coleta')) * (has('ferramentas') ? 1.25 : 1) * (1 + 0.15 * perk('coleta')) * gm;
  P('wood', gw * gmul, 'Equipes de coleta');
  P('metal', gmt * gmul * (has('reciclagem') ? 1.15 : 1), 'Equipes de coleta');
  if (L('enfermaria')) P('meds', F.meds(L('enfermaria')) * workBonus('enfermaria') * pf(pw.ratio) * (has('laboratorio') ? 2 : 1) * gm, 'Enfermaria');
  if (L('arsenal')) {
    const a = F.ammo(L('arsenal')) * workBonus('arsenal') * pf(pw.ratio) * (has('recarga') ? 1.5 : 1) * gm;
    if (S.res.metal > 1 && S.res.ammo < capOf('ammo')) { P('ammo', a, 'Arsenal'); C('metal', a / 3, 'Arsenal (munição)'); }
  }
  if (L('destilaria')) {
    const f = F.distill(L('destilaria')) * pf(pw.ratio) * gm;
    if (S.res.food > 5 && S.res.fuel < capOf('fuel')) { P('fuel', f, 'Destilaria'); C('food', f * 2, 'Destilaria'); }
  }
  if (L('gerador') && pw.demand > 0) C('fuel', F.genFuel(L('gerador')) * Math.max(0.2, pw.load), 'Gerador');
  const home = atBase().length;
  const cm = has('racionamento') ? 0.85 : 1;
  C('food', home * 1 * cm, `${home} ${home === 1 ? 'pessoa' : 'pessoas'}`);
  C('water', home * 1.2 * cm, `${home} ${home === 1 ? 'pessoa' : 'pessoas'}`);
  return R;
}

// ---------- Main tick ----------
function tick(dt) {
  S.played += dt;
  S.stats.played += dt;
  const R = computeRates();
  RATES = R;
  for (const k of ALL_RES) {
    const d = (R.p[k] - R.c[k]) * dt;
    if (d > 0) gain(k, d);
    else if (d < 0) S.res[k] = Math.max(0, S.res[k] + d);
  }
  S.starving = (S.res.food <= 0.01 && R.c.food > R.p.food) || (S.res.water <= 0.01 && R.c.water > R.p.water);
  healthTick(dt);
  manualTick(dt);
  craftTick(dt);
  researchTick(dt);
  expTick(dt);
  hordeTick(dt);
  wallTick(dt);
  if (S.radioCd > 0) S.radioCd = Math.max(0, S.radioCd - dt);
}

function healthTick(dt) {
  const enf = L('enfermaria');
  const heal = enf ? F.heal(enf) * workBonus('enfermaria') : 0;
  const medics = S.surv.filter((s) => s.job === 'enfermaria' && !s.away && s.spec === 'Médico').length;
  for (const s of S.surv) {
    if (s.away) continue;
    const mh = maxHp(s);
    let r = 0.5 + heal;
    if (s.job === 'livre') r += 1.5;
    if (s.down) r += 6; // knocked out people get back on their feet in a few minutes
    r *= has('socorros') ? 1.5 : 1;
    if (S.starving) r = -1;
    if (has('vacina')) s.inf = false;
    if (s.inf) {
      r -= 2;
      if (enf) {
        s.treat += dt * (1 + 0.5 * medics);
        if (s.treat >= 30) {
          s.treat = 0;
          if (has('antidoto') && Math.random() < 0.5) s.inf = false;
          else if (S.res.meds >= 1) { S.res.meds -= 1; s.inf = false; }
          if (!s.inf) addLog(`${s.name} foi curado da infecção na enfermaria.`, 'good');
        }
      }
    }
    // Hunger and infection weaken but never kill.
    const floor = Math.min(s.hp, mh * 0.05);
    s.hp = clamp(s.hp + r * dt / 60, floor, mh);
    if (s.down && s.hp >= mh * 0.3) s.down = false;
    if (s.job !== 'livre' && !s.down) survXp(s, dt / 60);
  }
}

// ---------- Manual actions ----------
const MANUAL = {
  madeira: { n: 'Cortar madeira', ic: 'wood', t: 2.5, give: { wood: [3, 4] } },
  sucata:  { n: 'Desmontar sucata', ic: 'metal', t: 3.5, give: { metal: [1, 3] } },
  comida:  { n: 'Procurar comida', ic: 'food', t: 3, give: { food: [2, 4] } },
  agua:    { n: 'Coletar água', ic: 'water', t: 3, give: { water: [2, 4] } },
  tanque:  { n: 'Drenar tanques', ic: 'fuel', t: 8, give: { fuel: [1, 2] } },
};
function leader() { return S.surv.find((s) => s.leader); }
function startManual(k) {
  if (S.manual || !MANUAL[k]) return;
  const ld = leader();
  if (ld.away) return notify('Você está em uma expedição.', 'bad');
  if (ld.down) return notify('Você está inconsciente. Descanse.', 'bad');
  S.manual = { k, t: 0, total: MANUAL[k].t };
}
function manualTick(dt) {
  const m = S.manual;
  if (!m) return;
  m.t += dt;
  if (m.t < m.total) return;
  S.manual = null;
  const mult = (has('ferramentas') ? 1.25 : 1) * (1 + 0.15 * perk('coleta'));
  const out = {};
  for (const r in MANUAL[m.k].give) { const [a, b] = MANUAL[m.k].give[r]; out[r] = irnd(a, b) * mult; }
  const got = gainAll(out);
  let sum = 0;
  for (const r in got) sum += got[r];
  S.stats.gathered += sum;
  if (!sum) notify('Armazenamento cheio.', 'warn');
  gainXp(1);
}

// ---------- Items ----------
const invCap = () => 12 + 4 * L('arsenal');
function makeItem(base, r) {
  const it = { id: S.nextId++, base, r, lvl: 0, dur: 0 };
  it.dur = itemMaxDur(it);
  return it;
}
const itemMaxDur = (it) => Math.round(ITEMS[it.base].dur * RAR[it.r].m * (1 + 0.1 * it.lvl));
function itemStat(it, st) {
  const b = ITEMS[it.base];
  let v = b[st] || 0;
  if (st === 'spd') v *= 1 + 0.05 * it.r;
  else if (st === 'dmg' || st === 'res') v *= RAR[it.r].m * (1 + 0.08 * it.lvl);
  if (it.dur <= 0 && st !== 'range') v *= 0.3;
  return v;
}
const holderOf = (iid) => S.surv.find((s) => s.eq.w === iid || s.eq.h === iid || s.eq.b === iid);
function rollRarity(luck = 0, min = 0) {
  const eng = S.surv.filter((s) => s.job === 'oficina' && s.spec === 'Engenheiro' && !s.away).length;
  const l = luck + L('oficina') * 0.5 + eng * 0.7 + (has('forja') ? 2 : 0) + perk('sorte') * 0.8;
  const w = [70, 22 + l * 1.5, 6 + l * 1.2, 1.6 + l * 0.6, 0.25 + l * 0.2];
  for (let i = 0; i < min; i++) w[i] = 0;
  return wpick(w.map((x, i) => [i, x]));
}
function addItem(it) {
  S.items.push(it);
  S.stats.bestRarity = Math.max(S.stats.bestRarity, it.r);
}
function equip(sid, iid) {
  const s = survById(sid), it = itemById(iid);
  if (!s || !it) return;
  if (s.away) return notify(`${s.name} está em expedição.`, 'bad');
  const h = holderOf(iid);
  if (h && h.away) return notify(`${h.name} está usando isso numa expedição.`, 'bad');
  if (h) h.eq[ITEMS[it.base].slot] = null;
  s.eq[ITEMS[it.base].slot] = iid;
}
function unequip(sid, slot) {
  const s = survById(sid);
  if (!s || s.away) return;
  s.eq[slot] = null;
}
function upCost(it) {
  const b = ITEMS[it.base];
  const c = { metal: Math.ceil((10 + 6 * b.tier) * Math.pow(1.35, it.lvl)) };
  if (it.lvl >= 2) c.parts = Math.ceil(it.lvl * b.tier / 3);
  if (it.r >= 3 && it.lvl >= 6) c.samples = 1;
  return c;
}
function upgradeItem(iid) {
  const it = itemById(iid);
  if (!it) return;
  if (!L('oficina')) return notify('Construa a Oficina.', 'bad');
  if (it.lvl >= RAR[it.r].max) return notify('Nível máximo para essa raridade.', 'bad');
  if (!spend(upCost(it))) return notify('Recursos insuficientes.', 'bad');
  const ratio = it.dur / itemMaxDur(it);
  it.lvl++;
  it.dur = Math.round(itemMaxDur(it) * ratio);
  gainXp(3 + it.lvl);
  sfx('build');
}
function repairCost(it) {
  const miss = itemMaxDur(it) - it.dur;
  if (miss <= 0) return null;
  return { metal: Math.max(1, Math.ceil(miss * 0.25 * ITEMS[it.base].tier * (has('forja') ? 0.5 : 1))) };
}
function repairItem(iid) {
  const it = itemById(iid);
  if (!it) return;
  const c = repairCost(it);
  if (!c) return;
  if (!spend(c)) return notify('Metal insuficiente.', 'bad');
  it.dur = itemMaxDur(it);
}
function scrapValue(it) {
  const share = has('reciclagem') ? 0.6 : 0.3;
  const o = {};
  for (const k in ITEMS[it.base].cost) { const v = Math.floor(ITEMS[it.base].cost[k] * share * (1 + 0.2 * it.lvl)); if (v > 0) o[k] = v; }
  return o;
}
function scrapItem(iid) {
  const it = itemById(iid);
  if (!it) return;
  const h = holderOf(iid);
  if (h && h.away) return notify('Item em uso numa expedição.', 'bad');
  if (h) h.eq[ITEMS[it.base].slot] = null;
  S.items = S.items.filter((x) => x.id !== iid);
  gainAll(scrapValue(it));
}
// Weapon wear after a fight.
function wear(s, wpn, arm) {
  const w = s.eq.w && itemById(s.eq.w);
  if (w && w.dur > 0) w.dur = Math.max(0, w.dur - wpn);
  for (const sl of ['h', 'b']) {
    const a = s.eq[sl] && itemById(s.eq[sl]);
    if (a && a.dur > 0) a.dur = Math.max(0, a.dur - arm);
  }
}
// Damage reduction from armor.
function survRes(s) {
  let r = 0;
  for (const sl of ['h', 'b']) { const a = s.eq[sl] && itemById(s.eq[sl]); if (a) r += itemStat(a, 'res'); }
  return r / (r + 25);
}

// ---------- Crafting ----------
function craftTierMax() {
  let t = L('oficina');
  if (t >= 5 && !has('metalurgia')) t = 4;
  return t;
}
const craftQueueMax = () => 2 + L('oficina');
function recipe(kind, id) {
  if (kind === 'item') return { cost: ITEMS[id].cost, time: ITEMS[id].time, n: ITEMS[id].n };
  if (kind === 'trap') return { cost: TRAPS[id].cost, time: TRAPS[id].time, n: TRAPS[id].n };
  return { cost: AMMO_RECIPE.cost, time: AMMO_RECIPE.time, n: `${AMMO_RECIPE.out} munições` };
}
function recipeLock(kind, id) {
  if (!L('oficina')) return 'Construa a Oficina';
  if (kind === 'item' && ITEMS[id].tier > craftTierMax()) {
    if (ITEMS[id].tier === 5 && L('oficina') >= 5) return 'Pesquise Metalurgia militar';
    return `Oficina nível ${ITEMS[id].tier}`;
  }
  if (kind === 'trap' && !has(TRAPS[id].tech)) return `Pesquise ${TECH[TRAPS[id].tech].n}`;
  return null;
}
const craftSpeed = () => workBonus('oficina');
function startCraft(kind, id) {
  const lock = recipeLock(kind, id);
  if (lock) return notify(lock + '.', 'bad');
  if (S.craft.length >= craftQueueMax()) return notify('Fila da oficina cheia.', 'bad');
  if (kind === 'item' && S.items.length + S.craft.filter((c) => c.kind === 'item').length >= invCap()) return notify('Inventário cheio. Desmonte algo ou melhore o Arsenal.', 'bad');
  const r = recipe(kind, id);
  if (!spend(r.cost)) return notify('Recursos insuficientes.', 'bad');
  S.craft.push({ kind, id, t: 0, total: r.time });
  sfx('click');
}
function cancelCraft(i) {
  const c = S.craft[i];
  if (!c) return;
  S.craft.splice(i, 1);
  gainAll(recipe(c.kind, c.id).cost);
}
function craftTick(dt) {
  const c = S.craft[0];
  if (!c || !L('oficina')) return;
  c.t += dt * craftSpeed();
  if (c.t < c.total) return;
  S.craft.shift();
  if (c.kind === 'item') {
    const it = makeItem(c.id, rollRarity());
    addItem(it);
    S.stats.crafted++;
    gainXp(4 * ITEMS[c.id].tier);
    notify(`Fabricado: ${ITEMS[c.id].n} ${RAR[it.r].n.toLowerCase()}.`, it.r >= 2 ? 'rare' : 'good');
    if (it.r >= 3) addLog(`A oficina fabricou ${ITEMS[c.id].n} ${RAR[it.r].n}!`, 'rare');
  } else if (c.kind === 'trap') {
    S.traps[c.id]++;
    gainXp(2);
  } else {
    gain('ammo', AMMO_RECIPE.out);
    gainXp(1);
  }
  for (const s of S.surv) if (s.job === 'oficina' && !s.away) survXp(s, 2);
}

// ---------- Research ----------
function techState(id) {
  if (has(id)) return 'done';
  if (S.tech.cur && S.tech.cur.id === id) return 'cur';
  const t = TECH[id];
  if (S.level < t.lvl || (t.req || []).some((r) => !has(r))) return 'locked';
  return 'open';
}
function startResearch(id) {
  if (S.tech.cur) return notify('Já existe uma pesquisa em andamento.', 'bad');
  if (techState(id) !== 'open') return;
  if (!spend(TECH[id].cost)) return notify('Recursos insuficientes.', 'bad');
  S.tech.cur = { id, t: 0, total: TECH[id].time };
  sfx('click');
}
function cancelResearch() {
  const c = S.tech.cur;
  if (!c) return;
  S.tech.cur = null;
  gainAll(TECH[c.id].cost);
}
function researchTick(dt) {
  const c = S.tech.cur;
  if (!c) return;
  c.t += dt;
  if (c.t < c.total) return;
  const oldWall = wallMax();
  S.tech.done.push(c.id);
  S.tech.cur = null;
  S.wall.hp += Math.max(0, wallMax() - oldWall);
  S.stats.research++;
  gainXp(20 + TECH[c.id].time / 5);
  notify(`Pesquisa concluída: ${TECH[c.id].n}.`, 'good');
  addLog(`Pesquisa concluída: ${TECH[c.id].n}.`, 'good');
  sfx('good');
}

// ---------- Radio ----------
const RADIO_COST = { food: 30, water: 30, fuel: 5 };
function useRadio() {
  if (!has('radio') || S.radioCd > 0) return;
  if (!spend(RADIO_COST)) return notify('Recursos insuficientes.', 'bad');
  S.radioCd = 300;
  offerSurvivor({ lvl: irnd(1, 1 + Math.floor(S.level / 5)) });
}

// ---------- Wall ----------
function wallTick(dt) {
  if (BATTLE) return;
  const mx = wallMax();
  if (S.wall.hp >= mx) { S.wall.hp = mx; return; }
  const want = Math.min(mx - S.wall.hp, Math.max(2, mx * 0.01) * dt);
  const woodNeed = want * 0.05;
  if (S.res.wood - 15 >= woodNeed) { S.res.wood -= woodNeed; S.wall.hp += want; }
}

// ---------- Quests ----------
const QUESTS = [
  { d: 'Construa a Horta', ok: () => L('horta') >= 1, r: { food: 20 }, xp: 15 },
  { d: 'Construa o Reservatório de água', ok: () => L('reservatorio') >= 1, r: { water: 20 }, xp: 15 },
  { d: 'Envie uma expedição ao Supermercado (aba Exploração)', ok: () => S.stats.exps >= 1, r: { wood: 30 }, xp: 20 },
  { d: 'Construa as Barracas', ok: () => L('barracas') >= 1, r: { metal: 15 }, xp: 15 },
  { d: 'Tenha 2 sobreviventes no grupo', ok: () => S.surv.length >= 2, r: { food: 20, water: 20 }, xp: 20 },
  { d: 'Coloque alguém para trabalhar na Horta ou no Reservatório', ok: () => jobCount('horta') + jobCount('reservatorio') >= 1, r: { wood: 30 }, xp: 15 },
  { d: 'Construa as Muralhas defensivas', ok: () => L('muralha') >= 1, r: { wood: 40 }, xp: 20 },
  { d: 'Sobreviva a uma horda', ok: () => S.stats.won >= 1, r: { ammo: 20 }, xp: 25 },
  { d: 'Construa a Oficina de fabricação', ok: () => L('oficina') >= 1, r: { metal: 30 }, xp: 20 },
  { d: 'Fabrique um equipamento na aba Arsenal', ok: () => S.stats.crafted >= 1, r: { parts: 1 }, xp: 20 },
  { d: 'Pesquise uma tecnologia', ok: () => S.stats.research >= 1, r: { wood: 60, metal: 30 }, xp: 25 },
  { d: 'Tenha 4 sobreviventes', ok: () => S.surv.length >= 4, r: { food: 50, water: 50 }, xp: 30 },
  { d: 'Construa a Torre de vigilância', ok: () => L('torre') >= 1, r: { ammo: 40 }, xp: 30 },
  { d: 'Construa a Enfermaria', ok: () => L('enfermaria') >= 1, r: { meds: 3 }, xp: 30 },
  { d: 'Derrote o primeiro chefe (onda 5)', ok: () => S.stats.bosses >= 1, r: { parts: 3 }, xp: 50 },
  { d: 'Construa o Gerador e o Arsenal', ok: () => L('gerador') >= 1 && L('arsenal') >= 1, r: { fuel: 20 }, xp: 40 },
  { d: 'Explore a Delegacia', ok: () => (S.visits.delegacia || 0) >= 1, r: { ammo: 60 }, xp: 40 },
  { d: 'Pesquise Mapas da cidade', ok: () => has('mapas'), r: { fuel: 30 }, xp: 50 },
  { d: 'Alcance a onda 10', ok: () => S.horde.best >= 10, r: { parts: 5 }, xp: 80 },
  { d: 'Explore a Fábrica', ok: () => (S.visits.fabrica || 0) >= 1, r: { metal: 100 }, xp: 80 },
  { d: 'Tenha 8 sobreviventes', ok: () => S.surv.length >= 8, r: { food: 120, water: 120 }, xp: 80 },
  { d: 'Consiga um equipamento Épico', ok: () => S.stats.bestRarity >= 3, r: { parts: 6 }, xp: 100 },
  { d: 'Pesquise Frequência militar', ok: () => has('radiomil'), r: { fuel: 60 }, xp: 120 },
  { d: 'Explore a Base militar', ok: () => (S.visits.militar || 0) >= 1, r: { alloy: 2 }, xp: 150 },
  { d: 'Alcance a onda 15 para liberar o Prestígio', ok: () => S.horde.best >= 15, r: { parts: 10 }, xp: 200 },
];
// After the list, the goal keeps moving to the next boss wave.
function currentQuest() {
  if (S.quest < QUESTS.length) return QUESTS[S.quest];
  const target = 5 * (Math.floor(S.horde.best / 5) + 1);
  return { d: `Alcance a onda ${target}`, ok: () => S.horde.best >= target, r: { parts: Math.ceil(target / 3), samples: 1 }, xp: target * 10, endless: true };
}
function checkQuests() {
  for (let i = 0; i < 5; i++) {
    const q = currentQuest();
    if (!q.ok()) return;
    gainAll(q.r);
    gainXp(q.xp);
    S.quest++;
    notify(`Missão concluída: ${q.d}.`, 'quest');
    addLog(`Missão concluída: ${q.d}.`, 'good');
    sfx('good');
  }
}

// ---------- Achievements ----------
const ACH = [
  ['primeira', 'Primeira noite', 'Sobreviva a uma horda', () => S.stats.won >= 1],
  ['ondas10', 'Resistência', 'Sobreviva a 10 hordas', () => S.stats.won >= 10],
  ['ondas50', 'Fortaleza', 'Sobreviva a 50 hordas', () => S.stats.won >= 50],
  ['onda25', 'Inquebrável', 'Alcance a onda 25', () => S.stats.maxWave >= 25],
  ['kill100', 'Caçador', 'Mate 100 zumbis', () => S.stats.kills >= 100],
  ['kill1k', 'Exterminador', 'Mate 1.000 zumbis', () => S.stats.kills >= 1000],
  ['kill10k', 'Lenda do apocalipse', 'Mate 10.000 zumbis', () => S.stats.kills >= 10000],
  ['chefe', 'Matador de gigantes', 'Derrote um chefe', () => S.stats.bosses >= 1],
  ['chefe10', 'Caçador de chefes', 'Derrote 10 chefes', () => S.stats.bosses >= 10],
  ['grupo5', 'Comunidade', 'Tenha 5 sobreviventes', () => S.surv.length >= 5],
  ['grupo10', 'Vilarejo', 'Tenha 10 sobreviventes', () => S.surv.length >= 10],
  ['grupo20', 'Cidade-abrigo', 'Tenha 20 sobreviventes', () => S.surv.length >= 20],
  ['exp10', 'Batedor', 'Faça 10 expedições', () => S.stats.exps >= 10],
  ['exp100', 'Andarilho', 'Faça 100 expedições', () => S.stats.exps >= 100],
  ['mapa', 'Cartógrafo', 'Explore todos os locais', () => PLACE_ORDER.every((k) => S.visits[k])],
  ['raro', 'Achado raro', 'Consiga um item Raro', () => S.stats.bestRarity >= 2],
  ['epico', 'Relíquia', 'Consiga um item Épico', () => S.stats.bestRarity >= 3],
  ['lendario', 'Lendário', 'Consiga um item Lendário', () => S.stats.bestRarity >= 4],
  ['nivel10', 'Veterano', 'Chegue ao nível 10', () => S.level >= 10],
  ['nivel25', 'Comandante', 'Chegue ao nível 25', () => S.level >= 25],
  ['obra10', 'Mestre de obras', 'Leve uma construção ao nível 10', () => BLD_ORDER.some((k) => L(k) >= 10)],
  ['tech10', 'Cientista', 'Pesquise 10 tecnologias', () => S.tech.done.length >= 10],
  ['techall', 'Gênio do fim do mundo', 'Pesquise todas as tecnologias', () => S.tech.done.length >= Object.keys(TECH).length],
  ['prest', 'Recomeço', 'Faça um prestígio', () => S.prestige.count >= 1],
];
function checkAch() {
  for (const [id, n, , ok] of ACH) {
    if (S.ach.includes(id) || !ok()) continue;
    S.ach.push(id);
    notify(`Conquista: ${n} (+2% de produção)`, 'rare');
    addLog(`Conquista desbloqueada: ${n}.`, 'rare');
  }
}

// ---------- Prestige ----------
function prestigeGain() {
  const w = S.horde.best;
  if (w < 15) return 0;
  return Math.floor(Math.pow(w - 10, 1.15) * 0.6 + S.level * 0.4);
}
const perkCost = (k) => perk(k) + 1;
function buyPerk(k) {
  const p = PERKS[k];
  if (!p || perk(k) >= p.max) return;
  const c = perkCost(k);
  if (S.prestige.pts < c) return notify('Pontos de Esperança insuficientes.', 'bad');
  S.prestige.pts -= c;
  S.prestige.perks[k] = perk(k) + 1;
  sfx('good');
}
function doPrestige() {
  const g = prestigeGain();
  if (!g) return;
  const pr = S.prestige;
  pr.pts += g; pr.total += g; pr.count++;
  BATTLE = null;
  newState({ prestige: pr, ach: S.ach, stats: S.stats, sound: S.sound, quest: QUESTS.length });
  S.prestige = pr;
  addLog(`Nova colônia fundada. +${g} pontos de Esperança.`, 'rare');
  checkAch();
  save();
}

// ---------- Save / load ----------
function save() {
  if (!S) return false;
  // During a fight the save keeps the state from the start of the battle, so a
  // closed game replays the same fight instead of rerolling it.
  if (BATTLE) return true;
  S.last = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); return true; } catch (e) { return false; }
}
function validState(o) {
  return o && typeof o === 'object' && o.v === 1 && o.res && o.bld && Array.isArray(o.surv) && o.surv.some((s) => s.leader) && o.horde;
}
// Fills in fields added in later versions.
function migrate(o) {
  const prev = S;
  const base = newState();
  S = prev;
  for (const k in base) if (o[k] === undefined) o[k] = base[k];
  for (const k in base.res) if (typeof o.res[k] !== 'number' || !isFinite(o.res[k])) o.res[k] = 0;
  for (const k in base.bld) if (typeof o.bld[k] !== 'number') o.bld[k] = 0;
  for (const k in base.stats) if (o.stats[k] === undefined) o.stats[k] = base.stats[k];
  for (const k in base.horde) if (o.horde[k] === undefined) o.horde[k] = base.horde[k];
  for (const s of o.surv) { if (!s.eq) s.eq = { w: null, h: null, b: null }; if (s.treat === undefined) s.treat = 0; }
  return o;
}
function load() {
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (e) {}
  if (!raw) return false;
  let o;
  try { o = JSON.parse(raw); } catch (e) { return false; }
  if (!validState(o)) return false;
  S = migrate(o);
  return true;
}
const offlineCap = () => (8 + 2 * perk('offline')) * 3600;
// Runs the game forward for the time the player was away.
function simulateOffline(sec) {
  sec = Math.min(sec, offlineCap());
  const before = { ...S.res };
  const st0 = { won: S.stats.won, lost: S.stats.lost, kills: S.stats.kills, exps: S.stats.exps, dead: S.stats.dead, recruited: S.stats.recruited };
  const lv0 = S.level;
  OFF = { notes: [], hordes: 0 };
  const step = sec > 3600 ? 5 : 1;
  let rem = sec;
  while (rem > 0) { const d = Math.min(step, rem); tick(d); rem -= d; }
  // Give the player a moment before the next horde.
  if (!BATTLE && S.horde.timer < 30) S.horde.timer = 30;
  checkQuests();
  checkAch();
  const notes = OFF.notes;
  OFF = null;
  const delta = {};
  for (const k of ALL_RES) { const d = S.res[k] - (before[k] || 0); if (Math.abs(d) >= 1) delta[k] = d; }
  return { sec, delta, won: S.stats.won - st0.won, lost: S.stats.lost - st0.lost, kills: S.stats.kills - st0.kills,
    exps: S.stats.exps - st0.exps, dead: S.stats.dead - st0.dead, recruited: S.stats.recruited - st0.recruited,
    levels: S.level - lv0, notes };
}
