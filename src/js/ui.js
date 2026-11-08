'use strict';
// ================= Interface =================
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const UIS = { build: false, buildSel: 0, buildCat: 0, panel: null, target: null, buildWhy: null, surv: null, confirm: null, tutHidden: false, benchTier: 1, queue: [] };
const catItems = (c) => BUILD.map((b, i) => i).filter((i) => BUILD[i].cat === c);
const img = (k, cls = 'ico') => `<img class="${cls}" src="${iconURL(k)}" alt="">`;
const fmtTime = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function costHTML(c) {
  return Object.keys(c).map((k) => `<span class="cost${S.res[k] >= c[k] ? '' : ' miss'}">${img(k)}${c[k]}</span>`).join('');
}
function statLine(base, it) {
  const d = ITEMS[base], m = it ? RAR[it.r].m : 1, out = [];
  if (d.kind === 'axe' || d.kind === 'pick') out.push(`Coleta ${d.power}`);
  if (d.dmg) out.push(`Dano ${Math.round(d.dmg * m)}${d.pellets ? '×' + d.pellets : ''}`);
  if (d.spd) out.push(`Vel ${d.spd}`);
  if (d.armor) out.push(`Proteção ${Math.round(d.armor * m)}`);
  if (d.kind === 'gun') out.push('usa munição');
  return out.join(' · ');
}

