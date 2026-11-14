/* 指挥官档案：纯前端本地身份与战绩持久化（无后端、无网络请求）。
 * B 侧独立模块，不依赖模拟层；localStorage 不可用（隐私模式 / 禁用存储）时
 * 自动退化为内存档案，绝不让登录体验或结算流程抛错。
 * 所有字段读取都做类型收敛：旧版本、被手工篡改或半写入的数据也不会让界面
 * 出现 undefined / NaN。档案代号会进入 innerHTML，故统一做字符白名单清洗。 */

const KEY = 'ant_epoch_profile_v1';
const MAX_RECENT = 8;
const NAME_MIN = 2;
const NAME_MAX = 12;

// 按累计胜场进阶的徽记：颜色用于 CSS 变量，glyph 为纯文本符号（不加载外部字体）
const BADGES = [
  { min: 0,  tier: 0, label: '初生工蚁',   glyph: '◌', color: '#9aa489' },
  { min: 1,  tier: 1, label: '巢穴卫兵',   glyph: '◈', color: '#9fe0a0' },
  { min: 3,  tier: 2, label: '战团统领',   glyph: '◆', color: '#7ef0c8' },
  { min: 8,  tier: 3, label: '纪元执政官', glyph: '✦', color: '#ffd27f' },
  { min: 20, tier: 4, label: '蚁纪元老',   glyph: '✧', color: '#ff9f7f' },
];

let memory = null;          // localStorage 完全不可用时的进程内档案
let storageBroken = false;  // 一旦写入失败就不再反复尝试，避免每帧异常

