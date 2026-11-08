'use strict';
// ================= Game data =================

// ---------- Version and update notes ----------
// Every release adds an entry at the top of PATCHES; GAME_VERSION must match package.json.
// The game shows the newest notes once, the first time this version is opened.
const GAME_VERSION = '3.1.0';
const PATCHES = [
  {
    v: '3.1.0', title: 'Fazenda, bancada de pedra e zumbis novos',
    groups: [
      ['Visual', [
        'As ferramentas ficam firmes na mão e acompanham o lado para onde você olha. De costas, elas ficam atrás do corpo.',
        'Paredes, cercas e ruínas agora se conectam em qualquer direção, inclusive na vertical.',
      ]],
      ['Jogabilidade', [
        'Estamina: correr com Shift gasta a barra azul. Ela volta quando você anda ou para.',
        'Ao segurar uma arma de fogo, a munição aparece embaixo da barra de itens.',
        'Martelo: segure o botão esquerdo numa construção danificada para consertar (gasta um pouco do material dela).',
      ]],
      ['Conteúdo', [
        'Bancada de pedra e Oficina de metal: cada bancada libera armas, ferramentas e construções novas.',
        'Novos itens: Martelo, Marreta, Machado e Picareta de aço, Submetralhadora.',
        'Fazenda: plante mudas de árvore e árvores frutíferas; construa cercas e porteiras.',
        'Animais: galinhas, ovelhas e vacas vivem na floresta. Alimente com comida (E) para domesticar; eles dão ovos, lã e leite.',
        'Dificuldade: a cada dia os zumbis ficam mais fortes. Novos tipos: Rastejante, Blindado, Inchado (explode) e Gritador (chama a horda).',
      ]],
      ['Seu mundo', [
        'O progresso continua. Se a sua bancada já era nível 2 ou 3, ela virou Bancada de pedra ou Oficina de metal.',
      ]],
    ],
  },
];

const TS = 16;            // tile size in pixels
const WW = 200, WH = 200; // world size in tiles

// ---------- Ground ----------
const G = { GRASS: 0, DIRT: 1, ROAD: 2, WATER: 3, FLOOR: 4, TILE: 5 };