// ---------- HUD ----------
function renderHUD() {
  const p = S.player;
  $('vitals').innerHTML = `
    <div class="vit" title="Vida"><i class="vi hp"></i><div class="bar"><b style="width:${clamp(p.hp, 0, 100)}%" class="hpf${p.hp < 30 ? ' low' : ''}"></b></div><span>${Math.ceil(Math.max(0, p.hp))}</span></div>
    <div class="vit" title="Fome (F para comer)"><i class="vi food"></i><div class="bar"><b style="width:${p.hunger}%" class="hgf${p.hunger < 25 ? ' low' : ''}"></b></div><span>${Math.ceil(p.hunger)}</span></div>
    <div class="vit" title="Estamina (Shift corre)"><i class="vi stam"></i><div class="bar"><b style="width:${clamp(p.stam, 0, 100)}%" class="stf${p.tired ? ' low' : ''}"></b></div><span>${Math.ceil(p.stam)}</span></div>
    <div class="res">${RES_ORDER.filter((k) => S.res[k] > 0 || ['madeira', 'pedra', 'sucata', 'comida'].includes(k)).map((k) => `<span title="${RES[k]} (limite ${capOf(k)})" class="${S.res[k] >= capOf(k) ? 'full' : ''}">${img(k)}${S.res[k]}</span>`).join('')}</div>`;
  const night = isNight();
  const toNight = (NIGHT_START - dayFrac()) * DAY_LEN, toDay = (1 - dayFrac()) * DAY_LEN;
  const th = threatOf(S.day);
  $('clockt').innerHTML = `<b>Dia ${S.day}</b><span>${clockText()}</span>`;
  $('threat').innerHTML = `Ameaça <b style="color:${th[2]}">${th[1]}</b>`;
  $('phase').innerHTML = night ? `<span class="nt">Amanhece em ${fmtTime(toDay)}</span>` : toNight < 60 ? `<span class="warn">A noite chega em ${fmtTime(toNight)}</span>` : `<span>Noite em ${fmtTime(toNight)}</span>`;
  $('phase').className = night ? 'phase night' : toNight < 60 ? 'phase soon' : 'phase';
  // tutorial
  const st = TUTORIAL[S.tut];
  const tut = $('tut');
  if (st && !UIS.tutHidden) {
    const pr = st.p ? st.p() : null;
    tut.classList.remove('hidden');
    tut.innerHTML = `<div class="th"><span>Tutorial ${S.tut + 1}/${TUTORIAL.length}</span><button type="button" data-a="tuthide" title="Esconder">×</button></div><p>${esc(st.t)}</p>${pr ? `<div class="bar thin"><b style="width:${clamp(pr[0] / pr[1] * 100, 0, 100)}%"></b></div><small>${Math.min(pr[0], pr[1])}/${pr[1]}</small>` : ''}`;
  } else tut.classList.add('hidden');
  // hotbar
  $('hotbar').innerHTML = S.hotbar.map((id, i) => {
    const it = id && itemById(id);
    const f = it ? it.dur / itemMax(it) : 0;
    const gun = it && ITEMS[it.base].kind === 'gun';
    return `<button type="button" class="slot${S.sel === i ? ' on' : ''}" data-a="slot" data-v="${i}" title="${it ? esc(ITEMS[it.base].n) + ' (' + RAR[it.r].n + ')' : 'Mãos'}" ${it ? `style="--rc:${RAR[it.r].c}"` : ''}>
      <em>${i + 1}</em>${it ? img(it.base, 'big') : ''}${gun ? `<i class="amm${S.res.municao ? '' : ' out'}">${S.res.municao}</i>` : ''}${it ? `<i class="dur" style="width:${f * 100}%;background:${f > 0.3 ? '#9ac46a' : '#e0604f'}"></i>` : ''}</button>`;
  }).join('');
  const it = heldItem();
  const held = $('held');
  if (it && ITEMS[it.base].kind === 'gun') {
    const n = S.res.municao;
    held.innerHTML = `<span style="color:${RAR[it.r].c}">${esc(ITEMS[it.base].n)}</span><span class="ammo${n ? (n < 10 ? ' few' : '') : ' out'}">${img('municao')}<b>${n}</b> ${n === 1 ? 'bala' : 'balas'}</span>`;
  } else held.innerHTML = it ? `<span style="color:${RAR[it.r].c}">${esc(ITEMS[it.base].n)}${it.r ? ' · ' + RAR[it.r].n : ''}</span>${ITEMS[it.base].kind === 'hammer' ? '<span class="hint">segure o clique numa construção danificada</span>' : ''}` : 'Mãos';
  // build bar: three tabs, digits pick inside the open tab
  const bb = $('buildbar');
  if (UIS.build) {
    bb.classList.remove('hidden');
    if (BUILD[UIS.buildSel].cat !== UIS.buildCat) UIS.buildSel = catItems(UIS.buildCat)[0];
    const b = BUILD[UIS.buildSel], lvl = benchLevel(), lockB = b.tier && lvl < b.tier;
    bb.innerHTML = `<div class="bleft"><div class="btabs">${BUILD_CATS.map((c, i) => `<button type="button" class="${i === UIS.buildCat ? 'on' : ''}" data-a="bcat" data-v="${i}">${c}</button>`).join('')}<span class="muted">Q troca</span></div>
      <div class="bitems">${catItems(UIS.buildCat).map((i, n) => { const x = BUILD[i]; return `<button type="button" class="bi${i === UIS.buildSel ? ' on' : ''}${x.tier && lvl < x.tier ? ' lock' : ''}${canPay(x.cost) ? '' : ' poor'}" data-a="bsel" data-v="${i}" title="${esc(OBJ[x.o].n)}"><em>${n + 1}</em><img src="${iconURL(x.o)}" alt=""></button>`; }).join('')}</div></div>
      <div class="binfo"><b>${OBJ[b.o].n}</b><span class="costs">${costHTML(b.cost)}</span><small>${esc(b.d)}${lockB ? ` <span class="warn">Precisa da ${BENCH_NAMES[b.tier]}.</span>` : ''}</small>
      <small class="keys">Clique: construir · Botão direito: desmontar (devolve metade) · B: sair</small></div>`;
  } else bb.classList.add('hidden');
  // interaction prompt
  UIS.target = UIS.build || p.hp <= 0 ? null : interactTarget();
  const lab = interactLabel(UIS.target);
  const pr = $('prompt');
  if (lab) { pr.classList.remove('hidden'); pr.innerHTML = `<kbd>E</kbd> ${esc(lab)}`; } else pr.classList.add('hidden');
  // death
  const de = $('death');
  if (p.hp <= 0) {
    de.classList.remove('hidden');
    const lost = S.lastLoss || {};
    de.innerHTML = `<h2>Você caiu</h2><p>${Object.keys(lost).length ? 'Perdeu ' + Object.keys(lost).map((k) => `${lost[k]} ${RES[k].toLowerCase()}`).join(', ') + '.' : ''}</p><p class="muted">Voltando ${countObj(O.BED) ? 'na sua cama' : 'ao acampamento'} em ${Math.max(0, Math.ceil(S.deathTimer))}…</p>`;
  } else de.classList.add('hidden');
}

// ---------- Messages ----------
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  $('toasts').appendChild(el);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  setTimeout(() => el.classList.add('out'), 3800);
  setTimeout(() => el.remove(), 4300);
}
function drainMessages() { while (MSG.length) { const m = MSG.shift(); toast(m.msg, m.type); } }

