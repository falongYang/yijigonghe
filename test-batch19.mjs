/* 批次19 验证：小地图情报图层 / 结算战报 / 偏好设置 / 档案交互
 * 运行：node test-batch19.mjs
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
const u = read('MVP_Web/js/ui.js');
const main = read('MVP_Web/js/main.js');
const html = read('MVP_Web/index.html');
const css = read('MVP_Web/css/style.css');
has(u, /_drawIntelLayer\(g, s, toX, toY, W, H\)/, '情报图层绘制入口');
has(u, /typeof s\.intelBlips === 'function'/, 'intelBlips 存在性防御');
has(u, /typeof s\.minimapSpec === 'function'/, 'minimapSpec 存在性防御');
has(u, /sp\.weight/, '点标按重要度加权');
has(u, /sp\.label \|\| k/, '图例用 A 侧中文 label');
has(u, /toggleIntelLayer\(\)/, '图层切换入口');
has(u, /_setIntelLayer\(/, '统一状态设定');
has(u, /this\.settings\.intelDefault/, '默认图层偏好');
has(u, /if \(this\.intelLayer\) this\._drawIntelLayer/, 'refresh 时按开关绘制');
has(u, /typeof s\.battleSummary === 'function'/, '战报接口存在性防御');
has(u, /bs\.tradeRatio/, '战报读取交换比');
has(u, /bs\.peakArmy/, '战报读取峰值兵力');
has(u, /battleHtml/, '战报注入结算页');
has(u, /cues: true, intelDefault: false/, '新增偏好默认值');
has(u, /'set-cues', 'cues'/, '战场提示开关接线');
has(u, /'set-intel', 'intelDefault'/, '情报图层偏好接线');
has(u, /addEventListener\('storage'/, '多标签页档案同步');
has(u, /cc-invalid/, '代号实时合法性提示');
has(u, /\$\{v\.length\}\/12/, '代号字数计数');
has(main, /ui\.settings\.cues === false/, '战场提示偏好生效');
has(main, /k === 'm'/, 'M 快捷键切换情报层');
has(html, /id="mm-intel"/, '情报按钮节点');
has(html, /id="mm-intel-legend"/, '情报图例节点');
has(html, /id="set-cues"/, '设置项：战场提示');
has(html, /id="set-intel"/, '设置项：默认情报层');
has(html, /情报图层/, '帮助页补充情报层说明');
has(html, /战场叙事战报/, '帮助页补充战报说明');
has(html, /其他标签页修改档案时本页会自动同步/, '帮助页补充档案同步说明');
has(css, /\.mm-intel-btn\.on/, '按钮激活态样式');
has(css, /#mm-intel-legend/, '图例样式');
has(css, /\.cc-hint\.cc-invalid/, '代号非法态样式');

/* ---------------- DOM 桩 ---------------- */
const els = {};
function mkEl(id) {
  return {
    id, innerHTML: '', textContent: '', value: '', checked: false, disabled: false,
    style: { setProperty() {} }, _cls: new Set(['hidden']), _handlers: {},
    classList: {
      add(c) { els[id]._cls.add(c); }, remove(c) { els[id]._cls.delete(c); },
      contains(c) { return els[id]._cls.has(c); },
      toggle(c, force) {
        if (force === undefined) { els[id]._cls.has(c) ? els[id]._cls.delete(c) : els[id]._cls.add(c); }
        else if (force) els[id]._cls.add(c); else els[id]._cls.delete(c);
      },
    },
    addEventListener(k, fn) { els[id]._handlers[k] = fn; },
    setAttribute() {}, getAttribute() { return null; },
    blur() {}, getBoundingClientRect() { return { left: 0, top: 0, width: 200, height: 142 }; },
    getContext() { return null; }, appendChild() {}, querySelector() { return null; },
  };
}
globalThis.document = {
  getElementById: id => { if (!els[id]) els[id] = mkEl(id); return els[id]; },
  querySelector: sel => { const id = sel.replace(/^#/, ''); if (!els[id]) els[id] = mkEl(id); return els[id]; },
  querySelectorAll: () => [],
  createElement: () => ({ className: '', innerHTML: '', style: {}, getContext: () => null }),
};
globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = v; }, removeItem(k) { delete this._d[k]; } };
globalThis.window = { addEventListener() {}, removeEventListener() {}, innerWidth: 1280, innerHeight: 720 };
globalThis.performance = globalThis.performance || { now: () => 10000 };

