/* =========================================================
   sim.js — ゲームのロジック本体。描画は一切行わない
   ========================================================= */
window.SIM = (function () {
  const D = window.DATA;

  let S = null;              // ゲーム状態
  const listeners = [];
  function emit(type, payload) { listeners.forEach(f => f(type, payload)); }
  function on(f) { listeners.push(f); }

  /* ---------- 小道具 ---------- */
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rint = (a, b) => Math.floor(rnd(a, b + 1));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let idSeq = 1;
  const nextId = () => 'e' + (idSeq++);

  function makeName() {
    return pick(D.SURNAMES) + ' ' + pick(D.GIVEN);
  }

  function emptySkills(base) {
    const o = {};
    D.SKILLS.forEach(s => { o[s.key] = { lv: base, exp: 0 }; });
    return o;
  }

  function randomUserSkills() {
    const sk = emptySkills(1);
    // 得意分野を1〜2個だけ持たせる
    const n = rint(1, 2);
    const keys = D.SKILLS.map(s => s.key).sort(() => Math.random() - 0.5);
    for (let i = 0; i < n; i++) sk[keys[i]].lv = rint(1, 3);
    return sk;
  }

  function randomStaffRoles() {
    const keys = Object.keys(D.ROLES).sort(() => Math.random() - 0.5);
    const n = rint(1, 2);
    const out = {};
    for (let i = 0; i < n; i++) out[keys[i]] = rint(1, 4);
    return out;
  }

  /* ---------- 生成 ---------- */
  function newUser(opts) {
    opts = opts || {};
    return {
      id: nextId(), kind: 'user', name: opts.name || makeName(),
      skills: opts.skills || randomUserSkills(),
      morale: opts.morale != null ? opts.morale : D.MORALE.start,
      mode: 'work',              // 'work' | 'study'
      studyTarget: 'html',
      assigned: null,            // 案件ID
      present: false,            // 今日出勤しているか
      state: 'home',             // home / commute / desk / break / lunch / left
      attendDays: 0,
      joinDay: S ? S.day : 0,
      desk: null
    };
  }

  function newStaff(opts) {
    opts = opts || {};
    return {
      id: nextId(), kind: 'staff', name: opts.name || makeName(),
      roles: opts.roles || randomStaffRoles(),
      present: false, state: 'home', desk: null,
      joinDay: S ? S.day : 0
    };
  }

  /* ---------- 初期化 ---------- */
  function newGame() {
    idSeq = 1;
    S = {
      day: 1, month: 1, minute: D.TIME.dayStart,
      speed: 1, paused: true, dayPhase: 'running',
      fundWelfare: D.MONEY.startWelfare,
      fundBusiness: D.MONEY.startBusiness,
      reputation: 30,
      users: [], staff: [],
      offers: [], projects: [], done: [],
      applicants: [], pendingHires: [],
      log: [],
      monthlyWelfareDays: 0, monthlyWage: 0, monthlyRevenue: 0,
      events: []
    };
    for (let i = 0; i < 4; i++) S.users.push(newUser());
    S.staff.push(newStaff({ roles: { manager: 3, clerk: 2 } }));
    S.staff.push(newStaff({ roles: { teacher: 3 } }));
    assignDesks();
    startDay();
    log('事業所を開所しました。まずは案件を受けて、利用者の賃金を稼ぎましょう。');
    return S;
  }

  function assignDesks() {
    const total = D.OFFICE.islands.reduce((a, i) => a + i.seatsPerSide * 2, 0);
    const all = S.users.concat(S.staff);
    all.forEach((p, i) => { p.desk = i < total ? i : null; });
  }

  function log(text, tone) {
    S.log.unshift({ day: S.day, min: S.minute, text, tone: tone || 'info' });
    if (S.log.length > 120) S.log.pop();
    emit('log');
  }

  /* ---------- 1日の開始 ---------- */
  function startDay() {
    S.minute = D.TIME.dayStart;
    S.dayPhase = 'running';

    // 出社予定を決める
    S.users.forEach(u => {
      const p = clamp(
        D.MORALE.attendanceBase + (u.morale - 50) / 50 * D.MORALE.attendanceMoraleSwing,
        0.4, 0.99
      );
      u.present = Math.random() < p;
      u.state = u.present ? 'home' : 'absent';
      u.arriveAt = D.TIME.userStart - rint(0, 25);
      if (u.present) { u.attendDays++; S.monthlyWelfareDays++; }
    });
    S.staff.forEach(s => {
      s.present = Math.random() < 0.97;
      s.state = s.present ? 'home' : 'absent';
      s.arriveAt = D.TIME.dayStart - rint(0, 15);
    });

    // 採用済みの入社処理
    S.pendingHires = S.pendingHires.filter(h => {
      if (h.day <= S.day) {
        if (h.person.kind === 'user') S.users.push(h.person);
        else S.staff.push(h.person);
        assignDesks();
        log(`${h.person.name} さんが入社しました。`, 'good');
        return false;
      }
      return true;
    });

    const absent = S.users.filter(u => !u.present).length;
    if (absent > 0) log(`本日の欠勤 ${absent}名。`, absent > 2 ? 'warn' : 'info');
  }

  /* ---------- 1ゲーム分の進行 ---------- */
  function minuteTick() {
    const T = D.TIME;
    S.minute++;

    // 人の居場所を更新
    updatePresence();

    // 稼働時間なら作業と勉強を進める
    if (isWorkingTime()) {
      progressWork();
      progressStudy();
    }

    // 引き合いと応募（1日の中でランダムに発生）
    if (S.minute % 30 === 0) maybeOffer();
    if (S.minute === 13 * 60) maybeApplicant();
    if (S.minute === 11 * 60) maybeTransition();

    // 期限チェック
    if (S.minute === T.userEnd) checkDeadlines();

    if (S.minute >= T.dayEnd) S.dayPhase = 'closing';
    emit('tick');
  }

  function isWorkingTime() {
    const m = S.minute, T = D.TIME;
    if (m < T.userStart || m >= T.userEnd) return false;
    if (m >= T.lunch[0] && m < T.lunch[1]) return false;
    for (const b of T.breaks) if (m >= b[0] && m < b[1]) return false;
    return true;
  }

  function updatePresence() {
    const m = S.minute, T = D.TIME;
    S.users.forEach(u => {
      if (!u.present) return;
      if (m < u.arriveAt) u.state = 'home';
      else if (m < u.arriveAt + 8) u.state = 'commute';
      else if (m >= T.userEnd) u.state = 'left';
      else if (m >= T.lunch[0] && m < T.lunch[1]) u.state = 'lunch';
      else if (T.breaks.some(b => m >= b[0] && m < b[1])) u.state = 'break';
      else u.state = 'desk';
    });
    S.staff.forEach(s => {
      if (!s.present) return;
      if (m < s.arriveAt) s.state = 'home';
      else if (m < s.arriveAt + 8) s.state = 'commute';
      else if (m >= T.dayEnd) s.state = 'left';
      else if (m >= T.lunch[0] && m < T.lunch[1]) s.state = 'lunch';
      else s.state = 'desk';
    });
  }

  /* ---------- 効率の補正 ---------- */
  function clerkFactor() {
    const need = Math.ceil(S.users.length / 6);
    const have = S.staff.filter(s => s.present && s.roles.clerk).length;
    const short = Math.max(0, need - have);
    return clamp(1 - short * D.WORK.clerkShortagePenalty, 0.4, 1);
  }

  function skillFactor(person, need) {
    const keys = Object.keys(need);
    if (!keys.length) return 1;
    let f = 0;
    keys.forEach(k => {
      const lv = person.skills ? person.skills[k].lv : 3;
      const d = lv - need[k];
      f += 1 + (d >= 0 ? d * D.WORK.levelBonus : d * D.WORK.levelPenalty);
    });
    return clamp(f / keys.length, 0.15, 2.2);
  }

  function progressWork() {
    const cf = clerkFactor();

    // 自動割り振り（案件割り振り担当がいる場合）
    const mgr = S.staff.find(s => s.present && s.state === 'desk' && s.roles.manager);
    if (mgr) autoAssign();

    S.projects.forEach(p => { p._today = 0; });

    S.users.forEach(u => {
      if (u.state !== 'desk' || u.mode !== 'work') return;
      const p = S.projects.find(x => x.id === u.assigned);
      if (!p) { u.morale = clamp(u.morale - D.MORALE.idlePain / 60, 0, 100); return; }
      const mf = 1 + (u.morale - 50) / 50 * D.WORK.moraleWeight;
      const sf = skillFactor(u, p.need);
      const out = D.WORK.baseOutputPerMin * sf * mf * cf;
      p.progress += out;
      p.qualitySum += sf;
      p.qualityCount++;
      p._today += out;
      // 期限が迫った案件はやる気を削る
      const left = p.dueDay - S.day;
      if (left <= 2) u.morale = clamp(u.morale - D.MORALE.overworkPain / 60, 0, 100);
    });

    // 職員デザイナーの寄与
    S.staff.forEach(s => {
      if (s.state !== 'desk' || !s.roles.designer) return;
      const p = S.projects.slice().sort((a, b) => a.dueDay - b.dueDay)[0];
      if (!p) return;
      const out = D.WORK.designerOutputPerMin * (0.6 + s.roles.designer * 0.2) * cf;
      p.progress += out;
      p.qualitySum += 1.2 + s.roles.designer * 0.18;
      p.qualityCount++;
    });

    // 完成判定
    S.projects.slice().forEach(p => { if (p.progress >= p.effort) deliver(p); });
  }

  function autoAssign() {
    const idle = S.users.filter(u => u.state === 'desk' && u.mode === 'work' &&
      (!u.assigned || !S.projects.some(p => p.id === u.assigned)));
    if (!idle.length || !S.projects.length) return;
    const sorted = S.projects.slice().sort((a, b) => a.dueDay - b.dueDay);
    idle.forEach((u, i) => { u.assigned = sorted[i % sorted.length].id; });
  }

  function progressStudy() {
    const teachers = S.staff.filter(s => s.present && s.state === 'desk' && s.roles.teacher);
    let capacity = teachers.reduce((a, t) => a + D.STUDY.teacherCapacity, 0);
    const bonusPer = teachers.length
      ? teachers.reduce((a, t) => a + t.roles.teacher, 0) / teachers.length
      : 0;

    S.users.forEach(u => {
      if (u.state !== 'desk' || u.mode !== 'study') return;
      let mult = 1;
      if (capacity > 0) { mult += bonusPer * D.STUDY.teacherBonusPerLevel; capacity--; }
      const sk = u.skills[u.studyTarget];
      if (sk.lv >= 5) return;
      sk.exp += D.STUDY.expPerMin * mult;
      const need = D.EXP_TO_NEXT[sk.lv];
      if (sk.exp >= need) {
        sk.exp = 0; sk.lv++;
        const label = D.SKILLS.find(s => s.key === u.studyTarget).label;
        log(`${u.name} さんの ${label} が Lv${sk.lv} になりました。`, 'good');
        emit('levelup', u);
      }
      u.morale = clamp(u.morale + D.MORALE.studyJoy / 60, 0, 100);
    });
  }

  /* ---------- 納品 ---------- */
  function deliver(p) {
    const q = clamp((p.qualityCount ? p.qualitySum / p.qualityCount : 1) * D.QUALITY.scale, 10, 100);
    const late = S.day > p.dueDay;
    const lateDays = Math.max(0, S.day - p.dueDay);
    let sat = q - lateDays * D.QUALITY.latePenalty;
    sat = clamp(sat, 0, 100);

    let pay = p.pay;
    if (late) pay = Math.round(pay * clamp(1 - lateDays * 0.06, 0.6, 1));

    S.fundBusiness += pay;
    S.monthlyRevenue += pay;

    const repDelta = (sat - 50) / D.QUALITY.repDivisor;
    S.reputation = clamp(S.reputation + repDelta, 0, 100);

    S.users.forEach(u => {
      if (u.assigned === p.id) {
        u.assigned = null;
        u.morale = clamp(u.morale + (sat > 60 ? D.MORALE.deliverJoy : -2), 0, 100);
      }
    });

    S.projects = S.projects.filter(x => x.id !== p.id);
    S.done.push({ name: p.name, sat: Math.round(sat), pay, day: S.day });

    log(`「${p.name}」を納品。満足度 ${Math.round(sat)}／報酬 ${yen(pay)}${late ? `（${lateDays}日遅延）` : ''}`,
      sat >= 60 ? 'good' : 'warn');
    emit('deliver', p);
  }

  function checkDeadlines() {
    S.projects.forEach(p => {
      if (S.day === p.dueDay) log(`「${p.name}」は今日が納期です。`, 'warn');
      else if (S.day === p.dueDay - 2) log(`「${p.name}」の納期まであと2日。`, 'warn');
    });
  }

  /* ---------- 引き合い ---------- */
  function tierWeights() {
    let w = D.REPUTATION.tierWeights[0].w;
    D.REPUTATION.tierWeights.forEach(t => { if (S.reputation >= t.min) w = t.w; });
    return w;
  }

  function maybeOffer() {
    const perDay = D.REPUTATION.offersPerDayBase + S.reputation / 100 * D.REPUTATION.offersPerDayRep;
    const perCheck = perDay / 10;
    if (Math.random() > perCheck) return;
    if (S.offers.length >= 4) return;

    const w = tierWeights();
    const total = w[0] + w[1] + w[2];
    let r = Math.random() * total, tier = 1;
    if (r > w[0]) { tier = 2; r -= w[0]; if (r > w[1]) tier = 3; }

    const pool = D.PROJECT_TEMPLATES.filter(t => t.tier === tier);
    const t = pick(pool);
    const variance = rnd(0.88, 1.15);
    S.offers.push({
      id: nextId(), name: t.name, tier: t.tier,
      need: Object.assign({}, t.need),
      effort: Math.round(t.effort * variance),
      pay: Math.round(t.pay * variance / 1000) * 1000,
      days: t.days + rint(-2, 3),
      expires: S.day + 2
    });
    log(`引き合い：「${t.name}」`, 'info');
    emit('offer');
  }

  function acceptOffer(id) {
    const o = S.offers.find(x => x.id === id);
    if (!o) return;
    S.offers = S.offers.filter(x => x.id !== id);
    S.projects.push({
      id: o.id, name: o.name, tier: o.tier, need: o.need,
      effort: o.effort, pay: o.pay,
      progress: 0, qualitySum: 0, qualityCount: 0,
      dueDay: S.day + o.days, startDay: S.day
    });
    log(`「${o.name}」を受注しました。納期は ${o.days} 日後です。`, 'good');
    emit('change');
  }

  function declineOffer(id) {
    const o = S.offers.find(x => x.id === id);
    if (!o) return;
    S.offers = S.offers.filter(x => x.id !== id);
    log(`「${o.name}」を辞退しました。`);
    emit('change');
  }

  /* ---------- 応募・面接 ---------- */
  function maybeApplicant() {
    const perWeek = D.REPUTATION.applicantsPerWeekBase + S.reputation / 100 * D.REPUTATION.applicantsPerWeekRep;
    if (Math.random() > perWeek / 5) return;
    if (S.applicants.length >= 3) return;

    const wantStaff = Math.random() < 0.35;
    const person = wantStaff ? newStaff() : newUser();
    // 評価が高いほど良い人が来る
    if (!wantStaff && S.reputation > 55 && Math.random() < 0.5) {
      const k = pick(D.SKILLS).key;
      person.skills[k].lv = clamp(person.skills[k].lv + 1, 1, 5);
    }
    S.applicants.push({ id: nextId(), person, arrivedDay: S.day });
    log(`${person.name} さんが面接に来ました。`, 'info');
    emit('applicant');
  }

  // 面接では能力が正確には分からない。事務員のレベルが高いほど幅が狭まる
  function estimateRange(lv) {
    const clerkLv = Math.max(0, ...S.staff.filter(s => s.roles.clerk).map(s => s.roles.clerk));
    const span = clerkLv >= 4 ? 0 : clerkLv >= 2 ? 1 : 1;
    const lo = clamp(lv - span, 1, 5), hi = clamp(lv + span, 1, 5);
    return lo === hi ? String(lo) : `${lo}〜${hi}`;
  }

  function hire(id) {
    const a = S.applicants.find(x => x.id === id);
    if (!a) return;
    S.applicants = S.applicants.filter(x => x.id !== id);
    S.pendingHires.push({ person: a.person, day: S.day + 2 });
    log(`${a.person.name} さんを採用しました。2日後から出社します。`, 'good');
    emit('change');
  }

  function reject(id) {
    const a = S.applicants.find(x => x.id === id);
    if (!a) return;
    S.applicants = S.applicants.filter(x => x.id !== id);
    log(`${a.person.name} さんを不採用としました。`);
    emit('change');
  }

  /* ---------- 一般就労への移行 ---------- */
  function maybeTransition() {
    const cands = S.users.filter(u => {
      const avg = D.SKILLS.reduce((a, s) => a + u.skills[s.key].lv, 0) / D.SKILLS.length;
      return avg >= D.TRANSITION.avgSkillRequired && u.morale >= D.TRANSITION.moraleRequired;
    });
    cands.forEach(u => {
      if (Math.random() < D.TRANSITION.chancePerDay && !S.events.some(e => e.userId === u.id)) {
        S.events.push({
          id: nextId(), type: 'transition', userId: u.id,
          text: `${u.name} さんに一般就労の内定が出ました。送り出せば事業所の評価は大きく上がりますが、その分の給付費収入はなくなります。`
        });
        emit('event');
      }
    });
  }

  function resolveTransition(eventId, send) {
    const e = S.events.find(x => x.id === eventId);
    if (!e) return;
    S.events = S.events.filter(x => x.id !== eventId);
    const u = S.users.find(x => x.id === e.userId);
    if (!u) return;
    if (send) {
      S.users = S.users.filter(x => x.id !== u.id);
      S.reputation = clamp(S.reputation + D.TRANSITION.repGain, 0, 100);
      S.users.forEach(o => { o.morale = clamp(o.morale + D.TRANSITION.moraleGainOthers, 0, 100); });
      assignDesks();
      log(`${u.name} さんが一般就労へ移行しました。事業所の評価が上がりました。`, 'good');
    } else {
      u.morale = clamp(u.morale - 12, 0, 100);
      log(`${u.name} さんは事業所に残ることになりました。`, 'warn');
    }
    emit('change');
  }

  /* ---------- 1日の締め ---------- */
  function endDay() {
    // 利用者の賃金（生産活動収入から支払う）
    const T = D.TIME;
    let workMin = 0;
    for (let m = T.userStart; m < T.userEnd; m++) {
      if (m >= T.lunch[0] && m < T.lunch[1]) continue;
      if (T.breaks.some(b => m >= b[0] && m < b[1])) continue;
      workMin++;
    }
    const daily = Math.round(D.MONEY.minWageHour * workMin / 60);
    const paid = S.users.filter(u => u.present).length * daily;
    S.fundBusiness -= paid;
    S.monthlyWage += paid;

    // 期限切れ案件
    S.offers = S.offers.filter(o => {
      if (o.expires < S.day) { log(`「${o.name}」の引き合いは流れました。`); return false; }
      return true;
    });

    if (S.fundBusiness < 0) {
      log('生産活動会計がマイナスです。賃金は給付費ではなく事業収入から支払う必要があります。案件の受注を増やしてください。', 'bad');
    }

    S.users.forEach(u => { u.morale = clamp(u.morale + D.MORALE.dailyRecover, 0, 100); });

    S.day++;
    if ((S.day - 1) % D.TIME.workdaysPerMonth === 0) monthlyClose();
    startDay();
    emit('newday');
  }

  function monthlyClose() {
    const staffCost = S.staff.length * D.MONEY.staffSalaryMonth;
    const fixed = D.MONEY.fixedCostMonth + S.users.length * D.MONEY.suppliesPerUserMonth;

    let welfare = S.monthlyWelfareDays * D.MONEY.welfarePerUserDay;
    const needStaff = Math.ceil(S.users.length / D.STANDARD.usersPerStaff);
    let penalty = false;
    if (S.staff.length < needStaff) {
      welfare = Math.round(welfare * (1 - D.STANDARD.penaltyRate));
      penalty = true;
    }

    S.fundWelfare += welfare - staffCost - fixed;

    S.events.push({
      id: nextId(), type: 'report',
      text: `第${S.month}期の決算`,
      report: {
        welfare, staffCost, fixed,
        revenue: S.monthlyRevenue, wage: S.monthlyWage,
        penalty, days: S.monthlyWelfareDays
      }
    });

    S.month++;
    S.monthlyWelfareDays = 0; S.monthlyWage = 0; S.monthlyRevenue = 0;
    emit('event');
  }

  /* ---------- 操作 ---------- */
  function setMode(userId, mode) {
    const u = S.users.find(x => x.id === userId);
    if (u) { u.mode = mode; if (mode === 'study') u.assigned = null; emit('change'); }
  }
  function setStudyTarget(userId, key) {
    const u = S.users.find(x => x.id === userId);
    if (u) { u.studyTarget = key; emit('change'); }
  }
  function assign(userId, projectId) {
    const u = S.users.find(x => x.id === userId);
    if (u) { u.assigned = projectId; if (projectId) u.mode = 'work'; emit('change'); }
  }

  function yen(n) {
    return '¥' + Math.round(n).toLocaleString('ja-JP');
  }

  /* ---------- セーブ ---------- */
  const SAVE_KEY = 'atype-save-v1';
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ S, idSeq })); return true; }
    catch (e) { return false; }
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const o = JSON.parse(raw);
      S = o.S; idSeq = o.idSeq || 1;
      return true;
    } catch (e) { return false; }
  }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { } }

  return {
    get state() { return S; },
    on, newGame, minuteTick, endDay, startDay,
    acceptOffer, declineOffer, hire, reject, resolveTransition,
    setMode, setStudyTarget, assign, estimateRange,
    isWorkingTime, yen, log,
    save, load, clearSave,
    dismissEvent: id => { S.events = S.events.filter(e => e.id !== id); emit('change'); }
  };
})();
