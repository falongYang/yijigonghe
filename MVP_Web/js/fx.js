/* 特效注册表（表现层独占）。
 * 每个 builder 签名 (world, pos, opts, t0)，world 为 World 实例；
 * builder 自行 world.fx.push({ t0, obj, update, dispose })，或调用 world 的辅助方法
 * （_spark / _projectile / _expandRing / _orderMarker）与 world.addEffect 派生次级特效。
 * 新增一种特效只需在此加一个键，不必再改 world.js 的 addEffect。
 */
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const FX_BUILDERS = {
  hit(world, pos, opts, t0) {
    const n = 8;
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = pos.x; arr[i * 3 + 1] = pos.y; arr[i * 3 + 2] = pos.z; }
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({ color: opts.color || 0xffd27f, size: 1.1, transparent: true, opacity: 1, depthWrite: false });
    const pts = new THREE.Points(g, mat);
    world.scene.add(pts);
    const vel = [];
    for (let i = 0; i < n; i++) vel.push(new THREE.Vector3((Math.random() - 0.5) * 14, Math.random() * 12, (Math.random() - 0.5) * 14));
    world.fx.push({ t0, obj: pts, update: (t) => {
      if (t > 0.4) return false;
      const p = g.attributes.position.array;
      for (let i = 0; i < n; i++) { p[i * 3] += vel[i].x * 0.02; p[i * 3 + 1] += vel[i].y * 0.02; p[i * 3 + 2] += vel[i].z * 0.02; vel[i].y -= 0.6; }
      g.attributes.position.needsUpdate = true;
      mat.opacity = 1 - t / 0.4; return true;
    }, dispose: () => g.dispose() });
    world.addEffect('impact', pos, { color: opts.color || 0xffd27f });
    // 命中落地的贴地火花溅射，让近身 / 远程命中都有「打在实体上」的碎屑反馈
    if (world._spark) world._spark({ x: pos.x, y: 0.3, z: pos.z }, opts.color || 0xffd27f, 5);
  },

  impact(world, pos, opts, t0) {
    // 命中冲击：贴地扩散环 + 白色核心瞬闪（限流避免会战堆积）
    if (world.fx.length > 160) return;
    const col = opts.color || 0xffd27f;
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.92, 20),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
    g.add(ring, core);
    // 冲击十字：两道细光条随扩散环一起张开，命中读感更「脆」，也让密集会战中的落点可辨
    const cross = [];
    for (const r of [0, Math.PI / 2]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 0.16),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false }));
      bar.rotation.y = r; bar.position.y = 0.04;
      g.add(bar); cross.push(bar);
    }
    g.position.set(pos.x, pos.y || 1, pos.z);
    world.scene.add(g);
    world.fx.push({ t0, obj: g, update: (t) => {
      if (t > 0.28) return false;
      const k = t / 0.28;
      ring.scale.setScalar(1 + k * 2.6);
      ring.material.opacity = 0.85 * (1 - k);
      core.scale.setScalar(1 - k * 0.8);
      core.material.opacity = 0.9 * (1 - k);
      for (const bar of cross) { bar.scale.setScalar(0.7 + k * 1.5); bar.material.opacity = 0.75 * (1 - k); }
      return true;
    }, dispose: () => g.children.forEach(c => { c.geometry.dispose(); c.material.dispose(); }) });
  },

  death(world, pos, opts, t0) {
    // 地面残骸约 6s 淡出，让战场留下交战痕迹
    if (world.fx.length < 120) {
      const w = new THREE.Mesh(new THREE.CircleGeometry(1.6, 14),
        new THREE.MeshBasicMaterial({ color: 0x2a2b20, transparent: true, opacity: 0.5, depthWrite: false }));
      w.rotation.x = -Math.PI / 2; w.position.set(pos.x, 0.22, pos.z);
      w.scale.set(1.1, 0.72, 1);
      world.scene.add(w);
      world.fx.push({ t0, obj: w, update: (t) => {
        if (t > 6) return false;
        w.material.opacity = 0.5 * (1 - t / 6); return true;
      }, dispose: () => { w.geometry.dispose(); w.material.dispose(); } });
    }
    const color = opts.color || 0x9a8b6a;
    const n = 14;
    const grp = new THREE.Group();
    const parts = [];
    for (let i = 0; i < n; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }));
      c.position.copy(pos); grp.add(c);
      parts.push({ mesh: c, v: new THREE.Vector3((Math.random() - 0.5) * 10, Math.random() * 9, (Math.random() - 0.5) * 10) });
    }
    world.scene.add(grp);
    world.fx.push({ t0, obj: grp, update: (t) => {
      if (t > 0.7) return false;
      for (const p of parts) { p.mesh.position.addScaledVector(p.v, 0.04); p.v.y -= 0.4; p.mesh.material.opacity = 1 - t / 0.7; p.mesh.rotation.x += 0.2; p.mesh.rotation.y += 0.15; }
      return true;
    }, dispose: () => grp.children.forEach(c => c.geometry.dispose()) });
    // 阵亡消散：阵营色薄环 + 一缕上升烟，混战中「这里刚倒下一只」也能被看见
    if (world.fx.length < 140) {
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.35, 20),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6,
          side: THREE.DoubleSide, depthWrite: false }));
      halo.rotation.x = -Math.PI / 2; halo.position.set(pos.x, 0.32, pos.z);
      world.scene.add(halo);
      world.fx.push({ t0, obj: halo, update: (t) => {
        if (t > 0.7) return false;
        const k = t / 0.7;
        halo.scale.setScalar(1 + k * 2.6);
        halo.material.opacity = 0.6 * (1 - k);
        return true;
      }, dispose: () => { halo.geometry.dispose(); halo.material.dispose(); } });
      world.addEffect('smoke', { x: pos.x, y: (pos.y || 1) + 0.6, z: pos.z });
    }
  },

  smoke(world, pos, opts, t0) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.9, 7, 6),
      new THREE.MeshBasicMaterial({ color: 0x555c4c, transparent: true, opacity: 0.4, depthWrite: false }));
    m.position.set(pos.x, pos.y || 3, pos.z); world.scene.add(m);
    world.fx.push({ t0, obj: m, update: (t) => {
      if (t > 1.4) return false;
      m.position.y += 0.045; m.position.x += 0.014;
      m.scale.setScalar(1 + t * 0.9);
      m.material.opacity = 0.4 * (1 - t / 1.4); return true;
    }, dispose: () => { m.geometry.dispose(); m.material.dispose(); } });
  },

  acid(world, pos, opts, t0) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), new THREE.MeshBasicMaterial({ color: opts.color || 0xaef06a, transparent: true, opacity: 0.95 }));
    m.position.copy(opts.from);
    world.scene.add(m);
    world.fx.push({ t0, obj: m, update: (t) => {
      const k = clamp(t / 0.18, 0, 1);
      m.position.lerpVectors(opts.from, pos, k);
      if (k >= 1) { world.addEffect('hit', pos, { color: opts.color || 0xaef06a }); return false; }
      return true;
    }, dispose: () => { m.geometry.dispose(); m.material.dispose(); } });
  },

  ring(world, pos, opts = {}, t0) {
    // opts.r = 期望的扩散半径（世界单位）。sim 里已有 6 处传入（信息素井 w.r、号令 r:30、
    // 维修 b.size*0.6、纪元事件 r:120/40、建筑受袭告警 tgt.size+3），此前被忽略，
    // 导致大范围提示与建筑告警都只有同一个小环。传 r 时用细环按半径扩散；
    // 未传 r 的调用（命中/出兵/卸货等）保持原有造型与动画，向后兼容。
    const col = opts.color || 0x9fe0c8;
    const R = opts.r;
    const mesh = R
      ? new THREE.Mesh(new THREE.TorusGeometry(1, 0.045, 8, 40),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, depthWrite: false }))
      : new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.3, 8, 24),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(pos.x, 0.3, pos.z);
    world.scene.add(mesh);
    world.fx.push({ t0, obj: mesh, update: (t) => {
      if (t > 0.6) return false;
      if (R) {
        const k = t / 0.6;
        mesh.scale.setScalar(R * (0.3 + 0.7 * k));
        mesh.material.opacity = 0.85 * (1 - k);
      } else {
        const s = 1 + t * 6; mesh.scale.set(s, s, s);
        mesh.material.opacity = 0.9 * (1 - t / 0.6);
      }
      return true;
    }, dispose: () => { mesh.geometry.dispose(); mesh.material.dispose(); } });
  },

  foot(world, pos, opts, t0) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(1.1, 16), new THREE.MeshBasicMaterial({ color: 0xcabf9a, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(pos.x, 0.3, pos.z);
    world.scene.add(m);
    world.fx.push({ t0, obj: m, update: (t) => {
      if (t > 0.5) return false;
      const s = 0.4 + (t / 0.5) * 1.7; m.scale.set(s, s, s);
      m.material.opacity = 0.4 * (1 - t / 0.5); return true;
    }, dispose: () => { m.geometry.dispose(); m.material.dispose(); } });
  },

  bubble(world, pos, opts, t0) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 7, 6), new THREE.MeshBasicMaterial({ color: 0x6e5a3a, transparent: true, opacity: 0.5, depthWrite: false }));
    m.position.set(pos.x, 0.4, pos.z); world.scene.add(m);
    world.fx.push({ t0, obj: m, update: (t) => {
      if (t > 0.6) return false;
      m.position.y += 0.06; m.scale.setScalar(1 + t * 0.8);
      m.material.opacity = 0.5 * (1 - t / 0.6); return true;
    }, dispose: () => { m.geometry.dispose(); m.material.dispose(); } });
  },

  ripple(world, pos, opts, t0) {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.0, 18), new THREE.MeshBasicMaterial({ color: 0x6fc8e0, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    r.rotation.x = -Math.PI / 2; r.position.set(pos.x, 0.2, pos.z);
    world.scene.add(r);
    world.fx.push({ t0, obj: r, update: (t) => {
      if (t > 0.7) return false;
      const s = 1 + (t / 0.7) * 2.4; r.scale.set(s, s, s);
      r.material.opacity = 0.5 * (1 - t / 0.7); return true;
    }, dispose: () => { r.geometry.dispose(); r.material.dispose(); } });
  },

  melee(world, pos, opts = {}, t0) {
    // 撕咬命中：火花 + 一道对准来袭方向的挥击弧，贴身肉搏不再只是一团白点
    world._spark(pos, 0xffe0a0, 6);
    if (world._spark) world._spark({ x: pos.x, y: 0.3, z: pos.z }, 0xffe0a0, 4);
    const from = opts.from;
    const ang = from ? Math.atan2(pos.z - from.z, pos.x - from.x) : Math.random() * Math.PI * 2;
    const arc = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.16, 6, 14, Math.PI * 0.9),
      new THREE.MeshBasicMaterial({ color: 0xffd27f, transparent: true, opacity: 0.9,
        side: THREE.DoubleSide, depthWrite: false }));
    arc.rotation.x = -Math.PI / 2;
    arc.rotation.z = -ang + Math.PI * 0.45;   // 弧口朝向攻击者
    arc.position.set(pos.x, (pos.y || 1) * 0.6 + 0.35, pos.z);
    world.scene.add(arc);
    world.fx.push({ t0, obj: arc, update: (t) => {
      if (t > 0.24) return false;
      const k = t / 0.24;
      arc.scale.setScalar(0.6 + k * 0.9);
      arc.material.opacity = 0.9 * (1 - k);
      return true;
    }, dispose: () => { arc.geometry.dispose(); arc.material.dispose(); } });
  },
  sting(world, pos, opts) { world._projectile(pos, opts, 0x9bff5a); },
  bolt(world, pos, opts) { world._projectile(pos, opts, 0xbfe8ff, 0.4); },

  psi(world, pos, opts, t0) {
    // 灵能弹：紫色核心弹道 + 旋转念力环
    const col = 0xc7a0ff;
    world._projectile(pos, opts, col, 0.9);
    const from = opts.from || pos;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.14, 6, 20),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, depthWrite: false }));
    halo.rotation.x = Math.PI / 2;
    halo.position.copy(from);
    world.scene.add(halo);
    world.fx.push({ t0, obj: halo, update: (t) => {
      const k = clamp(t / 0.18, 0, 1);
      halo.position.lerpVectors(from, pos, k);
      halo.rotation.z = t * 15;
      halo.scale.setScalar(1 + 0.7 * k);
      halo.material.opacity = 0.8 * (1 - k);
      return k < 1;
    }, dispose: () => { halo.geometry.dispose(); halo.material.dispose(); } });
  },

  bomb(world, pos, opts, t0) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff9a5a, transparent: true, opacity: 0.95 }));
    m.position.set(pos.x, (opts.from ? opts.from.y : pos.y) + 18, pos.z); world.scene.add(m);
    world.fx.push({ t0, obj: m, update: (t) => {
      const k = clamp(t / 0.22, 0, 1);
      m.position.y = ((opts.from ? opts.from.y : pos.y) + 18) * (1 - k) + pos.y * k;
      if (k >= 1) { world.addEffect('hit', pos, { color: 0xff9a5a }); return false; }
      return true;
    }, dispose: () => { m.geometry.dispose(); m.material.dispose(); } });
  },

  // 敌方能力来袭预警：两道错峰扩张的红环 + 地面红闪，配合 world.addPing 的红色光柱，
  // 在敌方释放酸液/轰炸等时给出明显的"此处遭袭"告警（区别于玩家金色战术标记）。
  enemyWarn(world, pos, opts, t0) {
    const col = 0xff5a5a;
    const ring = (delay) => {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.26, 8, 28),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95, depthWrite: false }));
      r.rotation.x = -Math.PI / 2; r.position.set(pos.x, 0.45, pos.z);
      world.scene.add(r);
      const dur = 0.85;
      world.fx.push({ t0, obj: r, update: (t) => {
        const tt = t - delay;
        if (tt < 0) return true;
        if (tt > dur) return false;
        const k = tt / dur;
        r.scale.setScalar(1 + k * 9);
        r.material.opacity = 0.95 * (1 - k);
        return true;
      }, dispose: () => { r.geometry.dispose(); r.material.dispose(); } });
    };
    ring(0); ring(0.25);
    const flash = new THREE.Mesh(new THREE.CircleGeometry(3.4, 22),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
    flash.rotation.x = -Math.PI / 2; flash.position.set(pos.x, 0.25, pos.z);
    world.scene.add(flash);
    world.fx.push({ t0, obj: flash, update: (t) => {
      if (t > 0.55) return false;
      flash.material.opacity = 0.45 * (1 - t / 0.55); return true;
    }, dispose: () => { flash.geometry.dispose(); flash.material.dispose(); } });
  },
};