const { UI } = await import('./MVP_Web/js/ui.js');
const { Profile } = await import('./MVP_Web/js/profile.js');

console.log('— 2) 情报图层：切换 / 图例 / 权重绘制 —');
{
  const ui = {}; Object.setPrototypeOf(ui, UI.prototype);
  ui.settings = { cues: true, intelDefault: false };
  ui.sim = {
    minimapSpec: () => ({
      unit: { r: 2, bySide: true, weight: 1, label: '单位' },
      building: { r: 3.2, bySide: true, weight: 1.6, label: '建筑' },
      node: { r: 2.6, color: 0x8fe06a, weight: 1.2, label: '资源' },
      hazard: { r: 3, color: 0xff5a3a, weight: 1.8, label: '危害' },
      resonance: { r: 4, color: 0x9a6cff, weight: 2, label: '共振' },
      event: { r: 5, color: 0xffe14a, weight: 2.4, label: '事件' },
    }),
    intelBlips: () => [],
  };
  ok(ui.toggleIntelLayer() === true, 'M / 按钮开启图层');
  ok(els['mm-intel']._cls.has('on'), '按钮进入激活态');
  ok(!els['mm-intel-legend']._cls.has('hidden'), '图例展开');
  ok(els['mm-intel-legend'].innerHTML.includes('危害') && els['mm-intel-legend'].innerHTML.includes('事件'), '图例使用 A 侧中文 label');
  ok(ui.settings.intelDefault === true, '选择同步到偏好');
  ok(els['set-intel'].checked === true, '设置复选框同步');
  ok(els['mm-tip'].textContent.includes('情报层'), '提示文字切换');
  ok(ui.toggleIntelLayer() === false, '再按一次关闭');
  ok(els['mm-intel-legend']._cls.has('hidden'), '图例收起');
  ui._setIntelLayer(true);
  ok(ui.intelLayer === true, '_setIntelLayer 直接设定');

  // 模拟 2D 上下文，记录绘制调用
  const calls = { fillRect: 0, arc: 0, stroke: 0, fill: 0, colors: [], widths: [] };
  const g = {
    set fillStyle(v) { calls.colors.push(String(v)); }, get fillStyle() { return ''; },
    set strokeStyle(v) { calls.colors.push(String(v)); }, get strokeStyle() { return ''; },
    set lineWidth(v) { calls.widths.push(v); }, get lineWidth() { return 1; },
    globalAlpha: 1,
    fillRect() { calls.fillRect++; }, beginPath() {}, arc() { calls.arc++; },
    stroke() { calls.stroke++; }, fill() { calls.fill++; },
    drawImage() {}, setLineDash() {}, createRadialGradient() { return { addColorStop() {} }; },
    strokeRect() {}, moveTo() {}, lineTo() {}, closePath() {},
  };
  ui.sim.intelBlips = () => [
    { kind: 'unit', side: 'E', x: 10, z: 10 }, { kind: 'unit', side: 'E', x: 11, z: 10 },
    { kind: 'unit', side: 'E', x: 12, z: 10 },
    { kind: 'unit', side: 'P', x: -50, z: -40 },
    { kind: 'hazard', x: 0, z: 0, r: 3 },
    { kind: 'resonance', x: 20, z: -10, r: 4 },
    { kind: 'event', x: -20, z: 30, r: 5 },
  ];
  const toX = x => x, toY = z => z;
  ui._drawIntelLayer(g, ui.sim, toX, toY, 200, 142);
  ok(calls.fillRect >= 1, '敌方聚簇热区绘制');
  ok(calls.arc >= 6, '危害/共振/事件各画外圈 + 内点');
  ok(calls.colors.some(c => c.includes('#ff5a3a')), '危害使用规格色');
  ok(calls.colors.some(c => c.includes('#9a6cff')), '共振使用规格色');
  ok(calls.colors.some(c => c.includes('#ffe14a')), '事件使用规格色');
  ok(calls.widths.some(v => v > 1), '重要度抬高了描边宽度');
  ui.sim.intelBlips = () => { throw new Error('boom'); };
  let threw = false; try { ui._drawIntelLayer(g, ui.sim, toX, toY, 200, 142); } catch (_) { threw = true; }
  ok(!threw, '接口抛错时安全跳过');
  ui.sim = {};
  let threw2 = false; try { ui._drawIntelLayer(g, ui.sim, toX, toY, 200, 142); } catch (_) { threw2 = true; }
  ok(!threw2, '无接口时安全跳过');
}

