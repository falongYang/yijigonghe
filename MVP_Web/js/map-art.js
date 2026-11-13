/* 六章战场「美术与文案」配置（表现层独占）。
 * 只描述观感：名称、文案、配色、雾、散布密度、装饰道具、天气、地标。
 * 影响数值与战术的规则字段（资源点、水域）在 maps.js，两侧互不改写同一文件。
 */
export const MAP_ART = [
  { // 0 泥土纪 · 焦土平原
    name: '焦土平原', tag: '焦土 · 开阔',
    desc: '泥层被翻掘过无数次的旧战场，地势平缓、视野开阔，中央大食源是双方必争之地。',
    brief: '陆战与空袭主导，尽早抢占中央食源；两翼矿脉适合地下兵种绕后。',
    pal: { low: 0x7a6a4a, mid: 0xa8926a, high: 0xb8a06a, moss: 0x8a8a4e },
    bg: 0xe8dcc0, fog: [180, 440],
    scatter: { grass: 380, peb: 260, rock: 8, twig: 18 },
    props: [{ type: 'charlog', count: 14 }, { type: 'scrub', count: 22 }, { type: 'skull', count: 6 }], weather: 'dust', landmark: 'burnedsnag',
  },
  { // 1 轴心纪 · 阡陌沃野
    name: '阡陌沃野', tag: '沃野 · 广布',
    desc: '沟垄纵横的丰饶土层，食源分布最广、蚁道四通八达，适合多线扩张与骚扰。',
    brief: '资源点分散，分兵采集效率更高；注意防守漫长的补给线。',
    pal: { low: 0x5f6a3c, mid: 0x8a8f56, high: 0x9fa86a, moss: 0x6f8f4e },
    bg: 0xdfe6d2, fog: [200, 460],
    scatter: { grass: 640, peb: 160, rock: 6, twig: 22 },
    props: [{ type: 'bush', count: 26 }, { type: 'flower', count: 22 }, { type: 'sapling', count: 10 }], weather: 'pollen', landmark: 'grandtree',
  },
  { // 2 帝国纪 · 壁垒荒原
    name: '壁垒荒原', tag: '荒原 · 岩阵',
    desc: '中央稀疏、外圈岩阵如墙，狭窄通道利于防守与伏击，重型兵种行动迟缓。',
    brief: '善用岩阵卡口设伏；地下矿脉集中在两翼，钻地突袭收益高。',
    pal: { low: 0x6a6256, mid: 0x8a7f6a, high: 0x9a8f7a, moss: 0x6f7a5a },
    bg: 0xd8d2c4, fog: [170, 420],
    scatter: { grass: 300, peb: 200, rock: 18, twig: 24 },
    props: [{ type: 'cactus', count: 16 }, { type: 'boulder', count: 14 }, { type: 'skull', count: 6 }], weather: 'dust', landmark: 'stonearch',
  },
  { // 3 交融纪 · 通津泽国
    name: '通津泽国', tag: '泽国 · 大湖',
    desc: '中央巨湖把战场切成环带，浅滩连绵，水域兵种可沿水路直达腹地。',
    brief: '优先出水域巢室，绕湖机动；陆路被水面阻断，需守住三条陆桥。',
    pal: { low: 0x5a6a5a, mid: 0x7a8a6a, high: 0x9fa86a, moss: 0x5f8f6a },
    bg: 0xcfdcd2, fog: [190, 440],
    scatter: { grass: 420, peb: 150, rock: 10, twig: 18 },
    props: [{ type: 'reed', count: 24 }, { type: 'lily', count: 14 }, { type: 'stump', count: 8 }], weather: 'spores', landmark: 'geyser',
  },
  { // 4 大分流纪 · 怒涛海岸
    name: '怒涛海岸', tag: '海岸 · 割裂',
    desc: '两片大水横向割裂南北，陆路只剩两翼狭道，潮雾限制了远程视野。',
    brief: '控制两翼狭道，或用空域 / 水域兵种跨越水面直取巢区。',
    pal: { low: 0x4a5560, mid: 0x6a7480, high: 0x8a94a0, moss: 0x5a7a8a },
    bg: 0xb8c2cc, fog: [150, 380],
    scatter: { grass: 340, peb: 180, rock: 12, twig: 20 },
    props: [{ type: 'driftwood', count: 16 }, { type: 'shell', count: 18 }, { type: 'kelp', count: 14 }], weather: 'mist', landmark: 'driftwoodspire',
  },
  { // 5 共振纪 · 回响虚空
    name: '回响虚空', tag: '虚空 · 对称',
    desc: '暗紫晶层与发光岩构成完美对称的回响之地，资源极端集中于中央。',
    brief: '中央必有一战：先手控制中央即掌握经济，适合速攻或重兵决战。',
    pal: { low: 0x3a3550, mid: 0x5a4a6a, high: 0x6a5a8a, moss: 0x4a6a6a },
    bg: 0x2a2840, fog: [160, 420],
    scatter: { grass: 200, peb: 120, rock: 12, twig: 16 },
    props: [{ type: 'crystal', count: 22 }, { type: 'shard', count: 16 }, { type: 'glowmoss', count: 18 }], weather: 'embers', landmark: 'crystalmonolith',
  },
];
