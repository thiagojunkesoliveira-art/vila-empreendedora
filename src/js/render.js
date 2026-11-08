'use strict';
// ================= Drawing =================
const R = { zoom: 3, w: 0, h: 0, camX: 0, camY: 0, t: 0, chunks: new Map(), light: null, lctx: null };
const CH = 16; // chunk size in tiles
const FLAT = new Set([O.FARM, O.BED, O.SPIKES, O.STUMP, O.SAPLING]);
const WALL_SET = new Set([O.WALL_W, O.WALL_S, O.DOOR]);
const FENCE_SET = new Set([O.FENCE, O.GATE, O.WALL_W, O.WALL_S, O.DOOR]);
// Which neighbors connect: 1 north, 2 east, 4 south, 8 west.
function maskOf(tx, ty, set) {
  return (set.has(objAt(tx, ty - 1)) ? 1 : 0) | (set.has(objAt(tx + 1, ty)) ? 2 : 0) | (set.has(objAt(tx, ty + 1)) ? 4 : 0) | (set.has(objAt(tx - 1, ty)) ? 8 : 0);
}
const RUIN_SET = new Set([O.RUIN]);
let cv, ctx;

function resize() {
  cv = $('cv');
  R.zoom = innerWidth < 760 ? 2 : innerWidth > 2200 ? 4 : 3;
  R.w = Math.ceil(innerWidth / R.zoom);
  R.h = Math.ceil(innerHeight / R.zoom);
  cv.width = R.w; cv.height = R.h;
  cv.style.width = R.w * R.zoom + 'px';
  cv.style.height = R.h * R.zoom + 'px';
  ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  R.light = canvas(R.w, R.h);
  R.lctx = R.light.getContext('2d');
}
function chunk(cx, cy) {
  const key = cy * 100 + cx;
  let c = R.chunks.get(key);
  if (c) return c;
  c = canvas(CH * TS, CH * TS);
  const g = c.getContext('2d');
  for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) {
    const tx = cx * CH + x, ty = cy * CH + y;
    if (!inb(tx, ty)) continue;
    const i = idx(tx, ty);
    drawGround(g, W.ground[i], tx, ty, x * TS, y * TS, { lineH: W.roadH[i], lineV: W.roadV[i], n: groundAt(tx, ty - 1) === G.WATER });
  }
  R.chunks.set(key, c);
  return c;
}
function screenToWorld(sx, sy) { return { x: sx / R.zoom + R.camX, y: sy / R.zoom + R.camY }; }

