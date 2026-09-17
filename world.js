/* =========================================================
   world.js — 3Dオフィス（等角投影のフロアマップ風）
   ロジックは持たない。sim.js の状態を受け取って描くだけ
   ========================================================= */
window.WORLD = (function () {
  const D = window.DATA;
  const O = D.OFFICE;
  const C = O.colors;

  let renderer, scene, camera, container;
  let avatars = {};
  let seats = [];            // { pos, rot }
  let breakSpots = [], lunchSpots = [];
  let entrance = null;
  let camAngle = 0.62, camZoom = 21, camDist = 34;
  let dragging = false, lastX = 0;

  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const lam = c => new THREE.MeshLambertMaterial({ color: c });

  function box(w, h, d, color, x, y, z, shadow) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(color));
    m.position.set(x, y, z);
    if (shadow !== false) { m.castShadow = true; m.receiveShadow = true; }
    return m;
  }

  /* ---------- 初期化 ---------- */
  function init(el) {
    container = el;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(C.bg);

    camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    buildLights();
    buildRoom();
    resize();

    window.addEventListener('resize', resize);
    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; });
    window.addEventListener('pointerup', () => { dragging = false; });
    window.addEventListener('pointermove', e => {
      if (!dragging) return;
      camAngle += (e.clientX - lastX) * 0.006;
      lastX = e.clientX;
    });
    dom.addEventListener('wheel', e => {
      e.preventDefault();
      camZoom = Math.max(12, Math.min(34, camZoom + e.deltaY * 0.012));
      resize();
    }, { passive: false });
  }

  function buildLights() {
    scene.add(new THREE.AmbientLight('#FFFFFF', 0.72));
    scene.add(new THREE.HemisphereLight('#FFFFFF', '#C9D6D2', 0.45));
    const key = new THREE.DirectionalLight('#FFFBF2', 0.5);
    key.position.set(13, 24, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    // 広い床に自己影のノイズが出るのを防ぐ
    key.shadow.bias = -0.0016;
    key.shadow.normalBias = 0.045;
    const s = key.shadow.camera;
    s.left = -13; s.right = 13; s.top = 13; s.bottom = -13;
    s.near = 1; s.far = 60;
    scene.add(key);
    const fill = new THREE.DirectionalLight('#DCE8F5', 0.22);
    fill.position.set(-10, 12, -8);
    scene.add(fill);
  }

  /* ---------- 部屋 ---------- */
  function buildRoom() {
    const W = O.room.w, Dp = O.room.d, LF = O.room.loungeFrom;

    // 床（作業ゾーンのカーペット）
    const carpetW = LF + W / 2;
    const carpet = box(carpetW, 0.3, Dp, C.carpet, -W / 2 + carpetW / 2, -0.15, 0);
    carpet.castShadow = false;
    scene.add(carpet);

    // 床（ラウンジの木目）
    const woodW = W / 2 - LF;
    const wood = box(woodW, 0.3, Dp, C.wood, LF + woodW / 2, -0.15, 0);
    wood.castShadow = false;
    scene.add(wood);

    // 壁（低め。俯瞰で中が見えるように）。影は落とさない
    const wallA = box(W, 2.6, 0.24, C.wall, 0, 1.3, -Dp / 2);
    const wallB = box(0.24, 2.6, Dp, C.wall, -W / 2, 1.3, 0);
    wallA.castShadow = false; wallB.castShadow = false;
    scene.add(wallA); scene.add(wallB);

    // 窓
    for (let i = -2; i <= 2; i++) {
      const g = box(2.4, 1.3, 0.08, C.glass, i * 3.2, 1.55, -Dp / 2 + 0.16, false);
      scene.add(g);
    }
    for (let i = -1; i <= 1; i++) {
      const g = box(0.08, 1.3, 2.4, C.glass, -W / 2 + 0.16, 1.55, i * 3.4, false);
      scene.add(g);
    }

    // ゾーンを仕切るローパーティション
    for (let i = 0; i < 3; i++) {
      scene.add(box(0.14, 1.25, 2.2, C.partition, LF - 0.3, 0.62, -5 + i * 2.6));
    }

    // デスクの島
    O.islands.forEach(isl => buildIsland(isl));

    // ラウンジ
    buildLounge();

    entrance = v(W / 2 - 1.4, 0, Dp / 2 - 1.2);
  }

  function buildIsland(isl) {
    const n = isl.seatsPerSide;
    const sp = O.seatSpacing;
    const tableW = n * sp;
    const tableD = 1.7;

    // 天板
    const top = box(tableW, 0.09, tableD, C.deskTop, isl.x, 0.73, isl.z);
    scene.add(top);
    // 脚
    [[-tableW / 2 + 0.3, -tableD / 2 + 0.25], [tableW / 2 - 0.3, -tableD / 2 + 0.25],
    [-tableW / 2 + 0.3, tableD / 2 - 0.25], [tableW / 2 - 0.3, tableD / 2 - 0.25]].forEach(p => {
      scene.add(box(0.09, 0.7, 0.09, C.deskLeg, isl.x + p[0], 0.35, isl.z + p[1]));
    });

    for (let side = 0; side < 2; side++) {
      const sz = side === 0 ? -1 : 1;
      for (let i = 0; i < n; i++) {
        const x = isl.x - tableW / 2 + sp / 2 + i * sp;
        const z = isl.z + sz * 1.32;
        const rot = side === 0 ? 0 : Math.PI;   // 机の方を向く
        seats.push({ pos: v(x, 0, z), rot });
        scene.add(makeChair(x, z, rot));
        scene.add(makeMonitor(x, isl.z + sz * 0.42, rot));
      }
    }
  }

  function makeChair(x, z, rot) {
    const g = new THREE.Group();
    g.add(box(0.52, 0.08, 0.52, C.chair, 0, 0.44, 0));
    g.add(box(0.52, 0.5, 0.08, C.chair, 0, 0.72, 0.24));
    g.add(box(0.07, 0.44, 0.07, C.deskLeg, 0, 0.22, 0));
    g.add(box(0.42, 0.06, 0.42, C.deskLeg, 0, 0.03, 0));
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    return g;
  }

  function makeMonitor(x, z, rot) {
    const g = new THREE.Group();
    g.add(box(0.72, 0.42, 0.04, C.monitor, 0, 1.0, 0));
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.34), new THREE.MeshBasicMaterial({ color: '#9FC8E8' }));
    scr.position.set(0, 1.0, rot === 0 ? -0.03 : 0.03);
    scr.rotation.y = rot === 0 ? Math.PI : 0;
    g.add(scr);
    g.add(box(0.1, 0.2, 0.1, C.monitor, 0, 0.83, 0));
    g.add(box(0.3, 0.03, 0.18, C.monitor, 0, 0.75, 0));
    g.position.set(x, 0, z);
    return g;
  }

  function buildLounge() {
    const W = O.room.w, Dp = O.room.d;
    const cx = (O.room.loungeFrom + W / 2) / 2 + 0.4;

    // ソファ（L字）
    const sofa = new THREE.Group();
    sofa.add(box(1.5, 0.42, 3.4, C.sofa, 0, 0.21, 0));
    sofa.add(box(0.35, 0.5, 3.4, C.sofa, -0.58, 0.55, 0));
    sofa.position.set(W / 2 - 1.6, 0, -3.4);
    scene.add(sofa);

    const lowTable = box(1.0, 0.36, 2.0, C.deskTop, W / 2 - 3.3, 0.18, -3.4);
    scene.add(lowTable);

    for (let i = 0; i < 5; i++) breakSpots.push(v(W / 2 - 2.5, 0, -4.8 + i * 0.85));

    // 丸テーブル（昼休憩）
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.09, 20), lam(C.deskTop));
    t.position.set(cx, 0.73, 2.6); t.castShadow = true; t.receiveShadow = true;
    scene.add(t);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.26, 0.7, 12), lam(C.deskLeg));
    leg.position.set(cx, 0.35, 2.6); leg.castShadow = true;
    scene.add(leg);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const sx = cx + Math.cos(a) * 1.75, sz = 2.6 + Math.sin(a) * 1.75;
      lunchSpots.push(v(sx, 0, sz));
      if (i % 2 === 0) {
        const st = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.44, 12), lam(C.chair));
        st.position.set(sx, 0.22, sz); st.castShadow = true;
        scene.add(st);
      }
    }

    // 観葉植物
    [[W / 2 - 1.2, Dp / 2 - 1.6], [O.room.loungeFrom + 0.8, -Dp / 2 + 1.2], [W / 2 - 1.4, 0.4]]
      .forEach(p => scene.add(makePlant(p[0], p[1])));

    // 棚
    scene.add(box(0.5, 1.1, 3.0, C.deskTop, -O.room.w / 2 + 0.7, 0.55, Dp / 2 - 2.4));
  }

  function makePlant(x, z) {
    const g = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.4, 12), lam(C.pot));
    pot.position.y = 0.2; pot.castShadow = true;
    g.add(pot);
    for (let i = 0; i < 4; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), lam(C.plant));
      leaf.position.set((Math.random() - .5) * 0.35, 0.62 + Math.random() * 0.4, (Math.random() - .5) * 0.35);
      leaf.scale.set(1, 1.5, 1);
      leaf.castShadow = true;
      g.add(leaf);
    }
    g.position.set(x, 0, z);
    return g;
  }

  /* ---------- キャラクター（3頭身） ---------- */
  function hairFor(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return O.hairColors[h % O.hairColors.length];
  }

  function makeAvatar(person) {
    const g = new THREE.Group();
    const HEAD = 0.34;                       // 頭の半径。全高はこの約3倍
    const shirt = person.kind === 'staff' ? C.shirtStaff : C.shirt;

    // 脚
    [-0.15, 0.15].forEach(dx => {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.5, 10), lam(C.pants));
      l.position.set(dx, 0.25, 0); l.castShadow = true;
      g.add(l);
    });
    // 胴
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.25, 0.62, 12), lam(shirt));
    torso.position.y = 0.81; torso.castShadow = true;
    g.add(torso);
    // 肩の丸み
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.29, 12, 8), lam(shirt));
    sh.position.y = 1.09; sh.scale.set(1, 0.55, 1); sh.castShadow = true;
    g.add(sh);
    // 腕
    [-0.34, 0.34].forEach(dx => {
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.08, 0.5, 8), lam(shirt));
      a.position.set(dx, 0.85, 0.02);
      a.rotation.z = dx < 0 ? 0.12 : -0.12;
      a.castShadow = true;
      g.add(a);
    });
    // 首
    g.add(box(0.14, 0.1, 0.14, C.skin, 0, 1.17, 0));
    // 頭
    const head = new THREE.Mesh(new THREE.SphereGeometry(HEAD, 18, 14), lam(C.skin));
    head.position.y = 1.17 + HEAD + 0.04;
    head.castShadow = true;
    g.add(head);
    // 髪（人によって色が違う）
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(HEAD + 0.025, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62),
      lam(hairFor(person.id))
    );
    hair.position.y = head.position.y + 0.015;
    hair.castShadow = true;
    g.add(hair);
    // 後ろ髪
    const back = new THREE.Mesh(new THREE.SphereGeometry(HEAD * 0.92, 14, 10), lam(hairFor(person.id)));
    back.position.set(0, head.position.y - 0.06, -0.09);
    back.scale.set(1, 0.9, 0.7);
    g.add(back);

    scene.add(g);
    return {
      group: g, target: entrance.clone(), targetRot: 0,
      seated: false, phase: Math.random() * 6, spawned: false
    };
  }

  /* ---------- 状態の反映 ---------- */
  function sync(state) {
    if (!scene) return;
    const people = state.users.concat(state.staff);
    const seen = {};

    people.forEach((p, i) => {
      seen[p.id] = true;
      if (!avatars[p.id]) avatars[p.id] = makeAvatar(p);
      const a = avatars[p.id];
      const seat = (p.desk != null && seats[p.desk]) ? seats[p.desk] : null;

      let visible = true, target = entrance, rot = null, seated = false;

      switch (p.state) {
        case 'home':
        case 'absent':
          visible = false; break;
        case 'commute':
          target = entrance; break;
        case 'desk':
          if (seat) { target = seat.pos; rot = seat.rot; seated = true; }
          break;
        case 'break':
          target = breakSpots[i % breakSpots.length]; rot = -Math.PI / 2; break;
        case 'lunch':
          target = lunchSpots[i % lunchSpots.length]; break;
        case 'left':
          target = entrance; break;
      }

      if (visible && !a.spawned) { a.group.position.copy(entrance); a.spawned = true; }
      a.group.visible = visible;
      a.target.copy(target);
      a.targetRot = rot;
      a.seated = seated;
    });

    Object.keys(avatars).forEach(id => {
      if (!seen[id]) { scene.remove(avatars[id].group); delete avatars[id]; }
    });
  }

  /* ---------- 毎フレーム ---------- */
  function render(dt) {
    if (!renderer) return;

    Object.keys(avatars).forEach(id => {
      const a = avatars[id], g = a.group;
      const d = a.target.clone().sub(g.position);
      d.y = 0;
      const dist = d.length();

      if (dist > 0.08) {
        d.normalize().multiplyScalar(Math.min(dist, dt * 2.4));
        g.position.x += d.x; g.position.z += d.z;
        const want = Math.atan2(d.x, d.z);
        g.rotation.y += shortestAngle(g.rotation.y, want) * Math.min(1, dt * 9);
        a.phase += dt * 9;
        g.position.y = Math.abs(Math.sin(a.phase)) * 0.055;   // 歩く上下動
      } else {
        if (a.targetRot != null) {
          g.rotation.y += shortestAngle(g.rotation.y, a.targetRot) * Math.min(1, dt * 7);
        }
        if (a.seated) {
          a.phase += dt * 2.2;
          g.position.y = -0.30 + Math.sin(a.phase) * 0.008;   // 着席
        } else {
          g.position.y = 0;
        }
      }
    });

    camera.position.set(
      Math.sin(camAngle) * camDist,
      camDist * 0.80,
      Math.cos(camAngle) * camDist
    );
    camera.lookAt(0, 0.6, 0);
    renderer.render(scene, camera);
  }

  function shortestAngle(from, to) {
    let d = (to - from) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function resize() {
    if (!renderer || !container) return;
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.left = -camZoom * aspect / 2;
    camera.right = camZoom * aspect / 2;
    camera.top = camZoom / 2;
    camera.bottom = -camZoom / 2;
    camera.near = 0.1;
    camera.far = 200;
    camera.updateProjectionMatrix();
  }

  return { init, sync, render, resize };
})();