// 扩散环类：新增一个同类特效只需在此加一行颜色
const RING_COLORS = {
  acidpool: 0x9fe06a, whirl: 0x6fc8e0, venom: 0xb6ff6f, ambush: 0x8a7f56,
  dive: 0xffd27f, resonance: 0xc7b3ff, levelup: 0xffe27f, evolve: 0xffffff,
};
for (const [type, col] of Object.entries(RING_COLORS)) {
  FX_BUILDERS[type] = (world, pos) => world._expandRing(
    pos, col, type === 'resonance' ? 44 : 15,
    (type === 'acidpool' || type === 'whirl' || type === 'venom') ? 1.0 : 0.6);
}

// 四类指令落点标记：由 world._orderMarker 统一造型
for (const type of ['orderMove', 'orderAttack', 'orderRepair', 'orderRally']) {
  FX_BUILDERS[type] = (world, pos, opts) => world._orderMarker(type, pos, opts);
}

// ---------------------------------------------------------------- 质变时刻
// 纪元跃迁：主巢处的三道错峰扩张环 + 上升光柱 + 地面辉光 + 上升粒子。
// A 侧 era 事件只带 {side, era}，坐标由 bridge-view 只读 sim.buildings 取得后传入；
// 颜色按阵营区分（玩家青绿 / 敌方橙），与已有的音效、HUD 卡片、环境色平滑过渡叠加。
FX_BUILDERS.eraUp = (world, pos, opts = {}, t0) => {
  const col = opts.color || 0x7ef0c8;
  const DUR = 1.5;

  // 1) 三道错峰扩张环
  [0, 0.18, 0.36].forEach((delay, i) => {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.34, 8, 32),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false }));
    r.rotation.x = -Math.PI / 2;
    r.position.set(pos.x, 0.5 + i * 0.12, pos.z);
    world.scene.add(r);
    world.fx.push({ t0, obj: r, update: (t) => {
      const tt = t - delay;
      if (tt < 0) return true;
      if (tt > DUR) return false;
      const k = tt / DUR;
      r.scale.setScalar(1 + k * (14 - i * 2));
      r.material.opacity = 0.9 * (1 - k) * (1 - i * 0.18);
      return true;
    }, dispose: () => { r.geometry.dispose(); r.material.dispose(); } });
  });

  // 2) 中心上升光柱
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 2.4, 16, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.set(pos.x, 8, pos.z);
  world.scene.add(beam);
  world.fx.push({ t0, obj: beam, update: (t) => {
    if (t > 1.2) return false;
    const k = t / 1.2;
    beam.material.opacity = 0.38 * (1 - k);
    beam.scale.set(1 - k * 0.6, 1 + k * 0.5, 1 - k * 0.6);
    return true;
  }, dispose: () => { beam.geometry.dispose(); beam.material.dispose(); } });

  // 3) 地面辉光
  const glow = new THREE.Mesh(new THREE.CircleGeometry(4.2, 24),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
  glow.rotation.x = -Math.PI / 2; glow.position.set(pos.x, 0.25, pos.z);
  world.scene.add(glow);
  world.fx.push({ t0, obj: glow, update: (t) => {
    if (t > 0.9) return false;
    glow.scale.setScalar(1 + t * 0.8);
    glow.material.opacity = 0.5 * (1 - t / 0.9);
    return true;
  }, dispose: () => { glow.geometry.dispose(); glow.material.dispose(); } });

  // 4) 上升光尘（共享几何/材质，避免逐粒子创建开销）
  const n = 18;
  const pg = new THREE.BoxGeometry(0.35, 0.35, 0.35);
  const pm = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95, depthWrite: false });
  const grp = new THREE.Group();
  const parts = [];
  for (let i = 0; i < n; i++) {
    const p = new THREE.Mesh(pg, pm);
    const a = (i / n) * Math.PI * 2;
    p.position.set(pos.x + Math.cos(a) * 2.2, 0.5, pos.z + Math.sin(a) * 2.2);
    grp.add(p);
    parts.push({ m: p, vy: 3 + Math.random() * 4, vx: Math.cos(a) * 1.6, vz: Math.sin(a) * 1.6 });
  }
  world.scene.add(grp);
  world.fx.push({ t0, obj: grp, update: (t) => {
    if (t > 1.4) return false;
    for (const q of parts) {
      q.m.position.x += q.vx * 0.016; q.m.position.z += q.vz * 0.016;
      q.m.position.y += q.vy * 0.016; q.m.rotation.y += 0.12;
    }
    pm.opacity = 0.95 * (1 - t / 1.4);
    return true;
  }, dispose: () => { pg.dispose(); pm.dispose(); } });
};

