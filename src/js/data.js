'use strict';
// ================= Static game data =================
// Rates are per minute in this file; the engine converts to per second.

const RES = {
  wood:  { n: 'Madeira',      ic: 'wood',  cap: 150 },
  metal: { n: 'Metal',        ic: 'metal', cap: 100 },
  food:  { n: 'Comida',       ic: 'food',  cap: 120 },
  water: { n: 'Água',         ic: 'water', cap: 120 },
  fuel:  { n: 'Combustível',  ic: 'fuel',  cap: 40 },
  ammo:  { n: 'Munição',      ic: 'ammo',  cap: 120 },
  meds:  { n: 'Medicamentos', ic: 'meds',  cap: 20 },
};
const MAIN_RES = Object.keys(RES);
// Rare materials have no storage limit.
const RARE = {
  parts:   { n: 'Peças eletrônicas', ic: 'parts' },
  samples: { n: 'Amostras mutantes', ic: 'samples' },
  alloy:   { n: 'Liga militar',      ic: 'alloy' },
};
const ALL_RES = [...MAIN_RES, ...Object.keys(RARE)];
const resName = (k) => (RES[k] || RARE[k]).n;
const resIcon = (k) => (RES[k] || RARE[k]).ic;

// ---------- Building formulas (L = level) ----------
const F = {
  people:   (L) => 2 + 2 * L,
  food:     (L) => (L ? 5 * L * (1 + 0.2 * (L - 1)) : 0),
  water:    (L) => (L ? 6 * L * (1 + 0.2 * (L - 1)) : 0),
  wallHp:   (L) => 60 + 90 * L * (1 + 0.25 * (L - 1)),
  wallArm:  (L) => Math.min(0.6, 0.03 * L),
  towerDps: (L) => (L ? 4 * L * (1 + 0.25 * (L - 1)) : 0),
  power:    (L) => 4 * L,
  genFuel:  (L) => 0.6 * L,
  heal:     (L) => 3 * L,
  meds:     (L) => 0.4 * L,
  ammo:     (L) => 3 * L,
  capMult:  (L) => 1 + 0.6 * L,
  gatherSlots: (L) => 2 + 2 * L,
  gatherMult:  (L) => 1 + 0.25 * L,
  distill:  (L) => 1 * L,
  slots:    (L) => (L ? Math.min(5, 1 + Math.floor(L / 2)) : 0),
};

