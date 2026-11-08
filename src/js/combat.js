'use strict';
// ================= Hordes and battle simulation =================
// A battle is simulated in small steps. It uses a seeded random generator, so if the
// game closes mid-fight the same battle is replayed (no rerolling a lost fight).
let BATTLE = null;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hordeInterval = (n) => Math.min(420, 240 + 12 * n) + (has('vigias') ? 30 : 0);
const isBossWave = (n) => n % 5 === 0;
const bossFor = (n) => BOSSES[(n / 5 - 1) % BOSSES.length];
const hpScale = (n) => Math.pow(1.1, n - 1);
const dmgScale = (n) => Math.pow(1.07, n - 1);
// Each defeat in a row makes the same wave 15% weaker (up to 45%).
const failMult = () => 1 - 0.15 * Math.min(3, S.horde.fails || 0);
const zCount = (n) => Math.round(3 + n * 1.6 + Math.pow(n, 1.25) * 0.3);

// Horde composition for wave n. Same seed, same horde (used for the preview too).
function hordeComp(n, rng) {
  const types = Object.keys(ZT).filter((k) => n >= ZT[k].from);
  const tot = types.reduce((a, k) => a + ZT[k].w, 0);
  const list = [];
  const count = zCount(n);
  for (let i = 0; i < count; i++) {
    let r = rng() * tot, k = types[0];
    for (const t of types) { r -= ZT[t].w; if (r <= 0) { k = t; break; } }
    list.push(k);
  }
  return { n, list, boss: isBossWave(n) ? bossFor(n) : null };
}
function nextHordeComp() { return hordeComp(S.horde.wave, mulberry32(S.horde.seed)); }
function compSummary(c) {
  const m = {};
  for (const k of c.list) m[k] = (m[k] || 0) + 1;
  return m;
}

// ---------- Defenders ----------
function defenderOf(s) {
  const w = s.eq.w && itemById(s.eq.w);
  const b = w ? ITEMS[w.base] : null;
  let mult = (1 + 0.04 * (s.lvl - 1)) * (s.spec === 'Soldado' ? 1.4 : 1) * (s.leader ? 1.2 : 1);
  if (s.job === 'defesa') mult *= 1.25;
  if (s.job === 'torre') mult *= 1.5;
  if (s.hp / maxHp(s) < 0.5) mult *= 0.7;
  const fire = !!(b && b.ammo);
  const fm = fire && has('balistica') ? 1.2 : 1;
  return {
    s, name: s.name, fire,
    dmg: (w ? itemStat(w, 'dmg') : 4) * mult * fm,
    fist: 4 * mult,
    spd: w ? itemStat(w, 'spd') : 1,
    range: b && b.range ? b.range + (s.job === 'torre' ? 10 : 0) : 0,
    multi: (b && b.multi) || 1, pierce: (b && b.pierce) || 0,
    res: Math.min(0.75, survRes(s) + (s.job === 'defesa' ? 0.1 : 0)),
    hp: s.hp, max: maxHp(s), cd: 0, shots: 0, hits: 0, down: false, inf: false,
  };
}
function defenseDps() {
  let d = 0;
  for (const s of atBase()) {
    if (s.down) continue;
    const df = defenderOf(s);
    d += (df.fire && S.res.ammo < 1 ? df.fist : df.dmg) * df.spd * df.multi * 0.8;
  }
  return d + F.towerDps(L('torre')) * towerMult() * pf(powerInfo().ratio);
}
// Rough danger estimate for the next wave: 0 safe .. 3 extreme.
function threatInfo() {
  const n = S.horde.wave;
  const c = nextHordeComp();
  let ehp = 0, dps = 0, spd = 0;
  const all = c.list.map((k) => ZT[k]);
  if (c.boss) all.push(c.boss);
  for (const z of all) {
    ehp += z.hp * hpScale(n) * failMult() / (1 - z.armor * 0.6);
    dps += z.dmg * dmgScale(n) * (0.5 + 0.5 * failMult());
    spd += z.spd;
  }
  const approach = 55 / (spd / all.length);
  const hold = wallMax() / Math.max(1, dps * (1 - wallArmor()) * 0.5);
  const traps = (S.traps.estaca * TRAPS.estaca.dmg + S.traps.mina * TRAPS.mina.dmg * 2) * (has('explosivos') ? 1.3 : 1);
  const power = defenseDps() * (approach * 0.6 + hold) + traps;
  const ratio = power / ehp;
  const lvl = ratio > 1.8 ? 0 : ratio > 1.15 ? 1 : ratio > 0.7 ? 2 : 3;
  return { lvl, ratio, comp: c, label: ['Baixo', 'Moderado', 'Alto', 'Extremo'][lvl] };
}

