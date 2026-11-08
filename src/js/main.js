'use strict';
// ================= Startup and main loop =================
function init() {
  buildSprites();
  buildIcons();
  resize();
  addEventListener('resize', resize);
  // A new world opens with the welcome; an update shows its notes once ("Patch de atualização").
  const fresh = !load();
  if (fresh) newGame();
  const show = [];
  if (fresh) show.push('welcome');
  if (patchUnseen()) show.push('patch');
  if (show.length) { UIS.queue = show.slice(1); openPanel(show[0]); }
  renderHUD();
  let last = performance.now(), hudT = 0, saveT = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const paused = !!UIS.panel;
    if (!paused) update(dt);
    render(paused ? 0 : dt);
    drawMinimap(dt);
    hudT -= dt;
    if (hudT <= 0) { hudT = 0.12; renderHUD(); }
    drainMessages();
    saveT += dt;
    if (saveT > 20) { saveT = 0; save(); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  if (window.desktop && window.desktop.version) {
    window.desktop.version().then((v) => { const el = $('ver'); el.textContent = 'Versão ' + v; el.classList.remove('hidden'); }).catch(() => {});
  }
}
// Keep progress when the window closes, hides or the app restarts for an update.
addEventListener('beforeunload', () => { if (!reloading) save(); });
addEventListener('pagehide', () => { if (!reloading) save(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && !reloading) save(); });
init();