// job: survivors can be assigned to that building. pw: power used when built.
const BLD = {
  barracas:    { n: 'Barracas', ic: 'tent', unlock: 1, max: 15, cost: { wood: 30, metal: 5 }, g: 1.7,
    d: 'Abrigo para sobreviventes. Cada nível acomoda mais pessoas.',
    fx: (L) => [`Capacidade: ${F.people(L)} pessoas`] },
  horta:       { n: 'Horta', ic: 'sprout', unlock: 1, max: 20, cost: { wood: 25 }, late: { metal: 6 }, g: 1.6, job: true,
    d: 'Produz comida. Agricultores rendem o dobro aqui.',
    fx: (L) => [`Comida: ${fmtR(F.food(L))}/min`, `Vagas: ${F.slots(L)}`] },
  reservatorio:{ n: 'Reservatório de água', ic: 'tank', unlock: 1, max: 20, cost: { wood: 30, metal: 10 }, g: 1.6, job: true,
    d: 'Coleta e filtra água. Agricultores também rendem mais aqui.',
    fx: (L) => [`Água: ${fmtR(F.water(L))}/min`, `Vagas: ${F.slots(L)}`] },
  deposito:    { n: 'Depósito', ic: 'box', unlock: 1, max: 15, cost: { wood: 40, metal: 15 }, g: 1.55,
    d: 'Aumenta o limite de armazenamento de todos os recursos.',
    fx: (L) => [`Armazenamento: +${Math.round((F.capMult(L) - 1) * 100)}%`] },
  coleta:      { n: 'Posto de coleta', ic: 'pack', unlock: 1, max: 15, cost: { wood: 35, metal: 10 }, g: 1.6,
    d: 'Organiza as equipes de coleta: mais vagas e mais rendimento.',
    fx: (L) => [`Vagas de coleta: ${F.gatherSlots(L)}`, `Rendimento: +${Math.round((F.gatherMult(L) - 1) * 100)}%`] },
  muralha:     { n: 'Muralhas defensivas', ic: 'wall', unlock: 2, max: 25, cost: { wood: 40, metal: 20 }, g: 1.6,
    d: 'Seguram as hordas longe dos sobreviventes. Consertam sozinhas usando madeira.',
    fx: (L) => [`Vida da muralha: ${fmt(F.wallHp(L) * wallTechMult())}`, `Resistência: ${Math.round(F.wallArm(L) * 100)}%`] },
  oficina:     { n: 'Oficina de fabricação', ic: 'wrench', unlock: 2, max: 5, cost: { wood: 50, metal: 30 }, late: { parts: 2 }, g: 2.2, job: true,
    d: 'Fabrica armas, armaduras e armadilhas. Cada nível libera equipamentos melhores.',
    fx: (L) => [`Equipamentos: até nível ${L}`, `Vagas: ${F.slots(L)}`] },
  torre:       { n: 'Torre de vigilância', ic: 'tower', unlock: 3, max: 20, cost: { wood: 60, metal: 40 }, g: 1.65, job: true, pw: 1,
    d: 'Atira de longe nas hordas e revela a próxima onda. Quem trabalha aqui atira com bônus.',
    fx: (L) => [`Dano da torre: ${fmtR(F.towerDps(L) * towerMult())}/s`, `Vagas: ${F.slots(L)}`] },
  enfermaria:  { n: 'Enfermaria', ic: 'cross', unlock: 3, max: 15, cost: { wood: 50, metal: 25, meds: 2 }, g: 1.65, job: true, pw: 2,
    d: 'Cura feridos, trata infecções e, com energia, produz medicamentos.',
    fx: (L) => [`Cura: ${fmtR(F.heal(L))} vida/min`, `Medicamentos: ${fmtR(F.meds(L))}/min`, `Vagas: ${F.slots(L)}`] },
  gerador:     { n: 'Gerador de energia', ic: 'bolt', unlock: 4, max: 12, cost: { wood: 30, metal: 60 }, late: { parts: 1 }, g: 1.7,
    d: 'Queima combustível para gerar energia para arsenal, enfermaria, torre e destilaria.',
    fx: (L) => [`Energia: ${fmtR(F.power(L) * (has('eletrica') ? 1.5 : 1))}`, `Consumo: até ${fmtR(F.genFuel(L))} combustível/min`] },
  arsenal:     { n: 'Arsenal', ic: 'target', unlock: 4, max: 15, cost: { wood: 40, metal: 60 }, late: { parts: 1 }, g: 1.7, job: true, pw: 2,
    d: 'Transforma metal em munição, guarda mais munição e mais equipamentos.',
    fx: (L) => [`Munição: ${fmtR(F.ammo(L))}/min (gasta metal)`, `Inventário: +${4 * L}`, `Vagas: ${F.slots(L)}`] },
  destilaria:  { n: 'Destilaria', ic: 'still', unlock: 6, max: 12, cost: { wood: 60, metal: 50 }, late: { parts: 2 }, g: 1.7, pw: 1,
    d: 'Fermenta sobras de comida e produz combustível.',
    fx: (L) => [`Combustível: ${fmtR(F.distill(L))}/min`, `Gasta ${fmtR(F.distill(L) * 2)} comida/min`] },
};
const BLD_ORDER = Object.keys(BLD);

// Survivor jobs. bld: building that must exist (and limits slots).
const JOBS = {
  livre:        { n: 'Descansando', d: 'Recupera vida mais rápido.' },
  coleta:       { n: 'Coleta', d: 'Junta madeira e metal.', match: 'Coletor' },
  horta:        { n: 'Horta', bld: 'horta', match: 'Agricultor' },
  reservatorio: { n: 'Reservatório', bld: 'reservatorio', match: 'Agricultor' },
  oficina:      { n: 'Oficina', bld: 'oficina', match: 'Engenheiro' },
  enfermaria:   { n: 'Enfermaria', bld: 'enfermaria', match: 'Médico' },
  arsenal:      { n: 'Arsenal', bld: 'arsenal', match: 'Engenheiro' },
  torre:        { n: 'Torre', bld: 'torre', match: 'Soldado' },
  defesa:       { n: 'Defesa', d: 'Guarda a muralha: +25% de dano e proteção nas hordas.', match: 'Soldado' },
};

