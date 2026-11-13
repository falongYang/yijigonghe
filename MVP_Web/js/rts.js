/* 《蚁纪·共时》Web MVP — RTS 玩法配置层 v2
 * 成长方式：采集 → 建造 → 出兵 → 研究纪元 → 战争与掠夺。
 * 本版新增：四域环境（陆/海/空/地下）、武器系统（伤害类型+弹道）、能力系统
 * （信息素驱动的主动技能）、成长系统（经验/等级/进化）、资源系统（生物质/
 * 矿物/信息素）。全部保留「蚁」主题与六纪元美术基调。
 * 本文件只出数据与派生函数，不依赖 three；模拟层 sim.js 与界面层 ui.js 共用。
 */
import { SPECIES, ERAS } from './data.js';

export const MAP = { W: 188, H: 134 };   // 战场地面尺寸（单位=cm，同 v2 口径）
export const HALF_W = MAP.W / 2, HALF_H = MAP.H / 2;
export const SIDES = { PLAYER: 'P', ENEMY: 'E' };
export const ENEMY_NAMES = { P: '我方蚁群', E: '敌方蚁群' };

export const START_BIO = 340;
export const START_MIN = 80;
export const START_PH = 40;
export const POP_CAP = 110;                // 单阵营人口上限（含工蚁）
export const NODE_AMOUNT = [620, 880, 760]; // 资源点储量档位

/* --------------------- 战术地形（sim / world / ui 共用的唯一真源） --------------------- */
// 地面顶点高度、贴地装饰、坡度判定、小地图明暗都从这里派生，
// 避免三处各自实现导致「看起来是坡、逻辑上却是平地」。
export function terrainNoise(x, z) {
  return Math.sin(x * 0.13 + 1.7) * Math.cos(z * 0.11 - 0.5) * 0.6
    + Math.sin(x * 0.05 - z * 0.07 + 2.1) * 0.9
    + Math.sin((x + z) * 0.21 + 0.3) * 0.35;
}
export function terrainHeight(x, z) {
  const edge = Math.max(Math.abs(x) / HALF_W, Math.abs(z) / HALF_H);
  return terrainNoise(x, z) * 2.4 + (edge > 0.78 ? (edge - 0.78) * 26 : 0);
}

// 高台加射程、泥沼与浅滩减速；空域 / 地下 / 水域单位按域免疫地面减速。
export const TERRAIN = {
  ridge: { name: '高台', hex: 0xffd27f, css: '#ffd27f', desc: '远程射程 +18%', speed: 1, range: 1.18 },
  mire:  { name: '泥沼', hex: 0x7fae6a, css: '#8fc07a', desc: '地面移速 −22%', speed: 0.78, range: 1 },
  water: { name: '浅滩', hex: 0x5fa8c8, css: '#5fa8c8', desc: '陆地移速 −28%', speed: 0.72, range: 1 },
};

// 确定性伪随机：同一章节每次开局得到相同布局，便于战术记忆与回归测试。
function _seedOf(cfg) {
  const s = String((cfg && cfg.name) || 'ant');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}
function _rnd(seed, i) {
  const v = Math.sin((seed * 91.7 + i * 12.9898) * 43758.5453);
  return v - Math.floor(v);
}

/** 生成一章的战术地形区：2 高台 + 2 泥沼 + 全部水域浅滩（旋转椭圆）。 */
export function mapZones(cfg) {
  const seed = _seedOf(cfg), out = [];
  const waters = (cfg && cfg.water) || [];
  const clearOfWater = (x, z, pad) => waters.every(w => Math.hypot(x - w.x, z - w.z) > w.r + pad);
  for (let i = 0; i < 4; i++) {
    const type = i < 2 ? 'ridge' : 'mire';
    let x = 0, z = 0, rx = 14, rz = 11, ok = false;
    for (let k = 0; k < 24 && !ok; k++) {
      x = (_rnd(seed, i * 10 + k) * 2 - 1) * HALF_W * 0.58;
      z = (_rnd(seed, i * 10 + k + 5) * 2 - 1) * HALF_H * 0.52;
      rx = 12 + _rnd(seed, i * 10 + k + 1) * 7;
      rz = 10 + _rnd(seed, i * 10 + k + 2) * 6;
      // 允许地貌贴着浅滩边缘，但中心不得落在深水里，也不压住双方巢区。
      ok = clearOfWater(x, z, Math.max(rx, rz) * 0.3)
        && Math.hypot(x, z - HALF_H * 0.62) > 22
        && Math.hypot(x, z + HALF_H * 0.62) > 22;
    }
    if (!ok) continue;
    out.push({ id: `${type}${i}`, type, x, z, rx, rz, rot: (_rnd(seed, i * 10 + 7) - 0.5) * 0.7 });
  }
  for (let i = 0; i < waters.length; i++) {
    const w = waters[i];
    out.push({ id: `water${i}`, type: 'water', x: w.x, z: w.z, rx: w.r, rz: w.r, rot: 0 });
  }
  return out;
}

/** 某点所处的战术地形区（重叠时取归一化距离最小者），无则返回 null。 */
export function zoneAt(zones, x, z) {
  let best = null, bd = Infinity;
  for (const q of zones || []) {
    const dx = x - q.x, dz = z - q.z;
    const c = Math.cos(q.rot || 0), s = Math.sin(q.rot || 0);
    const u = (dx * c + dz * s) / q.rx, v = (-dx * s + dz * c) / q.rz;
    const d = u * u + v * v;
    if (d <= 1 && d < bd) { bd = d; best = q; }
  }
  return best;
}

/** 中立信息素井：避开深水、靠近战线中轴的争夺点；部分章节 2 个。 */
export function mapWells(cfg) {
  const seed = _seedOf(cfg);
  const cand = [[0, 0], [-34, 6], [34, -6], [0, 24], [0, -24], [-46, -18], [46, 18],
    [-68, 34], [68, -34], [-70, -6], [70, 6], [0, 48], [0, -48], [-40, 44], [40, -44]];
  const waters = (cfg && cfg.water) || [];
  // 井可以落在浅滩边，但不能落在水心；同时避开双方巢区，保证是「需要出兵去争」的中立点。
  let spots = cand.filter(([x, z]) => Math.abs(z) < HALF_H - 8 && Math.abs(x) < HALF_W - 8
    && Math.hypot(x, z - HALF_H * 0.62) > 24 && Math.hypot(x, z + HALF_H * 0.62) > 24
    && waters.every(w => Math.hypot(x - w.x, z - w.z) > w.r * 0.78 + 4));
  if (!spots.length) spots = [[0, HALF_H * 0.12]];   // 兜底：每章至少一口井
  // 与资源点错位：避免工蚁采集时「顺手」占领，让井真正需要主动派兵去争。
  const nudge = ([x, z]) => {
    if (!(cfg.nodes || []).some(n => Math.hypot(x - n.x, z - n.z) < 10)) return [x, z];
    for (const [dx, dz] of [[14, 0], [-14, 0], [0, 14], [0, -14]]) {
      const nx = x + dx, nz = z + dz;
      if (Math.abs(nx) > HALF_W - 8 || Math.abs(nz) > HALF_H - 8) continue;
      if (Math.hypot(nx, nz - HALF_H * 0.62) < 24 || Math.hypot(nx, nz + HALF_H * 0.62) < 24) continue;
      if (waters.some(w => Math.hypot(nx - w.x, nz - w.z) <= w.r + 6)) continue;
      return [nx, nz];
    }
    return [x, z];
  };
  const n = Math.min(spots.length, seed > 0.55 ? 2 : 1);
  return spots.slice(0, n).map(([x, z], i) => {
    const [wx, wz] = nudge([x, z]);
    return { id: `well${i}`, name: '信息素井', x: wx, z: wz, r: 11 };
  });
}
export const WELL = { rate: 1.5, capture: 0.075 };  // 归属方每秒信息素 / 单个单位占领速率