// ---------- Battle ----------
function makeBattle() {
  const n = S.horde.wave;
  const rng = mulberry32(S.horde.seed);
  const comp = hordeComp(n, rng);
  const count = comp.list.length;
  const gap = Math.max(0.25, 22 / count);
  const hs = hpScale(n) * failMult(), ds = dmgScale(n) * (0.5 + 0.5 * failMult());
  let id = 0;
  const mk = (k, z, delay, boss) => ({
    id: id++, k, n: z.n, boss: !!boss, hp: z.hp * hs, max: z.hp * hs, dmg: z.dmg * ds, spd: z.spd, armor: z.armor,
    regen: (z.regen || 0) * Math.sqrt(hs), toxic: !!z.toxic, summon: !!z.summon, size: z.size, col: z.col,
    x: 52 + rng() * 14, delay, alive: true, trap: false, mine: false, sumCd: 7, ph: rng() * 6,
  });
  const z = comp.list.map((k, i) => mk(k, ZT[k], i * gap));
  if (comp.boss) {
    const b = comp.boss;
    z.push(mk('boss', { ...b, hp: b.hp * (1 + 0.3 * Math.floor((n - 1) / 20)) }, count * gap * 0.5, true));
  }
  const def = atBase().filter((s) => !s.down).map(defenderOf);
  def.forEach((d, i) => { d.cd = rng() * 0.6; d.slot = i; });
  const pw = powerInfo();
  return {
    n, rng, t: 0, z, def,
    wall: { hp: Math.max(0, S.wall.hp), max: wallMax(), arm: wallArmor() },
    tower: { dps: F.towerDps(L('torre')) * towerMult() * pf(pw.ratio), cd: 0, range: 55 },
    traps: { estaca: S.traps.estaca, mina: S.traps.mina },
    trapDmg: (has('explosivos') ? 1.3 : 1) * (1 + 0.06 * (n - 1)),
    kills: 0, total: z.length, fx: [], breach: 0, done: false, win: false, ammo: 0,
    boss: comp.boss ? comp.boss.n : null, early: S.horde.early, speed: 1,
  };
}

function hitZombie(B, z, dmg, pierce) {
  if (!z.alive) return;
  z.hp -= dmg * (1 - z.armor * (1 - pierce));
  if (z.hp <= 0) {
    z.alive = false;
    B.kills++;
    if (z.toxic && z.x <= 0.5) {
      B.wall.hp = Math.max(0, B.wall.hp - 8 * dmgScale(B.n));
      B.fx.push({ k: 'boom', x: 0, t: B.t, c: '#86d13e' });
    }
  }
}
function nearest(B, range) {
  let best = null;
  for (const z of B.z) if (z.alive && z.delay <= 0 && z.x <= range && (!best || z.x < best.x)) best = z;
  return best;
}
const infectChance = () => (has('vacina') ? 0 : has('antidoto') ? 0.6 : 1);