// ---------- Objects on tiles ----------
// solid: blocks people. tool: which tool gathers it. give: resources per point of damage.
// wall: zombies attack it. bench: crafting level. plant: grows over time.
const O = {
  NONE: 0, TREE: 1, PINE: 2, ROCK: 3, SCRAP: 4, CAR: 5, BUSH: 6, CRATE: 7, RUIN: 8, STUMP: 9,
  WALL_W: 20, WALL_S: 21, DOOR: 22, FIRE: 23, TORCH: 24, BENCH: 25, BED: 26, FARM: 27, SPIKES: 28, TURRET: 29, CHEST: 30,
  BENCH2: 31, BENCH3: 32, FENCE: 33, SAPLING: 34, FRUIT: 35, GATE: 36,
};
const OBJ = {
  [O.TREE]:  { n: 'Árvore', solid: true, hp: 10, tool: 'axe', give: { madeira: 1 }, end: { mudas: [0, 1] }, regrow: 2 },
  [O.PINE]:  { n: 'Pinheiro', solid: true, hp: 8, tool: 'axe', give: { madeira: 1 }, end: { mudas: [0, 1] }, regrow: 2 },
  [O.ROCK]:  { n: 'Pedra', solid: true, hp: 12, tool: 'pick', give: { pedra: 1 }, bonus: { sucata: 0.15 }, regrow: 4 },
  [O.SCRAP]: { n: 'Sucata', solid: true, hp: 10, tool: 'pick', give: { sucata: 1 }, bonus: { pecas: 0.05 }, regrow: 5 },
  [O.CAR]:   { n: 'Carro abandonado', solid: true, hp: 24, tool: 'pick', give: { sucata: 1 }, end: { pecas: [1, 2] } },
  [O.BUSH]:  { n: 'Arbusto com frutas', solid: false, hp: 1, give: { comida: 3 }, bonus: { sementes: 0.6 }, regrow: 2, hand: true },
  [O.CRATE]: { n: 'Caixa de suprimentos', solid: true, hp: 0, open: true },
  [O.RUIN]:  { n: 'Parede em ruínas', solid: true, hp: 0 },
  [O.STUMP]: { n: 'Toco', solid: false, hp: 0 },
  [O.WALL_W]: { n: 'Parede de madeira', solid: true, hp: 120, build: true, wall: true },
  [O.WALL_S]: { n: 'Parede de pedra', solid: true, hp: 320, build: true, wall: true },
  [O.DOOR]:  { n: 'Porta', solid: false, hp: 160, build: true, wall: true, door: true },
  [O.FIRE]:  { n: 'Fogueira', solid: true, hp: 80, build: true, light: 6, home: true },
  [O.TORCH]: { n: 'Tocha', solid: false, hp: 30, build: true, light: 4 },
  [O.BENCH]: { n: 'Bancada de madeira', solid: true, hp: 120, build: true, home: true, bench: 1 },
  [O.BENCH2]: { n: 'Bancada de pedra', solid: true, hp: 260, build: true, home: true, bench: 2 },
  [O.BENCH3]: { n: 'Oficina de metal', solid: true, hp: 320, build: true, home: true, bench: 3 },
  [O.BED]:   { n: 'Cama', solid: false, hp: 80, build: true, home: true },
  [O.FARM]:  { n: 'Horta', solid: false, hp: 40, build: true },
  [O.SPIKES]: { n: 'Estacas', solid: false, hp: 60, build: true, spikes: true },
  [O.TURRET]: { n: 'Torreta', solid: true, hp: 200, build: true, home: true },
  [O.CHEST]: { n: 'Baú', solid: true, hp: 100, build: true },
  [O.FENCE]: { n: 'Cerca', solid: true, hp: 70, build: true, wall: true, fence: true },
  [O.GATE]:  { n: 'Porteira', solid: false, hp: 90, build: true, wall: true, door: true, fence: true },
  [O.SAPLING]: { n: 'Muda de árvore', solid: false, hp: 20, build: true, plant: true },
  [O.FRUIT]: { n: 'Árvore frutífera', solid: true, hp: 90, build: true, plant: true },
};

// ---------- Resources ----------
const RES = {
  madeira: 'Madeira', pedra: 'Pedra', sucata: 'Sucata', comida: 'Comida', tecido: 'Tecido',
  pecas: 'Peças', municao: 'Munição', curativo: 'Curativos', sementes: 'Sementes', mudas: 'Mudas',
};
const RES_ORDER = Object.keys(RES);

