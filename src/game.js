'use strict';
// ================= Base =================
// World view is 240x168 (15x10.5 tiles, GBA-like zoom); the UI layer keeps a 320x224 logical grid.
const TS=16, W=240, H=168, UIW=320, UIH=224;
const cv=document.getElementById('cv');let ctx=cv.getContext('2d');
ctx.imageSmoothingEnabled=false;
const $=id=>document.getElementById(id);
const rand=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
const pick=a=>a[Math.floor(Math.random()*a.length)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function hash(x,y){let h=(x*374761393+y*668265263)|0;h=Math.imul(h^(h>>>13),1274126177);return (h^(h>>>16))>>>1;}
const fmt=n=>'R$ '+Math.round(n).toLocaleString('pt-BR');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Escape text and wrap runs of digits in the number font
const numHTML=s=>esc(s).replace(/\d(?:[\d.,:]*\d)?/g,m=>`<span class="n">${m}</span>`);
function wrapDigits(el){
  const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),nodes=[];
  while(w.nextNode())if(/\d/.test(w.currentNode.nodeValue))nodes.push(w.currentNode);
  for(const t of nodes){const s=document.createElement('span');s.innerHTML=numHTML(t.nodeValue);t.replaceWith(...s.childNodes);}
}
const capF=s=>s.charAt(0).toUpperCase()+s.slice(1);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function R(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(x,y,w,h);}
const DIRS={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
const OPP={up:'down',down:'up',left:'right',right:'left'};
const DOW=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];

// ================= Game data =================
const SECTORS=[
  {id:'padaria',label:'Padaria',p:'bolo',pp:'bolos',m:'farinha',coName:'Doce Pixel'},
  {id:'tech',label:'Tecnologia',p:'gadget',pp:'gadgets',m:'componentes',coName:'ByteVale'},
  {id:'moda',label:'Moda',p:'camiseta',pp:'camisetas',m:'tecido',coName:'Ponto Fino'},
];
const LEVELS=[
  {name:'Garagem',maxEmp:1,price:0,bonus:1,prop:0},
  {name:'Sala Comercial',maxEmp:3,price:2500,bonus:1.1,prop:2500},
  {name:'Escritório',maxEmp:6,price:9000,bonus:1.25,prop:11000},
  {name:'Torre Corporativa',maxEmp:12,price:30000,bonus:1.5,prop:40000},
];
const QUALITY_COST=[0,400,1200,3500,9000];
const BASE_PRICE=25, ENERGY_PER=8, MIN_PER=15;
const NAMES=['Lucas','Júlia','Pedro','Bia','Rafael','Camila','Diego','Larissa','Thiago','Fernanda','Gabriel','Sofia','Mateus','Clara','Igor','Paula','Bruno','Letícia','Caio','Nina','Otávio','Yasmin','Renato','Elisa'];
const SKINS=['#f8d0a8','#e8b088','#c88858','#8a5a38','#f0c8a0'];
const HAIRS=['#3a2a20','#6a3a20','#202020','#c89040','#a03a2a','#e0d8c8','#5a3a7a'];
const SHIRTS=['#e04848','#4878e0','#48a858','#e0a030','#a050c0','#30a0a0','#e070a0','#606870','#f0f0f0'];
const PANTS=['#304060','#403020','#505860','#202830','#6a4a30'];
const randPal=()=>({skin:pick(SKINS),hair:pick(HAIRS),shirt:pick(SHIRTS),pants:pick(PANTS),shoe:'#2a2a2a',long:Math.random()<.5});
const PLAYER_PAL={skin:'#f8d0a8',hair:'#4a2a18',shirt:'#3070c8',pants:'#2c3448',shoe:'#2a2a2a',cap:'#d84040',capD:'#a02828'};
const RAMOS_PAL={skin:'#f0c8a0',hair:'#ececec',shirt:'#7a5a3a',pants:'#4a3a2a',shoe:'#2a2a2a'};

let S=null; // save state
function newState(name,coName,sector){
  return {v:1,name,coName,sector,day:1,min:8*60,energy:100,money:500,debt:0,materials:0,stock:0,
    level:1,quality:1,rep:0,campaigns:0,autoBuy:false,petDay:0,
    machines:0,rounds:0,lastExport:-9,fairSold:0,event:null,
    employees:[],candidates:[],orders:[],priceF:1,soldToday:0,
    stats:{produced:0,sold:0,revenue:0,ordersDone:0,hired:0},goals:[],won:false,
    pos:{map:'casa',x:2,y:4,dir:'down'}};
}
const sec=()=>SECTORS.find(s=>s.id===S.sector)||SECTORS[0];
const lvl=()=>LEVELS[S.level-1];
const qMult=()=>1+0.3*(S.quality-1);
const evId=()=>S&&S.event?S.event.id:null;
const unitPrice=()=>Math.round(BASE_PRICE*qMult()*S.priceF*(1+S.rep/200)*(evId()==='festival'?1.3:1));
const matPrice=()=>Math.max(1,Math.round([8,8,7,6][S.level-1]*(evId()==='crise'?1.5:evId()==='promo'?0.7:1)));
const demandCap=()=>{let c=20+Math.floor(S.rep/2)+(S.level-1)*15;if(evId()==='festival')c+=15;if(evId()==='chuva')c=Math.floor(c*.7);return c;};
const companyValue=()=>S.money-S.debt+lvl().prop+S.employees.length*500+(S.quality-1)*1500+S.rep*100+S.stock*10+S.machines*2000;
const EV_LABEL={festival:'🎉 Festival',chuva:'🌧 Chuva',crise:'📉 Crise de material',promo:'🏷 Promoção',influencer:'📱 Viralizou',inspecao:'🔍 Inspeção',turista:'🧳 Turista',gripe:'🤒 Gripe'};
function rollEvent(){
  S.event=null;
  if(S.day<3||Math.random()<.4)return;
  const pool=['festival','chuva','chuva','crise','promo','influencer','inspecao','turista'];
  if(S.employees.length)pool.push('gripe');
  const id=pick(pool),ev={id},s=sec();
  if(id==='festival')ev.msg='Festival da Vila! O Mercado paga 30% a mais e compra mais hoje.';
  if(id==='chuva')ev.msg='Pouca gente na rua hoje. A demanda do Mercado cai 30%.';
  if(id==='crise')ev.msg=`Crise de fornecimento: ${s.m} 50% mais caro hoje.`;
  if(id==='promo')ev.msg=`Promoção no Mercado: ${s.m} 30% mais barato hoje!`;
  if(id==='influencer'){S.rep=Math.min(100,S.rep+5);ev.msg=`Uma influenciadora postou sobre a ${S.coName}! +5 de reputação.`;}
  if(id==='inspecao'){
    if(S.quality>=3){S.rep=Math.min(100,S.rep+4);ev.msg='Inspeção de qualidade: aprovada com louvor! +4 de reputação.';}
    else{const f=50*S.level;S.money-=f;ev.msg=`Inspeção de qualidade: produtos abaixo do padrão, multa de ${fmt(f)}. Invista em qualidade!`;}
  }
  if(id==='turista'){const qty=rand(8,14)+S.level*2;S.orders.push({npc:'turista',qty,pay:Math.round(qty*BASE_PRICE*qMult()*2)});ev.msg=`Um turista chegou e quer ${qty} ${s.pp}, pagando o dobro! Ele está passeando perto da praça.`;}
  if(id==='gripe'){ev.sick=pick(S.employees).name;ev.msg=`${ev.sick} pegou gripe e não vai produzir esta noite.`;}
  S.event=ev;
}
const stars=n=>'★'.repeat(n)+'☆'.repeat(5-n);

const GOALS=[
  {t:'Produza seu primeiro produto',hint:'Entre na Sede (ao norte da praça) e use o computador.',check:()=>S.stats.produced>=1,reward:50},
  {t:'Venda 10 produtos',hint:'O atendente do Mercado compra sua produção.',check:()=>S.stats.sold>=10,reward:100},
  {t:'Contrate seu primeiro funcionário',hint:'Os candidatos ficam sentados no Café.',check:()=>S.stats.hired>=1,reward:150},
  {t:'Complete 3 encomendas',hint:'Moradores com um "!" querem comprar de você.',check:()=>S.stats.ordersDone>=3,reward:300},
  {t:'Junte R$ 2.500',hint:'Produza, venda e invista em qualidade.',check:()=>S.money>=2500,reward:250},
  {t:'Amplie para a Sala Comercial',hint:'Fale com a corretora no Banco.',check:()=>S.level>=2,reward:500},
  {t:'Tenha 5 funcionários',hint:'Uma sede maior cabe mais gente.',check:()=>S.employees.length>=5,reward:1000},
  {t:'Fature R$ 25.000 no total',hint:'Marketing aumenta a demanda do Mercado.',check:()=>S.stats.revenue>=25000,reward:2000},
  {t:'Conquiste a Torre Corporativa',hint:'O nível máximo de sede, à venda no Banco.',check:()=>S.level>=4,reward:5000},
  {t:'Empresa valendo R$ 100.000',hint:'Veja o valor da empresa no menu.',check:()=>companyValue()>=100000,reward:0,final:true},
];
const nextGoal=()=>GOALS.find((g,i)=>!S.goals.includes(i));

// ================= Maps =================
const WALK=new Set(['.','p','f','_','c','m','o','r']);
const MAPS={};
const gridFrom=rows=>rows.map(r=>r.split(''));
const BUILDINGS=[
  {id:'casa',x:3,y:7,w:5,h:4,door:5,sign:'CASA',st:{roof:'#d05a48',roofD:'#a03a30',roofL:'#ea8a72',wall:'#f4ead4'}},
  {id:'sede',x:20,y:6,w:7,h:5,door:23,sign:'SEDE'},
  {id:'mercado',x:2,y:19,w:6,h:4,door:5,sign:'MERCADO',st:{roof:'#4a80d0',roofD:'#30589a',roofL:'#80b0ec',wall:'#f4ead4'}},
  {id:'cafe',x:9,y:19,w:5,h:4,door:11,sign:'CAFE',st:{roof:'#e0902e',roofD:'#a8641a',roofL:'#f4b860',wall:'#f8ecd6'}},
  {id:'banco',x:19,y:19,w:6,h:4,door:22,sign:'BANCO',st:{roof:'#4f9a6a',roofD:'#336e48',roofL:'#7cc092',wall:'#ece8e0'}},
];
const SEDE_ST=[
  {roof:'#8a8a92',roofD:'#62626a',roofL:'#b0b0b8',wall:'#d8d4cc'},
  {roof:'#38a0a0',roofD:'#257070',roofL:'#68c8c8',wall:'#eef0ec'},
  {roof:'#5060c0',roofD:'#384490',roofL:'#8090e0',wall:'#eef0f4'},
  {roof:'#323a4c',roofD:'#1e2432',roofL:'#5a6478',wall:'#e2e8f0'},
];
const SIGNS={
  'town:17,13':'Vila Empreendedora — onde grandes empresas começam pequenas.',
  'town:14,5':()=>S.level>=2?'↑ Parque Norte: Fornecedor, Feira de fim de semana e investidores.':'Estrada Norte: em obras. Abre quando sua empresa chegar à Sala Comercial.',
  'town:30,14':()=>S.level>=3?'→ Distrito Industrial: Fábrica e Porto de exportação.':'Distrito Industrial: acesso só para empresas com Escritório (nível 3).',
  'parque:13,16':'Parque Norte — Feira aos sábados e domingos.',
  'industria:13,6':'Porto da Vila — exportação no fim do píer.',
};
const LOCK_N='A Estrada Norte está em obras. Ela abre quando sua empresa chegar à Sala Comercial (nível 2).';
const LOCK_E='Distrito Industrial: acesso só para empresas com Escritório (nível 3).';

function buildTown(){
  const w=32;let h=26;const g=[...Array(h)].map(()=>Array(w).fill('.'));
  const set=(x,y,c)=>{if(x>=0&&y>=0&&x<w&&y<h)g[y][x]=c;};
  const rect=(x,y,rw,rh,c)=>{for(let j=0;j<rh;j++)for(let i=0;i<rw;i++)set(x+i,y+j,c);};
  for(let x=0;x<w;x++){set(x,0,'T');set(x,1,'T');set(x,h-1,'T');}
  for(let y=0;y<h;y++){set(0,y,'T');set(w-1,y,'T');}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(g[y][x]==='.'&&hash(x,y)%13===0)g[y][x]='f';
  rect(1,12,30,2,'p'); rect(15,2,2,23,'p'); rect(1,21,24,1,'p');
  rect(5,8,1,4,'p'); rect(23,8,1,4,'p'); set(5,20,'p'); set(11,20,'p'); set(22,20,'p');
  rect(25,19,4,4,'w');
  for(let x=9;x<=13;x++){set(x,5,'F');set(x,9,'F');}
  for(let y=5;y<=9;y++){set(9,y,'F');set(13,y,'F');}
  rect(10,6,3,3,'f');
  [[10,3],[12,3],[2,10],[28,9],[29,15],[2,23],[6,23],[10,23],[13,23],[18,23],[27,24],[29,5],[8,15],[29,17]].forEach(([x,y])=>set(x,y,'T'));
  set(17,10,'Z'); set(14,2,'Z');
  // extra forest rows on top, so tall buildings have room
  for(let i=0;i<3;i++)g.unshift(Array(w).fill('T'));
  h=g.length;
  for(let y=0;y<5;y++){g[y][15]='p';g[y][16]='p';}
  g[15][31]='p';g[16][31]='p';g[14][30]='Z';
  const deco=(list,c)=>list.forEach(([x,y])=>{if(g[y][x]==='.'||g[y][x]==='f')g[y][x]=c;});
  deco([[14,14],[17,14],[4,14],[25,14],[14,25],[18,25]],'L');
  deco([[4,11],[6,11],[21,11],[25,11],[3,23],[7,23],[9,23],[13,23],[20,23],[24,23]],'H');
  deco([[29,23],[29,21],[3,27]],'Q');
  const solid=new Uint8Array(w*h);
  for(const b of BUILDINGS){for(let j=0;j<b.h;j++)for(let i=0;i<b.w;i++){solid[(b.y+j)*w+b.x+i]=1;g[b.y+j][b.x+i]='.';}}
  MAPS.town={id:'town',name:'Vila Empreendedora',tiles:g,w,h,solid,outdoor:true,buildings:BUILDINGS,
    warps:[{x:5,y:10,to:'casa'},{x:23,y:10,to:'sede'},{x:5,y:22,to:'mercado'},{x:11,y:22,to:'cafe'},{x:22,y:22,to:'banco'},
      {x:15,y:0,to:'parque',tx:11,ty:16,dir:'up'},{x:16,y:0,to:'parque',tx:12,ty:16,dir:'up'},
      {x:31,y:15,to:'industria',tx:1,ty:7,dir:'right'},{x:31,y:16,to:'industria',tx:1,ty:8,dir:'right'}],
    barriers:[{x:15,y:3,lock:()=>S.level<2,msg:LOCK_N},{x:16,y:3,lock:()=>S.level<2,msg:LOCK_N},
      {x:30,y:15,lock:()=>S.level<3,msg:LOCK_E},{x:30,y:16,lock:()=>S.level<3,msg:LOCK_E}],npcs:[]};
}
function blankOutdoor(w,h){
  const g=[...Array(h)].map(()=>Array(w).fill('.'));
  for(let x=0;x<w;x++){g[0][x]='T';g[h-1][x]='T';}
  for(let y=0;y<h;y++){g[y][0]='T';g[y][w-1]='T';}
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++)if(hash(x+50,y+90)%11===0)g[y][x]='f';
  return g;
}
function mkOutdoor(id,name,g,buildings,warps){
  const h=g.length,w=g[0].length,solid=new Uint8Array(w*h);
  for(const b of buildings)for(let j=0;j<b.h;j++)for(let i=0;i<b.w;i++){solid[(b.y+j)*w+b.x+i]=1;g[b.y+j][b.x+i]='.';}
  MAPS[id]={id,name,tiles:g,w,h,solid,outdoor:true,buildings,warps,npcs:[],baseNpcs:[]};
}
function buildPark(){
  const w=24,h=18,g=blankOutdoor(w,h);
  const set=(x,y,c)=>{g[y][x]=c;},rect=(x,y,rw,rh,c)=>{for(let j=0;j<rh;j++)for(let i=0;i<rw;i++)set(x+i,y+j,c);};
  for(let x=0;x<w;x++)set(x,1,'T');
  rect(11,9,2,9,'p');rect(3,8,18,2,'p');
  rect(15,2,5,4,'w');
  rect(3,3,3,1,'u');rect(3,4,3,1,'v');rect(3,5,3,1,'n');
  rect(8,3,3,1,'q');rect(8,4,3,1,'v');rect(8,5,3,1,'n');
  [[6,12],[7,12],[16,12],[17,12]].forEach(([x,y])=>set(x,y,'j'));
  [[2,13],[5,15],[8,14],[19,14],[21,11],[15,15],[21,6],[2,6]].forEach(([x,y])=>set(x,y,'T'));
  set(13,16,'Z');
  [[10,10],[13,10]].forEach(([x,y])=>set(x,y,'L'));
  [[14,3],[20,4],[14,6]].forEach(([x,y])=>set(x,y,'H'));
  set(20,2,'Q');
  mkOutdoor('parque','Parque Norte',g,[],[{x:11,y:17,to:'town',tx:15,ty:1,dir:'down'},{x:12,y:17,to:'town',tx:16,ty:1,dir:'down'}]);
}
function buildIndustry(){
  const w=22,h=16,g=blankOutdoor(w,h);
  const set=(x,y,c)=>{g[y][x]=c;},rect=(x,y,rw,rh,c)=>{for(let j=0;j<rh;j++)for(let i=0;i<rw;i++)set(x+i,y+j,c);};
  rect(0,7,15,2,'p');rect(14,9,1,3,'p');set(6,6,'p');
  rect(16,9,5,6,'w');
  for(let x=15;x<=18;x++)set(x,11,'o');
  [[11,3],[12,3],[12,4],[2,10],[3,10]].forEach(([x,y])=>set(x,y,'x'));
  [[11,12],[5,13],[8,11],[19,3],[18,5]].forEach(([x,y])=>set(x,y,'T'));
  set(13,6,'Z');
  set(5,9,'L');set(11,6,'L');set(19,7,'Q');set(2,12,'Q');
  mkOutdoor('industria','Distrito Industrial',g,
    [{id:'fabrica',x:3,y:1,w:7,h:5,door:6,sign:'FABRICA',st:{roof:'#7a8088',roofD:'#585e66',roofL:'#a0a6ae',wall:'#d8d0c0'}}],
    [{x:6,y:5,to:'fabrica'},{x:0,y:7,to:'town',tx:30,ty:15,dir:'left'},{x:0,y:8,to:'town',tx:30,ty:16,dir:'left'}]);
}
function mkRoom(id,name,rows,spawn,back,backMap='town',opts={}){
  const tiles=gridFrom(rows), h=tiles.length, w=tiles[0].length;
  let mx=0; for(let x=0;x<w;x++) if(tiles[h-1][x]==='m') mx=x;
  MAPS[id]=Object.assign({id,name,tiles,w,h,spawn,warps:[{x:mx,y:h-1,to:backMap,tx:back[0],ty:back[1],dir:'down'}],npcs:[],baseNpcs:[]},opts);
}
// Interior legend: I bookshelf, B/Y bed, h nightstand, J floor lamp, V TV, r rug, U sofa, O kitchen/pastry case, R fridge,
// t table, C chair, P plant, k counter, i register, e produce crate, g drinks cooler, S shelf, s water cooler, b barrels, K coffee machine
// walls: W window, A painting, z clock, d chalk menu, G whiteboard
function buildInteriors(){
  mkRoom('casa','Sua Casa',[
    'X#########X',
    'X#W#z#A#W#X',
    'XIBh___J_VX',
    'X_Y__rrrr_X',
    'X____rUUr_X',
    'XOO__rrrr_X',
    'XR___tC___X',
    'XP_______PX',
    'XXXXXmXXXXX'],[5,7],[5,11],'town',{floor:'wood',wallSty:'casa',rug:'#b85a4a',sofa:'#5a7ab8',cloth:'#f4e8d8'});
  mkRoom('mercado','Mercado',[
    'X###########X',
    'X#W#d###W#z#X',
    'XggS___eeeSSX',
    'X___________X',
    'Xkik__eee_e_X',
    'X___________X',
    'X_SS__rrr_SSX',
    'XP_________PX',
    'XXXXXXmXXXXXX'],[6,7],[5,23],'town',{floor:'tile',wallSty:'mercado',rug:'#4a8a5a'});
  mkRoom('banco','Banco da Vila',[
    'X###########X',
    'X#W#A#z#A#W#X',
    'XP_I_____IJPX',
    'X___________X',
    'X_kkkkkkkkk_X',
    'X___________X',
    'XUU_rrrrr_UUX',
    'XP___rrr___PX',
    'XXXXXXmXXXXXX'],[6,7],[22,23],'town',{floor:'marble',wallSty:'banco',rug:'#8a2a3a',sofa:'#3e6a52'});
  mkRoom('cafe','Café Expresso',[
    'X###########X',
    'X#d#W#A#W#z#X',
    'XK_O_______PX',
    'Xkikk_______X',
    'X____CtC_CtCX',
    'X___________X',
    'XP__CtC__rr_X',
    'XJ_________PX',
    'XXXXXXmXXXXXX'],[6,7],[11,23],'town',{floor:'dark',wallSty:'cafe',rug:'#c8783a',cloth:'#f4dcc8'});
  mkRoom('fabrica','Fábrica',[
    'X#########X',
    'X#W#z#G#W#X',
    'Xbb_____JbX',
    'X_M_M_M_M_X',
    'X_________X',
    'X_________X',
    'XSb_____bPX',
    'XXXXXmXXXXX'],[5,6],[6,6],'industria',{floor:'concrete',wallSty:'fabrica'});
}
function buildSede(){
  const [w,h]=[[9,8],[11,9],[15,10],[19,11]][S.level-1];
  const g=[];
  for(let y=0;y<h;y++){const row=[];for(let x=0;x<w;x++){let c='_';if(y<=1)c='#';if(x===0||x===w-1||y===h-1)c='X';row.push(c);}g.push(row);}
  const cx=Math.floor(w/2);
  g[h-1][cx]='m'; g[1][2]='G';
  for(let x=4;x<w-2;x+=3) if(x!==cx) g[1][x]='W';
  if(g[1][w-3]==='#')g[1][w-3]='z';
  g[2][cx]='D'; g[2][1]='P'; g[2][w-2]='P'; g[h-2][1]='P'; g[h-2][w-2]='P'; g[2][w-3]='s';
  if(w-4!==cx)g[2][w-4]='I';
  for(let x=cx-1;x<=cx+1;x++)g[3][x]='r';
  if(S.level===1){g[3][1]='b';}else{g[h-2][2]='J';}
  const slots=[];
  for(let r=4;r+1<=h-3;r+=2)for(let c=2;c<=w-3;c+=2)slots.push({x:c,y:r});
  const desks=slots.slice(0,lvl().maxEmp);
  desks.forEach(d=>{g[d.y][d.x]='E';g[d.y+1][d.x]='C';});
  MAPS.sede={id:'sede',name:S.coName+' · '+lvl().name,tiles:g,w,h,spawn:[cx,h-2],desks,
    floor:['concrete','wood','office','office'][S.level-1],wallSty:['sede1','sede2','sede3','sede3'][S.level-1],rug:['#8a6a4a','#3e8a8a','#c8a040','#c84a4a'][S.level-1],
    warps:[{x:cx,y:h-1,to:'town',tx:23,ty:11,dir:'down'}],npcs:[],baseNpcs:[]};
}

