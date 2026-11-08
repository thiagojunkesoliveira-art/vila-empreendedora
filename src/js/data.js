'use strict';
// ================= Game data =================
const TS = 16;            // tile size in pixels
const WW = 200, WH = 200; // world size in tiles

// ---------- Ground ----------
const G = { GRASS: 0, DIRT: 1, ROAD: 2, WATER: 3, FLOOR: 4, TILE: 5 };

// ---------- Objects on tiles ----------
// solid: blocks people. tool: which tool gathers it. give: resources per point of damage.
// zcost: extra cost for zombie pathing (Infinity = they walk around). wall: zombies attack it.
const O = {
  NONE: 0, TREE: 1, PINE: 2, ROCK: 3, SCRAP: 4, CAR: 5, BUSH: 6, CRATE: 7, RUIN: 8, STUMP: 9,
  WALL_W: 20, WALL_S: 21, DOOR: 22, FIRE: 23, TORCH: 24, BENCH: 25, BED: 26, FARM: 27, SPIKES: 28, TURRET: 29, CHEST: 30,
};
const OBJ = {
  [O.TREE]:  { n: 'Árvore', solid: true, hp: 10, tool: 'axe', give: { madeira: 1 }, regrow: 2 },
  [O.PINE]:  { n: 'Pinheiro', solid: true, hp: 8, tool: 'axe', give: { madeira: 1 }, regrow: 2 },
  [O.ROCK]:  { n: 'Pedra', solid: true, hp: 12, tool: 'pick', give: { pedra: 1 }, bonus: { sucata: 0.15 }, regrow: 4 },
  [O.SCRAP]: { n: 'Sucata', solid: true, hp: 10, tool: 'pick', give: { sucata: 1 }, bonus: { pecas: 0.05 }, regrow: 5 },
  [O.CAR]:   { n: 'Carro abandonado', solid: true, hp: 24, tool: 'pick', give: { sucata: 1 }, end: { pecas: [1, 2] } },
  [O.BUSH]:  { n: 'Arbusto com frutas', solid: false, hp: 1, give: { comida: 3 }, regrow: 2, hand: true },
  [O.CRATE]: { n: 'Caixa de suprimentos', solid: true, hp: 0, open: true },
  [O.RUIN]:  { n: 'Parede em ruínas', solid: true, hp: 0 },
  [O.STUMP]: { n: 'Toco', solid: false, hp: 0 },
  [O.WALL_W]: { n: 'Parede de madeira', solid: true, hp: 120, build: true, wall: true },
  [O.WALL_S]: { n: 'Parede de pedra', solid: true, hp: 320, build: true, wall: true },
  [O.DOOR]:  { n: 'Porta', solid: false, hp: 160, build: true, wall: true, door: true },
  [O.FIRE]:  { n: 'Fogueira', solid: true, hp: 80, build: true, light: 6, home: true },
  [O.TORCH]: { n: 'Tocha', solid: false, hp: 30, build: true, light: 4 },
  [O.BENCH]: { n: 'Bancada', solid: true, hp: 120, build: true, home: true },
  [O.BED]:   { n: 'Cama', solid: false, hp: 80, build: true, home: true },
  [O.FARM]:  { n: 'Horta', solid: false, hp: 40, build: true },
  [O.SPIKES]: { n: 'Estacas', solid: false, hp: 60, build: true, spikes: true },
  [O.TURRET]: { n: 'Torreta', solid: true, hp: 200, build: true, home: true },
  [O.CHEST]: { n: 'Baú', solid: true, hp: 100, build: true },
};

// ---------- Resources ----------
const RES = {
  madeira: 'Madeira', pedra: 'Pedra', sucata: 'Sucata', comida: 'Comida', tecido: 'Tecido',
  pecas: 'Peças', municao: 'Munição', curativo: 'Curativos',
};
const RES_ORDER = Object.keys(RES);

