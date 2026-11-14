/* 六章战场「规则与数值」配置（逻辑层独占）。
 * water 为视觉水域圆盘兼地形约束（海兵资源点应落在其内），nodes 为资源点布局。
 * 美术主题来自 map-art.js；组装后由 rts.js 转出，保持既有 import 路径不变。
 */
import { MAP_ART } from './map-art.js';

export const MAP_RULES = [
  { // 0 焦土平原
    water: [{ x: 60, z: -30, r: 14 }],
    nodes: [
      { x: 0, z: 0, amt: 900, domain: 'land', res: 'bio' },
      { x: -30, z: 22, amt: 560, domain: 'land', res: 'bio' }, { x: 30, z: -22, amt: 560, domain: 'land', res: 'bio' },
      { x: -62, z: 30, amt: 640, domain: 'sea', res: 'bio' }, { x: 58, z: -34, amt: 640, domain: 'sea', res: 'bio' },
      { x: 0, z: 62, amt: 520, domain: 'air', res: 'bio' }, { x: -62, z: -28, amt: 520, domain: 'air', res: 'bio' },
      { x: -58, z: -8, amt: 700, domain: 'underground', res: 'min' }, { x: 58, z: 8, amt: 700, domain: 'underground', res: 'min' }, { x: 0, z: -60, amt: 460, domain: 'underground', res: 'min' },
    ],
  },
  { // 1 阡陌沃野
    water: [{ x: -58, z: 30, r: 12 }],
    nodes: [
      { x: 0, z: 4, amt: 820, domain: 'land', res: 'bio' }, { x: -42, z: 14, amt: 560, domain: 'land', res: 'bio' }, { x: 42, z: -14, amt: 560, domain: 'land', res: 'bio' }, { x: 0, z: -34, amt: 480, domain: 'land', res: 'bio' },
      { x: -58, z: 30, amt: 640, domain: 'sea', res: 'bio' }, { x: 58, z: -32, amt: 640, domain: 'sea', res: 'bio' },
      { x: 0, z: 60, amt: 520, domain: 'air', res: 'bio' }, { x: -56, z: -24, amt: 520, domain: 'air', res: 'bio' },
      { x: -58, z: 0, amt: 820, domain: 'underground', res: 'min' }, { x: 58, z: 0, amt: 820, domain: 'underground', res: 'min' }, { x: 0, z: -58, amt: 560, domain: 'underground', res: 'min' },
    ],
  },
  { // 2 壁垒荒原
    water: [],
    nodes: [
      { x: 0, z: 14, amt: 820, domain: 'land', res: 'bio' }, { x: -26, z: 26, amt: 520, domain: 'land', res: 'bio' }, { x: 26, z: -26, amt: 520, domain: 'land', res: 'bio' },
      { x: -62, z: 28, amt: 600, domain: 'sea', res: 'bio' }, { x: 62, z: -28, amt: 600, domain: 'sea', res: 'bio' },
      { x: -55, z: 40, amt: 480, domain: 'air', res: 'bio' }, { x: 55, z: -40, amt: 480, domain: 'air', res: 'bio' },
      { x: -58, z: -6, amt: 720, domain: 'underground', res: 'min' }, { x: 58, z: 6, amt: 720, domain: 'underground', res: 'min' }, { x: 0, z: -56, amt: 520, domain: 'underground', res: 'min' },
    ],
  },
  { // 3 通津泽国
    water: [{ x: 0, z: 0, r: 30 }, { x: 55, z: 22, r: 14 }, { x: -55, z: -22, r: 14 }],
    nodes: [
      { x: -30, z: 30, amt: 560, domain: 'land', res: 'bio' }, { x: 30, z: -30, amt: 560, domain: 'land', res: 'bio' }, { x: 0, z: 40, amt: 460, domain: 'land', res: 'bio' },
      { x: 0, z: 0, amt: 760, domain: 'sea', res: 'bio' }, { x: 55, z: 22, amt: 620, domain: 'sea', res: 'bio' }, { x: -55, z: -22, amt: 620, domain: 'sea', res: 'bio' },
      { x: 0, z: 62, amt: 520, domain: 'air', res: 'bio' }, { x: -58, z: -24, amt: 520, domain: 'air', res: 'bio' },
      { x: -58, z: 8, amt: 700, domain: 'underground', res: 'min' }, { x: 58, z: -8, amt: 700, domain: 'underground', res: 'min' }, { x: 0, z: -60, amt: 480, domain: 'underground', res: 'min' },
    ],
  },
  { // 4 怒涛海岸
    water: [{ x: 0, z: 30, r: 34 }, { x: 0, z: -30, r: 30 }],
    nodes: [
      { x: -30, z: 0, amt: 560, domain: 'land', res: 'bio' }, { x: 30, z: 0, amt: 560, domain: 'land', res: 'bio' }, { x: 0, z: 6, amt: 460, domain: 'land', res: 'bio' },
      { x: 0, z: 30, amt: 820, domain: 'sea', res: 'bio' }, { x: 0, z: -30, amt: 820, domain: 'sea', res: 'bio' },
      { x: -55, z: 22, amt: 520, domain: 'air', res: 'bio' }, { x: 55, z: -22, amt: 520, domain: 'air', res: 'bio' },
      { x: -58, z: 0, amt: 720, domain: 'underground', res: 'min' }, { x: 58, z: 0, amt: 720, domain: 'underground', res: 'min' }, { x: 0, z: -60, amt: 480, domain: 'underground', res: 'min' },
    ],
  },
  { // 5 回响虚空
    water: [{ x: -50, z: 0, r: 14 }, { x: 50, z: 0, r: 14 }],
    nodes: [
      { x: 0, z: 0, amt: 1000, domain: 'land', res: 'bio' }, { x: -35, z: 25, amt: 560, domain: 'land', res: 'bio' }, { x: 35, z: -25, amt: 560, domain: 'land', res: 'bio' },
      { x: -50, z: 0, amt: 640, domain: 'sea', res: 'bio' }, { x: 50, z: 0, amt: 640, domain: 'sea', res: 'bio' },
      { x: 0, z: 60, amt: 520, domain: 'air', res: 'bio' }, { x: 0, z: -60, amt: 520, domain: 'air', res: 'bio' },
      { x: -55, z: 14, amt: 720, domain: 'underground', res: 'min' }, { x: 55, z: -14, amt: 720, domain: 'underground', res: 'min' }, { x: 0, z: 56, amt: 480, domain: 'underground', res: 'min' },
    ],
  },
];