const SPECS = {
  'Líder':      { d: 'Você. Nunca morre: se cair, fica inconsciente e se recupera.', ic: 'star' },
  'Engenheiro': { d: 'Rende mais na oficina e no arsenal; melhora a raridade e a velocidade de fabricação.', ic: 'wrench' },
  'Médico':     { d: 'Rende mais na enfermaria; reduz ferimentos nas expedições.', ic: 'cross' },
  'Soldado':    { d: '+40% de dano em combate; rende mais na torre e na defesa.', ic: 'target' },
  'Coletor':    { d: 'Rende mais na coleta; traz +20% de saque das expedições.', ic: 'pack' },
  'Agricultor': { d: 'Rende mais na horta e no reservatório.', ic: 'sprout' },
};

// ---------- Zombies ----------
const ZT = {
  comum:    { n: 'Zumbi comum',    hp: 20,  dmg: 3,  spd: 1.0, armor: 0,   from: 1,  w: 10,  size: 1,    col: '#6f8a4e' },
  veloz:    { n: 'Zumbi veloz',    hp: 14,  dmg: 3,  spd: 2.2, armor: 0,   from: 3,  w: 6,   size: 0.85, col: '#b0b85a' },
  blindado: { n: 'Zumbi blindado', hp: 45,  dmg: 4,  spd: 0.7, armor: 0.5, from: 6,  w: 4,   size: 1.15, col: '#80858c' },
  toxico:   { n: 'Zumbi tóxico',   hp: 28,  dmg: 3,  spd: 0.9, armor: 0,   from: 8,  w: 4,   size: 1,    col: '#86d13e', toxic: true },
  gigante:  { n: 'Zumbi gigante',  hp: 160, dmg: 14, spd: 0.5, armor: 0.2, from: 11, w: 1.5, size: 1.7,  col: '#6b5440' },
  mutante:  { n: 'Zumbi mutante',  hp: 80,  dmg: 7,  spd: 1.4, armor: 0.1, from: 14, w: 2,   size: 1.25, col: '#a23e50', regen: 3 },
};
const ZT_DESC = {
  comum: 'Lento e fraco, mas vem em grupo.',
  veloz: 'Corre muito: chega antes das armadilhas e dos tiros.',
  blindado: 'Restos de armadura: só metade do dano entra. Rifles atravessam.',
  toxico: 'Infecta quem luta corpo a corpo e explode contra a muralha.',
  gigante: 'Muita vida e golpes que destroem muralhas.',
  mutante: 'Rápido e regenera a vida. Mate de uma vez.',
};
const BOSSES = [
  { n: 'O Açougueiro',      hp: 320, dmg: 18, spd: 0.55, armor: 0.2, size: 2.1, col: '#8a2a22', d: 'Golpes brutais contra a muralha.' },
  { n: 'A Matriarca',       hp: 260, dmg: 10, spd: 0.6,  armor: 0.1, size: 1.9, col: '#6d3d7a', summon: true, d: 'Chama zumbis velozes enquanto vive.' },
  { n: 'Colosso Blindado',  hp: 420, dmg: 16, spd: 0.45, armor: 0.6, size: 2.3, col: '#5f6670', d: 'Quase imune a armas sem perfuração.' },
  { n: 'Rei Mutante',       hp: 380, dmg: 14, spd: 0.8,  armor: 0.2, size: 2.2, col: '#a3263c', regen: 10, d: 'Regenera muito rápido.' },
];