// ---------- Things you can build (key B) ----------
const BUILD = [
  { o: O.WALL_W, cost: { madeira: 4 }, d: 'Bloqueia zumbis. Eles tentam quebrar.' },
  { o: O.DOOR, cost: { madeira: 6 }, d: 'Você e os sobreviventes passam; zumbis não.' },
  { o: O.WALL_S, cost: { pedra: 5 }, d: 'Bem mais resistente que a de madeira.', tier: 2 },
  { o: O.FIRE, cost: { madeira: 5, pedra: 3 }, d: 'Ilumina a noite e marca o centro da base.' },
  { o: O.TORCH, cost: { madeira: 2 }, d: 'Luz pequena.' },
  { o: O.BENCH, cost: { madeira: 10, pedra: 4 }, d: 'Fabrique ferramentas, armas e munição (tecla E).' },
  { o: O.BED, cost: { madeira: 8, tecido: 3 }, d: 'Você renasce aqui. Cada sobrevivente precisa de uma.' },
  { o: O.FARM, cost: { madeira: 4, comida: 2 }, d: 'Produz comida com o tempo. Colha com E.' },
  { o: O.CHEST, cost: { madeira: 12 }, d: 'Aumenta o limite de recursos guardados.', tier: 2 },
  { o: O.SPIKES, cost: { madeira: 5, sucata: 2 }, d: 'Fere os zumbis que passam por cima.', tier: 2 },
  { o: O.TURRET, cost: { sucata: 20, pecas: 4 }, d: 'Atira sozinha nos zumbis. Gasta munição.', tier: 3 },
];

// ---------- Items: tools, weapons, armor ----------
// kind: axe, pick (gather + fight), melee, gun, head, body. power: gathering strength.
const ITEMS = {
  axe1:    { n: 'Machado de pedra', kind: 'axe', power: 3, dmg: 7, spd: 2.2, range: 20, dur: 90, cost: { madeira: 5, pedra: 4 }, tier: 1 },
  pick1:   { n: 'Picareta de pedra', kind: 'pick', power: 3, dmg: 6, spd: 2, range: 20, dur: 90, cost: { madeira: 5, pedra: 5 }, tier: 1 },
  spear:   { n: 'Lança', kind: 'melee', dmg: 13, spd: 1.8, range: 30, dur: 70, cost: { madeira: 6, pedra: 3 }, tier: 1 },
  bat:     { n: 'Taco com pregos', kind: 'melee', dmg: 17, spd: 1.5, range: 22, dur: 80, cost: { madeira: 8, sucata: 3 }, tier: 1 },
  axe2:    { n: 'Machado de ferro', kind: 'axe', power: 6, dmg: 12, spd: 2.4, range: 22, dur: 160, cost: { madeira: 6, sucata: 8 }, tier: 2 },
  pick2:   { n: 'Picareta de ferro', kind: 'pick', power: 6, dmg: 10, spd: 2.2, range: 22, dur: 160, cost: { madeira: 6, sucata: 10 }, tier: 2 },
  machete: { n: 'Facão', kind: 'melee', dmg: 22, spd: 2.4, range: 22, dur: 120, cost: { sucata: 12, madeira: 3 }, tier: 2 },
  pistol:  { n: 'Pistola', kind: 'gun', dmg: 15, spd: 3, range: 150, spread: 0.05, dur: 200, cost: { sucata: 15, pecas: 2 }, tier: 2 },
  helmet:  { n: 'Capacete', kind: 'head', armor: 3, dur: 120, cost: { sucata: 8 }, tier: 2 },
  armor:   { n: 'Armadura de sucata', kind: 'body', armor: 6, dur: 160, cost: { sucata: 16, madeira: 4 }, tier: 2 },
  shotgun: { n: 'Espingarda', kind: 'gun', dmg: 10, pellets: 5, spd: 1.1, range: 95, spread: 0.28, dur: 200, cost: { sucata: 25, pecas: 4, madeira: 6 }, tier: 3 },
  rifle:   { n: 'Rifle', kind: 'gun', dmg: 40, spd: 1, range: 260, spread: 0.01, pierce: 2, dur: 220, cost: { sucata: 30, pecas: 6 }, tier: 3 },
  vest:    { n: 'Colete tático', kind: 'body', armor: 11, dur: 220, cost: { sucata: 20, pecas: 5, tecido: 4 }, tier: 3 },
};
const RAR = [
  { n: 'Comum', c: '#b9b6ad', m: 1 },
  { n: 'Incomum', c: '#7cc46a', m: 1.2 },
  { n: 'Raro', c: '#5e9ce6', m: 1.45 },
  { n: 'Épico', c: '#b47be8', m: 1.8 },
  { n: 'Lendário', c: '#f0aa3c', m: 2.3 },
];
// Bench recipes that make resources.
const MAKES = [
  { id: 'municao', n: '10 munições', cost: { sucata: 3 }, give: { municao: 10 }, tier: 2 },
  { id: 'curativo', n: '1 curativo', cost: { tecido: 2 }, give: { curativo: 1 }, tier: 1 },
];
const BENCH_UP = { 2: { sucata: 15, pedra: 10 }, 3: { sucata: 30, pecas: 5, madeira: 20 } };