// 按原字段顺序组装，保证与拆分前 MAP_THEMES 逐字段完全一致
export const MAP_THEMES = MAP_RULES.map((rules, i) => {
  const a = MAP_ART[i];
  return {
    name: a.name, tag: a.tag, desc: a.desc, brief: a.brief,
    pal: a.pal, bg: a.bg, fog: a.fog, scatter: a.scatter,
    water: rules.water,
    props: a.props, weather: a.weather, landmark: a.landmark,
    nodes: rules.nodes,
  };
});

// 遭遇战默认地图（取第 0 章配置）
export const SKIRMISH_MAP = MAP_THEMES[0];
export function getMapConfig(mode, chapter) {
  if (mode === 'campaign' && chapter != null) return MAP_THEMES[chapter % MAP_THEMES.length];
  return SKIRMISH_MAP;
}

/* --------------------------------------------------------------------------
 * 六章「环境规则」：让地图差异不仅体现在美术，也真正改变经济与战斗手感。
 * 纯数值修正，不新增 / 不改动 MAP_THEMES 的任何字段，表现层结构保持不变。
 * 每条都有得有失（如丰饶增资源但信息素井减产），六章整体强度接近，仅风格不同。
 * ------------------------------------------------------------------------ */
const CLIMATE_BASE = {
  regenMul: 1,      // 资源点再生速率
  gatherMul: 1,     // 工蚁采集速率
  wellMul: 1,       // 中立信息素井产出
  phGenMul: 1,      // 建筑自身信息素产出
  ridgeBonus: 0,    // 高台远程射程额外加成（叠加到 TERRAIN.ridge.range）
  waterSlow: 0,     // 浅滩对陆域的额外减速（从 speed 中扣减）
  seaSpeedMul: 1,   // 水栖单位移速
  airSpeedMul: 1,   // 空域单位移速
};

export const MAP_CLIMATES = [
  {
    id: 'scorch', name: '焦土', chapter: '焦土平原',
    desc: '标准战场：资源再生、采集、地形与信息素均为基准值，适合熟悉运营节奏。',
  },
  {
    id: 'verdant', name: '丰饶', chapter: '阡陌沃野',
    desc: '菌圃丰饶：资源点再生 +45%、采集 +10%，但信息素井产出 −10%。',
    regenMul: 1.45, gatherMul: 1.10, wellMul: 0.90,
  },
  {
    id: 'highland', name: '高地', chapter: '壁垒荒原',
    desc: '高台风劲：高台远程射程额外 +14%，但采集 −6%、资源再生 −5%。',
    ridgeBonus: 0.14, gatherMul: 0.94, regenMul: 0.95,
  },
  {
    id: 'wetland', name: '泽国', chapter: '通津泽国',
    desc: '水网密布：浅滩对陆域额外减速 12%，水栖兵种移速 +12%，资源再生 +10%。',
    waterSlow: 0.12, seaSpeedMul: 1.12, regenMul: 1.10,
  },
  {
    id: 'tide', name: '潮汐', chapter: '怒涛海岸',
    desc: '潮池共鸣：信息素井 +50%、巢穴信息素 +25%，采集 −4%。',
    wellMul: 1.50, phGenMul: 1.25, gatherMul: 0.96,
  },
  {
    id: 'echo', name: '共振', chapter: '回响虚空',
    desc: '地脉回响：信息素井 +80%、巢穴信息素 +50%、高台射程额外 +6%，资源再生 −8%。',
    wellMul: 1.80, phGenMul: 1.50, ridgeBonus: 0.06, regenMul: 0.92,
  },
].map(c => ({ ...CLIMATE_BASE, ...c }));