// ---------- Exploration ----------
// loot: [min, max]; rare: [chance, min, max]
const PLACES = {
  mercado:   { n: 'Supermercado abandonado', ic: 'cart', region: 'Subúrbio', x: 24, y: 66, dur: 45, fuel: 0, danger: 1, unlock: 1,
    d: 'Prateleiras saqueadas, mas ainda há enlatados e garrafas de água.',
    loot: { food: [15, 30], water: [10, 20], wood: [5, 15] }, rare: {}, item: 0.03, surv: 0.22, specs: ['Coletor', 'Agricultor'] },
  posto:     { n: 'Posto de gasolina', ic: 'fuel', region: 'Subúrbio', x: 12, y: 38, dur: 80, fuel: 2, danger: 2, unlock: 2,
    d: 'Tanques subterrâneos com combustível e uma loja de conveniência.',
    loot: { fuel: [8, 15], metal: [5, 12], food: [3, 8], ammo: [3, 8] }, rare: { parts: [0.35, 1, 1] }, item: 0.05, surv: 0.15, specs: ['Engenheiro', 'Coletor'] },
  hospital:  { n: 'Hospital', ic: 'cross', region: 'Centro', x: 46, y: 30, dur: 120, fuel: 3, danger: 4, unlock: 3,
    d: 'Remédios valiosos, corredores escuros e muitos infectados.',
    loot: { meds: [3, 8], water: [5, 15] }, rare: { parts: [0.3, 1, 2] }, item: 0.06, surv: 0.25, specs: ['Médico'], infect: 0.3 },
  delegacia: { n: 'Delegacia', ic: 'shield', region: 'Centro', x: 62, y: 58, dur: 180, fuel: 4, danger: 6, unlock: 4,
    d: 'O depósito de evidências ainda guarda armas e munição.',
    loot: { ammo: [20, 50], metal: [10, 20] }, rare: { parts: [0.4, 1, 2] }, item: 0.25, itemPool: ['pistola', 'espingarda', 'capacete', 'colete'], surv: 0.2, specs: ['Soldado'] },
  shopping:  { n: 'Shopping', ic: 'bag', region: 'Centro', x: 78, y: 36, dur: 300, fuel: 6, danger: 9, unlock: 6, tech: 'mapas',
    d: 'Enorme e infestado. Tem de tudo para quem voltar vivo.',
    loot: { food: [30, 60], water: [20, 40], wood: [20, 40], meds: [2, 6] }, rare: { parts: [0.6, 1, 3] }, item: 0.3, surv: 0.35, specs: ['Coletor', 'Engenheiro', 'Médico', 'Agricultor'] },
  fabrica:   { n: 'Fábrica', ic: 'factory', region: 'Zona industrial', x: 88, y: 70, dur: 480, fuel: 8, danger: 13, unlock: 8, tech: 'mapas',
    d: 'Maquinário pesado, metal e componentes eletrônicos.',
    loot: { metal: [40, 90], wood: [20, 50] }, rare: { parts: [1, 3, 8] }, item: 0.2, surv: 0.25, specs: ['Engenheiro'] },
  militar:   { n: 'Base militar', ic: 'star', region: 'Zona militar', x: 92, y: 14, dur: 900, fuel: 12, danger: 20, unlock: 12, tech: 'radiomil',
    d: 'O último ponto de evacuação. Arsenal, ligas militares e muito perigo.',
    loot: { ammo: [100, 200], metal: [30, 60], meds: [5, 10] }, rare: { alloy: [1, 2, 5], parts: [0.7, 2, 5] }, item: 0.6, minRarity: 1, surv: 0.3, specs: ['Soldado', 'Médico'] },
};
const PLACE_ORDER = Object.keys(PLACES);
const RATION = { food: 3, water: 3 }; // per squad member