function stepBattle(B, dt) {
  if (B.done) return;
  B.t += dt;
  const rng = B.rng;
  const alive = B.def.filter((d) => !d.down);
  let spawning = false;
  for (const z of B.z) {
    if (!z.alive) continue;
    if (z.delay > 0) { z.delay -= dt; spawning = true; continue; }
    if (z.regen) z.hp = Math.min(z.max, z.hp + z.regen * dt);
    if (z.summon) {
      z.sumCd -= dt;
      if (z.sumCd <= 0) {
        z.sumCd = 7;
        const v = ZT.veloz, hs = hpScale(B.n);
        B.z.push({ id: B.z.length + 1000, k: 'veloz', n: v.n, hp: v.hp * hs, max: v.hp * hs, dmg: v.dmg * dmgScale(B.n), spd: v.spd, armor: 0,
          regen: 0, toxic: false, summon: false, size: v.size, col: v.col, x: z.x + 4, delay: 0, alive: true, trap: false, mine: false, sumCd: 0, ph: rng() * 6 });
        B.total++;
      }
    }
    if (z.x > 0) {
      z.x = Math.max(0, z.x - z.spd * dt);
      if (!z.trap && z.x < 10) {
        z.trap = true;
        if (B.traps.estaca > 0 && !(z.k === 'veloz' && rng() < 0.5)) {
          B.traps.estaca--;
          hitZombie(B, z, TRAPS.estaca.dmg * B.trapDmg, 0.5);
          B.fx.push({ k: 'trap', x: z.x, t: B.t });
        }
      }
      if (!z.mine && z.x < 14 && B.traps.mina > 0) {
        const near = B.z.filter((o) => o.alive && o.delay <= 0 && Math.abs(o.x - z.x) < TRAPS.mina.area);
        if (z.boss || near.length >= 3) {
          z.mine = true;
          B.traps.mina--;
          for (const o of near) hitZombie(B, o, TRAPS.mina.dmg * B.trapDmg, 0.6);
          B.fx.push({ k: 'boom', x: z.x, t: B.t, c: '#ffb347' });
        }
      }
      continue;
    }
    // At the wall
    if (B.wall.hp > 0) {
      B.wall.hp = Math.max(0, B.wall.hp - z.dmg * (1 - B.wall.arm) * dt);
    } else if (alive.length) {
      const d = alive[z.id % alive.length];
      d.hp -= z.dmg * (1 - d.res) * dt;
      d.hits++;
      if (z.toxic && rng() < 0.08 * dt * 4 * infectChance()) d.inf = true;
      if (d.hp <= 0) { d.hp = 0; d.down = true; }
    }
  }
  if (B.wall.hp <= 0 && B.z.some((z) => z.alive && z.delay <= 0 && z.x <= 0)) B.breach += dt;

  // Defenders
  for (const d of alive) {
    d.cd -= dt;
    if (d.cd > 0) continue;
    const gun = d.fire && S.res.ammo >= 1;
    if (gun) {
      const tgt = nearest(B, d.range);
      if (!tgt) { d.cd = 0.1; continue; }
      S.res.ammo -= 1;
      B.ammo++;
      d.shots++;
      const targets = [tgt];
      if (d.multi > 1) {
        const others = B.z.filter((z) => z !== tgt && z.alive && z.delay <= 0 && z.x <= d.range).sort((a, b) => a.x - b.x);
        targets.push(...others.slice(0, d.multi - 1));
      }
      for (const t of targets) { hitZombie(B, t, d.dmg, d.pierce); B.fx.push({ k: 'shot', d: d.slot, x: t.x, t: B.t }); }
      d.cd += 1 / d.spd;
    } else {
      const tgt = nearest(B, 1);
      if (!tgt) { d.cd = 0.1; continue; }
      const dmg = d.fire ? d.fist : d.dmg;
      hitZombie(B, tgt, dmg, 0);
      d.shots++;
      if (tgt.toxic && rng() < 0.04 * infectChance()) d.inf = true;
      B.fx.push({ k: 'melee', d: d.slot, x: 0, t: B.t });
      d.cd += 1 / (d.fire ? 1 : d.spd);
    }
  }
  // Tower
  if (B.tower.dps > 0) {
    B.tower.cd -= dt;
    if (B.tower.cd <= 0) {
      const tgt = nearest(B, B.tower.range);
      if (tgt) {
        hitZombie(B, tgt, B.tower.dps * 0.5, 0.3);
        B.fx.push({ k: 'tower', x: tgt.x, t: B.t });
        B.tower.cd = 0.5;
      } else B.tower.cd = 0.1;
    }
  }
  if (B.fx.length > 80) B.fx = B.fx.filter((f) => B.t - f.t < 0.4);

  const left = B.z.some((z) => z.alive);
  if (!left && !spawning) { B.done = true; B.win = true; return; }
  const standing = B.def.some((d) => !d.down);
  if ((B.wall.hp <= 0 && !standing && B.z.some((z) => z.alive && z.x <= 0 && z.delay <= 0)) || B.breach > 45 || B.t > 300) {
    B.done = true; B.win = false;
  }
}

function startHorde() {
  if (BATTLE) return;
  S.horde.inBattle = true;
  save();
  BATTLE = makeBattle();
  addLog(`Onda ${BATTLE.n} atacando o abrigo!`, 'bad');
  notify(`A onda ${BATTLE.n} chegou!${BATTLE.boss ? ' Chefe: ' + BATTLE.boss + '!' : ''}`, 'bad');
  sfx('alarm');
}
function callHordeNow() {
  if (BATTLE) return;
  S.horde.early = true;
  S.horde.timer = 0;
  startHorde();
}
function hordeTick(dt) {
  if (BATTLE) return;
  S.horde.timer -= dt;
  if (S.horde.timer > 0) return;
  if (OFF) {
    // At most 3 hordes attack while the player is away; the rest wait.
    if (OFF.hordes >= 3) { S.horde.timer = 0; return; }
    OFF.hordes++;
    const B = makeBattle();
    while (!B.done) stepBattle(B, 0.25);
    finishBattle(B);
    return;
  }
  startHorde();
}
function resolveNow() {
  if (!BATTLE) return;
  while (!BATTLE.done) stepBattle(BATTLE, 0.25);
}

