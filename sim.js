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

  // 重み配列（添字0=Lv1…）に従ってレベルを1つ選ぶ。高レベルほど出にくくする抽選
  function weightedLevel(weights) {
    const total = weights.reduce((a, w) => a + w, 0);
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      if (r < weights[i]) return i + 1;
      r -= weights[i];
    }
    return weights.length;
  }

  function emptySkills(base) {
    const o = {};
    D.SKILLS.forEach(s => { o[s.key] = { lv: base, exp: 0 }; });
    return o;
  }

  function randomUserSkills() {
    const sk = emptySkills(1);
    // 得意分野を1〜2個だけ持たせる。レベルは面接のレア度に従う（最高でも Lv5）
    const n = rint(1, 2);
    const keys = D.SKILLS.map(s => s.key).sort(() => Math.random() - 0.5);
    for (let i = 0; i < n; i++) sk[keys[i]].lv = weightedLevel(D.SKILL_RARITY.userSpecialty);
    return sk;
  }

  // 職員の得意分野（案件で発揮する技術スキル）。最大2つまで、勉強では伸びない固定値
  function randomStaffSkills() {
    const sk = emptySkills(1);
    const n = rint(0, 2);
    const keys = D.SKILLS.map(s => s.key).sort(() => Math.random() - 0.5);
    for (let i = 0; i < n; i++) sk[keys[i]].lv = weightedLevel(D.SKILL_RARITY.staffCraft);
    return sk;
  }

  // 職員の役割は4つのうち1つだけ。ランダムに決まり、役割自体にレベルはない
  function randomStaffRole() {
    return pick(Object.keys(D.ROLES));
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
      extendedHours: false,      // 面談で勤務時間の延長に応じたか
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
      role: opts.role || randomStaffRole(),
      skills: opts.skills || randomStaffSkills(),
      assigned: null,
      present: false, state: 'home', desk: null,
      joinDay: S ? S.day : 0
    };
  }

  function newCeo() {
    return {
      id: nextId(), kind: 'ceo', name: makeName(),
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
      users: [], staff: [], ceo: null, ceoLeaveAt: D.TIME.ceoLeaveRange[0],
      offers: [], projects: [], done: [],
      applicants: [], pendingHires: [],
      log: [],
      monthlyWelfareDays: 0, monthlyWage: 0, monthlyRevenue: 0,
      events: []
    };
    for (let i = 0; i < 4; i++) S.users.push(newUser());
    S.staff.push(newStaff({ role: 'manager' }));
    S.staff.push(newStaff({ role: 'teacher' }));
    S.ceo = newCeo();
    assignDesks();
    startDay();
    log('事業所を開所しました。まずは案件を受けて、利用者の賃金を稼ぎましょう。');
    return S;
  }

  function assignDesks() {
    const zones = D.OFFICE.seatZones;
    const userSeats = [], staffSeats = [];
    zones.forEach((z, i) => {
      if (z === 'user') userSeats.push(i);
      else if (z === 'staff') staffSeats.push(i);
    });
    S.users.forEach((u, i) => { u.desk = i < userSeats.length ? userSeats[i] : null; });
    S.staff.forEach((s, i) => { s.desk = i < staffSeats.length ? staffSeats[i] : null; });
    if (S.ceo) S.ceo.desk = D.OFFICE.ceoSeatIndex;
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
      u.arriveAt = D.TIME.userStart - rint(5, 40);
      if (u.present) { u.attendDays++; S.monthlyWelfareDays++; }
    });
    S.staff.forEach(s => {
      s.present = Math.random() < 0.97;
      s.state = s.present ? 'home' : 'absent';
      s.arriveAt = D.TIME.dayStart - rint(0, 15);
    });
    if (S.ceo) {
      S.ceo.present = Math.random() < 0.98;
      S.ceo.state = S.ceo.present ? 'home' : 'absent';
      S.ceo.arriveAt = D.TIME.dayStart - rint(10, 30);
      S.ceoLeaveAt = rint(D.TIME.ceoLeaveRange[0], D.TIME.ceoLeaveRange[1]);
    }

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
    if (S.minute % 30 === 0) { maybeOffer(); maybeTeachingOffer(); }
    if (S.minute === 13 * 60) maybeApplicant();
    if (S.minute === 11 * 60) maybeTransition();

    // 期限チェック
    if (S.minute === T.userEnd) checkDeadlines();

    if (S.minute >= T.dayEnd) S.dayPhase = 'closing';
    emit('tick');
  }

  // 職員の勤務時間全体をカバーする外側の窓。個々の利用者の終業は updatePresence で判定する
  function isWorkingTime() {
    const m = S.minute, T = D.TIME;
    if (m < T.userStart || m >= T.dayEnd) return false;
    if (m >= T.lunch[0] && m < T.lunch[1]) return false;
    for (const b of T.breaks) if (m >= b[0] && m < b[1]) return false;
    return true;
  }

  function updatePresence() {
    const m = S.minute, T = D.TIME;
    S.users.forEach(u => {
      if (!u.present) return;
      const end = u.extendedHours ? T.userEnd + T.extendMinutes : T.userEnd;
      if (m < u.arriveAt) u.state = 'home';
      else if (m < u.arriveAt + 8) u.state = 'commute';
      else if (m >= end) u.state = 'left';
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
    if (S.ceo && S.ceo.present) {
      const c = S.ceo;
      if (m < c.arriveAt) c.state = 'home';
      else if (m < c.arriveAt + 8) c.state = 'commute';
      else if (m >= S.ceoLeaveAt) c.state = 'left';
      else if (m >= T.lunch[0] && m < T.lunch[1]) c.state = 'lunch';
      else c.state = 'desk';
    }
  }

  /* ---------- 効率の補正 ---------- */
  function clerkFactor() {
    const need = Math.ceil(S.users.length / 6);
    const have = S.staff.filter(s => s.present && s.role === 'clerk').length;
    const short = Math.max(0, need - have);
    return clamp(1 - short * D.WORK.clerkShortagePenalty, 0.4, 1);
  }

  // need は技術スキル（html等）のキーを持つ。空なら誰でも同じように対応できる（講師案件など）
  function skillFactor(person, need) {
    const keys = Object.keys(need);
    if (!keys.length) return 1;
    let f = 0;
    keys.forEach(k => {
      const lv = person.skills && person.skills[k] ? person.skills[k].lv : 3;
      const d = lv - need[k];
      f += 1 + (d >= 0 ? d * D.WORK.levelBonus : d * D.WORK.levelPenalty);
    });
    return clamp(f / keys.length, 0.15, 2.2);
  }

  // 経験値を加算し、レベルアップも処理する共通処理（勉強・案件どちらからも使う）
  function gainSkillExp(u, key, amount) {
    const sk = u.skills[key];
    if (!sk || sk.lv >= D.SKILL_MAX) return;
    sk.exp += amount;
    const need = D.EXP_TO_NEXT[sk.lv];
    if (sk.exp >= need) {
      sk.exp = 0; sk.lv++;
      const label = D.SKILLS.find(s => s.key === key).label;
      log(`${u.name} さんの ${label} が Lv${sk.lv} になりました。`, 'good');
      emit('levelup', u);
    }
  }

  function progressWork() {
    const cf = clerkFactor();

    // 自動割り振り（案件割り振り役の職員がいる場合）
    const mgr = S.staff.find(s => s.present && s.state === 'desk' && s.role === 'manager');
    if (mgr) autoAssign();

    S.projects.forEach(p => { p._today = 0; });

    S.users.forEach(u => {
      if (u.state !== 'desk' || u.mode !== 'work') return;
      const p = S.projects.find(x => x.id === u.assigned && x.kind !== 'teaching');
      if (!p) { u.morale = clamp(u.morale - D.MORALE.idlePain / 60, 0, 100); return; }
      const mf = 1 + (u.morale - 50) / 50 * D.WORK.moraleWeight;
      const sf = skillFactor(u, p.need);
      const out = D.WORK.baseOutputPerMin * sf * mf * cf;
      p.progress += out;
      p.qualitySum += sf;
      p.qualityCount++;
      p._today += out;
      // 案件で使ったスキルは、実地でも少しずつ伸びる（勉強よりゆっくり）
      Object.keys(p.need).forEach(k => gainSkillExp(u, k, D.STUDY.expPerMin * D.WORK.onJobExpRate));
      // 期限が迫った案件はやる気を削る
      const left = p.dueDay - S.day;
      if (left <= 2) u.morale = clamp(u.morale - D.MORALE.overworkPain / 60, 0, 100);
      // 勤務時間を延長してもらっている分は、やる気の消耗も早い
      if (u.extendedHours && S.minute >= D.TIME.userEnd) {
        u.morale = clamp(u.morale - D.MORALE.extendedPain / 60, 0, 100);
      }
    });

    // 職員の案件参加（デザイナーは通常案件のみ、講師は通常案件・講師案件どちらも受けられる）
    S.staff.forEach(s => {
      if (s.state !== 'desk' || (s.role !== 'designer' && s.role !== 'teacher')) return;
      const p = S.projects.find(x => x.id === s.assigned);
      if (!p) return;
      if (p.kind === 'teaching' && s.role !== 'teacher') return;
      const sf = skillFactor(s, p.need);  // 講師案件は need が空なので常に sf=1
      const out = D.WORK.designerOutputPerMin * sf * cf;
      p.progress += out;
      p.qualitySum += sf;
      p.qualityCount++;
      p._today = (p._today || 0) + out;
    });

    // 完成判定
    S.projects.slice().forEach(p => { if (p.progress >= p.effort) deliver(p); });
  }

  function autoAssign() {
    const idle = S.users.filter(u => u.state === 'desk' && u.mode === 'work' &&
      (!u.assigned || !S.projects.some(p => p.id === u.assigned)));
    const pool = S.projects.filter(p => p.kind !== 'teaching');
    if (!idle.length || !pool.length) return;
    const sorted = pool.slice().sort((a, b) => a.dueDay - b.dueDay);
    idle.forEach((u, i) => { u.assigned = sorted[i % sorted.length].id; });
  }

  function progressStudy() {
    // 講師案件を請け負っている間は、社内の勉強は見られない
    const teachers = S.staff.filter(s => s.present && s.state === 'desk' && s.role === 'teacher' && !s.assigned);
    let capacity = teachers.reduce((a, t) => a + D.STUDY.teacherCapacity, 0);

    S.users.forEach(u => {
      if (u.state !== 'desk' || u.mode !== 'study') return;
      let mult = 1;
      if (capacity > 0) { mult += D.STUDY.teacherFlatBonus; capacity--; }
      gainSkillExp(u, u.studyTarget, D.STUDY.expPerMin * mult);
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
      id: o.id, name: o.name, tier: o.tier, kind: o.kind || 'web', need: o.need,
      effort: o.effort, pay: o.pay,
      progress: 0, qualitySum: 0, qualityCount: 0,
      dueDay: S.day + o.days, startDay: S.day
    });
    log(`「${o.name}」を受注しました。納期は ${o.days} 日後です。`, 'good');
    emit('change');
  }

  function maybeTeachingOffer() {
    const TO = D.TEACHING_OFFER;
    const perDay = TO.perDayBase + S.reputation / 100 * TO.perDayRep;
    const perCheck = perDay / 10;
    if (Math.random() > perCheck) return;
    if (S.offers.filter(o => o.kind === 'teaching').length >= TO.maxPending) return;

    const t = pick(D.TEACHING_TEMPLATES);
    const variance = rnd(0.9, 1.1);
    S.offers.push({
      id: nextId(), kind: 'teaching', name: t.name, tier: 0,
      need: {},
      effort: Math.round(t.effort * variance),
      pay: Math.round(t.pay * variance / 1000) * 1000,
      days: t.days + rint(-1, 2),
      expires: S.day + 2
    });
    log(`講師の引き合い：「${t.name}」`, 'info');
    emit('offer');
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
    // 評価が高いほど良い人が来る（それでも面接で分かるレベルの上限は超えない）
    if (S.reputation > 55 && Math.random() < 0.5) {
      const k = pick(D.SKILLS).key;
      person.skills[k].lv = clamp(person.skills[k].lv + 1, 1, D.INTERVIEW_SKILL_CAP);
    }
    S.applicants.push({ id: nextId(), person, arrivedDay: S.day });
    log(`${person.name} さんが面接に来ました。`, 'info');
    emit('applicant');
  }

  // 面接では能力が正確には分からない。事務員がいるほど幅が狭まる
  function estimateRange(lv, max) {
    max = max || D.INTERVIEW_SKILL_CAP;
    const hasClerk = S.staff.some(s => s.role === 'clerk');
    const span = hasClerk ? 0 : 1;
    const lo = clamp(lv - span, 1, max), hi = clamp(lv + span, 1, max);
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

  // 利用者1人の実働分数（延長している場合はその分を加算）
  function workMinutesFor(u) {
    const T = D.TIME;
    const end = u.extendedHours ? T.userEnd + T.extendMinutes : T.userEnd;
    let workMin = 0;
    for (let m = T.userStart; m < end; m++) {
      if (m >= T.lunch[0] && m < T.lunch[1]) continue;
      if (T.breaks.some(b => m >= b[0] && m < b[1])) continue;
      workMin++;
    }
    return workMin;
  }

  /* ---------- 1日の締め ---------- */
  function endDay() {
    // 利用者の賃金（生産活動収入から支払う）
    let paid = 0;
    S.users.forEach(u => {
      if (!u.present) return;
      paid += Math.round(D.MONEY.minWageHour * workMinutesFor(u) / 60);
    });
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
  function assignStaff(staffId, projectId) {
    const s = S.staff.find(x => x.id === staffId);
    if (s) { s.assigned = projectId || null; emit('change'); }
  }
  function setRole(staffId, role) {
    const s = S.staff.find(x => x.id === staffId);
    if (s && D.ROLES[role]) {
      s.role = role;
      if (role !== 'designer' && role !== 'teacher') s.assigned = null;
      emit('change');
    }
  }
  function setExtendedHours(userId, on) {
    const u = S.users.find(x => x.id === userId);
    if (u) { u.extendedHours = !!on; emit('change'); }
  }

  /* ---------- 面談 ---------- */
  function openMeeting(userId) {
    if (!S.users.some(u => u.id === userId)) return;
    S.events.unshift({ id: nextId(), type: 'meeting', userId });
    emit('event');
  }
  function proposeTransition(userId) {
    const u = S.users.find(x => x.id === userId);
    if (!u) return;
    const avg = D.SKILLS.reduce((a, s) => a + u.skills[s.key].lv, 0) / D.SKILLS.length;
    if (avg < D.TRANSITION.avgSkillRequired || u.morale < D.TRANSITION.moraleRequired) return;
    S.users = S.users.filter(x => x.id !== u.id);
    S.reputation = clamp(S.reputation + D.TRANSITION.repGain, 0, 100);
    S.users.forEach(o => { o.morale = clamp(o.morale + D.TRANSITION.moraleGainOthers, 0, 100); });
    assignDesks();
    log(`${u.name} さんが面談を経て一般就労へ移行しました。事業所の評価が上がりました。`, 'good');
    emit('change');
  }

  function yen(n) {
    return '¥' + Math.round(n).toLocaleString('ja-JP');
  }

  /* ---------- セーブ ---------- */
  const SAVE_KEY = 'atype-save-v2';
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
    setMode, setStudyTarget, assign, assignStaff, setRole, estimateRange,
    setExtendedHours, openMeeting, proposeTransition,
    isWorkingTime, yen, log, skillFactor,
    save, load, clearSave,
    dismissEvent: id => { S.events = S.events.filter(e => e.id !== id); emit('change'); }
  };
})();
