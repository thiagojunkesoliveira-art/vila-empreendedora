'use strict';
// ================= Interface =================
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (n, cls = '') => `<svg class="ic ${cls}"><use href="#i-${n}"/></svg>`;
const pct = (a, b) => (b > 0 ? clamp(a / b * 100, 0, 100) : 0).toFixed(1);

const TABS = [
  ['base', 'Base', 'home', 'Base'], ['res', 'Recursos', 'box', 'Recursos'], ['exp', 'Exploração', 'map', 'Mapa'], ['surv', 'Sobreviventes', 'users', 'Grupo'],
  ['ars', 'Arsenal', 'target', 'Arsenal'], ['tech', 'Tecnologias', 'flask', 'Pesquisa'], ['stats', 'Estatísticas', 'chart', 'Status'],
];
const UI = { tab: 'base', sel: 'mercado', squad: [], artab: 'w', speed: 1, mq: [], modalOpen: false, confirmFn: null, closable: true };
try { const t = localStorage.getItem('ultimo-abrigo-aba'); if (TABS.some((x) => x[0] === t)) UI.tab = t; } catch (e) {}

// ---------- DOM morphing: update only what changed, so buttons keep working ----------
function patch(parent, html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  morphChildren(parent, tpl.content);
}
function morphChildren(a, b) {
  const an = Array.from(a.childNodes), bn = Array.from(b.childNodes);
  for (let i = 0; i < bn.length; i++) {
    if (i >= an.length) a.appendChild(bn[i]);
    else morphNode(an[i], bn[i]);
  }
  for (let i = bn.length; i < an.length; i++) an[i].remove();
}
function morphNode(x, y) {
  if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName ||
      (x.nodeType === 1 && x.getAttribute('data-k') !== y.getAttribute('data-k'))) { x.replaceWith(y); return; }
  if (x.nodeType !== 1) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; return; }
  for (const at of Array.from(x.attributes)) if (!y.hasAttribute(at.name)) x.removeAttribute(at.name);
  for (const at of Array.from(y.attributes)) if (x.getAttribute(at.name) !== at.value) x.setAttribute(at.name, at.value);
  if (x.nodeName === 'CANVAS') return;
  if (x.nodeName === 'INPUT') { x.checked = y.hasAttribute('checked'); if (x.type !== 'checkbox' && document.activeElement !== x) x.value = y.getAttribute('value') || ''; }
  morphChildren(x, y);
  if (x.nodeName === 'SELECT' && document.activeElement !== x) {
    const o = y.querySelector('option[selected]');
    if (o) x.value = o.value;
  }
}

// ---------- Small pieces ----------
function costHTML(cost) {
  return Object.keys(cost).map((k) => {
    const ok = (S.res[k] || 0) + 1e-9 >= cost[k];
    return `<span class="cost${ok ? '' : ' miss'}" title="${esc(resName(k))}">${ic(resIcon(k))}${fmt(cost[k])}</span>`;
  }).join('');
}
function bar(v, max, cls = '') { return `<div class="bar ${cls}"><i style="width:${pct(v, max)}%"></i></div>`; }
function ago(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
}
const skulls = (n) => Array.from({ length: 5 }, (_, i) => `<i class="sk${i < n ? ' on' : ''}"></i>`).join('');
const dangerLvl = (d) => Math.min(5, Math.max(1, Math.ceil(d / 4)));
const lootList = (o) => Object.keys(o).map((k) => `<span class="cost gain">${ic(resIcon(k))}+${fmt(o[k])}</span>`).join('') || '<span class="muted">nada</span>';
const lossList = (o) => Object.keys(o).map((k) => `<span class="cost miss">${ic(resIcon(k))}-${fmt(o[k])}</span>`).join('');
function itemName(it) { return `${ITEMS[it.base].n}${it.lvl ? ' +' + it.lvl : ''}`; }
function itemStatsHTML(it) {
  const b = ITEMS[it.base];
  if (b.slot === 'w') {
    return `<span>Dano <b>${fmtR(itemStat(it, 'dmg'))}${b.multi ? '×' + b.multi : ''}</b></span><span>Vel <b>${fmtR(itemStat(it, 'spd'))}</b></span>` +
      `<span>${b.range ? 'Alcance <b>' + b.range + '</b>' : '<b>Corpo a corpo</b>'}</span>${b.pierce ? `<span>Perfura <b>${b.pierce * 100}%</b></span>` : ''}${b.ammo ? '<span class="muted">usa munição</span>' : ''}`;
  }
  return `<span>Proteção <b>${fmtR(itemStat(it, 'res'))}</b></span>`;
}
function baseStatsHTML(id) {
  const b = ITEMS[id];
  if (b.slot === 'w') return `<span>Dano <b>${b.dmg}${b.multi ? '×' + b.multi : ''}</b></span><span>Vel <b>${b.spd}</b></span><span>${b.range ? 'Alcance <b>' + b.range + '</b>' : '<b>Corpo a corpo</b>'}</span><span>Durab. <b>${b.dur}</b></span>`;
  return `<span>Proteção <b>${b.res}</b></span><span>Durab. <b>${b.dur}</b></span>`;
}
function survPower(s) { const d = defenderOf(s); return d.dmg * d.spd * d.multi; }

// ---------- Top bar ----------
function renderTop() {
  $('brandSub').textContent = BATTLE ? `Onda ${BATTLE.n} em andamento` : `${S.surv.length} ${S.surv.length === 1 ? 'sobrevivente' : 'sobreviventes'} · Onda ${S.horde.wave}`;
  const need = xpNeed(S.level);
  patch($('lvl'), `<div class="lv" title="Experiência: ${fmt(S.xp)} de ${fmt(need)}"><span class="lvn">Nv ${S.level}</span>${bar(S.xp, need, 'xp')}</div>`);
  let h = '';
  for (const k of MAIN_RES) {
    const net = RATES ? (RATES.p[k] - RATES.c[k]) * 60 : 0;
    const cap = capOf(k), v = S.res[k];
    const full = v >= cap - 0.5;
    const low = (k === 'food' || k === 'water') && net < 0 && v / Math.max(1, -net) < 3;
    const tip = rateTip(k);
    h += `<div class="rc${full ? ' full' : ''}${low || v < 1 && net < 0 ? ' low' : ''}" title="${esc(tip)}">${ic(RES[k].ic, 'r-' + k)}<div class="rv"><b>${fmt(v)}</b><small>/${fmt(cap)}</small></div><span class="rr ${net > 0.05 ? 'pos' : net < -0.05 ? 'neg' : ''}">${net > 0.05 ? '+' : ''}${Math.abs(net) < 0.05 ? '0' : fmtR(net)}/min</span></div>`;
  }
  for (const k in RARE) if (S.res[k] >= 1 || (k === 'parts' && S.level >= 2)) {
    h += `<div class="rc rare" title="${esc(RARE[k].n)}">${ic(RARE[k].ic, 'r-' + k)}<div class="rv"><b>${fmt(S.res[k])}</b></div></div>`;
  }
  patch($('resbar'), h);
  if (BATTLE) {
    patch($('hchip'), `<div class="hc fight">${ic('skull')}<div><b>HORDA ATACANDO</b><small>Onda ${BATTLE.n}</small></div></div>`);
  } else {
    const t = threatInfo();
    patch($('hchip'), `<div class="hc t${t.lvl}" title="Perigo estimado: ${t.label}">${ic('skull')}<div><b>${fmtTime(S.horde.timer)}</b><small>Onda ${S.horde.wave}${isBossWave(S.horde.wave) ? ' · Chefe' : ''} · ${t.label}</small></div></div>`);
  }
  const snd = $('btnSnd');
  snd.innerHTML = ic(S.sound ? 'sound' : 'mute');
  snd.title = S.sound ? 'Som ligado' : 'Som desligado';
}
function rateTip(k) {
  if (!RATES) return resName(k);
  const lines = [`${resName(k)}: ${fmt(S.res[k])} de ${fmt(capOf(k))}`];
  for (const [l, v] of RATES.bp[k]) lines.push(`+${fmtR(v)}/min  ${l}`);
  for (const [l, v] of RATES.bc[k]) lines.push(`-${fmtR(v)}/min  ${l}`);
  return lines.join('\n');
}
function renderTabs() {
  const badge = {
    exp: S.exp.length, surv: S.pending.length, ars: S.craft.length,
    tech: S.tech.cur ? '' : (Object.keys(TECH).some((id) => techState(id) === 'open' && canAfford(TECH[id].cost)) ? '!' : ''),
  };
  patch($('tabs'), TABS.map(([k, n, i, sh]) => `<button type="button" class="tab${UI.tab === k ? ' on' : ''}" data-a="tab" data-v="${k}" title="${n}">${ic(i)}<span class="tl">${n}</span><span class="ts">${sh}</span>${badge[k] ? `<em>${badge[k]}</em>` : ''}</button>`).join(''));
}