function int(v, lo = 0, hi = Number.MAX_SAFE_INTEGER) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
}
function str(v, max = 40) { return String(v == null ? '' : v).slice(0, max); }
/** 会进入 innerHTML 的文本（导入档案的 recent 字段）额外去掉 HTML 注入字符。 */
function safeStr(v, max = 40) { return str(v, max).replace(/[<>&"'`\\]/g, ''); }

/** 代号清洗：去控制字符 / HTML 注入字符 / 首尾空白，限长。返回清洗结果（可能为空）。 */
export function cleanName(raw) {
  return String(raw == null ? '' : raw)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>&"'`\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
}
/** 校验代号，合法返回清洗后的字符串，非法返回 null。 */
export function validName(raw) {
  const s = cleanName(raw);
  return s.length >= NAME_MIN && s.length <= NAME_MAX ? s : null;
}
function guestName() {
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return '指挥官·' + (r.length >= 4 ? r : (r + 'A4B8').slice(0, 4));
}
export function fmtTime(sec) {
  const s = int(sec, 0, 86400 * 7);
  const m = Math.floor(s / 60);
  return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
export function badgeOf(p) {
  const wins = int(p && p.wins);
  let b = BADGES[0];
  for (const item of BADGES) if (wins >= item.min) b = item;
  return { ...b, wins };
}

function defaults() {
  return {
    name: '', createdAt: 0, games: 0, wins: 0, losses: 0, kills: 0,
    bestWinSec: 0, longestSec: 0, recent: [],
  };
}

function normalize(d) {
  const p = defaults();
  if (!d || typeof d !== 'object' || Array.isArray(d)) return p;
  p.name = cleanName(d.name);
  p.createdAt = int(d.createdAt, 0, 4102444800000);   // 上限 2100 年，挡住离谱时间戳
  p.games = int(d.games); p.wins = int(d.wins, 0, p.games);
  p.losses = int(d.losses, 0, p.games - p.wins);
  p.kills = int(d.kills);
  p.bestWinSec = int(d.bestWinSec, 0, 86400 * 7);
  p.longestSec = int(d.longestSec, 0, 86400 * 7);
  if (Array.isArray(d.recent)) {
    p.recent = d.recent.slice(0, MAX_RECENT).filter(r => r && typeof r === 'object').map(r => ({
      win: !!r.win, sec: int(r.sec, 0, 86400 * 7), kills: int(r.kills),
      mode: safeStr(r.mode, 16), chapter: int(r.chapter, 0, 99),
      species: safeStr(r.species, 24), difficulty: safeStr(r.difficulty, 16),
      at: int(r.at, 0, 4102444800000),
    }));
  }
  return p;
}

function readRaw() {
  // 优先读磁盘：这样其他标签页的修改能被看见，被清空的存储也能正确回到「新档案」。
  // 仅当存储完全不可用（隐私模式 / 抛异常）时才退回进程内副本。
  if (storageBroken) return memory;
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { storageBroken = true; return memory; }
  if (!raw) { memory = null; return null; }   // 外部清空存储 → 同步回到「新档案」
  try {
    const d = JSON.parse(raw);
    memory = d;                       // 保持内存副本与磁盘一致
    return d;
  } catch { return null; }            // 半写入 / 被篡改 → 当新档案，不吞掉异常
}
function write(p) {
  memory = p;
  if (storageBroken) return;
  try { localStorage.setItem(KEY, JSON.stringify(p)); }
  catch { storageBroken = true; }   // 退化为内存态，本次会话仍可用
}

/** 读取档案；首次访问自动生成一个可修改的访客代号，并用 isNew 标记欢迎语。 */
function state() {
  const d = readRaw();
  let p = normalize(d);
  let isNew = false;
  if (!p.name) {
    isNew = !d;                 // 有旧数据但代号被清空 → 修复而非当作新玩家欢迎
    p.name = guestName();
    p.createdAt = Date.now();
    write(p);
  }
  if (!p.createdAt) { p.createdAt = Date.now(); write(p); }
  return { ...p, isNew };
}

/** 派生统计，全部为可直接渲染的成品字符串 / 数字。 */
export function summary(p) {
  const s = normalize(p);
  return {
    games: s.games, wins: s.wins, losses: s.losses, kills: s.kills,
    winRate: s.games ? Math.round(s.wins / s.games * 100) : 0,
    bestWin: s.bestWinSec ? fmtTime(s.bestWinSec) : '—',
    longest: s.longestSec ? fmtTime(s.longestSec) : '—',
    badge: badgeOf(s),
  };
}

export const Profile = {
  /** 返回规范化档案副本（含 isNew 标记，不写盘）。 */
  get() { return state(); },
  /** 设定代号：非法输入返回 {ok:false,error}，绝不写盘。 */
  setName(raw) {
    const name = validName(raw);
    if (!name) return { ok: false, error: `代号需 ${NAME_MIN}–${NAME_MAX} 个字符（支持中文 / 字母 / 数字）` };
    const p = normalize(state());
    p.name = name;
    write(p);
    return { ok: true, name, profile: { ...p, isNew: false } };
  },
  /** 记录一局战绩，返回结算页需要的「新纪录 / 晋级」标记。 */
  record(res) {
    const r = res && typeof res === 'object' ? res : {};
    const p = normalize(state());
    const before = badgeOf(p).tier;
    const win = !!r.win;
    const sec = int(r.seconds, 0, 86400 * 7);
    const kills = int(r.kills);
    p.games += 1;
    if (win) p.wins += 1; else p.losses += 1;
    p.kills += kills;
    p.longestSec = Math.max(p.longestSec, sec);
    let newBestWin = false;
    if (win && sec > 0 && (p.bestWinSec === 0 || sec < p.bestWinSec)) {
      p.bestWinSec = sec;
      newBestWin = p.wins > 1;      // 首胜不弹「新纪录」，避免开局即刷提示
    }
    p.recent.unshift({
      win, sec, kills,
      mode: str(r.mode, 16), chapter: int(r.chapter, 0, 99),
      species: str(r.species, 24), difficulty: str(r.difficulty, 16),
      at: Date.now(),
    });
    p.recent = p.recent.slice(0, MAX_RECENT);
    write(p);
    const after = badgeOf(p);
    return {
      profile: { ...p, isNew: false },
      badge: after,
      rankUp: after.tier > before,
      newBestWin,
      summary: summary(p),
    };
  },
  /** 导出可迁移的档案文本（带版本标记；只写归一化字段，不含 isNew 等临时态）。 */
  exportText() {
    return JSON.stringify({ app: 'yijigonghe', v: 1, profile: normalize(state()) }, null, 2);
  },
  /** 导入档案：支持本工具导出的包装对象，也兼容裸 profile 对象。
   *  长度、JSON、应用标记与必要字段四道校验；任何异常都不写盘、不吞掉提示。 */
  importText(raw) {
    const text = String(raw == null ? '' : raw);
    if (!text.trim()) return { ok: false, error: '档案文件为空' };
    if (text.length > 65536) return { ok: false, error: '档案文件过大（上限 64 KB）' };
    let d = null;
    try { d = JSON.parse(text); } catch { return { ok: false, error: '档案文件不是合法的 JSON' }; }
    if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, error: '档案格式不正确' };
    if (d.app != null && d.app !== 'yijigonghe') return { ok: false, error: '不是蚁纪·共时的档案文件' };
    if (d.v != null && d.v !== 1) return { ok: false, error: '不支持此档案版本，请使用版本 1 的备份' };
    if ('profile' in d && (!d.profile || typeof d.profile !== 'object' || Array.isArray(d.profile))) {
      return { ok: false, error: '档案内容格式不正确' };
    }
    const src = (d.profile && typeof d.profile === 'object' && !Array.isArray(d.profile)) ? d.profile : d;
    if (!('name' in src) && !('games' in src) && !('recent' in src)) {
      return { ok: false, error: '档案内容缺少必要字段' };
    }
    const p = normalize(src);               // 收敛所有字段，挡住被篡改 / 半写入的数据
    if (!p.name) p.name = guestName();      // 代号被清空时补一个访客代号
    if (!p.createdAt) p.createdAt = Date.now();
    write(p);
    return { ok: true, profile: { ...p, isNew: false } };
  },
  /** 重置档案（保留代号，清空战绩），返回新档案。 */
  reset() {
    const old = normalize(state());
    const p = defaults();
    p.name = old.name || guestName();
    p.createdAt = Date.now();
    write(p);
    return { ...p, isNew: false };
  },
  /** 供测试 / 存档迁移使用：整份覆盖（会先归一化）。 */
  replace(d) { const p = normalize(d); write(p); return { ...p, isNew: false }; },
};

export default Profile;