/** 战术掩体（可破坏）：避开水域/双方巢区/资源点/信息素井，确定性散布 5 个岩石或断木。
 *  作为中立阻挡物——单位无法直接穿过（sim 软碰撞绕行），可被主动攻击摧毁，摧毁后通路/视野改变。 */
export function mapObstacles(cfg) {
  const seed = _seedOf(cfg);
  const waters = (cfg && cfg.water) || [];
  const nodes = (cfg && cfg.nodes) || [];
  const cand = [];
  for (let gx = -3; gx <= 3; gx++) {
    for (let gz = -2; gz <= 2; gz++) {
      cand.push([gx * 26 + (_rnd(seed, 100 + Math.abs(gx)) - 0.5) * 10, gz * 30 + (_rnd(seed, 200 + Math.abs(gz)) - 0.5) * 10]);
    }
  }
  const ok = ([x, z]) => Math.abs(x) < HALF_W - 10 && Math.abs(z) < HALF_H - 10
    && Math.hypot(x, z - HALF_H * 0.62) > 26 && Math.hypot(x, z + HALF_H * 0.62) > 26
    && waters.every(w => Math.hypot(x - w.x, z - w.z) > w.r + 8)
    && nodes.every(n => Math.hypot(x - n.x, z - n.z) > 9);
  const spots = cand.filter(ok);
  const out = [], used = [];
  for (let k = 0; k < spots.length && out.length < 5; k++) {
    const i = Math.floor(_rnd(seed, 300 + k) * spots.length) % spots.length;
    const [x, z] = spots[i];
    if (used.some(u => Math.hypot(u[0] - x, u[1] - z) < 18)) continue;
    used.push([x, z]);
    const kind = _rnd(seed, 400 + k) > 0.5 ? 'rock' : 'log';
    const r = 2.6 + _rnd(seed, 500 + k) * 1.8;
    out.push({ id: `ob${out.length}`, x, z, r, kind, rot: (_rnd(seed, 600 + k) - 0.5) * Math.PI, hp: Math.round(70 + r * 32) });
  }
  return out;
}

/* ----------------------------- 四域环境 ----------------------------- */
// 陆/海/空/地下：决定单位的移动层、可攻击目标、专属资源与建筑。
export const DOMAINS = {
  land:        { id: 'land',        name: '陆', key: '陆面', hex: 0x9fa86a, desc: '地表主战场，所有兵种都能通行，资源点最密集。' },
  sea:         { id: 'sea',         name: '海', key: '水域', hex: 0x4fa6c8, desc: '水洼与潮池，仅水栖蚁种可作业，产出生物质藻。' },
  air:         { id: 'air',         name: '空', key: '空域', hex: 0xb9c7e0, desc: '低空层，飞行蚁可越障轰炸陆/海目标。' },
  underground: { id: 'underground', name: '地', key: '地下', hex: 0x6b5742, desc: '隧道层，掘蚁作业矿物，可钻出突袭地表。' },
};
export const DOMAIN_ORDER = ['land', 'sea', 'air', 'underground'];

/* ----------------------------- 资源系统 ----------------------------- */
// 生物质(生) 主经济；矿物(矿) 解锁高级兵种/建筑；信息素(素) 驱动主动能力。
export const RESOURCES = {
  bio: { id: 'bio', name: '生物质', short: '生', hex: 0x8fd06a, desc: '主经济资源，采集叶片/藻类食物获得。' },
  min: { id: 'min', name: '矿物', short: '矿', hex: 0xc9b07a, desc: '采集岩石/深层矿脉获得，解锁空中/地下与重装兵种。' },
  ph:  { id: 'ph',  name: '信息素', short: '素', hex: 0xd98ad0, desc: '蚁后巢与史官堂生成，施放主动能力消耗。' },
};
export const RES_ORDER = ['bio', 'min', 'ph'];

/* ----------------------------- 武器系统 ----------------------------- */
// 伤害类型 vs 护甲类型 的克制倍率（>1 克制，<1 被抗）。
export const DMG_TYPES = ['bite', 'acid', 'sting', 'pierce', 'bomb', 'psi'];
export const ARMOR_TYPES = ['soft', 'chitin', 'armored', 'flying', 'shell'];
export const ARMOR_MULT = {
  //                 soft chitin armored flying shell
  bite:   { soft: 1.00, chitin: 0.85, armored: 0.60, flying: 1.10, shell: 0.55 },
  acid:   { soft: 1.20, chitin: 1.30, armored: 0.90, flying: 1.00, shell: 0.70 },
  sting:  { soft: 1.30, chitin: 1.00, armored: 0.80, flying: 1.05, shell: 0.65 },
  pierce: { soft: 1.15, chitin: 1.05, armored: 1.30, flying: 0.90, shell: 1.10 },
  bomb:   { soft: 1.00, chitin: 0.90, armored: 0.80, flying: 1.10, shell: 0.70 },
  psi:    { soft: 1.00, chitin: 1.00, armored: 1.00, flying: 1.00, shell: 1.00 },
};
export const WEAPONS = {
  w_bite:   { name: '大颚撕咬', dtype: 'bite',   range: 2.2, atkcd: 0.85, melee: true,  proj: 'melee', splash: 0 },
  w_acid:   { name: '酸液喷射', dtype: 'acid',   range: 11,  atkcd: 1.1,  melee: false, proj: 'acid',  splash: 0 },
  w_major:  { name: '巨颚重击', dtype: 'pierce', range: 2.7, atkcd: 1.15, melee: true,  proj: 'melee', splash: 0 },
  w_tower:  { name: '警戒酸弹', dtype: 'acid',   range: 22,  atkcd: 0.7,  melee: false, proj: 'bolt',  splash: 0 },
  w_rower:  { name: '桨击',     dtype: 'bite',   range: 2.3, atkcd: 0.9,  melee: true,  proj: 'melee', splash: 0 },
  w_diver:  { name: '毒针',     dtype: 'sting',  range: 9,   atkcd: 1.0,  melee: false, proj: 'sting', splash: 0 },
  w_flyer:  { name: '俯冲撕咬', dtype: 'bite',   range: 2.5, atkcd: 0.8,  melee: true,  proj: 'dive',  splash: 0 },
  w_glider: { name: '落籽轰炸', dtype: 'bomb',   range: 13,  atkcd: 1.3,  melee: false, proj: 'bomb',  splash: 4.5 },
  w_tunnel: { name: '掘颚穿刺', dtype: 'pierce', range: 2.6, atkcd: 1.0,  melee: true,  proj: 'melee', splash: 0 },
  w_burrow: { name: '钻地突刺', dtype: 'pierce', range: 2.4, atkcd: 0.9,  melee: true,  proj: 'ambush', splash: 0 },
  w_hq:     { name: '巢卫撕咬', dtype: 'bite',   range: 2.4, atkcd: 1.0,  melee: true,  proj: 'melee', splash: 0 },
};