// ================= NPCs =================
function mkNpc(o){return Object.assign({dir:'down',wander:false,moving:false,t:0,step:0,timer:1+Math.random()*2,px:o.x*TS,py:o.y*TS,hx:o.x,hy:o.y,baseDir:o.dir||'down'},o);}
const VILLAGERS=[
  {id:'lucia',name:'Dona Lúcia',x:8,y:14,pal:{skin:'#f0c8a0',hair:'#b8b8c0',shirt:'#c05080',pants:'#5a4a6a',shoe:'#3a2a2a',long:true},
    lines:['Na minha época, uma empresa começava com um caderno e muita coragem!','Quem acorda cedo produz mais antes do almoço.','Já fez entregas para os vizinhos? O povo daqui adora encomendar!']},
  {id:'beto',name:'Beto',x:18,y:17,pal:{skin:'#c88858',hair:'#202020',shirt:'#e0a030',pants:'#304060',shoe:'#2a2a2a'},
    lines:['Tô juntando dinheiro pra abrir meu próprio food truck!','O preço no Mercado muda todo dia. A TV da sua casa mostra a cotação.','Funcionário bem pago é funcionário que fica.']},
  {id:'marina',name:'Marina',x:26,y:13,pal:{skin:'#f8d0a8',hair:'#a03a2a',shirt:'#48a858',pants:'#403020',shoe:'#2a2a2a',long:true},
    lines:['Marketing é tudo! Uma boa campanha atrai clientes e talentos.','Dizem que a Torre Corporativa tem vista para a vila inteira.','Qualidade vende mais caro. Invista em pesquisa no computador da Sede!']},
  {id:'jorge',name:'Seu Jorge',x:23,y:26,pal:{skin:'#8a5a38',hair:'#e8e0d0',shirt:'#4878e0',pants:'#505860',shoe:'#2a2a2a'},
    lines:['Olhar esse lago acalma a cabeça de qualquer empresário.','Pegue empréstimo só se tiver um plano pra ele!','No meu tempo não tinha nem computador...']},
  {id:'ana',name:'Ana',x:7,y:17,pal:{skin:'#e8b088',hair:'#3a2a20',shirt:'#a050c0',pants:'#202830',shoe:'#2a2a2a',long:true},
    lines:['O Café é onde os melhores profissionais se encontram.','Que dia lindo pra empreender!','Quando a equipe cresce, a compra automática de material salva muito tempo.']},
];
function setupNpcs(){
  MAPS.town.npcs=[
    ...VILLAGERS.map(v=>mkNpc({...v,wander:true,talk:villagerTalk})),
    mkNpc({id:'ramos',name:'Sr. Ramos',x:13,y:13,pal:RAMOS_PAL,talk:ramosTalk}),
  ];
  MAPS.casa.baseNpcs=[mkNpc({id:'gato',name:'Pixel',kind:'cat',x:3,y:7,wander:true,talk:catTalk})];
  MAPS.mercado.baseNpcs=[
    mkNpc({id:'clerk',name:'Atendente',x:2,y:3,pal:{skin:'#e8b088',hair:'#202020',shirt:'#4a80d0',pants:'#304060',shoe:'#2a2a2a'},talk:marketTalk}),
    mkNpc({id:'shopper',name:'Cliente',x:10,y:5,dir:'up',pal:{skin:'#f8d0a8',hair:'#c89040',shirt:'#e070a0',pants:'#403020',shoe:'#2a2a2a',long:true},
      talk:async()=>say('Cliente: Eu sempre compro aqui. Se o produto for bom, a fama corre rápido!')}),
  ];
  MAPS.banco.baseNpcs=[
    mkNpc({id:'banker',name:'Gerente',x:3,y:3,pal:{skin:'#c88858',hair:'#3a2a20',shirt:'#303848',pants:'#202830',shoe:'#151515'},talk:loanTalk}),
    mkNpc({id:'realtor',name:'Corretora',x:9,y:3,pal:{skin:'#f8d0a8',hair:'#6a3a20',shirt:'#8a3a5a',pants:'#202830',shoe:'#151515',long:true},talk:realtorTalk}),
  ];
  MAPS.cafe.baseNpcs=[
    mkNpc({id:'barista',name:'Barista',x:2,y:2,pal:{skin:'#f0c8a0',hair:'#202020',shirt:'#6a4a2a',pants:'#303030',shoe:'#2a2a2a'},talk:baristaTalk}),
  ];
  MAPS.parque.baseNpcs=[
    mkNpc({id:'bento',name:'Fornecedor Bento',x:4,y:4,pal:{skin:'#c88858',hair:'#3a2a20',shirt:'#c06030',pants:'#403020',shoe:'#2a2a2a'},talk:supplierTalk}),
    mkNpc({id:'dalva',name:'Feirante Dalva',x:9,y:4,pal:{skin:'#f0c8a0',hair:'#8a4a2a',shirt:'#e0c040',pants:'#5a4a6a',shoe:'#2a2a2a',long:true},talk:fairTalk}),
    mkNpc({id:'valeria',name:'Sra. Valéria',x:15,y:11,pal:{skin:'#f8d0a8',hair:'#202020',shirt:'#20283a',pants:'#20283a',shoe:'#101010',long:true},talk:investorTalk}),
    mkNpc({id:'ze',name:'Tio Zé',x:17,y:6,dir:'up',pal:{skin:'#c88858',hair:'#d0d0d0',shirt:'#5a8a5a',pants:'#405060',shoe:'#2a2a2a',cap:'#e0c070',capD:'#b09040'},talk:villagerTalk,
      lines:['Shhh... os peixes estão quase mordendo a isca.','Dizem que a Sra. Valéria investe em empresas que valem muito.','Aos sábados e domingos a feira paga melhor que o Mercado!']}),
    mkNpc({id:'leo',name:'Léo',x:7,y:10,wander:true,pal:{skin:'#f8d0a8',hair:'#c89040',shirt:'#e04848',pants:'#304060',shoe:'#2a2a2a'},talk:villagerTalk,
      lines:['Quando eu crescer, vou ter uma empresa maior que a sua!','O Fornecedor Bento vende material baratinho se você comprar muito.','Já viu o navio no Distrito Industrial?']}),
  ];
  MAPS.industria.baseNpcs=[
    mkNpc({id:'nunes',name:'Capitão Nunes',x:18,y:11,dir:'left',pal:{skin:'#e8b088',hair:'#e8e8e8',shirt:'#203060',pants:'#203060',shoe:'#101010',cap:'#203060',capD:'#101830'},talk:exporterTalk}),
    mkNpc({id:'jonas',name:'Operário Jonas',x:10,y:8,wander:true,pal:{skin:'#8a5a38',hair:'#202020',shirt:'#e09030',pants:'#304060',shoe:'#2a2a2a',cap:'#f0d040',capD:'#c0a020'},talk:villagerTalk,
      lines:['Máquina não tira férias! Produz a noite toda.','O Capitão Nunes leva cargas grandes para a capital.','Lembre de manter estoque de material para as máquinas.']}),
  ];
  MAPS.fabrica.baseNpcs=[
    mkNpc({id:'rita',name:'Supervisora Rita',x:8,y:5,dir:'left',pal:{skin:'#f0c8a0',hair:'#6a3a20',shirt:'#4a80d0',pants:'#303840',shoe:'#202020',cap:'#f0d040',capD:'#c0a020'},talk:foremanTalk}),
  ];
  syncTownEvent();
}
function syncTownEvent(){
  const m=MAPS.town;m.npcs=m.npcs.filter(n=>n.id!=='turista');
  if(S&&S.event&&S.event.id==='turista')m.npcs.push(mkNpc({id:'turista',name:'Turista',x:12,y:17,wander:true,
    pal:{skin:'#f8d0a8',hair:'#e0c060',shirt:'#f0f0f0',pants:'#c8a060',shoe:'#6a3a20',cap:'#f0e0a0',capD:'#c8b070'},
    lines:['Que vila charmosa!','Vou levar lembrancinhas pra família toda.','Ouvi dizer que os produtos daqui são os melhores da região.'],talk:villagerTalk}));
}
const CAND_SPOTS=[[5,4,'right'],[11,4,'left'],[4,6,'right']];
function refreshDyn(id){
  const m=MAPS[id]; if(!m||id==='town') return;
  let dyn=[];
  if(id==='cafe') dyn=S.candidates.slice(0,3).map((c,i)=>mkNpc({id:'cand'+i,name:c.name,x:CAND_SPOTS[i][0],y:CAND_SPOTS[i][1],dir:CAND_SPOTS[i][2],pal:c.pal,cand:c,talk:candidateTalk}));
  if(id==='sede') dyn=S.employees.map((e,i)=>{const d=m.desks[i];return d?mkNpc({id:'emp'+i,name:e.name,x:d.x,y:d.y+1,dir:'up',pal:e.pal,emp:e,talk:employeeTalk}):null;}).filter(Boolean);
  m.npcs=[...m.baseNpcs,...dyn];
}

// ================= Collision =================
function tileAt(m,x,y){if(x<0||y<0||x>=m.w||y>=m.h)return null;return m.tiles[y][x];}
function npcAt(m,x,y){return m.npcs.find(n=>n.x===x&&n.y===y);}
function warpAt(m,x,y){return m.warps.find(w=>w.x===x&&w.y===y);}
function blockedAt(m,x,y,self){
  const t=tileAt(m,x,y); if(t==null||!WALK.has(t)) return true;
  if(m.solid&&m.solid[y*m.w+x]) return true;
  if(m.barriers&&S&&m.barriers.some(b=>b.x===x&&b.y===y&&b.lock())) return true;
  for(const n of m.npcs){if(n===self)continue;if((n.x===x&&n.y===y)||(n.moving&&n.tx===x&&n.ty===y))return true;}
  if(self!==player&&((player.x===x&&player.y===y)||(player.moving&&player.tx===x&&player.ty===y)))return true;
  return false;
}

// ================= Sprites =================
const sprCache=new Map();
function sprite(P,dir,f){
  const key=[P.skin,P.hair,P.shirt,P.pants,P.cap||'',P.long?1:0,dir,f].join('|');
  let c=sprCache.get(key); if(c) return c;
  const SW=16,SH=24;
  const base=document.createElement('canvas');base.width=SW;base.height=SH;
  const g=base.getContext('2d');
  const r=(x,y,w,h,col)=>{g.fillStyle=col;g.fillRect(x+1,y+1,w,h);};
  const Hh=P.hair,Hd=shade(Hh,-.3),Hl=shade(Hh,.35),Sk=P.skin,Sd=shade(Sk,-.16),Sh=P.shirt,Shd=shade(Sh,-.28),Shl=shade(Sh,.3),
    Pn=P.pants,Pnd=shade(Pn,-.32),So=P.shoe||'#2a2a2a',Sol=shade(So,.4),E='#1c1c28',Bl='#f2a08c',Bt='#3a2a20';
  // Chibi proportions: big head (rows 0-10), short body (11-18), feet (19-20)
  if(dir==='up'||dir==='down'){
    const up=dir==='up';
    if(f===1){r(3,19,3,1,So);r(3,19,1,1,Sol);}else{r(4,19,2,1,Pnd);r(3,20,3,1,So);r(3,20,1,1,Sol);}
    if(f===2){r(8,19,3,1,So);r(10,19,1,1,Sol);}else{r(8,19,2,1,Pnd);r(8,20,3,1,So);r(10,20,1,1,Sol);}
    r(3,17,8,2,Pn);r(9,17,2,2,Pnd);r(6,18,2,1,Pnd);
    r(3,16,8,1,Bt);if(!up)r(6,16,2,1,'#d8b048');
    r(3,11,8,5,Sh);r(2,12,10,4,Sh);r(9,11,3,5,Shd);r(3,11,1,5,Shl);
    if(!up){r(5,11,4,1,Shl);r(6,12,2,1,Shd);}else r(4,11,6,1,Shd);
    const la=f===1?1:0,ra=f===2?1:0;
    r(1,12,1,4-la,Shd);r(1,16-la,1,1,Sk);
    r(12,12,1,4-ra,Shd);r(12,16-ra,1,1,Sd);
    if(up){
      r(3,0,8,1,Hh);r(1,1,12,10,Hh);r(2,10,10,1,Hd);r(3,1,6,1,Hl);r(2,2,2,3,Hl);r(1,7,1,4,Hd);r(12,5,1,6,Hd);
      if(P.long){r(2,11,10,3,Hh);r(2,13,10,1,Hd);}
    }else{
      r(3,0,8,1,Hh);r(1,1,12,5,Hh);r(3,1,5,1,Hl);r(2,2,2,2,Hl);
      r(2,5,10,6,Sk);r(11,5,1,6,Sd);r(2,10,10,1,Sd);
      r(1,5,12,1,Hh);r(2,6,2,1,Hh);r(10,6,2,1,Hh);r(6,5,2,1,Hd);
      r(1,5,1,P.long?9:5,Hh);r(12,5,1,P.long?9:5,Hd);if(P.long){r(1,13,1,1,Hd);r(12,13,1,1,Hd);}
      r(3,7,3,3,'#ffffff');r(8,7,3,3,'#ffffff');r(4,7,2,3,E);r(8,7,2,3,E);r(5,7,1,1,'#ffffff');r(9,7,1,1,'#ffffff');
      r(2,9,1,1,Bl);r(11,9,1,1,Bl);r(6,10,2,1,'#a8504a');
    }
    if(P.cap){const cl=shade(P.cap,.3);r(1,0,12,3,P.cap);r(3,0,5,1,cl);if(!up)r(0,3,14,1,P.capD||P.cap);else r(1,3,12,1,P.cap);}
  }else{
    if(f===0){r(5,19,3,1,Pnd);r(4,20,4,1,So);r(4,20,1,1,Sol);}
    else if(f===1){r(3,19,2,1,Pnd);r(2,20,3,1,So);r(2,20,1,1,Sol);r(7,19,2,1,Pnd);r(7,20,3,1,So);}
    else{r(4,19,2,1,Pnd);r(3,20,3,1,So);r(7,19,3,1,So);}
    r(3,17,7,2,Pn);r(8,17,2,2,Pnd);r(3,16,7,1,Bt);
    r(3,11,7,5,Sh);r(8,11,2,5,Shd);r(3,11,1,5,Shl);
    if(f===0){r(5,12,2,4,Shd);r(5,16,2,1,Sk);}else if(f===1){r(4,12,2,3,Shd);r(3,15,2,1,Sk);}else{r(7,12,2,3,Shd);r(8,15,2,1,Sk);}
    r(3,0,8,1,Hh);r(1,1,11,5,Hh);r(3,1,5,1,Hl);r(2,2,2,2,Hl);
    r(1,5,8,6,Sk);r(1,10,8,1,Sd);r(0,8,1,1,Sk);
    r(1,5,6,1,Hh);r(1,6,1,1,Hh);
    r(8,4,4,P.long?10:6,Hh);r(11,4,1,P.long?10:6,Hd);r(8,8,1,2,Sd);
    r(2,7,3,3,'#ffffff');r(2,7,2,3,E);r(3,7,1,1,'#ffffff');r(4,9,1,1,Bl);r(1,10,2,1,'#a8504a');
    if(P.cap){r(1,0,10,3,P.cap);r(3,0,4,1,shade(P.cap,.3));r(0,3,6,1,P.capD||P.cap);}
  }
  c=document.createElement('canvas');c.width=SW;c.height=SH;
  const g2=c.getContext('2d');
  if(dir==='right'){g2.translate(SW,0);g2.scale(-1,1);}
  g2.drawImage(base,0,0); g2.setTransform(1,0,0,1,0,0);
  const id=g2.getImageData(0,0,SW,SH),d=id.data,a=new Uint8Array(SW*SH);
  for(let i=0;i<a.length;i++)a[i]=d[i*4+3];
  for(let y=0;y<SH;y++)for(let x=0;x<SW;x++){const i=y*SW+x;if(a[i])continue;
    if((x>0&&a[i-1])||(x<SW-1&&a[i+1])||(y>0&&a[i-SW])||(y<SH-1&&a[i+SW])){d[i*4]=34;d[i*4+1]=26;d[i*4+2]=30;d[i*4+3]=255;}}
  g2.putImageData(id,0,0);
  sprCache.set(key,c); return c;
}
function shade(hex,f){
  const n=parseInt(hex.slice(1),16);let r=n>>16,g=n>>8&255,b=n&255;
  if(f<0){r*=1+f;g*=1+f;b*=1+f;}else{r+=(255-r)*f;g+=(255-g)*f;b+=(255-b)*f;}
  return '#'+[r,g,b].map(v=>Math.round(clamp(v,0,255)).toString(16).padStart(2,'0')).join('');
}

// ================= Pixel font (signs) =================
const PF={A:'010101111101101',B:'110101110101110',C:'011100100100011',D:'110101101101110',E:'111100110100111',F:'111100110100100',I:'111010010010111',G:'011100101101011',M:'101111111101101',N:'110101101101101',O:'010101101101010',R:'110101110101101',S:'011100010001110'};
function pixText(str,x,y,col){ctx.fillStyle=col;for(let i=0;i<str.length;i++){const gl=PF[str[i]];if(!gl)continue;for(let j=0;j<15;j++)if(gl[j]==='1')ctx.fillRect(x+i*4+(j%3),y+Math.floor(j/3),1,1);}}