// ---------- Panels ----------
function openPanel(kind, data) {
  UIS.panel = kind;
  if (data !== undefined) UIS.surv = data;
  KEYS.clear(); mouseDown = false;
  renderPanel();
  $('panel').classList.remove('hidden');
}
function closePanel() {
  if (UIS.panel === 'patch') markPatchSeen();
  UIS.panel = null; UIS.confirm = null; $('panel').classList.add('hidden');
  if (UIS.queue.length) openPanel(UIS.queue.shift());
}
// ---------- Update notes ("Patch de atualização") ----------
const PATCH_SEEN = 'ultimo-abrigo-novidades-vistas';
function markPatchSeen() { try { localStorage.setItem(PATCH_SEEN, GAME_VERSION); } catch (e) {} }
function patchUnseen() { try { return localStorage.getItem(PATCH_SEEN) !== GAME_VERSION; } catch (e) { return false; } }
function patchPanel() {
  const cur = PATCHES[0];
  const older = PATCHES.slice(1);
  const list = (p) => p.groups.map(([g, items]) => `<h3>${esc(g)}</h3><ul class="pl">${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`).join('');
  return `<div class="ph"><div><small class="kicker">Patch de atualização · versão ${esc(cur.v)}</small><h2>${esc(cur.title)}</h2></div><button type="button" class="x" data-a="close" title="Fechar (Esc)">×</button></div>
    ${list(cur)}
    ${older.map((p) => `<details><summary>Versão ${esc(p.v)}: ${esc(p.title)}</summary>${list(p)}</details>`).join('')}
    <button type="button" class="btn go wide" data-a="close">Jogar</button>`;
}
function renderPanel() {
  const k = UIS.panel;
  const box = $('pbox');
  box.className = 'pbox ' + k;
  if (UIS.confirm) { box.innerHTML = UIS.confirm.html; return; }
  if (k === 'bench') box.innerHTML = benchPanel();
  else if (k === 'inv') box.innerHTML = invPanel();
  else if (k === 'surv') box.innerHTML = survPanel();
  else if (k === 'menu') box.innerHTML = menuPanel();
  else if (k === 'map') { box.innerHTML = `<div class="ph"><h2>Mapa</h2><button type="button" class="x" data-a="close">×</button></div><canvas id="bigmap" width="600" height="600"></canvas><p class="muted small">Amarelo: sobreviventes para recrutar · Laranja: sua base · Branco: você</p>`; drawBigMap(); }
  else if (k === 'help' || k === 'welcome') box.innerHTML = helpPanel(k === 'welcome');
  else if (k === 'patch') box.innerHTML = patchPanel();
  else if (k === 'backup') box.innerHTML = UIS.backupHTML || '';
}
function header(t, sub) { return `<div class="ph"><div><h2>${t}</h2>${sub ? `<small>${sub}</small>` : ''}</div><button type="button" class="x" data-a="close" title="Fechar (Esc)">×</button></div>`; }
// Each bench makes its own recipes and those of the simpler benches.
function benchPanel() {
  const tier = UIS.benchTier;
  const lockLabel = (t) => (t === 2 ? 'Bancada de pedra' : 'Oficina de metal');
  const rec = (key) => {
    const d = ITEMS[key], lock = d.tier > tier, ok = !lock && canPay(d.cost);
    return `<div class="rec${lock ? ' lock' : ''}">${img(key, 'big')}<div class="rt"><b>${d.n}</b><small>${statLine(key)}</small><span class="costs">${costHTML(d.cost)}</span></div>
      <button type="button" class="btn${ok ? ' go' : ''}" data-a="craft" data-v="${key}"${ok ? '' : ' disabled'}>${lock ? lockLabel(d.tier) : 'Fazer'}</button></div>`;
  };
  const make = (m) => {
    const lock = m.tier > tier, ok = !lock && canPay(m.cost);
    return `<div class="rec${lock ? ' lock' : ''}">${img(m.id, 'big')}<div class="rt"><b>${m.n}</b><span class="costs">${costHTML(m.cost)}</span></div>
      <button type="button" class="btn${ok ? ' go' : ''}" data-a="make" data-v="${m.id}"${ok ? '' : ' disabled'}>${lock ? lockLabel(m.tier) : 'Fazer'}</button></div>`;
  };
  const kinds = { Ferramentas: ['axe', 'pick', 'hammer'], Armas: ['melee', 'gun'], 'Proteção': ['head', 'body'] };
  const group = (title) => {
    const keys = Object.keys(ITEMS).filter((k) => kinds[title].includes(ITEMS[k].kind)).sort((a, b) => ITEMS[a].tier - ITEMS[b].tier);
    // show what this bench makes, plus a peek at the next bench's recipes
    const shown = keys.filter((k) => ITEMS[k].tier <= tier + 1);
    return `<h3>${title}</h3><div class="recs">${shown.map(rec).join('')}</div>`;
  };
  const next = tier < 3 ? BUILD.find((b) => b.o === BENCH_OBJ[tier + 1]) : null;
  return `${header(BENCH_NAMES[tier], 'A raridade é sorteada ao fabricar; bancadas melhores dão mais sorte')}
    ${next ? `<div class="upg"><span>Próxima: ${OBJ[next.o].n}</span><span class="costs">${costHTML(next.cost)}</span><small class="muted">Construa com B, aba Base</small></div>` : ''}
    <div class="cols2"><div>${group('Ferramentas')}${group('Proteção')}</div>
    <div>${group('Armas')}<h3>Suprimentos</h3><div class="recs">${MAKES.filter((m) => m.tier <= tier + 1).map(make).join('')}</div></div></div>`;
}
function invPanel() {
  const eq = (id, label) => { const it = id && itemById(id); return `<div class="eq">${it ? img(it.base, 'big') : '<span class="emp"></span>'}<div><small>${label}</small><b style="color:${it ? RAR[it.r].c : ''}">${it ? ITEMS[it.base].n : 'Nada'}</b></div>${it ? `<button type="button" class="btn sm" data-a="unwear" data-v="${it.id}">Tirar</button>` : ''}</div>`; };
  const rows = [...S.items].sort((a, b) => b.r - a.r).map((it) => {
    const d = ITEMS[it.base], wearable = d.kind === 'head' || d.kind === 'body';
    const inBar = S.hotbar.includes(it.id), worn = S.head === it.id || S.body === it.id, holder = S.surv.find((s) => s.item === it.id);
    return `<div class="irow">${img(it.base, 'big')}<div class="rt"><b style="color:${RAR[it.r].c}">${d.n}</b><small>${RAR[it.r].n} · ${statLine(it.base, it)} · Durabilidade ${it.dur}/${itemMax(it)}${holder ? ' · com ' + esc(holder.name) : ''}</small></div>
      <div class="ia">${wearable ? (worn ? '<span class="tag">Vestido</span>' : `<button type="button" class="btn sm" data-a="wear" data-v="${it.id}">Vestir</button>`) : (inBar ? `<span class="tag">Barra ${S.hotbar.indexOf(it.id) + 1}</span>` : `<button type="button" class="btn sm" data-a="tobar" data-v="${it.id}">Pôr na barra ${S.sel + 1}</button>`)}
      <button type="button" class="btn sm ghost" data-a="scrap" data-v="${it.id}" title="Desmontar: devolve 40% dos materiais">Desmontar</button></div></div>`;
  }).join('') || '<p class="muted">Nenhum item. Fabrique na bancada ou procure em caixas.</p>';
  const res = RES_ORDER.map((k) => `<span title="${RES[k]}">${img(k)}<b>${S.res[k]}</b><small>/${capOf(k) > 9000 ? '∞' : capOf(k)}</small></span>`).join('');
  return `${header('Inventário', 'Tab para fechar')}
    <div class="eqs">${eq(S.head, 'Cabeça')}${eq(S.body, 'Corpo')}<div class="eq"><div><small>Proteção total</small><b>${Math.round(armorValue())}</b></div></div></div>
    <div class="resall">${res}</div><h3>Itens</h3><div class="ilist">${rows}</div>`;
}
function survPanel() {
  const s = S.surv.find((x) => x.id === UIS.surv);
  if (!s) return header('Sobrevivente') + '<p>Essa pessoa não está mais aqui.</p>';
  const it = s.item && itemById(s.item);
  const weapons = S.items.filter((i) => ['melee', 'gun', 'axe', 'pick'].includes(ITEMS[i.base].kind) && i.id !== s.item);
  return `${header(esc(s.name), `${s.spec} · Vida ${Math.round(s.hp)}/100${s.bed === null ? ' · <span class="warn">sem cama</span>' : ''}`)}
    <h3>Função</h3><div class="specs">${Object.keys(SPECS).map((k) => `<button type="button" class="spec${s.spec === k ? ' on' : ''}" data-a="spec" data-v="${k}"><b>${k}</b><small>${SPECS[k]}</small></button>`).join('')}</div>
    <h3>Arma</h3><p>${it ? `${img(it.base)} <b style="color:${RAR[it.r].c}">${ITEMS[it.base].n}</b> <button type="button" class="btn sm" data-a="takeback">Pegar de volta</button>` : '<span class="muted">Sem arma (luta com as mãos).</span>'}</p>
    ${weapons.length ? `<div class="give">${weapons.map((w) => `<button type="button" class="btn sm" data-a="give" data-v="${w.id}">${img(w.base)} ${ITEMS[w.base].n}</button>`).join('')}</div>` : ''}
    <p class="muted small">Cada sobrevivente come 2 de comida por dia. À noite, quem não é Guarda dorme na cama.</p>`;
}
function menuPanel() {
  return `${header('Pausa')}
    <div class="menu">
      <button type="button" class="btn go" data-a="close">Continuar</button>
      <button type="button" class="btn" data-a="save">Salvar agora</button>
      <button type="button" class="btn" data-a="openmap">Mapa (M)</button>
      <button type="button" class="btn" data-a="help">Controles</button>
      <button type="button" class="btn" data-a="patch">Novidades da versão ${esc(GAME_VERSION)}</button>
      <button type="button" class="btn" data-a="sound">Som: ${S.sound ? 'ligado' : 'desligado'}</button>
      <h3>Backup</h3>
      <button type="button" class="btn" data-a="backup">Fazer backup</button>
      <button type="button" class="btn" data-a="restore">Restaurar backup</button>
      ${lsGet(BK_UNDO) ? '<button type="button" class="btn ghost" data-a="undo">Desfazer restauração</button>' : ''}
      <h3>Partida</h3>
      <p class="muted small">Dia ${S.day} · ${S.stats.kills} zumbis abatidos · ${S.surv.length} sobreviventes · ${S.stats.crafted} itens fabricados</p>
      <button type="button" class="btn danger" data-a="reset">Começar um mundo novo</button>
    </div>`;
}
function helpPanel(welcome) {
  return `${welcome ? `<div class="ph"><div><h2>Último Abrigo</h2><small>Sobreviva, construa, resista.</small></div></div><p>O mundo caiu. Você acordou num acampamento no meio da floresta, com uma fogueira e nada mais. A leste há uma cidade em ruínas, cheia de suprimentos e de zumbis. À noite, eles vêm atrás de você.</p>` : header('Controles')}
    <div class="ctrl">
      <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>Andar (<kbd>Shift</kbd> corre e gasta estamina)</span>
      <span><kbd>Mouse</kbd></span><span>Segurar o botão esquerdo: cortar, quebrar, atacar, atirar e consertar (com o martelo)</span>
      <span><kbd>1</kbd>–<kbd>6</kbd></span><span>Trocar o item na mão (ou a roda do mouse)</span>
      <span><kbd>E</kbd></span><span>Usar: abrir caixas, bancada, colher, recrutar, alimentar animais</span>
      <span><kbd>B</kbd></span><span>Construir (<kbd>Q</kbd> troca de aba, botão direito desmonta)</span>
      <span><kbd>Tab</kbd></span><span>Inventário</span>
      <span><kbd>F</kbd> / <kbd>H</kbd></span><span>Comer / usar curativo</span>
      <span><kbd>M</kbd></span><span>Mapa</span>
      <span><kbd>Esc</kbd></span><span>Pausa, salvar e backup</span>
    </div>
    ${welcome ? '<button type="button" class="btn go wide" data-a="close">Começar</button>' : ''}`;
}
function drawBigMap() {
  const c = $('bigmap');
  if (!c) return;
  MM.t = 0;
  drawMinimap(0);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(MM.c, 0, 0, c.width, c.height);
  const k = c.width / WW;
  g.font = 'bold 13px Bahnschrift, "Segoe UI", sans-serif';
  g.textAlign = 'center';
  for (const p of W.pois) { g.fillStyle = 'rgba(0,0,0,.65)'; g.fillText(p.n, (p.x + p.w / 2) * k + 1, p.y * k - 3); g.fillStyle = '#f2e6c8'; g.fillText(p.n, (p.x + p.w / 2) * k, p.y * k - 4); }
  g.fillStyle = '#f0c24a';
  for (const n of S.npcs) g.fillRect(n.x / TS * k - 3, n.y / TS * k - 3, 6, 6);
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(S.player.x / TS * k, S.player.y / TS * k, 5, 0, 7); g.fill();
}