/* ----------------------------- 能力系统 ----------------------------- */
// 主动技能：消耗信息素 + 冷却；效果在 sim._castAbility 内结算。
export const ABILITIES = {
  a_frenzy:    { name: '狂暴',   cost: 12, cd: 18, desc: '6 秒内攻击 +60%、移动 +30%。' },
  a_harden:     { name: '甲壳硬化', cost: 14, cd: 22, desc: '6 秒内受到伤害 −50%。' },
  a_acidpool:   { name: '酸液覆盖', cost: 16, cd: 16, desc: '在目标点泼洒酸池，持续灼伤范围内敌人。' },
  a_whirl:      { name: '涡卷',   cost: 12, cd: 18, desc: '掀起水流，4 秒内减速周围敌人。' },
  a_venom:      { name: '毒雾',   cost: 16, cd: 18, desc: '喷出毒雾，对范围内敌人造成剧毒伤害。' },
  a_dive:       { name: '俯冲轰炸', cost: 14, cd: 16, desc: '升空后俯冲，对落点范围造成轰炸伤害。' },
  a_bomb:       { name: '滑翔轰炸', cost: 16, cd: 18, desc: '投下种荚炸弹，范围爆破伤害。' },
  a_burrow:     { name: '钻地突袭', cost: 14, cd: 20, desc: '潜入地下无法被锁定，3 秒后破土造成突袭伤害。' },
  a_rally:      { name: '信息素号令', cost: 20, cd: 30, desc: '集结附近友军，8 秒内伤害 +20%。' },
  a_resonance:  { name: '纪元共鸣', cost: 24, cd: 40, desc: '全族群 10 秒伤害 +10%（纪元科技爆发）。' },
};

/* 视觉规格契约：把每个能力的「特效类型 + 配色 + 尺寸 + 动效时长」集中声明，
 * 供 B 侧 world/fx/ui 渲染消费（A 侧只定义数据，不渲染）。新增能力务必在此补一条。 */
export const ABILITY_VISUAL = {
  a_frenzy:    { fx: 'ring',   color: 0xff7a3a, size: 2.2, dur: 0.6 },
  a_harden:     { fx: 'ring',   color: 0x9fd0ff, size: 2.4, dur: 0.7 },
  a_acidpool:   { fx: 'acidpool', color: 0x9fe06a, size: 8,   dur: 6 },
  a_whirl:      { fx: 'whirl',  color: 0x6fc8e0, size: 10,  dur: 4 },
  a_venom:      { fx: 'venom',  color: 0xb6ff6f, size: 7,   dur: 3.5 },
  a_dive:       { fx: 'dive',   color: 0xffd27f, size: 5,   dur: 1.2 },
  a_bomb:       { fx: 'bomb',   color: 0xff9a5a, size: 6,   dur: 1.4 },
  a_burrow:     { fx: 'ambush', color: 0x8a7f56, size: 7,   dur: 3 },
  a_rally:      { fx: 'ring',   color: 0xffd27f, size: 3,   dur: 0.8 },
  a_resonance:  { fx: 'ring',   color: 0xc0a0ff, size: 5,   dur: 1.0 },
};

/* ----------------------------- 建筑类型 ----------------------------- */
export const BUILDINGS = {
  hq: {
    id: 'hq', name: '蚁后巢', hp: 1800, size: 7.2, cost: { bio: 0 }, build: 0,
    role: '核心 · 产工蚁 · 生信息素', depot: true, produces: ['worker'], phGen: 1.6, ability: 'a_rally',
    color: 0x6b5742, desc: '巢群核心，被摧毁即告失败；自动缓慢生产工蚁，并作为卸货点与信息素源。',
  },
  nursery: {
    id: 'nursery', name: '育幼室', hp: 620, size: 4.8, cost: { bio: 150 }, build: 7,
    role: '增产工蚁 · 卸货点', depot: true, produces: ['worker'],
    color: 0x8a6f52, desc: '提升工蚁产能（多座叠加加速），并可作为卸货点。',
  },
  barracks: {
    id: 'barracks', name: '兵营', hp: 760, size: 5.4, cost: { bio: 240 }, build: 9,
    role: '生产陆战兵种', domain: 'land', produces: ['s1', 's2', 's3'],
    color: 0x7a5a3e, desc: '生产陆面兵种（兵蚁/酸蚁/巨颚卫），随纪元解锁更高级。',
  },
  tower: {
    id: 'tower', name: '警戒塔', hp: 560, size: 3.4, cost: { bio: 150, min: 40 }, build: 6,
    role: '防御 · 远程', attack: { dmg: 26, range: 22, atkcd: 0.7, ranged: true, weapon: 'w_tower' },
    color: 0x5e4a34, desc: '自动攻击射程内敌方单位/建筑，并可锁定空中目标，是防线支点。',
  },
  tech: {
    id: 'tech', name: '史官堂', hp: 680, size: 5.0, cost: { bio: 340 }, build: 11,
    role: '研究纪元 · 生信息素', research: true, phGen: 3.0, ability: 'a_resonance',
    color: 0x6d6a9c, desc: '研究后推进一个纪元，解锁更强兵种并全族群属性成长；并高速生成信息素、可施放纪元共鸣。',
  },
  // —— 四域巢室：解锁对应域的采集与作战兵种 ——
  seanest: {
    id: 'seanest', name: '水栖巢室', hp: 600, size: 4.6, cost: { bio: 200, min: 60 }, build: 8,
    role: '水域 · 产桨蚁', domain: 'sea', depot: true, produces: ['sw', 'sA', 'sB'],
    color: 0x3f7e8c, desc: '建在水域附近，生产桨蚁（采集藻）与桨卫/潜袭蚁（海战）。',
  },
  airnest: {
    id: 'airnest', name: '空中蜂巢', hp: 560, size: 4.6, cost: { bio: 200, min: 80 }, build: 8,
    role: '空域 · 产飞蚁', domain: 'air', depot: true, produces: ['aw', 'aA', 'aB'],
    color: 0x7d8bb0, desc: '悬于低空，生产浮蚁（空域采集）与飞蚁/滑翔蚁（空袭）。',
  },
  ugnest: {
    id: 'ugnest', name: '地下菌核', hp: 580, size: 4.6, cost: { bio: 180, min: 60 }, build: 8,
    role: '地下 · 产掘蚁', domain: 'underground', depot: true, produces: ['uw', 'uA', 'uB'],
    color: 0x5a4a36, desc: '深入土层，生产掘蚁（采矿物）与隧道蚁/钻地刺蚁（钻地突袭）。',
  },
  refinery: {
    id: 'refinery', name: '精炼巢室', hp: 520, size: 4.4, cost: { bio: 220, min: 80 }, build: 9,
    role: '精炼 · 全军强化', domain: 'land',
    color: 0xb08a4a, desc: '将生物质精炼为信息素化合物：建成即令该族群所有作战单位伤害 +8%（多座不叠加）。',
  },
};
export const BUILD_ORDER = ['nursery', 'barracks', 'tower', 'tech', 'seanest', 'airnest', 'ugnest', 'refinery'];

/* ----------------------------- 兵种类型（13 种） ----------------------------- */
/* 字段：
 * domain   所在域；hp/speed 基础；dmg 基础伤害；weapon 武器键；armor 护甲类型；
 * ability  主动能力键（null=无）；tech 解锁所需纪元；carry 采集量；
 * cost     多资源造价 {bio,min?,ph?}；build 生产秒数；role 'econ'|'combat'；
 * pop      人口占用；eliteFrom 可进化来源；evoTo 进化目标；evo 进化需求。
 */