// ================= Tile drawing =================
const hourNow=()=>S?S.min/60:12;
const isNight=()=>{const h=hourNow();return h>=18.5||h<6.5;};
let T=0;
let LIGHTS=[];
const WALLCH='#WAGzd';
function grass(sx,sy,h){
  R(sx,sy,16,16,'#79c465');
  if(h&1)R(sx+((h>>3)&7),sy+((h>>6)&7),8,8,'#74bf60');
  for(let k=0;k<5;k++){const v=(h>>(k*5))&1023,bx=v%15,by=(v>>4)%13+1;R(sx+bx,sy+by,1,2,'#58a54a');if(k<2)R(sx+bx+1,sy+by-1,1,2,'#58a54a');}
  for(let k=0;k<3;k++){const v=(h>>(k*7+3))&255;R(sx+(v%15),sy+((v>>4)%15),1,1,'#9ad87e');}
  if(h%29===0){R(sx+6,sy+9,3,2,'#a8a294');R(sx+6,sy+9,2,1,'#d0cabc');}
}
function flower(sx,sy,h){
  const cols=['#f05a5a','#ffffff','#f8d040','#f090c0','#a888f0'];
  const fl=(x,y,c)=>{R(x+1,y+3,1,3,'#3f8a3a');R(x+2,y+4,1,1,'#5aa64c');R(x,y+1,3,1,c);R(x+1,y,1,3,c);R(x+1,y+1,1,1,'#f8e060');};
  fl(sx+2,sy+2,cols[h%5]);fl(sx+9,sy+8,cols[(h>>3)%5]);if(h%3===0)fl(sx+11,sy+1,cols[(h>>6)%5]);
}
function pathT(m,tx,ty,sx,sy,h){
  R(sx,sy,16,16,'#dcc48e');
  for(let k=0;k<4;k++){const v=(h>>(k*6))&63,px=sx+(k%2)*8+(v%5),py=sy+Math.floor(k/2)*8+((v>>3)%5);
    R(px,py,3,2,'#c9ae78');R(px,py+2,3,1,'#ad935c');R(px,py,2,1,'#ecd8a8');}
  R(sx+((h>>20)%15),sy+((h>>24)%15),1,1,'#ad935c');
  const isP=(x,y)=>{const t=tileAt(m,x,y);return t==='p'||t==='o'||t==null||(m.solid&&m.solid[y*m.w+x]);};
  const G='#79c465';
  if(!isP(tx,ty-1)){R(sx,sy,16,2,G);for(let i=1;i<16;i+=3)R(sx+i,sy+2,1,1,G);}
  if(!isP(tx,ty+1)){R(sx,sy+14,16,2,G);for(let i=0;i<16;i+=3)R(sx+i,sy+13,1,1,G);}
  if(!isP(tx-1,ty)){R(sx,sy,2,16,G);for(let i=1;i<16;i+=3)R(sx+2,sy+i,1,1,G);}
  if(!isP(tx+1,ty)){R(sx+14,sy,2,16,G);for(let i=0;i<16;i+=3)R(sx+13,sy+i,1,1,G);}
}
function tree(sx,sy,h){
  ctx.fillStyle='rgba(20,50,20,.25)';ctx.fillRect(sx+2,sy+13,12,3);
  R(sx+6,sy+8,4,8,'#6a4228');R(sx+6,sy+8,1,8,'#4a2c18');R(sx+9,sy+8,1,8,'#8a5a3a');R(sx+5,sy+14,1,2,'#6a4228');R(sx+10,sy+14,1,2,'#6a4228');
  const D='#2b6a38',M='#3f9a4c',L='#62b85e',X='#8ed27c';
  R(sx+3,sy-6,10,1,D);R(sx+1,sy-5,14,2,D);R(sx,sy-3,16,10,D);R(sx+1,sy+7,14,2,D);R(sx+3,sy+9,10,1,D);
  R(sx+2,sy-5,12,2,M);R(sx+1,sy-3,14,9,M);R(sx+2,sy+6,12,2,M);
  R(sx+3,sy-4,5,3,L);R(sx+9,sy-2,4,3,L);R(sx+2,sy+1,4,3,L);R(sx+7,sy+2,5,3,L);
  R(sx+4,sy-4,2,1,X);R(sx+10,sy-2,1,1,X);R(sx+3,sy+1,1,1,X);R(sx+8,sy+2,2,1,X);
  R(sx+2,sy+6,12,1,'#357f42');
  if(h%5===0){R(sx+5,sy+3,1,1,'#e04848');R(sx+11,sy-1,1,1,'#e04848');R(sx+3,sy-2,1,1,'#e04848');R(sx+12,sy+4,1,1,'#e04848');}
}
function waterT(m,tx,ty,sx,sy){
  const isW=(x,y)=>{const t=tileAt(m,x,y);return t==='w'||t==='o';};
  const deep=isW(tx,ty-1)&&isW(tx,ty+1)&&isW(tx-1,ty)&&isW(tx+1,ty);
  R(sx,sy,16,16,deep?'#3c88d0':'#4a9fe0');
  const o=Math.floor(T*2+tx*1.7+ty)%8;
  R(sx+((2+o*2)%13),sy+5,4,1,'#7cc4f4');R(sx+((9+o*2)%13),sy+11,3,1,'#7cc4f4');
  if((Math.floor(T*1.5)+tx*7+ty*3)%9===0)R(sx+((tx*5)%10)+3,sy+((ty*7)%8)+4,1,1,'#ffffff');
  const hh=hash(tx,ty);
  if(deep&&hh%5===0){R(sx+4,sy+6,7,4,'#3f9a4c');R(sx+5,sy+6,5,2,'#62b85e');R(sx+7,sy+6,1,2,'#3c88d0');if(hh%10===0){R(sx+8,sy+7,2,2,'#f8b0d0');R(sx+8,sy+7,1,1,'#ffffff');}}
  if(!isW(tx,ty-1)){R(sx,sy,16,3,'#e8d8a0');R(sx,sy+3,16,1,'#c8b47e');R(sx,sy+4,16,1,'#a8dcf8');}
  if(!isW(tx,ty+1)){R(sx,sy+13,16,3,'#e8d8a0');R(sx,sy+12,16,1,'#a8dcf8');}
  if(!isW(tx-1,ty)){R(sx,sy,3,16,'#e8d8a0');R(sx+3,sy,1,16,'#a8dcf8');}
  if(!isW(tx+1,ty)){R(sx+13,sy,3,16,'#e8d8a0');R(sx+12,sy,1,16,'#a8dcf8');}
}
function fenceT(m,tx,ty,sx,sy){
  const isF=(x,y)=>tileAt(m,x,y)==='F';
  const rail=(x,y,w,h)=>{R(x,y,w,h,'#c89058');R(x,y,w,1,'#e0b07a');R(x,y+h-1,w,1,'#9a6a38');};
  if(isF(tx-1,ty)){rail(sx,sy+6,8,3);rail(sx,sy+10,8,3);}
  if(isF(tx+1,ty)){rail(sx+8,sy+6,8,3);rail(sx+8,sy+10,8,3);}
  if(isF(tx,ty-1))R(sx+7,sy,2,4,'#a06a38');
  if(isF(tx,ty+1))R(sx+7,sy+12,2,4,'#a06a38');
  R(sx+6,sy+14,5,2,'rgba(20,50,20,.22)');
  R(sx+6,sy+3,4,12,'#a06a38');R(sx+6,sy+3,1,12,'#c08050');R(sx+9,sy+3,1,12,'#7a4a24');R(sx+5,sy+2,6,2,'#d8a068');
}
function signT(sx,sy){
  R(sx+5,sy+14,6,2,'rgba(20,50,20,.22)');
  R(sx+7,sy+9,2,6,'#6a4228');R(sx+7,sy+9,1,6,'#8a5a3a');
  R(sx+1,sy+1,14,9,'#4a2c18');R(sx+2,sy+2,12,7,'#d8a060');R(sx+2,sy+2,12,1,'#ecc080');
  R(sx+4,sy+4,8,1,'#8a5a30');R(sx+4,sy+6,5,1,'#8a5a30');R(sx+2,sy+3,1,1,'#6a4228');R(sx+13,sy+3,1,1,'#6a4228');
}
function lampT(sx,sy){
  const n=isNight();
  R(sx+4,sy+14,8,2,'rgba(20,40,20,.25)');
  R(sx+7,sy+1,2,14,'#363a44');R(sx+7,sy+1,1,14,'#565a64');R(sx+5,sy+13,6,2,'#262a32');
  R(sx+4,sy-6,8,1,'#262a32');R(sx+5,sy-5,6,6,'#262a32');R(sx+6,sy-4,4,4,n?'#fff0a0':'#e8eef0');R(sx+6,sy-4,1,1,'#ffffff');
  R(sx+7,sy-8,2,2,'#262a32');
  if(n)LIGHTS.push({x:sx+8,y:sy-2,r:52});
}
function bushT(sx,sy,h){
  ctx.fillStyle='rgba(20,50,20,.25)';ctx.fillRect(sx+1,sy+12,14,3);
  R(sx+2,sy+3,12,1,'#2b6a38');R(sx+1,sy+4,14,8,'#2b6a38');R(sx+2,sy+12,12,1,'#2b6a38');
  R(sx+2,sy+4,12,7,'#3f9a4c');R(sx+3,sy+4,4,3,'#62b85e');R(sx+9,sy+6,3,2,'#62b85e');R(sx+4,sy+4,1,1,'#8ed27c');
  if(h%2){R(sx+5,sy+8,1,1,'#e04848');R(sx+10,sy+5,1,1,'#e04848');R(sx+8,sy+9,1,1,'#e04848');}
  else{R(sx+5,sy+7,1,1,'#ffffff');R(sx+11,sy+8,1,1,'#f8d040');}
}
function rockT(sx,sy){
  R(sx+2,sy+13,12,2,'rgba(20,40,20,.25)');
  R(sx+4,sy+6,8,1,'#7e8288');R(sx+3,sy+7,10,6,'#8a8e94');R(sx+4,sy+7,6,3,'#a8acb2');R(sx+5,sy+7,2,1,'#c8ccd2');
  R(sx+3,sy+12,10,1,'#5e6268');R(sx+10,sy+8,2,1,'#6aa858');R(sx+9,sy+9,1,1,'#6aa858');
}
const WALLSTY={
  casa:{base:'#efe0c0',c2:'#e0c89a',pat:'flower',low:'#b98a58',trim:'#7a4a2a',curt:'#d86a6a'},
  mercado:{base:'#d8eedc',c2:'#c2dec8',pat:'stripe',low:'#6aa07a',trim:'#3e6e4c',curt:'#f8f0d8'},
  banco:{base:'#ebe5d6',c2:'#d8cfbc',pat:'panel',low:'#8a7a62',trim:'#4e3e2c',curt:'#3e5a8a'},
  cafe:{base:'#e8b088',c2:'#d0906a',pat:'brick',low:'#6a3e22',trim:'#4a2814',curt:'#f0c060'},
  sede1:{base:'#c6c6c0',c2:'#b2b2ac',pat:'block',low:'#8a8a84',trim:'#5a5a56',curt:'#a8b0b8'},
  sede2:{base:'#eef0ec',c2:'#dfe5df',pat:'stripe',low:'#4e8a8a',trim:'#2e6464',curt:'#7ac0c0'},
  sede3:{base:'#f2f4f8',c2:'#e0e5ee',pat:'panel',low:'#44548a',trim:'#26345e',curt:'#8a9ac8'},
  fabrica:{base:'#b4b8be',c2:'#9ea2a8',pat:'metal',low:'#64686e',trim:'#44484e',curt:'#a8b0b8'},
};
function floorT(sx,sy,h,m,tx,ty){
  const f=(m&&m.floor)||'wood';
  if(f==='wood'||f==='dark'){
    const a=f==='wood'?['#cf9f66','#c79660','#d6a86e']:['#8e5c36','#86562f','#97653c'],sm=f==='wood'?'#a87a48':'#5e3a1e';
    for(let r=0;r<4;r++){R(sx,sy+r*4,16,4,a[(h>>r)%3]);R(sx,sy+r*4+3,16,1,sm);R(sx+((h>>(r*4))%16),sy+r*4,1,3,sm);}
    if(h%9===0)R(sx+(h>>5)%13+1,sy+((h>>9)%3)*4+1,2,1,sm);
  }else if(f==='tile'){
    R(sx,sy,16,16,(tx+ty)%2?'#e6efe2':'#d2e4cf');R(sx,sy,16,1,'#b8ccb4');R(sx,sy,1,16,'#b8ccb4');R(sx+2,sy+2,3,1,'#f6fbf4');
  }else if(f==='marble'){
    R(sx,sy,16,16,(tx+ty)%2?'#efebe4':'#e2dccf');R(sx,sy,16,1,'#cbc2b2');R(sx,sy,1,16,'#cbc2b2');
    for(let k=0;k<5;k++){const v=(h>>(k*3))&7;R(sx+2+k*2+(v&1),sy+3+v,1,1,'#c4baa8');}
    R(sx+2,sy+2,2,1,'#fbf9f4');
  }else if(f==='concrete'){
    R(sx,sy,16,16,'#a9aaa6');for(let k=0;k<6;k++){const v=(h>>(k*4))&255;R(sx+(v%16),sy+((v>>4)%16),1,1,k%2?'#979893':'#babbb6');}
    if(tx%2===0)R(sx,sy,1,16,'#92938e');if(ty%2===0)R(sx,sy,16,1,'#92938e');
  }else if(f==='office'){
    R(sx,sy,16,16,'#62728c');for(let yy=1;yy<16;yy+=4)for(let xx=(yy%8===1?1:3);xx<16;xx+=4)R(sx+xx,sy+yy,1,1,'#74849e');
  }
}
function rugT(m,tx,ty,sx,sy){
  const col=m.rug||'#b84a4a',dk=shade(col,-.28),lt=shade(col,.35),is=(x,y)=>tileAt(m,x,y)==='r';
  R(sx,sy,16,16,col);
  if(!is(tx,ty-1)){R(sx,sy,16,2,dk);R(sx,sy+3,16,1,lt);}
  if(!is(tx,ty+1)){R(sx,sy+14,16,2,dk);R(sx,sy+12,16,1,lt);}
  if(!is(tx-1,ty)){R(sx,sy,2,16,dk);R(sx+3,sy,1,16,lt);}
  if(!is(tx+1,ty)){R(sx+14,sy,2,16,dk);R(sx+12,sy,1,16,lt);}
  R(sx+7,sy+5,2,6,lt);R(sx+5,sy+7,6,2,lt);R(sx+7,sy+7,2,2,dk);
}
function wallT(m,tx,ty,sx,sy,c){
  const st=WALLSTY[m.wallSty]||WALLSTY.casa;
  const below=tileAt(m,tx,ty+1),upper=below&&WALLCH.includes(below);
  R(sx,sy,16,16,st.base);
  switch(st.pat){
    case 'stripe':R(sx+2,sy,3,16,st.c2);R(sx+10,sy,3,16,st.c2);break;
    case 'flower':R(sx+3,sy+2,1,3,st.c2);R(sx+2,sy+3,3,1,st.c2);R(sx+11,sy+9,1,3,st.c2);R(sx+10,sy+10,3,1,st.c2);break;
    case 'panel':R(sx,sy,1,16,st.c2);R(sx+8,sy,1,16,st.c2);R(sx+1,sy,1,16,shade(st.base,.4));break;
    case 'brick':for(let r=0;r<4;r++){R(sx,sy+r*4+3,16,1,st.c2);R(sx+(r%2?3:11),sy+r*4,1,3,st.c2);R(sx+(r%2?3:11)+1,sy+r*4,1,1,shade(st.base,.18));}break;
    case 'block':R(sx,sy+7,16,1,st.c2);R(sx,sy+15,16,1,st.c2);R(sx+(ty%2?4:12),sy,1,7,st.c2);R(sx+(ty%2?12:4),sy+8,1,7,st.c2);break;
    case 'metal':R(sx+3,sy,1,16,st.c2);R(sx+11,sy,1,16,st.c2);R(sx+4,sy,1,16,shade(st.base,.18));R(sx+12,sy,1,16,shade(st.base,.18));R(sx+7,sy+4,1,1,st.c2);R(sx+7,sy+12,1,1,st.c2);break;
  }
  if(ty===0){R(sx,sy,16,3,st.trim);R(sx,sy+3,16,1,shade(st.trim,.3));}
  if(!upper){R(sx,sy+9,16,7,st.low);R(sx,sy+9,16,1,shade(st.low,.3));R(sx+1,sy+11,6,2,shade(st.low,-.12));R(sx+9,sy+11,6,2,shade(st.low,-.12));R(sx,sy+14,16,2,st.trim);}
  const n=isNight();
  if(c==='W'){R(sx+1,sy,14,1,'#4a3020');R(sx+2,sy+1,12,11,'#6a4a30');R(sx+3,sy+2,10,9,n?'#1e2a58':'#a8dcff');
    if(n){R(sx+5,sy+4,1,1,'#ffffff');R(sx+10,sy+3,1,1,'#f8f0c0');}else{R(sx+3,sy+2,10,3,'#cdeeff');R(sx+4,sy+3,2,4,'#ffffff');R(sx+3,sy+9,10,2,'#8cc87a');}
    R(sx+7,sy+2,2,9,'#6a4a30');R(sx+3,sy+6,10,1,'#6a4a30');
    R(sx+2,sy+1,2,12,st.curt);R(sx+12,sy+1,2,12,st.curt);R(sx+3,sy+1,1,12,shade(st.curt,-.2));R(sx+12,sy+1,1,12,shade(st.curt,-.2));
    R(sx+1,sy+12,14,2,'#e8dcc0');}
  if(c==='A'){R(sx+3,sy+1,10,10,'#a8781c');R(sx+3,sy+1,10,1,'#e0b040');R(sx+4,sy+2,8,8,'#9ad0f0');R(sx+4,sy+6,8,4,'#4aa058');R(sx+5,sy+5,3,3,'#3a8a4a');R(sx+9,sy+3,2,2,'#f8e070');R(sx+4,sy+8,8,2,'#3a7ab0');}
  if(c==='G'){R(sx+1,sy+1,14,11,'#8a9098');R(sx+2,sy+2,12,9,'#ffffff');R(sx+3,sy+8,2,2,'#e05050');R(sx+6,sy+6,2,4,'#50a050');R(sx+9,sy+4,2,6,'#5080e0');R(sx+3,sy+3,5,1,'#a0a8b8');R(sx+2,sy+11,12,1,'#c8ccd2');R(sx+11,sy+11,2,1,'#e05050');}
  if(c==='z'){R(sx+3,sy+1,10,10,'#6a4226');R(sx+4,sy+2,8,8,'#fbf6e8');R(sx+7,sy+2,2,1,'#6a4226');R(sx+7,sy+9,2,1,'#6a4226');
    const mins=S?S.min:720,ha=((mins/60)%12)/12*Math.PI*2,ma=(mins%60)/60*Math.PI*2,cx=sx+8,cy=sy+6;
    for(let k=1;k<=2;k++)R(Math.round(cx-.5+Math.sin(ha)*k),Math.round(cy-.5-Math.cos(ha)*k),1,1,'#2a2a2a');
    for(let k=1;k<=3;k++)R(Math.round(cx-.5+Math.sin(ma)*k),Math.round(cy-.5-Math.cos(ma)*k),1,1,'#b03030');
    R(sx+7+Math.round(Math.sin(T*3)),sy+11,2,3,'#c8a040');}
  if(c==='d'){R(sx+1,sy+1,14,11,'#6a4a30');R(sx+2,sy+2,12,9,'#2e3a32');R(sx+3,sy+3,6,1,'#e8e8e0');R(sx+3,sy+5,8,1,'#c8d8c0');R(sx+3,sy+7,5,1,'#e8c8a0');R(sx+10,sy+7,2,1,'#f0e0a0');R(sx+3,sy+9,7,1,'#c8d8c0');}
}
function furniture(c,sx,sy,m,tx,ty,h){
  const n=isNight();
  switch(c){
    case 'k':case 'i':{
      const banco=m.id==='banco';
      R(sx,sy+15,16,1,'rgba(0,0,0,.2)');
      R(sx,sy+2,16,13,banco?'#5a3a24':'#8a5430');R(sx,sy+2,16,4,banco?'#e8e4dc':'#c88a50');R(sx,sy+2,16,1,banco?'#ffffff':'#e0a868');
      R(sx+1,sy+7,6,7,banco?'#4a2e1c':'#7a4a28');R(sx+9,sy+7,6,7,banco?'#4a2e1c':'#7a4a28');R(sx+1,sy+7,6,1,banco?'#6a4a30':'#9a6238');R(sx+9,sy+7,6,1,banco?'#6a4a30':'#9a6238');
      if(c==='i'){R(sx+3,sy-2,10,6,'#4a4e56');R(sx+3,sy-2,10,1,'#6a6e76');R(sx+4,sy-1,8,2,'#7ad8a0');R(sx+4,sy+2,8,1,'#d8d8d8');R(sx+5,sy+2,1,1,'#e05050');}
      else if(banco&&h%2){R(sx+5,sy-1,6,4,'#d8e8f0');R(sx+5,sy-1,6,1,'#ffffff');}
      else if(h%3===0){R(sx+10,sy,3,3,'#ffffff');R(sx+11,sy+1,1,1,'#8a5a30');}
      break;}
    case 'B': R(sx+1,sy,14,16,'#7a4a2a');R(sx+1,sy,14,3,'#9a6a40');R(sx+2,sy+1,12,1,'#b8885a');
      R(sx+2,sy+3,12,13,'#f4f0f8');R(sx+3,sy+4,10,5,'#ffffff');R(sx+3,sy+8,10,1,'#d8d4e8');R(sx+4,sy+5,3,1,'#eeeaf6');
      R(sx+2,sy+11,12,5,'#5a82d0');R(sx+2,sy+11,12,2,'#e8eef8');break;
    case 'Y': R(sx+1,sy,14,16,'#7a4a2a');R(sx+2,sy,12,12,'#5a82d0');
      for(let i=0;i<3;i++)for(let j=0;j<3;j++)if((i+j)%2)R(sx+3+i*4,sy+1+j*4,3,3,'#7aa0e8');
      R(sx+2,sy+11,12,1,'#3a5aa0');R(sx+1,sy+12,14,3,'#9a6a40');R(sx+1,sy+12,14,1,'#b8885a');R(sx+1,sy+15,14,1,'rgba(0,0,0,.25)');break;
    case 'D': case 'E': {
      let on=c==='D';
      if(c==='E'&&m.desks){const i=m.desks.findIndex(d=>d.x===tx&&d.y===ty);on=i>=0&&i<S.employees.length;}
      R(sx,sy+15,16,1,'rgba(0,0,0,.2)');
      R(sx,sy+6,16,3,'#c08a52');R(sx,sy+6,16,1,'#d8a46a');R(sx,sy+9,16,5,'#946238');R(sx+1,sy+10,6,3,'#a8723e');R(sx+3,sy+11,2,1,'#e0c080');R(sx+13,sy+9,2,6,'#7a4e2a');
      R(sx+3,sy-1,10,7,'#2a2e36');R(sx+4,sy,8,5,on?(c==='D'?(Math.floor(T*2)%2?'#7ad8ff':'#5ac0f0'):'#68c8a0'):'#3e444e');
      if(on){R(sx+5,sy+1,4,1,'#ffffff');R(sx+5,sy+3,5,1,'#d0f0ff');if(n)LIGHTS.push({x:sx+8,y:sy+3,r:20,c:'120,200,255'});}
      else R(sx+5,sy+1,2,1,'#5a606a');
      R(sx+7,sy+6,2,1,'#2a2e36');R(sx+4,sy+7,6,1,'#e8e8e8');R(sx+12,sy+5,2,2,'#e05050');R(sx+1,sy+6,3,1,'#ffffff');break;}
    case 'P': R(sx+2,sy+15,12,1,'rgba(0,0,0,.2)');R(sx+4,sy+10,8,6,'#b0603a');R(sx+3,sy+10,10,2,'#d07a4a');R(sx+10,sy+12,2,4,'#8a4428');
      R(sx+5,sy-3,2,6,'#2b6a38');R(sx+2,sy,5,5,'#3f9a4c');R(sx+9,sy-2,5,6,'#3f9a4c');R(sx+5,sy+3,6,7,'#357f42');R(sx+3,sy+1,2,2,'#62b85e');R(sx+10,sy-1,2,2,'#62b85e');R(sx+7,sy+5,2,2,'#62b85e');R(sx+6,sy-4,2,2,'#62b85e');break;
    case 'S': case 'I': {
      R(sx+1,sy+15,14,1,'rgba(0,0,0,.25)');
      R(sx+1,sy-5,14,21,'#6a4026');R(sx+2,sy-4,12,19,'#4a2c18');R(sx+1,sy-5,14,1,'#8a5a36');
      const shelfY=[-4,2,8];const cols=c==='I'?['#c04848','#4878c0','#48a858','#e0a030','#8a50b0','#e8e0d0','#306070']:['#e05050','#50a0e0','#f0d050','#60c060','#c080e0','#f0a040','#f8f0e0'];
      shelfY.forEach((yy,si)=>{R(sx+2,sy+yy+5,12,1,'#8a5a36');
        if(c==='I'){for(let bx=2;bx<14;bx+=2){const v=(h>>((bx+si*5)%24))&7;const hh=3+(v%3);R(sx+bx,sy+yy+5-hh,2-((v>>2)&1)?2:1,hh,cols[(v+si+bx)%cols.length]);}}
        else{for(let k=0;k<3;k++){const v=(h>>(k*4+si*3))&7;R(sx+2+k*4,sy+yy+2,3,3,cols[(v+k+si)%cols.length]);R(sx+2+k*4,sy+yy+2,3,1,'rgba(255,255,255,.35)');}}});
      break;}
    case 't': {const cl=m.cloth||'#f4efe4';
      R(sx+2,sy+14,12,2,'rgba(0,0,0,.2)');R(sx+1,sy+4,14,8,'#a87444');R(sx+2,sy+3,12,7,cl);R(sx+2,sy+10,12,2,shade(cl,-.15));R(sx+3,sy+12,2,3,'#7a5030');R(sx+11,sy+12,2,3,'#7a5030');
      if(h%2){R(sx+7,sy+3,2,3,'#6a8ad0');R(sx+7,sy+1,2,2,'#f05a5a');R(sx+6,sy+2,1,1,'#62b85e');}else{R(sx+4,sy+5,3,2,'#ffffff');R(sx+9,sy+4,3,2,'#ffffff');R(sx+10,sy+4,1,1,'#8a5a30');}
      break;}
    case 'V': R(sx,sy+15,16,1,'rgba(0,0,0,.25)');R(sx,sy+8,16,8,'#6a4228');R(sx+1,sy+10,6,5,'#5a3620');R(sx+9,sy+10,6,5,'#5a3620');R(sx,sy+8,16,1,'#8a5a36');
      R(sx+1,sy-2,14,10,'#1e2228');{const k=Math.floor(T*1.5)%3,sc=['#7ac8f0','#f0b070','#90e080'][k];R(sx+2,sy-1,12,7,sc);R(sx+2,sy+3,12,3,shade(sc,-.25));R(sx+3,sy,3,1,'#ffffff');}
      if(n)LIGHTS.push({x:sx+8,y:sy+3,r:26,c:'140,190,255'});break;
    case 'K': R(sx,sy+6,16,10,'#8a5430');R(sx,sy+6,16,2,'#c88a50');R(sx+3,sy-3,10,10,'#5a6068');R(sx+4,sy-2,8,2,'#a8b0b8');R(sx+5,sy+1,6,3,'#30343c');R(sx+10,sy-1,1,1,'#e04040');
      R(sx+6,sy+4,4,3,'#ffffff');R(sx+7,sy+5,2,1,'#6a3a1a');break;
    case 'R': R(sx+2,sy+15,12,1,'rgba(0,0,0,.25)');R(sx+2,sy-5,12,21,'#eef2f6');R(sx+12,sy-5,2,21,'#cfd6de');R(sx+2,sy+2,12,1,'#a8b0b8');
      R(sx+10,sy-3,1,4,'#8a9098');R(sx+10,sy+4,1,5,'#8a9098');R(sx+4,sy-3,2,2,'#e05050');R(sx+6,sy-1,2,2,'#f0c040');R(sx+4,sy+5,3,3,'#ffffff');R(sx+4,sy+5,3,1,'#5aa0e0');break;
    case 'C': R(sx+3,sy+14,10,2,'rgba(0,0,0,.2)');R(sx+4,sy+1,8,7,'#7a4a26');R(sx+5,sy+2,6,5,'#a06a3a');R(sx+5,sy+3,6,1,'#7a4a26');R(sx+3,sy+8,10,3,'#b87a44');R(sx+3,sy+8,10,1,'#d0945a');R(sx+4,sy+11,1,4,'#6a4220');R(sx+11,sy+11,1,4,'#6a4220');break;
    case 'U': {const col=m.sofa||'#b04848',dk=shade(col,-.25),lt=shade(col,.25),L=tileAt(m,tx-1,ty)!=='U',Rt=tileAt(m,tx+1,ty)!=='U';
      R(sx,sy+14,16,2,'rgba(0,0,0,.22)');R(sx,sy+1,16,6,dk);R(sx,sy+1,16,1,lt);R(sx,sy+6,16,8,col);R(sx,sy+7,16,1,lt);
      R(sx+(L?3:0),sy+7,(L&&Rt)?10:13,4,lt);R(sx+(L?3:0),sy+11,(L&&Rt)?10:13,1,dk);
      if(L){R(sx,sy+3,3,11,dk);R(sx,sy+3,3,1,lt);}if(Rt){R(sx+13,sy+3,3,11,dk);R(sx+13,sy+3,3,1,lt);}
      if(L&&!Rt){R(sx+5,sy+3,5,4,'#f0d070');R(sx+5,sy+3,5,1,'#fff0a0');}
      R(sx+1,sy+14,2,2,'#4a2a18');R(sx+13,sy+14,2,2,'#4a2a18');break;}
    case 'J': R(sx+5,sy+14,6,2,'rgba(0,0,0,.2)');R(sx+6,sy+13,4,2,'#4a3a2a');R(sx+7,sy+2,2,11,'#6a5a4a');R(sx+7,sy+2,1,11,'#8a7a6a');
      R(sx+4,sy-3,8,5,n?'#ffe8a8':'#f0d8a0');R(sx+5,sy-4,6,1,'#e0c080');R(sx+4,sy+2,8,1,'#c8a870');R(sx+5,sy-2,2,3,'#fff4d0');
      if(n)LIGHTS.push({x:sx+8,y:sy,r:46});break;
    case 'h': R(sx+3,sy+15,10,1,'rgba(0,0,0,.2)');R(sx+3,sy+6,10,9,'#9a6a40');R(sx+3,sy+6,10,2,'#b8885a');R(sx+4,sy+10,8,1,'#7a4a2a');R(sx+7,sy+12,2,1,'#e0c080');
      R(sx+6,sy+1,4,3,n?'#ffe8a8':'#f8e0a0');R(sx+7,sy+4,2,2,'#7a5a3a');if(n)LIGHTS.push({x:sx+8,y:sy+3,r:26});break;
    case 'O': if(m.id==='cafe'){R(sx,sy+3,16,12,'#9a6234');R(sx,sy+3,16,2,'#c88a50');R(sx+1,sy+5,14,6,'#d8f0f8');R(sx+1,sy+5,14,1,'#ffffff');
        R(sx+2,sy+8,3,2,'#e8a050');R(sx+6,sy+8,3,2,'#f0d0e0');R(sx+10,sy+8,3,2,'#8a5a30');R(sx+11,sy+7,1,1,'#f05a5a');}
      else{R(sx,sy+15,16,1,'rgba(0,0,0,.2)');R(sx,sy+2,16,13,'#e8e4dc');R(sx,sy+2,16,3,'#a8a4a0');R(sx,sy+2,16,1,'#c8c4c0');R(sx+1,sy+6,6,8,'#d8d4cc');R(sx+9,sy+6,6,8,'#d8d4cc');R(sx+6,sy+9,1,2,'#8a8680');R(sx+9,sy+9,1,2,'#8a8680');
        if((tx+ty)%2){R(sx+3,sy+3,3,1,'#303030');R(sx+10,sy+3,3,1,'#303030');R(sx+4,sy+2,1,1,'#e05030');}else{R(sx+4,sy+2,8,2,'#b8c8d8');R(sx+7,sy,1,2,'#a8b0b8');}}
      break;
    case 'g': R(sx+1,sy+15,14,1,'rgba(0,0,0,.25)');R(sx+1,sy-5,14,21,'#d8dee4');R(sx+2,sy-4,12,14,'#bfe4f4');R(sx+2,sy-4,12,1,'#e8f8ff');
      for(let r=0;r<3;r++){R(sx+2,sy-4+r*5+4,12,1,'#98b0c0');for(let k=0;k<5;k++)R(sx+3+k*2,sy-4+r*5+1,1,3,['#e05050','#f0c040','#50a0e0','#60c060','#f080b0'][(k+r+h)%5]);}
      R(sx+1,sy+11,14,4,'#a8b0b8');R(sx+3,sy+12,10,1,'#7a8288');if(n)LIGHTS.push({x:sx+8,y:sy+2,r:22,c:'170,220,255'});break;
    case 'e': {R(sx+1,sy+15,14,1,'rgba(0,0,0,.2)');R(sx+1,sy+5,14,10,'#9a6a3a');R(sx+1,sy+5,14,1,'#b8884e');R(sx+1,sy+9,14,1,'#7a4a24');R(sx+1,sy+12,14,1,'#7a4a24');
      const fr=[['#e04040','#f05a5a'],['#f0a030','#f8c050'],['#58a848','#78c868'],['#f0d040','#f8e878'],['#a050b0','#c070d0']],p=fr[h%5],q=fr[(h>>3)%5];
      [[2,2],[5,3],[8,2],[11,3],[3,0],[9,0]].forEach(([fx,fy],i)=>{const cc=i%2?q:p;R(sx+fx,sy+fy,3,3,cc[0]);R(sx+fx,sy+fy,1,1,cc[1]);});
      R(sx+5,sy+10,6,2,'#f8f0d8');R(sx+6,sy+10,3,1,'#c04040');break;}
    case 's': R(sx+4,sy+15,8,1,'rgba(0,0,0,.2)');R(sx+5,sy-3,6,6,'#8ccaf0');R(sx+5,sy-3,6,1,'#c8ecfc');R(sx+6,sy-2,1,4,'#c8ecfc');R(sx+4,sy+3,8,12,'#e8eef4');R(sx+11,sy+3,1,12,'#c8d0d8');
      R(sx+5,sy+6,1,1,'#e04040');R(sx+9,sy+6,1,1,'#4080e0');R(sx+5,sy+9,6,1,'#a8b0b8');break;
    case 'b': R(sx,sy+15,16,1,'rgba(0,0,0,.25)');R(sx+1,sy+4,7,11,'#8a5a30');R(sx+1,sy+4,7,2,'#a87040');R(sx+1,sy+7,7,1,'#4a4e56');R(sx+1,sy+12,7,1,'#4a4e56');R(sx+2,sy+5,1,9,'#a87040');
      R(sx+8,sy+6,7,9,'#b88a50');R(sx+8,sy+6,7,1,'#d0a468');R(sx+8,sy+10,7,1,'#8a6030');R(sx+11,sy+6,1,9,'#8a6030');break;
    case 'M': {
      const idx=[2,4,6,8].indexOf(tx),own=S&&idx>=0&&idx<S.machines;
      if(own){R(sx+1,sy+15,14,1,'rgba(0,0,0,.25)');R(sx+1,sy+1,14,14,'#7a8490');R(sx+1,sy+1,14,2,'#9aa4b0');R(sx+2,sy+3,12,5,'#4a5260');
        R(sx+4,sy+4,3,3,'#e0e8f0');R(sx+5,sy+5,1,1,'#e04040');R(sx+10,sy+4,2,2,Math.floor(T*3+idx)%2?'#60e070':'#2a6a30');
        R(sx+1,sy+10,14,4,'#303438');R(sx+1+(Math.floor(T*10+idx*3)%12),sy+10,3,2,'#f0c040');}
      else{R(sx+1,sy+1,14,14,'#e0b840');R(sx+3,sy+3,10,10,'#dcae74');for(let i=0;i<14;i+=4){R(sx+1+i,sy+1,2,2,'#303030');R(sx+1+i,sy+13,2,2,'#303030');}R(sx+6,sy+6,4,4,'#c8a060');}
      break;}
  }
}
function awningT(m,tx,ty,sx,sy,col){
  R(sx,sy+3,16,9,col);R(sx+4,sy+3,4,9,'#f8f0e8');R(sx+12,sy+3,4,9,'#f8f0e8');R(sx,sy+3,16,1,'rgba(255,255,255,.35)');
  for(let i=0;i<16;i+=4)R(sx+i+1,sy+12,2,2,i%8?'#f8f0e8':col);
  R(sx,sy+11,16,1,'rgba(0,0,0,.2)');
  if(tileAt(m,tx-1,ty)!==tileAt(m,tx,ty))R(sx+1,sy+12,2,4,'#6a4a30');
  if(tileAt(m,tx+1,ty)!==tileAt(m,tx,ty))R(sx+13,sy+12,2,4,'#6a4a30');
}
function stallBack(m,tx,ty,sx,sy){
  R(sx,sy,16,16,'#5ea852');R(sx,sy,16,4,'#4e9446');
  const c=tileAt(m,tx,ty);
  if(tileAt(m,tx-1,ty)!==c)R(sx+1,sy,2,16,'#6a4a30');
  if(tileAt(m,tx+1,ty)!==c)R(sx+13,sy,2,16,'#6a4a30');
}
function drawTile(m,tx,ty,sx,sy){
  const c=m.tiles[ty][tx],h=hash(tx,ty);
  switch(c){
    case '.':grass(sx,sy,h);break;
    case 'f':grass(sx,sy,h);flower(sx,sy,h);break;
    case 'p':pathT(m,tx,ty,sx,sy,h);break;
    case 'T':grass(sx,sy,h);tree(sx,sy,h);break;
    case 'L':grass(sx,sy,h);lampT(sx,sy);break;
    case 'H':grass(sx,sy,h);bushT(sx,sy,h);break;
    case 'Q':grass(sx,sy,h);rockT(sx,sy);break;
    case 'w':waterT(m,tx,ty,sx,sy);break;
    case 'F':grass(sx,sy,h);fenceT(m,tx,ty,sx,sy);break;
    case 'Z':grass(sx,sy,h);signT(sx,sy);break;
    case 'u':case 'q':grass(sx,sy,h);awningT(m,tx,ty,sx,sy,c==='u'?'#e04848':'#4878e0');break;
    case 'v':stallBack(m,tx,ty,sx,sy);break;
    case 'n':stallBack(m,tx,ty,sx,sy);R(sx,sy+4,16,10,'#a06a38');R(sx,sy+4,16,3,'#c88a50');R(sx,sy+13,16,1,'#6a4020');
      R(sx+2,sy+1,5,4,['#e05050','#f0c040','#60b060','#d08040'][h%4]);R(sx+9,sy+2,5,3,['#f0e0a0','#c080e0','#e07050','#80c0e0'][(h>>3)%4]);R(sx,sy+14,16,2,'rgba(0,0,0,.18)');break;
    case 'j':grass(sx,sy,h);R(sx+1,sy+3,14,2,'#c89058');R(sx+1,sy+6,14,3,'#b07840');R(sx+1,sy+9,14,1,'#8a5a30');R(sx+2,sy+10,2,4,'#5a3a20');R(sx+12,sy+10,2,4,'#5a3a20');R(sx+2,sy+14,12,1,'rgba(0,0,0,.2)');break;
    case 'o':R(sx,sy,16,16,'#b88850');R(sx+5,sy,1,16,'#8a6030');R(sx+11,sy,1,16,'#8a6030');R(sx,sy,16,1,'#d0a068');
      if(tileAt(m,tx,ty+1)==='w')R(sx,sy+15,16,1,'#5a3a20');break;
    case 'x':grass(sx,sy,h);R(sx+2,sy+14,13,2,'rgba(0,0,0,.2)');R(sx+2,sy+3,12,12,'#a87040');R(sx+2,sy+3,12,2,'#c89058');R(sx+3,sy+8,10,1,'#7a4e2d');R(sx+7,sy+5,2,10,'#7a4e2d');break;
    case 'X':R(sx,sy,16,16,'#1e1610');break;
    case '#':case 'W':case 'A':case 'G':case 'z':case 'd':wallT(m,tx,ty,sx,sy,c);break;
    case 'm':floorT(sx,sy,h,m,tx,ty);R(sx+1,sy+3,14,11,'#8a3a2a');R(sx+2,sy+4,12,9,'#b85040');for(let i=0;i<12;i+=3)R(sx+3+i,sy+6,1,5,'#d8785a');R(sx+1,sy+14,14,1,'rgba(0,0,0,.2)');break;
    case 'r':floorT(sx,sy,h,m,tx,ty);rugT(m,tx,ty,sx,sy);break;
    default:floorT(sx,sy,h,m,tx,ty);furniture(c,sx,sy,m,tx,ty,h);
  }
  if(!m.outdoor&&c!=='X'&&!WALLCH.includes(c)){
    if(ty>0&&WALLCH.includes(tileAt(m,tx,ty-1)||'-'))R(sx,sy,16,3,'rgba(40,20,0,.14)');
    if(tileAt(m,tx-1,ty)==='X')R(sx,sy,2,16,'rgba(0,0,0,.14)');
    if(tileAt(m,tx+1,ty)==='X')R(sx+14,sy,2,16,'rgba(0,0,0,.1)');
  }
}
const DECO={casa:{curt:'#e07070',box:true,chim:true},mercado:{curt:'#f8f0d8',awn:'#3f78c8'},cafe:{curt:'#f0c060',awn:'#d8842a',box:true},
  banco:{curt:'#d8d0c0',door:'#4a3020',glass:true},sede:{curt:'#c8d4e0',glass:true},fabrica:{curt:'#a8b0b8',door:'#5a6068'}};