// ---------- Base ----------
function questCard() {
  const q = currentQuest();
  return `<div class="card quest"><div class="ch">${ic('flag')}<span>Missão</span>${q.endless ? '' : `<small>${S.quest + 1}/${QUESTS.length}</small>`}</div>
    <p class="qd">${esc(q.d)}</p><div class="qr"><span class="muted">Recompensa:</span>${lootList(q.r)}<span class="cost gain">${fmt(q.xp)} XP</span></div></div>`;
}
function hordeCard() {
  if (BATTLE) {
    return `<div class="card horde t3"><div class="ch">${ic('skull')}<span>Horda atacando</span><span class="tag red">Onda ${BATTLE.n}</span></div>
      <p>Os zumbis estão na muralha. Acompanhe a batalha no topo da tela.</p></div>`;
  }
  const t = threatInfo();
  const c = compSummary(t.comp);
  const see = L('torre') > 0 || has('vigias');
  const comp = see
    ? `<div class="comp">${Object.keys(c).map((k) => `<span title="${esc(ZT_DESC[k])}"><i class="zd" style="background:${ZT[k].col}"></i>${c[k]}× ${ZT[k].n.replace('Zumbi ', '')}</span>`).join('')}${t.comp.boss ? `<span class="boss" title="${esc(t.comp.boss.d)}"><i class="zd" style="background:${t.comp.boss.col}"></i>Chefe: ${t.comp.boss.n}</span>` : ''}</div>`
    : `<p class="muted small">Construa a Torre de vigilância para ver quais zumbis vêm na próxima onda.</p>`;
  const dps = defenseDps();
  return `<div class="card horde t${t.lvl}"><div class="ch">${ic('skull')}<span>Próxima horda</span><span class="tag${t.comp.boss ? ' red' : ''}">Onda ${S.horde.wave}${t.comp.boss ? ' · Chefe' : ''}</span></div>
    <div class="htimer"><b>${fmtTime(S.horde.timer)}</b><div class="threat"><span>Perigo <b>${t.label}</b></span><div class="meter">${[0, 1, 2, 3].map((i) => `<i class="${i <= t.lvl ? 'on' : ''}"></i>`).join('')}</div></div></div>
    ${S.horde.fails ? `<p class="small warn">Depois de ${S.horde.fails} ${S.horde.fails === 1 ? 'derrota' : 'derrotas'}, esta onda volta ${Math.round((1 - failMult()) * 100)}% mais fraca.</p>` : ''}
    ${comp}
    <div class="dstats">
      <div><span>${ic('wall')} Muralha</span>${bar(S.wall.hp, wallMax(), 'hp')}<small>${fmt(S.wall.hp)}/${fmt(wallMax())}</small></div>
      <div class="row3"><span title="Dano por segundo somando todos os defensores e a torre">${ic('target')} ${fmtR(dps)}/s</span><span>${ic('users')} ${atBase().filter((s) => !s.down).length} defensores</span><span>${ic('ammo')} ${fmt(S.res.ammo)}</span></div>
      ${S.traps.estaca || S.traps.mina ? `<div class="row3"><span>Estacas: ${S.traps.estaca}</span><span>Minas: ${S.traps.mina}</span></div>` : ''}
    </div>
    <button type="button" class="btn danger wide" data-a="callhorde">${ic('skull')} Enfrentar agora (+20% recompensa)</button></div>`;
}
function manualCard() {
  const ld = leader();
  const blocked = ld.away ? 'Você está em expedição.' : ld.down ? 'Você está inconsciente.' : '';
  const items = Object.keys(MANUAL).map((k) => {
    const m = MANUAL[k], on = S.manual && S.manual.k === k;
    const r = Object.keys(m.give).map((g) => `+${m.give[g][0]}-${m.give[g][1]}`).join(' ');
    return `<button type="button" class="act${on ? ' on' : ''}" data-a="manual" data-v="${k}"${(S.manual && !on) || blocked ? ' disabled' : ''}>
      ${ic(m.ic, 'r-' + Object.keys(m.give)[0])}<span>${m.n}</span><small>${r}</small><i class="prog" style="width:${on ? pct(S.manual.t, S.manual.total) : 0}%"></i></button>`;
  }).join('');
  return `<div class="card"><div class="ch">${ic('pack')}<span>Coleta manual</span></div>${blocked ? `<p class="muted small">${blocked}</p>` : ''}<div class="acts">${items}</div>
    <p class="muted small">Você também coleta sozinho quando está na função Coleta.</p></div>`;
}
function logCard() {
  return `<div class="card"><div class="ch">${ic('clock')}<span>Registro</span></div><ul class="log">${S.log.slice(0, 14).map((l) => `<li class="${l.type}"><span>${esc(l.msg)}</span><time>${ago(l.t)}</time></li>`).join('')}</ul></div>`;
}
function bldCard(k) {
  const b = BLD[k], lv = L(k);
  if (!bldUnlocked(k)) {
    return `<div class="card bld locked" data-k="b-${k}"><div class="bh">${ic(b.ic, 'bi')}<div><b>${b.n}</b><small>${ic('lock')} Libera no nível ${b.unlock}</small></div></div><p class="muted small">${esc(b.d)}</p></div>`;
  }
  const max = lv >= b.max;
  const cost = max ? null : bldCost(k);
  const ok = cost && canAfford(cost);
  const cur = lv ? b.fx(lv) : [], nxt = max ? [] : b.fx(lv + 1);
  const lines = (lv ? cur : nxt).map((c, i) => `<li>${esc(c)}${lv && !max && nxt[i] && nxt[i] !== c ? ` <span class="nx">${ic('up')} ${esc(nxt[i].split(': ')[1] || nxt[i])}</span>` : ''}</li>`).join('');
  let extra = '';
  if (b.job && lv) extra += `<span class="chip">${ic('users')} ${jobCount(k)}/${F.slots(lv)}</span>`;
  if (b.pw && lv && RATES && RATES.pw.ratio < 0.999) extra += `<span class="chip warn">${ic('bolt')} ${RATES.pw.supply ? 'Pouca energia' : 'Sem energia'}</span>`;
  if (k === 'coleta') extra += `<span class="chip">${ic('users')} ${jobCount('coleta')}/${F.gatherSlots(lv)}</span>`;
  if (k === 'barracas') extra += `<span class="chip">${ic('users')} ${S.surv.length}/${F.people(lv)}</span>`;
  return `<div class="card bld${lv ? '' : ' new'}${ok ? ' can' : ''}" data-k="b-${k}">
    <div class="bh">${ic(b.ic, 'bi')}<div><b>${b.n}</b><small>${lv ? `Nível ${lv}${max ? ' (máximo)' : ''}` : 'Não construído'}</small></div>${extra ? `<div class="bx">${extra}</div>` : ''}</div>
    <p class="muted small">${esc(b.d)}</p>
    <ul class="fx${lv ? '' : ' pre'}">${lines}</ul>
    ${max ? '' : `<div class="bf"><div class="costs">${costHTML(cost)}</div><button type="button" class="btn${ok ? ' go' : ''}" data-a="build" data-v="${k}"${ok ? '' : ' disabled'}>${lv ? ic('up') + 'Melhorar' : ic('wrench') + 'Construir'}</button></div>`}
  </div>`;
}
function renderBase() {
  return `<div class="cols">
    <div class="side">${questCard()}${hordeCard()}${manualCard()}${logCard()}</div>
    <div class="main"><h2 class="sec">${ic('home')} Construções</h2><div class="grid bgrid">${BLD_ORDER.map(bldCard).join('')}</div></div>
  </div>`;
}

// ---------- Resources ----------
function renderRes() {
  const R = RATES;
  const rows = MAIN_RES.map((k) => {
    const p = R.p[k] * 60, c = R.c[k] * 60, net = p - c, cap = capOf(k);
    const eta = net < -0.01 ? `Acaba em ${fmtTime(S.res[k] / -net * 60)}` : net > 0.01 && S.res[k] < cap ? `Enche em ${fmtTime((cap - S.res[k]) / net * 60)}` : S.res[k] >= cap - 0.5 ? 'Armazém cheio' : '';
    const src = [...R.bp[k].map(([l, v]) => `<span class="pos">+${fmtR(v)} ${esc(l)}</span>`), ...R.bc[k].map(([l, v]) => `<span class="neg">-${fmtR(v)} ${esc(l)}</span>`)].join('') || '<span class="muted">Sem produção automática</span>';
    return `<div class="rrow" data-k="r-${k}">
      <div class="rn">${ic(RES[k].ic, 'r-' + k)}<b>${RES[k].n}</b></div>
      <div class="ra"><div class="rnum"><b>${fmt(S.res[k])}</b> / ${fmt(cap)}</div>${bar(S.res[k], cap, 'r-' + k)}<small class="muted">${eta}</small></div>
      <div class="rp"><span class="pos">+${fmtR(p)}</span><span class="neg">-${fmtR(c)}</span><b class="${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : ''}${fmtR(net)}/min</b></div>
      <div class="rs">${src}</div></div>`;
  }).join('');
  const pw = R.pw;
  const rare = Object.keys(RARE).map((k) => `<div class="rare-r">${ic(RARE[k].ic, 'r-' + k)}<b>${fmt(S.res[k])}</b><span>${RARE[k].n}</span></div>`).join('');
  return `<div class="cols">
    <div class="side">${manualCard()}
      <div class="card"><div class="ch">${ic('bolt')}<span>Energia</span></div>
        ${L('gerador') ? `<div class="pw"><span>Produção <b>${fmtR(pw.supply)}</b></span><span>Uso <b>${fmtR(pw.demand)}</b></span></div>${bar(Math.min(pw.supply, pw.demand), Math.max(pw.demand, 1), pw.ratio < 1 ? 'warn' : 'ok')}
          <p class="muted small">${!pw.fuelOk ? 'Sem combustível: o gerador parou.' : pw.ratio < 1 ? 'Energia insuficiente: arsenal, enfermaria, torre e destilaria rendem menos.' : 'Tudo funcionando com energia total.'}</p>`
          : '<p class="muted small">Sem gerador, arsenal, enfermaria, torre e destilaria funcionam a 30%. O Gerador libera no nível 4.</p>'}
      </div>
      <div class="card"><div class="ch">${ic('parts')}<span>Materiais raros</span></div><div class="rares">${rare}</div>
        <p class="muted small">Peças vêm do posto, hospital, delegacia e fábrica. Amostras mutantes vêm dos chefes. Liga militar vem da base militar.</p></div>
    </div>
    <div class="main"><h2 class="sec">${ic('box')} Estoque, produção e consumo <small>(por minuto)</small></h2>
      ${S.starving ? `<div class="banner bad">${ic('alert')} Falta comida ou água! Os sobreviventes perdem vida e trabalham menos.</div>` : ''}
      <div class="card rtable">${rows}</div>
      <p class="muted small">Cada pessoa no abrigo consome ${has('racionamento') ? '0,85' : '1'} de comida e ${has('racionamento') ? '1,02' : '1,2'} de água por minuto. Quem está em expedição leva as próprias rações. Produção acima do limite do armazém é perdida: melhore o Depósito.</p>
    </div></div>`;
}

