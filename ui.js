/* =========================================================
   ui.js — 画面下の操作パネル
   ========================================================= */
window.UI = (function () {
  const D = window.DATA;
  const S = () => window.SIM.state;
  const $ = id => document.getElementById(id);
  const yen = n => window.SIM.yen(n);
  let tab = 'offers';

  function hhmm(m) {
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function skillBar(sk, needLv) {
    const wrap = el('span', 'sk');
    for (let i = 1; i <= 5; i++) {
      const d = el('i');
      if (i <= sk.lv) d.classList.add('on');
      if (needLv && i === needLv) d.classList.add('mark');
      wrap.appendChild(d);
    }
    return wrap;
  }

  /* ---------- 上部ステータス ---------- */
  function renderTop() {
    const s = S();
    $('hudDay').textContent = `${s.month}期 ${s.day}日目`;
    $('hudTime').textContent = hhmm(s.minute);
    $('hudWelfare').textContent = yen(s.fundWelfare);
    $('hudBusiness').textContent = yen(s.fundBusiness);
    $('hudBusiness').classList.toggle('bad', s.fundBusiness < 0);
    $('hudRep').textContent = Math.round(s.reputation);
    $('repFill').style.width = s.reputation + '%';

    const present = s.users.filter(u => u.present && u.state !== 'left').length;
    $('hudPeople').textContent = `${present} / ${s.users.length}`;

    document.querySelectorAll('#speeds button').forEach(b => {
      b.classList.toggle('on', !s.paused && +b.dataset.sp === s.speed);
    });
    $('btnPause').textContent = s.paused ? '▶' : '❚❚';
  }

  /* ---------- タブ ---------- */
  function renderTabs() {
    const s = S();
    const counts = { offers: s.offers.length, projects: s.projects.length, users: 0, staff: 0, hire: s.applicants.length, books: 0 };
    document.querySelectorAll('#tabs button').forEach(b => {
      b.classList.toggle('on', b.dataset.tab === tab);
      const badge = b.querySelector('.badge');
      const c = counts[b.dataset.tab];
      if (badge) { badge.textContent = c || ''; badge.style.display = c ? '' : 'none'; }
    });
  }

  /* ---------- 案件 ---------- */
  function viewOffers() {
    const s = S(), box = el('div');
    if (!s.offers.length) {
      box.appendChild(el('p', 'empty', '今は引き合いがありません。評価が上がると、依頼の数も規模も増えていきます。'));
    }
    s.offers.forEach(o => {
      const c = el('div', 'card');
      const h = el('div', 'card-h');
      h.appendChild(el('span', 'name', o.name));
      h.appendChild(el('span', 'tier t' + o.tier, ['個人', '中小企業', '大企業'][o.tier - 1]));
      c.appendChild(h);

      const need = el('div', 'needs');
      Object.keys(o.need).forEach(k => {
        const lab = D.SKILLS.find(x => x.key === k).label;
        const chip = el('span', 'chip');
        chip.appendChild(el('b', null, lab));
        chip.appendChild(el('span', null, 'Lv' + o.need[k]));
        need.appendChild(chip);
      });
      c.appendChild(need);

      const meta = el('div', 'meta');
      meta.appendChild(el('span', null, '報酬 ' + yen(o.pay)));
      meta.appendChild(el('span', null, '納期 ' + o.days + '日'));
      meta.appendChild(el('span', null, '工数 ' + o.effort));
      c.appendChild(meta);

      c.appendChild(el('p', 'hint', capacityHint(o)));

      const act = el('div', 'actions');
      const yes = el('button', 'primary', '受注する');
      yes.onclick = () => { window.SIM.acceptOffer(o.id); render(); };
      const no = el('button', null, '辞退');
      no.onclick = () => { window.SIM.declineOffer(o.id); render(); };
      act.appendChild(yes); act.appendChild(no);
      c.appendChild(act);
      box.appendChild(c);
    });
    return box;
  }

  function capacityHint(o) {
    const s = S();
    const able = s.users.filter(u => Object.keys(o.need).every(k => u.skills[k].lv >= o.need[k])).length;
    const workers = s.users.filter(u => u.mode === 'work').length;
    const perDay = workers * 220 * 0.9;
    const days = perDay > 0 ? Math.ceil(o.effort / perDay) : 99;
    if (!able) return `今のレベルで条件を満たす利用者はいません。受注はできますが、品質と速度がかなり落ちます。`;
    return `条件を満たす利用者 ${able}名。全員で当たれば概ね ${days} 日前後の見込みです。`;
  }

  /* ---------- 進行中 ---------- */
  function viewProjects() {
    const s = S(), box = el('div');
    if (!s.projects.length) box.appendChild(el('p', 'empty', '進行中の案件はありません。'));
    s.projects.forEach(p => {
      const c = el('div', 'card');
      const h = el('div', 'card-h');
      h.appendChild(el('span', 'name', p.name));
      const left = p.dueDay - s.day;
      const due = el('span', 'tier ' + (left <= 1 ? 'danger' : left <= 3 ? 'warn' : 't2'),
        left < 0 ? `${-left}日超過` : `あと${left}日`);
      h.appendChild(due);
      c.appendChild(h);

      const bar = el('div', 'pbar');
      const fill = el('i');
      fill.style.width = Math.min(100, p.progress / p.effort * 100) + '%';
      bar.appendChild(fill);
      c.appendChild(bar);

      const meta = el('div', 'meta');
      meta.appendChild(el('span', null, Math.round(p.progress / p.effort * 100) + '%'));
      meta.appendChild(el('span', null, '報酬 ' + yen(p.pay)));
      const on = s.users.filter(u => u.assigned === p.id).length;
      meta.appendChild(el('span', null, '担当 ' + on + '名'));
      c.appendChild(meta);
      box.appendChild(c);
    });

    if (s.done.length) {
      box.appendChild(el('h3', null, '納品済み'));
      s.done.slice(-6).reverse().forEach(d => {
        const r = el('div', 'row small');
        r.appendChild(el('span', 'name', d.name));
        r.appendChild(el('span', 'muted', '満足度 ' + d.sat));
        r.appendChild(el('span', 'muted', yen(d.pay)));
        box.appendChild(r);
      });
    }
    return box;
  }

  /* ---------- 利用者 ---------- */
  function viewUsers() {
    const s = S(), box = el('div');
    s.users.forEach(u => {
      const c = el('div', 'card person');
      const h = el('div', 'card-h');
      h.appendChild(el('span', 'name', u.name));
      const st = el('span', 'tier ' + (u.present ? 't2' : 'warn'), u.present ? stateLabel(u.state) : '欠勤');
      h.appendChild(st);
      c.appendChild(h);

      const sk = el('div', 'skills');
      D.SKILLS.forEach(def => {
        const row = el('div', 'skrow');
        row.appendChild(el('span', 'sklabel', def.label));
        row.appendChild(skillBar(u.skills[def.key]));
        const s2 = u.skills[def.key];
        const pct = s2.lv >= 5 ? 100 : Math.round(s2.exp / D.EXP_TO_NEXT[s2.lv] * 100);
        row.appendChild(el('span', 'skexp', s2.lv >= 5 ? '習得済' : pct + '%'));
        sk.appendChild(row);
      });
      c.appendChild(sk);

      const mor = el('div', 'morale');
      mor.appendChild(el('span', 'sklabel', 'やる気'));
      const mb = el('div', 'mbar');
      const mf = el('i');
      mf.style.width = u.morale + '%';
      mf.style.background = u.morale > 60 ? 'var(--ok)' : u.morale > 35 ? 'var(--warn)' : 'var(--bad)';
      mb.appendChild(mf);
      mor.appendChild(mb);
      mor.appendChild(el('span', 'skexp', Math.round(u.morale)));
      c.appendChild(mor);

      const modes = el('div', 'seg2');
      ['work', 'study'].forEach(m => {
        const b = el('button', u.mode === m ? 'on' : null, m === 'work' ? '製造' : '勉強');
        b.onclick = () => { window.SIM.setMode(u.id, m); render(); };
        modes.appendChild(b);
      });
      c.appendChild(modes);

      if (u.mode === 'study') {
        const sel = el('select');
        D.SKILLS.forEach(def => {
          const o = el('option', null, def.label + '（Lv' + u.skills[def.key].lv + '）');
          o.value = def.key;
          if (u.studyTarget === def.key) o.selected = true;
          sel.appendChild(o);
        });
        sel.onchange = () => { window.SIM.setStudyTarget(u.id, sel.value); render(); };
        const lab = el('label', 'field');
        lab.appendChild(el('span', null, '学ぶもの'));
        lab.appendChild(sel);
        c.appendChild(lab);
      } else {
        const sel = el('select');
        const none = el('option', null, '手が空いている');
        none.value = '';
        sel.appendChild(none);
        s.projects.forEach(p => {
          const o = el('option', null, p.name);
          o.value = p.id;
          if (u.assigned === p.id) o.selected = true;
          sel.appendChild(o);
        });
        sel.onchange = () => { window.SIM.assign(u.id, sel.value || null); render(); };
        const lab = el('label', 'field');
        lab.appendChild(el('span', null, '担当案件'));
        lab.appendChild(sel);
        c.appendChild(lab);
      }
      box.appendChild(c);
    });
    return box;
  }

  function stateLabel(st) {
    return { home: '出勤前', commute: '出勤中', desk: '在席', break: '休憩', lunch: '昼休憩', left: '退勤', absent: '欠勤' }[st] || st;
  }

  /* ---------- 職員 ---------- */
  function viewStaff() {
    const s = S(), box = el('div');
    const need = Math.ceil(s.users.length / D.STANDARD.usersPerStaff);
    const note = el('p', s.staff.length < need ? 'notice bad' : 'notice',
      `人員配置基準：利用者${s.users.length}名に対して職員${need}名以上が必要です（現在 ${s.staff.length}名）。` +
      (s.staff.length < need ? ' 満たしていないため、今月の給付費が減算されます。' : ''));
    box.appendChild(note);

    s.staff.forEach(st => {
      const c = el('div', 'card person');
      const h = el('div', 'card-h');
      h.appendChild(el('span', 'name', st.name));
      h.appendChild(el('span', 'tier ' + (st.present ? 't2' : 'warn'), st.present ? stateLabel(st.state) : '欠勤'));
      c.appendChild(h);
      const sk = el('div', 'skills');
      Object.keys(st.roles).forEach(r => {
        const row = el('div', 'skrow');
        row.appendChild(el('span', 'sklabel wide', D.ROLES[r].label));
        row.appendChild(skillBar({ lv: st.roles[r] }));
        sk.appendChild(row);
      });
      c.appendChild(sk);
      Object.keys(st.roles).forEach(r => {
        c.appendChild(el('p', 'hint', D.ROLES[r].desc));
      });
      box.appendChild(c);
    });
    return box;
  }

  /* ---------- 採用 ---------- */
  function viewHire() {
    const s = S(), box = el('div');
    if (s.pendingHires.length) {
      s.pendingHires.forEach(h => {
        box.appendChild(el('p', 'notice', `${h.person.name} さんは ${h.day - s.day} 日後に入社予定です。`));
      });
    }
    if (!s.applicants.length) {
      box.appendChild(el('p', 'empty', '面接の予定はありません。評価が上がるほど、応募は増えていきます。'));
    }
    s.applicants.forEach(a => {
      const p = a.person;
      const c = el('div', 'card person');
      const h = el('div', 'card-h');
      h.appendChild(el('span', 'name', p.name));
      h.appendChild(el('span', 'tier t1', p.kind === 'staff' ? '職員希望' : '利用者希望'));
      c.appendChild(h);

      const sk = el('div', 'skills');
      if (p.kind === 'staff') {
        Object.keys(p.roles).forEach(r => {
          const row = el('div', 'skrow');
          row.appendChild(el('span', 'sklabel wide', D.ROLES[r].label));
          row.appendChild(el('span', 'est', 'Lv ' + window.SIM.estimateRange(p.roles[r])));
          sk.appendChild(row);
        });
      } else {
        D.SKILLS.forEach(def => {
          const row = el('div', 'skrow');
          row.appendChild(el('span', 'sklabel', def.label));
          row.appendChild(el('span', 'est', 'Lv ' + window.SIM.estimateRange(p.skills[def.key].lv)));
          sk.appendChild(row);
        });
      }
      c.appendChild(sk);
      c.appendChild(el('p', 'hint', '面接で分かるのはおおよその水準までです。事務員のレベルが高いほど、見立ての精度が上がります。'));

      const act = el('div', 'actions');
      const yes = el('button', 'primary', '採用する');
      yes.onclick = () => { window.SIM.hire(a.id); render(); };
      const no = el('button', null, '見送る');
      no.onclick = () => { window.SIM.reject(a.id); render(); };
      act.appendChild(yes); act.appendChild(no);
      c.appendChild(act);
      box.appendChild(c);
    });
    return box;
  }

  /* ---------- 経営 ---------- */
  function viewBooks() {
    const s = S(), box = el('div');

    const c1 = el('div', 'card');
    c1.appendChild(el('h3', null, '給付費会計'));
    c1.appendChild(el('p', 'hint', '利用者の通所実績に応じて国から入る収入です。職員の給与と事業所の運営費に充てます。'));
    row(c1, '今月の延べ通所日数', s.monthlyWelfareDays + '日');
    row(c1, '見込み給付費', yen(s.monthlyWelfareDays * D.MONEY.welfarePerUserDay));
    row(c1, '職員給与（月）', yen(s.staff.length * D.MONEY.staffSalaryMonth));
    row(c1, '固定費（月）', yen(D.MONEY.fixedCostMonth + s.users.length * D.MONEY.suppliesPerUserMonth));
    row(c1, '残高', yen(s.fundWelfare), true);
    box.appendChild(c1);

    const c2 = el('div', 'card');
    c2.appendChild(el('h3', null, '生産活動会計'));
    c2.appendChild(el('p', 'hint', '案件で稼いだお金です。利用者の賃金はここからしか支払えません。給付費で穴埋めすることはできません。'));
    row(c2, '今月の売上', yen(s.monthlyRevenue));
    row(c2, '今月の支払い賃金', yen(s.monthlyWage));
    row(c2, '差引', yen(s.monthlyRevenue - s.monthlyWage));
    row(c2, '残高', yen(s.fundBusiness), true);
    box.appendChild(c2);

    const c3 = el('div', 'card');
    c3.appendChild(el('h3', null, '記録'));
    s.log.slice(0, 40).forEach(l => {
      const r = el('div', 'logrow ' + l.tone);
      r.appendChild(el('span', 'logday', l.day + '日'));
      r.appendChild(el('span', null, l.text));
      c3.appendChild(r);
    });
    box.appendChild(c3);
    return box;
  }

  function row(parent, label, value, strong) {
    const r = el('div', 'row' + (strong ? ' strong' : ''));
    r.appendChild(el('span', 'muted', label));
    r.appendChild(el('span', null, value));
    parent.appendChild(r);
  }

  /* ---------- イベント ---------- */
  function renderEvents() {
    const s = S(), host = $('modal');
    if (!s.events.length) { host.hidden = true; host.innerHTML = ''; return; }
    const e = s.events[0];
    host.hidden = false;
    host.innerHTML = '';
    const box = el('div', 'modal-box');

    if (e.type === 'transition') {
      box.appendChild(el('h2', null, '一般就労の内定'));
      box.appendChild(el('p', null, e.text));
      const act = el('div', 'actions');
      const go = el('button', 'primary', '送り出す');
      go.onclick = () => { window.SIM.resolveTransition(e.id, true); render(); };
      const stay = el('button', null, '事業所に残ってもらう');
      stay.onclick = () => { window.SIM.resolveTransition(e.id, false); render(); };
      act.appendChild(go); act.appendChild(stay);
      box.appendChild(act);
    } else if (e.type === 'report') {
      const r = e.report;
      box.appendChild(el('h2', null, e.text));
      const t = el('div', 'report');
      row(t, '延べ通所日数', r.days + '日');
      row(t, '給付費', yen(r.welfare) + (r.penalty ? '（配置基準未達で減算）' : ''));
      row(t, '職員給与', '−' + yen(r.staffCost));
      row(t, '固定費', '−' + yen(r.fixed));
      row(t, '給付費会計 差引', yen(r.welfare - r.staffCost - r.fixed), true);
      t.appendChild(el('hr'));
      row(t, '案件売上', yen(r.revenue));
      row(t, '利用者賃金', '−' + yen(r.wage));
      row(t, '生産活動会計 差引', yen(r.revenue - r.wage), true);
      box.appendChild(t);
      if (r.revenue < r.wage) {
        box.appendChild(el('p', 'notice bad', '賃金が売上を上回っています。A型では賃金を給付費から支払うことはできません。受注を増やすか、勉強に回している人数を見直してください。'));
      }
      const act = el('div', 'actions');
      const ok = el('button', 'primary', '確認');
      ok.onclick = () => { window.SIM.dismissEvent(e.id); render(); };
      act.appendChild(ok);
      box.appendChild(act);
    }
    host.appendChild(box);
  }

  /* ---------- 描画 ---------- */
  function render() {
    renderTop();
    renderTabs();
    const body = $('panelBody');
    body.innerHTML = '';
    const v = { offers: viewOffers, projects: viewProjects, users: viewUsers, staff: viewStaff, hire: viewHire, books: viewBooks }[tab];
    body.appendChild(v());
    renderEvents();
  }

  function setTab(t) { tab = t; render(); }

  return { render, renderTop, setTab, get tab() { return tab; } };
})();