function drawBuilding(b,cam){
  const lv=S?S.level:1;
  const st=b.id==='sede'?SEDE_ST[lv-1]:b.st,dc=DECO[b.id]||{};
  const x=b.x*TS-cam.x,y=b.y*TS-cam.y,w=b.w*TS,h=b.h*TS,roofH=h-32,wallTop=y+roofH,night=isNight();
  if(x>W+40||x+w<-40||y>H+40||y+h<-70)return;
  ctx.fillStyle='rgba(20,40,20,.22)';ctx.fillRect(x+w,wallTop+4,5,28);ctx.fillRect(x+3,y+h,w+2,3);
  const tower=b.id==='sede'&&lv>=3;
  if(tower){
    const ext=lv===4?16:0,top=y-ext;
    R(x-1,top,w+2,roofH+ext,'#c8d4e0');R(x+w-4,top,3,roofH+ext,'#a8b4c4');
    let k=0;
    for(let fy=top+6;fy+8<=wallTop-1;fy+=11)for(let fx=x+5;fx+8<=x+w-5;fx+=11){k++;R(fx,fy,8,8,night?(hash(k,lv)%3?'#ffe08a':'#40507a'):(k%4?'#6aa8e0':'#8cc4f0'));if(!night)R(fx,fy,3,2,'#c8e4f8');}
    for(let fx=x+3;fx<x+w-3;fx+=11)R(fx,top,1,roofH+ext,'#a8b4c4');
    R(x+2,top+2,2,roofH+ext-4,'rgba(255,255,255,.25)');
    R(x-3,top-3,w+6,4,'#505868');R(x-3,top-3,w+6,1,'#7a8290');
    if(lv===4){R(x+w/2-1,top-14,2,11,'#505868');R(x+w/2-2,top-16,4,3,Math.floor(T*2)%2?'#ff4040':'#801818');}
  }
  const wl=st.wall,wd=shade(wl,-.1),di=b.door-b.x,wt=wallTop+(dc.awn?9:6);
  R(x,wallTop,w,32,wl);
  for(let yy=wallTop+5;yy<wallTop+28;yy+=4)R(x,yy,w,1,wd);
  R(x,wallTop,2,32,shade(wl,-.18));R(x+w-2,wallTop,2,32,shade(wl,-.18));
  R(x,wallTop,w,3,'rgba(0,0,0,.2)');
  R(x,y+h-4,w,4,'#9a8a74');R(x,y+h-4,w,1,'#bcae96');for(let i=0;i<w;i+=6)R(x+i+((i/6)%2?3:0),y+h-3,1,3,'#76685a');
  for(let i=1;i<b.w-1;i++){if(i===di)continue;const wx=x+i*16;
    R(wx+2,wt,12,12,'#5a3a22');R(wx+3,wt+1,10,10,night?'#ffd98a':'#9fd6f6');
    if(!night){R(wx+3,wt+1,10,3,'#c4ecff');R(wx+4,wt+2,2,3,'#ffffff');}else LIGHTS.push({x:wx+8,y:wt+6,r:18});
    R(wx+3,wt+1,2,10,dc.curt||'#e8e0d0');R(wx+11,wt+1,2,10,dc.curt||'#e8e0d0');
    R(wx+7,wt+1,2,10,'#5a3a22');R(wx+3,wt+5,10,1,'#5a3a22');
    R(wx+1,wt+12,14,2,'#efe4c8');R(wx+1,wt+14,14,1,'rgba(0,0,0,.15)');
    if(dc.box&&wt+18<y+h-4){R(wx+2,wt+15,12,3,'#8a5428');R(wx+2,wt+15,12,1,'#a86c38');const fc=['#f05a5a','#f8d040','#f090c0'];for(let k=0;k<4;k++){R(wx+3+k*3,wt+13,2,2,fc[(k+i)%3]);R(wx+4+k*3,wt+14,1,1,'#3f8a3a');}}
  }
  const dx=x+di*16,dcol=dc.door||'#8a5a30';
  R(dx+1,wallTop+5,14,27,'#3e2412');R(dx+3,wallTop+7,10,25,dcol);
  R(dx+4,wallTop+9,8,8,shade(dcol,.12));R(dx+4,wallTop+19,8,10,shade(dcol,.12));
  if(dc.awn||dc.glass){R(dx+5,wallTop+10,6,6,night?'#ffd98a':'#bfe4f8');R(dx+5,wallTop+10,6,2,night?'#ffe8b0':'#e0f4ff');}
  R(dx+11,wallTop+20,1,2,'#f0d060');
  R(dx-1,y+h-2,18,2,'#cfc3ad');
  R(dx+15,wallTop+7,1,2,'#2a2a2a');R(dx+14,wallTop+9,3,4,'#2a2a2a');R(dx+15,wallTop+10,1,2,night?'#fff0a0':'#e8e0c0');
  if(night)LIGHTS.push({x:dx+15,y:wallTop+11,r:38});
  if(dc.awn){for(let i=0;i<w;i+=8){R(x+i,wallTop+1,4,6,dc.awn);R(x+i+4,wallTop+1,4,6,'#fbf3e4');}
    for(let i=0;i<w;i+=4)R(x+i+1,wallTop+7,2,1,(i%8)<4?dc.awn:'#fbf3e4');R(x,wallTop+1,w,1,'rgba(255,255,255,.3)');R(x,wallTop+8,w,1,'rgba(0,0,0,.15)');}
  if(!tower){
    R(x-3,y,w+6,roofH,st.roof);
    let row=0;for(let yy=y+3;yy<y+roofH-3;yy+=4,row++){R(x-3,yy+3,w+6,1,st.roofD);for(let xx=x-3+(row%2?3:0);xx<x+w+3;xx+=6)R(xx,yy,1,3,st.roofD);}
    R(x-3,y,w+6,2,st.roofL);R(x-3,y,1,roofH-3,st.roofL);R(x+w+2,y,1,roofH-3,st.roofD);
    if(dc.chim){const cx=x+w-18;R(cx,y-9,7,12,'#a8503c');R(cx,y-9,7,1,'#c8705a');R(cx-1,y-10,9,2,'#7a3a2a');for(let k=0;k<3;k++)R(cx+1+(k%2)*3,y-6+k*3,2,1,'#8a3a2a');
      for(let i=0;i<3;i++){const p=(T*.35+i/3)%1,r=Math.round(1+p*3);ctx.fillStyle=`rgba(235,235,240,${((1-p)*.5).toFixed(2)})`;ctx.fillRect(Math.round(cx+3-r+p*6),Math.round(y-12-p*22),r*2,r*2);}}
  }
  R(x-4,y+roofH-3,w+8,3,st.roofD);R(x-4,y+roofH,w+8,1,'rgba(0,0,0,.25)');
  if(b.id==='fabrica'){
    const cx=x+w-22;R(cx,y-12,8,14,'#6a6e76');R(cx-1,y-13,10,3,'#4a4e56');
    if(S&&S.machines>0)for(let i=0;i<3;i++){const p=(T*0.5+i/3)%1,r=Math.round(2+p*4);ctx.fillStyle=`rgba(225,228,235,${((1-p)*.8).toFixed(2)})`;ctx.fillRect(Math.round(cx+4-r+p*8),Math.round(y-16-p*30),r*2,r*2);}
  }
  const label=b.id==='sede'&&lv===1?'GARAGEM':b.sign,pw=label.length*4+3,px=Math.round(x+w/2-pw/2),py=y+roofH-14;
  R(px+2,py-4,1,3,'#3a3a3a');R(px+pw-3,py-4,1,3,'#3a3a3a');
  R(px-1,py-1,pw+2,9,'#4a3020');R(px,py,pw,7,'#f8f0d8');R(px,py+6,pw,1,'#d8c8a8');pixText(label,px+2,py+1,'#3a2a20');
}
function drawCat(sx,sy,n){
  const f=Math.floor(T*2)%2,fl=n.dir==='left';
  ctx.save();if(fl){ctx.translate(sx*2+16,0);ctx.scale(-1,1);}
  R(sx+3,sy+14,11,2,'rgba(0,0,0,.2)');
  R(sx+3,sy+8,9,6,'#a0a0a8');R(sx+9,sy+4,6,6,'#a0a0a8');R(sx+9,sy+3,1,2,'#a0a0a8');R(sx+14,sy+3,1,2,'#a0a0a8');
  R(sx+13,sy+6,1,1,'#202020');R(sx+10,sy+6,1,1,'#202020');R(sx+11,sy+8,2,1,'#f0a0a0');
  R(sx+1,sy+5+f,2,5,'#a0a0a8');R(sx+5,sy+8,1,6,'#80808a');R(sx+8,sy+8,1,6,'#80808a');
  R(sx+4,sy+14,2,1,'#707078');R(sx+10,sy+14,2,1,'#707078');
  ctx.restore();
}
function drawEntity(e,cam){
  const sx=Math.round(e.px-cam.x),sy=Math.round(e.py-cam.y);
  if(e.kind==='cat'){drawCat(sx,sy,e);return;}
  R(sx+4,sy+13,8,3,'rgba(20,30,20,.25)');R(sx+3,sy+14,10,1,'rgba(20,30,20,.25)');
  const f=e.moving&&e.t>0.2&&e.t<0.8?(e.step%2?1:2):0;
  ctx.drawImage(sprite(e.pal,e.dir,f),sx,sy-6);
  if(curMap.id==='town'&&S&&S.orders.some(o=>o.npc===e.id)){
    const by=sy-21+Math.round(Math.sin(T*5));
    R(sx+4,by,9,10,'#202028');R(sx+5,by+1,7,8,'#ffffff');R(sx+8,by+2,1,4,'#e03030');R(sx+8,by+7,1,1,'#e03030');R(sx+7,by+10,2,1,'#202028');
  }
}