// ---------- Exploration ----------
function renderMap() {
  const roads = PLACE_ORDER.map((k) => { const p = PLACES[k]; return `<line x1="6" y1="88" x2="${p.x}" y2="${p.y}"/>`; }).join('');
  const nodes = PLACE_ORDER.map((k) => {
    const p = PLACES[k], lock = placeLock(k), busy = S.exp.some((e) => e.loc === k);
    return `<button type="button" class="node d${dangerLvl(p.danger)}${lock ? ' locked' : ''}${UI.sel === k ? ' sel' : ''}${busy ? ' busy' : ''}" style="left:${p.x}%;top:${p.y}%" data-a="sel" data-v="${k}" title="${esc(p.n)}">
      ${ic(lock ? 'lock' : p.ic)}<span>${p.n.replace(' abandonado', '')}</span></button>`;
  }).join('');
  return `<div class="card map"><svg class="roads" viewBox="0 0 100 100" preserveAspectRatio="none">${roads}</svg>
    <div class="zone z1">Subúrbio</div><div class="zone z2">Centro</div><div class="zone z3">Zona industrial</div><div class="zone z4">Zona militar</div>
    <div class="node home" style="left:6%;top:88%">${ic('home')}<span>Abrigo</span></div>${nodes}</div>`;
}
function placePanel() {
  const k = UI.sel, p = PLACES[k], lock = placeLock(k);
  const D = expDanger(k);
  UI.squad = UI.squad.filter((id) => canSend(survById(id)));
  const n = Math.max(1, UI.squad.length);
  const cost = expCost(k, n);
  const loot = Object.keys(p.loot).map((r) => `<span class="cost">${ic(resIcon(r))}${p.loot[r][0]}-${p.loot[r][1]}</span>`).join('') +
    Object.keys(p.rare).map((r) => `<span class="cost rare">${ic(resIcon(r))}${Math.round(p.rare[r][0] * 100)}%</span>`).join('');
  const members = atBase().map((s) => {
    const can = canSend(s), on = UI.squad.includes(s.id);
    return `<button type="button" class="mem${on ? ' on' : ''}" data-a="squad" data-id="${s.id}"${can && !lock ? '' : ' disabled'} title="${esc(s.spec)}">
      ${ic(SPECS[s.spec].ic)}<span>${esc(s.name)}</span><small>${fmtR(memberPower(s))}</small>${bar(s.hp, maxHp(s), 'hp')}</button>`;
  }).join('') || '<p class="muted small">Ninguém disponível no abrigo.</p>';
  const odds = squadOdds(k, UI.squad);
  const busy = S.exp.some((e) => e.loc === k);
  return `<div class="card place"><div class="ch">${ic(p.ic)}<span>${p.n}</span><small>${p.region}</small></div>
    <p class="muted small">${esc(p.d)}</p>
    <div class="pstats"><div><small>Perigo</small><div class="skulls">${skulls(dangerLvl(D))}</div></div><div><small>Duração</small><b>${fmtTime(expDuration(k))}</b></div><div><small>Visitas</small><b>${S.visits[k] || 0}</b></div></div>
    <div class="sub">Saque possível</div><div class="costs">${loot}</div>
    <div class="pchance"><span>${ic('users')} Sobreviventes: ${Math.round(p.surv * 100)}%</span><span>${ic('star')} Equipamentos: ${Math.round(p.item * 100)}%</span>${p.infect ? `<span class="tox">${ic('biohazard')} Risco de infecção</span>` : ''}</div>
    ${lock ? `<div class="banner">${ic('lock')} Bloqueado: ${lock}.</div>` : `
    <div class="sub">Grupo (até ${SQUAD_MAX}) <small>números = poder de combate</small></div><div class="mems">${members}</div>
    <div class="odds o${odds.lvl}"><span>Poder do grupo <b>${fmtR(squadPower(UI.squad))}</b> vs ameaça <b>${fmtR(threatOf(k))}</b></span><b>${odds.label}</b></div>
    <div class="sub">Custo (${n} ${n === 1 ? 'pessoa' : 'pessoas'})</div><div class="costs">${costHTML(cost)}</div>
    ${!BATTLE && UI.squad.length && expDuration(k) > S.horde.timer ? `<div class="banner warnb">${ic('alert')} A horda chega em ${fmtTime(S.horde.timer)} e a expedição dura ${fmtTime(expDuration(k))}: este grupo não estará na defesa.</div>` : ''}
    ${has('rotas') ? `<label class="chk"><input type="checkbox" data-a="auto" data-v="${k}"${S.auto[k] ? ' checked' : ''}> Repetir automaticamente</label>` : ''}
    <button type="button" class="btn go wide" data-a="send"${UI.squad.length && canAfford(cost) && !BATTLE ? '' : ' disabled'}>${ic('map')} Enviar expedição${busy ? ' (outra equipe)' : ''}</button>
    ${BATTLE ? '<p class="muted small">Espere a horda acabar para sair.</p>' : ''}`}
  </div>`;
}
function expCard(e) {
  const p = PLACES[e.loc];
  const names = e.squad.map(survById).filter(Boolean).map((s) => esc(s.name)).join(', ');
  return `<div class="card expc" data-k="e-${e.id}"><div class="ch">${ic(p.ic)}<span>${p.n}</span><small>${fmtTime(e.total - e.t)}</small></div>
    ${bar(e.t, e.total, 'go')}<p class="small">${ic('users')} ${names}${e.auto ? ' · repetindo' : ''}</p>
    <ul class="evs">${e.events.slice(-3).map((v) => `<li class="${v.kind}">${esc(v.txt)}</li>`).join('') || '<li class="muted">A caminho…</li>'}</ul></div>`;
}
function renderExp() {
  const reps = S.reports.map((r, i) => `<button type="button" class="rep" data-a="report" data-v="${i}">${ic(PLACES[r.loc].ic)}<span><b>${PLACES[r.loc].n}</b><small>${ago(r.t)} · ${r.team.length ? Object.keys(r.got).length + ' recursos' + (r.items.length ? ', ' + r.items.length + ' item' : '') + (r.joined.length ? ', ' + r.joined.length + ' recrutado' : '') : 'ninguém voltou'}</small></span></button>`).join('');
  return `<div class="cols exp">
    <div class="main"><h2 class="sec">${ic('map')} Mapa da cidade</h2>${renderMap()}
      <h2 class="sec">${ic('clock')} Expedições em andamento</h2>${S.exp.length ? `<div class="grid egrid">${S.exp.map(expCard).join('')}</div>` : '<p class="muted small">Nenhuma equipe fora. Escolha um local no mapa.</p>'}
      ${reps ? `<h2 class="sec">${ic('flag')} Relatórios</h2><div class="reps">${reps}</div>` : ''}
    </div>
    <div class="side">${placePanel()}</div></div>`;
}

