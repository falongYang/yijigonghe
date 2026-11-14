/* 批次31 验证：编队镜头跳转 / 视角预设 / 芯片交互
 * 运行：node test-batch31.mjs
 * 源码接线审计 + 纯逻辑状态机 + World 相机目标行为 + UI 编队芯片 DOM 桩。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const has = (s, re, m) => ok(re.test(s), m);

const cf = read('MVP_Web/js/camera-focus.js');
const main = read('MVP_Web/js/main.js');
const world = read('MVP_Web/js/world.js');
const uiSrc = read('MVP_Web/js/ui.js');
const html = read('MVP_Web/index.html');
const css = read('MVP_Web/css/style.css');

console.log('— 1) 接线审计 —');
has(cf, /export const CAM_DIST_MIN = 42/, '相机距离下限与 World 限幅一致');
has(cf, /export function groupBounds\(units\) \{/, '队伍质心/散布纯函数');
has(cf, /export function focusDistance\(spread, current = NaN, deadzone = 12\)/, '散布→视距纯函数');
has(cf, /export function createDoubleTap\(windowMs = GROUP_TAP_MS\)/, '连按状态机');
has(cf, /export const VIEW_PRESETS = \{/, '三档视角预设表');
has(cf, /const d = Math\.hypot\(p\.x - x, p\.z - z\)/, '散布按最远单位半径计算');
has(cf, /if \(!Number\.isFinite\(x\) \|\| !Number\.isFinite\(z\)\) continue/, '坐标做有限性清洗');
has(world, /import \{ CAM_DIST_MIN, CAM_DIST_MAX, VIEW_PRESETS, focusDistance \} from '\.\/camera-focus\.js'/, 'World 引入聚焦纯逻辑');
has(world, /focusGroup\(x, z, spread = 0\) \{/, 'World 定义编队聚焦入口');
has(world, /T\.dist = focusDistance\(spread, T\.dist\)/, '只推进阻尼目标距离');
has(world, /this\.intro\.to\.tx = p\.x; this\.intro\.to\.tz = p\.z/, '入场运镜期间聚焦点并入运镜终点');
has(world, /this\.intro\.to\.pitch = T\.pitch/, '入场运镜期间预设并入运镜终点');
has(world, /setViewPreset\(name\) \{/, 'World 定义视角预设');
has(world, /hasOwnProperty\.call\(VIEW_PRESETS, name\)/, '非法预设键回落标准');
has(world, /resetView\(\) \{ return this\.setViewPreset\('standard'\)/, '视角复位接口');
has(main, /import \{ groupBounds, createDoubleTap, VIEW_PRESETS, VIEW_PRESET_KEYS \} from '\.\/camera-focus\.js'/, '主入口引入聚焦层');
has(main, /onGroupFocus: d => focusGroup\(d\)/, '编队芯片聚焦 hook 接线');
has(main, /if \(e\.shiftKey\) \{/, 'Shift + 空格分支');
has(main, /world\.setViewPreset\(key\)/, '视角预设切换调用');
has(main, /if \(groupTap\.tap\(d, Date\.now\(\)\)\) focusGroup\(d\)/, '连按同一数字触发聚焦');
has(main, /const bounds = groupBounds\(ids\.map\(id => sim\.getUnit\(id\)\)\)/, '聚焦用质心与散布');
has(main, /const dist = world\.focusGroup\(bounds\.x, bounds\.z, bounds\.spread\)/, '质心与散布传入 World');
has(main, /if \(!bounds\) return;/, '坐标异常时不动相机');
has(main, /groupTap\.reset\(\); viewPresetIdx = 0;/, '换局重置连击计时与预设序号');
has(main, /groupTap\.reset\(\);   \/\/ 刚编完队/, '保存编队重置连击计时');
has(main, /短间隔连按两次同一数字/, '首次引导补充编队聚焦');
has(uiSrc, /const focusBtn = el\('span', 'grp-focus', '◎'\)/, '芯片新增聚焦按钮');
has(uiSrc, /this\.hooks\.onGroupFocus\(k\)/, '聚焦走主入口统一 hook');
has(uiSrc, /chip\.ondblclick = \(\) =>/, '桌面双击芯片也聚焦');
has(uiSrc, /ev\.stopPropagation\(\)/, '按钮点击不冒泡触发选中');
has(css, /\.grp-focus \{/, '聚焦按钮样式');
has(css, /@media \(pointer: coarse\) \{ \.grp-focus/, '触屏粗指针放大点击区');
has(css, /prefers-reduced-motion: reduce\) \{ \.grp-focus/, '减少动态效果关闭过渡');
has(html, /Shift \+ 空格/, '帮助页补视角预设说明');
has(html, /短间隔连按两次同一数字/, '帮助页补编队聚焦说明');

console.log('— 2) 纯逻辑：质心 / 散布 / 视距 / 连按状态机 —');
const { groupBounds, focusDistance, createDoubleTap, VIEW_PRESETS, VIEW_PRESET_KEYS,
  CAM_DIST_MIN, CAM_DIST_MAX, GROUP_TAP_MS } = await import('./MVP_Web/js/camera-focus.js');
{
  const b = groupBounds([{ x: 0, z: 0 }, { x: 10, z: 0 }]);
  ok(b.x === 5 && b.z === 0 && b.spread === 5 && b.count === 2, '两点队伍质心与散布正确');
  const b2 = groupBounds([{ x: -4, z: 2 }, { x: 4, z: 2 }, null, { x: NaN, z: 1 }, { x: Infinity, z: 5 }, { x: 0, z: 'x' }]);
  ok(b2 && b2.count === 2 && b2.x === 0 && b2.z === 2 && b2.spread === 4, '非法/非有限坐标被过滤，计点不失真');
  ok(groupBounds([]) === null && groupBounds(null) === null && groupBounds(undefined) === null, '空队伍返回 null');
  const b3 = groupBounds([{ x: '12', z: '8' }]);
  ok(b3 && b3.count === 1 && b3.x === 12 && b3.spread === 0, '数字字符串坐标可归一化');
}
{
  ok(focusDistance(0) === 72, '紧凑小队拉近到 72');
  ok(focusDistance(60) === 174, '分散编队拉远到 174');
  ok(focusDistance(1000) === CAM_DIST_MAX - 24, '超大散布限幅到 226');
  ok(focusDistance(-5) === 72, '负散布按 0 处理');
  ok(focusDistance(NaN) === 72 && focusDistance(undefined, null) === 72, '非有限输入按 0 处理');
  ok(focusDistance(0, 78) === 78, '当前视距已在死区内则保持不变');
  ok(focusDistance(0, 150) === 72, '当前视距远离期望值时推进到期望值');
  ok(focusDistance(0, 150, 0) === 72, 'deadzone=0 时不做保留');
  ok(focusDistance(0, 500) === 72 && focusDistance(0, -100) === 72, '异常当前值不污染期望值');
  ok(focusDistance(0, 41) <= CAM_DIST_MAX && focusDistance(0, 41) >= CAM_DIST_MIN, '死区保留值仍做全局限幅');
}
{
  ok(VIEW_PRESET_KEYS.length === 3 && VIEW_PRESET_KEYS.join(',') === 'standard,overhead,low', '预设顺序为 标准→俯瞰→低角');
  ok(VIEW_PRESET_KEYS.every(k => {
    const p = VIEW_PRESETS[k];
    return p && p.label && Number.isFinite(p.yaw) && p.pitch >= 0.28 && p.pitch <= 1.32
      && p.dist >= CAM_DIST_MIN && p.dist <= CAM_DIST_MAX;
  }), '所有预设角度/距离在合法范围内');
  ok(GROUP_TAP_MS === 380, '连按窗口为 380ms');
}
{
  const tap = createDoubleTap(380);
  ok(tap.tap('1', 1000) === false, '首次按下不聚焦');
  ok(tap.tap('1', 1380) === true, '窗口边界内第二次按下触发');
  ok(tap.tap('1', 1400) === false, '命中后重置，三连击不重复触发');
  ok(tap.tap('1', 1760) === true, '下一轮连按可再次触发');
  tap.reset();
  ok(tap.tap('1', 2000) === false, 'reset 清空计时');
  ok(tap.tap('2', 2100) === false, '换编队号重新开始计时');
  ok(tap.tap('1', 2200) === false, '不同 key 不算连按');
  ok(tap.tap('1', 2600) === false, '超时后不算连按');
  ok(tap.tap('1', Infinity) === false && tap.tap('1', NaN) === false, '非法时钟不触发');
  const tap2 = createDoubleTap(380);
  tap2.tap('1', 0);
  ok(tap2.tap('1', 381) === false, '超出窗口 1ms 也不触发');
}

console.log('— 3) World 相机目标行为 —');
try {
  const { World } = await import('./MVP_Web/js/world.js');
  const w = Object.create(World.prototype);
  w.cam = { dist: 150, yaw: Math.PI, pitch: 0.92, tx: 0, tz: 0 };
  w._camT = { dist: 150, yaw: Math.PI, pitch: 0.92 };
  w._camFocusT = null; w.follow = false; w._frameDt = 1;
  w.setFollow = World.prototype.setFollow;
  const d0 = w.focusGroup(30, -20, 0);
  ok(d0 === 72, '聚焦紧凑编队把目标距离推近到 72');
  ok(w.cam.dist === 150, '不直接写 cam.dist（交由阻尼平滑逼近）');
  ok(w._camT.dist === 72, '目标距离写入阻尼目标');
  ok(w._camFocusT && w._camFocusT.x === 30 && w._camFocusT.z === -20, '落点写入平滑聚焦缓动');
  ok(w.cam.tx === 0 && w.cam.tz === 0, '当前帧不瞬移镜头');
  ok(w.follow === false, '聚焦时退出跟随模式');
  const d1 = w.focusGroup(10, 10, 100);
  ok(d1 === CAM_DIST_MAX - 24, '大范围编队拉远并限幅');
  ok(w._camFocusT.x === 10 && w._camFocusT.z === 10, '聚焦目标随新编队更新');
  const before = { ...w._camT };
  ok(w.focusGroup(NaN, 2, 10) === null, '非法坐标直接返回 null');
  ok(w.focusGroup(2, Infinity, 10) === null, '非有限 z 也拒绝');
  ok(w._camT.dist === before.dist && w._camFocusT.x === 10, '非法入参不改相机任何目标');
  w._camT.dist = 78;
  ok(w.focusGroup(0, 0, 0) === 78, '接近期望视距时保留用户缩放');
  const keep = { x: w._camFocusT.x, z: w._camFocusT.z };
  ok(w.setViewPreset('overhead') === 'overhead', '切换到俯瞰预设');
  ok(w._camT.pitch === 1.28 && w._camT.dist === 178 && w._camT.yaw === Math.PI, '预设写入角度与距离目标');
  ok(w.cam.dist === 150 && w.cam.pitch === 0.92, '预设同样不硬改当前相机值');
  ok(w.cam.tx === 0 && w.cam.tz === 0, '预设不动镜头落点');
  ok(w._camFocusT.x === keep.x && w._camFocusT.z === keep.z, '预设不打断正在进行的聚焦缓动');
  ok(w.setViewPreset('__bad__') === 'standard' && w._camT.pitch === 0.92, '非法键回落标准预设');
  ok(w.setViewPreset() === 'standard', '缺参回落标准预设');
  ok(w.resetView() === 'standard' && w._camT.dist === 150, 'resetView 等价标准预设');
  ok(w.setViewPreset('low') === 'low' && w._camT.pitch === 0.46, '低角预设可用');
  w.intro = { t: 0, dur: 2.6, from: { tx: 0, tz: 0, dist: 260, pitch: 1.24, yaw: Math.PI + 0.55 },
    to: { tx: 0, tz: 60, dist: 150, pitch: 0.92, yaw: Math.PI } };
  w.focusGroup(44, -33, 0);
  ok(w.intro.to.tx === 44 && w.intro.to.tz === -33, '运镜中的聚焦写入终点落点');
  ok(w.intro.to.dist === 72, '运镜中的聚焦写入终点视距');
  w.setViewPreset('overhead');
  ok(w.intro.to.pitch === 1.28 && w.intro.to.dist === 178 && w.intro.to.yaw === Math.PI, '运镜中的预设写入终点角度');
  w.intro = null;
  w.focusGroup(44, -33, 0);
  ok(!w.intro && w._camFocusT.x === 44, '运镜结束后恢复普通平滑聚焦');
} catch (e) {
  console.log('  ! World 行为测试异常：' + (e && e.stack ? e.stack : e));
  fail++;
}

console.log('— 4) UI 编队芯片交互 —');
try {
  const { UI } = await import('./MVP_Web/js/ui.js');
  const { SIDES } = await import('./MVP_Web/js/rts.js');
  const savedDoc = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const mk = tag => ({
    tagName: tag, className: '', innerHTML: '', title: '', children: [],
    onclick: null, ondblclick: null, appendChild(c) { this.children.push(c); },
  });
  const box = mk('div');
  Object.defineProperty(box, 'innerHTML', {
    configurable: true,
    get() { return this._html || ''; },
    set(v) { this._html = v; if (v === '') this.children.length = 0; },
  });
  globalThis.document = {
    createElement: mk,
    getElementById: id => id === 'groups' ? box : null,
    querySelector: () => null,
  };
  const alive = {
    1: { id: 1, side: SIDES.PLAYER, x: 10, z: 10 },
    2: { id: 2, side: SIDES.PLAYER, x: 20, z: 10 },
    3: { id: 3, side: SIDES.ENEMY, x: 30, z: 10 },
  };
  const simStub = { getUnit: id => alive[id] || null, selected: new Set(), selectedBuilding: null };
  const focused = [], toasts = [];
  let stopped = 0;
  const ui = Object.create(UI.prototype);
  ui.game = { groups: { 1: [1, 2, 3, 999] } };
  ui.sim = simStub;
  ui.hooks = { onGroupFocus: d => focused.push(d) };
  ui._grpSig = '';
  ui.toast = t => toasts.push(t);
  ui._refreshGroups();
  ok(ui.game.groups[1].length === 2, '刷新时裁剪阵亡/敌方单位');
  ok(box.children.length === 1, '渲染 1 个编队芯片');
  const chip = box.children[0];
  ok(chip.innerHTML.includes('×2') && chip.className === 'grp-chip', '芯片显示存活数量');
  ok(chip.title.includes('◎ 聚焦镜头'), '芯片提示说明聚焦操作');
  const focusBtn = chip.children[0];
  ok(focusBtn && focusBtn.className === 'grp-focus' && focusBtn.innerHTML === '◎', '芯片内含聚焦按钮');
  focusBtn.onclick({ stopPropagation() { stopped++; } });
  ok(stopped === 1 && focused.length === 1 && focused[0] === '1', '点 ◎ 触发统一聚焦 hook 且不冒泡');
  ok(simStub.selected.size === 0, '点 ◎ 不会误触发整枚芯片的选中逻辑');
  chip.onclick();
  ok(simStub.selected.size === 2 && toasts.some(t => t.includes('选中编队 1')), '点芯片仍按原行为选中编队');
  chip.ondblclick();
  ok(focused.length === 2, '双击芯片也触发聚焦');
  ui._refreshGroups();
  ok(box.children.length === 1, '签名不变时跳过重建（无 DOM 抖动）');
  ui.game.groups = { 2: [999] };
  ui._refreshGroups();
  ok(box.children.length === 0 && !('2' in ui.game.groups), '全灭编队自动清理');
  if (savedDoc) Object.defineProperty(globalThis, 'document', savedDoc);
  else delete globalThis.document;
} catch (e) {
  console.log('  ! UI 行为测试异常：' + (e && e.stack ? e.stack : e));
  fail++;
}

console.log(`\nBATCH31 ${fail === 0 ? 'ALL_PASS' : 'FAILED'}  pass=${pass} fail=${fail}`);
if (fail) process.exitCode = 1;