// ---------- Zombies ----------
const ZT = {
  comum:   { n: 'Zumbi', hp: 30, spd: 26, dmg: 6, r: 5, from: 1, pal: 'z1' },
  veloz:   { n: 'Zumbi veloz', hp: 22, spd: 48, dmg: 6, r: 5, from: 3, pal: 'z2' },
  bruto:   { n: 'Brutamonte', hp: 130, spd: 18, dmg: 22, r: 7, from: 5, pal: 'z3', big: true },
  cuspidor:{ n: 'Cuspidor', hp: 40, spd: 22, dmg: 7, r: 5, from: 7, pal: 'z4', spit: 80 },
  colosso: { n: 'Colosso', hp: 650, spd: 20, dmg: 34, r: 9, pal: 'z5', big: true, boss: true },
};

// ---------- Survivors ----------
const SPECS = {
  Lenhador: 'Corta árvores perto da base.',
  Minerador: 'Quebra pedras e sucata perto da base.',
  Agricultor: 'Cuida e colhe as hortas.',
  Guarda: 'Luta contra os zumbis que chegam perto.',
};
const NAMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabi', 'Heitor', 'Iara', 'João', 'Kátia', 'Léo', 'Marina', 'Nando',
  'Olívia', 'Paulo', 'Rafa', 'Sônia', 'Tiago', 'Vítor', 'Wanda', 'Yasmin', 'Zeca', 'Bia', 'Caio', 'Duda', 'Edu', 'Flávia', 'Guto', 'Helena',
  'Jade', 'Lara', 'Mateus', 'Nina', 'Otávio', 'Renan', 'Sara', 'Téo', 'Vera', 'Murilo', 'Tânia', 'Igor', 'Luana', 'Ciro'];

// ---------- Time ----------
const DAY_LEN = 360;   // seconds for a full day
const NIGHT_START = 0.6; // fraction of the day when night begins (20h)


// ---------- Tutorial ----------
// Each step: text, optional progress(), done().
const TUTORIAL = [
  { t: 'Ande com W A S D', done: () => S.stats.walked > 48 },
  { t: 'Segure o botão esquerdo numa árvore para cortar', p: () => [S.res.madeira, 8], done: () => S.res.madeira >= 8 },
  { t: 'Quebre pedras do mesmo jeito', p: () => [S.res.pedra, 4], done: () => S.res.pedra >= 4 },
  { t: 'Aperte B e construa uma Bancada', done: () => countObj(O.BENCH) > 0 },
  { t: 'Perto da bancada, aperte E e faça um Machado de pedra', done: () => S.items.some((i) => i.base === 'axe1') },
  { t: 'Use o machado: aperte 1 a 6 para trocar de item', done: () => heldItem() && heldItem().base === 'axe1' },
  { t: 'Cerque o acampamento com paredes e uma porta (B)', p: () => [countObj(O.WALL_W) + countObj(O.WALL_S) + countObj(O.DOOR), 8], done: () => countObj(O.WALL_W) + countObj(O.WALL_S) + countObj(O.DOOR) >= 8 },
  { t: 'Sobreviva à primeira noite', done: () => S.day >= 2 },
  { t: 'Explore a cidade a leste e abra caixas com E', p: () => [S.stats.crates, 3], done: () => S.stats.crates >= 3 },
  { t: 'Construa uma Cama (precisa de tecido das caixas)', done: () => countObj(O.BED) > 0 },
  { t: 'Encontre um sobrevivente nas casas e recrute com E', done: () => S.surv.length > 0 },
  { t: 'Melhore a bancada para o nível 2', done: () => S.bench >= 2 },
  { t: 'Fabrique uma Pistola', done: () => S.items.some((i) => i.base === 'pistol') },
];