// Applies the battle result to the game. Returns a report for the interface.
function finishBattle(B) {
  const n = B.n;
  const rep = { n, win: B.win, kills: B.kills, total: B.total, ammo: B.ammo, boss: B.boss, got: {}, lost: {}, dead: [], hurt: [], infected: [], item: null, xp: 0 };
  S.wall.hp = Math.max(0, B.wall.hp);
  S.traps = { ...B.traps };
  for (const d of B.def) {
    const s = survById(d.s.id);
    if (!s) continue;
    wear(s, 2 + Math.floor(d.shots / 20), d.hits > 0 ? 2 : 0);
    survXp(s, 3 + n);
    if (d.inf && !s.inf && !has('vacina')) { s.inf = true; rep.infected.push(s.name); }
    if (d.hp <= 0) {
      if (s.leader) { s.hp = 1; s.down = true; rep.hurt.push(s.name); }
      else if (B.rng() < Math.max(0.1, 0.35 - 0.03 * L('enfermaria'))) { rep.dead.push(s.name); killSurvivor(s, `defendendo o abrigo na onda ${n}`); }
      else { s.hp = 1; s.down = true; rep.hurt.push(s.name); }
    } else {
      if (d.hp < d.max * 0.5 && d.hp < s.hp) rep.hurt.push(s.name);
      s.hp = Math.min(s.hp, d.hp);
    }
  }
  S.stats.kills += B.kills;
  if (B.win) {
    const m = (B.early ? 1.2 : 1) * globalMult();
    const rw = { wood: 12 * n * m, metal: 8 * n * m, food: 4 * n * m, water: 4 * n * m };
    if (n >= 3) rw.parts = Math.floor(n / 3);
    if (n >= 6) rw.ammo = 5 * n;
    let xp = 15 * n;
    if (B.boss) {
      rw.samples = 1 + Math.floor(n / 10);
      rw.parts = (rw.parts || 0) + 3;
      xp += 40 * n;
      S.stats.bosses++;
    }
    const itemChance = B.boss ? 1 : n >= 4 ? 0.15 : 0;
    if (Math.random() < itemChance && S.items.length < invCap()) {
      const tier = Math.min(5, Math.max(1, Math.ceil(n / 5)));
      const pool = Object.keys(ITEMS).filter((k) => ITEMS[k].tier <= tier);
      const it = makeItem(pick(pool), rollRarity(n / 3, B.boss ? 2 : 0));
      addItem(it);
      rep.item = it;
    }
    rep.got = gainAll(rw);
    rep.xp = xp;
    gainXp(xp);
    S.stats.won++;
    S.horde.fails = 0;
    S.horde.wave++;
    S.horde.best = Math.max(S.horde.best, n);
    S.stats.maxWave = Math.max(S.stats.maxWave, n);
    addLog(`Onda ${n} derrotada! ${B.kills} zumbis abatidos.`, 'good');
  } else {
    // Zombies ransack part of the stock, but never the last reserve.
    for (const k of ['wood', 'metal', 'food', 'water']) {
      const l = Math.floor(Math.max(0, S.res[k] - 40) * 0.15);
      if (l > 0) { S.res[k] -= l; rep.lost[k] = l; }
    }
    rep.xp = 4 * n;
    gainXp(rep.xp);
    S.stats.lost++;
    S.horde.fails = (S.horde.fails || 0) + 1;
    addLog(`A onda ${n} invadiu o abrigo. Recursos foram saqueados.`, 'bad');
  }
  S.horde.seed = (Math.random() * 2 ** 31) | 0;
  S.horde.timer = hordeInterval(S.horde.wave) * (B.win ? 1 : 1.2);
  S.horde.early = false;
  S.horde.inBattle = false;
  if (B === BATTLE) BATTLE = null;
  if (OFF) OFF.notes.push(B.win ? `Onda ${n} derrotada.` : `A onda ${n} invadiu o abrigo.`);
  else { UIQ.push({ type: 'battle', rep }); sfx(B.win ? 'win' : 'lose'); save(); }
  return rep;
}
