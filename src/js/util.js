'use strict';
// ================= Small helpers: math, random, noise, encoding, pathfinding =================
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const irnd = (a, b) => Math.floor(rnd(a, b + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
function wpick(entries) {
  let t = 0;
  for (const e of entries) t += Math.max(0, e[1]);
  let r = Math.random() * t;
  for (const e of entries) { r -= Math.max(0, e[1]); if (r <= 0) return e[0]; }
  return entries[entries.length - 1][0];
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Deterministic hash of a grid cell, 0..1.
function hash2(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s, oct = 3) {
  let t = 0, amp = 1, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { t += vnoise(x * f, y * f, s + i * 31) * amp; n += amp; amp *= 0.5; f *= 2; }
  return t / n;
}
// Typed arrays <-> base64 for compact saves.
function bytesToB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToBytes(b) {
  const s = atob(b), u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

// Binary min-heap keyed by numbers (used by Dijkstra and A*).
class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v;
    const top = v[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      let i = 0;
      const n = k.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

// A* on the tile grid. passable(x, y) -> cost (Infinity = blocked). Returns [[x,y],...] or null.
function findPath(sx, sy, tx, ty, passable, maxNodes = 2500, near = false) {
  const key = (x, y) => y * 4096 + x;
  const open = new Heap();
  const g = new Map(), from = new Map();
  const h = (x, y) => Math.abs(x - tx) + Math.abs(y - ty);
  g.set(key(sx, sy), 0);
  open.push(h(sx, sy), [sx, sy]);
  let n = 0;
  while (open.size && n++ < maxNodes) {
    const [x, y] = open.pop();
    const done = near ? Math.max(Math.abs(x - tx), Math.abs(y - ty)) <= 1 : x === tx && y === ty;
    if (done) {
      const path = [[x, y]];
      let k = key(x, y);
      while (from.has(k)) { k = from.get(k); path.push([k % 4096, Math.floor(k / 4096)]); }
      return path.reverse();
    }
    const gc = g.get(key(x, y));
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx, ny = y + dy;
      let c = passable(nx, ny);
      if (!isFinite(c)) continue;
      if (dx && dy) {
        if (!isFinite(passable(x + dx, y)) || !isFinite(passable(x, y + dy))) continue;
        c *= 1.414;
      }
      const ng = gc + c, nk = key(nx, ny);
      if (g.has(nk) && g.get(nk) <= ng) continue;
      g.set(nk, ng);
      from.set(nk, key(x, y));
      open.push(ng + h(nx, ny), [nx, ny]);
    }
  }
  return null;
}
const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