// ---------- Survivors ----------
function survCard(s) {
  const st = survStatus(s);
  const jobs = Object.keys(JOBS).map((j) => {
    const open = jobOpen(j), full = s.job !== j && jobCount(j) >= jobSlots(j);
    const lab = JOBS[j].n + (jobSlots(j) !== Infinity && open ? ` (${jobCount(j)}/${jobSlots(j)})` : '') + (!open ? ' (não construído)' : '') + (JOBS[j].match === s.spec ? ' ★' : '');
    return `<option value="${j}"${s.job === j ? ' selected' : ''}${!open || full ? ' disabled' : ''}>${esc(lab)}</option>`;
  }).join('');
  const slots = ['w', 'h', 'b'].map((sl) => {
    const it = s.eq[sl] && itemById(s.eq[sl]);
    return `<button type="button" class="slot${it ? ' ' + RAR[it.r].c : ''}" data-a="eqpick" data-id="${s.id}" data-slot="${sl}"${s.away ? ' disabled' : ''}>
      ${ic(it ? ITEMS[it.base].ic : sl === 'w' ? 'knife' : sl === 'h' ? 'helmet' : 'vest')}<span>${it ? esc(itemName(it)) : SLOT_N[sl]}</span>${it && it.dur <= 0 ? '<em>quebrado</em>' : ''}</button>`;
  }).join('');
  const initials = s.name.split(' ').map((w) => w[0]).join('').slice(0, 2);
  return `<div class="card surv${s.away ? ' away' : ''}" data-k="s-${s.id}">
    <div class="sh"><div class="av sp-${s.spec === 'Líder' ? 'lider' : s.spec.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}">${esc(initials)}</div>
      <div class="sn"><b>${esc(s.name)}</b><small title="${esc(SPECS[s.spec].d)}">${ic(SPECS[s.spec].ic)} ${s.spec} · Nv ${s.lvl}</small></div>
      <div class="sts">${st.map(([t, c]) => `<span class="st ${c}">${t}</span>`).join('')}</div></div>
    <div class="hpw">${ic('heart')}${bar(s.hp, maxHp(s), 'hp')}<small>${fmt(s.hp)}/${maxHp(s)}</small></div>
    <div class="xpw" title="Experiência">${bar(s.xp, survXpNeed(s.lvl), 'xp')}</div>
    <div class="sstats"><span>Produtividade <b>${Math.round(effProd(s) * 100)}%</b></span><span>Combate <b>${fmtR(survPower(s))}</b></span><span>Proteção <b>${Math.round(survRes(s) * 100)}%</b></span></div>
    <label class="jobsel"><span>Função</span><select data-a="job" data-id="${s.id}"${s.away ? ' disabled' : ''}>${jobs}</select></label>
    <div class="slots">${slots}</div>
    <div class="sact">${s.inf && !s.away ? `<button type="button" class="btn sm" data-a="treat" data-id="${s.id}"${S.res.meds >= 1 ? '' : ' disabled'}>${ic('meds')} Tratar (1 remédio)</button>` : ''}
      ${!s.leader && !s.away ? `<button type="button" class="btn sm ghost" data-a="expel" data-id="${s.id}">Expulsar</button>` : ''}</div>
  </div>`;
}
function renderSurv() {
  const cm = has('racionamento') ? 0.85 : 1, home = atBase().length;
  const pend = S.pending.map((p) => `<div class="pend"><div><b>${esc(p.name)}</b><small>${p.spec || 'Especialização desconhecida'} · Nv ${p.lvl || 1}</small></div>
    <button type="button" class="btn sm go" data-a="accept" data-v="${p.pid}"${canHouse() ? '' : ' disabled'}>Aceitar</button><button type="button" class="btn sm ghost" data-a="dismiss" data-v="${p.pid}">Dispensar</button></div>`).join('');
  const specs = Object.keys(SPECS).filter((k) => k !== 'Líder').map((k) => `<li>${ic(SPECS[k].ic)}<b>${k}:</b> ${esc(SPECS[k].d)}</li>`).join('');
  return `<div class="cols mainfirst">
    <div class="side">
      <div class="card"><div class="ch">${ic('users')}<span>Grupo</span></div>
        <div class="big2"><b>${S.surv.length}</b>/${capPeople()} <small>pessoas (Barracas)</small></div>
        <p class="small">Consumo: ${fmtR(home * cm)} comida e ${fmtR(home * 1.2 * cm)} água por minuto.</p>
        ${has('radio') ? `<button type="button" class="btn wide" data-a="radio"${S.radioCd > 0 || !canAfford(RADIO_COST) ? ' disabled' : ''}>${ic('radio')} ${S.radioCd > 0 ? 'Rádio em ' + fmtTime(S.radioCd) : 'Chamar pelo rádio'}</button><div class="costs">${costHTML(RADIO_COST)}</div>` : '<p class="muted small">Encontre sobreviventes nas expedições. A pesquisa Rádio amador permite chamar pelo rádio.</p>'}
      </div>
      ${pend ? `<div class="card"><div class="ch">${ic('flag')}<span>No portão</span></div>${pend}${canHouse() ? '' : '<p class="muted small">Barracas cheias: melhore as Barracas para aceitar.</p>'}</div>` : ''}
      <div class="card"><div class="ch">${ic('star')}<span>Especializações</span></div><ul class="specs">${specs}</ul><p class="muted small">★ na lista de funções = rende mais com essa especialização.</p></div>
    </div>
    <div class="main"><h2 class="sec">${ic('users')} Sobreviventes</h2><div class="grid sgrid">${S.surv.map(survCard).join('')}</div></div></div>`;
}

// ---------- Arsenal ----------
function recipeCard(kind, id) {
  const r = recipe(kind, id), lock = recipeLock(kind, id);
  const ok = !lock && canAfford(r.cost) && S.craft.length < craftQueueMax();
  let head, stats;
  if (kind === 'item') { const b = ITEMS[id]; head = `${ic(b.ic, 'bi')}<div><b>${b.n}</b><small>${SLOT_N[b.slot]} · Nível ${b.tier}</small></div>`; stats = baseStatsHTML(id); }
  else if (kind === 'trap') { const t = TRAPS[id]; head = `${ic('alert', 'bi')}<div><b>${t.n}</b><small>Armadilha · ${S.traps[id]} prontas</small></div>`; stats = `<span>Dano <b>${t.dmg}</b></span><span class="muted">${esc(t.d)}</span>`; }
  else { head = `${ic('ammo', 'bi')}<div><b>Munição</b><small>${AMMO_RECIPE.out} unidades</small></div>`; stats = '<span class="muted">Feita à mão. O Arsenal produz sozinho.</span>'; }
  return `<div class="card rec${lock ? ' locked' : ''}" data-k="rc-${kind}-${id}"><div class="bh">${head}</div><div class="istats">${stats}</div>
    <div class="bf"><div class="costs">${costHTML(r.cost)}<span class="cost">${ic('clock')}${Math.round(r.time)}s</span></div>
    <button type="button" class="btn${ok ? ' go' : ''}" data-a="craft" data-kind="${kind}" data-v="${id}"${ok ? '' : ' disabled'}>${lock ? ic('lock') + esc(lock) : 'Fabricar'}</button></div></div>`;
}
function itemCard(it) {
  const b = ITEMS[it.base], h = holderOf(it.id), mx = itemMaxDur(it);
  const up = it.lvl < RAR[it.r].max ? upCost(it) : null, rc = repairCost(it);
  return `<div class="card item ${RAR[it.r].c}" data-k="i-${it.id}"><div class="bh">${ic(b.ic, 'bi')}<div><b>${esc(itemName(it))}</b><small class="rt">${RAR[it.r].n} · ${SLOT_N[b.slot]}</small></div></div>
    <div class="istats">${itemStatsHTML(it)}</div>
    <div class="durw"><small>Durabilidade</small>${bar(it.dur, mx, it.dur <= 0 ? 'bad' : 'ok')}<small>${fmt(it.dur)}/${mx}</small></div>
    <p class="small muted">${h ? `Com ${esc(h.name)}${h.away ? ' (em expedição)' : ''}` : 'No inventário'}</p>
    <div class="iact">
      ${up ? `<button type="button" class="btn sm" data-a="upgrade" data-v="${it.id}"${canAfford(up) && L('oficina') ? '' : ' disabled'} title="Melhorar: +8% de atributos">${ic('up')}<span class="costs">${costHTML(up)}</span></button>` : '<span class="chip">Nível máximo</span>'}
      ${rc ? `<button type="button" class="btn sm" data-a="repair" data-v="${it.id}"${canAfford(rc) ? '' : ' disabled'}>${ic('wrench')}<span class="costs">${costHTML(rc)}</span></button>` : ''}
      <button type="button" class="btn sm ghost" data-a="scrap" data-v="${it.id}"${h && h.away ? ' disabled' : ''} title="Desmontar e recuperar parte dos materiais">${ic('x')}</button>
    </div></div>`;
}
function renderArs() {
  const tabs = [['w', 'Armas'], ['a', 'Proteção'], ['t', 'Armadilhas e munição']];
  let recs = '';
  if (UI.artab === 'w') recs = Object.keys(ITEMS).filter((k) => ITEMS[k].slot === 'w').map((k) => recipeCard('item', k)).join('');
  else if (UI.artab === 'a') recs = Object.keys(ITEMS).filter((k) => ITEMS[k].slot !== 'w').map((k) => recipeCard('item', k)).join('');
  else recs = recipeCard('ammo', 'ammo') + Object.keys(TRAPS).map((k) => recipeCard('trap', k)).join('');
  const q = S.craft.map((c, i) => `<div class="qi" data-k="q-${i}-${c.kind}-${c.id}"><span>${esc(recipe(c.kind, c.id).n)}</span>${i === 0 ? bar(c.t, c.total, 'go') : '<small class="muted">na fila</small>'}<button type="button" class="iconbtn sm" data-a="cancelcraft" data-v="${i}" title="Cancelar e devolver os materiais">${ic('x')}</button></div>`).join('');
  const items = [...S.items].sort((a, b) => b.r - a.r || ITEMS[b.base].tier - ITEMS[a.base].tier).map(itemCard).join('');
  return `<div class="cols ars mainfirst">
    <div class="side">
      <div class="card"><div class="ch">${ic('wrench')}<span>Oficina</span><small>${L('oficina') ? 'Nível ' + L('oficina') : 'não construída'}</small></div>
        ${L('oficina') ? `<p class="small">Velocidade: <b>${Math.round(craftSpeed() * 100)}%</b> · Fila ${S.craft.length}/${craftQueueMax()}</p>${q || '<p class="muted small">Nada sendo fabricado.</p>'}` : '<p class="muted small">Construa a Oficina de fabricação (aba Base) para fabricar equipamentos.</p>'}
        <p class="muted small">Raridade é sorteada ao fabricar. Engenheiros na oficina, o nível dela e a pesquisa Forja aumentam a chance de itens melhores.</p>
      </div>
      <div class="card"><div class="ch">${ic('target')}<span>Munição</span></div><p class="small">${fmt(S.res.ammo)} / ${fmt(capOf('ammo'))}${L('arsenal') ? ` · Arsenal: +${fmtR((RATES.bp.ammo[0] || [0, 0])[1])}/min` : ''}</p>
        <p class="muted small">Armas de fogo gastam 1 munição por tiro. Sem munição, quem usa arma de fogo luta com as mãos.</p></div>
      <div class="card"><div class="ch">${ic('star')}<span>Raridades</span></div><div class="rars">${RAR.map((r) => `<span class="${r.c}">${r.n} ×${String(r.m).replace('.', ',')} (até +${r.max})</span>`).join('')}</div></div>
    </div>
    <div class="main">
      <h2 class="sec">${ic('wrench')} Fabricar</h2>
      <div class="subtabs">${tabs.map(([k, n]) => `<button type="button" class="${UI.artab === k ? 'on' : ''}" data-a="artab" data-v="${k}">${n}</button>`).join('')}</div>
      <div class="grid rgrid">${recs}</div>
      <h2 class="sec">${ic('box')} Inventário <small>${S.items.length}/${invCap()}</small></h2>
      <div class="grid igrid">${items || '<p class="muted small">Inventário vazio.</p>'}</div>
    </div></div>`;
}