/** 遭遇战用第 0 章基准环境；战役按章节取对应环境。 */
export function getMapClimate(mode, chapter) {
  if (mode === 'campaign' && chapter != null) return MAP_CLIMATES[chapter % MAP_CLIMATES.length];
  return MAP_CLIMATES[0];
}

/* --------------------------------------------------------------------------
 * 逐章「天气」：影响视野半径与远程命中（纯数值，不新增 MAP_THEMES 字段）。
 * hitMul<1 表示恶劣天气让远程弹道更易失准；只作用于真实单位的远程普攻，
 * 能力/危害/溅射不经此结算，避免改变既定能力平衡。
 * 表现层雾效与粒子由 map-art.js 的 weather 字段提供（同名不同对象，互不干扰）。
 * ------------------------------------------------------------------------ */
export const CLIMATE_WEATHER = {
  scorch:    { id: 'clear',     name: '晴空', desc: '视野与命中均为基准。',           visionMul: 1.00, hitMul: 1.00 },
  verdant:   { id: 'rain',      name: '细雨', desc: '雨幕削弱远程命中、略缩视野。',   visionMul: 0.90, hitMul: 0.96 },
  highland:  { id: 'wind',      name: '劲风', desc: '高风扰动远程弹道，视野更开阔。', visionMul: 1.05, hitMul: 0.94 },
  wetland:   { id: 'mist',      name: '薄雾', desc: '雾气大幅压缩视野。',             visionMul: 0.78, hitMul: 0.98 },
  tide:      { id: 'storm',     name: '风暴', desc: '雷暴压低视野与远程命中。',       visionMul: 0.84, hitMul: 0.92 },
  echo:      { id: 'resonance', name: '共振', desc: '地脉回响，视野与命中皆基准。',   visionMul: 1.00, hitMul: 1.00 },
};
/** 遭遇战取第 0 章晴空（全 1.0），故默认对局零影响。 */
export function getMapWeather(mode, chapter) {
  const c = getMapClimate(mode, chapter);
  return CLIMATE_WEATHER[c.id] || CLIMATE_WEATHER.scorch;
}

/* 静态危害地块：战役特定章节的熔岩/酸池区，站在其中的单位持续受灼。
 * 以章节号为键的独立真源（不塞进 MAP_THEMES，保持表现层结构冻结）；
 * 由 sim._tickTerrain 消费；遭遇战（第 0 章）为空，不影响默认对局。 */
export const STATIC_HAZARDS = {
  // 只落在「远离资源点 / 双方巢区」的空旷战术地带：工蚁采集路线不穿越，避免经济塌陷。
  3: [ { x: 40, z: 45, r: 6, dps: 5, type: 'lava' }, { x: -40, z: -45, r: 6, dps: 5, type: 'lava' } ],
  5: [ { x: -42, z: 42, r: 7, dps: 4, type: 'acid' }, { x: 42, z: -42, r: 7, dps: 4, type: 'acid' } ],
};
export function staticHazardsFor(mode, chapter) {
  return (mode === 'campaign' && chapter != null) ? (STATIC_HAZARDS[chapter] || []) : [];
}

/* --------------------------------------------------------------------------
 * 动态战场：天气阶段时间线 + 地脉共振高台（战役专属）。
 * 遭遇战一律返回空时间线 / null，保证默认对局的天气与地形系数恒定、节奏零变化。
 * 时间线只描述「何时切到哪种天气」，切换本身由 sim._tickWeather 消费，
 * 播报走既有 log 事件、提示圈走既有 ring 特效，不新增任何事件 / 特效类型。
 * ------------------------------------------------------------------------ */
export const WEATHER_TIMELINE = {
  1: [ { at: 95,  weather: 'wind',      color: 0x9fd8c0, text: '雨收风起，高风扰动远程弹道。' } ],
  2: [ { at: 110, weather: 'clear',     color: 0xffe2a8, text: '劲风渐止，战场视野恢复开阔。' } ],
  3: [ { at: 100, weather: 'rain',      color: 0x8fc4d8, text: '雾散成雨，泽国视野略开而远程略失准。' } ],
  4: [ { at: 85,  weather: 'storm',     color: 0x6f86c8, text: '雷暴压境：视野与远程命中同时下滑。' },
       { at: 175, weather: 'rain',      color: 0x8fc4d8, text: '风暴过境，余雨未歇。' } ],
  5: [ { at: 120, weather: 'resonance', color: 0xc7b3ff, text: '地脉回响平息，天气归于基准。' } ],
};
// 时间线写的是「天气 id」(storm/rain/clear…)，而 CLIMATE_WEATHER 以「气候 id」(tide/verdant…)
// 为键，二者不能混用；这里按对象的 .id 建一次反查表，避免所有阶段静默 fallback 成晴空。
const WEATHER_BY_ID = Object.fromEntries(Object.values(CLIMATE_WEATHER).map(w => [w.id, w]));
/** 返回已解析的时间线（next 为完整天气对象），遭遇战恒为 []。 */
export function weatherTimelineFor(mode, chapter) {
  if (mode !== 'campaign' || chapter == null) return [];
  return (WEATHER_TIMELINE[chapter] || []).map(s => ({
    at: s.at, color: s.color, text: s.text,
    next: WEATHER_BY_ID[s.weather] || CLIMATE_WEATHER.scorch,
  }));
}