// ---------- Things you can build (key B), in three tabs ----------
// tier: needs a bench of that level somewhere in the world.
const BUILD_CATS = ['Defesa', 'Base', 'Fazenda'];
const BUILD = [
  { cat: 0, o: O.WALL_W, cost: { madeira: 4 }, d: 'Bloqueia zumbis. Eles tentam quebrar.' },
  { cat: 0, o: O.DOOR, cost: { madeira: 6 }, d: 'Você, os sobreviventes e os animais que te seguem passam; zumbis não.' },
  { cat: 0, o: O.WALL_S, cost: { pedra: 5 }, d: 'Bem mais resistente que a de madeira.', tier: 2 },
  { cat: 0, o: O.SPIKES, cost: { madeira: 5, sucata: 2 }, d: 'Fere os zumbis que passam por cima.', tier: 2 },
  { cat: 0, o: O.TURRET, cost: { sucata: 20, pecas: 4 }, d: 'Atira sozinha nos zumbis. Gasta munição.', tier: 3 },
  { cat: 1, o: O.FIRE, cost: { madeira: 5, pedra: 3 }, d: 'Ilumina a noite e marca o centro da base.' },
  { cat: 1, o: O.TORCH, cost: { madeira: 2 }, d: 'Luz pequena.' },
  { cat: 1, o: O.BENCH, cost: { madeira: 10, pedra: 4 }, d: 'Ferramentas de pedra, martelo, lança e curativos (tecla E).' },
  { cat: 1, o: O.BENCH2, cost: { pedra: 20, madeira: 8 }, d: 'Ferramentas de ferro, marreta, facão, pistola, proteção e munição. Libera parede de pedra, estacas e baú.', tier: 1 },
  { cat: 1, o: O.BENCH3, cost: { sucata: 30, pecas: 5, pedra: 10 }, d: 'Ferramentas de aço, espingarda, rifle, submetralhadora e colete. Libera a torreta.', tier: 2 },
  { cat: 1, o: O.BED, cost: { madeira: 8, tecido: 3 }, d: 'Você renasce aqui. Cada sobrevivente precisa de uma.' },
  { cat: 1, o: O.CHEST, cost: { madeira: 12 }, d: 'Aumenta o limite de recursos guardados.', tier: 2 },
  { cat: 2, o: O.FARM, cost: { madeira: 4, sementes: 1 }, d: 'Plantação: dá comida com o tempo. Colha com E.', ground: true },
  { cat: 2, o: O.SAPLING, cost: { mudas: 1 }, d: 'Vira uma árvore em alguns minutos. Mudas saem das árvores que você corta.', ground: true },
  { cat: 2, o: O.FRUIT, cost: { sementes: 3, madeira: 2 }, d: 'Cresce e dá frutas de novo e de novo. Colha com E.', ground: true },
  { cat: 2, o: O.FENCE, cost: { madeira: 2 }, d: 'Segura os animais. Barata, mas fraca contra zumbis.' },
  { cat: 2, o: O.GATE, cost: { madeira: 4 }, d: 'Porteira da cerca: você passa, os animais soltos não.' },
];

// ---------- Items: tools, weapons, armor ----------
// kind: axe, pick (gather + fight), hammer (repair), melee, gun, head, body. power: gathering strength.
// tier: which bench makes it (1 wood, 2 stone, 3 metal).
const ITEMS = {
  axe1:    { n: 'Machado de pedra', kind: 'axe', power: 3, dmg: 7, spd: 2.2, range: 20, dur: 90, cost: { madeira: 5, pedra: 4 }, tier: 1 },
  pick1:   { n: 'Picareta de pedra', kind: 'pick', power: 3, dmg: 6, spd: 2, range: 20, dur: 90, cost: { madeira: 5, pedra: 5 }, tier: 1 },
  hammer:  { n: 'Martelo', kind: 'hammer', power: 1, dmg: 6, spd: 2.4, range: 20, dur: 150, cost: { madeira: 4, pedra: 3 }, tier: 1 },
  spear:   { n: 'Lança', kind: 'melee', dmg: 13, spd: 1.8, range: 30, dur: 70, cost: { madeira: 6, pedra: 3 }, tier: 1 },
  bat:     { n: 'Taco com pregos', kind: 'melee', dmg: 17, spd: 1.5, range: 22, dur: 80, cost: { madeira: 8, sucata: 3 }, tier: 1 },
  axe2:    { n: 'Machado de ferro', kind: 'axe', power: 6, dmg: 12, spd: 2.4, range: 22, dur: 160, cost: { madeira: 6, sucata: 8 }, tier: 2 },
  pick2:   { n: 'Picareta de ferro', kind: 'pick', power: 6, dmg: 10, spd: 2.2, range: 22, dur: 160, cost: { madeira: 6, sucata: 10 }, tier: 2 },
  sledge:  { n: 'Marreta', kind: 'melee', dmg: 34, spd: 0.9, range: 24, knock: 3, dur: 140, cost: { pedra: 12, madeira: 6 }, tier: 2 },
  machete: { n: 'Facão', kind: 'melee', dmg: 22, spd: 2.4, range: 22, dur: 120, cost: { sucata: 12, madeira: 3 }, tier: 2 },
  pistol:  { n: 'Pistola', kind: 'gun', dmg: 15, spd: 3, range: 150, spread: 0.05, dur: 200, cost: { sucata: 15, pecas: 2 }, tier: 2 },
  helmet:  { n: 'Capacete', kind: 'head', armor: 3, dur: 120, cost: { sucata: 8 }, tier: 2 },
  armor:   { n: 'Armadura de sucata', kind: 'body', armor: 6, dur: 160, cost: { sucata: 16, madeira: 4 }, tier: 2 },
  axe3:    { n: 'Machado de aço', kind: 'axe', power: 10, dmg: 18, spd: 2.6, range: 22, dur: 260, cost: { sucata: 18, pecas: 2, madeira: 4 }, tier: 3 },
  pick3:   { n: 'Picareta de aço', kind: 'pick', power: 10, dmg: 15, spd: 2.4, range: 22, dur: 260, cost: { sucata: 20, pecas: 2, madeira: 4 }, tier: 3 },
  shotgun: { n: 'Espingarda', kind: 'gun', dmg: 10, pellets: 5, spd: 1.1, range: 95, spread: 0.28, dur: 200, cost: { sucata: 25, pecas: 4, madeira: 6 }, tier: 3 },
  rifle:   { n: 'Rifle', kind: 'gun', dmg: 40, spd: 1, range: 260, spread: 0.01, pierce: 2, dur: 220, cost: { sucata: 30, pecas: 6 }, tier: 3 },
  smg:     { n: 'Submetralhadora', kind: 'gun', dmg: 9, spd: 8, range: 140, spread: 0.13, dur: 320, cost: { sucata: 28, pecas: 6 }, tier: 3 },
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
  { id: 'curativo', n: '1 curativo', cost: { tecido: 2 }, give: { curativo: 1 }, tier: 1 },
  { id: 'municao', n: '10 munições', cost: { sucata: 3 }, give: { municao: 10 }, tier: 2 },
];
const BENCH_NAMES = { 1: 'Bancada de madeira', 2: 'Bancada de pedra', 3: 'Oficina de metal' };
const BENCH_OBJ = { 1: O.BENCH, 2: O.BENCH2, 3: O.BENCH3 };