// ---------- Sound ----------
let AC = null;
function audio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
  if (AC && AC.state === 'suspended') AC.resume().catch(() => {});
  return AC;
}
function tone(f, d, type = 'square', vol = 0.04, at = 0, slide = 0) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + 0.02);
}
function noise(d, vol = 0.05, at = 0, hp = 800) {
  const a = audio();
  if (!a) return;
  const len = Math.floor(a.sampleRate * d), buf = a.createBuffer(1, len, a.sampleRate), ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = hp;
  s.buffer = buf; g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(a.destination); s.start(a.currentTime + at);
}
let lastSfx = {};
function sfx(n) {
  if (!S || !S.sound || document.hidden) return;
  const now = performance.now();
  if (lastSfx[n] && now - lastSfx[n] < 45) return;
  lastSfx[n] = now;
  switch (n) {
    case 'chop': noise(0.07, 0.07, 0, 300); tone(140, 0.06, 'triangle', 0.05); break;
    case 'mine': noise(0.06, 0.06, 0, 1500); tone(420, 0.05, 'square', 0.02); break;
    case 'hit': noise(0.08, 0.08, 0, 500); tone(110, 0.08, 'sawtooth', 0.03); break;
    case 'shoot': noise(0.12, 0.12, 0, 900); tone(160, 0.1, 'square', 0.04, 0, -100); break;
    case 'shootSoft': noise(0.08, 0.05, 0, 1200); break;
    case 'hurt': tone(220, 0.15, 'sawtooth', 0.05, 0, -120); break;
    case 'zdie': tone(120, 0.25, 'sawtooth', 0.04, 0, -60); noise(0.15, 0.04, 0, 300); break;
    case 'build': tone(330, 0.06, 'square', 0.03); tone(440, 0.08, 'square', 0.03, 0.06); break;
    case 'break': noise(0.2, 0.07, 0, 400); break;
    case 'craft': [523, 659, 784].forEach((f, i) => tone(f, 0.08, 'triangle', 0.05, i * 0.06)); break;
    case 'open': tone(300, 0.06, 'triangle', 0.05); tone(600, 0.08, 'triangle', 0.05, 0.06); break;
    case 'pickup': tone(660, 0.06, 'triangle', 0.04); break;
    case 'eat': tone(260, 0.05, 'square', 0.03); tone(200, 0.05, 'square', 0.03, 0.08); break;
    case 'good': tone(523, 0.1, 'triangle', 0.05); tone(784, 0.14, 'triangle', 0.05, 0.1); break;
    case 'alarm': for (let i = 0; i < 3; i++) tone(180, 0.35, 'sawtooth', 0.035, i * 0.5, 60); break;
    case 'lose': [330, 262, 196].forEach((f, i) => tone(f, 0.25, 'sawtooth', 0.04, i * 0.18)); break;
    case 'thud': noise(0.06, 0.03, 0, 200); break;
    case 'click': tone(400, 0.04, 'square', 0.02); break;
    case 'repair': tone(520, 0.04, 'square', 0.03); noise(0.04, 0.05, 0, 2500); break;
    case 'boom': noise(0.5, 0.16, 0, 120); tone(70, 0.4, 'sawtooth', 0.06, 0, -40); break;
    case 'fuse': noise(0.3, 0.03, 0, 4000); break;
    case 'scream': tone(700, 0.5, 'sawtooth', 0.04, 0, 500); tone(520, 0.5, 'sawtooth', 0.03, 0.05, 300); break;
    default: break;
  }
}

