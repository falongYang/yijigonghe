/* 批次29 验证：结算战报可视化与一键复制
 * 运行：node test-batch29.mjs
 * 源码接线审计 + 真实 Simulation 聚合数据 + UI 原型方法 / DOM 桩行为测试。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const has = (s, re, m) => ok(re.test(s), m);

const uiSrc = read('MVP_Web/js/ui.js');
const html = read('MVP_Web/index.html');
const css = read('MVP_Web/css/style.css');

console.log('— 1) 接线审计 —');
has(uiSrc, /const bs = \(typeof s\.battleSummary === 'function' && s\.battleSummary\(\)\) \|\| \{\}/, '结算复用同一份只读战报快照');
has(uiSrc, /this\._battleReportText = this\._buildBattleText\(s, win, st0, bs\)/, '结算生成可复制战报文本');
has(uiSrc, /if \(chartBox\) this\._setHTML\(chartBox, this\._battleChart\(bs, st0, s\)\)/, '结算写入可视化战报（带写入去重）');
has(uiSrc, /_battleChart\(bs, st, s\) \{/, '定义战报图生成');
has(uiSrc, /_buildBattleText\(s, win, st, bs\) \{/, '定义战报纯文本生成');
has(uiSrc, /_copyBattleReport\(\) \{/, '定义复制入口');
has(uiSrc, /const endCopy = \$\('#btn-end-copy'\)/, '结算按钮绑定到复制入口');
has(uiSrc, /<svg viewBox="0 0 440 176" role="img"/, '图表为带无障碍标签的内联 SVG');
has(uiSrc, /击杀 \/ 损失/, '对比条含击杀 / 损失');
has(uiSrc, /输出 \/ 承受伤害/, '对比条含输出 / 承受伤害');
has(uiSrc, /实战 \/ 总时长/, '对比条含时长');
has(uiSrc, /峰值 \/ 存活兵力/, '对比条含兵力');
has(uiSrc, /navigator\.clipboard\.writeText\(text\)/, '复制优先走 Clipboard API');
has(uiSrc, /document\.execCommand\('copy'\)/, '剪贴板不可用时回落 execCommand');
has(uiSrc, /剪贴板不可用，请在结算页手动选取战报文本/, '最终降级给出手动提示');
has(html, /<div id="end-chart"><\/div>/, '结算页预留图表容器');
has(html, /id="btn-end-copy"/, '结算页新增复制按钮');
has(css, /\.end-chart svg \{ display: block; width: 100%; height: auto; \}/, 'SVG 随容器等比缩放');
has(css, /\.ec-track \{ fill: rgba\(255,255,255,\.07\); \}/, '对比条底槽样式');
has(css, /\.end-btns \{[^}]*flex-wrap: wrap/, '三个结算按钮在窄屏可换行');
has(html, /可视化战报图/, '帮助页补充战报图说明');

console.log('— 2) A 侧只读聚合数据 —');
const { Simulation } = await import('./MVP_Web/js/sim.js');
const sim = new Simulation();
sim.reset('SP01', { mode: 'skirmish', difficulty: 'normal' });
const bs = sim.battleSummary();
ok(!!bs && typeof bs === 'object', 'battleSummary 返回聚合对象');
ok(Number.isFinite(bs.duration) && Number.isFinite(bs.battleTime), '时长字段为有限数');
ok(!!bs.tradeRatio && Number.isFinite(bs.tradeRatio.P), '交换比按阵营可读');
ok(Number.isFinite(bs.peakArmy) && !!bs.born, '峰值兵力 / 累计出兵可读');

console.log('— 3) 战报图与纯文本（UI 原型方法） —');
const { UI } = await import('./MVP_Web/js/ui.js');
const { SIDES } = await import('./MVP_Web/js/rts.js');
const ui = Object.create(UI.prototype);
const st = { kills: 42, losses: 13, dmgDealt: 820.6, dmgTaken: 410.2, harvested: 300, built: 5, evolved: 2 };
const s = {
  mode: 'skirmish', chapter: 0, era: { P: 0 }, time: 240,
  difficulty: { name: '标准' }, climate: { name: '沃野' },
  pop: () => 21, peakPop: { [SIDES.PLAYER]: 30 },
};
const art = ui._battleChart(bs, st, s);
ok(art.includes('<svg') && art.includes('</svg>'), '生成完整内联 SVG');
for (const label of ['击杀 / 损失', '输出 / 承受伤害', '实战 / 总时长', '峰值 / 存活兵力']) {
  ok(art.includes(label), `对比条含「${label}」`);
}
ok(art.includes('交换比') && art.includes('精英击杀') && art.includes('老兵晋升'), '图下汇总三项战报指标');
ok(!/NaN|undefined|Infinity/.test(art), '图表无 NaN / undefined / Infinity');
const widths = [...art.matchAll(/<rect x="124" y="\d+" width="(\d+)" height="9" rx="4" fill="#[0-9a-f]{6}"\/>/g)].map(m => +m[1]);
ok(widths.length === 8, '四组共 8 条实色条');
ok(widths.every(w => w >= 2 && w <= 250), '条宽被安全限幅在 2..250');
ok((art.match(/class="ec-track"/g) || []).length === 8, '每条都有底槽便于读比例');
ok(art.includes('#7ef0a0') && art.includes('#ff7a6a'), '沿用既有胜负配色');

const degraded = ui._battleChart({}, st, s);
ok(degraded.includes('<svg') && !/NaN|undefined/.test(degraded), '缺 battleSummary 时回落到基础统计仍出图');
const bare = ui._battleChart(null, null, null);
ok(bare.includes('<svg') && !/NaN|undefined/.test(bare), '全缺输入仍安全出图（全零条）');
const evil = ui._battleChart({ duration: '<img src=x>', tradeRatio: { P: 'oops' } },
  { kills: '<script>alert(1)</script>', losses: -5 }, s);
ok(!evil.includes('<img') && !evil.includes('<script') && !/NaN|undefined/.test(evil), '异常字段被数值清洗，无注入面');

const text = ui._buildBattleText(s, true, st, bs);
ok(text.split('\n').length === 10, '复制文本为 10 行结构化战报');
ok(text.includes('胜利') && text.includes('遭遇战'), '含胜负与模式');
ok(text.includes('击杀 / 损失：42 / 13'), '含同口径战果数字');
ok(text.includes('交换比：') && text.includes('峰值兵力：'), '含战报聚合项');
ok(!/undefined|NaN/.test(text), '纯文本无 undefined / NaN');

console.log('— 4) 结算集成与复制降级（DOM 桩） —');
try {
  const saved = {
    doc: Object.getOwnPropertyDescriptor(globalThis, 'document'),
    nav: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
  };
  const nodes = new Map();
  const mkNode = () => ({
    innerHTML: '', textContent: '', title: '', value: '',
    style: { cssText: '' }, dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {}, getAttribute() { return null; },
    appendChild() {}, removeChild() {}, select() {}, remove() {},
    addEventListener() {},
  });
  const get = key => { if (!nodes.has(key)) nodes.set(key, mkNode()); return nodes.get(key); };
  let clipboardMode = 'ok', execOk = true, written = '', removed = 0, execCalls = 0;
  globalThis.document = {
    querySelector: sel => get(sel),
    getElementById: id => get('#' + id),
    createElement: () => ({
      value: '', style: { cssText: '' },
      setAttribute() {}, select() {}, remove() { removed++; },
    }),
    body: { appendChild() {} },
    execCommand: () => { execCalls++; return execOk; },
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true, writable: true,
    value: { get clipboard() {
      if (clipboardMode === 'missing') return undefined;
      return { writeText: t => { written = t; return clipboardMode === 'reject' ? Promise.reject(new Error('denied')) : Promise.resolve(); } };
    } },
  });
  const toasts = [];
  ui.toast = (t, opts) => toasts.push(String(t));
  ui.sim = sim;
  ui._recordMatch = () => null;      // 隔离档案写盘，只验证图表接线
  ui.showEnd({ type: 'win' });
  const chart = get('#end-chart');
  ok(chart.innerHTML.includes('<svg') && chart.innerHTML.includes('击杀 / 损失'), 'showEnd 实际写入战报图');
  ok(typeof ui._battleReportText === 'string' && ui._battleReportText.includes('【蚁纪·共时】战报'),
    'showEnd 生成可复制文本');
  const first = chart.innerHTML;
  ui.showEnd({ type: 'win' });
  ok(chart.innerHTML === first, '重复结算不重建相同 SVG（写入去重生效）');

  const tick = () => new Promise(r => setTimeout(r, 0));
  clipboardMode = 'ok'; ui._copyBattleReport(); await tick();
  ok(written.includes('【蚁纪·共时】战报') && toasts.at(-1).includes('已复制'), 'Clipboard API 成功路径');
  clipboardMode = 'reject'; execOk = true; execCalls = 0;
  ui._copyBattleReport(); await tick();
  ok(execCalls === 1 && toasts.at(-1).includes('已复制'), 'Clipboard 拒绝后 execCommand 降级成功');
  ok(removed >= 1, '降级用的临时 textarea 已移除');
  clipboardMode = 'reject'; execOk = false;
  ui._copyBattleReport(); await tick();
  ok(toasts.at(-1).includes('剪贴板不可用'), '两级都失败时给出手动提示');
  clipboardMode = 'missing'; execOk = true; execCalls = 0;
  ui._copyBattleReport(); await tick();
  ok(execCalls === 1 && toasts.at(-1).includes('已复制'), '无 Clipboard API 时直接走降级');
  ui._battleReportText = '';
  const n = toasts.length;
  ui._copyBattleReport();
  ok(toasts.length === n + 1 && toasts.at(-1).includes('暂无'), '无战报文本时明确提示且不抛错');

  // 还原全局，避免污染后续测试文件
  if (saved.doc) Object.defineProperty(globalThis, 'document', saved.doc);
  else delete globalThis.document;
  if (saved.nav) Object.defineProperty(globalThis, 'navigator', saved.nav);
  else delete globalThis.navigator;
} catch (e) {
  console.log('  ! DOM 桩行为测试异常：' + (e && e.stack ? e.stack : e));
  fail++;
}

console.log(`\nBATCH29 ${fail === 0 ? 'ALL_PASS' : 'FAILED'}  pass=${pass} fail=${fail}`);
if (fail) process.exitCode = 1;