// ---------- Zombies ----------
// from: first day they show up. w: how often they are picked. Stronger each day (see zScale).
const ZT = {
  comum:      { n: 'Zumbi', hp: 30, spd: 26, dmg: 6, r: 5, from: 1, w: 10, pal: 'z1' },
  rastejante: { n: 'Rastejante', hp: 18, spd: 34, dmg: 5, r: 4, from: 2, w: 4, pal: 'z8', crawl: true },
  veloz:      { n: 'Zumbi veloz', hp: 22, spd: 48, dmg: 6, r: 5, from: 3, w: 4, pal: 'z2' },
  bruto:      { n: 'Brutamonte', hp: 130, spd: 18, dmg: 22, r: 7, from: 5, w: 2, pal: 'z3', big: true },
  cuspidor:   { n: 'Cuspidor', hp: 40, spd: 22, dmg: 7, r: 5, from: 7, w: 3, pal: 'z4', spit: 80 },
  blindado:   { n: 'Blindado', hp: 70, spd: 22, dmg: 10, r: 5, from: 9, w: 3, pal: 'z6', armor: 6 },
  inchado:    { n: 'Inchado', hp: 45, spd: 20, dmg: 8, r: 6, from: 11, w: 2, pal: 'z7', boom: true },
  gritador:   { n: 'Gritador', hp: 50, spd: 30, dmg: 6, r: 5, from: 13, w: 1.5, pal: 'z9', scream: true },
  colosso:    { n: 'Colosso', hp: 650, spd: 20, dmg: 34, r: 9, pal: 'z5', big: true, boss: true },
};
// How dangerous the world is, by day.
const THREAT = [[1, 'Calma', '#93c46c'], [3, 'Inquieta', '#d6c45a'], [6, 'Perigosa', '#e9a64b'], [10, 'Mortal', '#e0604f'], [15, 'Apocalipse', '#c06ae0']];

