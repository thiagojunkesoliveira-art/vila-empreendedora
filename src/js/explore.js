'use strict';
// ================= Expeditions =================
const SQUAD_MAX = 4;

function placeLock(k) {
  const p = PLACES[k];
  if (S.level < p.unlock) return `Nível ${p.unlock}`;
  if (p.tech && !has(p.tech)) return `Pesquise ${TECH[p.tech].n}`;
  return null;
}
const expDuration = (k) => PLACES[k].dur * (has('veiculo') ? 0.7 : 1) * (1 - 0.08 * perk('exped'));
const expDanger = (k) => PLACES[k].danger * (has('veiculo') ? 0.75 : 1);
function expCost(k, n) {
  const c = { food: RATION.food * n, water: RATION.water * n };
  if (PLACES[k].fuel) c.fuel = PLACES[k].fuel;
  return c;
}
function memberPower(s) {
  const w = s.eq.w && itemById(s.eq.w);
  let p = 4 + s.lvl * 1.5;
  if (w) {
    const b = ITEMS[w.base];
    p += itemStat(w, 'dmg') * itemStat(w, 'spd') * (b.multi ? 1.8 : 1) * (b.ammo && S.res.ammo < 5 ? 0.4 : 1);
  }
  if (s.spec === 'Soldado') p *= 1.4;
  if (s.hp / maxHp(s) < 0.5) p *= 0.7;
  return p * (1 + survRes(s));
}
const squadPower = (ids) => ids.reduce((a, id) => { const s = survById(id); return a + (s ? memberPower(s) : 0); }, 0);
const threatOf = (k) => expDanger(k) * 9;
// Chance-like label for the squad against a place.
function squadOdds(k, ids) {
  if (!ids.length) return { lvl: 3, label: 'Sem grupo' };
  const r = squadPower(ids) / threatOf(k);
  const lvl = r >= 1.6 ? 0 : r >= 1.1 ? 1 : r >= 0.75 ? 2 : 3;
  return { lvl, r, label: ['Seguro', 'Arriscado', 'Perigoso', 'Suicida'][lvl] };
}
function canSend(s) {
  return s && !s.away && !s.down && s.hp >= maxHp(s) * 0.3;
}
function startExp(k, ids, auto) {
  const lock = placeLock(k);
  if (lock) return notify(lock + '.', 'bad');
  if (BATTLE) return notify('Não dá para sair durante uma horda.', 'bad');
  ids = [...new Set(ids)].filter((id) => canSend(survById(id))).slice(0, SQUAD_MAX);
  if (!ids.length) return notify('Escolha quem vai (precisa de pelo menos 30% de vida).', 'bad');
  if (!spend(expCost(k, ids.length))) return notify('Faltam combustível ou rações (comida e água).', 'bad');
  const total = expDuration(k);
  const nEv = 1 + (total > 100 ? 1 : 0) + (total > 280 ? 1 : 0) + (total > 600 ? 1 : 0);
  const at = [];
  for (let i = 0; i < nEv; i++) at.push(total * rnd(0.15, 0.9));
  at.sort((a, b) => a - b);
  for (const id of ids) survById(id).away = true;
  S.exp.push({ id: S.nextId++, loc: k, squad: ids, t: 0, total, at, events: [], bonus: {}, items: [], recruits: [], lootCut: 1, auto: !!auto });
  sfx('click');
  return true;
}

function expTick(dt) {
  for (const e of [...S.exp]) {
    e.t += dt;
    while (e.at.length && e.t >= e.at[0]) { e.at.shift(); expEvent(e); }
    if (e.t >= e.total) finishExp(e);
  }
}
function squadAlive(e) { return e.squad.map(survById).filter(Boolean); }