export const UNITS = {
  // —— 陆 ——
  worker: { id: 'worker', name: '工蚁', caste: 'worker', domain: 'land', hp: 70, speed: 12, dmg: 5,
    weapon: 'w_bite', armor: 'soft', ability: null, tech: 0, carry: 26,
    cost: { bio: 55 }, build: 4.5, role: 'econ', pop: 1, desc: '采集生物质并运回巢，无战斗能力。' },
  s1: { id: 's1', name: '兵蚁', caste: 'soldier', domain: 'land', hp: 165, speed: 9, dmg: 18,
    weapon: 'w_bite', armor: 'chitin', ability: 'a_frenzy', tech: 0,
    critChance: 0.15, critMul: 1.6, flankBonus: 0.18,
    visual: { fx: 'hit', color: 0xf0a040, size: 1.0 },
    cost: { bio: 95 }, build: 6, role: 'combat', pop: 2, evolveTo: 's3',
    evo: { level: 3, era: 1, min: 40 }, desc: '基础近战，可狂暴；15% 暴击、侧翼夹击 +18%、纪元2 / Lv.3 可进化为巨颚卫。' },
  s2: { id: 's2', name: '酸蚁', caste: 'soldier2', domain: 'land', hp: 130, speed: 10, dmg: 24,
    weapon: 'w_acid', armor: 'chitin', ability: 'a_acidpool', tech: 1,
    critChance: 0.12, critMul: 1.5, slowOnHit: 0.14,
    visual: { fx: 'acid', color: 0x9fe06a, size: 1.0 },
    cost: { bio: 170 }, build: 9, role: 'combat', pop: 2, desc: '远程酸液，可泼洒酸池；12% 暴击、命中减速 14%、克制软甲（酸蚀破甲）。' },
  s3: { id: 's3', name: '巨颚卫', caste: 'soldier3', domain: 'land', hp: 330, speed: 7.5, dmg: 44,
    weapon: 'w_major', armor: 'armored', ability: 'a_harden', tech: 2,
    pierce: 0.30, lifesteal: 0.10, flankBonus: 0.15,
    visual: { fx: 'hit', color: 0xffcf6a, size: 1.4 },
    cost: { bio: 280, min: 40 }, build: 14, role: 'combat', pop: 4, desc: '重装巨颚，甲壳硬化；破甲 30%、吸血 10%、克制装甲。' },
  // —— 海 ——
  sw: { id: 'sw', name: '桨蚁', caste: 'worker', domain: 'sea', hp: 72, speed: 11, dmg: 5,
    weapon: 'w_bite', armor: 'soft', ability: null, tech: 0, carry: 24,
    visual: { fx: 'hit', color: 0x6fd0e0, size: 1.0 },
    cost: { bio: 60 }, build: 4.5, role: 'econ', pop: 1, desc: '在水域采集藻类食物（生物质）。' },
  sA: { id: 'sA', name: '桨卫', caste: 'soldier', domain: 'sea', hp: 160, speed: 9, dmg: 18,
    weapon: 'w_rower', armor: 'shell', ability: 'a_whirl', tech: 1,
    slowOnHit: 0.12,
    visual: { fx: 'whirl', color: 0x6fc8e0, size: 1.1 },
    cost: { bio: 110, min: 20 }, build: 6, role: 'combat', pop: 2, evolveTo: 'sB',
    evo: { level: 3, era: 1, min: 40 }, desc: '水栖近战，可涡卷减速；命中减速 12%、壳甲抗撕咬。' },
  sB: { id: 'sB', name: '潜袭蚁', caste: 'soldier2', domain: 'sea', hp: 128, speed: 10, dmg: 26,
    weapon: 'w_diver', armor: 'shell', ability: 'a_venom', tech: 2,
    poisonOnHit: 0.6, lifesteal: 0.06,
    visual: { fx: 'sting', color: 0xb6ff6f, size: 1.1 },
    cost: { bio: 190, min: 50 }, build: 9, role: 'combat', pop: 2, desc: '远程毒针，可喷毒雾；命中中毒、吸血 6%。' },
  // —— 空 ——
  aw: { id: 'aw', name: '浮蚁', caste: 'worker', domain: 'air', hp: 60, speed: 14, dmg: 4,
    weapon: 'w_bite', armor: 'flying', ability: null, tech: 0, carry: 20,
    visual: { fx: 'hit', color: 0xc8d4f0, size: 1.0 },
    cost: { bio: 60 }, build: 4.5, role: 'econ', pop: 1, desc: '空中轻量采集，悬停卸货。' },
  aA: { id: 'aA', name: '飞蚁', caste: 'soldier', domain: 'air', hp: 120, speed: 13, dmg: 17,
    weapon: 'w_flyer', armor: 'flying', ability: 'a_dive', tech: 1,
    critChance: 0.18, critMul: 1.6, flankBonus: 0.20,
    visual: { fx: 'dive', color: 0xffd27f, size: 1.0 },
    cost: { bio: 120, min: 30 }, build: 6, role: 'combat', pop: 2, evolveTo: 'aB',
    evo: { level: 3, era: 1, min: 40 }, desc: '飞行近战，可俯冲轰炸；18% 暴击、侧翼 +20%、克制装甲薄弱目标。' },
  aB: { id: 'aB', name: '滑翔蚁', caste: 'soldier2', domain: 'air', hp: 110, speed: 13, dmg: 22,
    weapon: 'w_glider', armor: 'flying', ability: 'a_bomb', tech: 2,
    poisonOnHit: 0.5, lifesteal: 0.10,
    visual: { fx: 'bomb', color: 0xff9a5a, size: 1.1 },
    cost: { bio: 210, min: 60 }, build: 9, role: 'combat', pop: 2, desc: '滑翔远程，投下种荚范围爆破；命中中毒、吸血 10%。' },
  // —— 地下 ——
  uw: { id: 'uw', name: '掘蚁', caste: 'worker', domain: 'underground', hp: 74, speed: 10, dmg: 5,
    weapon: 'w_bite', armor: 'soft', ability: null, tech: 0, carry: 24,
    visual: { fx: 'hit', color: 0x9a7a52, size: 1.0 },
    cost: { bio: 55 }, build: 4.5, role: 'econ', pop: 1, desc: '在地下采掘矿物（需矿物节点）。' },
  uA: { id: 'uA', name: '隧道蚁', caste: 'soldier', domain: 'underground', hp: 165, speed: 8.5, dmg: 19,
    weapon: 'w_tunnel', armor: 'chitin', ability: 'a_burrow', tech: 1,
    pierce: 0.20, flankBonus: 0.15,
    visual: { fx: 'ambush', color: 0x8a7f56, size: 1.1 },
    cost: { bio: 110, min: 20 }, build: 6, role: 'combat', pop: 2, evolveTo: 'uB',
    evo: { level: 3, era: 1, min: 40 }, desc: '钻地道近战，可钻地突袭；破甲 20%、侧翼 +15%、克制装甲。' },
  uB: { id: 'uB', name: '钻地刺蚁', caste: 'soldier3', domain: 'underground', hp: 320, speed: 7, dmg: 42,
    weapon: 'w_burrow', armor: 'armored', ability: 'a_burrow', tech: 2,
    pierce: 0.25, lifesteal: 0.08,
    visual: { fx: 'ambush', color: 0xb8a06a, size: 1.4 },
    cost: { bio: 200, min: 60 }, build: 14, role: 'combat', pop: 4, desc: '重装钻地，破土突袭造成额外伤害；破甲 25%、吸血 8%。' },

  /* —— 三种敌人性格的「专属兵种」（玩家不可生产，仅对应性格的敌方可造）——
   * sig 字段用于在几何层附加性格化造型（红角突刺 / 甲群护盾 / 重甲壳）。 */
  charger: { id: 'charger', name: '狂袭蚁', caste: 'soldier', domain: 'land', hp: 150, speed: 16, dmg: 22,
    weapon: 'w_bite', armor: 'chitin', ability: 'a_frenzy', tech: 1,
    critChance: 0.20, critMul: 1.7, flankBonus: 0.20,
    visual: { fx: 'hit', color: 0xff6a4a, size: 1.1 },
    cost: { bio: 130 }, build: 7, role: 'combat', pop: 2, archetypeOnly: 'aggressive', sig: 'aggressive',
    desc: '掠食型专属：高速冲锋，20% 暴击、侧翼 +20%、撕咬狂暴，先发制人碾碎防线。' },
  brood: { id: 'brood', name: '殖群卫', caste: 'soldier2', domain: 'land', hp: 140, speed: 13, dmg: 20,
    weapon: 'w_rower', armor: 'shell', ability: 'a_whirl', tech: 1,
    slowOnHit: 0.16,
    visual: { fx: 'whirl', color: 0x6ad0a0, size: 1.1 },
    cost: { bio: 140 }, build: 7, role: 'combat', pop: 2, archetypeOnly: 'expansionist', sig: 'expansionist',
    desc: '拓殖型专属：甲群护盾，涡卷控场，命中减速 16%，以数量与韧性碾压。' },
  siege: { id: 'siege', name: '炮甲蚁', caste: 'soldier3', domain: 'land', hp: 300, speed: 6.5, dmg: 38,
    weapon: 'w_major', armor: 'armored', ability: 'a_harden', tech: 2,
    pierce: 0.35,
    visual: { fx: 'hit', color: 0xc0a060, size: 1.4 },
    cost: { bio: 300 }, build: 13, role: 'combat', pop: 4, archetypeOnly: 'defensive', sig: 'defensive',
    desc: '守城型专属：重甲近战压制，破甲 35%、甲壳硬化，与塔阵构成核心防线。' },
};

