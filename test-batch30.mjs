/* 批次30 验证：消费 A 侧「细节十·战场态势感知包」
 * 运行：node test-batch30.mjs
 * 源码接线审计 + 真实 Simulation 只读查询 + World/UI/Sound 行为测试。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const has = (s, re, m) => ok(re.test(s), m);

const main = read('MVP_Web/js/main.js');
const world = read('MVP_Web/js/world.js');
const uiSrc = read('MVP_Web/js/ui.js');
const audio = read('MVP_Web/js/audio.js');
const html = read('MVP_Web/index.html');
const css = read('MVP_Web/css/style.css');

console.log('— 1) 接线审计 —');
has(main, /sim\.threatAt\(world\.cam\.tx, world\.cam\.tz, SIDES\.PLAYER, 18\)/, '主循环按镜头中心采样威胁压强');
has(main, /sim\.battlePulse\(\)/, '主循环读全局战斗能量脉冲');
has(main, /world\.setThreat\(game\.threat, game\.pulse\)/, '分发到 3D 镜头');
has(main, /ui\.setThreat\(game\.threat, game\.pulse\)/, '分发到 HUD');
has(main, /Sound\.setThreat\(game\.threat, game\.pulse\)/, '分发到程序化音频');
has(main, /if \(frameNo % 6 === 0\) \{[\s\S]{0,700}let threat = 0, pulse = 0/, '与热度同拍 6 帧降频采样');
has(main, /catch \(_\) \{ threat = 0; pulse = 0; \}/, '只读查询抛错按 0 回落');
has(world, /setThreat\(value, pulse = 0\) \{/, 'world 定义态势入口');
has(world, /this\._threat = Number\.isFinite\(t\) \? clamp\(t, 0, 1\) : 0/, '威胁值限幅');
has(world, /pv > 0\.55 && pv - prev > 0\.12 && now - \(Number\(this\._pulseShakeAt\) \|\| -99\) > 1\.2/, '脉冲只在上升沿且节流触发');
has(world, /this\.shake\(0\.22 \+ 0\.3 \* this\._threat\)/, '脉冲带来极轻微震动');
has(uiSrc, /setThreat\(value, pulse = 0\) \{/, 'ui 定义态势入口');
has(uiSrc, /document\.getElementById\('threat-veil'\)/, '驱动危险晕影层');
has(uiSrc, /if \(this\._threatOp !== op\)/, '晕影透明度变化才写入');
has(uiSrc, /class="fs-threat"/, '态势条追加威胁压强细条');
has(uiSrc, /this\.sim\.densityBreakdown\(u\.id\)/, '选中卡读聚簇细分');
has(uiSrc, /now - this\._crowd\.t > 350/, '聚簇细分 350ms 缓存');
has(uiSrc, /String\(k\)\.replace\(\/\[<>&"'\]/, '状态键做 HTML 清洗');
has(audio, /let threatLevel = 0, pulseLevel = 0/, '音频记录态势');
has(audio, /setThreat\(t, p\) \{/, '音频态势入口');
has(audio, /\(1 - 0\.38 \* threatLevel\)/, '高威胁压低蚁巢底噪');
has(audio, /\(1 \+ 0\.12 \* pulseLevel\)/, '战斗脉冲轻微抬升提示音');
has(html, /id="threat-veil"/, '页面新增威胁晕影层');
has(css, /#threat-veil \{/, '晕影层样式');
has(css, /prefers-reduced-motion: reduce\) \{ #threat-veil/, '减少动态效果时关闭过渡');
has(css, /#front-status \.fs-threat/, '威胁细条样式');
has(html, /暗红威胁晕影/, '帮助页补充态势说明');

console.log('— 2) A 侧只读查询 —');
const { Simulation } = await import('./MVP_Web/js/sim.js');
const { SIDES } = await import('./MVP_Web/js/rts.js');
const sim = new Simulation();
sim.reset('SP01', { mode: 'skirmish', difficulty: 'normal' });
const u0 = sim.units[0];
const t0 = sim.threatAt(0, 0, SIDES.PLAYER);
ok(Number.isFinite(t0) && t0 >= 0 && t0 <= 1, 'threatAt 返回 0..1 有限数');
ok(Number.isFinite(sim.threatAt(0, 0, SIDES.PLAYER, 5)), '自定义半径可用');
const bp = sim.battlePulse();
ok(Number.isFinite(bp) && bp >= 0 && bp <= 1, 'battlePulse 返回 0..1 有限数');
const db = sim.densityBreakdown(u0.id);
ok(!!db && Number.isFinite(db.allies) && Number.isFinite(db.enemies) && Number.isFinite(db.total), '聚簇细分含阵营计数');
ok(!!db.byState && typeof db.byState === 'object' && Array.isArray(db.banded) && db.banded.length === 4, '聚簇细分含状态与分档');
ok(sim.densityBreakdown(999999) === null, '未知单位返回 null');
const cf = sim.concentratedFireOf(u0.id);
ok(Number.isFinite(cf) && cf >= 0 && cf <= 1, 'concentratedFireOf 返回 0..1');
ok(sim.concentratedFireOf(999999) === 0, '未知单位集火度为 0');
for (let i = 0; i < 12; i++) sim.tick(1 / 30);
ok(Number.isFinite(sim.battlePulse()), '推进模拟后脉冲仍为有限数');

console.log('— 3) World / UI / Sound 行为 —');
try {
  const { World } = await import('./MVP_Web/js/world.js');
  const { UI } = await import('./MVP_Web/js/ui.js');
  const { Sound } = await import('./MVP_Web/js/audio.js');
  const { Simulation: Sim2 } = await import('./MVP_Web/js/sim.js');
  const sim2 = new Sim2();
  sim2.reset('SP01', { mode: 'skirmish', difficulty: 'normal' });

  const w = Object.create(World.prototype);
  w.time = 0; w._shake = 0; w.cam = { dist: 150, tx: 0, tz: 0 };
  w.setThreat(0.8, 0.9);
  ok(w._threat === 0.8, '威胁值写入渲染层');
  ok(w._shake > 0 && w._shake < 1, '脉冲上升沿触发极轻微震动');
  ok(w.cam.dist === 150, '不改动相机距离 / 滚轮目标');
  const shakeAt = w._pulseShakeAt, shakeMag = w._shake;
  w.setThreat(0.9, 0.95);
  ok(w._pulseShakeAt === shakeAt && w._shake === shakeMag, '节流窗口内不重复震动');
  w.setThreat(0.2, 0.1); w.time = 2;
  w.setThreat(0.9, 0.8);
  ok(w._pulseShakeAt === 2, '节流过后新上升沿可再次触发');
  let threw = null;
  try { w.setThreat('oops', NaN); w.setThreat(null, undefined); } catch (e) { threw = e; }
  ok(!threw && w._threat === 0, '非法入参按 0 回落且不抛错');

  const savedDoc = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const veil = { style: { opacity: '' }, classList: { add() {}, remove() {} } };
  const front = { innerHTML: '', classList: { remove() {} } };
  let writes = 0;
  Object.defineProperty(veil.style, 'opacity', {
    configurable: true,
    get() { return this._v; },
    set(v) { writes++; this._v = v; },
  });
  globalThis.document = {
    getElementById: id => id === 'threat-veil' ? veil : (id === 'front-status' ? front : null),
    querySelector: () => null,
  };
  const ui = Object.create(UI.prototype);
  ui.sim = sim2;
  ui.setThreat(0.5, 0.2);
  ok(ui._threat === 0.5 && ui._pulse === 0.2, 'HUD 记录态势值');
  ok(veil.style.opacity === '0.23', '晕影透明度按 threat*0.42 + pulse*0.10 计算');
  const w0 = writes;
  ui.setThreat(0.5, 0.2);
  ok(writes === w0, '同值不重复写 DOM');
  ui.setThreat(0, 0);
  ok(veil.style.opacity === '0.00' && writes === w0 + 1, '威胁解除后晕影归零');
  ui.setThreat(0.7, 0.3);
  ui._updateFrontStatus(sim2);
  ok(front.innerHTML.includes('fs-threat') && front.innerHTML.includes('威胁 70%'), '态势条追加威胁压强');
  ok(front.innerHTML.includes('脉冲 30%'), '态势条显示战斗脉冲读数');
  ok(front.innerHTML.includes('width:70%'), '威胁条宽度随读数变化');

  const cu = sim2.units[0];
  const origDB = sim2.densityBreakdown;
  // 开局单位周围未必有邻居，用可控快照验证细分渲染（真实查询已在第 2 节验证）
  sim2.densityBreakdown = () => ({ allies: 3, enemies: 2, total: 5, byState: { idle: 3, move: 2 }, banded: [0, 5, 0, 0] });
  ui._crowd = null;
  const card = ui._unitDetail(cu);
  ok(card.includes('周边聚簇') && card.includes('我方 3') && card.includes('敌方 2'), '选中卡显示聚簇细分');
  ok(card.includes('待命 3') && card.includes('移动 2'), '细分按状态给出中文标签');
  sim2.densityBreakdown = () => ({ allies: 1, enemies: 2, total: 3, byState: { '<img src=x>': 3 }, banded: [0, 0, 0, 3] });
  ui._crowd = null;
  const evil = ui._unitDetail(cu);
  ok(!evil.includes('<img') && evil.includes('周边聚簇'), '异常状态键被清洗且卡片不中断');
  sim2.densityBreakdown = () => null;
  ui._crowd = null;
  ok(!ui._unitDetail(cu).includes('周边聚簇'), '细分查询返回空时不渲染空行');
  sim2.densityBreakdown = () => { throw new Error('boom'); };
  ui._crowd = null;
  let noThrow = true;
  try { ui._unitDetail(cu); } catch { noThrow = false; }
  ok(noThrow, '只读查询抛错不影响选中卡');
  sim2.densityBreakdown = origDB;

  Sound.setThreat(0.6, 0.4);
  ok(Sound.threat === 0.6 && Sound.pulse === 0.4, '音频接收态势值');
  Sound.setThreat('bad', -3);
  ok(Sound.threat === 0 && Sound.pulse === 0, '音频非法入参回落到 0');
  Sound.setThreat(0, 0);

  if (savedDoc) Object.defineProperty(globalThis, 'document', savedDoc);
  else delete globalThis.document;
} catch (e) {
  console.log('  ! 行为测试异常：' + (e && e.stack ? e.stack : e));
  fail++;
}

console.log(`\nBATCH30 ${fail === 0 ? 'ALL_PASS' : 'FAILED'}  pass=${pass} fail=${fail}`);
if (fail) process.exitCode = 1;