// ---------- Backup ----------
const BK_KEYS = [SAVE_KEY], BK_UNDO = 'ultimo-abrigo-mundo-desfazer';
let reloading = false;
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
function collectBackup() {
  save();
  const data = {};
  for (const k of BK_KEYS) data[k] = lsGet(k);
  return JSON.stringify({ app: 'ultimo-abrigo-mundo', format: 1, exportedAt: new Date().toISOString(), data });
}
function parseBackup(text) {
  let o;
  try { o = JSON.parse(String(text || '').trim()); } catch (e) { return null; }
  if (!o || o.app !== 'ultimo-abrigo-mundo' || !o.data) return null;
  try { if (!validSave(JSON.parse(o.data[SAVE_KEY]))) return null; } catch (e) { return null; }
  return o;
}
function writeKeys(data) { for (const k of BK_KEYS) { const v = data[k]; if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, String(v)); } }
function storeUndo() { const prev = {}; for (const k of BK_KEYS) prev[k] = lsGet(k); localStorage.setItem(BK_UNDO, JSON.stringify(prev)); }
function reloadGame() { reloading = true; location.reload(); }
async function doBackup() {
  const name = `ultimo-abrigo-backup-${new Date().toISOString().slice(0, 10)}.json`;
  if (window.desktop) {
    try {
      const r = await window.desktop.saveBackup(collectBackup(), name);
      if (r && r.ok) toast('Backup salvo em: ' + r.path, 'good');
      else if (r && r.error) toast('Não foi possível salvar o backup: ' + r.error, 'bad');
    } catch (e) { toast('Não foi possível salvar o backup.', 'bad'); }
    return;
  }
  const code = collectBackup();
  let ok = false;
  try { await navigator.clipboard.writeText(code); ok = true; } catch (e) {}
  UIS.backupHTML = `${header('Backup')}<p>${ok ? 'O código do backup foi copiado. Guarde-o num lugar seguro.' : 'Copie o código abaixo (Ctrl+A e Ctrl+C) e guarde num lugar seguro.'}</p><textarea class="code" readonly>${esc(code)}</textarea>`;
  openPanel('backup');
}
function doRestore() {
  UIS.backupHTML = `${header('Restaurar backup', 'O mundo atual será substituído. Dá para desfazer depois.')}
    ${window.desktop ? '<button type="button" class="btn wide" data-a="restorefile">Escolher arquivo de backup</button><h3>ou cole o código</h3>' : ''}
    <textarea id="restoreText" class="code" placeholder="Cole aqui o código do backup (Ctrl+V)"></textarea>
    <button type="button" class="btn go wide" data-a="restoretext">Restaurar</button>`;
  openPanel('backup');
}
function applyRestore(text) {
  const b = parseBackup(text);
  if (!b) { toast('Isso não parece um backup do Último Abrigo (mundo aberto). Nada foi alterado.', 'bad'); return; }
  try { storeUndo(); writeKeys(b.data); } catch (e) { toast('Não foi possível gravar os dados.', 'bad'); return; }
  reloadGame();
}
function confirmBox(title, text, ok, fn) {
  UIS.confirm = { fn, html: `${header(title)}<p>${text}</p><div class="row"><button type="button" class="btn ghost" data-a="cno">Cancelar</button><button type="button" class="btn danger" data-a="cyes">${ok}</button></div>` };
  if (!UIS.panel) openPanel('menu'); else renderPanel();
}