function drawObj(o, tx, ty, i) {
  const x = tx * TS - R.camX, y = ty * TS - R.camY;
  const v = Math.floor(hash2(tx, ty, 9) * 3);
  switch (o) {
    case O.TREE: ctx.drawImage(SPR.tree[v], x - 3, y - 12); break;
    case O.PINE: ctx.drawImage(SPR.pine[v % 2], x - 1, y - 12); break;
    case O.ROCK: ctx.drawImage(SPR.rock[v], x, y + 2); break;
    case O.SCRAP: ctx.drawImage(SPR.scrap[v % 2], x, y + 2); break;
    case O.CAR: ctx.drawImage(SPR.car[v], x, y); break;
    case O.BUSH: ctx.drawImage(SPR.bush, x, y + 3); break;
    case O.CRATE: ctx.drawImage(SPR.crate, x + 1, y + 1); break;
    case O.RUIN: ctx.drawImage(wallSprite('ruin', maskOf(tx, ty, RUIN_SET)), x, y - 6); break;
    case O.STUMP: ctx.drawImage(SPR.stump, x + 2, y + 5); break;
    case O.WALL_W: ctx.drawImage(wallSprite('wood', maskOf(tx, ty, WALL_SET)), x, y - 6); break;
    case O.WALL_S: ctx.drawImage(wallSprite('stone', maskOf(tx, ty, WALL_SET)), x, y - 6); break;
    case O.DOOR: ctx.drawImage(doorSprite(maskOf(tx, ty, WALL_SET)), x, y - 6); break;
    case O.FENCE: ctx.drawImage(fenceSprite(maskOf(tx, ty, FENCE_SET)), x, y - 6); break;
    case O.GATE: ctx.drawImage(fenceSprite(maskOf(tx, ty, FENCE_SET), true), x, y - 6); break;
    case O.BENCH2: ctx.drawImage(SPR.bench2, x, y); break;
    case O.BENCH3: ctx.drawImage(SPR.bench3, x, y); break;
    case O.SAPLING: ctx.drawImage(SPR.sapling, x + 2, y + 3); break;
    case O.FRUIT: ctx.drawImage(SPR.fruit[fruitStage(i)], x - 3, y - 12); break;
    case O.FIRE: ctx.drawImage(SPR.fire[Math.floor(R.t * 8 + tx) % 3], x, y - 2); break;
    case O.TORCH: ctx.drawImage(SPR.torch[Math.floor(R.t * 7 + ty) % 3], x + 4, y); break;
    case O.BENCH: ctx.drawImage(SPR.bench, x, y); break;
    case O.BED: ctx.drawImage(SPR.bed, x + 1, y); break;
    case O.FARM: ctx.drawImage(SPR.farm[farmStage(i)], x, y); break;
    case O.SPIKES: ctx.drawImage(SPR.spikes, x, y + 2); break;
    case O.CHEST: ctx.drawImage(SPR.chest, x + 1, y + 2); break;
    case O.TURRET: {
      ctx.drawImage(SPR.turret, x, y);
      const a = (S.turretAng && S.turretAng[i]) || -Math.PI / 2;
      ctx.strokeStyle = '#2a2826'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 8, y + 8); ctx.lineTo(x + 8 + Math.cos(a) * 8, y + 8 + Math.sin(a) * 8); ctx.stroke();
      break;
    }
    default: break;
  }
  const od = OBJ[o];
  if (od && od.build && W.hp[i] < od.hp) {
    const f = W.hp[i] / od.hp;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x + 2, y - 9, 12, 2);
    ctx.fillStyle = f > 0.5 ? '#9ac46a' : f > 0.25 ? '#e0a64a' : '#e05a4a'; ctx.fillRect(x + 2, y - 9, Math.max(1, 12 * f), 2);
  }
}
const animFrame = (e) => { const moving = e.moving !== undefined ? e.moving : true; return moving && e.anim ? (Math.floor(e.anim) % 2) + 1 : 0; };
function drawChar(e, key, scale = 1, squash = 1) {
  const fr = charFrames(key);
  const img = fr[e.dir || 0][animFrame(e)];
  const x = Math.round(e.x - R.camX), y = Math.round(e.y - R.camY);
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.ellipse(x, y, 5 * scale, 2 * scale, 0, 0, 7); ctx.fill();
  if (e.flash > 0 || e.hurt > 0) ctx.filter = 'brightness(2.2)';
  const w = 16 * scale, h = Math.round(18 * scale * squash);
  ctx.drawImage(img, Math.round(x - w / 2), Math.round(y - h + 1), w, h);
  ctx.filter = 'none';
  return { x, y };
}
// The hand that holds the item, in screen pixels, following the walk animation.
function handPos(e, x, y) {
  const f = animFrame(e), step = f === 1 ? 1 : f === 2 ? -1 : 0;
  if ((e.dir || 0) < 2) return [x + 4, y - 7 - (step < 0 ? 1 : 0)];
  return [x + 1 + step, y - 6];
}
// Is the held item drawn behind the body (character seen from the back, or aiming up)?
function heldBehind(e, aim) {
  if (aim !== null && aim !== undefined) return Math.sin(aim) < -0.4;
  return (e.dir || 0) === 1;
}
// swing: progress 0..1 of a melee swing, or -1. aim: gun angle while shooting, or null.
// At rest the sprite is not rotated, so it stays crisp and still in the hand.
function drawHeldItem(e, base, x, y, swing, aim, recoil) {
  const d = ITEMS[base];
  if (!d || d.kind === 'head' || d.kind === 'body') return;
  const spr = heldSprite(base);
  const dir = e.dir || 0;
  const [hx, hy] = handPos(e, x, y);
  ctx.save();
  ctx.translate(hx, hy);
  if (d.kind === 'gun') {
    let a = dir === 0 ? Math.PI / 2 : dir === 1 ? -Math.PI / 2 : 0, mirror = dir === 2;
    if (aim !== null) {
      const q = Math.round(aim / (Math.PI / 8)) * (Math.PI / 8);
      mirror = Math.cos(q) < -0.01;
      a = mirror ? Math.PI - q : q;
    }
    if (mirror) ctx.scale(-1, 1);
    if (a) ctx.rotate(a);
    ctx.drawImage(spr, -4 - recoil, -8);
  } else {
    let s = 0;
    if (swing >= 0) s = swing < 0.3 ? -0.8 + 2.4 * Math.sin((swing / 0.3) * Math.PI / 2) : 1.6 * (1 - (swing - 0.3) / 0.7);
    if (dir === 1) s = -s;
    if (dir === 2) ctx.scale(-1, 1);
    if (s) ctx.rotate(s);
    ctx.drawImage(spr, -5, -9);
  }
  ctx.restore();
}
function playerHeldState(p) {
  const it = heldItem();
  if (!it) return null;
  const d = ITEMS[it.base];
  const aiming = d.kind === 'gun' && mouseDown && !UIS.build && !UIS.panel;
  const aim = aiming ? Math.atan2(mouseW.y - (p.y - 6), mouseW.x - p.x) : null;
  const cd = 1 / (d.spd || 1);
  const swing = d.kind !== 'gun' && actCd > 0 ? clamp(1 - actCd / cd, 0, 1) : -1;
  const recoil = d.kind === 'gun' && actCd > cd - 0.07 ? 2 : 0;
  return { base: it.base, aim, swing, recoil };
}
function drawPlayer(p) {
  const h = playerHeldState(p);
  const x = Math.round(p.x - R.camX), y = Math.round(p.y - R.camY);
  const behind = h && heldBehind(p, h.aim);
  if (h && behind) drawHeldItem(p, h.base, x, y, h.swing, h.aim, h.recoil);
  drawChar(p, 'player');
  if (h && !behind) drawHeldItem(p, h.base, x, y, h.swing, h.aim, h.recoil);
}
function drawHeart(x, y, col = '#e0604f') {
  ctx.fillStyle = col;
  ctx.fillRect(x, y, 2, 1); ctx.fillRect(x + 3, y, 2, 1); ctx.fillRect(x, y + 1, 5, 1); ctx.fillRect(x + 1, y + 2, 3, 1); ctx.fillRect(x + 2, y + 3, 1, 1);
}
function drawAnimal(a) {
  const fr = SPR.animal[a.t];
  const img = fr[a.moving ? Math.floor(a.anim || 0) % 2 : 0][a.dir === 2 ? 1 : 0];
  const x = Math.round(a.x - R.camX), y = Math.round(a.y - R.camY);
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath(); ctx.ellipse(x, y, img.width / 2.6, 2, 0, 0, 7); ctx.fill();
  if (a.hurt > 0) ctx.filter = 'brightness(2.2)';
  ctx.drawImage(img, x - (img.width >> 1), y - img.height + 1);
  ctx.filter = 'none';
  const top = y - img.height - 2;
  const d = ANIMALS[a.t];
  if (a.tame && a.prod >= d.every) {
    ctx.fillStyle = 'rgba(18,18,14,.8)'; ctx.fillRect(x - 6, top - 10, 12, 11);
    ctx.drawImage(ICON[d.item], x - 5, top - 9, 10, 10);
  } else if (a.tame && a.follow) drawHeart(x - 2, top - 3 + Math.round(Math.sin(R.t * 4)));
  else if (!a.tame && a.fed > 0) for (let k = 0; k < d.feeds; k++) drawHeart(x - d.feeds * 3 + k * 6, top - 3, k < a.fed ? '#e0604f' : 'rgba(255,255,255,.35)');
}