// ---------- Equipment ----------
// slot: w weapon, h head, b body. range 0 = melee. pierce ignores that share of armor.
const ITEMS = {
  faca:       { n: 'Faca',                 slot: 'w', ic: 'knife',   tier: 1, dmg: 6,  spd: 1.2, range: 0,  dur: 40,  cost: { metal: 8, wood: 4 }, time: 8 },
  machado:    { n: 'Machado',              slot: 'w', ic: 'axe',     tier: 1, dmg: 11, spd: 0.8, range: 0,  dur: 50,  cost: { metal: 12, wood: 10 }, time: 12 },
  pistola:    { n: 'Pistola',              slot: 'w', ic: 'pistol',  tier: 2, dmg: 9,  spd: 1.0, range: 25, dur: 60,  cost: { metal: 25, parts: 1 }, time: 20, ammo: true },
  espingarda: { n: 'Espingarda',           slot: 'w', ic: 'shotgun', tier: 3, dmg: 8,  spd: 0.6, range: 16, dur: 60,  cost: { metal: 45, wood: 15, parts: 3 }, time: 35, ammo: true, multi: 3 },
  rifle:      { n: 'Rifle',                slot: 'w', ic: 'rifle',   tier: 4, dmg: 24, spd: 0.7, range: 45, dur: 80,  cost: { metal: 70, parts: 6 }, time: 50, ammo: true, pierce: 0.5 },
  fuzil:      { n: 'Fuzil militar',        slot: 'w', ic: 'rifle',   tier: 5, dmg: 15, spd: 2.0, range: 40, dur: 100, cost: { metal: 90, parts: 8, alloy: 3 }, time: 80, ammo: true, pierce: 0.4 },
  capacete:   { n: 'Capacete improvisado', slot: 'h', ic: 'helmet',  tier: 1, res: 3,  dur: 40,  cost: { metal: 10 }, time: 8 },
  armadura:   { n: 'Armadura de sucata',   slot: 'b', ic: 'armor',   tier: 2, res: 7,  dur: 60,  cost: { metal: 35, wood: 10 }, time: 25 },
  capmil:     { n: 'Capacete militar',     slot: 'h', ic: 'helmet',  tier: 4, res: 8,  dur: 80,  cost: { metal: 40, parts: 3 }, time: 40 },
  colete:     { n: 'Colete antibalas',     slot: 'b', ic: 'vest',    tier: 4, res: 14, dur: 90,  cost: { metal: 50, parts: 5 }, time: 50 },
  tatica:     { n: 'Armadura tática',      slot: 'b', ic: 'armor',   tier: 5, res: 22, dur: 120, cost: { metal: 80, parts: 6, alloy: 4 }, time: 90 },
};
const SLOT_N = { w: 'Arma', h: 'Cabeça', b: 'Corpo' };
const RAR = [
  { n: 'Comum',    c: 'r0', m: 1,    max: 3 },
  { n: 'Incomum',  c: 'r1', m: 1.2,  max: 5 },
  { n: 'Raro',     c: 'r2', m: 1.45, max: 7 },
  { n: 'Épico',    c: 'r3', m: 1.8,  max: 9 },
  { n: 'Lendário', c: 'r4', m: 2.3,  max: 12 },
];
const TRAPS = {
  estaca: { n: 'Armadilha de estacas', dmg: 45,  cost: { wood: 15, metal: 5 }, time: 6,  tech: 'armadilhas', d: 'Fere o primeiro zumbi que pisar nela.' },
  mina:   { n: 'Mina caseira',         dmg: 140, cost: { metal: 15, fuel: 3, parts: 1 }, time: 15, tech: 'explosivos', d: 'Explode e atinge vários zumbis próximos.', area: 6 },
};
const AMMO_RECIPE = { cost: { metal: 4 }, out: 10, time: 10 };