// ---------- Actions from buttons ----------
const ACT = {
  close: () => closePanel(),
  tuthide: () => { UIS.tutHidden = true; toast('Tutorial escondido. Ele volta ao reabrir o jogo.'); },
  slot: (d) => { S.sel = Number(d.v); },
  bsel: (d) => { UIS.buildSel = Number(d.v); },
  bcat: (d) => { UIS.buildCat = Number(d.v); UIS.buildSel = catItems(UIS.buildCat)[0]; },
  craft: (d) => { craftItem(d.v, UIS.benchTier); renderPanel(); },
  make: (d) => { craftMake(MAKES.find((m) => m.id === d.v), UIS.benchTier); renderPanel(); },
  patch: () => openPanel('patch'),
  wear: (d) => { const it = itemById(Number(d.v)); if (!it) return; if (ITEMS[it.base].kind === 'head') S.head = it.id; else S.body = it.id; renderPanel(); },
  unwear: (d) => { const id = Number(d.v); if (S.head === id) S.head = null; if (S.body === id) S.body = null; renderPanel(); },
  tobar: (d) => { const id = Number(d.v); S.hotbar = S.hotbar.map((h) => (h === id ? null : h)); for (const s of S.surv) if (s.item === id) s.item = null; S.hotbar[S.sel] = id; renderPanel(); },
  scrap: (d) => { const it = itemById(Number(d.v)); if (!it) return; confirmBox(`Desmontar ${ITEMS[it.base].n}?`, 'Você recupera 40% dos materiais.', 'Desmontar', () => scrapItem(it.id)); },
  spec: (d) => { const s = S.surv.find((x) => x.id === UIS.surv); if (s) { s.spec = d.v; s.task = null; s.path = null; } renderPanel(); },
  give: (d) => { const s = S.surv.find((x) => x.id === UIS.surv); const id = Number(d.v); if (!s) return; for (const o of S.surv) if (o.item === id) o.item = null; S.hotbar = S.hotbar.map((h) => (h === id ? null : h)); s.item = id; renderPanel(); },
  takeback: () => { const s = S.surv.find((x) => x.id === UIS.surv); if (!s || !s.item) return; const id = s.item; s.item = null; const e = S.hotbar.indexOf(null); if (e >= 0) S.hotbar[e] = id; renderPanel(); },
  save: () => toast(save() ? 'Jogo salvo.' : 'Não foi possível salvar.', 'good'),
  sound: () => { S.sound = !S.sound; renderPanel(); },
  openmap: () => openPanel('map'),
  help: () => openPanel('help'),
  backup: () => doBackup(),
  restore: () => doRestore(),
  restorefile: async () => {
    try {
      const r = await window.desktop.openBackup();
      if (!r || !r.ok) { if (r && r.error) toast('Não foi possível abrir: ' + r.error, 'bad'); return; }
      applyRestore(r.text);
    } catch (e) { toast('Não foi possível abrir o arquivo.', 'bad'); }
  },
  restoretext: () => { const t = $('restoreText'); applyRestore(t ? t.value : ''); },
  undo: () => confirmBox('Desfazer a restauração?', 'O mundo de antes da última restauração (ou do último mundo novo) volta.', 'Desfazer', () => {
    try { const prev = JSON.parse(localStorage.getItem(BK_UNDO)); if (!prev) return; writeKeys(prev); localStorage.removeItem(BK_UNDO); reloadGame(); } catch (e) { toast('Não foi possível desfazer.', 'bad'); }
  }),
  reset: () => confirmBox('Começar um mundo novo?', 'O mundo atual será apagado. Dá para voltar em Pausa › Desfazer restauração.', 'Mundo novo', () => {
    try { save(); storeUndo(); localStorage.removeItem(SAVE_KEY); } catch (e) {}
    reloadGame();
  }),
  cno: () => { UIS.confirm = null; renderPanel(); },
  cyes: () => { const fn = UIS.confirm && UIS.confirm.fn; UIS.confirm = null; if (fn) fn(); if (UIS.panel) renderPanel(); },
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  audio();
  const fn = ACT[el.dataset.a];
  if (fn) { fn(el.dataset, el); sfx('click'); renderHUD(); }
});
$('panel').addEventListener('mousedown', (e) => { if (e.target === $('panel')) closePanel(); });