// 进化：把原先 RING_COLORS 注册的单层白环升级为「双环错峰 + 上升光尘」的质变表现。
// 键名 evolve 与 (world, pos, opts, t0) 签名保持不变，A 侧 _fx('evolve', …) 无需改动；
// opts.color 用阵营色（sim 传入 sp.P.color），外层再叠一道白环提亮。
FX_BUILDERS.evolve = (world, pos, opts = {}, t0) => {
  const col = opts.color || 0xffffff;
  const DUR = 0.85;
  [0, 0.16].forEach((delay, i) => {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.24, 8, 28),
      new THREE.MeshBasicMaterial({ color: i ? 0xffffff : col, transparent: true, opacity: 0.9, depthWrite: false }));
    r.rotation.x = -Math.PI / 2;
    r.position.set(pos.x, 0.6 + i * 0.25, pos.z);
    world.scene.add(r);
    world.fx.push({ t0, obj: r, update: (t) => {
      const tt = t - delay;
      if (tt < 0) return true;
      if (tt > DUR) return false;
      const k = tt / DUR;
      r.scale.setScalar(1 + k * (7 - i * 2));
      r.material.opacity = 0.9 * (1 - k);
      return true;
    }, dispose: () => { r.geometry.dispose(); r.material.dispose(); } });
  });
  const n = 10;
  const pg = new THREE.BoxGeometry(0.28, 0.28, 0.28);
  const pm = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false });
  const grp = new THREE.Group();
  const parts = [];
  for (let i = 0; i < n; i++) {
    const p = new THREE.Mesh(pg, pm);
    const a = (i / n) * Math.PI * 2;
    p.position.set(pos.x + Math.cos(a) * 1.3, (pos.y || 1) * 0.4, pos.z + Math.sin(a) * 1.3);
    grp.add(p);
    parts.push({ m: p, vy: 2.6 + Math.random() * 2.6 });
  }
  world.scene.add(grp);
  world.fx.push({ t0, obj: grp, update: (t) => {
    if (t > 0.9) return false;
    for (const q of parts) q.m.position.y += q.vy * 0.016;
    pm.opacity = 0.9 * (1 - t / 0.9);
    return true;
  }, dispose: () => { pg.dispose(); pm.dispose(); } });
};

