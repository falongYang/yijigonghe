/* 触屏 / 触控笔交互层（纯 B 侧，不依赖模拟层与 three）。
 *
 * 背景：主画布原先只监听 mousedown / mousemove / mouseup / wheel，CSS 虽已有窄屏
 * 响应式布局，但在平板与触屏笔记本上根本无法点选、下令或缩放。这里用 Pointer Events
 * 补齐手势，并且只对非鼠标指针生效——鼠标路径继续走 main.js 既有逻辑，互不干扰。
 *
 * 手势约定：
 *   单指轻点         → tap(x,y)        （等同左键点选；连续两次由 pickAt 复用双击全选）
 *   单指长按         → longPress(x,y)  （等同右键指令）
 *   单指拖动         → pan(dx,dy)      （跟手平移镜头）
 *   双指捏合         → zoom(deltaY,px,py)（换算成与滚轮同源的 deltaY，锚定双指中点）
 *   双指同向移动     → pan(dx,dy)
 *   双指旋转         → rotate(dyawPx,0)（换算成与中键拖动同源的像素增量）
 *
 * 所有回调都做存在性判断；手势期间暂停、引导、显卡中断由外部 enabled() 决定。
 * 时钟与定时器可注入，便于在 Node 里用桩件跑确定性测试。
 */

const DRAG_PX = 8;        // 超过该位移视为拖动，不再触发点选 / 长按
const TAP_MS = 340;       // 轻点最长时长（与 pickAt 双击窗口一致）
const TAP_SLOP = 12;      // 轻点允许的总位移
const LONG_MS = 520;      // 长按触发时长
const SUPPRESS_MS = 850;  // 触控后抑制浏览器合成的兼容鼠标事件
const SUPPRESS_DIST = 56; // 且坐标需落在最后一次触点附近
const WHEEL_K = 0.0012;   // 与 World.zoom 的滚轮系数保持一致
const ROTATE_K = 0.005;   // 与 World.rotate 的角度系数保持一致

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const defaultNow = () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
  ? performance.now() : Date.now());

let lastTouch = { t: -Infinity, x: -99999, y: -99999 };
function markTouch(x, y, t) {
  lastTouch = { t, x: Number.isFinite(x) ? x : lastTouch.x, y: Number.isFinite(y) ? y : lastTouch.y };
}

/**
 * 判断一个 mouse 事件是否为触屏手势之后浏览器补发的「兼容鼠标事件」。
 * 命中即消费掉标记（一次性），避免触控后短时间内真实鼠标操作被持续误伤。
 */
export function isSyntheticMouse(e, now = defaultNow()) {
  const t = now();
  if (t - lastTouch.t > SUPPRESS_MS) return false;
  const x = e && e.clientX, y = e && e.clientY;
  const near = !Number.isFinite(x) || !Number.isFinite(y)
    || Math.hypot(x - lastTouch.x, y - lastTouch.y) <= SUPPRESS_DIST;
  if (near) lastTouch = { t: -Infinity, x: -99999, y: -99999 };
  return near;
}

/**
 * 当前是否处于「触屏活跃窗口」（不消费标记）。主循环用它暂时关掉鼠标贴边滚屏与
 * 地貌提示：触屏没有 hover，浏览器补发的兼容 mousemove 不该让镜头自己漂走。
 */
export function isTouchActive(now = defaultNow()) {
  return now() - lastTouch.t <= SUPPRESS_MS;
}

/** 仅测试 / 热重载需要：清空合成事件标记。 */
export function resetSyntheticMouse() {
  lastTouch = { t: -Infinity, x: -99999, y: -99999 };
}

export class TouchController {
  constructor(canvas, hooks = {}, opts = {}) {
    this.canvas = canvas;
    this.hooks = hooks;
    this.now = opts.now || defaultNow;
    this.setTimer = opts.setTimeout || ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimeout || (id => clearTimeout(id));
    this.pts = new Map();          // pointerId → 触点轨迹
    this.mode = 'idle';            // idle | single | gesture | block
    this.dragging = false;
    this.longFired = false;
    this.longTimer = null;
    this.g = null;                 // 双指上一帧快照
    this._seen = false;            // 首次触屏提示只发一次
    this._bound = [];
    this._call = (name, ...args) => {
      const fn = this.hooks[name];
      if (typeof fn === 'function') fn(...args);
    };
  }

  /** 注册监听；pointerdown 落在画布上，move/up/cancel 挂 window 以覆盖手指划出画布的情况。 */
  bind() {
    if (!this.canvas || typeof this.canvas.addEventListener !== 'function') return this;
    const add = (target, type, fn) => {
      target.addEventListener(type, fn);
      this._bound.push([target, type, fn]);
    };
    add(this.canvas, 'pointerdown', e => this._down(e));
    add(globalThis.window || this.canvas, 'pointermove', e => this._move(e));
    add(globalThis.window || this.canvas, 'pointerup', e => this._up(e, false));
    add(globalThis.window || this.canvas, 'pointercancel', e => this._up(e, true));
    return this;
  }

  destroy() {
    this._clearLong();
    for (const [target, type, fn] of this._bound) {
      try { target.removeEventListener(type, fn); } catch { /* 忽略桩件 */ }
    }
    this._bound.length = 0;
    this.pts.clear();
    this.mode = 'idle';
    this.g = null;
    this.dragging = false;
  }

  _clearLong() {
    if (this.longTimer != null) { try { this.clearTimer(this.longTimer); } catch { /* ignore */ } }
    this.longTimer = null;
  }

  _enabled() {
    const fn = this.hooks.enabled;
    return typeof fn === 'function' ? !!fn() : true;
  }

