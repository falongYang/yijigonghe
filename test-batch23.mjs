/* 批次23 验证：消费 A 侧「细节七」——单位姿态 / 交战态 / 局部战斗热度 / 阵营密度
 * 运行：node test-batch23.mjs
 * 真实 three 行为测试在本地 node_modules/three 软链存在时执行，否则自动跳过（源码审计仍跑）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const has = (s, re, m) => ok(re.test(s), m);

const world = read('MVP_Web/js/world.js');
const main = read('MVP_Web/js/main.js');
const uiSrc = read('MVP_Web/js/ui.js');
const html = read('MVP_Web/index.html');
const css = read('MVP_Web/css/style.css');

console.log('— 1) 接线审计 —');
has(world, /const POSTURE_POSE = \{/, '定义 B 侧姿态参数表');
for (const p of ['idle', 'work', 'carry', 'march', 'advance', 'engage', 'skirmish', 'hold', 'patrol', 'death']) {
  has(world, new RegExp('\\b' + p + ':\\s*\\{'), `姿态表含 ${p}`);
}
has(world, /POSTURE_POSE\[u\.posture\] \|\| POSTURE_POSE\.idle/, '读 A 侧 u.posture 且缺字段回落 idle');
has(world, /for \(const key in pm\) pm\[key\] \+= \(pp\[key\] - pm\[key\]\) \* pk/, '姿态参数指数阻尼平滑');
has(world, /u\.engaged === true/, '读 A 侧 u.engaged');
has(world, /Math\.sin\(this\.time \* 7\.5 \+ u\.id\) \* 0\.02/, '交战态微脉动');
has(world, /\* animK \* pm\.bob/, '步幅按姿态系数缩放');
has(world, /bodyScale \* breath \* \(1 - pm\.crouch\)/, '重心下压作用到纵向体量');
has(world, /m\.body\.rotation\.z = walk \* 0\.5 \+ pm\.lean/, '前倾叠加到本体旋转');
has(world, /this\._battleHeat = 0/, '战斗热度初值');
has(world, /setBattleHeat\(v\) \{/, '暴露热度写入方法');
has(world, /this\._heatZoomK = hz0 \+ \(-0\.045 \* heat - hz0\) \* hk/, '热度微推近平滑且限幅 4.5%');
has(world, /const effDist = c\.dist \* \(1 \+ \(Number\(this\._cueZoomK\) \|\| 0\) \+ this\._heatZoomK\)/, '事件推拉与热度推近叠加、只乘渲染距离');
has(main, /sim\.battleIntensityAt\(world\.cam\.tx, world\.cam\.tz, 34\)/, '主循环以相机中心采样局部热度');
has(main, /frameNo % 6 === 0/, '热度 6 帧降频采样');
has(main, /world\.setBattleHeat\(game\.heat\)/, '热度写入渲染层');
has(main, /Sound\.setAmbient\(world\.dayFactor \* \(1 - 0\.35 \* game\.heat\)\)/, '会战处环境底噪压低');
has(uiSrc, /_updateFrontStatus\(s\) \{/, 'HUD 阵营态势条');
has(uiSrc, /s\.factionDensity\(\)/, '读 A 侧阵营密度只读汇总');
has(uiSrc, /now - this\._frontAt < 500/, '态势条 500ms 降频');
has(uiSrc, /this\._setHTML\(el,/, '态势条走去重写入');
has(uiSrc, /this\._updateFrontStatus\(s\);/, '态势条接入 refresh');
has(html, /id="front-status"/, '态势条容器');
has(css, /#front-status \.fs-bar i/, '态势条对比条样式');
has(css, /@media \(max-width: 880px\) \{ #front-status \{ display: none; \} \}/, '窄屏隐藏态势条');
has(html, /阵营态势条<\/b>实时对比/, '帮助页补充态势说明');
has(html, /待命 \/ 作业 \/ 搬运/, '帮助页补充姿态说明');

console.log('— 2) DOM 桩件：态势条 —');
const { UI } = await import('./MVP_Web/js/ui.js');
const { SIDES } = await import('./MVP_Web/js/rts.js');
const els = {};
function mkEl(id) {
  if (els[id]) return els[id];
  const e = {
    id, _yjHTML: undefined, _htmlVal: '', _htmlSet: 0,
    classList: { add() {}, remove() { this._hidden = false; }, toggle() {} },
    get innerHTML() { return this._htmlVal; },
    set innerHTML(v) { this._htmlVal = v; this._htmlSet++; },
    get textContent() { return this._text || ''; },
    set textContent(v) { this._text = String(v); },
  };
  els[id] = e;
  return e;
}
globalThis.document = { getElementById: id => mkEl(id), querySelector: () => null, createElement: () => mkEl('t' + Math.random()), addEventListener() {} };
globalThis.window = { addEventListener() {} };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const savedPerf = globalThis.performance;
let fakeNow = 5000;
globalThis.performance = { now: () => fakeNow };
try {
  let fdCalls = 0;
  const sim = { factionDensity: () => { fdCalls++; return {
    [SIDES.PLAYER]: { count: 32, avgDensity: 0.42 },
    [SIDES.ENEMY]: { count: 28, avgDensity: 0.38 },
  }; } };
  const u = {}; Object.setPrototypeOf(u, UI.prototype);
  const el = mkEl('front-status');
  u._updateFrontStatus(sim);
  ok(el._htmlSet === 1, '首帧渲染态势条');
  ok(/我方 <b>32<\/b>/.test(el.innerHTML) && /<b>28<\/b> 敌方/.test(el.innerHTML), '显示双方存活数');
  ok(/width:53%/.test(el.innerHTML), '对比条按 32:28 计算占比');
  ok(/0\.42 \/ 0\.38/.test(el.innerHTML), '显示平均聚簇密度');
  u._updateFrontStatus(sim); u._updateFrontStatus(sim);
  ok(fdCalls === 1, '500ms 内复用采样，不重复遍历全场');
  fakeNow += 600;
  u._updateFrontStatus(sim);
  ok(fdCalls === 2, '窗口过期后重新采样');
  ok(el._htmlSet === 1, '内容未变时不重复写 DOM');
  sim.factionDensity = () => ({ [SIDES.PLAYER]: { count: 40, avgDensity: 0.5 }, [SIDES.ENEMY]: { count: 20, avgDensity: 0.3 } });
  fakeNow += 600;
  u._updateFrontStatus(sim);
  ok(el._htmlSet === 2 && /width:67%/.test(el.innerHTML), '态势变化后更新对比条');
  let threw = false;
  try { u._updateFrontStatus({}); u._updateFrontStatus({ factionDensity: () => { throw new Error('x'); } }); }
  catch (_) { threw = true; }
  ok(!threw, '接口缺失 / 抛错时安全跳过');
} finally {
  globalThis.performance = savedPerf;
}

console.log('— 3) 真实 three 行为（需 three，可跳过） —');
let THREE = null, World = null;
try {
  THREE = await import('three');
  ({ World } = await import('./MVP_Web/js/world.js'));
} catch (e) { console.log('  (skip: three 不可解析) ' + e.message.split('\n')[0]); }

if (World && THREE) {
  const mk = (mat) => new THREE.Mesh(new THREE.BufferGeometry(), mat || new THREE.MeshBasicMaterial({ transparent: true }));
  function makeUnitMesh() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    group.add(body);
    const bar = new THREE.Group(), fill = mk(); bar.add(fill);
    const ring = mk(), eliteRing = mk(), statusRing = mk(), vetRing = mk(), cmdRing = mk();
    const shadow = mk(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3 }));
    group.add(bar, ring, eliteRing, statusRing, vetRing, cmdRing, shadow);
    return { group, body, bar, fill, ring, eliteRing, statusRing, vetRing, cmdRing, shadow,
      burrowMix: 0, heading: 0, bank: 0, spawnAt: 0, bodyIsClone: true, accent: null,
      side: 'P', caste: 'worker', hitEnv: 0, hitColor: 0xffffff, knock: 0, cmdSeq: 0, vetTier: 0 };
  }
  function makeWorld() {
    const f = {
      scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), time: 10, _frameDt: 0.016,
      _zones: null, unitMeshes: new Map(), _dying: new Map(), pickables: [], _lastShake: 0,
      shake(v) { this._lastShake = Math.max(this._lastShake, v); },
      _syncPips() {}, addEffect() {}, _footDust() {}, _footBubble() {}, _footRipple() {},
    };
    Object.setPrototypeOf(f, World.prototype);
    return f;
  }
  const base = (extra = {}) => ({
    id: 1, x: 10, z: 20, side: 'P', caste: 'worker', domain: 'land', heading: 0,
    hp: 100, maxHp: 100, moving: false, state: 'idle', flash: 0, atkcd: 1, atkTimer: 0,
    level: 1, elite: false, burrowed: false, visible: true, buff: {},
    phys: { dx: 0, dz: 0, mag: 0, env: 0, hitstopT: 0, shakeT: 0, shake: 0, color: 0xffffff },
    ...extra,
  });
  const settle = (f, m, u, n = 90) => {
    for (let i = 0; i < n; i++) { f.time += 0.016; f._syncUnit(u, false, false); }
    return m;
  };

  {
    const f = makeWorld(), m = makeUnitMesh(); f.unitMeshes.set(1, m);
    settle(f, m, base({ posture: 'advance', moving: true }));
    ok(m.pose.lean > 0.15 && m.pose.lean <= 0.18 + 1e-6, '突进姿态前倾收敛到表值');
    ok(m.pose.bob > 1.4 && m.pose.bob <= 1.5 + 1e-6, '突进步幅系数放大');
    ok(m.body.rotation.z > 0.15, '前倾反映到本体旋转');
    const advanceZ = m.body.rotation.z;
    settle(f, m, base({ posture: 'hold' }));
    ok(m.pose.lean < 0.01, '据守姿态前倾归零');
    ok(m.pose.crouch > 0.14, '据守姿态重心下压');
    ok(m.pose.bob < 0.65, '据守步幅收窄');
    ok(m.body.rotation.z < advanceZ, '姿态切换后本体旋转随之变化');
    ok(m.body.scale.y > 0 && m.body.scale.y < m.body.scale.x, '下压只作用于纵向体量');
    // 顿帧冻结姿态过渡
    const before = m.pose.lean;
    f.time += 0.016;
    f._syncUnit(base({ posture: 'advance', phys: { env: 1, mag: 0, dx: 0, dz: 0, hitstopT: 0.06 } }), false, false);
    ok(m.pose.lean === before, '顿帧期间姿态过渡冻结');
    // 缺 posture 回落 idle
    const f2 = makeWorld(), m2 = makeUnitMesh(); f2.unitMeshes.set(1, m2);
    settle(f2, m2, base());
    ok(m2.pose && m2.pose.lean === 0 && m2.pose.bob === 1, '缺 posture 字段时回落 idle（旧行为等价）');
    // engaged 微脉动
    const f3 = makeWorld(), m3 = makeUnitMesh(); f3.unitMeshes.set(1, m3);
    f3.time = 0.21;   // sin(7.5*t + id) 明显非零
    f3._syncUnit(base({ posture: 'engage' }), false, false);
    const plain = m3.body.scale.x;
    f3._syncUnit(base({ posture: 'engage', engaged: true }), false, false);
    ok(Math.abs(m3.body.scale.x - plain) > 1e-6, '交战态带来体量微脉动');
    ok(Math.abs(m3.body.scale.x / plain - 1) < 0.03, '脉动幅度克制（<3%）');
  }

  {
    const mkCam = () => {
      const f = {
        cam: { tx: 0, tz: 0, dist: 150, pitch: 0.9, yaw: 0 },
        camera: new THREE.PerspectiveCamera(),
        keys: {}, edge: { x: 0, y: 0, active: false }, edgePan: false, dragPan: false,
        follow: false, _followX: null, _followZ: null, intro: null, _camFocusT: null,
        _shake: 0, _cueZoomK: 0, _battleHeat: 0, _heatZoomK: 0, time: 0, _camT: null, _camLast: null,
        scene: { fog: null },
      };
      Object.setPrototypeOf(f, World.prototype);
      return f;
    };
    const cold = mkCam(); cold.updateCamera(0.016, 0.016);
    const hot = mkCam(); hot.setBattleHeat(1);
    for (let i = 0; i < 120; i++) hot.updateCamera(0.016, 0.016);
    ok(hot.camera.position.y < cold.camera.position.y, '高热度时镜头轻微推近（相机高度下降）');
    ok(cold.cam.dist === 150 && hot.cam.dist === 150, '相机目标距离完全不被污染');
    ok(hot._heatZoomK < 0 && hot._heatZoomK > -0.0451, '微推近限幅在 4.5% 内');
    ok(cold.camera.position.y / cold.cam.dist > 0.7, '低热度保持原有视角');
    const f = mkCam();
    f.setBattleHeat(2.5); ok(f._battleHeat === 1, '热度上限裁剪');
    f.setBattleHeat(-3); ok(f._battleHeat === 0, '热度下限裁剪');
    f.setBattleHeat('bad'); ok(f._battleHeat === 0, '非法热度按 0 处理');
    // 事件瞬时推拉与热度推近叠加，且都能回弹
    f._cueZoomK = 0.1;
    for (let i = 0; i < 160; i++) f.updateCamera(0.016, 0.016);
    ok(f._cueZoomK === 0 && Math.abs(f._heatZoomK) < 1e-4, '两者独立叠加且均自动回弹');
  }
}

console.log(`\nBATCH23 ${fail === 0 ? 'ALL_PASS' : 'FAILED'}  pass=${pass} fail=${fail}`);
if (fail) process.exitCode = 1;
