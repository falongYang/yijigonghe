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