// ---------- Technologies ----------
function techCard(id) {
  const t = TECH[id], st = techState(id);
  const req = (t.req || []).map((r) => `<span class="${has(r) ? 'ok' : 'no'}">${TECH[r].n}</span>`).join('');
  const ok = st === 'open' && canAfford(t.cost) && !S.tech.cur;
  return `<div class="card tech ${st}" data-k="t-${id}"><div class="th"><b>${t.n}</b>${st === 'done' ? ic('check', 'okc') : st === 'locked' ? ic('lock') : ''}</div>
    <p class="small">${esc(t.d)}</p>
    ${st !== 'done' ? `<div class="treq">${S.level < t.lvl ? `<span class="no">Nível ${t.lvl}</span>` : ''}${req}</div>` : ''}
    ${st === 'cur' ? bar(S.tech.cur.t, S.tech.cur.total, 'go') : ''}
    ${st === 'open' ? `<div class="bf"><div class="costs">${costHTML(t.cost)}<span class="cost">${ic('clock')}${fmtTime(t.time)}</span></div><button type="button" class="btn${ok ? ' go' : ''}" data-a="research" data-v="${id}"${ok ? '' : ' disabled'}>Pesquisar</button></div>` : ''}
  </div>`;
}
function renderTech() {
  const c = S.tech.cur;
  const cols = TECH_BRANCHES.map((br) => `<div class="tcol"><h3>${br}</h3>${Object.keys(TECH).filter((id) => TECH[id].br === br).map(techCard).join('')}</div>`).join('');
  return `<div class="card tcur">${c ? `<div class="ch">${ic('flask')}<span>Pesquisando: ${TECH[c.id].n}</span><small>${fmtTime(c.total - c.t)}</small></div>${bar(c.t, c.total, 'go')}<button type="button" class="btn sm ghost" data-a="cancelres">Cancelar (devolve os recursos)</button>`
    : `<div class="ch">${ic('flask')}<span>Nenhuma pesquisa em andamento</span></div><p class="muted small">Escolha uma tecnologia abaixo. Uma pesquisa por vez, e ela continua enquanto você está fora.</p>`}</div>
    <div class="ttree">${cols}</div>
    <p class="muted small">${S.tech.done.length}/${Object.keys(TECH).length} tecnologias pesquisadas.</p>`;
}

// ---------- Statistics, achievements, prestige, settings ----------
function renderStats() {
  const st = S.stats;
  const rows = [
    ['Tempo de jogo (total)', fmtTime(st.played)], ['Tempo nesta colônia', fmtTime(S.played)], ['Melhor onda (colônia)', S.horde.best], ['Melhor onda (total)', st.maxWave],
    ['Hordas vencidas', st.won], ['Hordas perdidas', st.lost], ['Zumbis abatidos', fmt(st.kills)], ['Chefes derrotados', st.bosses],
    ['Expedições', st.exps], ['Sobreviventes recrutados', st.recruited], ['Sobreviventes perdidos', st.dead], ['Itens fabricados', st.crafted],
    ['Pesquisas', st.research], ['Construções e melhorias', st.builds], ['Coletado à mão', fmt(st.gathered)], ['Experiência total', fmt(st.totalXp)],
  ].map(([a, b]) => `<div class="stat"><small>${a}</small><b>${b}</b></div>`).join('');
  const ach = ACH.map(([id, n, d]) => `<div class="ach${S.ach.includes(id) ? ' on' : ''}">${ic(S.ach.includes(id) ? 'trophy' : 'lock')}<div><b>${n}</b><small>${d}</small></div></div>`).join('');
  const g = prestigeGain();
  const perks = Object.keys(PERKS).map((k) => {
    const p = PERKS[k], r = perk(k), c = perkCost(k), mx = r >= p.max;
    return `<div class="perk"><div><b>${p.n} <small>${r}/${p.max}</small></b><small>${esc(p.d)}</small></div><button type="button" class="btn sm${!mx && S.prestige.pts >= c ? ' go' : ''}" data-a="perk" data-v="${k}"${mx || S.prestige.pts < c ? ' disabled' : ''}>${mx ? 'Máx.' : `${c} ${ic('star')}`}</button></div>`;
  }).join('');
  return `<div class="cols stats-l">
    <div class="main">
      <h2 class="sec">${ic('chart')} Estatísticas</h2><div class="card"><div class="stats">${rows}</div></div>
      <h2 class="sec">${ic('trophy')} Conquistas <small>${S.ach.length}/${ACH.length} · +${S.ach.length * 2}% de produção</small></h2><div class="grid agrid">${ach}</div>
    </div>
    <div class="side">
      <div class="card prest"><div class="ch">${ic('star')}<span>Prestígio: nova colônia</span></div>
        <p class="small">Abandone este abrigo e funde uma nova colônia. Você perde construções, recursos, sobreviventes, itens e pesquisas, mas ganha <b>pontos de Esperança</b> para bônus permanentes. Conquistas e estatísticas continuam.</p>
        <div class="big2"><b>${S.prestige.pts}</b> <small>pontos disponíveis · ${S.prestige.count} prestígios</small></div>
        <button type="button" class="btn wide${g ? ' danger' : ''}" data-a="prestige"${g ? '' : ' disabled'}>${g ? `Fundar nova colônia (+${g} pontos)` : `Libera na onda 15 (melhor: ${S.horde.best})`}</button>
        <div class="perks">${perks}</div></div>
      <div class="card"><div class="ch">${ic('save')}<span>Jogo</span></div>
        <p class="muted small">O jogo salva sozinho a cada 15 segundos e ao fechar.</p>
        <div class="btns"><button type="button" class="btn" data-a="save">${ic('save')} Salvar agora</button><button type="button" class="btn" data-a="sound">${ic(S.sound ? 'sound' : 'mute')} Som ${S.sound ? 'ligado' : 'desligado'}</button></div>
        <div class="sub">Backup</div>
        <div class="btns"><button type="button" class="btn" data-a="backup">${ic('download')} Fazer backup</button><button type="button" class="btn" data-a="restore">${ic('upload')} Restaurar backup</button>${lsGet(BK_UNDO) ? `<button type="button" class="btn ghost" data-a="undo">${ic('reset')} Desfazer restauração</button>` : ''}</div>
        <div class="sub">Zona de perigo</div>
        <button type="button" class="btn ghost danger-t" data-a="reset">${ic('reset')} Reiniciar a partida</button>
      </div></div></div>`;
}

const RENDER = { base: renderBase, res: renderRes, exp: renderExp, surv: renderSurv, ars: renderArs, tech: renderTech, stats: renderStats };
function render() {
  if (!S || !RATES) return;
  renderTop();
  renderTabs();
  patch($('view'), RENDER[UI.tab]());
  renderBattleHud();
}

