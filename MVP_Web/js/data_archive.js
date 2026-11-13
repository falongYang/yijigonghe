/* ============================================================================
 * data_archive.js —— 「六纪元叙事策略」原回合制数据层（设计史料归档）
 * ----------------------------------------------------------------------------
 * 本文件中的全部常量 / 函数，属于《蚁纪·共时》早期「回合制六纪元叙事策略」原型
 * （信息素预算 / 路径笔刷 / 回响信号 / 抉择 / 双随机亲和矩阵 / 网格 CONFIG / 自检）。
 * 当前游戏已演进为「四域战争」RTS（见 rts.js / sim.js / world.js），
 * 该层与 RTS 运行时无任何依赖关系，故从 data.js 抽出归档，保持主数据层（data.js）
 * 只承载 RTS 实际使用的品种 / 纪元 / 维度等单一事实源。
 *
 * 注意：本文件不会被任何运行时模块 import，仅作设计与数值回溯的史料保留。
 * 若未来重启回合制玩法，从这里回迁即可。
 * ==========================================================================*/
import { SPECIES, ERAS, DIM_KEYS, BALANCE_INVARIANT } from './data.js';

// 双随机亲和矩阵：每行、每列和均为 6.00
const BASE_AFF = [1.12, 1.06, 1.00, 0.94, 0.94, 0.94];
export const AFFINITY = SPECIES.map(s => ERAS.map((_, i) => BASE_AFF[((i - s.eraPeak) % 6 + 6) % 6]));

export const STAGES = [
  { id: 'G1', name: '幼群 / 初巢', scale: 0.82, sat: 0.78, trigger: '世代 0–4', desc: '解锁 3 类巢室；无脊刺、无共时环。' },
  { id: 'G2', name: '盛群 / 盛巢', scale: 1.00, sat: 1.00, trigger: '世代 ≥4 且锚点 ≥5（MVP 压缩节奏）', desc: '解锁 5 类巢室；品种脊纹、背刺、绒毛全量。' },
  { id: 'G3', name: '共时群 / 共时巢', scale: 1.12, sat: 1.15, trigger: '世代 ≥9 且锚点 ≥16（MVP 压缩节奏）', desc: '全巢室 + 专属室；体表浮现共时环。' },
];

export const BRUSHES = [
  { key: 'forage', name: '觅食径', color: '#7E9B7A', hex: 0x7e9b7a, cost: 1.0, desc: '把工蚁引向食源，提升每世代收获' },
  { key: 'alarm', name: '警戒', color: '#B4604A', hex: 0xb4604a, cost: 1.4, desc: '抵御兵燹 / 疫病类回响，降低损失' },
  { key: 'brood', name: '育幼', color: '#C9A45C', hex: 0xc9a45c, cost: 1.2, desc: '幼虫与卵的存活率，提升繁育' },
  { key: 'memory', name: '归属', color: '#7C92A8', hex: 0x7c92a8, cost: 1.6, desc: '唯一能维持史卷完整度的信息素，防止传承断裂' },
];
export const BRUSH_KEYS = BRUSHES.map(b => b.key);

export const SIGNALS = [
  { name: '迁徙', desc: '地面的震动成群远去，旧路上的食物忽然断了。', bias: 'forage' },
  { name: '筑造', desc: '夯土被一遍遍压实，一段支道被永久封进层里。', bias: 'memory' },
  { name: '丰歉', desc: '这一季的落果多得反常，储粮室一夜溢满。', bias: 'forage' },
  { name: '兵燹', desc: '同向的车辙压过巢口，震动沿主道一路下沉。', bias: 'alarm' },
  { name: '疫病', desc: '巢里出现陌生的气味，隔离室的灰绿光又亮了。', bias: 'alarm' },
  { name: '通路', desc: '一条更直的路被铺到地表，六向路径开始收束。', bias: 'forage' },
  { name: '书写', desc: '带着相同墨痕的纸片反复落入土层，像一种记忆。', bias: 'memory' },
  { name: '祭祀', desc: '火光与香料的味道渗进穹顶，尘埃整夜未落。', bias: 'brood' },
  { name: '断裂', desc: '一段主道突然塌了，史卷里少了几行。', bias: 'memory' },
  { name: '共振', desc: '六层地层同时轻轻震了一下，像有人翻过一页。', bias: 'memory' },
];

export const CHOICES = [
  { id: 'follow', name: '顺应它', desc: '族群顺着变化改道，收益即时，但记载会模糊。', hint: '食物 + / 史卷 −' },
  { id: 'record', name: '记下它', desc: '史官蚁把这一次回响压进刻痕层，代价是当期收成。', hint: '史卷 + / 食物 −' },
  { id: 'detour', name: '绕开它', desc: '不解读、不记录，把预算留给下一条路。', hint: '预算 + / 锚点不变' },
];

export const CONFIG = {
  GRID_W: 48, GRID_H: 32, LAYERS: 6,
  TILE: 2.5,            // 1 tile = 2.5 cm
  LAYER_H: 6,           // 1 深度层 = 6 cm
  GEN_SECONDS: 8,       // MVP 加速：1 世代 8 秒（正式版按 GDD 关卡节奏）
  BUDGET: 100,
  TICK: 0.10,
  ANCHOR_GATES: [0, 4, 9, 14, 20, 26],  // 进入各纪元所需锚点
  ANCHOR_WIN: 29,
  MEMORY_FAIL: 0.20,
  SAVE_KEY: 'ant_epoch_save_v2',
};

// 自检：与 Python 单一数据源保持一致（仅史料校验，运行时无用）
export function selfCheck() {
  const errs = [];
  for (const s of SPECIES) {
    const sum = DIM_KEYS.reduce((a, k) => a + s.mods[k], 0);
    if (Math.abs(sum - BALANCE_INVARIANT) > 1e-6) errs.push(`${s.id} 乘数和 ${sum.toFixed(4)} ≠ 10.00`);
    if (s.perks.length !== 3) errs.push(`${s.id} 专属机制数不符`);
  }
  AFFINITY.forEach((row, i) => {
    const s = row.reduce((a, b) => a + b, 0);
    if (Math.abs(s - 6) > 1e-6) errs.push(`亲和第 ${i + 1} 行和 ${s.toFixed(4)} ≠ 6.00`);
  });
  for (let j = 0; j < 6; j++) {
    const s = AFFINITY.reduce((a, row) => a + row[j], 0);
    if (Math.abs(s - 6) > 1e-6) errs.push(`亲和第 ${j + 1} 列和 ${s.toFixed(4)} ≠ 6.00`);
  }
  return errs;
}
