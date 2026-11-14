/* 批次28 验证：消费 A 侧「细节九·受击反馈强化与战术机动意图表现层」
 * 运行：node test-batch28.mjs
 * 源码接线审计 + 真实 Simulation 只读数据 + World/UI 原型方法行为测试。
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
const uiSrc = read('MVP_Web/js/ui.js');
const html = read('MVP_Web/index.html');
const css = read('MVP_Web/css/style.css');

console.log('— 1) 接线审计 —');
has(world, /UNIT_INTENT,[\s\S]{0,120}from '\.\/rts\.js'/, 'world 引入 A 侧意图规格表');
has(world, /const INTENT_RING = \{/, '定义 B 侧意图环视觉参数');
has(world, /const alertRing = new THREE\.Mesh/, 'spawnUnit 创建受击威胁环');
has(world, /alertRing,/, '威胁环写入单位渲染记录');
has(world, /moraleK: 1, intentKey: 'hold'/, '单位记录初始化低士气与意图缓存');
has(world, /if \(m\.alertRing\) m\.alertRing\.visible = false/, '死亡演出隐藏威胁环');
has(world, /if \(m\.alertRing\) \{ m\.alertRing\.geometry\.dispose\(\)/, '释放威胁环几何与材质');
has(world, /_syncFeedback\(m, u\) \{/, '定义只读反馈同步方法');
has(world, /this\._syncFeedback\(m, u\);/, '_syncUnit 每帧调用反馈同步');
has(world, /Number\(u\.underFire\) \|\| 0/, '读受击衰减量');
has(world, /Number\(u\.flankMark\) \|\| 0/, '读侧翼标记衰减量');
has(world, /u\.lowMorale \? 0\.92 : 1/, '低士气缩肩有阻尼目标');
has(world, /UNIT_INTENT\[u\.moveIntent\]/, '意图键只用于查规格表');
has(world, /ar\.material\.color\.setHex\(flanking \? 0xff8a4a : 0xff5a4a\)/, '侧翼橙色 / 普通受击红色');
has(world, /m\.body\.scale\.multiplyScalar\(m\.moraleK\)/, '低士气与既有缩放相乘');
has(world, /Number\.isFinite\(u\.hpRatio\) \? u\.hpRatio/, '血条优先读 A 侧实时血比');
has(world, /m\.ring\.material\.color\.set\(col \? col\.color/, '选中环按 A 侧意图规格着色');
has(world, /spec\.opacity \* \(spec\.pulse/, '突进 / 包抄选中环带脉冲');
has(world, /: \(m\.side === SIDES\.PLAYER \? 0x7ef0ff : 0xffb070\)/, '缺意图字段回落阵营色');
has(uiSrc, /import \{ SIDES, UNIT_INTENT \} from '\.\/rts\.js'/, 'ui 引入意图规格表');
has(uiSrc, /class="ui-intent"/, '选中卡输出意图徽标');
has(uiSrc, /战场反馈/, '选中卡输出受击反馈行');
has(uiSrc, /被火力压制/, '被火力覆盖标签');
has(uiSrc, /侧翼包抄中/, '侧翼包抄标签');
has(uiSrc, /低士气/, '低士气标签');
has(uiSrc, /\$\{intentHtml\}\$\{feedbackHtml\}/, '两段 HTML 插入卡片模板');
has(css, /\.ui-intent::before/, '意图徽标色点样式');
has(html, /战术机动意图/, '帮助页补充意图说明');
has(html, /威胁环/, '帮助页补充受击反馈说明');

console.log('— 2) A 侧只读面 —');
const { Simulation } = await import('./MVP_Web/js/sim.js');
const { UNIT_INTENT, intentSpec } = await import('./MVP_Web/js/rts.js');
const sim = new Simulation();
sim.reset('SP01', { mode: 'skirmish', difficulty: 'normal' });
const u0 = sim.units[0];
ok(!!u0, '开局存在可观察单位');
for (const k of ['underFire', 'flankMark', 'lowMorale', 'moveIntent', 'hpRatio']) {
  ok(k in u0, `单位含只读字段 ${k}`);
}
ok(typeof u0.moveIntent === 'string' && !!UNIT_INTENT[u0.moveIntent], '初始意图在规格表内');
ok(Object.keys(UNIT_INTENT).length === 8, '意图规格共 8 类');
ok(Object.values(UNIT_INTENT).every(v => typeof v.label === 'string' && Number.isFinite(v.color)), '每类意图都有中文标签与颜色');
ok(intentSpec('flank').label === '包抄' && intentSpec('__unknown__').label === '据守', 'intentSpec 未知键回落到据守规格');
ok(sim.intentSpec('charge').label === '突进', 'sim 透出 intentSpec 只读查询');
const fb = sim.feedbackOf(u0.id);
ok(!!fb && Number.isFinite(fb.hpRatio) && typeof fb.underFire === 'boolean' && typeof fb.lowMorale === 'boolean',
  'feedbackOf 聚合包字段完整');
ok(sim.feedbackOf(999999) === null, 'feedbackOf 未知单位返回 null');
const feel = sim.feelOf(u0.id);
ok(!!feel && 'moveIntent' in feel && 'underFire' in feel && 'flankMark' in feel && 'lowMorale' in feel && 'hpRatio' in feel,
  'feelOf 快照并入细节九五字段');
const intentKeys = [...world.matchAll(/^\s{2}(\w+):\s*\{ pulse:/gm)].map(m => m[1]);
ok(intentKeys.length === 8 && Object.keys(UNIT_INTENT).every(k => intentKeys.includes(k)),
  'B 侧 INTENT_RING 与 A 侧 8 类意图逐项对齐');

console.log('— 3) World 反馈同步真实行为 —');
try {
  const THREE = await import('three');
  const { World } = await import('./MVP_Web/js/world.js');
  const mk = () => {
    const w = Object.create(World.prototype);
    w.time = 1.25; w._frameDt = 0.016;
    const ar = new THREE.Mesh(new THREE.RingGeometry(1, 1.2, 20), new THREE.MeshBasicMaterial({ transparent: true }));
    const body = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const m = { alertRing: ar, body, moraleK: 1, intentKey: 'hold' };
    return { w, m, ar, body };
  };
  const unit = (over = {}) => ({
    id: 7, hp: 100, caste: 'worker', underFire: 0, flankMark: 0,
    lowMorale: false, moveIntent: 'hold', hpRatio: 1, ...over,
  });

  const { w, m, ar, body } = mk();
  w._syncFeedback(m, unit({ underFire: 1, moveIntent: 'charge', lowMorale: true }));
  ok(ar.visible === true, '真实命中点亮威胁环');
  ok(ar.material.color.getHex() === 0xff5a4a, '普通受击为红色');
  ok(ar.material.opacity > 0.1, '受击环按衰减量给出可见不透明度');
  ok(m.intentKey === 'charge', '意图键写入渲染记录');
  ok(Number.isFinite(m.moraleK) && m.moraleK < 1, '低士气触发阻尼缩肩');
  ok(body.scale.x < 1 && body.scale.y < 1, '缩肩作用于本体缩放');

  const f = mk();
  f.w._syncFeedback(f.m, unit({ underFire: 0.4, flankMark: 0.9, moveIntent: 'flank' }));
  ok(f.ar.material.color.getHex() === 0xff8a4a, '侧翼包抄优先显示橙色');
  ok(f.ar.scale.x > 2.6 * 0.92, '侧翼包抄环略放大');
  ok(f.m.intentKey === 'flank', '包抄意图键正确');

  // 衰减到 0 后收起；低士气解除后体型平滑回正
  w._syncFeedback(m, unit({ underFire: 0, flankMark: 0 }));
  ok(ar.visible === false, '受击衰减结束后威胁环隐藏');
  let last = m.moraleK;
  // 真实 _syncUnit 每帧先重置 body.scale，再叠加各类缩放；夹具按同样顺序模拟
  for (let i = 0; i < 30; i++) { body.scale.set(1, 1, 1); w._syncFeedback(m, unit()); }
  ok(m.moraleK > last && Math.abs(m.moraleK - 1) < 0.02, '低士气解除后体型平滑恢复');
  ok(Math.abs(body.scale.x - m.moraleK) < 1e-6, '每帧缩放不累积放大');

  // 缺字段 / 异常类型必须完全回落
  let threw = null;
  try { w._syncFeedback(m, {}); w._syncFeedback(m, unit({ underFire: 'oops', flankMark: NaN, moveIntent: 123 })); }
  catch (e) { threw = e; }
  ok(!threw, '字段缺失 / 类型异常不抛错');
  ok(ar.visible === false && m.intentKey === 'hold', '异常输入回落到旧表现');
  ok(m.moraleK > 0.9, '异常输入不会把体型压到 0');

  // 死亡演出与网格释放
  const d = mk();
  const scene = new THREE.Scene();
  scene.add(d.m.body);
  d.w.scene = scene;
  let geoDisposed = 0, matDisposed = 0;
  d.ar.geometry.dispose = () => { geoDisposed++; };
  d.ar.material.dispose = () => { matDisposed++; };
  d.w._disposeUnitMesh({ group: new THREE.Group(), alertRing: d.ar });
  ok(geoDisposed === 1 && matDisposed === 1, '单位销毁时释放威胁环几何与材质');

  const r = mk();
  r.w.scene = scene;
  r.w.unitMeshes = new Map([['u1', r.m]]);
  r.w._dying = new Map();
  r.w.pickables = [r.m.body];
  r.w._corpseById = null;
  r.ar.visible = true;
  r.w.removeUnit('u1');
  ok(r.ar.visible === false, '进入死亡演出时威胁环收起');
  ok(r.w._dying.has('u1'), '死亡演出队列正常写入');

  console.log('— 4) UI 选中卡（真实 Simulation 单位） —');
  const { UI } = await import('./MVP_Web/js/ui.js');
  const ui = Object.create(UI.prototype);
  ui.sim = sim;
  const card = u => ui._unitDetail(u);
  u0.moveIntent = 'flank';
  u0.underFire = 1; u0.flankMark = 0.8; u0.lowMorale = true;
  const full = card(u0);
  ok(full.includes('机动意图') && full.includes('包抄'), '选中卡显示意图标签');
  ok(full.includes('ui-intent') && full.includes('--ic:#ff8a4a'), '意图徽标使用 A 侧规格色');
  ok(full.includes('被火力压制') && full.includes('侧翼包抄中') && full.includes('低士气'), '选中卡显示三类战场反馈');
  u0.moveIntent = 'dead'; u0.underFire = 0; u0.flankMark = 0; u0.lowMorale = false;
  const quiet = card(u0);
  ok(quiet.includes('机动意图') && quiet.includes('阵亡'), '阵亡意图也按规格显示');
  ok(!quiet.includes('战场反馈'), '无受击反馈时不渲染空行');
  u0.moveIntent = undefined;
  const legacy = card(u0);
  ok(!legacy.includes('机动意图'), '缺意图字段时回落旧卡片');
  u0.moveIntent = '<img src=x onerror=alert(1)>';
  const injected = card(u0);
  ok(!injected.includes('<img') && !injected.includes('onerror'), '意图字段不直接拼进 HTML（无注入面）');
  u0.moveIntent = 'hold';
} catch (e) {
  console.log('  ! three / UI 行为测试异常：' + (e && e.stack ? e.stack : e));
  fail++;
}

console.log(`\nBATCH28 ${fail === 0 ? 'ALL_PASS' : 'FAILED'}  pass=${pass} fail=${fail}`);
if (fail) process.exitCode = 1;