// ================= Player & camera =================
const player={x:0,y:0,px:0,py:0,dir:'down',moving:false,t:0,step:0,tx:0,ty:0,turnT:0,cont:false,pal:PLAYER_PAL};
let curMap=null,running=false,mode='boot',busy=0,titleCam=0,introWho='ramos';
const held=[];
function placePlayer(x,y,dir){Object.assign(player,{x,y,px:x*TS,py:y*TS,dir:dir||player.dir,moving:false,t:0,cont:false});}
function camFor(m,fx,fy){
  const mw=m.w*TS,mh=m.h*TS;
  const cx=mw<=W?(mw-W)/2:clamp(fx+8-W/2,0,mw-W);
  const cy=mh<=H?(mh-H)/2:clamp(fy+8-H/2,0,mh-H);
  return {x:Math.round(cx),y:Math.round(cy)};
}
// Input buffer: a quick tap (or an A press mid-step) is remembered until the player can act on it.
let bufDir=null,bufA=false;
function updatePlayer(dt){
  let over=0;
  if(player.moving){
    player.t+=dt*(running?9:5.6);
    if(player.t<1){
      player.px=(player.x+(player.tx-player.x)*player.t)*TS;
      player.py=(player.y+(player.ty-player.y)*player.t)*TS;
      return;
    }
    over=Math.min(player.t-1,.5);
    player.x=player.tx;player.y=player.ty;player.moving=false;player.t=0;
  }
  player.px=player.x*TS;player.py=player.y*TS;
  if(bufA){bufA=false;bufDir=null;interact();return;}
  const d=held[held.length-1]||bufDir;bufDir=null;
  if(!d)return;
  player.dir=d;
  const nx=player.x+DIRS[d][0],ny=player.y+DIRS[d][1];
  const w=warpAt(curMap,nx,ny);
  if(w){run(()=>doWarp(w));return;}
  if(!blockedAt(curMap,nx,ny,player)){
    player.moving=true;player.tx=nx;player.ty=ny;player.t=over;player.step++;
    player.px=(player.x+(nx-player.x)*over)*TS;player.py=(player.y+(ny-player.y)*over)*TS;
  }else sfx('bump');
}
function updateNpc(n,dt){
  if(n.moving){n.t+=dt*3;if(n.t>=1){n.x=n.tx;n.y=n.ty;n.moving=false;n.t=0;}
    n.px=(n.x+(n.moving?(n.tx-n.x)*n.t:0))*TS;n.py=(n.y+(n.moving?(n.ty-n.y)*n.t:0))*TS;return;}
  n.px=n.x*TS;n.py=n.y*TS;
  if(!n.wander)return;
  n.timer-=dt;if(n.timer>0)return;n.timer=1+Math.random()*3;
  const d=pick(['up','down','left','right']);n.dir=d;
  if(Math.random()<.35)return;
  const nx=n.x+DIRS[d][0],ny=n.y+DIRS[d][1];
  if(Math.abs(nx-n.hx)>3||Math.abs(ny-n.hy)>3)return;
  if(blockedAt(curMap,nx,ny,n)||warpAt(curMap,nx,ny))return;
  n.moving=true;n.tx=nx;n.ty=ny;n.t=0;n.step++;
}

// ================= UI (dialogs / menus) =================
const dlg=$('dlg'),dlgText=$('dlgText'),dlgArrow=$('dlgArrow'),menuEl=$('menu'),panelEl=$('panel'),inputEl=$('dlgInput'),inRow=$('inRow');
let ui=null;
let talkNpc=null;
function parseSpeaker(text){
  if(!text)return {name:null,body:text};
  const cands=[];if(talkNpc&&talkNpc.name)cands.push(talkNpc.name);cands.push('Sr. Ramos','Jornal da Vila','Plantão');
  for(const n of cands)if(text.startsWith(n+': '))return {name:n,body:text.slice(n.length+2)};
  return {name:null,body:text};
}
function openDlg(name){
  dlg.classList.remove('hidden');dlgText.textContent='';dlgArrow.classList.add('hidden');inRow.classList.add('hidden');
  const nm=$('dlgName'),pc=$('dlgPortrait');
  if(name){nm.textContent=name;nm.classList.remove('hidden');}else nm.classList.add('hidden');
  let pal=null;
  if(name){if(talkNpc&&talkNpc.name===name&&talkNpc.pal)pal=talkNpc.pal;else if(name==='Sr. Ramos')pal=RAMOS_PAL;}
  if(pal){const g=pc.getContext('2d');g.imageSmoothingEnabled=false;g.clearRect(0,0,32,32);g.drawImage(sprite(pal,'down',0),0,0,16,16,0,0,32,32);pc.classList.remove('hidden');dlg.classList.add('withP');}
  else{pc.classList.add('hidden');dlg.classList.remove('withP');}
}
function closeAll(){dlg.classList.add('hidden');menuEl.classList.add('hidden');panelEl.classList.add('hidden');inRow.classList.add('hidden');}
function say(text){return new Promise(res=>{const sp=parseSpeaker(text);ui={type:'text',text:sp.body,shown:0,res};openDlg(sp.name);menuEl.classList.add('hidden');});}
function ask(text,options,cancel=options.length-1,opt={}){
  return new Promise(res=>{
    const sp=parseSpeaker(text);
    ui={type:'choice',text:sp.body,shown:0,options,sel:0,cancel,res,pos:opt.pos||''};
    menuEl.classList.add('hidden');
    if(text)openDlg(sp.name);else{dlg.classList.add('hidden');ui.doneShown=true;renderMenu();}
  });
}
function inputText(text,def,max){return new Promise(res=>{const sp=parseSpeaker(text);ui={type:'input',text:sp.body,shown:0,res,def,max};openDlg(sp.name);inputEl.value=def;inputEl.maxLength=max;});}
function showPanel(html){return new Promise(res=>{ui={type:'panel',res};panelEl.innerHTML=html+'<div class="hint">A / Z para fechar</div>';wrapDigits(panelEl);panelEl.scrollTop=0;panelEl.classList.remove('hidden');});}
function renderMenu(){
  menuEl.className='box '+(ui.pos||'');
  menuEl.innerHTML=ui.options.map((o,i)=>`<div class="mi${i===ui.sel?' sel':''}" data-i="${i}">${numHTML(o)}</div>`).join('');
}
function finishUI(v){const r=ui.res;closeAll();ui=null;r(v);}
function uiButton(k){
  if(!ui)return;
  if(ui.type==='panel'){if(k==='a'||k==='b'){sfx('cancel');finishUI();}return;}
  if(ui.type==='input')return;
  if(ui.type==='text'){if(k!=='a'&&k!=='b')return;if(!ui.doneShown){completeText();return;}sfx('move');finishUI();return;}
  if(ui.type==='choice'){
    if(!ui.doneShown){if(k==='a'||k==='b')completeText();return;}
    const n=ui.options.length;
    if(k==='up'){ui.sel=(ui.sel+n-1)%n;renderMenu();sfx('move');}
    else if(k==='down'){ui.sel=(ui.sel+1)%n;renderMenu();sfx('move');}
    else if(k==='a'){sfx('confirm');finishUI(ui.sel);}
    else if(k==='b'&&ui.cancel>=0){sfx('cancel');finishUI(ui.cancel);}
  }
}
function updateUI(dt){
  if(!ui||!ui.text||ui.doneShown)return;
  const L=ui.text.length;
  const before=Math.floor(ui.shown);
  ui.shown=Math.min(L,ui.shown+dt*90);
  const now=Math.floor(ui.shown);
  if(now>before&&ui.text[now-1]&&ui.text[now-1]!==' ')sfx('blip');
  dlgText.innerHTML=numHTML(ui.text.slice(0,now));
  if(ui.shown>=L)completeText();
}
function completeText(){
  if(!ui||ui.doneShown)return;
  ui.shown=ui.text?ui.text.length:0;ui.doneShown=true;dlgText.innerHTML=numHTML(ui.text||'');
  if(ui.type==='text')dlgArrow.classList.remove('hidden');
  if(ui.type==='choice')renderMenu();
  if(ui.type==='input'){inRow.classList.remove('hidden');inputEl.focus();inputEl.select();}
}
function submitInput(){
  if(!ui||ui.type!=='input'||!ui.doneShown)return;
  const v=inputEl.value.trim().slice(0,ui.max)||ui.def;inputEl.blur();finishUI(v);
}
inputEl.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();submitInput();}});
$('inOk').addEventListener('click',e=>{e.stopPropagation();submitInput();});
dlg.addEventListener('click',e=>{if(e.target===inputEl||e.target.id==='inOk')return;if(ui&&(ui.type==='text'||(ui.type==='choice'&&!ui.doneShown)))uiButton('a');});
menuEl.addEventListener('click',e=>{const it=e.target.closest('.mi');if(!it||!ui||ui.type!=='choice')return;e.stopPropagation();audioInit();sfx('confirm');finishUI(+it.dataset.i);});
menuEl.addEventListener('mousemove',e=>{const it=e.target.closest('.mi');if(!it||!ui||ui.type!=='choice')return;const i=+it.dataset.i;if(i!==ui.sel){ui.sel=i;renderMenu();}});
panelEl.addEventListener('click',()=>uiButton('a'));

// toasts & location
const toastEl=$('toast'),locEl=$('loc');const toastQ=[];let toastT=0,locT=0;
function toast(m,silent){toastQ.push(m);if(!silent)sfx('chime');}
function showLoc(name){locEl.textContent=name;locEl.classList.remove('off');locT=2;}
const fadeEl=$('fade');
async function fadeOut(){fadeEl.style.opacity=1;await wait(160);}
async function fadeIn(){fadeEl.style.opacity=0;await wait(140);}
async function run(fn){busy++;try{await fn();}catch(e){console.error(e);}finally{busy--;}}
const worldFree=()=>!ui&&!busy&&mode==='play';