// ---------- Technologies ----------
const TECH = {
  // Sobrevivência
  agricultura: { n: 'Rotação de culturas', br: 'Sobrevivência', lvl: 2, cost: { wood: 60, food: 30 }, time: 40, d: '+25% de comida.' },
  filtros:     { n: 'Filtros de água', br: 'Sobrevivência', lvl: 2, cost: { wood: 50, metal: 20 }, time: 40, d: '+25% de água.' },
  racionamento:{ n: 'Racionamento', br: 'Sobrevivência', lvl: 4, req: ['agricultura', 'filtros'], cost: { food: 80, water: 80 }, time: 90, d: '-15% de consumo de comida e água.' },
  conservas:   { n: 'Conservas', br: 'Sobrevivência', lvl: 5, req: ['racionamento'], cost: { metal: 80, food: 100 }, time: 120, d: '+50% de armazenamento de comida e água.' },
  hidroponia:  { n: 'Hidroponia', br: 'Sobrevivência', lvl: 9, req: ['conservas'], cost: { metal: 200, water: 200, parts: 6 }, time: 300, d: '+50% de comida e água.' },
  // Defesa
  barricadas:  { n: 'Barricadas reforçadas', br: 'Defesa', lvl: 2, cost: { wood: 80, metal: 30 }, time: 45, d: '+30% de vida da muralha.' },
  armadilhas:  { n: 'Armadilhas', br: 'Defesa', lvl: 3, cost: { wood: 60, metal: 40 }, time: 60, d: 'Libera armadilhas de estacas na oficina.' },
  vigias:      { n: 'Turnos de vigia', br: 'Defesa', lvl: 3, cost: { wood: 70, food: 40 }, time: 60, d: 'Hordas demoram 30s a mais e você vê a composição da próxima onda.' },
  balistica:   { n: 'Balística', br: 'Defesa', lvl: 5, req: ['vigias'], cost: { metal: 120, ammo: 60, parts: 2 }, time: 120, d: '+20% de dano com armas de fogo.' },
  holofotes:   { n: 'Holofotes', br: 'Defesa', lvl: 6, req: ['vigias'], cost: { metal: 120, parts: 4 }, time: 150, d: '+35% de dano da torre.' },
  explosivos:  { n: 'Explosivos caseiros', br: 'Defesa', lvl: 7, req: ['armadilhas'], cost: { metal: 120, fuel: 30, parts: 4 }, time: 180, d: 'Libera minas caseiras e +30% de dano das armadilhas.' },
  concreto:    { n: 'Concreto armado', br: 'Defesa', lvl: 10, req: ['barricadas'], cost: { wood: 300, metal: 300, parts: 8 }, time: 360, d: '+50% de vida e +10% de resistência da muralha.' },
  // Indústria
  ferramentas: { n: 'Ferramentas melhores', br: 'Indústria', lvl: 2, cost: { wood: 50, metal: 30 }, time: 40, d: '+25% de coleta (manual e equipes).' },
  reciclagem:  { n: 'Reciclagem', br: 'Indústria', lvl: 4, req: ['ferramentas'], cost: { metal: 90, wood: 60 }, time: 90, d: '+15% de metal e desmontar devolve 60% dos materiais.' },
  recarga:     { n: 'Recarga de munição', br: 'Indústria', lvl: 5, cost: { metal: 120, parts: 2 }, time: 120, d: '+50% de produção de munição.' },
  eletrica:    { n: 'Rede elétrica', br: 'Indústria', lvl: 6, cost: { metal: 150, parts: 4 }, time: 150, d: '+50% de energia dos geradores.' },
  forja:       { n: 'Forja', br: 'Indústria', lvl: 7, req: ['reciclagem'], cost: { metal: 200, wood: 100, parts: 5 }, time: 200, d: 'Mais chance de equipamentos raros e reparos 50% mais baratos.' },
  metalurgia:  { n: 'Metalurgia militar', br: 'Indústria', lvl: 12, req: ['forja'], cost: { metal: 400, parts: 10, alloy: 2 }, time: 420, d: 'Equipamentos de nível 5 na oficina (com a oficina no nível 5).' },
  // Exploração
  mochilas:    { n: 'Mochilas reforçadas', br: 'Exploração', lvl: 3, cost: { wood: 60, metal: 20 }, time: 50, d: '+25% de saque nas expedições.' },
  mapas:       { n: 'Mapas da cidade', br: 'Exploração', lvl: 5, cost: { wood: 100, fuel: 15 }, time: 100, d: 'Libera o shopping e a fábrica.' },
  radio:       { n: 'Rádio amador', br: 'Exploração', lvl: 5, cost: { metal: 80, parts: 3 }, time: 120, d: 'Permite chamar sobreviventes pelo rádio.' },
  veiculo:     { n: 'Veículo blindado', br: 'Exploração', lvl: 7, req: ['mapas'], cost: { metal: 250, fuel: 40, parts: 6 }, time: 240, d: '-30% de duração das expedições e -25% de perigo.' },
  rotas:       { n: 'Rotas seguras', br: 'Exploração', lvl: 8, req: ['mapas'], cost: { wood: 200, metal: 150, fuel: 30 }, time: 240, d: 'Permite repetir expedições automaticamente.' },
  radiomil:    { n: 'Frequência militar', br: 'Exploração', lvl: 11, req: ['radio', 'veiculo'], cost: { metal: 300, parts: 10, fuel: 60 }, time: 400, d: 'Libera a base militar.' },
  // Medicina
  socorros:    { n: 'Primeiros socorros', br: 'Medicina', lvl: 3, cost: { meds: 3, water: 40 }, time: 50, d: '+50% de recuperação de vida.' },
  antidoto:    { n: 'Antídoto', br: 'Medicina', lvl: 6, req: ['socorros'], cost: { meds: 8, parts: 2 }, time: 120, d: 'Infecções são tratadas sem gastar medicamentos 50% das vezes e 40% menos chance de infecção.' },
  laboratorio: { n: 'Laboratório', br: 'Medicina', lvl: 8, req: ['socorros'], cost: { metal: 150, meds: 10, parts: 5 }, time: 240, d: 'Dobra a produção de medicamentos da enfermaria.' },
  vacina:      { n: 'Vacina experimental', br: 'Medicina', lvl: 12, req: ['antidoto'], cost: { meds: 20, samples: 3, parts: 6 }, time: 420, d: 'Sobreviventes ficam imunes a infecções.' },
};
const TECH_BRANCHES = ['Sobrevivência', 'Defesa', 'Indústria', 'Exploração', 'Medicina'];

