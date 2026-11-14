/* 相机聚焦 / 编队跳转 / 视角预设（B 侧纯逻辑层）
 * 不依赖 DOM、three 或模拟层，便于单测与复用；所有入参都做有限性清洗。
 * 约定：相机距离只写「阻尼目标」_camT.dist，绝不直接写 cam.dist，
 *       因此与滚轮、捏合、事件推拉共用同一条平滑通道，不会硬跳或互相覆盖。
 */
export const CAM_DIST_MIN = 42;
export const CAM_DIST_MAX = 250;
export const GROUP_TAP_MS = 380;

/** 视角预设：只改 yaw / pitch / dist 的目标值，不动镜头落点 tx/tz。 */
export const VIEW_PRESETS = {
  standard: { label: '标准', yaw: Math.PI, pitch: 0.92, dist: 150 },
  overhead: { label: '俯瞰', yaw: Math.PI, pitch: 1.28, dist: 178 },
  low:      { label: '低角', yaw: Math.PI, pitch: 0.46, dist: 128 },
};
export const VIEW_PRESET_KEYS = Object.keys(VIEW_PRESETS);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * 编队质心与散布半径。过滤非有限坐标与空对象；
 * 返回 null 表示没有可聚焦单位（调用方应直接跳过，不要给相机写 0,0）。
 */
export function groupBounds(units) {
  const pts = [];
  let sx = 0, sz = 0;
  for (const u of (units || [])) {
    if (!u) continue;
    const x = Number(u.x), z = Number(u.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    sx += x; sz += z;
    pts.push({ x, z });
  }
  const count = pts.length;
  if (!count) return null;
  const x = sx / count, z = sz / count;
  let spread = 0;
  for (const p of pts) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d > spread) spread = d;
  }
  return { x, z, spread, count };
}

/**
 * 按队伍散布求相机目标距离：紧凑小队靠近、大范围编队拉远。
 * current 与期望值差小于 deadzone 时保持当前缩放，避免反复聚焦时镜头无谓抽动。
 */
export function focusDistance(spread, current = NaN, deadzone = 12) {
  const s = Number(spread);
  const sp = Number.isFinite(s) ? Math.max(0, s) : 0;
  const want = clamp(72 + sp * 1.7, CAM_DIST_MIN + 12, CAM_DIST_MAX - 24);
  const c = Number(current);
  if (Number.isFinite(c) && Math.abs(c - want) <= Math.max(0, Number(deadzone) || 0)) {
    return clamp(c, CAM_DIST_MIN, CAM_DIST_MAX);
  }
  return want;
}

/**
 * 通用「连按两次」状态机：同一 key 在窗口内第二次按下才返回 true，
 * 命中后即重置，三连击不会重复触发；换 key 或超时重新开始计时。
 * now 可注入，便于测试与无时钟环境。
 */
export function createDoubleTap(windowMs = GROUP_TAP_MS) {
  const win = Number.isFinite(Number(windowMs)) ? Math.max(1, Number(windowMs)) : GROUP_TAP_MS;
  let lastKey = null, lastAt = -Infinity;
  return {
    tap(key, now = Date.now()) {
      const t = Number(now);
      if (!Number.isFinite(t)) return false;
      const k = String(key);
      const hit = lastKey === k && t >= lastAt && t - lastAt <= win;
      if (hit) { lastKey = null; lastAt = -Infinity; }
      else { lastKey = k; lastAt = t; }
      return !!hit;
    },
    reset() { lastKey = null; lastAt = -Infinity; },
  };
}