// ---------- Keyboard and mouse ----------
function onKey(e) {
  if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
  audio();
  const c = e.code;
  if (c === 'Escape') {
    if (UIS.panel) closePanel();
    else if (UIS.build) UIS.build = false;
    else openPanel('menu');
    e.preventDefault();
    return;
  }
  if (c === 'Tab') { e.preventDefault(); if (UIS.panel === 'inv') closePanel(); else if (!UIS.panel) openPanel('inv'); return; }
  if (UIS.panel) { if (c === 'KeyM' && UIS.panel === 'map') closePanel(); if (c === 'KeyE' && UIS.panel === 'bench') closePanel(); if (c === 'Enter' && (UIS.panel === 'patch' || UIS.panel === 'welcome')) closePanel(); return; }
  if (S.player.hp <= 0) return;
  KEYS.add(c);
  if (c.startsWith('Digit')) {
    const n = Number(c.slice(5));
    if (UIS.build) { const list = catItems(UIS.buildCat); if (n >= 1 && list[n - 1] !== undefined) UIS.buildSel = list[n - 1]; }
    else if (n >= 1 && n <= 6) S.sel = n - 1;
  }
  if (c === 'KeyB') { UIS.build = !UIS.build; mouseDown = false; }
  if (c === 'KeyQ' && UIS.build) { UIS.buildCat = (UIS.buildCat + 1) % BUILD_CATS.length; UIS.buildSel = catItems(UIS.buildCat)[0]; }
  if (c === 'KeyI') openPanel('inv');
  if (c === 'KeyM') openPanel('map');
  if (c === 'KeyF') eat();
  if (c === 'KeyH') heal();
  if (c === 'KeyE' && !UIS.build) {
    const t = UIS.target || interactTarget();
    if (!t) return;
    if (t.k === 'npc') recruit(t.e);
    else if (t.k === 'surv') openPanel('surv', t.e.id);
    else if (t.k === 'animal') useAnimal(t.e);
    else if (OBJ[t.o].bench) { UIS.benchTier = OBJ[t.o].bench; openPanel('bench'); }
    else useTile(t);
  }
  renderHUD();
}
addEventListener('keydown', onKey);
addEventListener('keyup', (e) => KEYS.delete(e.code));
addEventListener('blur', () => { KEYS.clear(); mouseDown = false; });
let lastPlaced = null;
function pointerWorld(e) { const r = $('cv').getBoundingClientRect(); mouseW = screenToWorld(e.clientX - r.left, e.clientY - r.top); }
function tryPlace() {
  const tx = tileOf(mouseW.x), ty = tileOf(mouseW.y), key = tx + ',' + ty;
  if (lastPlaced === key) return;
  lastPlaced = key;
  const why = place(BUILD[UIS.buildSel], tx, ty);
  if (why && why !== 'Ocupado') toast(why, 'bad');
}
$('cv').addEventListener('mousemove', (e) => { pointerWorld(e); if (UIS.build && mouseDown) tryPlace(); });
$('cv').addEventListener('mousedown', (e) => {
  audio();
  pointerWorld(e);
  if (UIS.panel || S.player.hp <= 0) return;
  if (e.button === 2) { if (UIS.build) dismantle(tileOf(mouseW.x), tileOf(mouseW.y)); return; }
  if (e.button !== 0) return;
  mouseDown = true;
  if (UIS.build) { lastPlaced = null; tryPlace(); }
});
addEventListener('mouseup', () => { mouseDown = false; lastPlaced = null; });
$('cv').addEventListener('contextmenu', (e) => e.preventDefault());
$('cv').addEventListener('wheel', (e) => {
  if (UIS.panel) return;
  const d = e.deltaY > 0 ? 1 : -1;
  if (UIS.build) { const list = catItems(UIS.buildCat), k = Math.max(0, list.indexOf(UIS.buildSel)); UIS.buildSel = list[(k + d + list.length) % list.length]; }
  else S.sel = (S.sel + d + 6) % 6;
  e.preventDefault();
}, { passive: false });
