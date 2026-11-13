/* 《蚁纪·共时》Web MVP — 数据层
 * 单一事实源：移植自 开发交付包/3D补充包/.build/v2_data.py (v2.0)
 * 与 art_direction.py (v3.0 六纪元美术参数) / signal_vfx_map.json (十类回响)
 * 保持一致：六品种乘数和 = 10.00，亲和矩阵行列和 = 6.00。
 */

export const VERSION = 'MVP 0.9.0 / 设计基线 v2.0 + 插画 v3.0';

export const DIMS = [
  ['dig', '挖掘'], ['forage', '采集'], ['brood', '繁育'], ['defend', '防御'],
  ['alarm', '警戒'], ['trail', '路径'], ['memory', '史卷'], ['budget', '预算'],
  ['mobility', '机动'], ['hardiness', '耐受'],
];
export const DIM_KEYS = DIMS.map(d => d[0]);
export const DIM_NAMES = Object.fromEntries(DIMS);
export const BALANCE_INVARIANT = 10.00;

const mod = arr => Object.fromEntries(DIM_KEYS.map((k, i) => [k, arr[i]]));

export const SPECIES = [
  {
    id: 'SP01', key: 'niger', name: '黑毛蚁', latin: 'Lasius niger',
    color: '#3B3A36', color2: '#6E6A5E', glow: '#9BA88C',
    role: '均衡 · 入门推荐', tagline: '路修得最久，史也记得最稳。',
    silhouette: '低伏匀称、腹节圆钝、触角短直', lenMm: 4.2,
    headRatio: 0.28, legRatio: 1.00, spines: 0, mandible: '短三角齿颚',
    eraPeak: 0, difficulty: '★☆☆☆☆', nest: '规整土丘巢，主道垂直、支道对称',
    img: 'assets/sp01.jpg',
    mods: mod([1.02, 1.02, 1.02, 0.96, 0.96, 1.12, 1.00, 1.00, 1.00, 0.90]),
    perks: [
      ['G1 稳径', 'trail 衰减额外 −8%，首条觅食径不会在 1 世代内消失'],
      ['G2 连巢', '相邻子巢共享 10% 信息素预算'],
      ['G3 共时基线', '任一纪元亲和 +0.04，终章不受纪元惩罚'],
    ],
    risk: '无明显短板；后期爆发力最弱。',
  },
  {
    id: 'SP02', key: 'rufa', name: '赤林蚁', latin: 'Formica rufa',
    color: '#9C4A32', color2: '#3A2A24', glow: '#E0A07A',
    role: '防御 · 警戒', tagline: '一声警报，整座林丘同时抬头。',
    silhouette: '胸背高耸、头宽近方、大颚外张', lenMm: 5.5,
    headRatio: 0.34, legRatio: 1.08, spines: 2, mandible: '粗壮锯齿颚',
    eraPeak: 2, difficulty: '★★★☆☆', nest: '松针丘巢 + 环形警戒道',
    img: 'assets/sp02.jpg',
    mods: mod([0.94, 1.00, 0.96, 1.18, 1.14, 0.96, 0.94, 0.96, 1.02, 0.90]),
    perks: [
      ['G1 警戒共振', 'alarm 扩散半径 +1 邻域'],
      ['G2 蚁酸阵', '防御判定成功回补 5 点预算'],
      ['G3 六巢戍卫', '终章传承断裂判定前获得一次缓冲'],
    ],
    risk: '史卷精度与耐受偏低，长线毒性关卡需靠巢室补齐。',
  },
  {
    id: 'SP03', key: 'flavus', name: '黄毛蚁', latin: 'Lasius flavus',
    color: '#C7A24B', color2: '#8A6C2E', glow: '#EAD58E',
    role: '农牧 · 育幼', tagline: '地下的收成，从不写在地上的史里。',
    silhouette: '体小腹圆、通体绒密、半透腹节', lenMm: 3.6,
    headRatio: 0.25, legRatio: 0.88, spines: 0, mandible: '细小匙形颚',
    eraPeak: 1, difficulty: '★★☆☆☆', nest: '全地下丘巢，蚜牧室与育幼室占比最高',
    img: 'assets/sp03.jpg',
    mods: mod([1.06, 1.16, 1.20, 0.84, 0.88, 0.98, 0.96, 1.00, 0.90, 1.02]),
    perks: [
      ['G1 牧蚜', '食物转化 harvest 额外 +8%'],
      ['G2 菌圃', '每关一次育幼失败可原地重试'],
      ['G3 地脉', 'toxicity 每世代额外 −0.005'],
    ],
    risk: '防御与机动最低，敌对事件关需提前铺警戒径。',
  },
  {
    id: 'SP04', key: 'camponotus', name: '弓背蚁', latin: 'Camponotus herculeanus',
    color: '#2E3330', color2: '#545B52', glow: '#8FA69A',
    role: '工程 · 啃食', tagline: '它不绕开历史，它把历史啃穿。',
    silhouette: '全场最大、胸背连续弓形、头近心形', lenMm: 9.0,
    headRatio: 0.36, legRatio: 1.12, spines: 0, mandible: '巨型五齿镰颚',
    eraPeak: 3, difficulty: '★★★★☆', nest: '木质空腔巢，竖向井道为主',
    img: 'assets/sp04.jpg',
    mods: mod([1.24, 0.96, 0.88, 1.08, 0.92, 0.92, 0.94, 0.92, 0.86, 1.28]),
    perks: [
      ['G1 啃刻', '六纪元异物「啃食」参数 +1 档'],
      ['G2 承重', '塌方损失 ×0.85'],
      ['G3 梁柱', '唯一可建造跨 z 层竖井的品种'],
    ],
    risk: '繁育与机动最慢，前 3 世代起步明显偏慢。',
  },
  {
    id: 'SP05', key: 'atta', name: '切叶蚁', latin: 'Atta cephalotes',
    color: '#7A4A3C', color2: '#4A2E28', glow: '#C9B07A',
    role: '传承 · 史官', tagline: '叶片被切碎，却成了另一种记载。',
    silhouette: '背刺成列、头宽大于胸、常负叶片', lenMm: 6.8,
    headRatio: 0.38, legRatio: 1.18, spines: 6, mandible: '宽刃切叶颚',
    eraPeak: 5, difficulty: '★★★★☆', nest: '菌圃环形巢，档案室居中',
    img: 'assets/sp05.jpg',
    mods: mod([1.00, 1.10, 1.02, 0.90, 0.90, 1.00, 1.24, 1.10, 0.92, 0.82]),
    perks: [
      ['G1 切片书写', 'chronicle.precision 每世代额外 +0.01'],
      ['G2 菌膜封存', 'lost_entries 计半，memory 衰减减半'],
      ['G3 共时史卷', '可回放任一纪元的回响假设'],
    ],
    risk: '耐受最低，终章毒性曲线压力最大。',
  },
  {
    id: 'SP06', key: 'dorylus', name: '行军蚁', latin: 'Dorylus / Eciton',
    color: '#5C4030', color2: '#2E221C', glow: '#C98A54',
    role: '机动 · 高风险', tagline: '没有巢的族群，把路本身当成了巢。',
    silhouette: '长腿高抬、腹柄细长、镰刀颚前伸', lenMm: 7.2,
    headRatio: 0.33, legRatio: 1.34, spines: 1, mandible: '长镰刀颚（不闭合）',
    eraPeak: 4, difficulty: '★★★★★', nest: '无固定巢室，仅临时宿营圈',
    img: 'assets/sp06.jpg',
    mods: mod([0.88, 1.08, 1.10, 1.10, 1.06, 0.90, 0.78, 1.06, 1.28, 0.76]),
    perks: [
      ['G1 行军', '每 tick 候选步长 +1，扩张最快'],
      ['G2 群袭', '一次性掠夺双倍食物，当世代 alarm +1 档'],
      ['G3 无巢传承', '允许无巢室条件下完成一次传承判定'],
    ],
    risk: 'memory 0.78 / hardiness 0.76 全场最低，断裂风险最高。',
  },
];
export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map(s => [s.id, s]));

