/* 批次22 验证：HUD 写入去重 + 情报层汇总缓存
 * 运行：node test-batch22.mjs
 * 说明：纯 B 侧性能细节，视觉输出与批次21 完全一致；用 UI.prototype 借用方法 + DOM/Canvas 桩件测真实行为。
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

console.log('— 1) 接线审计 —');
has(uiSrc, /_setHTML\(node, html\) \{/, '存在 innerHTML 去重 helper');
has(uiSrc, /_setText\(node, text\) \{/, '存在 textContent 去重 helper');
has(uiSrc, /if \(node\._yjHTML === v\) return false/, 'HTML 以节点缓存比对');
has(uiSrc, /if \(node\.textContent === v\) return false/, '文本以当前 DOM 值比对');
has(uiSrc, /this\._setText\(\$\('#res-bio'\)/, '资源数字走去重写入');
has(uiSrc, /this\._setText\(\$\('#res-pop'\)/, '人口数字走去重写入');
has(uiSrc, /this\._setText\(\$\('#res-era-name'\)/, '纪元名走去重写入');
has(uiSrc, /_updateObjective\(s\) \{[\s\S]*?this\._setHTML\(el,/, '目标进度条去重');
has(uiSrc, /_updateEconStatus\(s\) \{[\s\S]*?this\._setHTML\(el, bits\.join/, '经济浮标去重');
has(uiSrc, /_updateWeather\(s\) \{[\s\S]*?this\._setHTML\(el,/, '天气条去重');
has(uiSrc, /_updateScene\(s\) \{[\s\S]*?this\._setHTML\(el,/, '场景横幅去重');
has(uiSrc, /this\._setHTML\(el, `<b style="color:/, '战场字幕去重');
has(uiSrc, /if \(!cache \|\| now - cache\.at > 180 \|\| cache\.map !== mapName\)/, '情报汇总 180ms 缓存 + 换图失效');
has(uiSrc, /this\._intelCache = cache/, '情报快照写入实例缓存');
has(uiSrc, /const blips = cache\.blips, spec = cache\.spec/, '绘制复用缓存快照');
has(uiSrc, /if \(typeof s\.intelBlips === 'function'\) blips = s\.intelBlips\(\)/, '仍在缓存未命中时读 A 侧只读接口');

console.log('— 2) 真实行为：DOM 写入去重 —');
const { UI } = await import('./MVP_Web/js/ui.js');
const { SIDES } = await import('./MVP_Web/js/rts.js');

const els = {};
function mkEl(id) {
  if (els[id]) return els[id];
  const e = {
    id, _yjHTML: undefined, _htmlVal: '', _text: '', _htmlSet: 0, _textSet: 0,
    classList: { add() {}, remove() {}, toggle() {} },
    style: { setProperty() {} },
    get innerHTML() { return this._htmlVal; },
    set innerHTML(v) { this._htmlVal = v; this._htmlSet++; },
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); this._textSet++; },
  };
  els[id] = e;
  return e;
}
globalThis.document = {
  getElementById: id => mkEl(id),
  querySelector: () => null,
  createElement: () => mkEl('__tmp' + Math.random()),
  addEventListener() {},
};
globalThis.window = { addEventListener() {} };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const ui = {};
Object.setPrototypeOf(ui, UI.prototype);

{
  const n = mkEl('probe-html');
  ok(ui._setHTML(n, '<b>A</b>') === true, '首次 HTML 写入返回 true');
  ok(n.innerHTML === '<b>A</b>' && n._htmlSet === 1, '首次确实落盘');
  ok(ui._setHTML(n, '<b>A</b>') === false, '相同 HTML 返回 false');
  ok(n._htmlSet === 1, '相同 HTML 未重复写 DOM');
  ok(ui._setHTML(n, '<b>B</b>') === true && n._htmlSet === 2, '内容变化后重新写入');
  ok(ui._setHTML(null, 'x') === false, '空节点安全返回');
  const t = mkEl('probe-text');
  ok(ui._setText(t, 12) === true && t.textContent === '12', '数字转字符串写入');
  ok(ui._setText(t, 12) === false && t._textSet === 1, '相同文本未重复写 DOM');
  ok(ui._setText(t, 13) === true && t._textSet === 2, '文本变化后重新写入');
  ok(ui._setText(null, 'x') === false, '空节点文本安全返回');
}

console.log('— 3) 状态条：内容不变时不重建子树 —');
const weather = (id, name, mul) => ({ id, name, desc: '', visionMul: mul, hitMul: mul });
const simBase = {
  time: 10, stats: { P: { harvested: 20 } }, wells: [{ owner: SIDES.PLAYER }],
  weather: weather('clear', '晴空', 1), weatherTimeline: [], weatherIdx: 0,
  objective: { type: 'survive', surviveT: 60, label: '守住防线' },
  objectiveProgress: () => ({ type: 'survive', label: '', ratio: 10 / 60 }),
  refined: { [SIDES.PLAYER]: true }, tradeDone: 1,
  sceneEvent: () => ({ label: '灰烬回潮', text: '余烬复燃', color: 0xffb070, dur: 12, remaining: 6 }),
};
{
  const wh = mkEl('weather-hud'), mp = mkEl('mission-prog'), es = mkEl('econ-status'), se = mkEl('scene-event');
  for (const e of [wh, mp, es, se]) { e._htmlSet = 0; e._yjHTML = undefined; }
  const sim = { ...simBase };
  ui._updateWeather(sim); ui._updateObjective(sim); ui._updateEconStatus(sim); ui._updateScene(sim);
  const first = [wh._htmlSet, mp._htmlSet, es._htmlSet, se._htmlSet];
  ok(first.every(v => v === 1), '首帧四个状态条各写一次');
  ui._updateWeather(sim); ui._updateObjective(sim); ui._updateEconStatus(sim); ui._updateScene(sim);
  ok(wh._htmlSet === 1 && mp._htmlSet === 1 && es._htmlSet === 1 && se._htmlSet === 1,
    '连续同状态帧不再重建任何子树');
  ui._updateWeather({ ...sim, weather: weather('storm', '风暴', 0.7) });
  ok(wh._htmlSet === 2, '天气切换后天气条更新');
  ui._updateObjective({ ...sim, time: 11 });
  ok(mp._htmlSet === 2, '倒计时推进后目标条更新');
  ui._updateEconStatus({ ...sim, tradeDone: 2 });
  ok(es._htmlSet === 2, '贸易次数变化后经济浮标更新');
  ui._updateScene({ ...sim, sceneEvent: () => ({ label: '孢子潮汐', text: '孢子弥漫', color: 0x88ffaa, dur: 12, remaining: 6 }) });
  ok(se._htmlSet === 2, '场景事件切换后横幅更新');
  let threw = false;
  try { ui._updateObjective({ objective: { type: 'destroy' } }); ui._updateWeather({}); ui._updateScene({}); }
  catch (_) { threw = true; }
  ok(!threw, '缺字段 / destroy 目标 / 无天气 / 无事件时不抛错');
  ok(mp.innerHTML === '', 'destroy 目标时进度条被清空');
}

console.log('— 4) 情报图层：汇总快照缓存 —');
const savedPerf = globalThis.performance;
let fakeNow = 1000;
globalThis.performance = { now: () => fakeNow };
try {
  const g2 = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : () => {}),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const toX = x => x + 100, toY = z => z + 71;
  let intelCalls = 0, specCalls = 0;
  const sim = {
    map: { name: '沃野' },
    intelBlips: () => {
      intelCalls++;
      return [
        { kind: 'unit', side: SIDES.ENEMY, x: 0, z: 0 },
        { kind: 'unit', side: SIDES.ENEMY, x: 1, z: 1 },
        { kind: 'hazard', x: 10, z: 10, r: 4 },
        { kind: 'resonance', x: -10, z: -10, r: 5 },
      ];
    },
    minimapSpec: () => { specCalls++; return { hazard: { color: 0xff5a3a, weight: 1 }, resonance: { color: 0x9a6cff, weight: 2 } }; },
  };
  const f = {}; Object.setPrototypeOf(f, UI.prototype);
  f._drawIntelLayer(g2, sim, toX, toY, 200, 142);
  fakeNow += 40; f._drawIntelLayer(g2, sim, toX, toY, 200, 142);
  fakeNow += 40; f._drawIntelLayer(g2, sim, toX, toY, 200, 142);
  ok(intelCalls === 1 && specCalls === 1, '180ms 内三帧只汇总一次');
  ok(Array.isArray(f._intelCache.blips) && f._intelCache.map === '沃野', '快照含点位与地图名');
  fakeNow += 200; f._drawIntelLayer(g2, sim, toX, toY, 200, 142);
  ok(intelCalls === 2, '窗口过期后重新汇总');
  sim.map = { name: '泽国' };
  f._drawIntelLayer(g2, sim, toX, toY, 200, 142);
  ok(intelCalls === 3 && f._intelCache.map === '泽国', '换图立即失效重算');
  const bad = {}; Object.setPrototypeOf(bad, UI.prototype);
  let threw = false;
  try { bad._drawIntelLayer(g2, { map: null, intelBlips: () => { throw new Error('x'); } }, toX, toY, 200, 142); }
  catch (_) { threw = true; }
  ok(!threw, 'A 侧接口抛错时图层安全跳过');
  ok(!Array.isArray(bad._intelCache.blips), '异常快照不会污染绘制');
} finally {
  globalThis.performance = savedPerf;
}

console.log(`\nBATCH22 ${fail === 0 ? 'ALL_PASS' : 'FAILED'}  pass=${pass} fail=${fail}`);
if (fail) process.exitCode = 1;