// 破土突袭（a_burrow）：A 侧埋伏 3 秒、破土瞬间才 _fx('ambush', …) 一次性结算，
// 这是该能力唯一的高光时刻，原先只走 RING_COLORS 的单层琥珀环（与酸池/毒雾同级）。
// 覆盖为「地下炸开」的形态：三道贴地快环 + 上冲倒锥尘柱 + 抛物线碎屑（带重力落地）+ 地面辉光。
// 键名 ambush 与 (world, pos, opts, t0) 签名不变，A 侧零改动；opts.color 由 sim 传 0x8a7f56。
FX_BUILDERS.ambush = (world, pos, opts = {}, t0) => {
  const col = opts.color || 0x8a7f56;
  const hot = 0xd6b470;

  // 1) 三道错峰贴地扩张环（比纪元环更快，强调爆发的短促感）
  [0, 0.1, 0.2].forEach((delay, i) => {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.28, 8, 28),
      new THREE.MeshBasicMaterial({ color: i === 1 ? hot : col, transparent: true, opacity: 0.9, depthWrite: false }));
    r.rotation.x = -Math.PI / 2;
    r.position.set(pos.x, 0.35 + i * 0.1, pos.z);
    world.scene.add(r);
    world.fx.push({ t0, obj: r, update: (t) => {
      const tt = t - delay;
      if (tt < 0) return true;
      if (tt > 0.7) return false;
      const k = tt / 0.7;
      r.scale.setScalar(1 + k * (9 - i * 1.5));
      r.material.opacity = 0.9 * (1 - k) * (1 - i * 0.16);
      return true;
    }, dispose: () => { r.geometry.dispose(); r.material.dispose(); } });
  });

  // 2) 上冲倒锥尘柱（下窄上宽，从地面窜起后消散）
  const dust = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 0.7, 9, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
  dust.position.set(pos.x, 0.5, pos.z);
  world.scene.add(dust);
  world.fx.push({ t0, obj: dust, update: (t) => {
    if (t > 0.65) return false;
    const k = t / 0.65;
    dust.position.y = 0.5 + k * 5;
    dust.material.opacity = 0.5 * (1 - k);
    dust.scale.set(1 + k * 0.4, 1 - k * 0.35, 1 + k * 0.4);
    return true;
  }, dispose: () => { dust.geometry.dispose(); dust.material.dispose(); } });

  // 3) 地面辉光
  const glow = new THREE.Mesh(new THREE.CircleGeometry(3.0, 20),
    new THREE.MeshBasicMaterial({ color: hot, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
  glow.rotation.x = -Math.PI / 2; glow.position.set(pos.x, 0.28, pos.z);
  world.scene.add(glow);
  world.fx.push({ t0, obj: glow, update: (t) => {
    if (t > 0.55) return false;
    glow.scale.setScalar(1 + t * 1.6);
    glow.material.opacity = 0.55 * (1 - t / 0.55);
    return true;
  }, dispose: () => { glow.geometry.dispose(); glow.material.dispose(); } });

  // 4) 抛物线碎屑（共享几何/材质；与纪元「持续上升光尘」不同，这里带重力并落地停住）
  const n = 14;
  const pg = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const pm = new THREE.MeshBasicMaterial({ color: hot, transparent: true, opacity: 0.95, depthWrite: false });
  const grp = new THREE.Group();
  const parts = [];
  for (let i = 0; i < n; i++) {
    const p = new THREE.Mesh(pg, pm);
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    const rad = 0.6 + Math.random() * 1.6;
    p.position.set(pos.x + Math.cos(a) * rad, 0.4, pos.z + Math.sin(a) * rad);
    grp.add(p);
    parts.push({ m: p, vx: Math.cos(a) * (2 + Math.random() * 3), vz: Math.sin(a) * (2 + Math.random() * 3), vy: 5 + Math.random() * 4 });
  }
  world.scene.add(grp);
  world.fx.push({ t0, obj: grp, update: (t) => {
    if (t > 0.95) return false;
    for (const q of parts) {
      q.m.position.x += q.vx * 0.016; q.m.position.z += q.vz * 0.016;
      q.m.position.y = Math.max(0.3, q.m.position.y + q.vy * 0.016);
      q.vy -= 18 * 0.016;
      q.m.rotation.y += 0.2; q.m.rotation.x += 0.15;
    }
    pm.opacity = 0.95 * (1 - t / 0.95);
    return true;
  }, dispose: () => { pg.dispose(); pm.dispose(); } });
};

// 克制 / 重创命中：金色双环 + 四道径向射线，与普通白色冲击明确分层。
// 由 bridge-view 在 dmg 事件判定 mult>=1.15 或 amount>=40 时派生（180ms 节流），
// 不新增 A 侧事件字段、不改任何已有 fx 键的签名。
FX_BUILDERS.critBurst = (world, pos, opts = {}, t0) => {
  const col = opts.color || 0xffe27f;
  const DUR = 0.5;
  const y = (pos.y || 1) * 0.5 + 0.35;
  [0, 0.09].forEach((delay, i) => {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.2, 8, 24),
      new THREE.MeshBasicMaterial({ color: i ? 0xffffff : col, transparent: true, opacity: 0.9, depthWrite: false }));
    r.rotation.x = -Math.PI / 2; r.position.set(pos.x, y + i * 0.08, pos.z);
    world.scene.add(r);
    world.fx.push({ t0, obj: r, update: (t) => {
      const tt = t - delay;
      if (tt < 0) return true;
      if (tt > DUR) return false;
      const k = tt / DUR;
      r.scale.setScalar(1 + k * (5 - i));
      r.material.opacity = 0.9 * (1 - k);
      return true;
    }, dispose: () => { r.geometry.dispose(); r.material.dispose(); } });
  });
  const rg = new THREE.BoxGeometry(2.4, 0.08, 0.14);
  const rm = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, depthWrite: false });
  const grp = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(rg, rm);
    m.rotation.y = i * Math.PI / 4;
    grp.add(m);
  }
  grp.position.set(pos.x, y, pos.z);
  world.scene.add(grp);
  world.fx.push({ t0, obj: grp, update: (t) => {
    if (t > DUR) return false;
    grp.scale.setScalar(1 + t / DUR * 1.6);
    rm.opacity = 0.85 * (1 - t / DUR);
    return true;
  }, dispose: () => { rg.dispose(); rm.dispose(); } });
  // 纵向金色光柱：克制 / 重创在 3D 里更醒目，混战中也一眼能看出「这下发出了暴击」
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 9, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.set(pos.x, y + 4.5, pos.z);
  world.scene.add(beam);
  world.fx.push({ t0, obj: beam, update: (t) => {
    if (t > DUR) return false;
    const k = t / DUR;
    beam.scale.set(1 + k * 1.4, 1, 1 + k * 1.4);
    beam.material.opacity = 0.8 * (1 - k) * (k < 0.25 ? k / 0.25 : 1);
    return true;
  }, dispose: () => { beam.geometry.dispose(); beam.material.dispose(); } });
};