/* 单位视觉规格（聚合 UNITS 上的 visual 字段，便于 B 侧一次性读取）。
 * 注：原定义位于 UNITS 之前，会因 ES 暂时性死区（TDZ）在模块顶层求值时报
 * 「Cannot access 'UNITS' before initialization」，导致 rts.js 整模块加载失败、
 * 游戏白屏。现已移至 UNITS 声明之后（仅调整求值顺序，未改动任何单位数据）。 */
export const UNIT_VISUAL = Object.fromEntries(
  Object.values(UNITS).map(u => [u.id, u.visual || { fx: 'hit', color: 0xffffff, size: 1 }])
);

/* --------------------------------------------------------------------------
 * 单位动作状态机规格（只读，供 world.js / ants.js 驱动骨骼、步频与粒子）。
 * sim 只写 u.anim = { state, t, seq, prev }，不消费以下任何数值：
 *   loop     是否循环播放；dur 单次播放时长（loop 状态忽略）；blend 建议混合时长；
 *   priority 动作用通道优先级，高者可打断低者。
 * 与 u.state（AI 状态机）刻意解耦：u.state 决定「做什么」，u.anim 决定「演什么」。
 * 表现层可选消费；不消费时原有基于 state/moving/flash 的动画完全不受影响。
 * ------------------------------------------------------------------------ */
export const UNIT_ANIM = {
  idle:    { label: '待机', loop: true,  dur: 0,    blend: 0.18, priority: 0 },
  move:    { label: '行进', loop: true,  dur: 0,    blend: 0.12, priority: 1 },
  harvest: { label: '采集', loop: true,  dur: 0,    blend: 0.15, priority: 2 },
  carry:   { label: '搬运', loop: true,  dur: 0,    blend: 0.15, priority: 2 },
  repair:  { label: '修缮', loop: true,  dur: 0,    blend: 0.15, priority: 2 },
  attack:  { label: '攻击', loop: false, dur: 0.35, blend: 0.05, priority: 4 },
  hurt:    { label: '受击', loop: false, dur: 0.22, blend: 0.04, priority: 5 },
  death:   { label: '阵亡', loop: false, dur: 0.60, blend: 0.00, priority: 9 },
};
export const ANIM_STATES = Object.keys(UNIT_ANIM);

/* --------------------------------------------------------------------------
 * 单位「手感」规格：转向速率、步频、起伏、起手、后坐、拖尾，按四域派生。
 * 纯表现数据：sim 只把它们用于推导 u.feel（朝向插值 / 相位 / 衰减包络），
 * 绝不参与伤害、冷却、索敌、命中判定；B 侧不消费时原有动画完全不受影响。
 * 与 UNIT_ANIM 的分工：ANIM 决定「播哪段动作」，FEEL 决定「动作怎么动」。
 * ------------------------------------------------------------------------ */
const FEEL_BY_DOMAIN = {
  land:        { turnRate: 7.0, gait: 2.2, bob: 0.10, windup: 0.16, recoil: 0.55, trail: 0.25 },
  sea:         { turnRate: 4.2, gait: 1.4, bob: 0.16, windup: 0.22, recoil: 0.35, trail: 0.55 },
  air:         { turnRate: 9.5, gait: 3.4, bob: 0.22, windup: 0.10, recoil: 0.25, trail: 0.70 },
  underground: { turnRate: 5.5, gait: 1.8, bob: 0.06, windup: 0.20, recoil: 0.45, trail: 0.18 },
};
export const UNIT_FEEL = Object.fromEntries(Object.values(UNITS).map(u => {
  const d = FEEL_BY_DOMAIN[u.domain] || FEEL_BY_DOMAIN.land;
  const econ = u.role === 'econ';
  // UNITS 只声明 weapon；射程与近战标志在 WEAPONS 上（u.range 是 effectiveUnit 才派生的）。
  const w = WEAPONS[u.weapon];
  const ranged = w ? !w.melee : (u.range || 0) > 10;
  return [u.id, {
    turnRate: +(d.turnRate * (econ ? 1.15 : 1)).toFixed(2),
    gait:     +(d.gait * (econ ? 1.10 : 1)).toFixed(2),
    bob:      +(d.bob * (econ ? 0.75 : 1)).toFixed(2),
    windup:   +(d.windup * (ranged ? 1.25 : 1)).toFixed(2),
    recoil:   +(d.recoil * (ranged ? 1.20 : 1)).toFixed(2),
    trail:    d.trail,
    scale:    (u.visual && u.visual.size) || 1,
  }];
}));

/* 弹道只读规格：键与 sim._projFor 的输出一致（acid/sting/bolt/bomb/melee/psi）。
 * speed 仅用于推算弹道寿命与视觉插值，不改变伤害「结算当帧」这一既定语义。 */
export const PROJECTILE_SPEC = {
  acid:  { speed: 34, arc: 0.18, trail: 0.70, color: 0x9be05a, hit: 'acid' },
  sting: { speed: 46, arc: 0.08, trail: 0.50, color: 0xffe27f, hit: 'hit'  },
  bolt:  { speed: 52, arc: 0.06, trail: 0.40, color: 0xaef06a, hit: 'hit'  },
  bomb:  { speed: 26, arc: 0.42, trail: 0.90, color: 0xff8a5a, hit: 'bomb' },
  melee: { speed: 0,  arc: 0.00, trail: 0.00, color: 0xffd27f, hit: 'hit'  },
  psi:   { speed: 40, arc: 0.00, trail: 0.80, color: 0xc7b3ff, hit: 'ring' },
};
const PROJ_BY_DTYPE = { acid: 'acid', sting: 'sting', pierce: 'bolt', bomb: 'bomb', bite: 'melee', psi: 'psi' };
export function projectileFor(dtype) {
  return PROJECTILE_SPEC[PROJ_BY_DTYPE[dtype] || 'bolt'] || PROJECTILE_SPEC.bolt;
}