// ================= Audio (chiptune synth, all original) =================
const SONGS={
  title:{bpm:112,leadWave:'square',leadVol:.07,
    lead:'C5 - E5 - G5 - C6 - | B5 - G5 - E5 - G5 - | A5 - F5 - A5 - C6 - | G5 - - - - - . . | C5 - E5 - G5 - C6 - | D6 - C6 - B5 - A5 - | G5 - E5 - D5 - E5 - | C5 - - - - - . .',
    bass:'C3 - . . G2 - . . | G2 - . . D3 - . . | F2 - . . C3 - . . | G2 - . . D3 - . . | C3 - . . G2 - . . | G2 - . . B2 - . . | F2 - . . G2 - . . | C3 - . . C3 - . .',
    drums:'k.h.s.h.k.h.s.hh'},
  town:{bpm:120,leadWave:'square',leadVol:.065,
    lead:'E5 - G5 - A5 - G5 E5 | D5 - - - C5 - D5 - | E5 - G5 - C6 - B5 A5 | G5 - - - . . . . | F5 - A5 - G5 - E5 C5 | D5 - E5 - F5 - E5 D5 | C5 - E5 - D5 - B4 G4 | C5 - - - . . . .',
    bass:'C3 . G3 . C3 . G3 . | G2 . D3 . G2 . D3 . | A2 . E3 . A2 . E3 . | G2 . D3 . G2 . B2 . | F2 . C3 . F2 . C3 . | G2 . D3 . G2 . D3 . | C3 . G2 . G2 . B2 . | C3 . G3 . C3 . . .',
    drums:'k.h.s.h.k.h.s.h.'},
  interior:{bpm:96,leadWave:'triangle',leadVol:.11,
    lead:'A4 - C5 - F5 - - - | E5 - D5 - C5 - - - | D5 - F5 - A5 - G5 F5 | E5 - - - - - . . | A4 - C5 - F5 - A5 - | G5 - F5 - E5 - D5 - | C5 - D5 - E5 - G5 - | F5 - - - - - . .',
    bass:'F2 - . . C3 - . . | C3 - . . G2 - . . | A#2 - . . F3 - . . | C3 - . . G2 - . . | F2 - . . C3 - . . | A#2 - . . F2 - . . | C3 - . . G2 - . . | F2 - . . . . . .',
    drums:'k...h...k...h...'},
  park:{bpm:110,leadWave:'square',leadVol:.06,
    lead:'B4 - D5 - G5 - F#5 - | E5 - D5 - B4 - - - | C5 - E5 - A5 - G5 - | F#5 - - - D5 - - - | B4 - D5 - G5 - B5 - | A5 - G5 - E5 - C5 - | D5 - F#5 - A5 - F#5 - | G5 - - - . . . .',
    bass:'G2 . D3 . G2 . D3 . | E2 . B2 . E2 . B2 . | C3 . G3 . C3 . G3 . | D3 . A2 . D3 . A2 . | G2 . D3 . G2 . D3 . | C3 . G2 . C3 . G2 . | D3 . A2 . D3 . F#2 . | G2 . D3 . G2 . . .',
    drums:'k.h.h.h.s.h.h.h.'},
  industry:{bpm:128,leadWave:'square',leadVol:.06,
    lead:'A4 . A4 C5 E5 . D5 C5 | B4 . G4 . B4 - . . | A4 . A4 C5 E5 . G5 E5 | F5 - E5 - D5 - . . | C5 . C5 E5 A5 . G5 E5 | F5 . D5 . F5 - . . | E5 . D5 . C5 . B4 . | A4 - - - . . . .',
    bass:'A2 . A3 . A2 . A3 . | G2 . G3 . G2 . G3 . | A2 . A3 . A2 . A3 . | D3 . D2 . D3 . D2 . | C3 . C2 . C3 . C2 . | D3 . D2 . D3 . D2 . | E2 . E3 . E2 . G#2 . | A2 . A3 . A2 . . .',
    drums:'k.hsk.hsk.hsk.ss'},
};
SONGS.night=Object.assign({},SONGS.town,{bpm:80,leadWave:'triangle',leadVol:.1,drums:''});
for(const k in SONGS){const s=SONGS[k];s.L=s.lead.replace(/\|/g,' ').trim().split(/\s+/);s.B=s.bass.replace(/\|/g,' ').trim().split(/\s+/);}
const NOTE_I={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
function noteFreq(n){const m=n.match(/^([A-G])(#|b)?(\d)$/);if(!m)return 0;const midi=12*(+m[3]+1)+NOTE_I[m[1]]+(m[2]==='#'?1:m[2]==='b'?-1:0);return 440*Math.pow(2,(midi-69)/12);}
const AU={ctx:null,master:null,music:null,sfx:null,noise:null,muted:false,songKey:null,song:null,step:0,nextT:0,timer:null,lastBump:0,lastBlip:0};
try{AU.muted=localStorage.getItem('vila-som')==='off';}catch(e){}
function audioInit(){
  if(AU.ctx){if(AU.ctx.state==='suspended')AU.ctx.resume();return;}
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  try{
    const c=AU.ctx=new AC();
    AU.master=c.createGain();AU.master.gain.value=AU.muted?0:.55;AU.master.connect(c.destination);
    AU.music=c.createGain();AU.music.gain.value=.5;AU.music.connect(AU.master);
    AU.sfx=c.createGain();AU.sfx.gain.value=.6;AU.sfx.connect(AU.master);
    const buf=c.createBuffer(1,c.sampleRate*.5,c.sampleRate),d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    AU.noise=buf;
    AU.timer=setInterval(schedule,25);
  }catch(e){AU.ctx=null;}
}
function tone(f,t,d,type,vol,dest,slideTo){
  const c=AU.ctx,o=c.createOscillator(),g=c.createGain();
  o.type=type;o.frequency.setValueAtTime(f,t);if(slideTo)o.frequency.exponentialRampToValueAtTime(slideTo,t+d);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+.008);g.gain.linearRampToValueAtTime(vol*.6,t+d*.6);g.gain.linearRampToValueAtTime(0,t+d);
  o.connect(g);g.connect(dest);o.start(t);o.stop(t+d+.03);
}
function noiseHit(t,d,vol,ftype,freq,dest){
  const c=AU.ctx,s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();
  s.buffer=AU.noise;f.type=ftype;f.frequency.value=freq;
  g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+d);
  s.connect(f);f.connect(g);g.connect(dest);s.start(t);s.stop(t+d+.02);
}
function drum(ch,t){
  if(ch==='k'){const c=AU.ctx,o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.setValueAtTime(150,t);o.frequency.exponentialRampToValueAtTime(40,t+.12);
    g.gain.setValueAtTime(.45,t);g.gain.exponentialRampToValueAtTime(.001,t+.14);o.connect(g);g.connect(AU.music);o.start(t);o.stop(t+.16);}
  else if(ch==='s')noiseHit(t,.12,.18,'highpass',1500,AU.music);
  else if(ch==='h')noiseHit(t,.035,.06,'highpass',7000,AU.music);
}
function trackLen(arr,i){let n=1;while(arr[(i+n)%arr.length]==='-'&&n<arr.length)n++;return n;}
function schedule(){
  const s=AU.song;if(!s||!AU.ctx)return;
  const sd=60/s.bpm/2;
  while(AU.nextT<AU.ctx.currentTime+.15){
    const i=AU.step,t=AU.nextT;
    const ln=s.L[i%s.L.length],bn=s.B[i%s.B.length];
    if(ln!=='.'&&ln!=='-'){const f=noteFreq(ln);if(f)tone(f,t,trackLen(s.L,i%s.L.length)*sd*.92,s.leadWave,s.leadVol,AU.music);}
    if(bn!=='.'&&bn!=='-'){const f=noteFreq(bn);if(f)tone(f,t,trackLen(s.B,i%s.B.length)*sd*.9,'triangle',.16,AU.music);}
    if(s.drums)drum(s.drums[i%s.drums.length],t);
    AU.step=(i+1)%s.L.length;AU.nextT+=sd;
  }
}
function setSong(key){
  if(!AU.ctx||AU.songKey===key)return;
  AU.songKey=key;const c=AU.ctx,now=c.currentTime;
  AU.music.gain.cancelScheduledValues(now);AU.music.gain.setValueAtTime(AU.music.gain.value,now);
  AU.music.gain.linearRampToValueAtTime(0,now+.3);AU.music.gain.linearRampToValueAtTime(.5,now+.7);
  AU.song=SONGS[key];AU.step=0;AU.nextT=now+.35;
}
function desiredSong(){
  if(mode==='title'||mode==='intro')return 'title';
  if(mode!=='play'||!curMap)return null;
  const id=curMap.id,h=hourNow();
  if(id==='town')return (h>=19.5||h<6)?'night':'town';
  if(id==='parque')return (h>=19.5||h<6)?'night':'park';
  if(id==='industria'||id==='fabrica')return 'industry';
  return 'interior';
}
const SFX={
  blip:t=>tone(1046,t,.025,'square',.035,AU.sfx),
  move:t=>tone(784,t,.04,'square',.06,AU.sfx),
  confirm:t=>{tone(988,t,.05,'square',.07,AU.sfx);tone(1480,t+.05,.07,'square',.07,AU.sfx);},
  cancel:t=>{tone(660,t,.05,'square',.06,AU.sfx);tone(440,t+.05,.07,'square',.06,AU.sfx);},
  bump:t=>tone(120,t,.09,'square',.08,AU.sfx,70),
  door:t=>{noiseHit(t,.25,.12,'bandpass',900,AU.sfx);tone(520,t,.22,'triangle',.12,AU.sfx,180);},
  coin:t=>{tone(988,t,.07,'square',.07,AU.sfx);tone(1319,t+.07,.18,'square',.07,AU.sfx);},
  pay:t=>{tone(660,t,.05,'triangle',.1,AU.sfx);tone(880,t+.05,.08,'triangle',.1,AU.sfx);},
  chime:t=>{tone(1319,t,.09,'triangle',.12,AU.sfx);tone(1760,t+.09,.18,'triangle',.12,AU.sfx);},
  fanfare:t=>{[523,659,784,1046].forEach((f,i)=>tone(f,t+i*.08,.1,'square',.07,AU.sfx));tone(1046,t+.32,.35,'square',.07,AU.sfx);tone(784,t+.32,.35,'triangle',.12,AU.sfx);},
  sleep:t=>{[784,659,523,392].forEach((f,i)=>tone(f,t+i*.22,.3,'triangle',.13,AU.sfx));},
  error:t=>{tone(196,t,.08,'square',.08,AU.sfx);tone(196,t+.12,.12,'square',.08,AU.sfx);},
};
function sfx(name){
  if(!AU.ctx||AU.muted)return;
  const now=AU.ctx.currentTime;
  if(name==='bump'){if(now-AU.lastBump<.3)return;AU.lastBump=now;}
  if(name==='blip'){if(now-AU.lastBlip<.045)return;AU.lastBlip=now;}
  try{SFX[name](now+.005);}catch(e){}
}
function setMuted(m){
  AU.muted=m;try{localStorage.setItem('vila-som',m?'off':'on');}catch(e){}
  if(AU.ctx){const now=AU.ctx.currentTime;AU.master.gain.cancelScheduledValues(now);AU.master.gain.setTargetAtTime(m?0:.55,now,.05);}
  const b=$('sndBtn');if(b){b.textContent=m?'🔇 Som desligado':'🔊 Som ligado';b.setAttribute('aria-pressed',String(!m));}
}
document.addEventListener('visibilitychange',()=>{if(!AU.ctx)return;if(document.hidden)AU.ctx.suspend();else AU.ctx.resume();});

// ================= Input =================
const KEY={ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',KeyZ:'a',Space:'a',Enter:'a',KeyE:'a',KeyX:'b',Escape:'b',KeyQ:'b',ShiftLeft:'run',ShiftRight:'run'};
const isDir=k=>k==='up'||k==='down'||k==='left'||k==='right';
function press(k,down,repeat){
  if(isDir(k)){
    if(down){if(!held.includes(k))held.push(k);if(!repeat&&!ui&&mode==='play')bufDir=k;onButton(k);}
    else{const i=held.indexOf(k);if(i>=0)held.splice(i,1);}
  }else if(k==='run')running=down;
  else if(down&&!repeat)onButton(k);
}
function onButton(k){
  if(ui){uiButton(k);return;}
  if(mode!=='play'||busy)return;
  if(k==='a'){if(player.moving)bufA=true;else interact();}
  else if(k==='b'){bufDir=null;held.length=0;run(startMenu);}
}
addEventListener('keydown',e=>{audioInit();if(document.activeElement===inputEl)return;
  if(e.code==='KeyM'&&!e.repeat){setMuted(!AU.muted);toast(AU.muted?'Som desligado':'Som ligado',true);return;}
  const k=KEY[e.code];if(!k)return;e.preventDefault();press(k,true,e.repeat);});
addEventListener('keyup',e=>{const k=KEY[e.code];if(k)press(k,false);});
addEventListener('blur',()=>{held.length=0;running=false;});
document.querySelectorAll('#pad button').forEach(b=>{
  const k=b.dataset.k;
  b.addEventListener('pointerdown',e=>{e.preventDefault();audioInit();b.classList.add('on');press(k,true,false);});
  const up=()=>{b.classList.remove('on');press(k,false);};
  b.addEventListener('pointerup',up);b.addEventListener('pointerleave',up);b.addEventListener('pointercancel',up);
});

// ================= Interactions =================
function interact(){
  const [dx,dy]=DIRS[player.dir];const fx=player.x+dx,fy=player.y+dy;
  const bar=curMap.barriers&&curMap.barriers.find(b=>b.x===fx&&b.y===fy&&b.lock());
  if(bar){run(()=>say(bar.msg));return;}
  let n=npcAt(curMap,fx,fy);const t=tileAt(curMap,fx,fy);
  if(!n&&(t==='k'||t==='n'||t==='i'))n=npcAt(curMap,fx+dx,fy+dy);
  if(n){run(async()=>{if(n.kind!=='cat')n.dir=OPP[player.dir];talkNpc=n;try{await n.talk(n);}finally{talkNpc=null;}if(!n.wander)n.dir=n.baseDir;});return;}
  const fn=TILE_ACT[t];if(fn)run(()=>fn(fx,fy));
}
const TILE_ACT={
  B:()=>sleepFlow(),Y:()=>sleepFlow(),
  D:()=>computerFlow(),
  G:()=>showPanel(companyHTML()),
  V:()=>tvFlow(),
  Z:(x,y)=>{const v=SIGNS[curMap.id+':'+x+','+y];return say(typeof v==='function'?v():v||'Uma placa.');},
  M:x=>machineFlow([2,4,6,8].indexOf(x)),
  j:()=>say('Um banco de praça. Ótimo lugar para planejar o próximo passo.'),
  C:()=>say('Uma cadeira de madeira, bem confortável.'),
  U:()=>say('Você se joga no sofá por um instante. Que conforto!'),
  I:()=>say('Na estante, um livro chama sua atenção: '+pick(['"Do Zero ao Lucro em 30 Dias"','"Planilhas: Uma História de Amor"','"A Arte de Negociar com Gatos"','"O Empreendedor de Pijama"','"Fluxo de Caixa para Leigos"'])+'.'),
  J:()=>say('Um abajur de pé. A luz quente deixa tudo mais aconchegante.'),
  h:()=>say('Um criado-mudo com um abajur e um despertador.'),
  O:()=>say(curMap.id==='cafe'?'A vitrine está cheia de bolos, croissants e pães de queijo.':'A cozinha. Cheiro de café passado na hora.'),
  g:()=>say('Uma geladeira cheia de sucos e refrigerantes geladinhos.'),
  e:()=>say('Frutas e verduras fresquinhas da região.'),
  s:()=>say('Um bebedouro. Você toma um copo de água gelada.'),
  b:()=>say('Barris e caixas de material.'),
  i:()=>say('Uma caixa registradora reluzente.'),
  k:()=>say('Um balcão bem polido.'),
  L:()=>say(isNight()?'O poste ilumina a rua com uma luz amarelada.':'Um poste de luz. À noite ele acende.'),
  H:()=>say('Um arbusto bem aparado.'),
  Q:()=>say('Uma pedra coberta de musgo.'),
  z:()=>{const hh=Math.floor(S.min/60)%24,mm=Math.floor(S.min%60);return say(`O relógio marca ${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}.`);},
  d:()=>say(`Cardápio: café R$ 15, pão de queijo R$ 6, bolo do dia R$ 9. Embaixo, escrito a giz: "Apoie os negócios da vila!"`),
  x:()=>say('Caixas de carga prontas para embarque.'),
  E:()=>say('Uma mesa vazia, esperando um novo talento. Contrate alguém no Café!'),
  S:()=>say(curMap.id==='mercado'?'Prateleiras cheias de produtos. Um dia os seus estarão aqui também.':'Pastas, planilhas e ideias.'),
  R:()=>say('A geladeira tem um pote de doce de leite. Melhor guardar para depois.'),
  K:()=>say('A máquina de café cheira muito bem.'),
  t:()=>say('Uma mesa arrumadinha.'),
  P:()=>say('Uma planta bem cuidada.'),
  W:()=>say(isNight()?'Lá fora, as luzes da vila brilham.':'Dá para ver a vila pela janela.'),
  A:()=>say('Um quadro de uma paisagem. Inspirador!'),
};
async function doWarp(w){
  sfx('door');
  await fadeOut();
  loadMap(w.to);
  const m=MAPS[w.to];
  if(w.tx!=null)placePlayer(w.tx,w.ty,w.dir);else placePlayer(m.spawn[0],m.spawn[1],'up');
  await fadeIn();
}
function loadMap(id){
  if(id==='sede')buildSede();
  refreshDyn(id);
  const changed=!curMap||curMap.id!==id;
  curMap=MAPS[id];S.pos.map=id;
  if(changed)showLoc(curMap.name);
}

// ----- scripts -----
async function villagerTalk(n){
  const o=S.orders.find(o=>o.npc===n.id);const s=sec();
  if(o){
    if(S.stock>=o.qty){
      const i=await ask(`${n.name}: Você trouxe ${o.qty} ${s.pp}? Eu pago ${fmt(o.pay)}!`,['Entregar','Ainda não']);
      if(i===0){S.stock-=o.qty;S.money+=o.pay;S.stats.sold+=o.qty;S.stats.revenue+=o.pay;S.stats.ordersDone++;S.rep=Math.min(100,S.rep+3);
        S.orders=S.orders.filter(x=>x!==o);
        await say(`${n.name}: Perfeito! Vou recomendar a ${S.coName} para todo mundo! (+${fmt(o.pay)}, +3 reputação)`);}
    }else await say(`${n.name}: Preciso de ${o.qty} ${s.pp} hoje. Pago ${fmt(o.pay)}! Você tem ${S.stock} agora.`);
    return;
  }
  await say(`${n.name}: ${pick(n.lines)}`);
}
async function ramosTalk(){
  const g=nextGoal();
  if(S.level>=2&&Math.random()<.35){
    const tips=['O Fornecedor Bento, no Parque Norte, vende material no atacado bem mais barato.','Aos fins de semana, a feira do Parque Norte paga 40% a mais que o Mercado.','A Sra. Valéria investe em empresas valiosas. Vá ao Parque Norte quando a sua crescer.'];
    if(S.level>=3)tips.push('No Distrito Industrial, máquinas produzem sem salário e o Capitão Nunes exporta sem limite de demanda.');
    return say('Sr. Ramos: '+pick(tips));
  }
  if(g)await say(`Sr. Ramos: Próximo passo, ${S.name}: ${g.t.charAt(0).toLowerCase()+g.t.slice(1)}. ${g.hint}`);
  else await say(`Sr. Ramos: A ${S.coName} já é maior do que a minha empresa jamais foi. Tenho orgulho de você!`);
}
async function catTalk(){
  if(S.petDay!==S.day){S.petDay=S.day;S.energy=Math.min(100,S.energy+5);await say('Pixel ronrona e se esfrega na sua perna. Você se sente renovado! (+5 energia)');}
  else await say('Pixel está tirando uma soneca. Miau...');
}
async function tvFlow(){
  const s=sec();let h;
  if(S.priceF>1.1)h=`Alta demanda! Preço dos ${s.pp} dispara hoje.`;
  else if(S.priceF<0.9)h=`Mercado fraco: ${s.pp} em baixa hoje.`;
  else h=`Mercado estável para ${s.pp}.`;
  await say(`Jornal da Vila: "${h}" O Mercado paga ${fmt(unitPrice())} por ${s.p}.`);
  if(S.event)await say(`Plantão: ${S.event.msg}`);
}
async function marketTalk(){
  const s=sec();
  while(true){
    const i=await ask('Atendente: Bem-vindo ao Mercado! Como posso ajudar?',[`Comprar ${s.m}`,`Vender ${s.pp}`,'Sair']);
    if(i===0)await buyFlow();else if(i===1)await sellFlow();else{await say('Atendente: Volte sempre!');return;}
  }
}
async function buyFlow(){
  const s=sec(),mp=matPrice();
  const qs=[5,10,25,50].filter(q=>q*mp<=S.money);
  if(!qs.length)return say(`Atendente: Cada unidade de ${s.m} custa ${fmt(mp)}. Parece que falta dinheiro...`);
  const i=await ask(`Atendente: ${capF(s.m)} a ${fmt(mp)} cada. Você tem ${S.materials}. Quanto vai levar?`,[...qs.map(q=>`${q} por ${fmt(q*mp)}`),'Voltar']);
  if(i>=qs.length)return;
  const q=qs[i];S.money-=q*mp;S.materials+=q;
  await say(`Você comprou ${q} de ${s.m}. Agora tem ${S.materials}.`);
}
async function sellFlow(){
  const s=sec();
  if(S.stock<=0)return say(`Atendente: Você não tem ${s.pp} para vender. Produza no computador da sua Sede!`);
  const left=demandCap()-S.soldToday;
  if(left<=0)return say('Atendente: Já comprei tudo o que precisava hoje. Volte amanhã! Campanhas de marketing aumentam a demanda.');
  const price=unitPrice(),max=Math.min(S.stock,left);
  const qs=[...new Set([1,5,max].filter(q=>q<=max))];
  const i=await ask(`Atendente: Pago ${fmt(price)} por ${s.p}. Hoje compro até ${left}. Quantos?`,[...qs.map(q=>q===max&&q>1?`Tudo (${q}) = ${fmt(q*price)}`:`${q} = ${fmt(q*price)}`),'Voltar']);
  if(i>=qs.length)return;
  const q=qs[i],tot=q*price;
  S.stock-=q;S.money+=tot;S.soldToday+=q;S.stats.sold+=q;S.stats.revenue+=tot;
  await say(`Você vendeu ${q} ${q>1?s.pp:s.p} por ${fmt(tot)}!`);
}
async function computerFlow(){
  const s=sec();
  while(true){
    const i=await ask(`${S.coName} · ${capF(s.m)}: ${S.materials} · ${capF(s.pp)}: ${S.stock} · Energia: ${Math.round(S.energy)}`,
      ['Produzir','Pesquisa e qualidade','Marketing',`Compra automática: ${S.autoBuy?'ligada':'desligada'}`,'Sair']);
    if(i===0)await produceFlow();
    else if(i===1)await researchFlow();
    else if(i===2)await marketingFlow();
    else if(i===3){
      if(S.level<2)await say('A compra automática fica disponível a partir da Sala Comercial.');
      else{S.autoBuy=!S.autoBuy;await say(S.autoBuy?`Compra automática ligada: à noite, o material da equipe é comprado sozinho (${fmt(matPrice())} cada).`:'Compra automática desligada.');}
    }else return;
  }
}
async function produceFlow(){
  const s=sec();
  if(S.materials<=0)return say(`Sem ${s.m}! Compre no Mercado, ao sul da praça.`);
  const max=Math.min(S.materials,Math.floor(S.energy/ENERGY_PER));
  if(max<=0)return say('Você está cansado demais para produzir. Tome um café ou durma.');
  const qs=[...new Set([1,5,max].filter(q=>q<=max))];
  const i=await ask(`Cada ${s.p} usa 1 de ${s.m}, ${ENERGY_PER} de energia e ${MIN_PER} minutos. Quantos produzir?`,[...qs.map(q=>q===max&&q>1?`Máximo (${q})`:String(q)),'Voltar']);
  if(i>=qs.length)return;
  const q=qs[i];
  await fadeOut();
  S.materials-=q;S.stock+=q;S.energy-=q*ENERGY_PER;S.min+=q*MIN_PER;S.stats.produced+=q;
  await wait(250);await fadeIn();
  await say(`Mãos à obra! Você produziu ${q} ${q>1?s.pp:s.p}. Estoque: ${S.stock}.`);
}
async function researchFlow(){
  if(S.quality>=5)return say(`Qualidade máxima! ${stars(5)} Seus produtos são referência na vila.`);
  const cost=QUALITY_COST[S.quality];
  const i=await ask(`Qualidade: ${stars(S.quality)}. Subir para o nível ${S.quality+1} custa ${fmt(cost)} e aumenta o preço de venda.`,['Investir','Voltar']);
  if(i!==0)return;
  if(S.money<cost)return say('Dinheiro insuficiente para essa pesquisa.');
  S.money-=cost;S.quality++;
  await say(`Pesquisa concluída! Qualidade agora: ${stars(S.quality)}. Novo preço: ${fmt(unitPrice())}.`);
}
async function marketingFlow(){
  if(S.rep>=100)return say('Sua reputação já está no máximo!');
  const cost=Math.round(250*(1+S.campaigns*0.6));
  const i=await ask(`Reputação: ${S.rep}/100. Uma campanha custa ${fmt(cost)} e dá +8 de reputação: preço, demanda, encomendas e candidatos melhores.`,['Lançar campanha','Voltar']);
  if(i!==0)return;
  if(S.money<cost)return say('Dinheiro insuficiente para a campanha.');
  S.money-=cost;S.campaigns++;S.rep=Math.min(100,S.rep+8);
  await say(`Campanha no ar! Cartazes da ${S.coName} se espalham pela vila. Reputação: ${S.rep}/100.`);
}
async function loanTalk(){
  if(S.debt>0){
    const i=await ask(`Gerente: Você nos deve ${fmt(S.debt)}. Deseja quitar?`,['Pagar tudo','Agora não']);
    if(i!==0)return;
    if(S.money<S.debt)return say('Gerente: Saldo insuficiente. Volte quando tiver o valor completo.');
    S.money-=S.debt;S.debt=0;return say('Gerente: Dívida quitada! Seu crédito com o banco está ótimo.');
  }
  const amt=1000*S.level;
  const i=await ask(`Gerente: Posso emprestar ${fmt(amt)} agora. Você devolve ${fmt(amt*1.2)} quando puder.`,['Aceitar','Não, obrigado']);
  if(i!==0)return say('Gerente: Tudo bem. Estamos aqui se precisar.');
  S.money+=amt;S.debt=Math.round(amt*1.2);
  await say(`Gerente: Pronto! ${fmt(amt)} na sua conta. Use com sabedoria.`);
}
async function realtorTalk(){
  if(S.level>=4)return say('Corretora: Você já tem a Torre Corporativa, o maior prédio da vila!');
  const nx=LEVELS[S.level];
  const i=await ask(`Corretora: ${nx.name} por ${fmt(nx.price)}. Cabem ${nx.maxEmp} funcionários e a equipe rende +${Math.round((nx.bonus-1)*100)}%.`,['Comprar','Agora não']);
  if(i!==0)return;
  if(S.money<nx.price)return say(`Corretora: Faltam ${fmt(nx.price-S.money)}. Um empréstimo com o Gerente pode ajudar!`);
  S.money-=nx.price;S.level++;
  await say(`Corretora: Parabéns! A ${S.coName} agora tem: ${nx.name}! Visite sua nova Sede.`);
  toast(`Nova sede: ${nx.name}!`);
  if(S.level===2){await say('Corretora: E tem mais: com a Sala Comercial, a Estrada Norte foi liberada para você. Lá fica o Parque Norte!');toast('Novo lugar: Parque Norte!');}
  if(S.level===3){await say('Corretora: Com um Escritório, você ganha acesso ao Distrito Industrial, a leste da vila. Fábrica e porto te esperam!');toast('Novo lugar: Distrito Industrial!');}
}
async function baristaTalk(){
  const i=await ask('Barista: Um cafezinho fresco? R$ 15 e você recupera 30 de energia.',['Quero um café','Não, obrigado']);
  if(i!==0)return;
  if(S.money<15)return say('Barista: Ih, faltou dinheiro... fica pra próxima!');
  if(S.energy>=100)return say('Barista: Você já está cheio de energia! Volte mais tarde.');
  S.money-=15;S.energy=Math.min(100,S.energy+30);S.min+=10;
  await say('Você tomou um café delicioso. Energia renovada!');
}
async function candidateTalk(n){
  const c=n.cand,s=sec();
  await say(`${c.name}: ${pick(['Oi! Estou procurando um lugar para crescer.','Ouvi falar da sua empresa! Tem vaga?','Sou dedicado e aprendo rápido!','Trabalhei numa empresa da capital, mas prefiro a vila.'])}`);
  const i=await ask(`${c.name} produz ${c.skill} ${s.pp} por dia e pede ${fmt(c.salary)} por dia.`,['Contratar','Agora não']);
  if(i!==0)return;
  if(S.employees.length>=lvl().maxEmp)return say(`Sua sede (${lvl().name}) só comporta ${lvl().maxEmp} funcionário(s). Amplie com a corretora do Banco!`);
  S.employees.push({name:c.name,skill:c.skill,salary:c.salary,pal:c.pal});
  S.candidates=S.candidates.filter(x=>x!==c);S.stats.hired++;
  refreshDyn('cafe');
  await say(`${c.name} agora faz parte da ${S.coName}! Ele(a) trabalha na Sede e produz toda noite, se houver ${s.m}.`);
}
async function employeeTalk(n){
  const e=n.emp,s=sec();
  await say(`${e.name}: ${pick(['Trabalhando a todo vapor, chefe!','Tive uma ideia ótima para um novo produto!',`Hoje vou bater a meta de ${e.skill} ${s.pp}!`,`Não esquece de comprar ${s.m}, tá?`,'Adoro trabalhar aqui!'])}`);
  const i=await ask(`${e.name} · ${e.skill} ${s.pp}/dia · ${fmt(e.salary)}/dia`,['Continue assim!','Demitir']);
  if(i!==1)return;
  const c=await ask(`Tem certeza que quer demitir ${e.name}?`,['Não','Sim, demitir'],0);
  if(c!==1)return;
  S.employees=S.employees.filter(x=>x!==e);refreshDyn('sede');
  await say(`${e.name} arrumou as coisas e foi embora.`);
}
// ----- Parque Norte & Distrito Industrial -----
async function supplierTalk(){
  const s=sec(),mp=matPrice();
  const deals=[[50,.8],[100,.7],[200,.62]].map(([q,d])=>({q,cost:Math.round(q*mp*d)})).filter(o=>o.cost<=S.money);
  if(!deals.length)return say(`Fornecedor Bento: Vendo ${s.m} no atacado, a partir de 50 unidades. Volte com mais dinheiro!`);
  const i=await ask(`Fornecedor Bento: ${capF(s.m)} no atacado, bem mais barato que no Mercado. Quanto vai levar?`,[...deals.map(o=>`${o.q} por ${fmt(o.cost)}`),'Voltar']);
  if(i>=deals.length)return;
  S.money-=deals[i].cost;S.materials+=deals[i].q;
  await say(`Fornecedor Bento: Negócio fechado! Você agora tem ${S.materials} de ${s.m}.`);
}
const isWeekend=()=>((S.day-1)%7)>=5;
async function fairTalk(){
  const s=sec();
  if(!isWeekend())return say('Feirante Dalva: A feira só abre aos sábados e domingos! Nesses dias eu pago bem mais que o Mercado.');
  if(S.stock<=0)return say(`Feirante Dalva: Hoje tem feira! Traga ${s.pp} que eu revendo tudo aqui.`);
  const cap=15+S.level*5,left=cap-S.fairSold;
  if(left<=0)return say('Feirante Dalva: Minha banca já está cheia hoje. Até a próxima feira!');
  const price=Math.round(unitPrice()*1.4),max=Math.min(S.stock,left);
  const i=await ask(`Feirante Dalva: Pago ${fmt(price)} por ${s.p}, até ${left} hoje. Vender ${max} por ${fmt(max*price)}?`,['Vender','Agora não']);
  if(i!==0)return;
  S.stock-=max;S.money+=max*price;S.fairSold+=max;S.stats.sold+=max;S.stats.revenue+=max*price;
  await say(`Você vendeu ${max} ${max>1?s.pp:s.p} na feira por ${fmt(max*price)}!`);
}
const ROUNDS=[{name:'investimento-anjo',need:5000,amt:2000},{name:'rodada Semente',need:20000,amt:6000},{name:'rodada Série A',need:50000,amt:15000}];
async function investorTalk(){
  const r=ROUNDS[S.rounds];
  if(!r)return say('Sra. Valéria: Que orgulho ter investido na sua empresa! Continue crescendo.');
  const v=companyValue();
  if(v<r.need)return say(`Sra. Valéria: Eu invisto em empresas promissoras. Quando a ${S.coName} valer ${fmt(r.need)}, conversamos sobre um ${r.name}. Hoje ela vale ${fmt(v)}.`);
  const i=await ask(`Sra. Valéria: Impressionante! Ofereço ${fmt(r.amt)} como ${r.name}. Aceita?`,['Aceitar','Agora não']);
  if(i!==0)return;
  S.money+=r.amt;S.rounds++;S.rep=Math.min(100,S.rep+5);
  await say(`Sra. Valéria: Fechado! ${fmt(r.amt)} na sua conta. A vila inteira já está comentando! (+5 reputação)`);
}
async function exporterTalk(){
  const s=sec(),daysLeft=3-(S.day-S.lastExport);
  if(daysLeft>0)return say(`Capitão Nunes: Meu navio volta em ${daysLeft} dia(s). Prepare bastante ${s.pp}!`);
  if(S.stock<10)return say(`Capitão Nunes: Eu levo ${s.pp} para a capital, sem limite de demanda, mas só cargas de 10 unidades ou mais. Você tem ${S.stock}.`);
  const q=Math.min(S.stock,80),price=Math.round(unitPrice()*1.1);
  const i=await ask(`Capitão Nunes: Levo ${q} ${s.pp} a ${fmt(price)} cada, total de ${fmt(q*price)}. Fechado?`,['Embarcar carga','Agora não']);
  if(i!==0)return;
  S.stock-=q;S.money+=q*price;S.stats.sold+=q;S.stats.revenue+=q*price;S.lastExport=S.day;S.rep=Math.min(100,S.rep+2);
  await say(`A carga foi embarcada! +${fmt(q*price)}. O navio volta em 3 dias.`);
}
const MACHINE_COST=[3000,4500,6500,9000];
async function foremanTalk(){
  const s=sec();
  await say(`Supervisora Rita: A fábrica tem ${S.machines}/4 máquinas. Cada uma produz 8 ${s.pp} por noite usando ${s.m}, com ${fmt(15)} de manutenção.`);
  if(S.machines<4)await machineFlow();
}
async function machineFlow(slot){
  const s=sec();
  if(slot!=null&&slot>=0&&slot<S.machines)return say(`Máquina ${slot+1}: funcionando! Produz 8 ${s.pp} por noite.`);
  if(S.machines>=4)return say('Todas as máquinas já foram compradas.');
  const cost=MACHINE_COST[S.machines];
  const i=await ask(`Comprar a máquina ${S.machines+1} por ${fmt(cost)}? Ela produz 8 ${s.pp} por noite, sem salário.`,['Comprar','Agora não']);
  if(i!==0)return;
  if(S.money<cost)return say('Dinheiro insuficiente para essa máquina.');
  S.money-=cost;S.machines++;
  await say(`Máquina instalada! A fábrica agora tem ${S.machines}/4 máquinas.`);
}

async function sleepFlow(){
  const i=await ask(S.min<18*60?'Ainda é cedo... Quer mesmo dormir e encerrar o dia?':'Encerrar o dia e dormir?',['Dormir','Não']);
  if(i!==0)return;
  sfx('sleep');
  await fadeOut();
  const lines=endDay(false);
  saveGame(true);await wait(500);await fadeIn();
  await showPanel(reportHTML(lines));
}
let passing=false,lateWarned=false;
async function passOutFlow(){
  sfx('error');
  await say('Você está exausto... e desmaia!');
  await fadeOut();
  const lines=endDay(true);
  loadMap('casa');placePlayer(2,4,'down');
  saveGame(true);await wait(500);await fadeIn();
  await say('Alguém te encontrou na rua e te trouxe para casa. Durma antes das 2h!');
  await showPanel(reportHTML(lines));
}
function endDay(passed){
  const lines=[],L=lvl(),s=sec();
  const sick=evId()==='gripe'?S.event.sick:null;
  const prods=S.employees.map(e=>e.name===sick?0:Math.max(1,Math.round(e.skill*L.bonus)));
  const mProd=S.machines*8;
  const need=prods.reduce((a,b)=>a+b,0)+mProd;
  if(S.autoBuy&&S.materials<need){
    const mp=matPrice(),can=Math.min(need-S.materials,Math.floor(Math.max(0,S.money)/mp));
    if(can>0){S.money-=can*mp;S.materials+=can;lines.push(`Compra automática: ${can} de ${s.m} (−${fmt(can*mp)})`);}
  }
  let made=0;for(const p of prods){const k=Math.min(p,S.materials);S.materials-=k;made+=k;}
  const empNeed=need-mProd;
  S.stock+=made;S.stats.produced+=made;
  if(S.employees.length)lines.push(`A equipe produziu ${made} ${s.pp}.`+(sick?` (${sick} ficou em casa, gripado.)`:'')+(made<empNeed?` Faltou ${s.m}!`:''));
  if(S.machines){
    const mk=Math.min(mProd,S.materials);S.materials-=mk;S.stock+=mk;S.stats.produced+=mk;
    const mc=S.machines*15;S.money-=mc;
    lines.push(`As máquinas produziram ${mk} ${s.pp} (manutenção −${fmt(mc)}).`+(mk<mProd?` Faltou ${s.m}!`:''));
  }
  let paid=0;const quit=[];
  for(const e of [...S.employees]){if(S.money>=e.salary){S.money-=e.salary;paid+=e.salary;}else{quit.push(e.name);S.employees=S.employees.filter(x=>x!==e);}}
  if(paid)lines.push(`Salários pagos: −${fmt(paid)}`);
  if(quit.length)lines.push(`Sem salário, ${quit.join(', ')} pediu demissão!`);
  if(passed){const loss=Math.min(Math.floor(Math.max(0,S.money)*0.1),200);S.money-=loss;if(loss)lines.push(`Você perdeu ${fmt(loss)} enquanto estava desmaiado.`);}
  S.day++;S.min=6*60;S.energy=passed?60:100;S.soldToday=0;lateWarned=false;
  S.priceF=+(0.8+Math.random()*0.45).toFixed(2);
  genOrders();genCandidates();rollEvent();S.fairSold=0;syncTownEvent();
  if(S.event)lines.push(`${EV_LABEL[S.event.id]}: ${S.event.msg}`);
  if(S.level>=2&&isWeekend())lines.push('É fim de semana: tem feira no Parque Norte!');
  lines.push(`Preço no Mercado hoje: ${fmt(unitPrice())} por ${s.p}.`);
  if(S.orders.length)lines.push(`${S.orders.length} morador(es) fizeram encomendas. Procure o "!".`);
  if(S.candidates.length)lines.push(`${S.candidates.length} candidato(s) esperando no Café.`);
  return lines;
}
function genOrders(){
  const ids=VILLAGERS.map(v=>v.id).sort(()=>Math.random()-.5);
  const n=Math.min(5,1+(S.rep>=25?1:0)+(S.level>=3?1:0)+(Math.random()<.4?1:0));
  S.orders=ids.slice(0,n).map(id=>{const qty=rand(2,4)+(S.level-1)*2+Math.floor(S.rep/25);return {npc:id,qty,pay:Math.round(qty*BASE_PRICE*qMult()*1.5)};});
}
function genCandidates(){
  const n=rand(2,3),used=new Set(S.employees.map(e=>e.name));S.candidates=[];
  for(let i=0;i<n;i++){let nm;do nm=pick(NAMES);while(used.has(nm));used.add(nm);
    const skill=clamp(rand(2,4)+Math.floor(S.rep/30)+(S.level-1),1,12);
    S.candidates.push({name:nm,skill,salary:skill*9+rand(0,10),pal:randPal()});}
}
async function startMenu(){
  while(true){
    const opts=['Empresa','Objetivos','Equipe','Salvar','Backup',AU.muted?'Som: desligado':'Som: ligado','Controles','Fechar'];
    const o=opts[await ask(null,opts,opts.length-1,{pos:'start'})];
    if(o==='Empresa')await showPanel(companyHTML());
    else if(o==='Objetivos')await showPanel(goalsHTML());
    else if(o==='Equipe')await showPanel(teamHTML());
    else if(o==='Salvar'){saveGame(false);return;}
    else if(o==='Backup'){if(await backupMenu())return;}
    else if(o.startsWith('Som')){audioInit();setMuted(!AU.muted);}
    else if(o==='Controles')await showPanel(controlsHTML());
    else return;
  }
}
async function victoryFlow(){
  await say('Sr. Ramos chega correndo, sem fôlego...');
  await say(`Sr. Ramos: ${S.name}! A ${S.coName} passou de ${fmt(100000)} em valor! Você é oficialmente um(a) magnata da Vila Empreendedora!`);
  await say('Sr. Ramos: Mas um bom empresário nunca para. Continue crescendo!');
}

// ----- panels -----
function companyHTML(){
  const s=sec(),row=(a,b)=>`<tr><td>${a}</td><td>${b}</td></tr>`;
  return `<h3>${esc(S.coName)}</h3><div class="sub">${s.label} · ${lvl().name} · Fundada por ${esc(S.name)}</div><table>`+
    row('Dinheiro',fmt(S.money))+(S.debt?row('Dívida',fmt(S.debt)):'')+row('Valor da empresa',fmt(companyValue()))+
    row(capF(s.m),S.materials)+row(capF(s.pp)+' em estoque',S.stock)+row('Qualidade',stars(S.quality))+
    row('Reputação',S.rep+'/100')+row('Preço hoje',fmt(unitPrice()))+row('Demanda restante hoje',Math.max(0,demandCap()-S.soldToday))+
    row('Funcionários',S.employees.length+'/'+lvl().maxEmp)+(S.machines?row('Máquinas na fábrica',S.machines+'/4'):'')+
    (S.event?row('Evento de hoje',EV_LABEL[S.event.id]):'')+row('Produzidos / vendidos',S.stats.produced+' / '+S.stats.sold)+
    row('Encomendas entregues',S.stats.ordersDone)+row('Faturamento total',fmt(S.stats.revenue))+'</table>';
}
function goalsHTML(){
  const ng=nextGoal();
  return `<h3>Objetivos</h3><div class="sub">${S.goals.length}/${GOALS.length} concluídos</div><div class="prog"><i style="width:${Math.round(S.goals.length/GOALS.length*100)}%"></i></div><ul>`+
    GOALS.map((g,i)=>{const d=S.goals.includes(i),c=g===ng;return `<li class="${d?'done':c?'cur':''}">${d?'✔':c?'▶':'○'} ${g.t}${g.reward?` <small>(${fmt(g.reward)})</small>`:''}${c?`<br><small>${g.hint}</small>`:''}</li>`;}).join('')+'</ul>';
}
function teamHTML(){
  const s=sec();
  if(!S.employees.length)return `<h3>Equipe</h3><div class="sub">${lvl().name}: até ${lvl().maxEmp} funcionário(s)</div><p>Ninguém contratado ainda. Visite o Café para conhecer candidatos!</p>`;
  const L=lvl(),prod=S.employees.reduce((a,e)=>a+Math.max(1,Math.round(e.skill*L.bonus)),0),sal=S.employees.reduce((a,e)=>a+e.salary,0);
  return `<h3>Equipe</h3><div class="sub">${S.employees.length}/${L.maxEmp} · produção ${prod} ${s.pp}/dia · salários ${fmt(sal)}/dia</div><table>`+
    S.employees.map(e=>`<tr><td>${esc(e.name)}</td><td>${e.skill} ${s.pp}/dia · ${fmt(e.salary)}</td></tr>`).join('')+'</table>';
}
function controlsHTML(){
  return `<h3>Controles</h3><table><tr><td>Andar</td><td>Setas / WASD</td></tr><tr><td>Correr</td><td>Shift</td></tr><tr><td>Interagir / confirmar</td><td>Z, Espaço, Enter</td></tr><tr><td>Menu / voltar</td><td>X, Esc</td></tr></table>
  <p><b>Como jogar:</b> compre material no Mercado, produza no computador da Sede e venda no Mercado ou para moradores com "!". Contrate no Café, amplie a sede no Banco e durma antes das 2h. O jogo salva quando você dorme.</p>
  <p><b>Novos lugares:</b> a Sala Comercial libera o Parque Norte (atacado, feira de fim de semana, investidora). O Escritório libera o Distrito Industrial (fábrica com máquinas e porto de exportação). Fique de olho nos eventos do dia no canto da tela.</p>`;
}
function reportHTML(lines){return `<h3>☀ Dia ${S.day} · ${DOW[(S.day-1)%7]}</h3><div class="sub">Resumo da noite</div><ul>${lines.map(l=>`<li>${esc(l)}</li>`).join('')}</ul>`;}

// ================= Save =================
const SAVE_KEY='vila-empreendedora-v2';
function saveGame(silent){
  S.pos={map:curMap.id,x:player.x,y:player.y,dir:player.dir};
  try{localStorage.setItem(SAVE_KEY,JSON.stringify(S));if(!silent)toast('Jogo salvo!');}
  catch(e){if(!silent)toast('Não foi possível salvar neste navegador.');}
}
function loadRaw(){try{const r=localStorage.getItem(SAVE_KEY);return r?JSON.parse(r):null;}catch(e){return null;}}

// ================= Backup =================
// A backup is a JSON file holding every value the game keeps in storage.
// Restoring keeps the previous values under BK_UNDO so the user can undo once.
const BK_KEYS=[SAVE_KEY,'vila-som'],BK_UNDO='vila-backup-desfazer';
let reloading=false;
const lsGet=k=>{try{return localStorage.getItem(k);}catch(e){return null;}};
function collectBackup(pretty){
  if(mode==='play'&&S&&curMap)saveGame(true);
  const data={};for(const k of BK_KEYS)data[k]=lsGet(k);
  return JSON.stringify({app:'vila-empreendedora',format:1,exportedAt:new Date().toISOString(),data},null,pretty?2:0);
}
function parseBackup(text){
  let o;try{o=JSON.parse(String(text||'').trim());}catch(e){return null;}
  if(!o||o.app!=='vila-empreendedora'||!o.data||typeof o.data!=='object')return null;
  const s=o.data[SAVE_KEY];
  if(s!=null){try{const p=JSON.parse(s);if(!p||typeof p!=='object'||typeof p.day!=='number')return null;}catch(e){return null;}}
  return o;
}
function writeKeys(data){
  for(const k of BK_KEYS){const v=data[k];if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,String(v));}
}
function applyBackup(o){
  try{const prev={};for(const k of BK_KEYS)prev[k]=lsGet(k);localStorage.setItem(BK_UNDO,JSON.stringify(prev));writeKeys(o.data);return true;}
  catch(e){return false;}
}
function undoRestore(){
  try{const prev=JSON.parse(localStorage.getItem(BK_UNDO));if(!prev)return false;writeKeys(prev);localStorage.removeItem(BK_UNDO);return true;}
  catch(e){return false;}
}
function reloadGame(){reloading=true;location.reload();}
// Returns true when the game is about to reload.
async function backupMenu(){
  while(true){
    const opts=['Fazer backup','Restaurar backup'];if(lsGet(BK_UNDO))opts.push('Desfazer restauração');opts.push('Voltar');
    const o=opts[await ask('Backup: guarde seu progresso em um arquivo ou traga de outro lugar.',opts)];
    if(o==='Fazer backup')await doBackup();
    else if(o==='Restaurar backup'){if(await doRestore())return true;}
    else if(o==='Desfazer restauração'){
      if(await ask('Voltar ao progresso de antes da última restauração?',['Sim, desfazer','Não'],1)!==0)continue;
      if(undoRestore()){await say('Pronto! O progresso anterior voltou. O jogo vai recarregar.');reloadGame();return true;}
      await say('Não há restauração para desfazer.');
    }else return false;
  }
}
async function doBackup(){
  if(window.desktop){
    const name=`vila-empreendedora-backup-${new Date().toISOString().slice(0,10)}.json`;
    const r=await window.desktop.saveBackup(collectBackup(true),name);
    if(r&&r.ok)await say('Backup salvo em: '+r.path);
    else if(r&&r.error)await say('Não foi possível salvar o backup: '+r.error);
    return;
  }
  // Web version: browsers here cannot download files, so the backup travels as text.
  const code=collectBackup(false);let ok=false;
  try{await navigator.clipboard.writeText(code);ok=true;}catch(e){}
  if(ok)await say('Código do backup copiado! No app, abra Backup > Restaurar backup > Colar código e cole com Ctrl+V.');
  else{await say('Não consegui copiar sozinho. No próximo passo o código aparece selecionado: copie com Ctrl+C.');await inputText('Código do backup:',code,code.length+10);}
}
async function doRestore(){
  const opts=window.desktop?['De um arquivo','Colar código','Voltar']:['Colar código','Voltar'];
  const o=opts[await ask('De onde vem o backup?',opts)];
  let text=null;
  if(o==='De um arquivo'){
    const r=await window.desktop.openBackup();
    if(!r||!r.ok){if(r&&r.error)await say('Não foi possível abrir o arquivo: '+r.error);return false;}
    text=r.text;
  }else if(o==='Colar código')text=await inputText('Cole o código do backup (Ctrl+V) e aperte Enter:','',2000000);
  else return false;
  const b=parseBackup(text);
  if(!b){await say('Isso não parece um backup da Vila Empreendedora. Nada foi alterado.');return false;}
  let info='';try{const s=JSON.parse(b.data[SAVE_KEY]);info=` (${s.coName}, dia ${s.day})`;}catch(e){}
  if(await ask(`Restaurar este backup${info}? O progresso atual será substituído, mas dá para desfazer depois.`,['Restaurar','Cancelar'],1)!==0)return false;
  if(!applyBackup(b)){await say('Não foi possível gravar os dados.');return false;}
  await say('Backup restaurado! O jogo vai recarregar.');
  reloadGame();return true;
}
// Keep progress when the window closes or the app restarts for an update.
addEventListener('beforeunload',()=>{if(!reloading&&mode==='play'&&S&&curMap)saveGame(true);});

// ================= Goals & HUD =================
const pendingEvents=[];
function checkGoals(){
  GOALS.forEach((g,i)=>{if(S.goals.includes(i)||!g.check())return;S.goals.push(i);
    if(g.reward)S.money+=g.reward;
    toast(`🏆 ${g.t}${g.reward?` (+${fmt(g.reward)})`:''}`,true);sfx('fanfare');
    if(g.final&&!S.won){S.won=true;pendingEvents.push(victoryFlow);}});
}
let hudT=0;
function updateHud(){
  const h=Math.floor(S.min/60)%24,mm=Math.floor(S.min%60/10)*10,p=n=>String(n).padStart(2,'0');
  $('hTime').innerHTML=numHTML(`Dia ${S.day} · ${DOW[(S.day-1)%7]} · ${p(h)}:${p(mm)}`);
  $('hMoney').innerHTML=numHTML(fmt(S.money));
  $('hEn').style.width=clamp(S.energy,0,100)+'%';
  const he=$('hEvent');
  if(S.event){he.textContent=EV_LABEL[S.event.id]||'';he.classList.remove('hidden');}
  else if(isWeekend()&&S.level>=2){he.textContent='🧺 Feira no Parque';he.classList.remove('hidden');}
  else he.classList.add('hidden');
  const g=nextGoal();
  $('goalText').innerHTML=numHTML(g?g.t:'Magnata da vila! 🏆');
  const hr=(S.min/60)%24;$('hIcon').textContent=hr>=19||hr<5.5?'☾':hr>=17?'🌇':'☀';
}

// ================= Loop =================
let last=performance.now();
let lastMoney=null;
function update(dt){
  T+=dt;
  if(AU.ctx){const ds=desiredSong();if(ds)setSong(ds);}
  updateUI(dt);
  if(toastT>0){toastT-=dt;if(toastT<=0)toastEl.classList.add('hidden');}
  else if(toastQ.length){toastEl.innerHTML=numHTML(toastQ.shift());toastEl.classList.remove('hidden');toastT=2.8;}
  if(locT>0){locT-=dt;if(locT<=0)locEl.classList.add('off');}
  if(mode==='title'){titleCam+=dt;return;}
  if(mode!=='play')return;
  if(worldFree()){
    updatePlayer(dt);
    for(const n of curMap.npcs)updateNpc(n,dt);
    S.min+=dt*2.5;
    if(S.min>=24*60&&!lateWarned){lateWarned=true;toast('Já é meia-noite! Volte para casa e durma antes das 2h.');}
    if(S.min>=26*60&&!passing){passing=true;run(async()=>{await passOutFlow();passing=false;});}
    else if(pendingEvents.length)run(pendingEvents.shift());
  }
  checkGoals();
  if(lastMoney!=null){if(S.money>lastMoney+.5)sfx('coin');else if(S.money<lastMoney-.5)sfx('pay');}
  lastMoney=S.money;
  hudT-=dt;if(hudT<=0){hudT=.2;updateHud();}
}
function render(){
  ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
  if(mode==='intro'){renderIntro();return;}
  const m=curMap;if(!m)return;
  let cam;
  if(mode==='title'){const mw=m.w*TS-W;cam={x:Math.round((Math.sin(titleCam*0.12)*0.5+0.5)*mw),y:150};}
  else cam=camFor(m,player.px,player.py);
  LIGHTS.length=0;
  const x0=Math.floor(cam.x/TS),y0=Math.floor(cam.y/TS),x1=Math.ceil((cam.x+W)/TS),y1=Math.ceil((cam.y+H)/TS)+1;
  ensureCache(m);
  ctx.drawImage(m.cache,-cam.x,-cam.y);
  for(const L of m.cacheLights)LIGHTS.push({x:L.x-cam.x,y:L.y-cam.y,r:L.r,c:L.c});
  for(let ty=y0;ty<=y1;ty++)for(let tx=x0;tx<=x1;tx++){
    if(tx<0||ty<0||tx>=m.w||ty>=m.h||!DYN.has(m.tiles[ty][tx]))continue;
    drawTile(m,tx,ty,tx*TS-cam.x,ty*TS-cam.y);
    if(tileAt(m,tx,ty+1)==='T')drawTile(m,tx,ty+1,tx*TS-cam.x,(ty+1)*TS-cam.y);
  }
  if(m.buildings)for(const b of m.buildings)drawBuilding(b,cam);
  if(m.barriers&&S)for(const b of m.barriers){if(!b.lock())continue;const bx=b.x*TS-cam.x,by=b.y*TS-cam.y;
    R(bx+2,by+4,2,11,'#6a4a30');R(bx+12,by+4,2,11,'#6a4a30');R(bx,by+5,16,5,'#f4f4f0');
    for(let i=0;i<16;i+=6)R(bx+i,by+5,3,5,'#e04040');R(bx,by+10,16,1,'rgba(0,0,0,.3)');R(bx+1,by+14,14,2,'rgba(0,0,0,.15)');}
  const ents=[...m.npcs];if(mode==='play')ents.push(player);
  ents.sort((a,b)=>a.py-b.py);
  for(const e of ents)drawEntity(e,cam);
  const h=hourNow(),rain=m.outdoor&&S&&mode==='play'&&evId()==='chuva';
  if(!rain)drawAmbient(m,cam,h);
  // day / night lighting
  let a=0;
  if(h>=17)a=Math.min(.62,(h-17)/4*.62);else if(h<7)a=.62*Math.max(0,(7-h))/1.5;
  if(!m.outdoor)a=Math.min(a*.6,.36);
  if(a>.02)applyLighting(a);
  if(rain){
    ctx.fillStyle='rgba(30,50,90,.2)';ctx.fillRect(0,0,W,H);ctx.fillStyle='rgba(200,220,255,.6)';
    for(let i=0;i<90;i++){const rx=Math.floor((i*73.3+T*50)%(W+20))-10,ry=Math.floor((i*41.7+T*280)%(H+20))-10;ctx.fillRect(rx,ry,1,5);}
  }
  if(h>=16&&h<19&&m.outdoor){ctx.fillStyle=`rgba(255,140,60,${(.08*Math.sin((h-16)/3*Math.PI)).toFixed(3)})`;ctx.fillRect(0,0,W,H);}
}
// Static tiles are pre-drawn once per map (and redrawn when day/night or the company changes);
// only animated tiles are drawn every frame.
const DYN=new Set(['w','z','V','D','E','M']);
function cacheKey(){return (isNight()?'n':'d')+(S?`${S.level}.${S.employees.length}.${S.machines}`:'');}
function ensureCache(m){
  const k=cacheKey();if(m.cache&&m.cacheKey===k)return;
  if(!m.cache){m.cache=document.createElement('canvas');m.cache.width=m.w*TS;m.cache.height=m.h*TS;}
  const g=m.cache.getContext('2d');g.imageSmoothingEnabled=false;g.clearRect(0,0,m.cache.width,m.cache.height);
  const savedCtx=ctx,savedL=LIGHTS;ctx=g;LIGHTS=[];
  try{for(let ty=0;ty<m.h;ty++)for(let tx=0;tx<m.w;tx++)if(!DYN.has(m.tiles[ty][tx]))drawTile(m,tx,ty,tx*TS,ty*TS);}
  finally{m.cacheLights=LIGHTS;ctx=savedCtx;LIGHTS=savedL;}
  m.cacheKey=k;
}
const lightCv=document.createElement('canvas');lightCv.width=W;lightCv.height=H;const lctx=lightCv.getContext('2d');
function applyLighting(a){
  lctx.globalCompositeOperation='source-over';lctx.clearRect(0,0,W,H);
  lctx.fillStyle=`rgba(14,20,58,${a.toFixed(3)})`;lctx.fillRect(0,0,W,H);
  lctx.globalCompositeOperation='destination-out';
  for(const L of LIGHTS){const g=lctx.createRadialGradient(L.x,L.y,0,L.x,L.y,L.r);g.addColorStop(0,'rgba(0,0,0,1)');g.addColorStop(.45,'rgba(0,0,0,.65)');g.addColorStop(1,'rgba(0,0,0,0)');lctx.fillStyle=g;lctx.fillRect(L.x-L.r,L.y-L.r,L.r*2,L.r*2);}
  ctx.drawImage(lightCv,0,0);
  ctx.globalCompositeOperation='lighter';
  for(const L of LIGHTS){const rr=L.r*.7,g=ctx.createRadialGradient(L.x,L.y,0,L.x,L.y,rr),c=L.c||'255,180,80';g.addColorStop(0,`rgba(${c},${Math.min(.35,a*.55).toFixed(3)})`);g.addColorStop(1,`rgba(${c},0)`);ctx.fillStyle=g;ctx.fillRect(L.x-rr,L.y-rr,rr*2,rr*2);}
  ctx.globalCompositeOperation='source-over';
}
function drawAmbient(m,cam,h){
  if(!m.outdoor)return;
  const night=h>=19.5||h<5.5,mw=m.w*TS,mh=m.h*TS;
  if(!night){
    // cloud shadows
    ctx.fillStyle='rgba(10,30,60,.07)';
    for(let i=0;i<3;i++){const cx=((i*260+T*7)%(mw+240))-120-cam.x,cy=(hash(i,3)%mh)-cam.y;
      ctx.beginPath();ctx.ellipse(cx,cy,46,18,0,0,Math.PI*2);ctx.ellipse(cx+30,cy+8,34,14,0,0,Math.PI*2);ctx.fill();}
    // butterflies
    const bc=['#f8f0f0','#f8d040','#f090c0','#88c8f8'];
    for(let i=0;i<6;i++){const bx=hash(i,11)%mw,by=hash(i,13)%mh;
      const x=Math.round(bx+Math.sin(T*.45+i)*34-cam.x),y=Math.round(by+Math.sin(T*.7+i*3)*14+Math.sin(T*7+i)*1.5-cam.y);
      if(x<-4||y<-4||x>W+4||y>H+4)continue;const c=bc[i%4];
      if(Math.floor(T*9+i)%2){R(x-2,y-1,2,2,c);R(x+1,y-1,2,2,c);}else{R(x-1,y-2,1,2,c);R(x+1,y-2,1,2,c);}R(x,y-1,1,2,'#3a2a2a');}
  }else{
    for(let i=0;i<18;i++){const bx=hash(i,7)%mw,by=hash(i,9)%mh;
      const x=bx+Math.sin(T*.6+i)*16-cam.x,y=by+Math.cos(T*.8+i*2)*10-cam.y;
      if(x<-6||y<-6||x>W+6||y>H+6)continue;const on=(Math.sin(T*2.5+i*1.7)+1)/2;if(on<.35)continue;
      ctx.fillStyle=`rgba(230,255,140,${on.toFixed(2)})`;ctx.fillRect(Math.round(x),Math.round(y),1,1);LIGHTS.push({x,y,r:7,c:'200,255,120'});}
  }
}
function renderIntro(){
  for(let y=0;y<H;y+=8){const k=y/H;ctx.fillStyle=`rgb(${Math.round(120+60*k)},${Math.round(190+30*k)},${Math.round(240-40*k)})`;ctx.fillRect(0,y,W,8);}
  R(0,96,W,H-96,'#79c465');R(0,96,W,2,'#58a54a');
  ctx.fillStyle='#58a54a';ctx.beginPath();ctx.ellipse(W/2,100,34,7,0,0,Math.PI*2);ctx.fill();
  const P=introWho==='ramos'?RAMOS_PAL:PLAYER_PAL;
  ctx.drawImage(sprite(P,'down',0),W/2-24,32,48,72);
}
function frame(now){
  const dt=Math.min(.05,(now-last)/1000);last=now;
  update(dt);render();requestAnimationFrame(frame);
}

// ================= Flow =================
async function titleFlow(){
  mode='title';curMap=MAPS.town;
  $('title').classList.remove('hidden');$('hud').classList.add('hidden');$('goal').classList.add('hidden');
  const raw=loadRaw();
  const opts=raw?['Continuar','Novo jogo','Backup']:['Novo jogo','Backup'];
  const i=await ask(null,opts,-1,{pos:'title'});
  if(opts[i]==='Backup'){if(await backupMenu())return;return titleFlow();}
  if(opts[i]==='Continuar'){
    $('title').classList.add('hidden');
    S=Object.assign(newState('',' ','padaria'),raw);
    S.stats=Object.assign({produced:0,sold:0,revenue:0,ordersDone:0,hired:0},raw.stats||{});
    await fadeOut();
    setupNpcs();curMap=null;loadMap(MAPS[S.pos.map]?S.pos.map:'casa');
    {const t=tileAt(curMap,S.pos.x,S.pos.y),sp=curMap.spawn||[15,15];
     if(t&&WALK.has(t)&&!npcAt(curMap,S.pos.x,S.pos.y))placePlayer(S.pos.x,S.pos.y,S.pos.dir);else placePlayer(sp[0],sp[1],'up');}
    startPlay();await fadeIn();
    toast(`Bem-vindo de volta, ${S.name}!`);
    return;
  }
  if(raw){
    const c=await ask('Começar um novo jogo apaga o progresso salvo. Continuar?',['Não','Sim, começar do zero'],0);
    if(c!==1)return titleFlow();
  }
  $('title').classList.add('hidden');
  await introFlow();
}
async function introFlow(){
  await fadeOut();mode='intro';introWho='ramos';await fadeIn();
  const R_='Sr. Ramos: ';
  await say(R_+'Olá! Seja bem-vindo à Vila Empreendedora!');
  await say(R_+'Meu nome é Ramos, mas aqui todo mundo me chama de Sr. Ramos.');
  await say(R_+'Há 40 anos, comecei uma empresa numa garagem. Hoje ela é a maior da região!');
  await say(R_+'Agora é a sua vez. Mas antes, me conte um pouco sobre você...');
  introWho='player';
  const name=await inputText(R_+'Qual é o seu nome?','Alex',12);
  await say(R_+`${name}! Belo nome para um futuro magnata.`);
  const si=await ask(R_+'Em que ramo você quer empreender?',SECTORS.map(s=>s.label),-1);
  const s=SECTORS[si];
  introWho='ramos';
  const co=await inputText(R_+'E qual vai ser o nome da sua empresa?',s.coName,16);
  await say(R_+`${co}... Gostei! Tem cara de marca de sucesso.`);
  await say(R_+`Sua Sede fica ao norte da praça. Por enquanto, é só uma garagem com um computador para produzir ${s.pp}.`);
  await say(R_+`Compre ${s.m} no Mercado, venda sua produção e contrate gente talentosa no Café.`);
  await say(R_+'Quando a empresa crescer, compre uma sede maior no Banco. Seu futuro começa agora!');
  S=newState(name,co,s.id);
  genOrders();genCandidates();
  await fadeOut();
  setupNpcs();curMap=null;loadMap('casa');placePlayer(2,4,'down');
  startPlay();
  await fadeIn();
  await run(async()=>{
    await say(`Dia 1. ${name} acorda cheio de ideias.`);
    await say('Dica: X ou Esc abre o menu. Z, Espaço ou Enter interage. Siga o objetivo no canto da tela!');
  });
}
function startPlay(){
  mode='play';
  $('hud').classList.remove('hidden');$('goal').classList.remove('hidden');updateHud();
}

// ================= Layout =================
function fit(){
  const coarse=matchMedia('(pointer: coarse)').matches||innerWidth<640;
  $('pad').style.display=coarse?'flex':'none';$('help').style.display=coarse?'none':'block';
  const availW=innerWidth-32,availH=innerHeight-(coarse?200:50)-16;
  let s=Math.min(availW/UIW,availH/UIH);
  s=s>=2?Math.floor(s*2)/2:Math.max(.6,s);
  $('game').style.setProperty('--u',s+'px');
}
addEventListener('resize',fit);
$('sndBtn').addEventListener('click',e=>{audioInit();setMuted(!AU.muted);e.currentTarget.blur();});
document.addEventListener('pointerdown',()=>audioInit());
setMuted(AU.muted);
if(window.desktop)window.desktop.version().then(v=>{const el=$('ver');el.textContent='Versão '+v;el.classList.remove('hidden');}).catch(()=>{});

// ================= Boot =================
buildTown();buildInteriors();buildPark();buildIndustry();
setupNpcsTitle();
function setupNpcsTitle(){MAPS.town.npcs=VILLAGERS.map(v=>mkNpc({...v}));}
fit();
requestAnimationFrame(frame);
titleFlow();