// ---------- Prestige ----------
const PERKS = {
  prod:    { n: 'Mãos calejadas',     d: '+10% em toda produção por nível.', max: 20 },
  coleta:  { n: 'Olhos de catador',   d: '+15% de coleta manual e das equipes por nível.', max: 20 },
  muro:    { n: 'Engenharia defensiva', d: '+10% de vida da muralha e dano da torre por nível.', max: 20 },
  inicio:  { n: 'Suprimentos guardados', d: 'Começa com mais recursos e um sobrevivente extra a cada 2 níveis.', max: 10 },
  exped:   { n: 'Batedores',          d: '-8% de duração das expedições por nível.', max: 6 },
  armazem: { n: 'Estoque organizado', d: '+15% de armazenamento por nível.', max: 15 },
  sorte:   { n: 'Sorte de sobrevivente', d: 'Mais chance de itens raros por nível.', max: 10 },
  offline: { n: 'Rotina automática',  d: '+2h de progresso enquanto você está fora por nível.', max: 8 },
};

// ---------- Names ----------
const NAMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabi', 'Heitor', 'Iara', 'João', 'Kátia', 'Léo', 'Marina', 'Nando', 'Olívia',
  'Paulo', 'Quésia', 'Rafa', 'Sônia', 'Tiago', 'Úrsula', 'Vítor', 'Wanda', 'Xande', 'Yasmin', 'Zeca', 'Bia', 'Caio', 'Duda', 'Edu', 'Flávia',
  'Guto', 'Helena', 'Ícaro', 'Jade', 'Kauã', 'Lara', 'Mateus', 'Nina', 'Otávio', 'Pietra', 'Renan', 'Sara', 'Téo', 'Vera', 'Wesley', 'Zuleica',
  'Dona Neide', 'Seu Jorge', 'Cris', 'Mel', 'Rogério', 'Lívia', 'Murilo', 'Tânia', 'Igor', 'Débora', 'Sandro', 'Luana', 'Ciro'];
const SURNAMES = ['Silva', 'Souza', 'Lima', 'Costa', 'Rocha', 'Alves', 'Pereira', 'Nunes', 'Moura', 'Teixeira', 'Barros', 'Freitas', 'Campos', 'Pinto', 'Ramos', 'Duarte'];

// ---------- Formatting ----------
function fmt(n) {
  n = Math.floor(n + 1e-9);
  const a = Math.abs(n);
  if (a < 10000) return String(n);
  const u = [['B', 1e9], ['M', 1e6], ['K', 1e3]];
  for (const [s, v] of u) if (a >= v) return (n / v).toFixed(a >= v * 100 ? 0 : 1).replace('.', ',') + s;
  return String(n);
}
// Rates: one decimal under 10.
function fmtR(n) {
  const a = Math.abs(n);
  if (a >= 100) return fmt(n);
  return (Math.round(n * 10) / 10).toString().replace('.', ',');
}
function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}min`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