/* 战术目标偏好：只有「新增原型」声明 targetPolicy 才生效；原三档为 undefined，
 * sim._tacticalTarget 中整段加权分支不会进入，默认对局逐字不变。
 * 数值为「偏好权重」（正数=更优先），在评分里按难度 targeting 强度缩放。 */
export const TARGET_POLICIES = {
  hq:       { id: 'hq',       label: '直捣蚁后', worker: 0.0, building: 0.0, hq: 2.0, ranged: 0.0, lowHp: 0.5 },
  economy:  { id: 'economy',  label: '断粮奇袭', worker: 1.8, building: 0.0, hq: 0.0, ranged: 0.0, lowHp: 0.6 },
  counters: { id: 'counters', label: '剪除攻城', worker: 0.0, building: 0.2, hq: 0.0, ranged: 1.6, lowHp: 0.8 },
  balanced: { id: 'balanced', label: '均衡绞杀', worker: 0.5, building: 0.2, hq: 0.6, ranged: 0.6, lowHp: 1.0 },
};

/* --------------------------------------------------------------------------
 * 细节四·只读表现规格：受击物理 / 死亡演出 / 建筑外观 / 资源阶段。
 * sim 只把这些数值写进 u.phys / b.visual / n.phase 等字段，供 B 侧可选消费；
 * **绝不参与**伤害、冷却、索敌、移动、采集速率与胜负结算。B 侧不消费时，
 * 原有基于 flash / anim / glow 的表现路径完全不受影响。
 * ------------------------------------------------------------------------ */
export const IMPACT_SPEC = {
  bite:   { knock: 0.95, hitstop: 0.045, shake: 0.10, color: 0xffd27f },
  acid:   { knock: 0.55, hitstop: 0.030, shake: 0.06, color: 0x9be05a },
  sting:  { knock: 0.75, hitstop: 0.040, shake: 0.08, color: 0xffe27f },
  pierce: { knock: 1.20, hitstop: 0.060, shake: 0.14, color: 0xaef06a },
  bomb:   { knock: 1.60, hitstop: 0.090, shake: 0.24, color: 0xff8a5a },
  psi:    { knock: 0.35, hitstop: 0.025, shake: 0.05, color: 0xc7b3ff },
};
const IMPACT_BY_DOMAIN = { land: 1.00, sea: 1.15, air: 1.35, underground: 0.75 };
/** 解析后的受击规格：击退基线按目标所处域微调（空域更飘、地下更沉）。 */
export function impactFor(dtype, domain = 'land') {
  const base = IMPACT_SPEC[dtype] || IMPACT_SPEC.bite;
  const mul = IMPACT_BY_DOMAIN[domain] || 1;
  return { ...base, knock: +(base.knock * mul).toFixed(3), dtype, domain };
}

/** 死亡演出：fall 倒地时长、sink 沉降、fade 淡出、spin 旋转、scatter 碎片。 */
export const CORPSE_SPEC = {
  land:        { fall: 0.42, sink: 1.10, fade: 1.60, spin: 1.0, scatter: 3 },
  sea:         { fall: 0.30, sink: 1.60, fade: 2.00, spin: 0.6, scatter: 2 },
  air:         { fall: 0.85, sink: 0.55, fade: 1.20, spin: 2.2, scatter: 4 },
  underground: { fall: 0.20, sink: 0.70, fade: 1.00, spin: 0.4, scatter: 2 },
};
export function corpseFor(domain = 'land') {
  const known = !!CORPSE_SPEC[domain];
  return { ...(CORPSE_SPEC[domain] || CORPSE_SPEC.land), domain: known ? domain : 'land' };
}

/** 建筑外观分级：按耐久比取档，施工中单独一档（与 state 字段无关，纯表现）。 */
export const BUILDING_STAGES = [
  { id: 'intact',   label: '完好', min: 0.75, smoke: 0.00, ember: 0.00, crack: 0.0 },
  { id: 'scarred',  label: '受损', min: 0.45, smoke: 0.35, ember: 0.12, crack: 0.4 },
  { id: 'critical', label: '危急', min: 0.00, smoke: 0.85, ember: 0.55, crack: 0.9 },
];
export function buildingStageOf(ratio, constructing = false) {
  if (constructing) return { id: 'building', label: '施工中', min: -1, smoke: 0.15, ember: 0, crack: 0 };
  const r = Math.max(0, Math.min(1, ratio));
  return BUILDING_STAGES.find(s => r >= s.min) || BUILDING_STAGES[BUILDING_STAGES.length - 1];
}

/** 资源点生命周期阶段：只描述「看起来多不多」，不改变 regen / gather / amount。 */
export const NODE_PHASES = [
  { id: 'abundant', label: '丰饶', min: 0.70, glow: 1.00, pulse: 1.20 },
  { id: 'steady',   label: '稳定', min: 0.35, glow: 0.65, pulse: 0.80 },
  { id: 'scarce',   label: '稀疏', min: 0.05, glow: 0.30, pulse: 0.45 },
  { id: 'depleted', label: '枯竭', min: 0.00, glow: 0.10, pulse: 0.15 },
];
export function nodePhaseOf(ratio) {
  const r = Math.max(0, Math.min(1, ratio));
  return NODE_PHASES.find(p => r >= p.min) || NODE_PHASES[NODE_PHASES.length - 1];
}

// 每种性格对应的专属兵种键
export const ARCHETYPE_UNITS = { aggressive: 'charger', expansionist: 'brood', defensive: 'siege' };
// 兵营/各域巢可产兵种（按纪元解锁）
export const SOLDIER_TIERS = ['s1', 's2', 's3'];
export const UNIT_ORDER = ['worker', 's1', 's2', 's3', 'sw', 'sA', 'sB', 'aw', 'aA', 'aB', 'uw', 'uA', 'uB'];

/* 成长系统：经验阈值与每级加成 */
export const XP_PER_LEVEL = [0, 60, 150, 300, 520, 800];   // 索引=目标等级
export const MAX_LEVEL = 5;
export const LEVEL_HP = 0.08, LEVEL_DMG = 0.08;             // 每级 +8%
export const ELITE_HP = 0.45, ELITE_DMG = 0.45;             // 进化 +45%

/* --------------------- 品种 → 专长域映射 --------------------- */
// 六品种分别专精不同域，专长域内单位 +12% 属性，且本域巢室造价 −25%、解锁早一纪元。
export const SPECIALTY = {
  SP01: 'land', SP02: 'air', SP03: 'underground', SP04: 'land', SP05: 'sea', SP06: 'air',
};
export function specialtyOf(spId) { return SPECIALTY[spId] || 'land'; }

/* --------------------- 品种 → RTS 属性派生系数 --------------------- */
export function rtsMods(sp) {
  const m = sp.mods;
  return {
    workerCarry: 0.55 + m.forage * 0.55,
    workerCost: 1.30 - m.budget * 0.16,
    workerHp: 0.70 + m.hardiness * 0.30,
    soldierHp: 0.62 + m.hardiness * 0.26 + m.defend * 0.12,
    soldierDmg: 0.58 + m.defend * 0.30 + m.alarm * 0.12,
    soldierCost: 1.22 - m.budget * 0.14,
    speed: 0.66 + m.mobility * 0.34,
    towerBonus: 0.80 + m.alarm * 0.30,
    techCost: 1.30 - m.memory * 0.26,
    raidBonus: 0.45 + m.mobility * 0.40,
  };
}