function render(dt) {
  R.t += dt;
  const p = S.player;
  R.camX = Math.round(clamp(p.x - R.w / 2, 0, WW * TS - R.w));
  R.camY = Math.round(clamp(p.y - 8 - R.h / 2, 0, WH * TS - R.h));
  ctx.fillStyle = '#1a1c18';
  ctx.fillRect(0, 0, R.w, R.h);
  // ground
  const c0 = Math.floor(R.camX / (CH * TS)), c1 = Math.floor((R.camX + R.w) / (CH * TS));
  const r0 = Math.floor(R.camY / (CH * TS)), r1 = Math.floor((R.camY + R.h) / (CH * TS));
  for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) ctx.drawImage(chunk(cx, cy), cx * CH * TS - R.camX, cy * CH * TS - R.camY);
  // water shimmer
  const tx0 = Math.max(0, Math.floor(R.camX / TS) - 1), tx1 = Math.min(WW - 1, Math.floor((R.camX + R.w) / TS) + 1);
  const ty0 = Math.max(0, Math.floor(R.camY / TS) - 1), ty1 = Math.min(WH - 1, Math.floor((R.camY + R.h) / TS) + 2);
  ctx.fillStyle = 'rgba(160,200,220,.18)';
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    if (W.ground[idx(tx, ty)] !== G.WATER) continue;
    const ph = (R.t * 0.8 + hash2(tx, ty, 3) * 6) % 6;
    if (ph < 1.2) ctx.fillRect(tx * TS - R.camX + 3 + Math.floor(hash2(tx, ty, 4) * 9), ty * TS - R.camY + 4 + Math.floor(ph * 6), 4, 1);
  }
  // flat objects
  const tall = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const i = idx(tx, ty), o = W.obj[i];
    if (!o) continue;
    if (FLAT.has(o)) drawObj(o, tx, ty, i);
    else tall.push({ y: ty * TS + 15, o, tx, ty, i });
  }
  // entities
  for (const z of Z) tall.push({ y: z.y, z });
  for (const s of S.surv) tall.push({ y: s.y, s });
  for (const n of S.npcs) if (Math.abs(n.x - p.x) < R.w && Math.abs(n.y - p.y) < R.h) tall.push({ y: n.y, n });
  for (const a of S.animals) if (Math.abs(a.x - p.x) < R.w && Math.abs(a.y - p.y) < R.h) tall.push({ y: a.y, a });
  if (p.hp > 0) tall.push({ y: p.y, p: true });
  tall.sort((a, b) => a.y - b.y);
  for (const d of tall) {
    if (d.o) drawObj(d.o, d.tx, d.ty, d.i);
    else if (d.z) {
      const z = d.z, zt = ZT[z.t];
      if (z.x < R.camX - 30 || z.x > R.camX + R.w + 30 || z.y < R.camY - 30 || z.y > R.camY + R.h + 40) continue;
      if (z.fuse > 0) z.flash = Math.sin(R.t * 30) > 0 ? 0.05 : 0;
      const pos = drawChar(z, zt.pal, zt.boss ? 1.9 : zt.big ? 1.4 : 1, zt.crawl ? 0.6 : 1);
      if (z.hp < z.max) {
        const w = zt.boss ? 24 : 12, f = clamp(z.hp / z.max, 0, 1), hy = pos.y - (zt.boss ? 38 : zt.big ? 28 : zt.crawl ? 14 : 21);
        ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(pos.x - w / 2, hy, w, 2);
        ctx.fillStyle = zt.boss ? '#f0aa3c' : zt.armor ? '#9ab0c8' : '#d8503f'; ctx.fillRect(pos.x - w / 2, hy, w * f, 2);
      }
    } else if (d.a) drawAnimal(d.a);
    else if (d.s) {
      const s = d.s;
      const it = s.item && itemById(s.item);
      const sx = Math.round(s.x - R.camX), sy = Math.round(s.y - R.camY);
      if (it && heldBehind(s, null)) drawHeldItem(s, it.base, sx, sy, -1, null, 0);
      const pos = drawChar(s, s.pal);
      if (it && !heldBehind(s, null)) drawHeldItem(s, it.base, sx, sy, -1, null, 0);
      if (s.sleep) { ctx.fillStyle = '#c8d4e8'; ctx.font = '6px monospace'; ctx.fillText('z', pos.x + 4, pos.y - 18 - (R.t * 4 % 4)); }
      if (s.hp < 100) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(pos.x - 6, pos.y - 21, 12, 2); ctx.fillStyle = '#7cc46a'; ctx.fillRect(pos.x - 6, pos.y - 21, 12 * s.hp / 100, 2); }
    } else if (d.n) {
      const n = d.n;
      const pos = drawChar({ ...n, moving: !!(n.mx || n.my) }, n.pal);
      const bob = Math.round(Math.sin(R.t * 4) * 1.5);
      ctx.fillStyle = '#16140f'; ctx.fillRect(pos.x - 2, pos.y - 28 + bob, 4, 8);
      ctx.fillStyle = '#f0c24a'; ctx.fillRect(pos.x - 1, pos.y - 27 + bob, 2, 4); ctx.fillRect(pos.x - 1, pos.y - 22 + bob, 2, 1);
    } else if (d.p) drawPlayer(p);
  }
  // projectiles
  for (const b of BUL) {
    const x = b.x - R.camX, y = b.y - R.camY;
    if (b.spit) { ctx.fillStyle = '#a8d060'; ctx.fillRect(x - 1, y - 1, 3, 3); }
    else { ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - b.vx * 0.015, y - b.vy * 0.015); ctx.stroke(); }
  }
  // particles and swings
  for (const f of FX) {
    if (f.txt) continue;
    if (f.swing) {
      ctx.strokeStyle = `rgba(255,255,255,${f.life / 0.15 * 0.5})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(f.x - R.camX, f.y - R.camY, f.r * 0.8, f.a - 0.8, f.a + 0.8); ctx.stroke();
      continue;
    }
    ctx.fillStyle = f.col; ctx.fillRect(Math.round(f.x - R.camX), Math.round(f.y - R.camY), 1, 1);
  }
  drawLighting();
  // floating text on top of the darkness
  ctx.font = 'bold 7px Bahnschrift, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  for (const f of FX) {
    if (!f.txt) continue;
    const x = Math.round(f.x - R.camX), y = Math.round(f.y - R.camY);
    ctx.globalAlpha = clamp(f.life, 0, 1);
    ctx.fillStyle = '#16140f'; ctx.fillText(f.txt, x + 1, y + 1);
    ctx.fillStyle = f.col; ctx.fillText(f.txt, x, y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
  drawCursorTile();
}
function drawLighting() {
  const a = darkness();
  if (a <= 0.01) return;
  const l = R.lctx;
  l.globalCompositeOperation = 'source-over';
  l.clearRect(0, 0, R.w, R.h);
  l.fillStyle = `rgba(6,8,20,${a})`;
  l.fillRect(0, 0, R.w, R.h);
  l.globalCompositeOperation = 'destination-out';
  const hole = (x, y, r, k = 1) => {
    const g = l.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${k})`); g.addColorStop(0.55, `rgba(0,0,0,${k * 0.75})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    l.fillStyle = g; l.beginPath(); l.arc(x, y, r, 0, 7); l.fill();
  };
  const p = S.player;
  hole(p.x - R.camX, p.y - 8 - R.camY, 46, 0.85);
  const glows = [];
  for (const i of W.built) {
    const o = W.obj[i], od = OBJ[o];
    if (!od.light) continue;
    const x = (i % WW) * TS + 8 - R.camX, y = Math.floor(i / WW) * TS + 6 - R.camY;
    const r = od.light * TS * (1 + Math.sin(R.t * 9 + i) * 0.03);
    if (x < -r || y < -r || x > R.w + r || y > R.h + r) continue;
    hole(x, y, r, 1);
    glows.push([x, y, r]);
  }
  for (const b of BUL) if (!b.spit) hole(b.x - R.camX, b.y - R.camY, 10, 0.6);
  ctx.drawImage(R.light, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  for (const [x, y, r] of glows) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 0.7);
    g.addColorStop(0, `rgba(255,150,60,${0.22 * a})`); g.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 0.7, 0, 7); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}
function drawCursorTile() {
  const tx = tileOf(mouseW.x), ty = tileOf(mouseW.y);
  const x = tx * TS - R.camX, y = ty * TS - R.camY;
  if (UIS.build) {
    const b = BUILD[UIS.buildSel];
    const why = canPlace(b, tx, ty);
    const img = ICON[b.o];
    ctx.globalAlpha = 0.65;
    const tallSpr = OBJ[b.o].wall;
    ctx.drawImage(img, x + (16 - img.width) / 2, y + (tallSpr ? -6 : 16 - img.height));
    ctx.globalAlpha = 1;
    ctx.strokeStyle = why ? 'rgba(230,90,70,.9)' : 'rgba(150,220,120,.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, 15, 15);
    UIS.buildWhy = why;
    return;
  }
  const t = UIS.target;
  if (t && t.k === 'tile') corners(t.x * TS - R.camX, t.y * TS - R.camY, '#f6e7b0');
  const o = objAt(tx, ty);
  const it = heldItem();
  if (it && ITEMS[it.base].kind === 'hammer' && OBJ[o] && OBJ[o].build && W.hp[idx(tx, ty)] < OBJ[o].hp && dist(S.player.x, S.player.y - 4, tx * TS + 8, ty * TS + 8) <= REACH + 8) { corners(x, y, '#9ad06a'); return; }
  if (o && OBJ[o] && (OBJ[o].give || o === O.CRATE) && dist(S.player.x, S.player.y - 4, tx * TS + 8, ty * TS + 8) <= REACH) corners(x, y, 'rgba(255,255,255,.75)');
}
function corners(x, y, col) {
  ctx.fillStyle = col;
  const b = Math.sin(R.t * 6) > 0 ? 0 : 1;
  for (const [cx, cy, dx, dy] of [[0, 0, 1, 1], [15, 0, -1, 1], [0, 15, 1, -1], [15, 15, -1, -1]]) {
    ctx.fillRect(x + cx - dx * b, y + cy - dy * b, 1, 1); ctx.fillRect(x + cx + dx - dx * b, y + cy - dy * b, 1, 1); ctx.fillRect(x + cx - dx * b, y + cy + dy - dy * b, 1, 1);
  }
}

// ---------- Minimap ----------
const MM = { c: null, img: null, t: 0 };
function drawMinimap(dt) {
  MM.t -= dt;
  const c = $('mini');
  if (!c) return;
  const g = c.getContext('2d');
  if (!MM.img || MM.t <= 0) {
    MM.t = 2;
    MM.img = g.createImageData(WW, WH);
    const d = MM.img.data;
    const col = { [G.GRASS]: [70, 90, 54], [G.DIRT]: [96, 80, 58], [G.ROAD]: [62, 64, 66], [G.WATER]: [44, 80, 98], [G.FLOOR]: [110, 84, 58], [G.TILE]: [118, 116, 108] };
    for (let i = 0; i < WW * WH; i++) {
      let rgb = col[W.ground[i]];
      const o = W.obj[i];
      if (o === O.TREE || o === O.PINE) rgb = [44, 64, 36];
      else if (o === O.RUIN) rgb = [150, 146, 136];
      else if (o && OBJ[o].build) rgb = [226, 170, 80];
      d[i * 4] = rgb[0]; d[i * 4 + 1] = rgb[1]; d[i * 4 + 2] = rgb[2]; d[i * 4 + 3] = 255;
    }
  }
  const p = S.player;
  const px = p.x / TS, py = p.y / TS, view = 60;
  const ox = clamp(px - view / 2, 0, WW - view), oy = clamp(py - view / 2, 0, WH - view);
  const tmp = MM.c || (MM.c = canvas(WW, WH));
  tmp.getContext('2d').putImageData(MM.img, 0, 0);
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, c.width, c.height);
  g.drawImage(tmp, ox, oy, view, view, 0, 0, c.width, c.height);
  const k = c.width / view;
  g.fillStyle = '#e05a4a';
  for (const z of Z) { const x = (z.x / TS - ox) * k, y = (z.y / TS - oy) * k; if (x >= 0 && y >= 0 && x < c.width && y < c.height) g.fillRect(x - 1, y - 1, 2, 2); }
  g.fillStyle = '#f0c24a';
  for (const n of S.npcs) { const x = (n.x / TS - ox) * k, y = (n.y / TS - oy) * k; if (x >= 0 && y >= 0 && x < c.width && y < c.height) g.fillRect(x - 1.5, y - 1.5, 3, 3); }
  g.fillStyle = '#9ad0f0';
  for (const s of S.surv) g.fillRect((s.x / TS - ox) * k - 1, (s.y / TS - oy) * k - 1, 2, 2);
  g.fillStyle = '#ffffff';
  g.fillRect((px - ox) * k - 2, (py - oy) * k - 2, 4, 4);
}