/** 地脉共振：周期性唤醒一处高台，站在其上的真实单位远程/近战攻击获得小幅加成。
 *  period 周期秒数、bonus 伤害加成；只在列出的战役章节生效，遭遇战为 null。
 *  高台由 sim 从既有 zones 中确定性轮转选取，不改变 zoneAt 的判定几何。 */
export const MAP_DYNAMICS = {
  2: { resonance: { period: 55, bonus: 0.08, color: 0xc7b3ff, label: '壁垒高台' } },
  5: { resonance: { period: 48, bonus: 0.12, color: 0xc7b3ff, label: '虚空调律台' } },
};
export function mapDynamicsFor(mode, chapter) {
  return (mode === 'campaign' && chapter != null) ? (MAP_DYNAMICS[chapter] || null) : null;
}

/* --------------------------------------------------------------------------
 * 昼夜循环（纯画面数据）：四相位光照 / 雾 / 天空 / 星度，按时间平滑插值。
 * 遭遇战同样有昼夜，但**任何数值都不参与模拟结算**（视野、命中、采集、AI 均不读它），
 * 因此不会改变既定节奏；由 sim.dayPhase() 透出，B 侧可选消费。
 * period / offset 逐章微调，让六章的光照节奏与地貌气质不同。
 * ------------------------------------------------------------------------ */
export const DAY_PHASES = [
  { id: 'dawn',  label: '拂晓', sun: 0xffb877, ambient: 0x6a6480, fog: 0xb9a2a0, sky: 0x2b3a5c, intensity: 0.62, fogDensity: 0.018, star: 0.35 },
  { id: 'day',   label: '正昼', sun: 0xfff2d0, ambient: 0x9aa6a2, fog: 0xc8d2cc, sky: 0x7fb6d8, intensity: 1.00, fogDensity: 0.010, star: 0.00 },
  { id: 'dusk',  label: '黄昏', sun: 0xff8f5a, ambient: 0x7a6470, fog: 0xb88a78, sky: 0x4b3c62, intensity: 0.68, fogDensity: 0.016, star: 0.20 },
  { id: 'night', label: '夜幕', sun: 0x8fa8e0, ambient: 0x37405e, fog: 0x2b3550, sky: 0x0c1226, intensity: 0.38, fogDensity: 0.024, star: 1.00 },
];
export const DAY_CYCLE = {
  period: 180,
  byChapter: [
    { period: 180, offset: 0.02 },  // 0 焦土：标准昼夜
    { period: 165, offset: 0.10 },  // 1 沃野：晨光更早
    { period: 200, offset: 0.22 },  // 2 荒原：长昼
    { period: 150, offset: 0.34 },  // 3 泽国：雾夜更频繁
    { period: 140, offset: 0.46 },  // 4 海岸：潮光快速流转
    { period: 210, offset: 0.58 },  // 5 虚空：近乎恒夜的长周期
  ],
};
const _lerp = (a, b, k) => a + (b - a) * k;
function _lerpHex(a, b, k) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return ((Math.round(_lerp(ar, br, k)) << 16) | (Math.round(_lerp(ag, bg, k)) << 8) | Math.round(_lerp(ab, bb, k))) >>> 0;
}
/** 返回某一时刻的光照快照；颜色为 0xRRGGBB，B 侧可直接喂 THREE.Color。 */
export function dayPhaseAt(mode, chapter, t = 0) {
  const ci = (mode === 'campaign' && chapter != null) ? (chapter % DAY_CYCLE.byChapter.length) : 0;
  const cfg = DAY_CYCLE.byChapter[ci];
  const period = cfg.period || DAY_CYCLE.period;
  const tt = Math.max(0, t || 0);
  const p = ((tt / period + cfg.offset) % 1 + 1) % 1;
  const scaled = p * DAY_PHASES.length;
  const i = Math.floor(scaled) % DAY_PHASES.length;
  const f = scaled - Math.floor(scaled);
  const k = f * f * (3 - 2 * f);            // smoothstep，避免相位切换时光照跳变
  const a = DAY_PHASES[i], b = DAY_PHASES[(i + 1) % DAY_PHASES.length];
  const lerpHex = key => _lerpHex(a[key], b[key], k);
  const lerp = key => +_lerp(a[key], b[key], k).toFixed(4);
  return {
    phase: a.id, label: a.label, next: b.id, nextLabel: b.label,
    progress: +p.toFixed(4), blend: +k.toFixed(4), cycle: Math.floor(tt / period) + 1,
    chapter: ci, period,
    sun: lerpHex('sun'), ambient: lerpHex('ambient'), fog: lerpHex('fog'), sky: lerpHex('sky'),
    intensity: lerp('intensity'), fogDensity: lerp('fogDensity'), star: lerp('star'),
  };
}