/* 计算某兵种在「品种+纪元+等级+精英+专长」下的有效数值 */
export function effectiveUnit(uid, sp, era, opts = {}) {
  const base = UNITS[uid];
  const r = rtsMods(sp);
  const level = opts.level || 1;
  const elite = opts.elite ? 1 : 0;
  const isWorker = base.role === 'econ';
  const spec = specialtyOf(sp.id);
  const specMul = (base.domain === spec) ? 1.12 : 1.0;
  const eraBuff = 1 + era * 0.07;            // 每纪元 +7% 全局（纪元科技加成）
  const lvBuff = 1 + (level - 1) * LEVEL_HP; // 等级 HP 倍率（伤害单独）
  const eHp = (isWorker ? r.workerHp : r.soldierHp) * specMul * eraBuff * lvBuff * (1 + elite * ELITE_HP);
  const eDmg = (isWorker ? 1 : r.soldierDmg) * specMul * eraBuff * (1 + (level - 1) * LEVEL_DMG) * (1 + elite * ELITE_DMG);
  return {
    uid,
    name: base.name + (elite ? '·精英' : ''),
    caste: base.caste,
    domain: base.domain,
    weapon: base.weapon,
    armor: base.armor,
    ability: base.ability,
    hp: Math.round(base.hp * eHp),
    dmg: Math.round(base.dmg * eDmg),
    speed: +(base.speed * r.speed).toFixed(2),
    range: WEAPONS[base.weapon].range,
    atkcd: WEAPONS[base.weapon].atkcd,
    melee: WEAPONS[base.weapon].melee,
    dtype: WEAPONS[base.weapon].dtype,
    splash: WEAPONS[base.weapon].splash,
    // —— 战斗细节 traits（加性：未声明则默认 0/无，既有单位行为不变）——
    critChance: base.critChance || 0, critMul: base.critMul || 1.5,
    pierce: base.pierce || 0,
    flankBonus: base.flankBonus || 0,
    lifesteal: base.lifesteal || 0,
    poisonOnHit: base.poisonOnHit || 0,    // 命中附带中毒 DoT（dps，持续 3s）
    slowOnHit: base.slowOnHit || 0,        // 命中附带减速（幅度，持续 2s）
    carry: base.carry ? Math.round(base.carry * r.workerCarry) : 0,
    cost: effectiveCost(uid, sp),
    build: base.build,
    tech: base.tech,
    role: base.role,
  };
}

// 多资源造价：专长域巢 −25%，纪元每级 −3%（上限 25%）
export function effectiveCost(uid, sp) {
  const base = UNITS[uid].cost;
  const r = rtsMods(sp);
  const isWorker = UNITS[uid].role === 'econ';
  const costMul = (isWorker ? r.workerCost : r.soldierCost);
  const out = {};
  if (base.bio) out.bio = Math.max(15, Math.round(base.bio * costMul));
  if (base.min) out.min = Math.round(base.min * 0.9);
  if (base.ph) out.ph = base.ph;
  return out;
}

export function effectiveBuilding(bid, sp) {
  const base = BUILDINGS[bid];
  const r = rtsMods(sp);
  const out = {
    id: bid, name: base.name, hp: base.hp, size: base.size, color: base.color,
    domain: base.domain || 'land', depot: !!base.depot, phGen: base.phGen || 0,
  };
  if (base.attack) {
    const w = WEAPONS[base.attack.weapon];
    out.attack = {
      dmg: Math.round(base.attack.dmg * r.towerBonus),
      range: base.attack.range * (0.9 + r.towerBonus * 0.12),
      atkcd: base.attack.atkcd,
      ranged: base.attack.ranged,
      weapon: base.attack.weapon,
      dtype: w.dtype, splash: w.splash,
    };
  }
  return out;
}

// 巢室造价：专长域巢室 −25%；纪元每级 −3%（上限 25%）。
// 与兵种 effectiveCost 的「品种系数」区分：这里是「巢室」维度的策略折扣，
// 让选种时的专长域真正带来经济与解锁优势（设计承诺）。
export function effectiveBuildingCost(bid, sp, era) {
  const base = BUILDINGS[bid].cost || {};
  const b = BUILDINGS[bid];
  let factor = Math.max(0.75, 1 - 0.03 * (era || 0));            // 纪元折扣，封顶 25%
  if (b.domain && b.domain === specialtyOf(sp.id)) factor *= 0.75; // 专长域巢室 −25%
  const out = {};
  if (base.bio) out.bio = Math.max(0, Math.round(base.bio * factor));
  if (base.min) out.min = Math.max(0, Math.round(base.min * factor));
  if (base.ph) out.ph = base.ph;
  return out;
}

export function researchCost(sp, era) {
  return Math.round(360 * rtsMods(sp).techCost * (1 + era * 0.55));
}

export const ERA_NAMES = ERAS.map(e => `${e.no} ${e.name}`);
export const MAX_ERA = 5;

// 跨域交战规则：所有域之间均可交火（开放环境），环境差异通过
// 「地下掘蚁潜行不可被锁定」「飞行蚁悬空越障」等机制体现，而非硬性克制。
export function canEngage(aDomain, tDomain) { return true; }

// 敌方在玩家选定后分配一个不同品种，并尽量不同专长域，制造对抗差异
export function pickEnemySpecies(playerId) {
  const pSpec = specialtyOf(playerId);
  const others = SPECIES.filter(s => s.id !== playerId);
  const diffDomain = others.filter(s => specialtyOf(s.id) !== pSpec);
  const pool = diffDomain.length ? diffDomain : others;
  const idx = (SPECIES.findIndex(s => s.id === playerId) + 2) % SPECIES.length;
  const cand = pool.find(s => s.id === SPECIES[idx].id) || pool[0];
  return cand.id;
}

// 伤害类型对护甲的倍率
export function dmgMult(dtype, armor) {
  const row = ARMOR_MULT[dtype];
  return row ? (row[armor] != null ? row[armor] : 1) : 1;
}

/* ----------------------------- 敌方性格（种族风格） ----------------------------- */
// 三种 AI 性格：决定出兵节奏、进攻频率、塔阵偏置、能力使用率。
export const ENEMY_ARCHETYPES = {
  aggressive: {
    id: 'aggressive', name: '掠食型', color: 0xff6a4a,
    desc: '疯狂爆兵与突袭，兵贵神速但经济脆弱。',
    attackInterval: [22, 34], soldierReq: [4, 14], buildSpeed: 0.8,
    abilityUse: 0.95, expandBias: 0.6, towerBias: 0.5,
  },
  expansionist: {
    id: 'expansionist', name: '拓殖型', color: 0x6ad0a0,
    desc: '稳健扩张多巢，经济厚实，后期碾压。',
    attackInterval: [40, 72], soldierReq: [8, 18], buildSpeed: 1.15,
    abilityUse: 0.55, expandBias: 1.5, towerBias: 0.9,
  },
  defensive: {
    id: 'defensive', name: '守城型', color: 0xc0a060,
    desc: '重防御与塔阵，先自保再伺机反击。',
    attackInterval: [62, 104], soldierReq: [10, 20], buildSpeed: 1.0,
    abilityUse: 0.45, expandBias: 1.0, towerBias: 1.7,
  },
  /* —— 追加三种战术原型（只增不改：上面三档数值逐字保持原样）——
   * techPath 决定 AI 的建造顺序与科技节奏；未声明该字段的原三档走既有固定计划，零影响。
   * rusher  速攻：兵营前置、跳过史官堂 rush，早早压上但科技落后。
   * turtle  龟缩：塔阵前置、延迟研究，靠工事消耗对手。
   * balanced 均衡：史官堂前置抢纪元，兵力与经济同步。
   */
  rusher: {
    id: 'rusher', name: '速攻型', color: 0xff8a3a,
    desc: '兵营前置、连续 early rush，科技落后但开局压迫极强。',
    attackInterval: [16, 26], soldierReq: [3, 12], buildSpeed: 0.72,
    abilityUse: 0.9, expandBias: 0.5, towerBias: 0.3, techPath: 'rush', targetPolicy: 'hq',
  },
  turtle: {
    id: 'turtle', name: '龟缩型', color: 0x8a9ab0,
    desc: '塔阵与工事先行，极晚进攻，靠纵深防线拖垮对手。',
    attackInterval: [78, 120], soldierReq: [12, 22], buildSpeed: 1.05,
    abilityUse: 0.5, expandBias: 1.2, towerBias: 2.4, techPath: 'turtle', targetPolicy: 'counters',
  },
  balanced: {
    id: 'balanced', name: '均衡型', color: 0xa88ad0,
    desc: '史官堂前置抢纪元，兵力与经济同步推进，无明显短板。',
    attackInterval: [34, 56], soldierReq: [7, 16], buildSpeed: 0.95,
    abilityUse: 0.75, expandBias: 1.1, towerBias: 1.0, techPath: 'tech', targetPolicy: 'balanced',
  },
};
// 战役章节仍使用原三档性格，新增原型只在遭遇战显式指定时出现，不改变既有进度曲线
export const ARCHETYPE_ORDER = ['aggressive', 'expansionist', 'defensive'];
export const EXTRA_ARCHETYPES = ['rusher', 'turtle', 'balanced'];