// ---------- Animals ----------
// feeds: how many times you feed them (each costs `food` comida) to tame them.
// prod: what a tamed animal gives every `every` seconds.
const ANIMALS = {
  galinha: { n: 'Galinha', hp: 12, spd: 30, feeds: 1, food: 1, prod: { comida: 2 }, every: 100, item: 'ovos', meat: 2, r: 3, w: 5 },
  ovelha:  { n: 'Ovelha', hp: 30, spd: 26, feeds: 2, food: 2, prod: { tecido: 2 }, every: 200, item: 'lã', meat: 4, r: 5, w: 4 },
  vaca:    { n: 'Vaca', hp: 50, spd: 22, feeds: 3, food: 2, prod: { comida: 4 }, every: 160, item: 'leite', meat: 7, r: 6, w: 3 },
};

// ---------- Survivors ----------
const SPECS = {
  Lenhador: 'Corta árvores perto da base.',
  Minerador: 'Quebra pedras e sucata perto da base.',
  Agricultor: 'Colhe a horta e as frutas e recolhe ovos, lã e leite.',
  Guarda: 'Luta contra os zumbis que chegam perto.',
};
const NAMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabi', 'Heitor', 'Iara', 'João', 'Kátia', 'Léo', 'Marina', 'Nando',
  'Olívia', 'Paulo', 'Rafa', 'Sônia', 'Tiago', 'Vítor', 'Wanda', 'Yasmin', 'Zeca', 'Bia', 'Caio', 'Duda', 'Edu', 'Flávia', 'Guto', 'Helena',
  'Jade', 'Lara', 'Mateus', 'Nina', 'Otávio', 'Renan', 'Sara', 'Téo', 'Vera', 'Murilo', 'Tânia', 'Igor', 'Luana', 'Ciro'];

// ---------- Time ----------
const DAY_LEN = 360;   // seconds for a full day
const NIGHT_START = 0.6; // fraction of the day when night begins (20h)

// ---------- Stamina ----------
const STAM = { drain: 20, regen: 16, regenWalk: 10, delay: 0.5, recover: 30 };

// ---------- Tutorial ----------
// Each step: text, optional progress(), done().
const TUTORIAL = [
  { t: 'Ande com W A S D', done: () => S.stats.walked > 48 },
  { t: 'Segure o botão esquerdo numa árvore para cortar', p: () => [S.res.madeira, 8], done: () => S.res.madeira >= 8 },
  { t: 'Quebre pedras do mesmo jeito', p: () => [S.res.pedra, 4], done: () => S.res.pedra >= 4 },
  { t: 'Aperte B e construa uma Bancada de madeira (aba Base)', done: () => benchLevel() > 0 },
  { t: 'Perto da bancada, aperte E e faça um Machado de pedra', done: () => S.items.some((i) => i.base === 'axe1') },
  { t: 'Use o machado: aperte 1 a 6 para trocar de item', done: () => heldItem() && heldItem().base === 'axe1' },
  { t: 'Cerque o acampamento com paredes e uma porta (B)', p: () => [countObj(O.WALL_W) + countObj(O.WALL_S) + countObj(O.DOOR), 8], done: () => countObj(O.WALL_W) + countObj(O.WALL_S) + countObj(O.DOOR) >= 8 },
  { t: 'Sobreviva à primeira noite', done: () => S.day >= 2 },
  { t: 'Explore a cidade a leste e abra caixas com E', p: () => [S.stats.crates, 3], done: () => S.stats.crates >= 3 },
  { t: 'Construa uma Cama (precisa de tecido das caixas)', done: () => countObj(O.BED) > 0 },
  { t: 'Encontre um sobrevivente nas casas e recrute com E', done: () => S.surv.length > 0 },
  { t: 'Construa uma Bancada de pedra (B, aba Base)', done: () => benchLevel() >= 2 },
  { t: 'Fabrique uma Pistola na bancada de pedra', done: () => S.items.some((i) => i.base === 'pistol') },
  { t: 'Plante uma muda ou uma árvore frutífera (B, aba Fazenda)', done: () => (S.stats.planted || 0) > 0 },
  { t: 'Ache um animal na floresta e alimente com E até domesticar', done: () => S.animals.some((a) => a.tame) },
];
