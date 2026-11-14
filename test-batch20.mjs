/* 批次20 验证：消费 A 侧 u.feel 手感规格（转向 / 步频 / 起手 / 后坐）
 * 运行：node test-batch20.mjs
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

console.log('— 1) 接线审计 —');
const w = read('MVP_Web/js/world.js');
const html = read('MVP_Web/index.html');
has(w, /const feel = u\.feel \|\| null/, '读取 A 侧手感只读层');
has(w, /Number\.isFinite\(feel\.facing\)/, '朝向用 feel.facing');
has(w, /u\.heading，旧行为完全等价|缺失时回落到 u\.heading/, 'heading 回落说明');
has(w, /Number\.isFinite\(feel\.step\)/, '步态用 feel.step');
has(w, /clamp\(Number\(feel\.step\), -0\.25, 0\.25\)/, '步态相位限幅');
has(w, /Number\(feel\.windup\)/, '起手用 feel.windup');
has(w, /Number\(feel\.recoil\)/, '后坐用 feel.recoil');
has(w, /step != null \? step : Math\.sin/, '无 feel 时回落原步频公式');
has(html, /转身速率、步频起伏、起手蓄力与后坐回弹/, '帮助页补充手感说明');
has(w, /this\._daySpec = info\.day \|\| null/, '逐章昼夜快照来自 sceneInfo().day');
has(w, /Number\.isFinite\(ds\.intensity\)/, '昼夜明暗由 A 侧 intensity 驱动');
has(w, /ICON\[ds\.label\]/, '时段名称/图标使用 A 侧相位标签');
has(w, /this\._daySpec = null/, '换图 / 换局重置昼夜快照');
has(html, /六章各有独立的昼夜周期/, '帮助页补充逐章昼夜说明');

console.log('— 2) 真实网格行为（需 three，可跳过） —');
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
    const bar = new THREE.Group(), fill = mk(new THREE.MeshBasicMaterial());
    bar.add(fill);
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

  {
    const f = makeWorld(), m = makeUnitMesh(); f.unitMeshes.set(1, m);
    const u = base({ moving: true, heading: 1.2, feel: { facing: 0.6, step: 0.2, windup: 0, recoil: 0, gait: 1, reload: 1 } });
    f._syncUnit(u, false, false);
    // 朝向目标应取 feel.facing=0.6 而非 u.heading=1.2
    const expectFeel = Math.atan2(-Math.sin(0.6), Math.cos(0.6));
    const expectHead = Math.atan2(-Math.sin(1.2), Math.cos(1.2));
    ok(Math.abs(m.heading - expectFeel * Math.min(1, 0.016 * 11)) < Math.abs(m.heading - expectHead * Math.min(1, 0.016 * 11)),
      '朝向优先跟随 feel.facing（域/兵种限速）');
    ok(Math.abs(m.body.rotation.z - 0.2 * 0.5) < 1e-9, '步态起伏使用 feel.step');
  }
  {
    const f = makeWorld(), m = makeUnitMesh(); f.unitMeshes.set(1, m);
    f._syncUnit(base({ moving: true, heading: 1.2 }), false, false);   // 无 feel
    ok(m.body.rotation.z !== 0.1, '无 feel 时回落到原有硬编码步频');
    ok(Math.abs(m.body.rotation.z) <= 0.035, '回落步频幅度仍在原范围内');
  }
  {
    // 起手 / 后坐：同一攻击状态下，feel 包络改变前冲位移
    const mkAtk = (feel) => {
      const f = makeWorld(), m = makeUnitMesh(); f.unitMeshes.set(1, m);
      f._syncUnit(base({ state: 'attack', atkcd: 1, atkTimer: 0.85, feel }), false, false);
      return m.body.position.x;
    };
    const noFeel = mkAtk(undefined);
    const windup = mkAtk({ facing: 0, step: 0, windup: 0.22, recoil: 0 });
    const recoil = mkAtk({ facing: 0, step: 0, windup: 0, recoil: 1 });
    ok(windup < noFeel, '起手蓄力时向后拉');
    ok(recoil > noFeel, '开火后坐时向前冲');
    ok(recoil > windup, '后坐强于起手');
  }
  {
    // 顿帧期间手感包络同样被冻结
    const f = makeWorld(), m = makeUnitMesh(); f.unitMeshes.set(1, m);
    f._syncUnit(base({ moving: true, feel: { facing: 0, step: 0.24, windup: 0.22, recoil: 1 },
      phys: { dx: 0, dz: 0, mag: 0, env: 0.8, hitstopT: 0.06, shakeT: 0, shake: 0, color: 0xffffff } }), false, false);
    ok(Math.abs(m.body.rotation.z) < 1e-9, '顿帧冻结步态');
    ok(m.body.position.x === 0, '顿帧冻结起手/后坐位移');
  }
  {
    // 相位异常值不炸渲染
    const f = makeWorld(), m = makeUnitMesh(); f.unitMeshes.set(1, m);
    let threw = false;
    try { f._syncUnit(base({ moving: true, feel: { facing: NaN, step: 999, windup: -3, recoil: 50 } }), false, false); }
    catch (_) { threw = true; }
    ok(!threw, '异常手感字段不抛错');
    ok(Math.abs(m.body.rotation.z) <= 0.125 + 1e-9, '步态相位被限幅');
  }
}

if (World && THREE) {
  console.log('— 3) 逐章昼夜：A 侧四相位光照 / 回落路径 —');
  {
    const f = {
      _eraBase: { sun: new THREE.Color(0xffe0a0), hemi: new THREE.Color(0x9aa6a2), bg: new THREE.Color(0x8fb4c8) },
      sun: { color: new THREE.Color(0xffffff), intensity: 1 },
      hemi: { color: new THREE.Color(0xffffff), intensity: 1 },
      scene: { background: null, fog: { color: new THREE.Color(0xffffff) } },
      _applySky() {}, _dayT: 30, _dayPeriod: 200, _daySpec: null,
      dayFactor: 1, dayIcon: '☀', dayPhase: '白昼',
    };
    Object.setPrototypeOf(f, World.prototype);
    f._tickDayNight(0.1);
    ok(f._dayT !== 30, '无 A 侧快照时沿用原有 200s 余弦并推进本地计时');
    const legacyFactor = f.dayFactor, legacyPhase = f.dayPhase;
    ok(legacyPhase.length > 0 && Number.isFinite(legacyFactor), '回落路径仍产出时段与明暗');

    f._daySpec = { intensity: 0.38, sun: 0x8fa8e0, ambient: 0x37405e, sky: 0x0c1226,
      fog: 0x2b3550, label: '夜幕', period: 140, phase: 'night' };
    const t0 = f._dayT;
    f._tickDayNight(0.1);
    ok(f._dayT === t0, '有快照时不再重复累加本地昼夜计时');
    ok(Math.abs(f.dayFactor - 0.16) < 1e-6, '夜幕 intensity 映射到最暗');
    ok(f.dayPhase === '夜幕' && f.dayIcon === '🌑', '时段名称/图标取自 A 侧相位');
    const nightSun = f.sun.color.getHex(), nightBg = f.scene.background.getHex();

    f._daySpec = { intensity: 1.0, sun: 0xfff2d0, ambient: 0x9aa6a2, sky: 0x7fb6d8,
      fog: 0xc8d2cc, label: '正昼', period: 180, phase: 'day' };
    f._tickDayNight(0.1);
    ok(Math.abs(f.dayFactor - 1.0) < 1e-6, '正昼 intensity 映射到最亮');
    ok(f.dayPhase === '正昼' && f.dayIcon === '☀', '正昼时段标签');
    ok(f.sun.color.getHex() !== nightSun, '日光色随相位变化');
    ok(f.scene.background.getHex() !== nightBg, '天色随相位变化');
    ok(f.sun.intensity > 0 && f.hemi.intensity > 0, '光照强度有效');
  }
  {
    // _syncScene 降频拉取时把 info.day 写入 _daySpec
    const f = { _scenePoll: 0, _ambience: null, weatherPts: null, _weatherCfg: null,
      _sceneEvent: null, _daySpec: null };
    Object.setPrototypeOf(f, World.prototype);
    const day = { label: '拂晓', intensity: 0.62, sun: 0xffb877, ambient: 0x6a6480, sky: 0x2b3a5c };
    const sim = { sceneInfo: () => ({ ambience: null, day, event: null }) };
    for (let i = 0; i < 6; i++) f._syncScene(sim);
    ok(f._daySpec === day, 'sceneInfo().day 写入昼夜快照');
    let threw = false;
    try { for (let i = 0; i < 6; i++) f._syncScene({ sceneInfo: () => { throw new Error('x'); } }); } catch (_) { threw = true; }
    ok(!threw, 'sceneInfo 抛错时不崩');
    for (let i = 0; i < 6; i++) f._syncScene({ sceneInfo: () => ({ ambience: null, event: null }) });
    ok(f._daySpec === null, '无 day 字段时清空快照（回落到本地昼夜）');
  }
}

console.log(`\nBATCH20 ${fail === 0 ? 'ALL_PASS' : 'FAILED'}  pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