/* ----------------------------- 难度 ----------------------------- */
// targeting / defense / abilitySmart：AI「智能程度」分级（0=不启用，1=全量）。
// waveReinforce：首波之后是否持续组织进攻波次（0=只发首波；0<x<1=轻量持续波次，按战损动态补波但节奏更缓；
//   1=满强度持续波次）。sim 内以线性因子消费该值（组波间隔 ×(1+0.6×wr)、起征兵力 +2×wr、预备队 0.2×wr）。
// aiDefensive：敌方防御/增益智能（0=关闭，1=开启）；开启后 hard 会在军团受损时施放甲壳硬化、平时机会性补纪元共鸣。
// repair：敌方后勤维修灵敏度（0=不维修，1=完整）。二者只影响 AI 决策，与 ecoMul / armyMul 正交。
// easy/normal 保持 waveReinforce=0/0.5、aiDefensive=0，故默认难度零进攻波次突变、无防御智能；强度变化只落 hard。
// 属于难度重平衡而非细节开发；需要提升压迫感时只改这里的数值即可，无需动 sim.js。
export const DIFFICULTY = {
  easy:   { id: 'easy',   name: '蛰伏', desc: '敌方更慢、更弱，适合熟悉操作。', ecoMul: 0.78, armyMul: 0.80, thinkMul: 1.45,
            targeting: 0,    defense: 0.25, abilitySmart: 0, waveReinforce: 0, repair: 0, aiAbilities: [], aiDefensive: 0 },
  normal: { id: 'normal', name: '共时', desc: '标准对抗节奏，含少量持续波次。', ecoMul: 1.0,  armyMul: 1.0,  thinkMul: 1.0,
            targeting: 0.55, defense: 0.60, abilitySmart: 1, waveReinforce: 0.5, repair: 0.5, aiAbilities: [], aiDefensive: 0 },
  hard:   { id: 'hard',   name: '回响', desc: '敌方更快、更凶，需精密运营。', ecoMul: 1.28, armyMul: 1.32, thinkMul: 0.68,
            targeting: 1,    defense: 1.00, abilitySmart: 1, waveReinforce: 1, repair: 1, aiAbilities: ['a_whirl', 'a_dive'], aiDefensive: 1 },
};
export const DIFFICULTY_ORDER = ['easy', 'normal', 'hard'];

/* ----------------------------- 战役章节（六纪元） ----------------------------- */
// 每章 = 一场战役；玩家从「泥土纪」推进到「共振纪」，敌方性格与起始纪元逐章升级。
// echo = 巨人回响事件（在 at 秒触发），type 决定效果。
const CAMPAIGN_OBJECTIVES = [
  '在掠食型敌群的突袭下存活，并摧毁其蚁后巢。',
  '顶住拓殖型敌群的经济碾压，攻破它们的蚁后巢。',
  '突破守城型塔阵，在巨人回响中夺取胜利。',
  '以交融纪的科技优势，碾碎混合兵种的敌方核心。',
  '在大分流的浪潮里，于风暴回响中守住并反击。',
  '于共振纪终结对决，让史卷第一次由你的意志书写。',
];
const CAMPAIGN_INTROS = [
  '泥土纪：穴居的先祖以信息素第一次记下「我们」。掠食者已在洞口徘徊。',
  '轴心纪：符号与分工初成，拓殖者把巢穴摊成一片，资源是他们的话语。',
  '帝国纪：城墙与塔楼升起，守城者以静制动，等待你的破绽。',
  '交融纪：道路把族群连成网，混合兵种从四方涌来。',
  '大分流纪：浪潮改道，风暴是巨人对顽抗者的低语。',
  '共振纪：所有回响在此刻叠合——胜者书写纪元，败者沉入土层。',
];
const CAMPAIGN_ECHO = [
  { at: 70,  type: 'boon',  text: '巨人回响·丰饶：远古遗粮涌出，全图资源点储量回升。' },
  { at: 80,  type: 'boon',  text: '巨人回响·丰饶：被遗忘的菌圃苏醒，资源再次充盈。' },
  { at: 90,  type: 'surge', text: '巨人回响·涌动：史官堂共鸣，你获得一笔信息素馈赠。' },
  { at: 85,  type: 'storm', text: '巨人回响·风暴：地脉震荡，随机落点降下酸雨（双方均伤）。' },
  { at: 95,  type: 'storm', text: '巨人回响·大分流：潮汐倒卷，风暴席卷战场（双方均伤）。' },
  { at: 75,  type: 'boon',  text: '巨人回响·共振：终焉之馈，资源与信息素同时涌流。' },
];

export const CAMPAIGN = ERAS.map((e, i) => ({
  no: i,
  era: i,
  name: e.name,
  time: e.years,
  objective: CAMPAIGN_OBJECTIVES[i],
  intro: CAMPAIGN_INTROS[i],
  archetype: ARCHETYPE_ORDER[i % ARCHETYPE_ORDER.length],
  enemyEra: Math.min(MAX_ERA, i),            // 敌方起始纪元（越后越难）
  echo: CAMPAIGN_ECHO[i],
}));

export const ECHO_TYPES = {
  boon:  { name: '丰饶', desc: '资源点储量回升' },
  storm: { name: '风暴', desc: '随机落点酸雨，双方均伤' },
  surge: { name: '涌动', desc: '玩家获得信息素馈赠' },
};

// 战役进度（localStorage key）
export const CAMPAIGN_SAVE_KEY = 'ant_epoch_campaign_v1';

/* ----------------------------- 六章差异化战场地图 ----------------------------- */
// 规则数值在 maps.js（逻辑层），美术主题在 map-art.js（表现层）；此处转出保持既有 import 路径。
export { MAP_THEMES, SKIRMISH_MAP, getMapConfig } from './maps.js';

/* ----------------------------- 派生 helper ----------------------------- */
// 应用难度到 AI：返回计时倍率与能力/塔偏置。
export function applyDifficulty(diffId) {
  return DIFFICULTY[diffId] || DIFFICULTY.normal;
}
export function applyArchetype(archId) {
  return ENEMY_ARCHETYPES[archId] || ENEMY_ARCHETYPES.aggressive;
}