/* 场景氛围：粒子类型 / 密度 / 风向 / 辉光色，逐章不同。纯表现，不参与结算。 */
export const SCENE_AMBIENCE = [
  { particle: 'ember',  density: 0.45, wind: { x: 0.35, z: -0.18 }, glow: 0xff9a5a, sound: 'ash'   },
  { particle: 'pollen', density: 0.70, wind: { x: 0.18, z: 0.22  }, glow: 0xffe6a0, sound: 'field' },
  { particle: 'dust',   density: 0.55, wind: { x: 0.55, z: 0.05  }, glow: 0xd8c39a, sound: 'wind'  },
  { particle: 'mist',   density: 0.85, wind: { x: -0.12, z: 0.15 }, glow: 0x9fd0dc, sound: 'marsh' },
  { particle: 'spray',  density: 0.90, wind: { x: 0.62, z: -0.30 }, glow: 0x9fc8ff, sound: 'surf'  },
  { particle: 'echo',   density: 0.65, wind: { x: 0.00, z: 0.00  }, glow: 0xc7b3ff, sound: 'void'  },
];
export function ambienceFor(mode, chapter) {
  const i = (mode === 'campaign' && chapter != null) ? (chapter % SCENE_AMBIENCE.length) : 0;
  const a = SCENE_AMBIENCE[i];
  return { ...a, wind: { ...a.wind }, chapter: i };
}

/* --------------------------------------------------------------------------
 * 地图装饰点位：确定性布点，纯视觉（草簇 / 石砾 / 菌菇 / 枯枝 / 水洼 / 孢子 /
 * 残骸 / 晶簇）。用自有 hash，绝不消费 Math.random，避免污染 AI 固定随机流。
 * 硬约束：避开资源点、水域、双方巢区、静态危害区与地图边缘，避免挡住交互与行军。
 * 与 rts.js 的 MAP.W/H 口径同步；此处不 import rts 以规避循环依赖。
 * ------------------------------------------------------------------------ */
const DECOR_KINDS = ['tuft', 'pebble', 'fungus', 'twig', 'puddle', 'spore', 'bone', 'crystal'];
export const MAP_DECOR = [
  { count: 96,  weights: [3, 4, 1, 2, 0, 1, 2, 0], tint: 0x9a8362 },  // 0 焦土
  { count: 128, weights: [6, 2, 2, 2, 1, 3, 0, 0], tint: 0x7fae68 },  // 1 沃野
  { count: 84,  weights: [1, 6, 0, 2, 0, 0, 3, 1], tint: 0xb5a182 },  // 2 荒原
  { count: 110, weights: [4, 1, 4, 2, 4, 3, 0, 0], tint: 0x6f9e94 },  // 3 泽国
  { count: 104, weights: [2, 4, 1, 1, 5, 1, 1, 0], tint: 0x8fa8b8 },  // 4 海岸
  { count: 92,  weights: [0, 2, 2, 0, 1, 4, 1, 6], tint: 0xa48fd0 },  // 5 虚空
];
const DECOR_HALF_W = 94, DECOR_HALF_H = 67;   // == rts.HALF_W / HALF_H
const DECOR_BASE_Z = DECOR_HALF_H * 0.62;
function _dhash(a, b, c) {
  let x = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 1442695041)) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177) | 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
export function decorFor(mode, chapter) {
  const ci = (mode === 'campaign' && chapter != null) ? (chapter % MAP_DECOR.length) : 0;
  const cfg = MAP_DECOR[ci];
  const rules = MAP_RULES[ci];
  const water = rules.water || [];
  const hazards = STATIC_HAZARDS[ci] || [];
  const wsum = cfg.weights.reduce((a, b) => a + b, 0);
  const salt = mode === 'campaign' ? 17 : 3;
  const out = [];
  const maxTry = cfg.count * 12;
  for (let i = 0; i < maxTry && out.length < cfg.count; i++) {
    const x = (_dhash(ci, i, salt) * 2 - 1) * (DECOR_HALF_W - 6);
    const z = (_dhash(ci, i, salt + 1) * 2 - 1) * (DECOR_HALF_H - 6);
    if (rules.nodes.some(n => Math.hypot(x - n.x, z - n.z) < 9)) continue;
    if (water.some(w => Math.hypot(x - w.x, z - w.z) < w.r + 3)) continue;
    if (hazards.some(h => Math.hypot(x - h.x, z - h.z) < h.r + 3)) continue;
    if (Math.hypot(x, z - DECOR_BASE_Z) < 20 || Math.hypot(x, z + DECOR_BASE_Z) < 20) continue;
    let roll = _dhash(ci, i, salt + 2) * wsum, kind = DECOR_KINDS[0];
    for (let k = 0; k < cfg.weights.length; k++) {
      roll -= cfg.weights[k];
      if (roll <= 0) { kind = DECOR_KINDS[k]; break; }
    }
    // 生态分区：依装饰点相对 水体 / 地图边缘 / 资源点 的位置微调明暗与色调，
    // 让地图呈现自然生态层次（近水偏冷亮、近边偏暗、近资源点偏暖亮）。纯视觉，零平衡。
    let dn = Infinity, dw = Infinity, de = Infinity;
    for (const n of rules.nodes) dn = Math.min(dn, Math.hypot(x - n.x, z - n.z));
    for (const w of water) dw = Math.min(dw, Math.hypot(x - w.x, z - w.z) - (w.r || 0));
    de = Math.min(DECOR_HALF_W - Math.abs(x), DECOR_HALF_H - Math.abs(z));
    let biome = 'field', shadeExtra = 0, tintMix = 0, mixCol = cfg.tint;
    if (dw < 12) { biome = 'water'; tintMix = 0.5; mixCol = 0x9fd0dc; shadeExtra = 0.06; }
    else if (de < 12) { biome = 'edge'; tintMix = 0.45; mixCol = 0x4a3f33; shadeExtra = -0.10; }
    else if (dn < 12) { biome = 'core'; tintMix = 0.30; mixCol = 0xfff0c0; shadeExtra = 0.05; }
    const shade = +(0.82 + _dhash(ci, i, salt + 5) * 0.36 + shadeExtra).toFixed(3);
    const tint = tintMix > 0 ? _lerpHex(cfg.tint, mixCol, tintMix) : cfg.tint;
    out.push({
      id: `d${i}`, x: +x.toFixed(2), z: +z.toFixed(2), kind, biome,
      scale: +(0.6 + _dhash(ci, i, salt + 3) * 0.9).toFixed(3),
      rot: +(_dhash(ci, i, salt + 4) * Math.PI * 2).toFixed(3),
      tint, shade,
    });
  }
  return out;
}

