/* =========================================================
   data.js — ゲームの数値・定義はすべてここに集約
   バランス調整はこのファイルだけを触れば済みます
   ========================================================= */
window.DATA = (function () {

  /* ---------- 時間 ---------- */
  const TIME = {
    dayStart: 9 * 60,        // 社長の始業 09:00
    dayEnd: 18 * 60,         // 社長の終業 18:00
    userStart: 10 * 60,      // 利用者の始業 10:00
    userEnd: 15 * 60,        // 利用者の終業 15:00
    lunch: [12 * 60, 13 * 60],
    breaks: [[11 * 60, 11 * 60 + 10], [14 * 60, 14 * 60 + 10]],
    realSecPerGameMin: 0.8,  // 等速で 1ゲーム分 = 0.8秒（1日およそ7分）
    speeds: [1, 2, 4, 8],
    workdaysPerMonth: 20
  };

  /* ---------- スキル ---------- */
  const SKILLS = [
    { key: 'html', label: 'HTML' },
    { key: 'css', label: 'CSS' },
    { key: 'js', label: 'JS' },
    { key: 'php', label: 'PHP' },
    { key: 'wp', label: 'WP' }
  ];

  // レベルを上げるのに必要な経験値（Lv1→2 … Lv4→5）
  const EXP_TO_NEXT = [0, 400, 1000, 2200, 4200, Infinity];

  /* ---------- 職員の役割 ---------- */
  const ROLES = {
    designer: { label: 'Webデザイナー', desc: '案件の制作に直接入る。品質を底上げする' },
    manager: { label: '案件割り振り', desc: '手が空いた利用者に自動で仕事を回す' },
    teacher: { label: '講師', desc: '勉強モードの利用者の習得速度を上げる' },
    clerk: { label: '事務員', desc: '備品・経理を回す。不足すると全体効率が落ちる' }
  };

  /* ---------- お金 ---------- */
  const MONEY = {
    startWelfare: 3000000,     // 給付費会計の初期資金
    startBusiness: 1500000,    // 生産活動会計の初期資金
    minWageHour: 950,          // 利用者の時給（最低賃金）
    welfarePerUserDay: 5800,   // 利用者1人1日あたりの給付費
    staffSalaryMonth: 220000,  // 職員の月給
    fixedCostMonth: 250000,    // 家賃・水道光熱などの固定費
    suppliesPerUserMonth: 3000 // 利用者1人あたりの備品費
  };

  /* ---------- 人員配置基準 ---------- */
  const STANDARD = {
    usersPerStaff: 10,  // 利用者10人につき職員1人以上
    penaltyRate: 0.15   // 満たさない月は給付費を15%減算
  };

  /* ---------- 案件 ---------- */
  // tier: 1=個人・小規模 2=中小企業 3=大企業
  const PROJECT_TEMPLATES = [
    { tier: 1, name: '個人サロンのLP', need: { html: 2, css: 2 }, effort: 1440, pay: 120000, days: 6 },
    { tier: 1, name: '飲食店のメニューページ', need: { html: 2, css: 1 }, effort: 1150, pay: 95000, days: 5 },
    { tier: 1, name: '既存サイトの文言修正', need: { html: 1 }, effort: 650, pay: 62000, days: 3 },
    { tier: 1, name: 'お問い合わせフォーム設置', need: { html: 2, php: 2 }, effort: 1520, pay: 145000, days: 6 },
    { tier: 2, name: '工務店のコーポレートサイト', need: { html: 3, css: 3, wp: 2 }, effort: 5500, pay: 420000, days: 12 },
    { tier: 2, name: '学習塾サイトのWP化', need: { html: 3, css: 2, wp: 3 }, effort: 6000, pay: 460000, days: 14 },
    { tier: 2, name: '求人サイトの改修', need: { html: 3, css: 3, js: 2 }, effort: 5100, pay: 390000, days: 12 },
    { tier: 2, name: 'ECサイトの商品ページ量産', need: { html: 2, css: 2, php: 2 }, effort: 6400, pay: 480000, days: 15 },
    { tier: 3, name: '上場企業のブランドサイト', need: { html: 4, css: 4, js: 3 }, effort: 21000, pay: 1450000, days: 22 },
    { tier: 3, name: '全国チェーンの店舗検索システム', need: { html: 4, css: 3, js: 4, php: 3 }, effort: 24000, pay: 1750000, days: 25 },
    { tier: 3, name: '大学サイトのCMS移行', need: { html: 4, css: 3, wp: 4, php: 3 }, effort: 22500, pay: 1600000, days: 24 }
  ];

  /* 評価ランクごとの、届く案件の質と量 */
  const REPUTATION = {
    // rep（0〜100）に対する、tier別の出現重み
    tierWeights: [
      { min: 0, w: [80, 20, 0] },
      { min: 25, w: [55, 42, 3] },
      { min: 50, w: [30, 55, 15] },
      { min: 72, w: [15, 50, 35] },
      { min: 88, w: [5, 40, 55] }
    ],
    offersPerDayBase: 0.5,   // 1日あたりの引き合い件数の基準
    offersPerDayRep: 1.4,    // 評価による上乗せ（rep=100でこの分だけ増える）
    applicantsPerWeekBase: 0.8,
    applicantsPerWeekRep: 2.2
  };

  /* ---------- 生産性 ---------- */
  const WORK = {
    baseOutputPerMin: 0.40,       // 利用者1人が1ゲーム分に生む作業量の基準
    designerOutputPerMin: 1.0,   // 職員デザイナーの作業量
    levelBonus: 0.22,            // 必要レベルを1超えるごとの加算
    levelPenalty: 0.22,          // 必要レベルに1足りないごとの減算
    moraleWeight: 0.5,           // やる気が生産量に与える影響の強さ
    clerkShortagePenalty: 0.18   // 事務員不足1人あたりの全体効率低下
  };

  /* ---------- 勉強 ---------- */
  const STUDY = {
    expPerMin: 1.0,
    teacherBonusPerLevel: 0.18,  // 講師レベル1あたりの倍率上乗せ
    teacherCapacity: 4           // 講師1人が同時に見られる人数
  };

  /* ---------- やる気・出勤 ---------- */
  const MORALE = {
    start: 70,
    attendanceBase: 0.86,        // やる気50のときの出勤率
    attendanceMoraleSwing: 0.12, // やる気による増減幅
    studyJoy: 0.12,              // 勉強モードの日はやる気が上がる
    overworkPain: 0.05,          // 期限が迫った案件に入るとやる気が下がる
    deliverJoy: 5.0,             // 納品成功時の上昇
    idlePain: 0.06,              // 手持ち無沙汰な時間の下降
    dailyRecover: 0.8            // 1日休んだぶんの回復
  };

  /* ---------- 評価 ---------- */
  const QUALITY = {
    scale: 66,          // スキルが要求ちょうどのときの満足度
    latePenalty: 12,    // 1日遅延あたりの満足度低下
    repDivisor: 8       // 満足度50からの差を何で割って評価に反映するか
  };

  /* ---------- 一般就労への移行 ---------- */
  const TRANSITION = {
    avgSkillRequired: 3.6,   // 全スキル平均がこれを超えると候補になる
    moraleRequired: 70,
    chancePerDay: 0.035,     // 候補者1人が1日にオファーを受ける確率
    repGain: 6,              // 送り出したときの評価上昇
    moraleGainOthers: 3      // 他の利用者のやる気上昇
  };

  /* ---------- 名前 ---------- */
  const SURNAMES = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤',
    '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '斎藤', '清水',
    '山崎', '森', '池田', '橋本', '石川', '前田', '藤田', '後藤', '岡田', '長谷川'];
  const GIVEN = ['翔太', '陽菜', '大輔', '美咲', '健太', '結衣', '拓也', '彩香', '直樹', '真由',
    '亮', '沙織', '雄大', '琴音', '和也', '麻衣', '智也', '香織', '達也', '瑞希',
    '諒', '菜々', '悠斗', '千夏', '圭介', '愛美', '光', '遥', '匠', '柚希'];

  /* ---------- 3Dオフィス ---------- */
  // 島型のデスク。seatsPerSide の両側に座るので、1島あたり seatsPerSide×2 席
  const OFFICE = {
    islands: [
      { x: -5.4, z: -3.3, seatsPerSide: 3 },
      { x: -5.4, z: 1.3, seatsPerSide: 3 },
      { x: -0.2, z: -3.3, seatsPerSide: 2 }
    ],
    seatSpacing: 1.6,
    room: { w: 18, d: 14, loungeFrom: 2.6 },
    hairColors: ['#2B2018', '#6B4A2F', '#C9A227', '#8B3A3A', '#3A5A8B',
      '#7A4B8B', '#D97757', '#4A4A4A', '#A8763E', '#5C6B73',
      '#B5651D', '#2F4F4F', '#9B7653', '#704214', '#1F2A38'],
    colors: {
      bg: '#E6EBEE',
      carpet: '#CFE3DD',
      wood: '#E4CBA4',
      wall: '#F7F6F3',
      deskTop: '#F1E9DC',
      deskLeg: '#D6D0C6',
      chair: '#9AA4AE',
      partition: '#DCE4E8',
      shirt: '#EDEFF2',
      shirtStaff: '#C2D3E2',
      pants: '#5A6472',
      skin: '#F3CDA8',
      sofa: '#8FA9C4',
      plant: '#5FA06B',
      pot: '#C98A5B',
      glass: '#DCEEF8',
      monitor: '#3A424C'
    }
  };


  return {
    TIME, SKILLS, EXP_TO_NEXT, ROLES, MONEY, STANDARD,
    PROJECT_TEMPLATES, REPUTATION, WORK, STUDY, MORALE, QUALITY, TRANSITION,
    SURNAMES, GIVEN, OFFICE
  };
})();