  _armLong(p) {
    this._clearLong();
    const id = p.id;
    this.longTimer = this.setTimer(() => {
      this.longTimer = null;
      const q = this.pts.get(id);
      if (this.mode !== 'single' || this.longFired || this.dragging || this.pts.size !== 1 || !q) return;
      if (Math.hypot(q.x - q.sx, q.y - q.sy) > TAP_SLOP) return;
      this.longFired = true;
      this._call('longPress', q.x, q.y);
    }, LONG_MS);
  }

  _down(e) {
    // 鼠标完全交给既有 mousedown / wheel 逻辑；pen 与 touch 走手势层。
    if (!e || e.pointerType === 'mouse') return;
    const t = this.now();
    const x = Number(e.clientX) || 0, y = Number(e.clientY) || 0;
    markTouch(x, y, t);
    if (e.cancelable && typeof e.preventDefault === 'function') e.preventDefault(); // 抑制兼容鼠标事件
    if (!this._seen && e.pointerType === 'touch') { this._seen = true; this._call('firstTouch'); }
    const p = { id: e.pointerId, x, y, lx: x, ly: y, sx: x, sy: y, t };
    this.pts.set(p.id, p);
    try { this.canvas.setPointerCapture(p.id); } catch { /* 老浏览器忽略 */ }
    if (!this._enabled()) { this.mode = 'block'; return; }
    if (this.pts.size >= 2) { this._beginGesture(); return; }
    if (this.mode === 'block' || this.mode === 'gesture') return;
    this.mode = 'single';
    this.longFired = false;
    this.dragging = false;
    this._armLong(p);
  }

  _move(e) {
    if (!e || e.pointerType === 'mouse') return;
    const p = this.pts.get(e.pointerId);
    if (!p) return;
    const x = Number(e.clientX) || 0, y = Number(e.clientY) || 0;
    markTouch(x, y, this.now());
    if (e.cancelable && typeof e.preventDefault === 'function') e.preventDefault();
    p.lx = p.x; p.ly = p.y; p.x = x; p.y = y;
    if (this.mode === 'gesture') { this._gesture(); return; }
    if (this.mode !== 'single' || this.longFired || this.pts.size !== 1) return;
    if (!this.dragging && Math.hypot(x - p.sx, y - p.sy) > DRAG_PX) {
      this.dragging = true;
      this._clearLong();
      this._call('drag', true);
    }
    if (this.dragging) this._call('pan', x - p.lx, y - p.ly);
  }

  _gesture() {
    if (this.pts.size < 2) return;
    const [a, b] = [...this.pts.values()];
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const ang = Math.atan2(dy, dx);
    const prev = this.g;
    this.g = { dist, cx, cy, ang };
    if (!prev || !prev.dist || dist < 8) return;
    // 捏合：ratio>1 表示双指张开 → deltaY<0 → 与滚轮向上滚同义（拉近）
    const ratio = dist / prev.dist;
    if (ratio > 0.02 && Math.abs(ratio - 1) > 0.004) {
      const deltaY = clamp((1 / ratio - 1) / WHEEL_K, -900, 900);
      this._call('zoom', deltaY, cx, cy);
    }
    // 双指同向拖动：中点位移直接换算为镜头平移
    const mdx = cx - prev.cx, mdy = cy - prev.cy;
    if (Math.abs(mdx) + Math.abs(mdy) > 0.5) this._call('pan', mdx, mdy);
    // 双指旋转：角度差归一到 (-π,π]，按中键拖动系数换算为像素增量
    let da = ang - prev.ang;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    if (Math.abs(da) > 0.012) this._call('rotate', clamp(-da / ROTATE_K, -140, 140), 0);
  }

  _beginGesture() {
    this._clearLong();
    if (this.dragging) this._call('drag', false);
    this.dragging = false;
    this.longFired = false;
    this.mode = 'gesture';
    this.g = null;
    this._gesture();   // 建立首帧基线，避免第二指落下瞬间跳变
  }

  _up(e, cancelled) {
    if (!e || e.pointerType === 'mouse') return;
    markTouch(e.clientX, e.clientY, this.now());
    const p = this.pts.get(e.pointerId);
    // pointerup 自带最终坐标：即使中途没有 pointermove，也要按抬手位置复核轻点位移，
    // 避免手指悄悄划开一段却仍被当成一次点选。
    if (p) {
      const ux = Number(e.clientX), uy = Number(e.clientY);
      if (Number.isFinite(ux)) p.x = ux;
      if (Number.isFinite(uy)) p.y = uy;
    }
    this.pts.delete(e.pointerId);
    try { this.canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    this._clearLong();
    if (!cancelled && p && this.mode === 'single' && !this.longFired && !this.dragging && this.pts.size === 0) {
      const dt = this.now() - p.t;
      if (dt <= TAP_MS && Math.hypot(p.x - p.sx, p.y - p.sy) <= TAP_SLOP) this._call('tap', p.x, p.y);
    }
    if (this.dragging && this.pts.size === 0) { this._call('drag', false); this.dragging = false; }
    if (this.pts.size >= 2) { this._beginGesture(); return; }
    // 双指手势结束后剩下的那根手指不参与点选 / 拖动，等全部抬起再恢复
    if (this.pts.size === 1) { this.mode = 'block'; this.g = null; return; }
    this.mode = 'idle';
    this.g = null;
    this.longFired = false;
  }
}

/** 便捷工厂：绑定并返回控制器（调用方保存引用以便 destroy）。 */
export function bindTouchInput(canvas, hooks, opts) {
  return new TouchController(canvas, hooks, opts).bind();
}

export default bindTouchInput;