// ---------- Toasts and modals ----------
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  $('toasts').appendChild(el);
  while ($('toasts').children.length > 5) $('toasts').firstChild.remove();
  setTimeout(() => el.classList.add('out'), 4200);
  setTimeout(() => el.remove(), 4700);
}
// Modals wait in a queue; fn runs when the confirm button is pressed.
function openModal(html, closable = true, fn = null) {
  UI.mq.push({ html, closable, fn });
  if (!UI.modalOpen) nextModal();
}
function nextModal() {
  const m = UI.mq.shift();
  UI.confirmFn = m ? m.fn : null;
  if (!m) { UI.modalOpen = false; $('modal').classList.add('hidden'); return; }
  UI.modalOpen = true;
  UI.closable = m.closable;
  $('mbox').innerHTML = m.html;
  $('modal').classList.remove('hidden');
  const f = $('mbox').querySelector('[autofocus],textarea,button.go');
  if (f) f.focus();
}
function closeModal() { nextModal(); }
function confirmBox(title, text, ok, fn, danger) {
  openModal(`<h3>${title}</h3><p>${text}</p><div class="mbtns"><button type="button" class="btn ghost" data-a="mclose">Cancelar</button><button type="button" class="btn ${danger ? 'danger' : 'go'}" data-a="mok">${ok}</button></div>`, true, fn);
}
function battleModal(r) {
  const it = r.item;
  return `<h3 class="${r.win ? 'win' : 'lose'}">${ic(r.win ? 'trophy' : 'skull')} ${r.win ? `Onda ${r.n} derrotada!` : `A onda ${r.n} invadiu o abrigo`}</h3>
    ${r.boss && r.win ? `<p><b>${esc(r.boss)}</b> caiu!</p>` : ''}
    <div class="mstats"><span>Zumbis abatidos <b>${r.kills}/${r.total}</b></span><span>Munição usada <b>${r.ammo}</b></span><span>Experiência <b>+${r.xp}</b></span></div>
    ${r.win ? `<div class="sub">Recompensas</div><div class="costs">${lootList(r.got)}</div>` : `<div class="sub">Saqueado pelos zumbis</div><div class="costs">${lossList(r.lost) || '<span class="muted">nada</span>'}</div>
      <div class="sub">Como se preparar</div><ul class="tips">${defeatTips().map((t) => `<li>${t}</li>`).join('')}</ul>
      <p class="small muted">A mesma onda volta um pouco mais fraca, com mais tempo para você se preparar.</p>`}
    ${it ? `<div class="sub">Equipamento encontrado</div><p class="${RAR[it.r].c}"><b>${esc(itemName(it))}</b> (${RAR[it.r].n})</p>` : ''}
    ${r.dead.length ? `<p class="bad">${ic('skull')} Mortos: ${r.dead.map(esc).join(', ')}</p>` : ''}
    ${r.hurt.length ? `<p class="warn">Feridos: ${r.hurt.map(esc).join(', ')}</p>` : ''}
    ${r.infected.length ? `<p class="tox">Infectados: ${r.infected.map(esc).join(', ')}</p>` : ''}
    <div class="mbtns"><button type="button" class="btn go" data-a="mclose">Continuar</button></div>`;
}
// Advice after a lost fight, based on what the base is missing.
function defeatTips() {
  const t = [];
  const people = atBase();
  const unarmed = people.filter((s) => !s.eq.w).length;
  if (!L('oficina')) t.push('Construa a <b>Oficina</b> (aba Base) para fabricar armas.');
  else if (unarmed) t.push(`${unarmed} ${unarmed === 1 ? 'pessoa está' : 'pessoas estão'} sem arma: fabrique na aba <b>Arsenal</b> e equipe na aba Sobreviventes.`);
  if (S.res.ammo < 10) t.push(L('oficina') ? 'A munição acabou: fabrique <b>munição</b> no Arsenal (sai de metal).' : 'A munição acabou: quem usa pistola luta com as mãos.');
  if (!L('muralha')) t.push('Construa as <b>Muralhas defensivas</b>: elas seguram os zumbis longe de vocês.');
  else if (S.wall.hp < wallMax() * 0.5) t.push('A muralha está danificada: ela se conserta sozinha usando madeira.');
  if (people.length <= 2) t.push('Recrute mais gente: mande expedições ao <b>Supermercado</b>.');
  if (!L('torre') && S.level >= 3) t.push('A <b>Torre de vigilância</b> atira de longe em todas as hordas.');
  if (!t.length) t.push('Melhore a muralha, coloque soldados na função Defesa e equipe armas melhores.');
  return t.slice(0, 3);
}
function reportModal(r) {
  const p = PLACES[r.loc];
  return `<h3>${ic(p.ic)} ${p.n}</h3><p class="muted small">${r.team.length ? 'Equipe: ' + r.team.map(esc).join(', ') : ''}</p>
    <ul class="evs big">${r.events.map((v) => `<li class="${v.kind}">${esc(v.txt)}</li>`).join('') || '<li class="muted">Sem incidentes.</li>'}</ul>
    <div class="sub">Trouxeram</div><div class="costs">${lootList(r.got)}</div>
    ${r.items.length ? `<div class="sub">Equipamentos</div>${r.items.map((it) => `<p class="${RAR[it.r].c}"><b>${esc(itemName(it))}</b> (${RAR[it.r].n})</p>`).join('')}` : ''}
    ${r.scrapped ? `<p class="small muted">Inventário cheio: ${r.scrapped} item(ns) virou(aram) material.</p>` : ''}
    ${r.joined.length ? `<p class="good">Entraram para o grupo: ${r.joined.map(esc).join(', ')}</p>` : ''}
    ${r.waiting.length ? `<p class="warn">Esperando no portão (barracas cheias): ${r.waiting.map(esc).join(', ')}</p>` : ''}
    <div class="mbtns"><button type="button" class="btn go" data-a="mclose">Fechar</button></div>`;
}
function offlineModal(r) {
  const gains = {}, losses = {};
  for (const k in r.delta) (r.delta[k] > 0 ? gains : losses)[k] = Math.abs(r.delta[k]);
  return `<h3>${ic('clock')} Enquanto você estava fora (${fmtTime(r.sec)})</h3>
    <div class="sub">Produzido</div><div class="costs">${lootList(gains)}</div>
    ${Object.keys(losses).length ? `<div class="sub">Gasto</div><div class="costs">${lossList(losses)}</div>` : ''}
    <div class="mstats">${r.won ? `<span>Hordas vencidas <b>${r.won}</b></span>` : ''}${r.lost ? `<span class="bad">Hordas perdidas <b>${r.lost}</b></span>` : ''}${r.kills ? `<span>Zumbis <b>${r.kills}</b></span>` : ''}${r.exps ? `<span>Expedições <b>${r.exps}</b></span>` : ''}${r.recruited ? `<span>Recrutados <b>${r.recruited}</b></span>` : ''}${r.levels ? `<span>Níveis <b>+${r.levels}</b></span>` : ''}${r.dead ? `<span class="bad">Mortos <b>${r.dead}</b></span>` : ''}</div>
    ${r.sec >= offlineCap() ? `<p class="muted small">O progresso fora do jogo vai até ${Math.round(offlineCap() / 3600)} horas.</p>` : ''}
    <p class="muted small">Enquanto você está fora, no máximo 3 hordas atacam; as outras esperam você voltar.</p>
    <div class="mbtns"><button type="button" class="btn go" data-a="mclose">Continuar</button></div>`;
}
function welcomeModal() {
  return `<h3>${ic('skull')} Último Abrigo</h3>
    <p>O mundo caiu. Você encontrou um abrigo abandonado com uma pistola velha, uma faca e quase nada para comer.</p>
    <ul class="howto"><li>${ic('home')} <b>Base:</b> construa e melhore estruturas. Elas produzem sozinhas, até com o jogo fechado.</li>
    <li>${ic('map')} <b>Exploração:</b> mande expedições para buscar recursos, equipamentos e novos sobreviventes.</li>
    <li>${ic('users')} <b>Sobreviventes:</b> dê uma função e equipamento para cada pessoa.</li>
    <li>${ic('skull')} <b>Hordas:</b> de tempos em tempos os zumbis atacam. A cada 5 ondas vem um chefe.</li>
    <li>${ic('flag')} Siga a <b>Missão</b> no canto da tela para começar.</li></ul>
    <div class="mbtns"><button type="button" class="btn go" data-a="mclose">Começar</button></div>`;
}
function equipModal(sid, slot) {
  const s = survById(sid);
  const list = S.items.filter((it) => ITEMS[it.base].slot === slot).sort((a, b) => b.r - a.r);
  const cur = s.eq[slot];
  const rows = list.map((it) => {
    const h = holderOf(it.id);
    return `<button type="button" class="pickrow ${RAR[it.r].c}${cur === it.id ? ' on' : ''}" data-a="equip" data-id="${sid}" data-v="${it.id}"${h && h.away ? ' disabled' : ''}>
      ${ic(ITEMS[it.base].ic)}<span><b>${esc(itemName(it))}</b><small>${RAR[it.r].n}${h ? ' · com ' + esc(h.name) : ''}${it.dur <= 0 ? ' · quebrado' : ''}</small></span><span class="istats">${itemStatsHTML(it)}</span></button>`;
  }).join('') || '<p class="muted">Nenhum item para este espaço. Fabrique na aba Arsenal.</p>';
  return `<h3>${SLOT_N[slot]} de ${esc(s.name)}</h3><div class="picks">${rows}</div>
    <div class="mbtns">${cur ? `<button type="button" class="btn ghost" data-a="unequip" data-id="${sid}" data-slot="${slot}">Tirar</button>` : ''}<button type="button" class="btn" data-a="mclose">Fechar</button></div>`;
}