/* --------------------------------------------------------------------------
 * 战役场景周期事件：纯氛围。触发时只做既有 log 播报 + 既有 ring/resonance
 * 全图提示圈 + 写入只读状态快照（B 侧可用它切粒子/音效/色调）。
 * **不改天气、资源、单位属性或任何结算系数**；遭遇战恒返回空数组。
 *   at     首次触发秒；period 循环周期；times 最多触发次数；dur 状态持续秒。
 * 与 WEATHER_TIMELINE 的分工：天气阶段改变视野/命中（有数值语义），
 * 场景事件只提供画面与叙事节拍，二者互不引用、互不覆盖。
 * ------------------------------------------------------------------------ */
export const SCENE_EVENTS = {
  0: [
    { id: 'ashfall',  label: '灰烬回潮', at: 48,  period: 88, times: 3, dur: 9,  color: 0xff9a5a, fx: 'ring',      text: '焦土扬起陈年灰烬，余烬在风里缓缓飘落。' },
    { id: 'warhorn',  label: '远岗虫鸣', at: 104, period: 96, times: 2, dur: 7,  color: 0xffd27f, fx: 'resonance', text: '远岗传来低沉虫鸣，巢群短暂躁动。' },
  ],
  1: [
    { id: 'bloom',    label: '花粉潮',   at: 42,  period: 78, times: 3, dur: 10, color: 0xffe6a0, fx: 'ring',      text: '沃野花粉随风成潮，采集道上金雾弥漫。' },
    { id: 'harvest',  label: '丰饶脉动', at: 96,  period: 92, times: 2, dur: 8,  color: 0x9fe0c8, fx: 'resonance', text: '地脉轻颤，菌圃的气息漫过整片田野。' },
  ],
  2: [
    { id: 'sandveil', label: '沙幕',     at: 55,  period: 84, times: 3, dur: 9,  color: 0xd8c39a, fx: 'ring',      text: '荒原卷起沙幕，远处的轮廓变得模糊。' },
    { id: 'bonedrum', label: '骸鼓',     at: 112, period: 98, times: 2, dur: 7,  color: 0xb5a182, fx: 'resonance', text: '风穿过巨型骸骨，敲出沉闷的节拍。' },
  ],
  3: [
    { id: 'misttide', label: '雾潮',     at: 46,  period: 80, times: 3, dur: 11, color: 0x9fd0dc, fx: 'ring',      text: '泽国雾潮漫过浅滩，水光与雾气融成一片。' },
    { id: 'spore',    label: '孢雨',     at: 100, period: 94, times: 2, dur: 8,  color: 0x9be05a, fx: 'resonance', text: '夜生孢群短暂爆发，空气里浮起细密绿点。' },
  ],
  4: [
    { id: 'hightide', label: '大潮',     at: 50,  period: 76, times: 3, dur: 10, color: 0x9fc8ff, fx: 'ring',      text: '海岸大潮推高水位，浪线一直漫到巢区外缘。' },
    { id: 'saltwind', label: '盐风',     at: 108, period: 90, times: 2, dur: 7,  color: 0xc9e6ff, fx: 'resonance', text: '咸涩海风掠过礁群，飞沫在光里拉出细线。' },
  ],
  5: [
    { id: 'voidpulse', label: '虚空搏动', at: 44, period: 82, times: 3, dur: 11, color: 0xc7b3ff, fx: 'resonance', text: '虚空传来一次缓慢搏动，晶簇同时亮起又熄灭。' },
    { id: 'echowave',  label: '回声浪',   at: 102, period: 96, times: 2, dur: 8, color: 0xa48fd0, fx: 'ring',      text: '旧纪元的回声掠过战场，声音先于形体抵达。' },
  ],
};
/** 返回该章节可变的事件调度对象（每次调用都是新数组，sim 独占，不共享状态）。 */
export function sceneEventsFor(mode, chapter) {
  if (mode !== 'campaign' || chapter == null) return [];
  return (SCENE_EVENTS[chapter] || []).map((e, i) => ({
    ...e, key: `se${chapter}_${i}`, nextAt: e.at, fired: 0,
  }));
}

