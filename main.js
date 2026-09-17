/* =========================================================
   main.js — 起動とゲームループ
   3Dが失敗してもゲーム自体は動くようにしてある
   ========================================================= */
(function () {
  const D = window.DATA;
  const SIM = window.SIM;
  const $ = id => document.getElementById(id);

  let acc = 0, last = performance.now();
  let dirty = true;
  let has3D = false;

  /* ---------- エラーを画面に出す ---------- */
  function showError(msg) {
    const bar = $('errbar');
    if (!bar) { alert(msg); return; }
    bar.hidden = false;
    bar.textContent = msg;
  }
  window.addEventListener('error', e => {
    showError('エラー: ' + (e.message || e) + '\n' + (e.filename || '') + ' ' + (e.lineno || ''));
  });

  /* ---------- 起動 ---------- */
  function boot() {
    // 3Dは失敗してもゲームを止めない
    try {
      if (!window.THREE) throw new Error('three.js を読み込めませんでした（ネットワークかブロックの可能性）');
      WORLD.init($('stage'));
      has3D = true;
    } catch (err) {
      showError('3Dの初期化に失敗しました。ゲーム自体は操作できます。\n' + (err && err.message ? err.message : err));
    }

    try {
      if (!SIM.load()) SIM.newGame();
    } catch (err) {
      SIM.newGame();
    }
    SIM.state.paused = false;
    SIM.state.speed = SIM.state.speed || 2;

    SIM.on(type => {
      if (type === 'tick') {
        UI.renderTop();
        if ((UI.tab === 'projects' || UI.tab === 'users') && SIM.state.minute % 5 === 0) dirty = true;
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
    $('btnSave').onclick = () => { toast(SIM.save() ? '保存しました' : '保存できませんでした'); };
    $('btnNew').onclick = () => {
      if (!confirm('最初からやり直しますか？ 現在の記録は消えます。')) return;
      SIM.clearSave(); SIM.newGame();
      SIM.state.paused = false;
      dirty = true;
    };

    // レイアウトが確定してからもう一度サイズを測る
    if (has3D) {
      requestAnimationFrame(() => WORLD.resize());
      window.addEventListener('load', () => WORLD.resize());
      if (window.ResizeObserver) new ResizeObserver(() => WORLD.resize()).observe($('stage'));
    }

    UI.render();
    requestAnimationFrame(loop);
  }

  /* ---------- ループ ---------- */
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    try {
      const s = SIM.state;

      if (!s.paused && s.events.length === 0) {
        acc += dt * s.speed;
        const per = D.TIME.realSecPerGameMin;
        let guard = 0;
        while (acc >= per && guard < 120) {
          acc -= per; guard++;
          const closeAt = s.ceoLeaveAt || D.TIME.dayEnd;  // 社長が退勤したら、その日は自動的に終える
          if (s.minute < closeAt) SIM.minuteTick();
          else { SIM.endDay(); SIM.save(); }
        }
      }

      if (has3D) { WORLD.sync(s); WORLD.render(dt); }
      if (dirty) { UI.render(); dirty = false; }
    } catch (err) {
      showError('実行中のエラー: ' + (err && err.message ? err.message : err));
      return;   // ループを止めてエラーを読めるようにする
    }

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

  /* ---------- 自動保存 ---------- */
  setInterval(() => { try { SIM.save(); } catch (e) { } }, 20000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { try { SIM.save(); } catch (e) { } }
  });
  window.addEventListener('beforeunload', () => { try { SIM.save(); } catch (e) { } });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