export const ERAS = [
  {
    no: 'Ⅰ', name: '泥土纪', years: '约前 3000 – 前 1046', hex: '#D9BC8C',
    material: '夯土 / 粗陶 / 炭屑 / 生土块',
    light: '巢口单一束暖黄斜光，光比钝重，尘埃粗大可见',
    mood: '钝重、惊讶、初次学会记录',
    development: '定居农业与夯土城址出现，治水、青铜陶范、车辙首次改动地表；人类刚学会「把地面压实」。',
    scene: '原始竖井巢，主道垂直、支道对称；一束斜光落在刚铺好的第一条信息素径上。',
    anchors: 'ANT_3000BC / 2000BC / 1600BC / 1046BC', img: 'assets/e1.jpg',
  },
  {
    no: 'Ⅱ', name: '轴心纪', years: '前 770 – 前 260', hex: '#A9C0A6',
    material: '竹简纤维 / 苔 / 铜绿锈 / 标准谷粒 / 田界石',
    light: '清冷竹影斑驳光，光线被细长叶片切成条状',
    mood: '清明、克制、隐忧',
    development: '田界阡陌重划领地，竹简带来持久符号，统一度量使谷物标准化；经验开始被制度化。',
    scene: '被田界石切成碎块的浅层巢网，旧路径断裂处生出细苔。',
    anchors: 'ANT_770BC / 5C / 356BC / 260BC', img: 'assets/e2.jpg',
  },
  {
    no: 'Ⅲ', name: '帝国纪', years: '前 221 – 5 世纪', hex: '#A9BFC8',
    material: '青砖 / 铁 / 驰道夯土路基 / 纸纤维 / 药草灰',
    light: '硬朗的高对比石青冷光，尘土中一道笔直光束',
    mood: '宏大、失去、第一次自觉',
    development: '统一度量与驰道把六向路径并成一条，丝路带来异域种子，造纸术让纤维落入土层；疫病使连通反成脆弱。',
    scene: '六条路径向同一主干道收束的地下穹室，一道青砖驰道横向切断旧蚁道。',
    anchors: 'ANT_221BC / 138BC / 105 / 2C / 4C', img: 'assets/e3.jpg',
  },
  {
    no: 'Ⅳ', name: '交融纪', years: '7 – 15 世纪', hex: '#D9A898',
    material: '纸 / 香料 / 火 / 运河水汽 / 船木 / 釉色',
    light: '暖金基调加跳动的火光，水汽里形成柔和光晕',
    mood: '丰盛、眩晕、不安',
    development: '巨型都市与运河带来潮汐般的巨量食物，雕版让相同字迹反复出现，火药与远洋把交换推到过剩。',
    scene: '层层叠叠几乎溢满的储粮室，带着相同墨痕的纸片在暖光里缓缓飘落。',
    anchors: 'ANT_7C / 8C / 11C / 13C / 15C', img: 'assets/e4.jpg',
  },
  {
    no: 'Ⅴ', name: '大分流纪', years: '1492 – 1900', hex: '#B7AAC5',
    material: '玻璃 / 煤烟 / 钢 / 黄铜镜片 / 电缆 / 标本瓶',
    light: '冷紫环境光 + 透镜聚出的灼亮光斑 + 煤烟丁达尔光柱',
    mood: '第一次上扬：自我意识、被观察的不安',
    development: '新作物与全球交换出现；放大镜与标本瓶让蚁群第一次「被看见、被命名」；蒸汽与钢轨把规律震动带进土层。',
    scene: '玻璃与钢侵入的巢室，一枚巨大透镜把光聚成灼亮圆斑落在蚁道上。',
    anchors: 'ANT_1492 / 1735 / 1840 / 1859 / 1900', img: 'assets/e5.jpg',
  },
  {
    no: 'Ⅵ', name: '共振纪', years: '1914 – 近未来', hex: '#AFC5AC',
    material: '混凝土 / 光 / 再生草 / 电缆 / 修复后的团粒土',
    light: '清透自然光与冷人工光污染并存，草叶逆光透亮',
    mood: '归零后回升，收于平静',
    development: '归零之后的再野化：混凝土裂缝里重新钻出嫩草，六层纪元的色带像年轮一样半透明叠合。',
    scene: '翻覆过的土层之上，蚁群沿新生的根须铺出一条细路。',
    anchors: 'ANT_1914 / 1945 / 1978 / 2000 / 近未来', img: 'assets/e6.jpg',
  },
];

/* ----------------------------------------------------------------------------
 * 以下「六纪元叙事策略」原回合制数据层（STAGES / BRUSHES / SIGNALS / CHOICES /
 * 双随机亲和矩阵 AFFINITY / 网格 CONFIG / selfCheck）已从主数据层移除，仅作设计
 * 史料归档，见 data_archive.js（运行时不会被任何模块加载，与「四域战争」RTS 无关）。
 * -------------------------------------------------------------------------- */