/* --------------------------------------------------------------------------
 * 水域视觉增强：为每章 water 圆盘补纯视觉属性（波纹频率 / 相位、潮汐周期与振幅、
 * 闪光强度、水体色）。不改 MAP_RULES 的水域约束语义（sim 只用 x/z/r 做 sea 节点
 * 落位约束，不读以下字段），遭遇战（第 0 章）也生效，纯表现，零平衡。
 * ------------------------------------------------------------------------ */
const WATER_TINTS = [0x6f9e94, 0x5f9ec0, 0xb5a182, 0x4f8f8a, 0x4f86b8, 0x7a6fc8];
export function waterVisualFor(mode, chapter) {
  const ci = (mode === 'campaign' && chapter != null) ? (chapter % MAP_RULES.length) : 0;
  const water = MAP_RULES[ci].water || [];
  const tint = WATER_TINTS[ci % WATER_TINTS.length];
  return water.map((w, j) => ({
    x: w.x, z: w.z, r: w.r, tint,
    ripple: +(0.6 + _dhash(ci, j, 71) * 0.8).toFixed(3),        // 波纹频率
    ripplePhase: +(_dhash(ci, j, 72) * Math.PI * 2).toFixed(3),  // 波纹相位
    tide: _dhash(ci, j, 73) > 0.5 ? +(18 + _dhash(ci, j, 74) * 22).toFixed(2) : 0, // 潮汐周期(秒)，0=无
    tideAmp: +(0.4 + _dhash(ci, j, 75) * 0.8).toFixed(3),        // 潮汐振幅(纯视觉半径波动)
    shimmer: +(0.3 + _dhash(ci, j, 76) * 0.5).toFixed(3),        // 水面闪光强度
  }));
}

/* --------------------------------------------------------------------------
 * 地形特征（大尺度地标）：每章确定性布点的大件地形特征（巨岩 / 枯木 / 晶柱 /
 * 残骸堆 / 菌盖 / 盐柱 / 碑石 / 骸骨）。纯视觉渲染锚点，B 侧据以做场景大件；
 * 不读 Math.random（自有 hash），不写任何模拟字段，零平衡。
 * 避开资源点 / 水域 / 静态危害 / 双方巢区（距巢基 > 26），避免遮挡交互与行军。
 * ------------------------------------------------------------------------ */
const FEATURE_KINDS = ['rock', 'boulder', 'crystal', 'mast', 'pillar', 'rubble', 'salt', 'monolith'];
const FEATURE_CFG = [
  { count: 11, weights: [4, 3, 0, 1, 0, 2, 0, 1], palette: 0x9a8362 },  // 0 焦土
  { count: 13, weights: [2, 2, 0, 3, 0, 1, 0, 1], palette: 0x7fae68 },  // 1 沃野
  { count: 10, weights: [5, 3, 0, 0, 0, 2, 0, 1], palette: 0xb5a182 },  // 2 荒原
  { count: 12, weights: [1, 1, 0, 2, 0, 1, 3, 0], palette: 0x6f9e94 },  // 3 泽国
  { count: 12, weights: [2, 2, 0, 2, 3, 1, 2, 0], palette: 0x8fa8b8 },  // 4 海岸
  { count: 10, weights: [0, 1, 4, 0, 1, 1, 0, 3], palette: 0xa48fd0 },  // 5 虚空
];
export function terrainFeaturesFor(mode, chapter) {
  const ci = (mode === 'campaign' && chapter != null) ? (chapter % MAP_RULES.length) : 0;
  const cfg = FEATURE_CFG[ci];
  const rules = MAP_RULES[ci];
  const water = rules.water || [];
  const hazards = STATIC_HAZARDS[ci] || [];
  const wsum = cfg.weights.reduce((a, b) => a + b, 0) || 1;
  const salt = 41 + ci;
  const out = [];
  const baseZ = DECOR_HALF_H * 0.62;
  const maxTry = cfg.count * 16;
  for (let i = 0; i < maxTry && out.length < cfg.count; i++) {
    const x = (_dhash(ci, i, salt) * 2 - 1) * (DECOR_HALF_W - 10);
    const z = (_dhash(ci, i, salt + 1) * 2 - 1) * (DECOR_HALF_H - 10);
    if (rules.nodes.some(n => Math.hypot(x - n.x, z - n.z) < 11)) continue;
    if (water.some(w => Math.hypot(x - w.x, z - w.z) < w.r + 4)) continue;
    if (hazards.some(h => Math.hypot(x - h.x, z - h.z) < h.r + 4)) continue;
    if (Math.hypot(x, z - baseZ) < 26 || Math.hypot(x, z + baseZ) < 26) continue;   // 避开巢区
    let roll = _dhash(ci, i, salt + 2) * wsum, kind = FEATURE_KINDS[0];
    for (let k = 0; k < cfg.weights.length; k++) {
      roll -= cfg.weights[k];
      if (roll <= 0) { kind = FEATURE_KINDS[k]; break; }
    }
    const size = +(1.4 + _dhash(ci, i, salt + 3) * 2.6).toFixed(3);
    out.push({
      id: `f${ci}_${i}`, x: +x.toFixed(2), z: +z.toFixed(2), kind,
      size, rot: +(_dhash(ci, i, salt + 4) * Math.PI * 2).toFixed(3),
      tint: cfg.palette, shade: +(0.7 + _dhash(ci, i, salt + 5) * 0.5).toFixed(3),
      solid: (kind === 'rock' || kind === 'boulder' || kind === 'pillar' || kind === 'monolith' || kind === 'crystal'),
    });
  }
  return out;
}