function expEvent(e) {
  const p = PLACES[e.loc], D = expDanger(e.loc);
  const team = squadAlive(e);
  if (!team.length) return;
  const firstVisit = e.loc === 'mercado' && !S.visits.mercado && !e.recruits.length && S.stats.recruited === 0;
  const type = firstVisit ? 'surv' : wpick([
    ['ambush', 38 + D], ['loot', 25], ['cache', p.item * 100], ['trap', 10], ['surv', p.surv * 60], ['quiet', 12],
  ]);
  const ev = (txt, kind) => e.events.push({ txt, kind });
  if (type === 'ambush') {
    const T = threatOf(e.loc) * rnd(0.7, 1.3);
    const P = squadPower(team.map((s) => s.id));
    const r = P / T;
    const zn = Math.max(2, Math.round(T / 7));
    for (const s of team) {
      const w = s.eq.w && itemById(s.eq.w);
      if (w && ITEMS[w.base].ammo) S.res.ammo = Math.max(0, S.res.ammo - irnd(2, 5));
      wear(s, 2, 1);
    }
    S.stats.kills += r >= 0.75 ? zn : Math.floor(zn / 2);
    if (r >= 1.3) { ev(`Emboscada de ${zn} zumbis. O grupo venceu sem ferimentos.`, 'good'); }
    else {
      const heavy = r < 0.75;
      const medic = team.some((s) => s.spec === 'Médico') ? 0.6 : 1;
      const names = [];
      for (const s of team) {
        const dmg = T * rnd(heavy ? 0.3 : 0.12, heavy ? 0.6 : 0.3) * (1 - survRes(s)) * medic;
        s.hp -= dmg;
        names.push(s.name);
        const ic = (p.infect || 0.12) * infectChance();
        if (Math.random() < ic) { s.inf = true; ev(`${s.name} foi mordido e está infectado.`, 'tox'); }
        if (s.hp <= 0) {
          if (s.leader) { s.hp = 1; s.down = true; ev('Você desmaiou, mas o grupo te carregou de volta.', 'bad'); }
          else if (Math.random() < (medic < 1 ? 0.75 : 0.5)) { s.hp = 1; s.down = true; ev(`${s.name} ficou gravemente ferido, mas sobreviveu.`, 'bad'); }
          else { ev(`${s.name} não sobreviveu.`, 'bad'); killSurvivor(s, `numa expedição (${p.n})`); }
        }
      }
      if (heavy) { e.lootCut *= 0.7; ev(`Emboscada de ${zn} zumbis! O grupo fugiu ferido e largou parte do saque.`, 'bad'); }
      else ev(`Emboscada de ${zn} zumbis. Vitória, mas com ferimentos.`, 'warn');
    }
    e.squad = e.squad.filter((id) => survById(id));
  } else if (type === 'loot') {
    const keys = Object.keys(p.loot);
    const k = pick(keys);
    const [a, b] = p.loot[k];
    const v = Math.round(rnd(a, b) * 0.6);
    e.bonus[k] = (e.bonus[k] || 0) + v;
    ev(`Encontraram um estoque escondido: +${v} ${resName(k).toLowerCase()}.`, 'good');
  } else if (type === 'cache') {
    const tier = Math.min(5, Math.max(1, Math.ceil(D / 4)));
    const pool = p.itemPool || Object.keys(ITEMS).filter((k) => ITEMS[k].tier <= tier);
    const it = makeItem(pick(pool), rollRarity(D / 3, p.minRarity || 0));
    e.items.push(it);
    ev(`Acharam ${ITEMS[it.base].n} (${RAR[it.r].n}).`, it.r >= 2 ? 'rare' : 'good');
  } else if (type === 'trap') {
    const s = pick(team);
    const dmg = rnd(10, 25) * (1 - survRes(s));
    s.hp = Math.max(1, s.hp - dmg);
    ev(`${s.name} se feriu numa armadilha antiga.`, 'warn');
  } else if (type === 'surv') {
    const spec = Math.random() < 0.7 ? pick(p.specs) : null;
    const data = { spec: spec || undefined, lvl: 1 + irnd(0, Math.floor(D / 4)), name: uniqueName() };
    e.recruits.push(data);
    ev(`Encontraram ${data.name}, que quer se juntar ao abrigo.`, 'good');
  } else {
    ev(pick(['O caminho estava silencioso.', 'Ouviram gritos ao longe e mudaram de rota.', 'Uma chuva forte atrasou o grupo.', 'Viram uma horda passando, mas não foram notados.']), 'info');
  }
}

function lootMult(e, team) {
  const coll = team.filter((s) => s.spec === 'Coletor').length;
  const visits = S.visits[e.loc] || 0;
  return (has('mochilas') ? 1.25 : 1) * (1 + 0.2 * Math.min(2, coll)) * (1 + Math.min(0.5, 0.05 * visits)) * e.lootCut * (1 + 0.1 * perk('prod'));
}
function finishExp(e) {
  S.exp = S.exp.filter((x) => x !== e);
  const p = PLACES[e.loc];
  const team = squadAlive(e);
  const rep = { loc: e.loc, t: Date.now(), events: e.events, got: {}, items: [], joined: [], waiting: [], scrapped: 0, team: team.map((s) => s.name) };
  for (const s of team) { s.away = false; survXp(s, 4 + p.danger * 2); }
  if (team.length) {
    const m = lootMult(e, team);
    const loot = {};
    for (const k in p.loot) { const [a, b] = p.loot[k]; loot[k] = rnd(a, b) * m; }
    for (const k in e.bonus) loot[k] = (loot[k] || 0) + e.bonus[k];
    for (const k in p.rare) { const [c, a, b] = p.rare[k]; if (Math.random() < c) loot[k] = (loot[k] || 0) + irnd(a, b); }
    rep.got = gainAll(loot);
    for (const it of e.items) {
      if (S.items.length < invCap()) { addItem(it); rep.items.push(it); }
      else { const v = scrapValue(it); gainAll(v); rep.scrapped++; }
    }
    for (const d of e.recruits) {
      const r = offerSurvivor(d);
      (r === 'joined' ? rep.joined : rep.waiting).push(d.name);
    }
    S.visits[e.loc] = (S.visits[e.loc] || 0) + 1;
    gainXp(8 + p.danger * 10);
  } else {
    rep.events.push({ txt: 'Ninguém voltou desta expedição.', kind: 'bad' });
  }
  S.stats.exps++;
  S.reports.unshift(rep);
  if (S.reports.length > 10) S.reports.length = 10;
  addLog(team.length ? `A expedição voltou de: ${p.n}.` : `A expedição para ${p.n} não voltou.`, team.length ? 'info' : 'bad');
  notify(team.length ? `Expedição voltou: ${p.n}.` : `A expedição para ${p.n} não voltou.`, team.length ? 'good' : 'bad');
  if (!OFF) sfx('done');
  // Auto-repeat with the same squad if everyone is fit.
  if (e.auto && has('rotas') && team.length === e.squad.length && team.every(canSend) && canAfford(expCost(e.loc, team.length)) && !BATTLE) {
    const ok = startExp(e.loc, team.map((s) => s.id), true);
    if (!ok) S.auto[e.loc] = false;
  }
}
