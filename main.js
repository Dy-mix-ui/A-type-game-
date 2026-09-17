/* =========================================================
   main.js — 起動とゲームループ
   ========================================================= */
(function () {
  const D = window.DATA;
  const SIM = window.SIM;
  const $ = id => document.getElementById(id);

  let acc = 0, last = performance.now();
  let dirty = true;

  function boot() {
    WORLD.init($('stage'));

    if (!SIM.load()) SIM.newGame();
    SIM.state.paused = true;

    SIM.on(type => {
      if (type === 'tick') {
        UI.renderTop();
        if (UI.tab === 'projects' && SIM.state.minute % 5 === 0) dirty = true;
      } else {
        dirty = true;
      }
    });

    document.querySelectorAll('#tabs button').forEach(b => {
      b.onclick = () => UI.setTab(b.dataset.tab);
    });
    document.querySelectorAll('#speeds button').forEach(b => {
      b.onclick = () => { SIM.state.speed = +b.dataset.sp; SIM.state.paused = false; UI.renderTop(); };
    });
    $('btnPause').onclick = () => { SIM.state.paused = !SIM.state.paused; UI.renderTop(); };
    $('btnEndDay').onclick = () => { SIM.endDay(); SIM.save(); dirty = true; };
    $('btnSave').onclick = () => {
      if (SIM.save()) toast('保存しました');
      else toast('保存できませんでした');
    };
    $('btnNew').onclick = () => {
      if (!confirm('最初からやり直しますか？ 現在の記録は消えます。')) return;
      SIM.clearSave(); SIM.newGame(); dirty = true;
    };

    UI.render();
    requestAnimationFrame(loop);
  }

  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const s = SIM.state;

    if (!s.paused && s.events.length === 0) {
      acc += dt * s.speed;
      const per = D.TIME.realSecPerGameMin;
      let guard = 0;
      while (acc >= per && guard < 60) {
        acc -= per; guard++;
        if (s.minute < D.TIME.dayEnd) SIM.minuteTick();
        else { s.paused = true; break; }
      }
    }

    // 利用者が全員退勤したら日を締められるようにする
    $('btnEndDay').hidden = s.minute < D.TIME.userEnd;

    WORLD.sync(s);
    WORLD.render(dt);

    if (dirty) { UI.render(); dirty = false; }
    requestAnimationFrame(loop);
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 1800);
  }

  window.addEventListener('beforeunload', () => SIM.save());

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
