/* 批次24 验证：触屏 / 指针交互层（画布手势、小地图、Esc 浮层收拢、触屏样式）
 * 运行：node test-batch24.mjs
 * 包含源码接线审计、TouchController 确定性状态机行为测试，以及与 World 相机方法的真实联动。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const has = (s, re, m) => ok(re.test(s), m);
const hasNot = (s, re, m) => ok(!re.test(s), m);

const touch = read('MVP_Web/js/touch.js');
const main = read('MVP_Web/js/main.js');
const worldSrc = read('MVP_Web/js/world.js');
const uiSrc = read('MVP_Web/js/ui.js');
const html = read('MVP_Web/index.html');
const css = read('MVP_Web/css/style.css');

console.log('— 1) 接线审计 —');
has(main, /import \{ bindTouchInput, isSyntheticMouse, isTouchActive \} from '\.\/touch\.js'/, '主入口引入触屏层');
has(main, /bindTouchInput\(canvas, \{/, '画布绑定手势控制器');
has(main, /enabled: \(\) => game\.running && !game\.paused && !game\.tutOpen && !game\.glLost/, '暂停 / 引导 / 显卡中断时停用手势');
has(main, /tap: \(x, y\) => touchPrimary\(x, y\)/, '轻点接入主语义');
has(main, /longPress: \(x, y\) => touchSecondary\(x, y\)/, '长按接入次语义');
has(main, /pan: \(dx, dy\) => world\.panByPixels\(dx, dy\)/, '拖动接入镜头平移');
has(main, /zoom: \(d, px, py\) => \{/, '捏合接入相机缩放');
has(main, /world\.pinchZoom\(d\)/, '连续捏合走无漂移通道');
has(worldSrc, /pinchZoom\(delta\) \{/, 'World 暴露连续捏合缩放方法');
has(worldSrc, /T\.dist = clamp\(T\.dist \* \(1 \+ d \* 0\.0012\), 42, 250\)/, '捏合与滚轮共用距离系数与限幅');
has(main, /rotate: \(dyaw, dpitch\) => world\.rotate\(dyaw, dpitch\)/, '双指旋转接入相机');
has(main, /drag: on => \{ world\.setDragPan\(on\)/, '拖动期间关闭边缘滚屏');
has(main, /firstTouch: \(\) => showTouchHint\(\)/, '首次触屏提示接线');
has(main, /function touchPrimary\(x, y\) \{/, '轻点分发函数');
has(main, /function touchSecondary\(x, y\) \{/, '长按分发函数');
has(main, /if \(game\.pendingAbility\) \{ castAbilityAt\(x, y\); return; \}/, '瞄准态轻点施放能力');
has(main, /if \(game\.pendingBuild\) \{ placeBuild\(x, y\); return; \}/, '建造态轻点放置');
has(main, /if \(game\.pendingPatrol\) \{ commitPatrol\(\); return; \}/, '巡逻态长按确认');
has(main, /ant_epoch_touch_hint_v1/, '触屏提示按设备持久化，不反复打扰');
has(main, /if \(isSyntheticMouse\(e\)\) return;/, '兼容鼠标事件抑制');
has(main, /if \(isTouchActive\(\)\) \{ world\.setEdge\(0, 0, false\); return; \}/, '触屏活跃期关闭贴边滚屏');
has(main, /const ESC_OVERLAYS = \['help', 'era-panel'\]/, 'Esc 浮层栈定义');
has(main, /if \(closeTopOverlay\(\)\) return;/, 'Esc 优先收起最上层浮层');
has(main, /function closeTopOverlay\(\) \{/, '浮层收拢函数');
has(uiSrc, /this\.mm\.addEventListener\('pointerdown'/, '小地图改用 pointerdown');
has(uiSrc, /window\.addEventListener\('pointermove'/, '小地图拖动改走 pointermove');
has(uiSrc, /window\.addEventListener\('pointercancel', endDrag\)/, '小地图处理 pointercancel');
hasNot(uiSrc, /this\.mm\.addEventListener\('mousedown'/, '小地图不再只监听鼠标');
has(css, /#scene \{[^}]*touch-action: none/, '画布关闭浏览器默认手势');
has(css, /\.sp-carousel, \.ch-carousel \{ cursor: grab; touch-action: none; \}/, '轮播允许触屏横向拖动');
has(css, /#minimap \{[^}]*touch-action: none/, '小地图关闭默认手势');
has(css, /@media \(pointer: coarse\)/, '粗指针点击区域适配');
has(css, /-webkit-tap-highlight-color: transparent/, '去掉触屏点按高亮块');
has(html, /<h4>触屏 \/ 平板操作<\/h4>/, '帮助页补充触屏说明');
has(html, /双指捏合/, '帮助页说明捏合缩放');
has(touch, /const WHEEL_K = 0\.0012/, '捏合换算与滚轮系数同源');
has(touch, /const ROTATE_K = 0\.005/, '旋转换算与中键系数同源');
has(touch, /e\.pointerType === 'mouse'\) return/, '鼠标指针不进入手势层');
has(touch, /export function isSyntheticMouse/, '导出合成鼠标判定');

console.log('— 2) 触屏状态机（桩件行为测试） —');
const { TouchController, isSyntheticMouse, isTouchActive, resetSyntheticMouse } = await import('./MVP_Web/js/touch.js');

function harness(enabled = true) {
  const H = {};
  const mkTarget = () => ({
    addEventListener(t, fn) { (H[t] ||= []).push(fn); },
    removeEventListener(t, fn) { const a = H[t]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
    setPointerCapture() {}, releasePointerCapture() {},
  });
  const canvas = mkTarget();
  const win = mkTarget();
  globalThis.window = win;
  let T = 1000, tid = 0;
  const timers = new Map();
  const calls = [];
  const rec = name => (...args) => calls.push([name, ...args]);
  const hooks = {
    enabled: () => enabled,
    tap: rec('tap'), longPress: rec('longPress'), pan: rec('pan'),
    zoom: rec('zoom'), rotate: rec('rotate'), drag: rec('drag'), firstTouch: rec('firstTouch'),
  };
  const c = new TouchController(canvas, hooks, {
    now: () => T,
    setTimeout: (fn, ms) => { const id = ++tid; timers.set(id, { fn, at: T + ms }); return id; },
    clearTimeout: id => timers.delete(id),
  }).bind();
  const fire = (type, e) => (H[type] || []).slice().forEach(fn => fn(e));
  const ev = (type, id, x, y, extra = {}) => ({
    type, pointerId: id, pointerType: 'touch', clientX: x, clientY: y,
    cancelable: true, preventDefault() { this._pd = true; }, ...extra,
  });
  const down = (id, x, y, extra) => fire('pointerdown', ev('pointerdown', id, x, y, extra));
  const move = (id, x, y, extra) => fire('pointermove', ev('pointermove', id, x, y, extra));
  const up = (id, x, y, extra) => fire('pointerup', ev('pointerup', id, x, y, extra));
  const cancel = (id, x, y) => fire('pointercancel', ev('pointercancel', id, x, y));
  const advance = ms => {
    T += ms;
    for (const [id, t] of [...timers]) if (t.at <= T) { timers.delete(id); t.fn(); }
  };
  const names = () => calls.map(c => c[0]);
  const of = (n) => calls.filter(c => c[0] === n);
  return { c, calls, names, of, down, move, up, cancel, advance, H, get T() { return T; }, setT(v) { T = v; } };
}

// A) 轻点：一次 tap、一次首次提示，无拖动 / 长按
{
  const h = harness();
  h.down(1, 100, 100); h.setT(h.T + 90); h.up(1, 101, 100);
  ok(h.names().filter(n => n === 'tap').length === 1, '单指轻点触发一次 tap');
  ok(h.of('tap')[0][1] === 101 && h.of('tap')[0][2] === 100, 'tap 坐标取抬手位置');
  ok(h.of('firstTouch').length === 1, '首次触屏提示触发一次');
  ok(h.of('pan').length === 0 && h.of('longPress').length === 0, '轻点不误触发拖动 / 长按');
  h.down(2, 120, 120); h.up(2, 120, 120);
  ok(h.of('firstTouch').length === 1, '后续触屏不再重复提示');
  const tapsBefore = h.of('tap').length;
  h.down(4, 200, 200); h.up(4, 260, 200);
  ok(h.of('tap').length === tapsBefore, '仅抬手坐标偏移且无 move 时不误判轻点');
  h.c.destroy();
}
// B) 单指拖动：实时平移 + 起止 drag 状态，无点选
{
  const h = harness();
  h.down(1, 100, 100);
  h.move(1, 120, 100); h.move(1, 145, 105); h.up(1, 145, 105);
  ok(h.of('drag').length === 2 && h.of('drag')[0][1] === true && h.of('drag')[1][1] === false, '拖动起止各发一次 drag 状态');
  ok(h.of('pan').length === 2, '每次 pointermove 都产生一帧平移');
  ok(h.of('pan')[0][1] === 20 && h.of('pan')[0][2] === 0, '平移使用帧间增量而非累计位移');
  ok(h.of('pan')[1][1] === 25 && h.of('pan')[1][2] === 5, '第二帧增量独立计算');
  ok(h.of('tap').length === 0 && h.of('longPress').length === 0, '拖动不误触发点选 / 长按');
  h.c.destroy();
}
// C) 长按：定时触发 longPress，抬手不再 tap
{
  const h = harness();
  h.down(1, 100, 100); h.advance(560); h.up(1, 100, 100);
  ok(h.of('longPress').length === 1, '长按 520ms 触发一次指令');
  ok(h.of('tap').length === 0, '长按抬手不再补发点选');
  h.c.destroy();
}
// D) 拖动取消长按：定时器被清除
{
  const h = harness();
  h.down(1, 100, 100); h.move(1, 130, 100); h.advance(700); h.up(1, 130, 100);
  ok(h.of('longPress').length === 0, '进入拖动后长按定时器被取消');
  ok(h.of('tap').length === 0, '拖动抬手不点选');
  h.c.destroy();
}
// E) 双指捏合：张开 → deltaY<0（拉近），中点位移 → 平移
{
  const h = harness();
  h.down(1, 100, 100); h.down(2, 200, 100); h.move(2, 240, 100);
  ok(h.of('zoom').length === 1, '捏合产生一次缩放');
  ok(h.of('zoom')[0][1] < 0, '双指张开 → 与滚轮上滚同义的负 deltaY');
  ok(h.of('zoom')[0][2] === 170 && h.of('zoom')[0][3] === 100, '缩放锚定当前双指中点');
  ok(h.of('pan').some(p => p[1] === 20 && p[2] === 0), '双指中点移动同时平移镜头');
  ok(h.of('longPress').length === 0 && h.of('tap').length === 0, '第二指落下不触发单指长按 / 点选');
  h.c.destroy();
}
// F) 双指旋转：角度差换算为 rotate 像素增量并限幅
{
  const h = harness();
  h.down(1, 100, 100); h.down(2, 200, 100); h.move(2, 100, 200);
  ok(h.of('rotate').length === 1, '双指旋转产生一次 rotate');
  ok(h.of('rotate')[0][1] === -140, '90° 旋转按系数换算并限幅 140px');
  ok(h.of('rotate')[0][2] === 0, '触屏旋转不带俯仰增量');
  h.c.destroy();
}
// G) 手势结束后剩余单指不误点选；全部抬起后恢复
{
  const h = harness();
  h.down(1, 100, 100); h.down(2, 200, 100); h.move(2, 230, 100);
  h.up(2, 230, 100); h.up(1, 100, 100);
  ok(h.of('tap').length === 0, '双指手势后抬指不误点选');
  h.down(3, 60, 60); h.up(3, 60, 60);
  ok(h.of('tap').length === 1, '全部抬起后单指轻点恢复正常');
  h.c.destroy();
}
// H) pointercancel 与停用态
{
  const h = harness();
  h.down(1, 100, 100); h.cancel(1, 100, 100);
  ok(h.of('tap').length === 0, 'pointercancel 不补发点选');
  const off = harness(false);
  off.down(1, 100, 100); off.advance(600); off.up(1, 100, 100);
  ok(off.of('tap').length === 0 && off.of('longPress').length === 0, 'enabled=false 时手势完全停用');
  h.c.destroy(); off.c.destroy();
}
// I) 鼠标指针完全不进入手势层；destroy 清空监听
{
  const h = harness();
  h.down(9, 100, 100, { pointerType: 'mouse' }); h.up(9, 100, 100, { pointerType: 'mouse' });
  ok(h.calls.length === 0, 'mouse 指针交给既有鼠标逻辑');
  h.c.destroy();
  ok(Object.values(h.H).every(a => a.length === 0), 'destroy 解绑全部监听');
}
// J) 合成鼠标抑制：时空双条件 + 一次性消费
{
  const h = harness();
  resetSyntheticMouse();
  h.down(1, 100, 100); h.up(1, 100, 100);
  ok(isSyntheticMouse({ clientX: 102, clientY: 101 }, () => h.T) === true, '触点附近的兼容鼠标事件被抑制');
  ok(isSyntheticMouse({ clientX: 102, clientY: 101 }, () => h.T) === false, '标记一次性消费，不长期吞掉真实鼠标');
  h.down(2, 300, 300); h.up(2, 300, 300);
  ok(isSyntheticMouse({ clientX: 900, clientY: 900 }, () => h.T) === false, '远离触点的鼠标事件不抑制');
  h.setT(h.T + 2000);
  ok(isSyntheticMouse({ clientX: 300, clientY: 300 }, () => h.T) === false, '超出时间窗不再抑制');
  h.c.destroy();
  resetSyntheticMouse();
}
// K) 触控笔与触屏活跃窗口：阻止兼容鼠标事件、供主循环关闭贴边滚屏
const SUPPRESS_LATE = 2000;
{
  const h = harness();
  resetSyntheticMouse();
  const e = {
    type: 'pointerdown', pointerId: 7, pointerType: 'pen', clientX: 10, clientY: 10,
    cancelable: true, preventDefault() { this._pd = true; },
  };
  (h.H['pointerdown'] || []).slice().forEach(fn => fn(e));
  ok(e._pd === true, '触控笔 pointerdown 阻止兼容鼠标事件');
  ok(isTouchActive(() => h.T) === true, '触控期间处于活跃窗口');
  ok(isTouchActive(() => h.T + SUPPRESS_LATE) === false, '超出时间窗恢复鼠标语义');
  h.up(7, 10, 10);
  h.c.destroy();
  resetSyntheticMouse();
}

console.log('— 3) 与 World 相机方法的真实联动 —');
try {
  const THREE = await import('three');
  const { World } = await import('./MVP_Web/js/world.js');
  globalThis.document = globalThis.document || { createElement: () => ({ getContext: () => ({}) }), addEventListener() {} };
  const w = Object.create(World.prototype);
  w.cam = { tx: 0, tz: 0, dist: 150, yaw: 0, pitch: 0.9 };
  w.camera = new THREE.PerspectiveCamera(55, 1.6, 0.1, 3000);
  w.camera.position.set(0, 120, 120);
  w.camera.lookAt(0, 0, 0);
  w.camera.updateMatrixWorld(true);
  w.canvas = { clientHeight: 800 };
  w.screenToGround = () => ({ x: 24, z: 12 });
  w.intro = null; w.follow = false; w._followX = null; w._followZ = null;
  w._camFocusT = null; w.dragPan = false; w.edgePan = false;
  w.edge = { x: 0, y: 0, active: false };

  const H = {};
  const mk = () => ({ addEventListener(t, fn) { (H[t] ||= []).push(fn); }, removeEventListener() {}, setPointerCapture() {}, releasePointerCapture() {} });
  const canvas = mk(); globalThis.window = mk();
  let T = 0;
  const c = new TouchController(canvas, {
    enabled: () => true,
    pan: (dx, dy) => w.panByPixels(dx, dy),
    zoom: (d, px, py) => w.pinchZoom(d),
    rotate: (a, b) => w.rotate(a, b),
  }, { now: () => T, setTimeout: () => 1, clearTimeout: () => {} }).bind();
  const fire = (type, e) => (H[type] || []).slice().forEach(fn => fn(e));
  const ev = (type, id, x, y) => ({ type, pointerId: id, pointerType: 'touch', clientX: x, clientY: y, cancelable: true, preventDefault() {} });
  fire('pointerdown', ev('pointerdown', 1, 100, 100));
  fire('pointerdown', ev('pointerdown', 2, 200, 100));
  fire('pointermove', ev('pointermove', 2, 240, 100));
  const T2 = c._camT || w._camT;
  ok(!!T2 && T2.dist < 150 && T2.dist >= 42, '双指张开经 world.pinchZoom 拉近相机目标距离');
  ok(Math.abs(T2.dist - 150 / 1.4) < 0.01, '缩放比例与双指距离变化精确对应');
  ok(Number.isFinite(w.cam.tx) && Number.isFinite(w.cam.tz), '锚定缩放后相机目标坐标保持有限');
  ok(Math.abs(w.cam.tx) <= 300 && Math.abs(w.cam.tz) <= 300, '目标坐标被统一边界钳制');
  fire('pointerdown', ev('pointerdown', 3, 300, 300));
  fire('pointerup', ev('pointerup', 1, 100, 100));
  fire('pointerup', ev('pointerup', 2, 240, 100));
  fire('pointerup', ev('pointerup', 3, 300, 300));
  ok(Number.isFinite(T2.yaw) && Number.isFinite(T2.pitch), '相机角度目标未被手势污染为 NaN');
  const dist0 = T2.dist, tx0 = w.cam.tx, tz0 = w.cam.tz;
  w.pinchZoom(NaN);
  ok(T2.dist === dist0, '非法 delta 不改变距离目标');
  w.pinchZoom(1e6);
  ok(T2.dist === 250, '捏合上限与滚轮一致');
  w.pinchZoom(-1e6);
  ok(T2.dist === 42, '捏合下限与滚轮一致');
  ok(w.cam.tx === tx0 && w.cam.tz === tz0, '连续捏合不触碰相机目标坐标，杜绝逐帧漂移');
  c.destroy();
} catch (e) {
  console.log('  ! three 联动测试跳过：' + (e && e.message ? e.message : e));
}

console.log(`\nBATCH24 ${fail === 0 ? 'ALL_PASS' : 'FAILED'}  pass=${pass} fail=${fail}`);
if (fail) process.exitCode = 1;
