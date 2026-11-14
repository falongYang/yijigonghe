/* 批次32 验证：小地图战术指令（右键 / 一次性下令态）
 * 运行：node test-batch32.mjs
 * 源码接线审计 + UI 小地图 Pointer/ContextMenu DOM 桩 + 真实 Simulation 命令签名。
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
const uiSrc = read('MVP_Web/js/ui.js');
const html = read('MVP_Web/index.html');
const css = read('MVP_Web/css/style.css');

console.log('— 1) 接线审计 —');
has(uiSrc, /const mapPoint = e => \{/, '屏幕像素→战术坐标抽成共用函数');
has(uiSrc, /Math\.max\(0, Math\.min\(1, \(e\.clientX - rect\.left\) \/ \(rect\.width \|\| 1\)\)\)/, '横坐标钳制并防零宽');
has(uiSrc, /if \(this\.hooks\.onMinimapOrder\) this\.hooks\.onMinimapOrder\(p\.x, p\.z, opts \|\| \{\}\)/, '指令走独立 hook');
has(uiSrc, /if \(this\._mmOrderArmed\) \{/, 'pointerdown 识别一次性下令态');
has(uiSrc, /this\.setMinimapOrderArmed\(false\);\n\s+issue\(e/, '下令后自动收起态');
has(uiSrc, /addEventListener\('contextmenu'/, '桌面右键监听');
has(uiSrc, /append: !!e\.shiftKey, attackMove: !!e\.altKey/, 'Shift 追加 / Alt 攻击移动');
has(uiSrc, /document\.getElementById\('mm-order'\)/, '触屏下令按钮接线');
has(uiSrc, /setMinimapOrderArmed\(on\) \{/, '下令态开关方法');
has(uiSrc, /disarmMinimapOrder\(\) \{/, 'Esc 退出下令态方法');
has(uiSrc, /aria-pressed/, '按钮同步 aria-pressed');
has(main, /onMinimapOrder: \(x, z, opts\) => orderFromMinimap\(x, z, opts\)/, '主入口指令 hook 接线');
has(main, /function orderFromMinimap\(x, z, opts = \{\}\) \{/, '主入口指令处理函数');
has(main, /if \(!Number\.isFinite\(wx\) \|\| !Number\.isFinite\(wz\)\) return/, '非法坐标直接忽略');
has(main, /Math\.max\(-HALF_W, Math\.min\(HALF_W, wx\)\)/, '坐标钳制到战场范围');
has(main, /if \(!game\.running \|\| game\.paused \|\| game\.tutOpen\)/, '非战斗状态不下令');
has(main, /sim\.commandMove\(ids, tx, tz, \{ append \}\)/, '移动/追加路径点调用');
has(main, /sim\.commandAttackMove\(ids, tx, tz\)/, '攻击移动调用');
has(main, /if \(ui && typeof ui\.disarmMinimapOrder === 'function' && ui\.disarmMinimapOrder\(\)\) return/, 'Esc 逐层收起时先退出下令态');
has(main, /右键可给选中单位直接下令/, '首次引导补充小地图下令');
has(html, /id="mm-order"/, '页面含下令按钮');
has(html, /aria-pressed="false"/, '按钮初始未按下');
has(html, /Shift \+ 右键/, '帮助页补右键指令说明');
has(css, /\.mm-order-btn \{/, '下令按钮样式');
has(css, /\.mm-order-btn\.on \{/, '下令态高亮样式');

console.log('— 2) UI 小地图交互（DOM 桩） —');
try {
  const { UI } = await import('./MVP_Web/js/ui.js');
  const savedDoc = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const savedWin = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const winEv = {};
  const mkNode = id => ({
    id, _ev: {}, style: {}, title: '', textContent: '',
    classList: {
      toggle(n, on) { this[n] = !!on; }, contains(n) { return !!this[n]; },
      add(n) { this[n] = true; }, remove(n) { this[n] = false; },
    },
    setAttribute(k, v) { this[k] = v; },
    addEventListener(t, fn) { (this._ev[t] ||= []).push(fn); },
    fire(t, ev) { for (const fn of (this._ev[t] || [])) fn(ev); },
    getBoundingClientRect() { return this.rect || { left: 0, top: 0, width: 200, height: 142 }; },
    getContext() { return {}; },
    setPointerCapture() {},
  });
  const mm = mkNode('minimap'), tip = mkNode('mm-tip');
  const intelBtn = mkNode('mm-intel'), orderBtn = mkNode('mm-order'), legend = mkNode('mm-intel-legend');
  const nodes = { 'mm-intel': intelBtn, 'mm-order': orderBtn, 'mm-intel-legend': legend, 'mm-tip': tip };
  globalThis.document = {
    querySelector: s => s === '#minimap' ? mm : (s === '#mm-tip' ? tip : null),
    getElementById: id => nodes[id] || null,
  };
  globalThis.window = { addEventListener(t, fn) { (winEv[t] ||= []).push(fn); } };
  const winFire = (t, ev) => { for (const fn of (winEv[t] || [])) fn(ev); };
  const jumps = [], orders = [], toasts = [];
  let prevented = 0;
  const ui = Object.create(UI.prototype);
  ui.hooks = {
    onMinimap: (x, z) => jumps.push({ x, z }),
    onMinimapOrder: (x, z, o) => orders.push({ x, z, o }),
  };
  ui.toast = t => toasts.push(t);
  ui.settings = null;
  ui._initMinimap();
  const ev = o => ({
    pointerType: 'touch', button: 0, pointerId: 1, clientX: 100, clientY: 71,
    cancelable: true, preventDefault() { prevented++; }, shiftKey: false, altKey: false, ...o,
  });
  ok(ui._mmOrderArmed === false && orderBtn['aria-pressed'] === 'false', '初始为镜头跳转态');
  ok(mm.style.cursor === 'crosshair' && ui.intelLayer === false, '指针样式与情报图层初始正确');
  mm.fire('pointerdown', ev());
  ok(jumps.length === 1 && jumps[0].x === 0 && jumps[0].z === 0, '轻点中心跳转镜头到原点');
  ok(orders.length === 0, '普通跳转不触发指令');
  winFire('pointerup', {});
  mm.fire('pointerdown', ev({ clientX: -80, clientY: 500 }));
  ok(jumps.length === 2 && jumps[1].x === -94 && jumps[1].z === 67, '指针滑出画布时坐标钳制到图内');
  winFire('pointerup', {});
  mm.rect = { left: 0, top: 0, width: 0, height: 0 };
  mm.fire('pointerdown', ev());
  ok(jumps.length === 3 && Number.isFinite(jumps[2].x) && Number.isFinite(jumps[2].z), '零尺寸画布不产生 NaN 坐标');
  winFire('pointerup', {});
  mm.rect = null;
  mm.fire('contextmenu', ev({ pointerType: 'mouse', button: 2, shiftKey: true, altKey: true }));
  ok(orders.length === 1 && orders[0].x === 0 && orders[0].z === 0, '右键按映射点下达指令');
  ok(orders[0].o.append === true && orders[0].o.attackMove === true, 'Shift+Alt 透传追加与攻击移动');
  ok(prevented > 0 && jumps.length === 3, '右键阻止浏览器菜单且不跳镜头');
  mm.fire('pointerdown', ev({ pointerType: 'mouse', button: 2 }));
  ok(jumps.length === 3 && orders.length === 1, '鼠标右键的 pointerdown 被忽略，不重复下令/跳转');
  orderBtn.onclick();
  ok(ui._mmOrderArmed === true && orderBtn['aria-pressed'] === 'true' && mm.style.cursor === 'cell', '下令按钮进入 armed 态');
  ok(orderBtn.classList.on === true && toasts.some(t => t.includes('小地图下令已开启')), '按钮高亮并给出提示');
  mm.fire('pointerdown', ev({ clientX: 200, clientY: 0, shiftKey: true }));
  ok(orders.length === 2 && orders[1].x === 94 && orders[1].z === -67, '下令态点击按像素映射下令');
  ok(orders[1].o.append === true && orders[1].o.attackMove === false, '下令态 Shift 追加路径点');
  ok(ui._mmOrderArmed === false && ui._mmDrag === false && jumps.length === 3, '一次性下令态用完即收且不拖图');
  mm.fire('pointerdown', ev());
  ok(jumps.length === 4, '退出下令态后恢复镜头跳转');
  winFire('pointerup', {});
  ui.setMinimapOrderArmed(true);
  ok(ui.disarmMinimapOrder() === true && ui._mmOrderArmed === false, 'Esc 可收起待下指令');
  ok(ui.disarmMinimapOrder() === false, '未 armed 时 Esc 不吞掉后续层级');
  ok(toasts.some(t => t.includes('已退出小地图下令模式')), '退出时给出提示');
  if (savedDoc) Object.defineProperty(globalThis, 'document', savedDoc); else delete globalThis.document;
  if (savedWin) Object.defineProperty(globalThis, 'window', savedWin); else delete globalThis.window;
} catch (e) {
  console.log('  ! UI 行为测试异常：' + (e && e.stack ? e.stack : e));
  fail++;
}

console.log('— 3) 与 A 侧命令签名的真实联动 —');
try {
  const { Simulation } = await import('./MVP_Web/js/sim.js');
  const { SIDES } = await import('./MVP_Web/js/rts.js');
  const sim = new Simulation();
  sim.reset('SP01', { mode: 'skirmish', difficulty: 'normal' });
  const ids = sim.units.filter(u => u.side === SIDES.PLAYER).slice(0, 3).map(u => u.id);
  ok(ids.length > 0, '取得真实己方单位用于下令');
  sim.commandMove(ids, 10, 20, { append: true });
  const lead = sim.getUnit(ids[0]);
  ok(lead.order === 'manual' && lead.target && Number.isFinite(lead.target.x), '追加路径点写入真实单位目标');
  sim.commandAttackMove(ids, -10, -20);
  ok(sim.getUnit(ids[0]).state === 'attackmove', '攻击移动写入真实单位状态');
  let threw = null;
  try { sim.commandMove(ids, NaN, Infinity, { append: false }); } catch (e) { threw = e; }
  ok(!threw, 'A 侧命令对异常坐标不抛错（B 侧另有有限性前置校验）');
} catch (e) {
  console.log('  ! Simulation 联动异常：' + (e && e.stack ? e.stack : e));
  fail++;
}

console.log(`\nBATCH32 ${fail === 0 ? 'ALL_PASS' : 'FAILED'}  pass=${pass} fail=${fail}`);
if (fail) process.exitCode = 1;
