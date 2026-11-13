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