// ---------- Battle view ----------
const bcv = () => $('bcv');
let bctx = null;
function renderBattleHud() {
  const sec = $('battle');
  if (!BATTLE) { if (!sec.classList.contains('hidden')) sec.classList.add('hidden'); return; }
  sec.classList.remove('hidden');
  const B = BATTLE;
  const alive = B.z.filter((z) => z.alive).length;
  const defs = B.def.map((d) => `<span class="dfn${d.down ? ' down' : ''}" title="${esc(d.name)}"><small>${esc(d.name)}</small>${bar(d.hp, d.max, 'hp')}</span>`).join('');
  patch($('bhud'), `<div class="bh1"><b class="red">${ic('skull')} Onda ${B.n}${B.boss ? ' · ' + esc(B.boss) : ''}</b>
    <span>Zumbis ${alive}/${B.total}</span><span>Abatidos ${B.kills}</span><span>${ic('ammo')} ${fmt(S.res.ammo)}</span>
    <span class="wallb">${ic('wall')}${bar(B.wall.hp, B.wall.max, 'hp')}</span>
    <span class="spd">${[1, 2, 4].map((v) => `<button type="button" class="${UI.speed === v ? 'on' : ''}" data-a="speed" data-v="${v}">${v}×</button>`).join('')}<button type="button" data-a="resolve" title="Resolver a batalha agora">${ic('fast')} Resolver</button></span></div>
    <div class="defs">${defs || '<span class="muted small">Ninguém em condições de lutar!</span>'}</div>`);
}
function drawBattle() {
  const B = BATTLE, cv = bcv();
  if (!B || !cv) return;
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const c = bctx || (bctx = cv.getContext('2d'));
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const gy = H * 0.74, wx = Math.min(110, W * 0.16);
  const sky = c.createLinearGradient(0, 0, 0, gy);
  sky.addColorStop(0, '#0b0d0b'); sky.addColorStop(1, '#1d2219');
  c.fillStyle = sky; c.fillRect(0, 0, W, gy);
  c.fillStyle = 'rgba(200,70,50,.07)'; c.beginPath(); c.arc(W * 0.82, gy * 0.3, 22, 0, 7); c.fill();
  c.fillStyle = '#121510';
  for (let i = 0; i < 18; i++) { const bw = 20 + (i * 37) % 45, bh = 20 + (i * 53) % 55, bx = (i * 71) % W; c.fillRect(bx, gy - bh, bw, bh); }
  c.fillStyle = '#23261b'; c.fillRect(0, gy, W, H - gy);
  c.fillStyle = '#2b2f22'; for (let i = 0; i < W; i += 23) c.fillRect(i, gy + 8 + (i * 7) % 18, 9, 2);
  const zx = (x) => wx + 8 + (x / 68) * (W - wx - 26);
  // traps zone
  if (B.traps.estaca > 0) { c.fillStyle = '#6b5a3a'; for (let i = 0; i < Math.min(8, B.traps.estaca); i++) { const px = zx(3 + i * 0.9); c.beginPath(); c.moveTo(px, gy + 6); c.lineTo(px + 3, gy - 2); c.lineTo(px + 6, gy + 6); c.fill(); } }
  // tower
  if (L('torre')) { c.fillStyle = '#3a3f33'; c.fillRect(wx - 66, gy - 72, 14, 72); c.fillStyle = '#4b5243'; c.fillRect(wx - 72, gy - 80, 26, 9); }
  // wooden walkway behind the wall, where the defenders stand
  const py0 = gy - 30;
  c.fillStyle = '#4a3a26'; c.fillRect(wx - 58, py0, 44, 4);
  c.fillStyle = '#3a2d1e'; for (let x = wx - 56; x < wx - 16; x += 13) c.fillRect(x, py0 + 4, 3, gy - py0 - 4);
  // wall
  const wr = B.wall.max ? B.wall.hp / B.wall.max : 0;
  const wh = 44 * (wr > 0 ? 0.4 + 0.6 * wr : 0.2);
  c.fillStyle = wr > 0 ? '#55564a' : '#3a3428'; c.fillRect(wx - 14, gy - wh, 14, wh);
  c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(wx - 14, gy - wh, 14, 2);
  c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 1;
  for (let y = gy - wh + 7; y < gy; y += 7) { c.beginPath(); c.moveTo(wx - 14, y); c.lineTo(wx, y); c.stroke(); }
  if (wr > 0 && wr < 0.4) { c.fillStyle = 'rgba(190,50,40,.35)'; c.fillRect(wx - 14, gy - wh, 14, wh); }
  // defenders
  const dpos = (i) => [wx - 22 - (i % 4) * 10, py0 - Math.floor(i / 4) * 3];
  B.def.forEach((d, i) => {
    if (d.down) return;
    const [px, py] = dpos(i);
    c.fillStyle = '#5f7a3a'; c.fillRect(px - 2, py - 9, 5, 9);
    c.fillStyle = '#c9b48e'; c.beginPath(); c.arc(px + 0.5, py - 12, 2.8, 0, 7); c.fill();
    c.fillStyle = '#8bab55'; c.fillRect(px - 2.5, py - 15.5, 6, 2);
  });
  // zombies
  const t = B.t;
  const zs = B.z.filter((z) => z.alive && z.delay <= 0).sort((a, b) => b.x - a.x);
  for (const z of zs) {
    const s = z.size * (W < 500 ? 0.8 : 1);
    const px = zx(z.x), py = gy + 4 + (z.id % 5) * 3;
    const sw = Math.sin(t * 6 * z.spd + z.ph);
    if (z.boss) { c.fillStyle = 'rgba(200,40,40,.18)'; c.beginPath(); c.arc(px, py - 12 * s, 16 * s, 0, 7); c.fill(); }
    c.fillStyle = shadeC(z.col, -40);
    c.fillRect(px - 3 * s + sw * 2 * s, py - 6 * s, 2.5 * s, 6 * s);
    c.fillRect(px + 0.5 * s - sw * 2 * s, py - 6 * s, 2.5 * s, 6 * s);
    c.fillStyle = z.col;
    c.fillRect(px - 3.5 * s, py - 16 * s, 7 * s, 10 * s);
    c.fillRect(px - 9 * s, py - 14 * s + sw * s, 6 * s, 2.2 * s);
    c.beginPath(); c.arc(px, py - 19 * s, 3.4 * s, 0, 7); c.fill();
    c.fillStyle = '#e04030'; c.fillRect(px - 2 * s, py - 20 * s, 1.4 * s, 1.4 * s);
    if (z.hp < z.max) { c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(px - 8 * s, py - 27 * s, 16 * s, 2.5); c.fillStyle = z.boss ? '#e8a33a' : '#c9473d'; c.fillRect(px - 8 * s, py - 27 * s, 16 * s * clamp(z.hp / z.max, 0, 1), 2.5); }
  }
  // effects
  for (const f of B.fx) {
    const age = t - f.t;
    if (age > 0.45 || age < 0) continue;
    const a = 1 - age / 0.45;
    if (f.k === 'shot' || f.k === 'tower') {
      if (age > 0.12) continue;
      const [sx, sy] = f.k === 'tower' ? [wx - 62, gy - 76] : dpos(f.d);
      c.strokeStyle = `rgba(255,214,120,${a})`; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(sx + 3, sy - 8); c.lineTo(zx(f.x), gy - 10); c.stroke();
    } else if (f.k === 'boom' || f.k === 'trap') {
      c.fillStyle = f.k === 'trap' ? `rgba(220,200,150,${a * 0.6})` : hexA(f.c || '#ffb347', a * 0.5);
      c.beginPath(); c.arc(zx(f.x), gy - 4, (f.k === 'trap' ? 8 : 26) * (1 - a * 0.5), 0, 7); c.fill();
    } else if (f.k === 'melee') {
      c.fillStyle = `rgba(255,255,255,${a * 0.5})`; c.fillRect(wx + 2, gy - 18, 6, 2);
    }
  }
}
function shadeC(hex, d) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp((n >> 16) + d, 0, 255), g = clamp(((n >> 8) & 255) + d, 0, 255), b = clamp((n & 255) + d, 0, 255);
  return `rgb(${r},${g},${b})`;
}
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }

// ---------- Sound ----------
let AC = null;
function audio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
  if (AC && AC.state === 'suspended') AC.resume().catch(() => {});
  return AC;
}
function tone(f, d, type = 'square', vol = 0.05, at = 0, slide = 0) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + 0.02);
}
function sfx(n) {
  if (OFF || !S || !S.sound || document.hidden) return;
  switch (n) {
    case 'click': tone(520, 0.05, 'square', 0.025); break;
    case 'build': tone(220, 0.08, 'square', 0.04); tone(330, 0.1, 'square', 0.04, 0.07); break;
    case 'good': tone(440, 0.08, 'triangle', 0.06); tone(660, 0.12, 'triangle', 0.06, 0.08); break;
    case 'done': tone(392, 0.08, 'triangle', 0.05); tone(523, 0.12, 'triangle', 0.05, 0.08); break;
    case 'level': [392, 494, 587, 784].forEach((f, i) => tone(f, 0.12, 'square', 0.04, i * 0.08)); break;
    case 'alarm': for (let i = 0; i < 3; i++) { tone(740, 0.18, 'sawtooth', 0.04, i * 0.36, -260); } break;
    case 'win': [330, 392, 523, 659].forEach((f, i) => tone(f, 0.16, 'square', 0.045, i * 0.1)); break;
    case 'lose': [330, 262, 196].forEach((f, i) => tone(f, 0.25, 'sawtooth', 0.04, i * 0.18)); break;
    default: break;
  }
}

