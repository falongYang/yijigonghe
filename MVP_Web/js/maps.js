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
