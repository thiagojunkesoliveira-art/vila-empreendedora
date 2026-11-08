'use strict';
// ================= Startup and main loop =================
let lastTick = Date.now();
let lastSave = Date.now();
let lastUi = 0;
let lastCheck = 0;

function drainQueue() {
  while (UIQ.length) {
    const q = UIQ.shift();
    if (q.type === 'battle') openModal(battleModal(q.rep));
    else toast(q.msg, q.type);
  }
}

function loop() {
  const now = Date.now();
  let dt = (now - lastTick) / 1000;
  lastTick = now;
  if (dt <= 0) return;
  if (dt > 60) {
    // The computer slept or the window was hidden for a long time.
    if (BATTLE) { resolveNow(); finishBattle(BATTLE); }
    const rep = simulateOffline(dt);
    if (rep.sec > 120) openModal(offlineModal(rep));
    dt = 0;
  }
  // Game time in small steps; the battle can run faster than real time.
  while (dt > 0) {
    const d = Math.min(0.25, dt);
    tick(d);
    if (BATTLE) {
      let b = d * UI.speed;
      while (b > 0 && BATTLE && !BATTLE.done) { const s = Math.min(0.05, b); stepBattle(BATTLE, s); b -= s; }
      if (BATTLE && BATTLE.done) finishBattle(BATTLE);
    }
    dt -= d;
  }
  if (now - lastCheck > 1000) { lastCheck = now; checkQuests(); checkAch(); }
  if (now - lastSave > 15000) { lastSave = now; save(); }
  drainQueue();
  if (now - lastUi > 240 && !document.hidden) { lastUi = now; render(); }
}

function frame() {
  if (BATTLE && !document.hidden) drawBattle();
  requestAnimationFrame(frame);
}

function init() {
  const loaded = load();
  if (!loaded) {
    newState();
    RATES = computeRates();
    openModal(welcomeModal());
  } else {
    RATES = computeRates();
    // The game closed in the middle of a fight: replay it (same seed, same result).
    if (S.horde.inBattle) {
      BATTLE = makeBattle();
      while (!BATTLE.done) stepBattle(BATTLE, 0.25);
      finishBattle(BATTLE);
    }
    const away = (Date.now() - S.last) / 1000;
    if (away > 5) {
      const rep = simulateOffline(away);
      if (rep.sec > 60) openModal(offlineModal(rep));
    }
  }
  RATES = computeRates();
  drainQueue();
  lastTick = Date.now();
  render();
  setInterval(loop, 100);
  requestAnimationFrame(frame);
  save();
  if (window.desktop && window.desktop.version) {
    window.desktop.version().then((v) => { const el = $('ver'); el.textContent = 'Versão ' + v; el.classList.remove('hidden'); }).catch(() => {});
  }
}

// Keep progress when the window closes, hides or the app restarts for an update.
addEventListener('beforeunload', () => { if (!reloading) save(); });
addEventListener('pagehide', () => { if (!reloading) save(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && !reloading) save(); else if (!document.hidden) render(); });

init();