// ---------- Backup ----------
const BK_KEYS = [SAVE_KEY], BK_UNDO = 'ultimo-abrigo-desfazer';
let reloading = false;
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
function collectBackup(pretty) {
  save();
  const data = {};
  for (const k of BK_KEYS) data[k] = lsGet(k);
  return JSON.stringify({ app: 'ultimo-abrigo', format: 1, exportedAt: new Date().toISOString(), data }, null, pretty ? 2 : 0);
}
function parseBackup(text) {
  let o;
  try { o = JSON.parse(String(text || '').trim()); } catch (e) { return null; }
  if (!o || o.app !== 'ultimo-abrigo' || !o.data || typeof o.data !== 'object') return null;
  try { if (!validState(JSON.parse(o.data[SAVE_KEY]))) return null; } catch (e) { return null; }
  return o;
}
function writeKeys(data) {
  for (const k of BK_KEYS) { const v = data[k]; if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, String(v)); }
}
function storeUndo() {
  const prev = {};
  for (const k of BK_KEYS) prev[k] = lsGet(k);
  localStorage.setItem(BK_UNDO, JSON.stringify(prev));
}
function reloadGame() { reloading = true; location.reload(); }
async function doBackup() {
  const name = `ultimo-abrigo-backup-${new Date().toISOString().slice(0, 10)}.json`;
  if (window.desktop) {
    try {
      const r = await window.desktop.saveBackup(collectBackup(true), name);
      if (r && r.ok) toast('Backup salvo em: ' + r.path, 'good');
      else if (r && r.error) toast('Não foi possível salvar o backup: ' + r.error, 'bad');
    } catch (e) { toast('Não foi possível salvar o backup.', 'bad'); }
    return;
  }
  const code = collectBackup(false);
  let ok = false;
  try { await navigator.clipboard.writeText(code); ok = true; } catch (e) {}
  openModal(`<h3>${ic('download')} Backup</h3><p>${ok ? 'O código do backup foi copiado. Guarde-o num lugar seguro.' : 'Copie o código abaixo (Ctrl+A e Ctrl+C) e guarde num lugar seguro.'}</p>
    <textarea class="code" readonly>${esc(code)}</textarea><p class="muted small">Para restaurar: Estatísticas › Restaurar backup › cole o código.</p>
    <div class="mbtns"><button type="button" class="btn go" data-a="mclose">Fechar</button></div>`);
}
function doRestore() {
  openModal(`<h3>${ic('upload')} Restaurar backup</h3><p>O progresso atual será substituído. Dá para desfazer depois.</p>
    ${window.desktop ? `<button type="button" class="btn wide" data-a="restorefile">${ic('box')} Escolher arquivo de backup</button><div class="sub">ou cole o código</div>` : ''}
    <textarea id="restoreText" class="code" placeholder="Cole aqui o código do backup (Ctrl+V)"></textarea>
    <div class="mbtns"><button type="button" class="btn ghost" data-a="mclose">Cancelar</button><button type="button" class="btn go" data-a="restoretext">Restaurar</button></div>`);
}
function applyRestore(text) {
  const b = parseBackup(text);
  if (!b) { toast('Isso não parece um backup do Último Abrigo. Nada foi alterado.', 'bad'); return; }
  try { storeUndo(); writeKeys(b.data); } catch (e) { toast('Não foi possível gravar os dados.', 'bad'); return; }
  toast('Backup restaurado! Recarregando…', 'good');
  setTimeout(reloadGame, 600);
}

// ---------- Actions ----------
const ACT = {
  tab: (d) => { UI.tab = d.v; try { localStorage.setItem('ultimo-abrigo-aba', d.v); } catch (e) {} window.scrollTo(0, 0); },
  save: () => {
    if (BATTLE) return toast('O jogo salva assim que a horda acabar.', 'info');
    if (save()) toast('Jogo salvo.', 'good'); else toast('Não foi possível salvar.', 'bad');
  },
  sound: () => { S.sound = !S.sound; if (S.sound) { audio(); sfx('click'); } },
  manual: (d) => { startManual(d.v); },
  build: (d) => { build(d.v); },
  callhorde: () => confirmBox('Enfrentar a horda agora?', `A onda ${S.horde.wave} chega imediatamente e as recompensas aumentam 20%.`, 'Enfrentar', () => callHordeNow(), true),
  speed: (d) => { UI.speed = Number(d.v); },
  resolve: () => resolveNow(),
  sel: (d) => {
    UI.sel = d.v;
    if (window.innerWidth <= 1100) setTimeout(() => { const p = document.querySelector('.place'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
  },
  squad: (d) => {
    const id = Number(d.id);
    if (UI.squad.includes(id)) UI.squad = UI.squad.filter((x) => x !== id);
    else if (UI.squad.length < SQUAD_MAX) UI.squad.push(id);
    else toast(`No máximo ${SQUAD_MAX} pessoas por expedição.`, 'bad');
  },
  send: () => { if (startExp(UI.sel, UI.squad, S.auto[UI.sel])) { toast(`Expedição enviada: ${PLACES[UI.sel].n}.`, 'good'); UI.squad = []; } },
  auto: (d, el) => { S.auto[d.v] = el.checked; },
  job: (d, el) => { assign(Number(d.id), el.value); },
  eqpick: (d) => openModal(equipModal(Number(d.id), d.slot)),
  equip: (d) => { equip(Number(d.id), Number(d.v)); closeModal(); },
  unequip: (d) => { unequip(Number(d.id), d.slot); closeModal(); },
  treat: (d) => treat(Number(d.id)),
  expel: (d) => { const s = survById(Number(d.id)); if (s) confirmBox(`Expulsar ${esc(s.name)}?`, 'A pessoa vai embora para sempre. Os equipamentos ficam no inventário.', 'Expulsar', () => expel(s.id), true); },
  accept: (d) => acceptPending(Number(d.v)),
  dismiss: (d) => dismissPending(Number(d.v)),
  radio: () => useRadio(),
  artab: (d) => { UI.artab = d.v; },
  craft: (d) => startCraft(d.kind, d.v),
  cancelcraft: (d) => cancelCraft(Number(d.v)),
  upgrade: (d) => upgradeItem(Number(d.v)),
  repair: (d) => repairItem(Number(d.v)),
  scrap: (d) => {
    const it = itemById(Number(d.v));
    if (!it) return;
    const back = Object.keys(scrapValue(it)).map((k) => `${scrapValue(it)[k]} ${resName(k).toLowerCase()}`).join(', ') || 'nada';
    confirmBox(`Desmontar ${esc(itemName(it))}?`, `Você recupera: ${esc(back)}.`, 'Desmontar', () => scrapItem(it.id), it.r >= 2);
  },
  research: (d) => startResearch(d.v),
  cancelres: () => cancelResearch(),
  perk: (d) => buyPerk(d.v),
  prestige: () => confirmBox('Fundar uma nova colônia?', `Você recomeça do zero com <b>+${prestigeGain()} pontos de Esperança</b>. Construções, recursos, sobreviventes, itens e pesquisas serão perdidos. Conquistas, estatísticas e bônus de prestígio continuam.`, 'Fundar nova colônia', () => { doPrestige(); RATES = computeRates(); UI.tab = 'stats'; }, true),
  report: (d) => { const r = S.reports[Number(d.v)]; if (r) openModal(reportModal(r)); },
  backup: () => doBackup(),
  restore: () => doRestore(),
  restorefile: async () => {
    try {
      const r = await window.desktop.openBackup();
      if (!r || !r.ok) { if (r && r.error) toast('Não foi possível abrir: ' + r.error, 'bad'); return; }
      closeModal();
      applyRestore(r.text);
    } catch (e) { toast('Não foi possível abrir o arquivo.', 'bad'); }
  },
  restoretext: () => { const t = $('restoreText'); const v = t ? t.value : ''; closeModal(); applyRestore(v); },
  undo: () => confirmBox('Desfazer a restauração?', 'O progresso de antes da última restauração (ou reinício) volta.', 'Desfazer', () => {
    try {
      const prev = JSON.parse(localStorage.getItem(BK_UNDO));
      if (!prev) return;
      writeKeys(prev);
      localStorage.removeItem(BK_UNDO);
      reloadGame();
    } catch (e) { toast('Não foi possível desfazer.', 'bad'); }
  }),
  reset: () => confirmBox('Reiniciar a partida?', 'Todo o progresso desta partida será apagado, inclusive prestígio e conquistas. Dá para desfazer em Estatísticas › Desfazer restauração.', 'Apagar e reiniciar', () => {
    try { save(); storeUndo(); localStorage.removeItem(SAVE_KEY); } catch (e) {}
    reloadGame();
  }, true),
  mclose: () => closeModal(),
  mok: () => { const fn = UI.confirmFn; nextModal(); if (fn) fn(); },
};
function handle(el, e) {
  const fn = ACT[el.dataset.a];
  if (!fn) return;
  audio();
  const r = fn(el.dataset, el, e);
  if (r && r.then) r.then(() => render());
  RATES = computeRates();
  render();
}
document.addEventListener('click', (e) => {
  if (e.target === $('modal')) { if (UI.closable) closeModal(); return; }
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type === 'checkbox')) return;
  handle(el, e);
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el || (el.tagName !== 'SELECT' && el.tagName !== 'INPUT')) return;
  handle(el, e);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && UI.modalOpen && UI.closable) { closeModal(); render(); }
});