/* --------------------------------------------------------------------------
 * 地表高程控制点：每章一组高程锚点（纯视觉，sim 逻辑层只有 x/z，不读 h）。
 * elevationAt 用高斯核做距离加权采样，返回平滑地表高度（与场景尺度一致），
 * B 侧据以做地形起伏 mesh；不写任何模拟字段、不改单位坐标，零平衡。
 * 锚点避开巢区与资源点中心，避免巢穴 / 矿区被抬成陡坎。
 * ------------------------------------------------------------------------ */
const ELEV_CFG = [
  { count: 7, amp: 1.4, radius: 20 },   // 0 焦土：平缓起伏
  { count: 8, amp: 1.1, radius: 22 },   // 1 沃野：低缓丘陵
  { count: 9, amp: 2.0, radius: 18 },   // 2 荒原：垄岗明显
  { count: 6, amp: 0.8, radius: 24 },   // 3 泽国：近水平
  { count: 7, amp: 1.6, radius: 20 },   // 4 海岸：浪蚀台地
  { count: 8, amp: 1.8, radius: 19 },   // 5 虚空：漂浮感台块
];
export function elevationPointsFor(mode, chapter) {
  const ci = (mode === 'campaign' && chapter != null) ? (chapter % MAP_RULES.length) : 0;
  const cfg = ELEV_CFG[ci];
  const rules = MAP_RULES[ci];
  const baseZ = DECOR_HALF_H * 0.62;
  const pts = [];
  for (let i = 0; i < cfg.count * 20 && pts.length < cfg.count; i++) {
    const x = (_dhash(ci, i, 91) * 2 - 1) * (DECOR_HALF_W - 12);
    const z = (_dhash(ci, i, 92) * 2 - 1) * (DECOR_HALF_H - 12);
    if (rules.nodes.some(n => Math.hypot(x - n.x, z - n.z) < 12)) continue;
    if (Math.hypot(x, z - baseZ) < 24 || Math.hypot(x, z + baseZ) < 24) continue;
    const h = +((_dhash(ci, i, 93) * 2 - 1) * cfg.amp).toFixed(3);
    pts.push({ x: +x.toFixed(2), z: +z.toFixed(2), h, radius: cfg.radius });
  }
  return pts;
}
/** 采样某点地表高度（高斯核距离加权，返回有限数；超出控制点范围回落 0）。
 *  纯视觉，零平衡。 */
export function elevationAt(mode, chapter, x, z) {
  const pts = elevationPointsFor(mode, chapter);
  let num = 0, den = 0;
  for (const p of pts) {
    const d2 = (x - p.x) * (x - p.x) + (z - p.z) * (z - p.z);
    const s2 = (p.radius * 0.5) * (p.radius * 0.5);
    const w = Math.exp(-d2 / (2 * s2));
    if (w < 1e-4) continue;
    num += w * p.h; den += w;
  }
  return den > 0 ? +(num / den).toFixed(3) : 0;
}

/* --------------------------------------------------------------------------
 * 小地图静态图层：把水域 / 静态危害 / 地形特征 / 地图边界整理成 B 侧可直接绘制的
 * 底图要素（纯只读，不与单位 / 建筑 blip 混淆）。零平衡。
 * ------------------------------------------------------------------------ */
export function minimapZonesFor(mode, chapter) {
  const ci = (mode === 'campaign' && chapter != null) ? (chapter % MAP_RULES.length) : 0;
  const rules = MAP_RULES[ci];
  const water = (rules.water || []).map(w => ({ x: w.x, z: w.z, r: w.r, kind: 'water' }));
  const hazards = (STATIC_HAZARDS[ci] || []).map(h => ({ x: h.x, z: h.z, r: h.r, kind: 'hazard', type: h.type }));
  const features = terrainFeaturesFor(mode, chapter).map(f => ({ x: f.x, z: f.z, r: +(f.size * 1.5).toFixed(2), kind: 'feature', type: f.kind }));
  return { edge: { w: DECOR_HALF_W * 2, h: DECOR_HALF_H * 2 }, water, hazards, features };
}