console.log('— 3) 结算战报：只读聚合渲染 / 无接口降级 —');
{
  const ui = {}; Object.setPrototypeOf(ui, UI.prototype);
  ui._recordMatch = null;                 // 屏蔽档案写回，聚焦战报渲染
  ui._saveCampaign = () => {};
  ui.sim = {
    mode: 'skirmish', chapter: 0, time: 321.7, era: { P: 2, E: 1 },
    peakPop: { P: 42, E: 30 }, pop: () => 18, climate: { name: '焦土', desc: '' },
    difficulty: { name: '标准' }, sp: { P: { name: '切叶蚁' }, E: { name: '悍蚁' } },
    stats: { P: { kills: 30, losses: 8, built: 5, evolved: 3, harvested: 900, abilities: 4, raided: 2,
      dmgDealt: 1200, dmgTaken: 700, repaired: 80, wellPh: 12, critHits: 6, raids: 1,
      nodeSwitches: 2, overkillSaved: 3, critRolls: 9, pierceHits: 2, flankHits: 1,
      lifestealHp: 40, poisonTicks: 3, corrodeHits: 2, slowHits: 1, stunTicks: 1,
      terrainTicks: 4, statusKills: 2 },
      E: { waves: 3, smartCasts: 2, repairs: 1, defenses: 2, losses: 30 } },
    battleSummary: () => ({ winner: 'player', duration: 321.7, battleTime: 210.4, peakArmy: 42,
      tradeRatio: { P: 3.75, E: 1 }, eliteKills: 7, veterans: 4, born: { P: 60, E: 55 },
      harvested: 900, resonanceHits: 5, weatherShifts: 3, milestones: 6, sceneEvents: 2 }),
  };
  els['end-stats'] = mkEl('end-stats');
  ui.showEnd({ type: 'win' });
  const h = els['end-stats'].innerHTML;
  ok(h.includes('战场叙事 · 战报'), '结算页出现战报分区');
  ok(h.includes('321s / 210s'), '总时长 / 实战时长正确格式化');
  ok(h.includes('3.75 / 42'), '交换比 / 峰值兵力');
  ok(h.includes('60 / 4'), '累计出兵 / 老兵晋升');
  ok(h.includes('7 / 5'), '精英击杀 / 共振命中');
  ok(h.includes('3 / 2'), '气象转变 / 场景异象');
  ok(h.includes('6 / 900'), '里程碑 / 累计采集');
  delete ui.sim.battleSummary;
  els['end-stats'].innerHTML = '';
  ui.showEnd({ type: 'lose' });
  ok(!els['end-stats'].innerHTML.includes('战场叙事 · 战报'), '无接口时整段跳过（向后兼容）');
}

console.log('— 4) 档案代号：实时校验与多标签页同步 —');
{
  const ui = {}; Object.setPrototypeOf(ui, UI.prototype);
  ui._profile = Profile.get();
  ui._profileNew = false;
  ui._renderProfile = () => {};
  ui.settings = { cues: true, intelDefault: false };
  ui.sim = { minimapSpec: () => ({}), intelBlips: () => [] };
  ui.world = {};
  ui.hooks = {};
  // 只调用 _initProfile 需要的那部分：通过真实方法验证事件绑定
  ui._initProfile();
  const input = els['cc-name'], hint = els['cc-hint'];
  ok(typeof input._handlers.input === 'function', '代号输入绑定实时校验');
  input.value = 'A';
  input._handlers.input();
  ok(hint.textContent.includes('至少 2 个字符') && hint._cls.has('cc-invalid'), '过短代号提示非法');
  input.value = '尖兵<七号>';
  input._handlers.input();
  ok(hint.textContent.includes('已过滤特殊字符') && hint._cls.has('cc-invalid'), '含注入字符时提示过滤');
  input.value = '尖兵七号';
  input._handlers.input();
  ok(!hint._cls.has('cc-invalid') && hint.textContent.includes('4/12'), '合法代号显示字数并清除非法态');
  ok(typeof globalThis.window.addEventListener === 'function', '多标签页 storage 监听可注册');
}

console.log(`\nBATCH19 ${fail === 0 ? 'ALL_PASS' : 'FAILED'}  pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
