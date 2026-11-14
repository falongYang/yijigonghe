/* 批次17 验证：单位层表现（受击物理 / 老兵 / 指令反馈 / 密度 / 尸体演出参数化）
 * 运行：node test-batch17.mjs
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

console.log('— 1) world.js 源码接线审计 —');
const w = read('MVP_Web/js/world.js');
has(w, /const ph = u\.phys/, '读取 A 侧 u.phys 只读包络');
has(w, /m\.group\.position\.x \+= \(Number\(ph\.dx\)/, '方向击退只改渲染位置');
has(w, /hitstopK = clamp\(\(Number\(ph\.hitstopT\)/, '顿帧强度取 hitstopT');
has(w, /const animK = 1 - hitstopK/, '顿帧冻结呼吸/步频/前冲');
has(w, /m\.hitColor = ph\.color/, '记录伤害类型色');
has(w, /setHex\(hc\)/, '受击闪光使用伤害类型色');
has(w, /const vt = u\.vetTier/, '读取老兵阶梯');
has(w, /m\.vetRing\.material\.color\.setHex/, '老兵光晕着色');
has(w, /u\.cmdFlash/, '读取指令反馈');
has(w, /u\.densityBand/, '读取密度分级');
has(w, /const cp = this\._corpseById/, '死亡演出读取尸体快照');
has(w, /const fallK = sp \?/, '倒地时长按 spec.fall');
has(w, /1\.35 \* spin \* sign \* fallK/, '旋转量与倒向按 spec.spin / dir');
has(w, /spec\.scatter|sp\.scatter/, '碎片数按 spec.scatter');
has(w, /typeof sim\.activeCorpses === 'function'/, '尸体接口存在性防御');
has(w, /m\.vetRing\.geometry\.dispose\(\)/, '老兵环逐单位释放');
has(w, /m\.cmdRing\.geometry\.dispose\(\)/, '指令环逐单位释放');

/* ---------------- 真实 three 行为测试 ---------------- */
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
    const bar = new THREE.Group();
    const fill = mk(new THREE.MeshBasicMaterial());
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
      _zones: null, unitMeshes: new Map(), _dying: new Map(), pickables: [], _corpseById: new Map(),
      _eff: [], _lastShake: 0,
      shake(v) { this._lastShake = Math.max(this._lastShake, v); },
      _syncPips() {}, addEffect(t, p) { this._eff.push({ t, p }); },
      _disposeUnitMesh() { this._disposed = (this._disposed || 0) + 1; },
      _footDust() {}, _footBubble() {}, _footRipple() {},
    };
    Object.setPrototypeOf(f, World.prototype);
    return f;
  }
  const baseUnit = (extra = {}) => ({
    id: 1, x: 10, z: 20, side: 'P', caste: 'worker', domain: 'land', heading: 0,
    hp: 100, maxHp: 100, moving: false, state: 'idle', flash: 0, atkcd: 1, atkTimer: 0,
    level: 1, elite: false, burrowed: false, visible: true, buff: {},
    phys: { dx: 0, dz: 0, mag: 0, env: 0, hitstopT: 0, shakeT: 0, shake: 0, color: 0xffffff },
    ...extra,
  });

  console.log('— 2a) 受击物理：方向击退 / 顿帧 / 伤害类型着色 —');
  {
    const f = makeWorld(), m = makeUnitMesh();
    f.unitMeshes.set(1, m);
    const u = baseUnit({ phys: { dx: 1, dz: 0, mag: 1.2, env: 0.8, hitstopT: 0.05, shakeT: 0.1, shake: 0.24, color: 0xff8a5a } });
    f._syncUnit(u, false, true);
    ok(Math.abs(m.group.position.x - (10 + 1 * 1.2 * 0.8 * 1.6)) < 1e-6, '沿 dx 方向击退，且不回写 sim 坐标');
    ok(u.x === 10 && u.z === 20, 'sim 坐标保持不变');
    ok(Math.abs(m.group.position.z - 20) < 1e-6, 'dz=0 时 z 不偏移');
    ok(m.hitEnv === 0.8 && m.hitColor === 0xff8a5a, '记录受击包络与伤害色');
    ok(f._lastShake > 0, '重击触发镜头冲击');
    ok(m.body.material.emissive.getHex() === 0xff8a5a, '受击闪光使用轰炸橙红');
    ok(m.body.scale.x < 1.05, '顿帧期间步频/呼吸被冻结（缩放未被振荡放大）');
  }
  {
    const f = makeWorld(), m = makeUnitMesh();
    f.unitMeshes.set(1, m);
    f._syncUnit(baseUnit({ flash: 0.1 }), false, false);
    ok(m.body.material.emissive.getHex() === 0xffffff, '无 phys 时保持原有闪白行为（向后兼容）');
  }

  console.log('— 2b) 老兵阶梯 / 指令反馈 / 聚簇密度 —');
  {
    const f = makeWorld(), m = makeUnitMesh();
    f.unitMeshes.set(1, m);
    f._syncUnit(baseUnit({ vetTier: { tier: 2, name: '精锐', glow: 0xffd24a, scale: 1.08, prog: 0.4 }, cmdFlash: 0.6, densityBand: 3 }), false, false);
    ok(m.vetRing.visible === true, '精锐显示光晕环');
    ok(m.vetRing.material.color.getHex() === 0xffd24a, '光晕按阶梯配色');
    ok(m.vetTier === 2, '阶梯写入网格记录');
    ok(m.cmdRing.visible === true && m.cmdRing.material.opacity > 0.4, '指令反馈环点亮');
    ok(m.cmdRing.scale.x > m.ring.scale.x * 0.9, '指令环随衰减向外扩散');
    const m2 = makeUnitMesh(); f.unitMeshes.set(2, m2);
    f._syncUnit(baseUnit({ id: 2, vetTier: null, cmdFlash: 0, densityBand: 0 }), false, false);
    ok(m2.vetRing.visible === false && m2.cmdRing.visible === false, '新兵 / 无指令时不显示额外环');
    // 密度对比需固定其它变量（老兵缩放会盖过密度差异）
    const mDense = makeUnitMesh(); f.unitMeshes.set(3, mDense);
    f._syncUnit(baseUnit({ id: 3, vetTier: null, cmdFlash: 0, densityBand: 3 }), false, false);
    const mSparse = makeUnitMesh(); f.unitMeshes.set(4, mSparse);
    f._syncUnit(baseUnit({ id: 4, vetTier: null, cmdFlash: 0, densityBand: 0 }), false, false);
    ok(mSparse.body.scale.x > mDense.body.scale.x, '密集集群视觉挤压（散兵模型更大）');
  }

  console.log('— 2c) 尸体快照参数化死亡演出 —');
  {
    const f = makeWorld(), m = makeUnitMesh();
    f.unitMeshes.set(1, m);
    f._corpseById.set(1, { id: 1, domain: 'land', dir: { x: -1, z: 0.5 }, spec: { fall: 0.42, sink: 1.1, fade: 1.6, spin: 1, scatter: 3 } });
    f.removeUnit(1);
    const rec = f._dying.get(1);
    ok(!!rec && !!rec.cp, 'removeUnit 挂上尸体快照');
    ok(m.vetRing.visible === false && m.cmdRing.visible === false, '演出期间隐藏新增环');
    f.time = 10.2; f._updateDying(0.016);
    ok(m.group.rotation.z < 0, '倒向继承最后一击 dx<0 → 向左侧翻');
    ok(f._eff.length === 3, '按 spec.scatter 一次性生成 3 个碎片');
    const effLen = f._eff.length;
    f.time = 10.4; f._updateDying(0.016);
    ok(f._eff.length === effLen, '碎片不逐帧重复生成');
    f.time = 11.7; f._updateDying(0.016);
    ok(!f._dying.has(1) && f._disposed === 1, 'fade=1.6s 后释放网格');
  }
  {
    const f = makeWorld(), m = makeUnitMesh();
    f.unitMeshes.set(1, m);
    f.removeUnit(1);              // 无尸体快照
    f.time = 10.2; f._updateDying(0.016);
    ok(m.group.rotation.z > 0, '无快照时保持默认右侧翻演出');
    f.time = 10.6; f._updateDying(0.016);
    ok(!f._dying.has(1), '无快照时 0.55s 默认时长回收');
  }
  {
    const f = makeWorld(), m = makeUnitMesh();
    f.unitMeshes.set(1, m);
    f._corpseById.set(1, { id: 1, domain: 'sea', dir: { x: 1, z: 0 }, spec: { fall: 0.3, sink: 1.6, fade: 2.0, spin: 0.6, scatter: 2 } });
    f.removeUnit(1);
    f.time = 10.1; f._updateDying(0.016);
    ok(f._eff.length === 2 && f._eff.every(e => e.t === 'bubble'), '海域尸体生成气泡而非尘土');
  }
}

console.log('— 3) 选中卡 / 帮助页 / 样式接线审计 —');
const u = read('MVP_Web/js/ui.js');
const html = read('MVP_Web/index.html');
const css = read('MVP_Web/css/style.css');
has(u, /const vt = u\.vetTier/, '选中卡读取老兵阶梯');
has(u, /\$\{vetHtml\}\$\{densityHtml\}/, '选中卡渲染战绩与密度提示');
has(u, /xpbar vetbar/, '战绩进度条使用独立样式类');
has(u, /vt\.name \|\| '老兵'/, '老兵称号带兜底');
has(u, /vt\.glow/, '阶梯辉光色同步到卡片');
has(css, /\.xpbar\.vetbar/, 'CSS 定义老兵进度条');
has(html, /老兵阶梯/, '帮助页补充老兵说明');
has(html, /伤害类型闪出不同颜色/, '帮助页补充受击反馈说明');
has(html, /指令反馈环/, '帮助页补充指令反馈说明');

console.log(`\nBATCH17 ${fail === 0 ? 'ALL_PASS' : 'FAILED'}  pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
