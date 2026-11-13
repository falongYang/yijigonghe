/* RTS 模拟层 v2 —— 武器 / 能力 / 成长 / 资源 / 四域环境
 * 单位·建筑·资源节点·采集卸货·建造出兵·纪元研究·四域作战·能力施放·
 * 经验升级与进化·敌方 AI·资源掠夺·胜负判定。纯逻辑 + 事件，渲染由 world.js 镜像。
 */
import { SPECIES_BY_ID } from './data.js';
import {
  MAP, HALF_W, HALF_H, SIDES, START_BIO, START_MIN, START_PH, POP_CAP,
  RESOURCES, RES_ORDER, DOMAINS, DOMAIN_ORDER, WEAPONS, DMG_TYPES, ARMOR_TYPES,
  ARMOR_MULT, ABILITIES, BUILDINGS, BUILD_ORDER, UNITS, UNIT_ORDER,
  XP_PER_LEVEL, MAX_LEVEL, LEVEL_HP, LEVEL_DMG, ELITE_HP, ELITE_DMG,
  SPECIALTY, specialtyOf, rtsMods, effectiveUnit, effectiveCost,
  effectiveBuilding, effectiveBuildingCost, researchCost, ERA_NAMES, MAX_ERA, canEngage, pickEnemySpecies, dmgMult,
  ENEMY_ARCHETYPES, DIFFICULTY, CAMPAIGN, applyArchetype, applyDifficulty,
  getMapConfig, SKIRMISH_MAP, ARCHETYPE_UNITS, UNIT_ANIM,
  terrainHeight, TERRAIN, mapZones, mapWells, mapObstacles, zoneAt, WELL,
} from './rts.js';
import { MAP_CLIMATES, getMapClimate, getMapWeather, staticHazardsFor,
  weatherTimelineFor, mapDynamicsFor } from './maps.js';

const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* 战斗细节常量（全部加性，未声明 trait 的单位不参与） */
const CORRODE_SHRED = 0.40;      // 腐蚀：削减 40% 护甲抗性
const POISON_STACK_DPS = 0.25;   // 中毒每层 dps = 基础伤害 × trait × 该系数
const POISON_MAX_STACKS = 3;
const POISON_T = 3;              // 中毒持续秒数
const HOLD_LEASH = 18;           // 驻守：只打该半径内目标，不追击
const TERRAIN_TICK = 0.25;       // 静态危害结算步长
// 天气对远程的影响只作用于「真实单位远程普攻」，能力/危害/溅射不受影响。

const HARVEST_RANGE = 3.6;
const REPAIR_RATE = 11;          // 每只工蚁每秒修复的耐久
const REPAIR_MIN_PER_HP = 0.25;  // 每点耐久消耗的矿物
const REPAIR_RANGE = 3.2;
const DEPOSIT_RANGE = 8.5;
const GATHER_RATE = 10;       // 每秒采集量（再生资源场，故适度下调以保证可再生）
const AGGRO = 22;             // 自动索敌半径
// 溅射系数经固定随机流压测定稿（/tmp/antworld/robust.mjs，3 种子 × 2 密度）：
// max≥2 且 ratio≥0.08 时，密集靶场会在半数场景把胜负整个翻转（AI 战术索敌被范围伤害放大）；
// 0.10 / 最多 1 个额外目标 → 6/6 保持基线胜负、总伤害 98.3%、溅射仍可观测。
const SPLASH_RATIO = 0.10;         // 溅射伤害占主目标伤害的比例（仅 w_glider 等配了 splash 的武器）
const SPLASH_MAX_TARGETS = 1;      // 每次攻击最多波及的额外目标数：密集簇不把总输出翻倍
const PLAYER_BASE = { x: 0, z: HALF_H * 0.62 };
const ENEMY_BASE = { x: 0, z: -HALF_H * 0.62 };
const BURROW_IDLE_SPEED = 1.45;          // 潜行提速
// 敌方 AI 能力分类：进攻类打敌方密集簇，增益类打己方密集簇（全局 buff 落点不敏感）
const AI_OFFENSIVE_ABILITIES = new Set(['a_acidpool', 'a_whirl', 'a_venom', 'a_dive', 'a_bomb', 'a_burrow']);

export class Simulation {
  constructor() {
    this.listeners = [];
    this.selected = new Set();
    this.selectedBuilding = null;
    this.effects = [];
    this.nextId = 1;
    this.ended = null;
    this.time = 0;
    this._ai = {};
    this.cd = { P: {}, E: {} };
    this.aura = { P: { dmg: 1, t: 0 }, E: { dmg: 1, t: 0 } };
    this.hazards = [];
    this.zones = [];       // 战术地形区（高台 / 泥沼 / 浅滩）
    this.wells = [];       // 中立信息素井（可争夺）
    this.units = []; this.buildings = []; this.nodes = [];
    this.res = { P: { bio: 0, min: 0, ph: 0 }, E: { bio: 0, min: 0, ph: 0 } };
    this.era = { P: 0, E: 0 }; this.sp = null;
    this.peakPop = { P: 0, E: 0 };
    this.stats = null;   // 战局统计（reset 时初始化）
    this.mode = 'skirmish'; this.chapter = null; this.archetype = null; this.difficulty = null;
    this.echo = null; this.echoFired = false;
    this.climate = MAP_CLIMATES[0];   // 六章环境规则（reset 时按章节重取）
    this.weather = null;              // 逐章天气（reset 时按章节重取）
    this.terrainHazards = [];         // 静态危害地块（熔岩 / 酸池），reset 时按章节生成
    this.objective = null;            // 场景目标（reset 时按 opts 装配）
    this.tradeDone = 0;               // 资源贸易累计次数
    this.refined = { P: false, E: false };  // 精炼巢室：全军强化标记
    this._fxRng = 1;                  // 战斗细节专用确定性随机流（不占用 AI 的 Math.random 序列）
    this._lastRaidLogAt = -99;        // 掠夺播报节流
    this.weatherTimeline = [];        // 动态战场：天气阶段（遭遇战恒空）
    this.weatherIdx = 0;
    this.dynamics = null;             // 动态战场：地脉共振配置（遭遇战恒 null）
    this.resonance = null;            // 当前被唤醒的高台 { x,z,r,bonus }
    this.resonancePhase = -1;
    this.ridgeZones = [];
    this.milestones = {};             // 战场里程碑播报去重
  }

  on(fn) { this.listeners.push(fn); }
  _emit(type, payload = {}) { for (const fn of this.listeners) fn(type, payload); }
  _log(text, kind = 'info') { this._emit('log', { text, kind }); }
  _toast(text) { this._emit('toast', { text }); }
  _fx(type, x, y, z, opts = {}) { this.effects.push({ type, pos: { x, y, z }, opts }); }
  /** 当前环境规则；未 reset 的裸实例退化为基准环境，保证所有系数始终是有限数。 */
  _clim() { return this.climate || MAP_CLIMATES[0]; }
  /** 当前天气；裸实例退化为全 1.0 的晴空。 */
  _wea() { return this.weather || { id: 'clear', name: '晴空', desc: '', visionMul: 1, hitMul: 1 }; }
  /** 战斗细节专用 RNG：xorshift32，独立于全局 Math.random，保证 AI 的随机序列不被战斗掷骰污染。 */
  _crand() {
    let x = this._fxRng | 0;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this._fxRng = x | 0;
    return ((x >>> 0) % 100000) / 100000;
  }

  reset(playerId, opts = {}) {
    const { mode = 'skirmish', chapter = null, archetype = null, difficulty = 'normal' } = opts;
    const enemyId = pickEnemySpecies(playerId);
    this.mode = mode;
    this.chapter = chapter;
    this.difficulty = applyDifficulty(difficulty);
    if (mode === 'campaign' && chapter != null) {
      const ch = CAMPAIGN[chapter];
      this.archetype = applyArchetype(ch.archetype);
      this.echo = ch.echo || null;
    } else {
      this.archetype = applyArchetype(archetype || 'aggressive');
      this.echo = null;
    }
    this.echoFired = false;
    this.sp = { P: SPECIES_BY_ID[playerId], E: SPECIES_BY_ID[enemyId] };
    this.res = {
      P: { bio: START_BIO, min: START_MIN, ph: START_PH },
      E: { bio: START_BIO, min: START_MIN, ph: START_PH },
    };
    const startEra = (mode === 'campaign' && chapter != null) ? CAMPAIGN[chapter].enemyEra : 0;
    this.era = { P: 0, E: startEra };
    this.units = [];
    this.buildings = [];
    this.nodes = [];
    this.selected.clear();
    this.selectedBuilding = null;
    this.effects.length = 0;
    this.hazards.length = 0;
    this.cd = { P: {}, E: {} };
    this.aura = { P: { dmg: 1, t: 0 }, E: { dmg: 1, t: 0 } };
    this.nextId = 1;
    this.ended = null;
    this.time = 0;
    this.peakPop = { P: 0, E: 0 };
    const blank = () => ({ kills: 0, losses: 0, built: 0, harvested: 0, abilities: 0, evolved: 0, raided: 0, repaired: 0, wellPh: 0,
      dmgDealt: 0, dmgTaken: 0, critHits: 0, smartCasts: 0, defenses: 0, nodeSwitches: 0,
      overkillSaved: 0, raids: 0, waves: 0, repairs: 0,
      splashHits: 0, levelUps: 0, alarms: 0,
      // 战斗细节统计（只增字段契约，B 侧用 st.xxx || 0 容错读取）
      critRolls: 0, pierceHits: 0, flankHits: 0, lifestealHp: 0,
      poisonTicks: 0, corrodeHits: 0, slowHits: 0, stunTicks: 0,
      terrainTicks: 0, statusKills: 0,
      // 动态战场统计（只增字段契约，B 侧用 st.xxx || 0 容错读取）
      resonanceHits: 0, weatherShifts: 0, milestones: 0 });
    this.stats = { P: blank(), E: blank() };
    this._lastRaidLogAt = -99;
    this._levelFlags = {};   // 等级里程碑播报去重（每局重置）
    this._fxRng = 1;         // 战斗掷骰确定性复位
    this.tradeDone = 0;
    this.refined = { P: false, E: false };
    this.map = getMapConfig(mode, chapter);
    this.climate = getMapClimate(mode, chapter);
    this.weather = getMapWeather(mode, chapter);
    this.weatherTimeline = weatherTimelineFor(mode, chapter);
    this.weatherIdx = 0;
    this.dynamics = mapDynamicsFor(mode, chapter);
    this.resonance = null;
    this.resonancePhase = -1;
    this.milestones = {};
    this.terrainHazards = staticHazardsFor(mode, chapter).map(h => ({ ...h, accum: 0 }));
    // 场景目标：默认 'destroy'（摧毁敌方蚁后巢）＝既有胜负判定，逐字不变。
    // 可选 'survive'（存活到时限）、'harvest'（累计采集达标）、'dominate'（占领全部信息素井并守住）。
    this.objective = {
      type: opts.objective || 'destroy',
      surviveT: opts.surviveT || 240,
      harvestGoal: opts.harvestGoal || 4000,
      dominateHold: opts.dominateHold || 20,
      holdT: 0, label: '',
    };
    const OBJ_LABEL = {
      destroy: '摧毁敌方蚁后巢',
      survive: `存活 ${this.objective.surviveT} 秒`,
      harvest: `累计采集 ${this.objective.harvestGoal} 生物质`,
      dominate: `占领全部信息素井并守住 ${this.objective.dominateHold} 秒`,
    };
    this.objective.label = OBJ_LABEL[this.objective.type] || OBJ_LABEL.destroy;
    // 战术地形与信息素井用同一套确定性配置生成：模拟、3D 渲染与小地图读取的都是这一份。
    this.zones = mapZones(this.map);
    this.ridgeZones = this.zones.filter(q => q.type === 'ridge');
    for (const q of this.zones) q.resonant = false;   // 只读附加标记：地脉共振（B 侧可选渲染）
    this.wells = mapWells(this.map).map(w => ({ ...w, owner: null, progress: 0, contest: false, pulse: 0 }));
    // 战术掩体（中立、可破坏）：与地形/井同属一份确定性配置，模拟与渲染读取同一份。
    this.obstacles = mapObstacles(this.map).map(o => ({ ...o, hp: o.hp, maxHp: o.hp, alive: true, flash: 0, lastAttacker: undefined }));
    this._initNodes();
    this._initBase(SIDES.PLAYER);
    this._initBase(SIDES.ENEMY);
    this._initAI();
    const diffName = this.difficulty.name;
    const archName = this.archetype.name;
    const modeName = this.mode === 'campaign' ? `战役·第${this.chapter + 1}章「${CAMPAIGN[this.chapter].name}」` : '遭遇战';
    this._log(`【${modeName}】「${this.sp.P.name}」(专长·${DOMAINS[specialtyOf(playerId)].key}) 对阵「${this.sp.E.name}」(${archName}/${diffName}) · 四域战争：采集 → 建造 → 出兵 → 研究纪元 → 能力 → 进化 → 掠夺。`, 'key');
    this._log(`【战场环境·${this.climate.name}】${this.climate.desc}`, 'info');
    if (this.weather && this.weather.id !== 'clear') this._log(`【天气·${this.weather.name}】${this.weather.desc}`, 'info');
    if (this.terrainHazards.length) this._log(`【地形警示】本图存在 ${this.terrainHazards.length} 处熔岩/酸池，驻留其中会持续受损。`, 'bad');
    if (this.weatherTimeline.length) this._log(`【气象预报】本图天气将随时间转变 ${this.weatherTimeline.length} 次，视野与远程命中会随之波动。`, 'info');
    if (this.dynamics && this.dynamics.resonance) this._log('【地脉共振】战场高台会被周期性唤醒，抢占者获得攻击加成。', 'info');
    this._log(`【作战目标】${this.objective.label}。`, 'key');
    this._emit('reset', { mode: this.mode, chapter: this.chapter, archetype: this.archetype.id, difficulty: this.difficulty.id });
    this._updateVision();
  }

  // ----------------------------------------------------------- 地图资源（四域）
  _initNodes() {
    const cfg = this.map || SKIRMISH_MAP;
    for (const n of cfg.nodes) {
      // 资源点为可再生场：regen 使被采空的点在约 16s 内回满，避免双方经济在开局一分钟内枯竭。
      this.nodes.push({ id: this.nextId++, x: n.x, z: n.z, amount: n.amt, max: n.amt, domain: n.domain, res: n.res,
        regen: n.amt * 0.06 * this._clim().regenMul,
        owner: null, glow: 0 });   // owner/glow：最近采集方与采集热度（供地图/小地图呈现）
    }
  }

  // 资源点再生：被采空的点缓慢回满，维持长线经济（双方工蚁都有活干）。
  _tickNodes(dt) {
    for (const n of this.nodes) {
      if (n.amount < n.max) n.amount = Math.min(n.max, n.amount + n.regen * dt);
      if (n.glow > 0) n.glow = Math.max(0, n.glow - dt * 0.22);
      if (n.glow <= 0) n.owner = null;
    }
  }

  // ------------------------------------------------------- 战术地形 / 信息素井
  /** 某点地形区：委托给共用纯函数，保证逻辑判定与 3D / 小地图看到的一致。 */
  zoneAt(x, z) { return zoneAt(this.zones, x, z); }
  /** 地形移速系数：空域 / 地下免疫泥沼，水域 / 空域 / 地下免疫浅滩（水栖兵种在水中略提速）。 */
  _terrainSpeedMul(u) {
    const q = this.zoneAt(u.x, u.z);
    const clim = this._clim();
    // 记录单位脚下地貌，供 3D 状态环 / 属性卡读取（渲染与逻辑共用同一判定）
    u.terrain = q ? q.type : 'plain';
    let mul = 1;
    if (q) {
      if (q.type === 'mire') mul = (u.domain === 'air' || u.domain === 'underground') ? 1 : TERRAIN.mire.speed;
      else if (q.type === 'water') {
        if (u.domain === 'sea') mul = 1.10;
        else if (u.domain === 'air' || u.domain === 'underground') mul = 1;
        else mul = Math.max(0.45, TERRAIN.water.speed - clim.waterSlow);
      } else mul = TERRAIN[q.type] ? TERRAIN[q.type].speed : 1;
    }
    // 章节环境只做域机动修正，不改变地貌判定 / 视觉表现
    if (u.domain === 'sea') mul *= clim.seaSpeedMul;
    else if (u.domain === 'air') mul *= clim.airSpeedMul;
    return mul;
  }
  /** 站在高台上的远程单位射程 +18%（近战不享受）；高地 / 共振章另有额外加成。 */
  _terrainRangeMul(u) {
    if (u.melee) return 1;
    const q = this.zoneAt(u.x, u.z);
    return q && q.type === 'ridge' ? TERRAIN.ridge.range + this._clim().ridgeBonus : 1;
  }

  /** 侦测视野（轻量战争迷雾）：敌方单位 / 建筑仅在己方视野半径内可见，
   *  超视距则隐藏（不影响逻辑，只影响渲染与小地图）。敌方蚁后巢始终可见，作为胜利目标。 */
  _updateVision() {
    // 不因「玩家单位暂时全灭」提前返回：巢室本身仍是视野源，否则敌方单位会停留在上一帧的
    // 可见状态（旧数据造成隔墙透视）。sources 为空时 seen() 恒 false，语义本来就是「没有视野」。
    const sources = [];
    const vm = this._wea().visionMul;   // 天气视野修正（遭遇战晴空 = 1.0，零影响）
    for (const u of this.units) {
      if (u.side !== SIDES.PLAYER) continue;
      if (u.domain === 'underground' && u.burrowed) continue;   // 潜行单位不提供视野
      sources.push({ x: u.x, z: u.z, r: (u.domain === 'air' ? 42 : 30) * vm });
    }
    for (const b of this.buildings) {
      if (b.side !== SIDES.PLAYER) continue;
      sources.push({ x: b.x, z: b.z, r: (b.type === 'hq' ? 50 : 44) * vm });
    }
    const seen = (x, z) => {
      for (const s of sources) {
        const dx = x - s.x, dz = z - s.z;
        if (dx * dx + dz * dz <= s.r * s.r) return true;
      }
      return false;
    };
    for (const u of this.units) {
      if (u.side === SIDES.PLAYER) { u.visible = true; continue; }
      u.visible = seen(u.x, u.z);
    }
    for (const b of this.buildings) {
      if (b.side === SIDES.PLAYER || b.type === 'hq') { b.visible = true; continue; }
      b.visible = seen(b.x, b.z);
    }
  }

  /** 中立信息素井：范围内兵力多的一方推进占领进度，占满后持续产出信息素。 */
  _tickWells(dt) {
    for (const w of this.wells) {
      let p = 0, e = 0;
      for (const u of this.units) {
        // 同帧阵亡但尚未被 _reap 清理的尸体不再计入占领（与索敌 / 酸雨口径一致）
        if (u.hp <= 0) continue;
        if (dist(u.x, u.z, w.x, w.z) <= w.r) { if (u.side === SIDES.PLAYER) p++; else e++; }
      }
      w.contest = p > 0 && e > 0;
      const net = p - e;
      if (net !== 0) {
        const speed = WELL.capture * (1 + Math.min(Math.abs(net) - 1, 3) * 0.35);
        w.progress = clamp(w.progress + Math.sign(net) * speed * dt, -1, 1);
      }
      const next = w.progress >= 1 ? SIDES.PLAYER : w.progress <= -1 ? SIDES.ENEMY : w.owner;
      if (next !== w.owner) {
        w.owner = next; w.pulse = 1;
        this._log(next ? `${this._sn(next)}占领「${w.name}」，持续获得信息素。` : `「${w.name}」恢复中立。`, next === SIDES.PLAYER ? 'good' : 'info');
        this._fx('ring', w.x, 0.5, w.z, { color: next === SIDES.PLAYER ? 0x7ef0a0 : 0xffb070, r: w.r });
        this._emit('well', { owner: next, x: w.x, z: w.z, name: w.name });
      }
      if (w.owner) {
        const gain = WELL.rate * this._clim().wellMul * dt;
        this.gainRes(w.owner, 'ph', gain);
        if (this.stats && this.stats[w.owner]) this.stats[w.owner].wellPh += gain;
      }
      if (w.pulse > 0) w.pulse = Math.max(0, w.pulse - dt * 0.6);
    }
  }

  _initBase(side) {
    const b = side === SIDES.PLAYER ? PLAYER_BASE : ENEMY_BASE;
    this._makeBuilding(side, 'hq', b.x, b.z, true);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      this._makeUnit(side, 'worker', b.x + Math.cos(a) * 9, b.z + Math.sin(a) * 9);
    }
  }

  _initAI() {
    const spec = specialtyOf(this.sp.E.id);
    const nestByDomain = { sea: 'seanest', air: 'airnest', underground: 'ugnest' };
    const arch = this.archetype;
    const diff = this.difficulty;
    // 性格决定塔阵偏置：守城型多造塔
    const towers = arch.towerBias >= 1.5 ? 3 : (arch.towerBias >= 0.9 ? 2 : 1);
    let plan = ['nursery', 'barracks', 'tech', nestByDomain[spec] || 'tower'];
    for (let i = 0; i < towers; i++) plan.push('tower');
    // 科技路径：只有新增原型声明了 techPath 才重排建造计划；原三档不声明 → 计划逐字不变。
    // 研究节奏用独立字段控制，不动 thinkMul（那会牵动全局节奏与回归基线）。
    let techDelay = 1;
    if (arch.techPath === 'rush') {
      plan = ['barracks', 'nursery', nestByDomain[spec] || 'tower', 'tech', 'tower'];
      techDelay = 1.6;
    } else if (arch.techPath === 'turtle') {
      plan = ['nursery', 'tower', 'tower', 'barracks', 'tech', 'tower', nestByDomain[spec] || 'tower'];
      techDelay = 1.35;
    } else if (arch.techPath === 'tech') {
      plan = ['nursery', 'tech', 'barracks', nestByDomain[spec] || 'tower', 'tower'];
      techDelay = 0.7;
    }
    const aint = arch.attackInterval;
    this._ai = {
      spec,
      nest: nestByDomain[spec] || 'barracks',
      arch, diff,
      buildPlan: plan,
      buildIdx: 0, buildTimer: 5 * diff.thinkMul * arch.buildSpeed,
      techDelay,   // 科技路径的研究节奏倍率（原三档 = 1，零影响）
      prodTimer: 2, researchTimer: 18 * diff.thinkMul * techDelay, abilityTimer: 16 * diff.thinkMul,
      attackTimer: aint[0] * diff.thinkMul + 10,   // +10s 首波宽限，避免开局即被压
      attackInterval: aint, soldierReq: arch.soldierReq[0], soldierReqMax: arch.soldierReq[1],
      abilityUse: arch.abilityUse, expandBias: arch.expandBias,
      abilityPhase: 0,  // 难度专属能力的轮换相位（避免固定候选顺序饿死），不消费 RNG
      sigCount: 0, defTimer: 0, defAbilityTimer: 0, defending: false,
      waveReinforce: diff.waveReinforce || 0,   // 波次节奏（默认档只发首波）
      repair: diff.repair || 0, repairTimer: 0,               // 敌方后勤维修（默认档关闭/半开）
    };
  }

  // -------------------------------------------------------------- 工厂
  _makeUnit(side, type, x, z, opts = {}) {
    const sp = this.sp[side];
    const e = effectiveUnit(type, sp, this.era[side], { level: opts.level || 1, elite: !!opts.elite });
    const base = UNITS[type];
    // 敌方单位携带性格专属色（用于渲染自发光）与 sig 标记（专属兵种造型）
    const accent = side === SIDES.ENEMY ? this.archetype.color : 0x000000;
    const sig = (side === SIDES.ENEMY && base.sig && base.archetypeOnly === this.archetype.id) ? base.sig : null;
    const u = {
      id: this.nextId++, side, type, caste: e.caste, domain: e.domain, armor: e.armor, ability: e.ability,
      x, z, hp: e.hp, maxHp: e.hp, dmg: e.dmg, range: e.range, atkcd: e.atkcd, melee: e.melee,
      dtype: e.dtype, splash: e.splash, speed: e.speed,
      // 战斗细节 traits（来自 effectiveUnit；未声明则为 0，行为等价）
      critChance: e.critChance, critMul: e.critMul, pierce: e.pierce, flankBonus: e.flankBonus,
      lifesteal: e.lifesteal, poisonOnHit: e.poisonOnHit, slowOnHit: e.slowOnHit,
      // 状态效果：中毒（可叠层）/ 腐蚀破甲 / 减速 / 眩晕
      poison: { stacks: 0, t: 0, dps: 0, src: null },
      corrodeT: 0, slowT: 0, stunT: 0,
      carryCap: e.carry, carryRes: 'bio', carrying: 0,
      level: opts.level || 1, elite: !!opts.elite, xp: 0, accent, sig,
      state: 'idle', target: null, waypoints: [], nodeId: null, homeId: null,
      heading: Math.random() * 6.28, moving: false, atkTimer: 0,
      order: 'auto', lastAttacker: null, burrowed: false, phase: Math.random() * 6.28, defendUntil: 0,
      // 行动细节：阵型 / 巡逻路径 / 驻守锚点
      formation: 'auto', patrol: null, patrolIdx: 0, holdX: null, holdZ: null,
      buff: { dmg: 1, tank: 1, spd: 1, t: 0 },
      // 动作表现状态（只读数据层，不参与任何战斗结算）：state/t/seq/prev + 两次瞬时事件窗口
      anim: { state: 'idle', t: 0, seq: 0, prev: null }, animStrike: 0, animHurt: 0,
    };
    this.units.push(u);
    if (base.role === 'econ') this._assignHarvest(u);
    return u;
  }

  /** 单位升级/进化/纪元跃迁后同步战斗 traits（保证暴击/破甲/吸血随形态更新）。 */
  _syncTraits(u) {
    const e = effectiveUnit(u.type, this.sp[u.side], this.era[u.side], { level: u.level, elite: u.elite });
    u.critChance = e.critChance; u.critMul = e.critMul; u.pierce = e.pierce;
    u.flankBonus = e.flankBonus; u.lifesteal = e.lifesteal;
    u.poisonOnHit = e.poisonOnHit; u.slowOnHit = e.slowOnHit;
  }

  _makeBuilding(side, type, x, z, done = false) {
    const sp = this.sp[side];
    const e = effectiveBuilding(type, sp);
    const b = {
      id: this.nextId++, side, type, x, z,
      hp: done ? e.hp : 1, maxHp: e.hp, size: e.size,
      state: done ? 'idle' : 'constructing', buildProg: done ? 1 : 0,
      buildTime: BUILDINGS[type].build, queue: [], research: null,
      cooldown: 0, attack: e.attack || null, lastAttacker: null, phGen: e.phGen || 0,
      rally: null,   // 集结点（仅玩家侧生产建筑可设置，作战单位生产后前往）
      alarmStep: 0,  // 受袭分级告警已播报的最高档（0/1/2/3 → 75/50/25%）
    };
    this.buildings.push(b);
    if (!done && this.stats) this.stats[side].built++;   // 初始巢不计入建造数
    if (!done) this._log(`${side === SIDES.PLAYER ? '我方' : '敌方'}开始建造「${BUILDINGS[type].name}」。`, side === SIDES.PLAYER ? 'good' : 'info');
    return b;
  }

  // -------------------------------------------------------------- 查询
  getUnit(id) { return this.units.find(u => u.id === id); }
  getBuilding(id) { return this.buildings.find(b => b.id === id); }
  getObstacle(id) { return this.obstacles.find(o => o.id === id); }
  pop(side) { return this.units.filter(u => u.side === side).length; }
  res_(side, r) { return this.res[side][r] || 0; }
  depots(side) { return this.buildings.filter(b => b.side === side && BUILDINGS[b.type].depot && b.state === 'idle'); }
  isTargetable(u) { return !(u.domain === 'underground' && u.burrowed); }

  nearestNode(x, z, domain, minAmount = 1, opts = {}) {
    // 默认路径保持「最近距离」原语义；只有显式 balance 时启用负载均衡调度。
    if (opts.balance) return this._balancedNode(x, z, domain, minAmount, opts);
    let best = null, bd = Infinity;
    for (const n of this.nodes) {
      if (n.amount < minAmount) continue;
      if (domain && n.domain !== domain) continue;
      const d = dist(x, z, n.x, n.z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  /** 采集点调度：距离 + 拥挤度 + 剩余储量 + 敌我归属的综合评分，避免工蚁扎堆一个点。
   *  仅 A 侧内部使用，不改动 nearestNode 的默认返回语义。 */
  _balancedNode(x, z, domain, minAmount, opts) {
    const crowd = new Map();
    for (const w of this.units) {
      if (w === opts.exclude || w.side !== opts.forSide || w.nodeId == null) continue;
      const def = UNITS[w.type];
      if (!def || def.role !== 'econ') continue;
      crowd.set(w.nodeId, (crowd.get(w.nodeId) || 0) + 1);
    }
    let best = null, bestScore = Infinity;
    for (const n of this.nodes) {
      if (n.amount < minAmount) continue;
      if (domain && n.domain !== domain) continue;
      let score = dist(x, z, n.x, n.z);
      const c = crowd.get(n.id) || 0;
      // 每点容纳 3 只以内不分流；超员才逐步加成，避免工蚁为分散而跑太远
      // （系数经 A/B 扫描：过激会让 120s 采集总量掉 ~10%）
      if (c > 3) score += (c - 3) * 8;
      // 优先饱满点：刚再生出一点的点留给后来者，减少来回切换
      const fill = n.max ? clamp(n.amount / n.max, 0, 1) : 1;
      score += (1 - fill) * 3;
      // 敌方正在采的点略避开，减少抢点冲突
      if (n.owner && n.owner !== opts.forSide) score += 4;
      if (score < bestScore) { bestScore = score; best = n; }
    }
    return best;
  }
  nearestDepot(side, x, z) {
    const ds = this.depots(side);
    let best = null, bd = Infinity;
    for (const b of ds) { const d = dist(x, z, b.x, b.z); if (d < bd) { bd = d; best = b; } }
    return best;
  }

  _assignHarvest(u) { this._reassignNode(u); }

  /** 统一的采集点重选入口：创建、采空、卸货后都走负载均衡调度。
   *  玩家手动指定的采集点（order='manual'）优先保留；只有该点确实采空才重新调度并转回自动。 */
  _reassignNode(u) {
    const dom = UNITS[u.type].domain;
    if (u.order === 'manual' && u.nodeId != null) {
      const pinned = this.nodes.find(x => x.id === u.nodeId);
      if (pinned && pinned.amount >= 1) {
        u.state = 'harvest'; u.target = { x: pinned.x, z: pinned.z };
        return pinned;
      }
    }
    const n = this.nearestNode(u.x, u.z, dom, 1, { balance: true, forSide: u.side, exclude: u });
    if (!n) { u.state = 'idle'; u.nodeId = null; return null; }
    if (u.nodeId && u.nodeId !== n.id && this.stats) this.stats[u.side].nodeSwitches++;
    u.nodeId = n.id; u.state = 'harvest'; u.order = 'auto'; u.target = { x: n.x, z: n.z };
    return n;
  }

  // -------------------------------------------------------------- 资源辅助
  canAfford(side, cost) { for (const r in cost) if (this.res_(side, r) < cost[r]) return false; return true; }
  spend(side, cost) { for (const r in cost) this.res[side][r] -= cost[r]; }
  gainRes(side, r, amt) { this.res[side][r] = (this.res[side][r] || 0) + amt; }

  // -------------------------------------------------------------- 玩家指令
  /** 建造合法性校验（供放置预览与实际建造共用，保证两者判定完全一致）。 */
  checkBuild(type, x, z) {
    const b = BUILDINGS[type];
    if (!b) return { ok: false, reason: '未知巢室', cost: null };
    const cost = effectiveBuildingCost(type, this.sp.P, this.era.P);   // 专长域 / 纪元折扣
    if (!this.canAfford(SIDES.PLAYER, cost)) return { ok: false, reason: `资源不足：需 ${this._costStr(cost)}`, cost };
    if (dist(x, z, PLAYER_BASE.x, PLAYER_BASE.z) > 66) return { ok: false, reason: '超出己方巢区建造范围', cost };
    // 地形合法性：陡坡无法夯土；深水中央不能筑巢（巢区本身豁免，避免个别章节整片巢区被水覆盖）。
    if (Math.abs(terrainHeight(x, z)) > 4.2) return { ok: false, reason: '坡度过陡，无法夯土筑巢', cost };
    for (const w of ((this.map && this.map.water) || [])) {
      if (dist(x, z, w.x, w.z) < w.r * 0.55 && dist(x, z, PLAYER_BASE.x, PLAYER_BASE.z) > 18) {
        return { ok: false, reason: '深水之中无法筑巢', cost };
      }
    }
    for (const ex of this.buildings) {
      if (ex.side === SIDES.PLAYER && dist(x, z, ex.x, ex.z) < (ex.size + b.size) * 0.7) {
        return { ok: false, reason: '与现有巢室重叠', cost };
      }
    }
    const q = this.zoneAt(x, z);
    // 高台射程文案随章节环境实时计算，避免「高地章实际 +32%、提示仍写 +18%」
    const ridgePct = Math.round((TERRAIN.ridge.range + this._clim().ridgeBonus - 1) * 100);
    const tag = q && TERRAIN[q.type] ? ` · ${TERRAIN[q.type].name}${q.type === 'ridge' ? `（远程射程 +${ridgePct}%）` : ''}` : '';
    return { ok: true, reason: '可建造' + tag, cost };
  }
  startBuild(type, x, z) {
    const b = BUILDINGS[type];
    if (!b) return false;
    const chk = this.checkBuild(type, x, z);
    if (!chk.ok) { this._toast(chk.reason); return false; }
    this.spend(SIDES.PLAYER, chk.cost);
    const nb = this._makeBuilding(SIDES.PLAYER, type, x, z, false);
    this._emit('build', { id: nb.id });
    return true;
  }
  _costStr(cost) {
    return RES_ORDER.filter(r => cost[r]).map(r => `${cost[r]}${RESOURCES[r].short}`).join('·');
  }

  produce(buildingId, unitType) {
    const b = this.getBuilding(buildingId);
    if (!b || b.side !== SIDES.PLAYER || b.state !== 'idle') return false;
    const role = BUILDINGS[b.type].produces;
    if (!role || !role.includes(unitType)) return false;
    // 专长域巢室：本域兵种提前一纪元解锁（设计承诺「解锁早一纪元」）
    let need = UNITS[unitType].tech;
    const bdef = BUILDINGS[b.type];
    if (bdef.domain && bdef.domain === specialtyOf(this.sp.P.id)) need = Math.max(0, need - 1);
    if (this.era.P < need) { this._toast(`「${UNITS[unitType].name}」需纪元 ${need + 1}（研究史官堂解锁）`); return false; }
    if (this.pop(SIDES.PLAYER) >= POP_CAP) { this._toast('人口已达上限'); return false; }
    const cost = effectiveCost(unitType, this.sp.P);
    if (!this.canAfford(SIDES.PLAYER, cost)) { this._toast(`资源不足，需 ${this._costStr(cost)}`); return false; }
    this.spend(SIDES.PLAYER, cost);
    b.queue.push({ type: unitType, t: UNITS[unitType].build });
    this._emit('produce', { id: b.id });
    return true;
  }

  /** 取消生产队列中的一项：排队中的全额退还，正在生产的第一项按剩余进度退还。 */
  cancelProduce(buildingId, index) {
    const b = this.getBuilding(buildingId);
    if (!b || b.side !== SIDES.PLAYER) return false;
    const i = (index == null) ? b.queue.length - 1 : index;
    if (i < 0 || i >= b.queue.length) return false;
    const [item] = b.queue.splice(i, 1);
    const total = UNITS[item.type].build || 1;
    const k = (i === 0) ? clamp(item.t / total, 0, 1) : 1;
    const cost = effectiveCost(item.type, this.sp.P);
    for (const r in cost) this.gainRes(SIDES.PLAYER, r, Math.round(cost[r] * k));
    if (b.type === 'hq') b.autoT = -4;   // 给自动孵化工蚁一个短暂缓冲，避免取消后立刻补回
    this._toast(`已取消「${UNITS[item.type].name}」生产${k < 1 ? '（按剩余进度退还资源）' : '（资源已退还）'}`);
    this._emit('queue', { id: b.id });
    return true;
  }

  research(buildingId) {
    const b = this.getBuilding(buildingId);
    if (!b || b.side !== SIDES.PLAYER || b.state !== 'idle' || !BUILDINGS[b.type].research) return false;
    if (b.research) return false;
    if (this.era.P >= MAX_ERA) { this._toast('纪元已达上限'); return false; }
    const cost = researchCost(this.sp.P, this.era.P);
    if (this.res.P.bio < cost) { this._toast(`研究需 ${cost} 生物质`); return false; }
    this.res.P.bio -= cost;
    b.research = { t: 12, era: this.era.P + 1 };
    this._toast(`史官堂开始研究 → 纪元 ${this.era.P + 2}`);
    this._emit('research', { id: b.id });
    return true;
  }

  // 主动能力：side 施放 key，落点 (x,z)
  castAbility(side, key, x, z) {
    const a = ABILITIES[key];
    if (!a) return false;
    if ((this.cd[side][key] || 0) > 0) { if (side === SIDES.PLAYER) this._toast(`${a.name}冷却中`); return false; }
    if (this.res_(side, 'ph') < a.cost) { if (side === SIDES.PLAYER) this._toast(`信息素不足（需 ${a.cost}）`); return false; }
    this.res[side].ph -= a.cost;
    this.cd[side][key] = a.cd;
    if (this.stats) this.stats[side].abilities++;
    this._dispatchAbility(side, key, x, z);
    this._emit('ability', { side, key, x, z });
    return true;
  }
  _dispatchAbility(side, key, x, z) {
    const my = this.units.filter(u => u.side === side && u.type !== 'worker');
    switch (key) {
      case 'a_frenzy': this._buffUnits(this._near(side, x, z, my), 1.6, 1, 1.3, 6); this._log(`${this._sn(side)}狂暴！攻击+60% 移动+30%（6s）`, side === SIDES.PLAYER ? 'good' : 'info'); break;
      case 'a_harden': this._buffUnits(this._near(side, x, z, my), 1, 0.5, 1, 6); this._log(`${this._sn(side)}甲壳硬化！受伤−50%（6s）`, side === SIDES.PLAYER ? 'good' : 'info'); break;
      case 'a_rally': this._buffUnits(my, 1.2, 1, 1.08, 8); this._fx('ring', x, 0.5, z, { color: 0xffe27f, r: 30 }); this._log(`${this._sn(side)}信息素号令！全军伤害+20%（8s）`, side === SIDES.PLAYER ? 'good' : 'info'); break;
      case 'a_resonance': this.aura[side].dmg = 1.1; this.aura[side].t = 10; this._log(`${this._sn(side)}纪元共鸣！全军伤害+10%（10s）`, side === SIDES.PLAYER ? 'key' : 'info'); this._fx('resonance', x, 4, z, { color: 0xc7b3ff }); break;
      case 'a_acidpool': this._addHazard(x, z, 8, 16, side, 'acid', 0, 6, 'acidpool'); this._fx('acidpool', x, 0.4, z, { color: 0x9fe06a }); break;
      case 'a_whirl': this._addHazard(x, z, 10, 3, side, 'bite', 0.5, 4, 'whirl'); this._fx('whirl', x, 0.6, z, { color: 0x6fc8e0 }); break;
      case 'a_venom': this._addHazard(x, z, 7, 20, side, 'sting', 0, 3.5, 'venom'); this._fx('venom', x, 1, z, { color: 0xb6ff6f }); break;
      case 'a_dive': this._dmgRadius(x, z, 7, 42, side, 'bite', { stun: 0.5 }); this._fx('dive', x, 6, z, { color: 0xffd27f }); break;
      case 'a_bomb': this._dmgRadius(x, z, 9, 34, side, 'bomb', { stun: 0.7 }); this._fx('bomb', x, 5, z, { color: 0xff9a5a }); break;
      case 'a_burrow': this._delayedAmbush(side, x, z); break;
      default: break;
    }
  }
  _sn(side) { return side === SIDES.PLAYER ? '我方' : '敌方'; }
  _near(side, x, z, list, r = 34) { const f = list.filter(u => dist(u.x, u.z, x, z) <= r); return f.length ? f : list; }
  _buffUnits(list, dmg, tank, spd, t) {
    for (const u of list) {
      u.buff.dmg = Math.max(u.buff.dmg, dmg);
      u.buff.tank = Math.min(u.buff.tank, tank);
      u.buff.spd = Math.max(u.buff.spd, spd);
      u.buff.t = Math.max(u.buff.t, t);
      if (dmg > 1) this._fx('ring', u.x, 0.5, u.z, { color: 0xffd27f });
    }
  }
  _addHazard(x, z, r, dps, owner, dtype, slow, t, fx) { this.hazards.push({ x, z, r, dps, owner, dtype, slow, t, fx, accum: 0, delay: 0 }); }
  /** 钻地突袭：落点先埋伏 3 秒（无伤、不可被提前触发），破土瞬间对范围内敌人造成一次穿刺突袭伤害。
   *  兑现 ABILITIES.a_burrow 的 desc 承诺——原实现是立即 AoE，丢掉「3 秒后破土」的延迟手感与战术价值。
   *  该能力不在 AI 候选池（_tickAI 的 cand 列表），仅玩家手动施放，故改动零 AI 平衡影响。 */
  _delayedAmbush(side, x, z) {
    this.hazards.push({ x, z, r: 7, owner: side, dtype: 'pierce', slow: 0, dps: 0, t: 0, delay: 3, fx: 'ambush', dmg: 30, accum: 0 });
    this._fx('ring', x, 0.4, z, { color: 0x8a7f56, r: 7 });   // 落点微标记（埋伏圈）
  }
  _dmgRadius(x, z, r, dmg, owner, dtype, opts = {}) {
    for (const u of this.units) {
      if (u.side === owner || u.hp <= 0) continue;
      if (dist(u.x, u.z, x, z) <= r + (u.size || 0)) {
        this._dealDamage({ side: owner }, u, dmg, x, z, true, dtype);
        // 爆破/俯冲的冲击眩晕：仅对存活单位生效，短促且不改冷却与花费
        if (opts.stun > 0 && u.hp > 0 && u.stunT !== undefined) u.stunT = Math.max(u.stunT, opts.stun);
      }
    }
    for (const b of this.buildings) { if (b.side === owner || b.state === 'constructing') continue; if (dist(b.x, b.z, x, z) <= r + b.size * 0.5) this._dealDamage({ side: owner }, b, dmg, x, z, true, dtype); }
  }

  /** 给单位挂载状态（供未来事件/命令使用，A 侧唯一入口）。 */
  applyStatus(unitId, kind, value = 2) {
    const u = this.getUnit(unitId);
    if (!u || u.hp <= 0) return false;
    if (kind === 'stun') u.stunT = Math.max(u.stunT || 0, value);
    else if (kind === 'slow') { u.slowT = Math.max(u.slowT || 0, value); u.slowMul = 0.6; }
    else if (kind === 'corrode') u.corrodeT = Math.max(u.corrodeT || 0, value);
    else if (kind === 'poison' && u.poison) {
      u.poison.stacks = Math.min(POISON_MAX_STACKS, u.poison.stacks + 1);
      u.poison.t = POISON_T; u.poison.dps = Math.max(u.poison.dps, 4 * u.poison.stacks);
    } else return false;
    return true;
  }

  /** 多选阵型：按形态分散落点，避免整队挤在同一坐标上互相推挤。
   *  auto=近似方阵（原行为逐字不变）；line=横列；column=纵队；wedge=楔形；spread=松散方阵。 */
  _formationPoint(i, n, x, z, formation = 'auto') {
    if (n <= 1) return { x, z };
    const gap = formation === 'spread' ? 5.2 : 3.6;
    let ox, oz;
    if (formation === 'line') {
      ox = (i - (n - 1) / 2) * gap; oz = 0;
    } else if (formation === 'column') {
      ox = 0; oz = (i - (n - 1) / 2) * gap;
    } else if (formation === 'wedge') {
      const row = Math.floor((Math.sqrt(8 * i + 1) - 1) / 2);
      const first = row * (row + 1) / 2;
      ox = (i - first - row / 2) * gap; oz = -row * gap;
    } else {
      const cols = Math.ceil(Math.sqrt(n));
      const rows = Math.ceil(n / cols);
      ox = ((i % cols) - (cols - 1) / 2) * gap;
      oz = (Math.floor(i / cols) - (rows - 1) / 2) * gap;
    }
    return { x: clamp(x + ox, -HALF_W + 3, HALF_W - 3), z: clamp(z + oz, -HALF_H + 3, HALF_H - 3) };
  }

  /** 移动指令。opts.append=true 时把落点追加到路径队列（Shift+右键），单位依次走完。 */
  commandMove(ids, x, z, opts = {}) {
    const n = ids.length;
    ids.forEach((id, i) => {
      const u = this.getUnit(id); if (!u) return; u.repairId = null;
      const p = opts.formation === false ? { x, z }
        : this._formationPoint(i, n, x, z, opts.formation || u.formation || 'auto');
      if (opts.append) {
        if (!u.waypoints) u.waypoints = [];
        u.waypoints.push(p);
        // 当前没有进行中的手动移动时，立刻把首个路径点设为目标
        if (!(u.state === 'move' && u.order === 'manual' && u.target)) {
          u.target = u.waypoints.shift();
          u.state = 'move'; u.order = 'manual';
        }
      } else {
        u.waypoints = [];
        u.state = 'move'; u.order = 'manual'; u.target = p;
      }
      u.burrowed = false;
    });
  }
  commandAttack(ids, targetId) {
    const tgt = this.getUnit(targetId) || this.getBuilding(targetId) || this.getObstacle(targetId);
    if (!tgt) return;
    for (const id of ids) { const u = this.getUnit(id); if (!u) continue; u.repairId = null; u.waypoints = []; u.state = 'attack'; u.order = 'manual'; u.target = { id: targetId, x: tgt.x, z: tgt.z }; if (u.domain === 'underground') u.burrowed = false; }
  }
  commandAttackMove(ids, x, z, opts = {}) {
    const n = ids.length;
    ids.forEach((id, i) => {
      const u = this.getUnit(id); if (!u) return; u.repairId = null;
      const p = opts.formation === false ? { x, z }
        : this._formationPoint(i, n, x, z, opts.formation || u.formation || 'auto');
      u.waypoints = []; u.state = 'attackmove'; u.order = 'manual'; u.target = p;
      if (u.domain === 'underground') u.burrowed = false;
    });
  }
  commandHarvest(ids, nodeId) {
    const n = this.nodes.find(x => x.id === nodeId);
    for (const id of ids) { const u = this.getUnit(id); if (!u || UNITS[u.type].role !== 'econ') continue; if (n) { u.repairId = null; u.nodeId = n.id; u.state = 'harvest'; u.order = 'manual'; u.target = { x: n.x, z: n.z }; } }
  }
  commandStop(ids) { for (const id of ids) { const u = this.getUnit(id); if (!u) continue; u.repairId = null; u.state = 'idle'; u.order = 'auto'; u.target = null; u.waypoints = []; u.patrol = null; } }

  /** 驻守：原地守住当前位置，只攻击 HOLD_LEASH 内的目标，绝不追击出圈（守住隘口/巢口）。 */
  commandHold(ids) {
    let n = 0;
    for (const id of ids) {
      const u = this.getUnit(id); if (!u || UNITS[u.type].role === 'econ') continue;
      u.repairId = null; u.waypoints = []; u.patrol = null; u.target = null;
      u.holdX = u.x; u.holdZ = u.z; u.state = 'hold'; u.order = 'manual'; n++;
      this._fx('ring', u.x, 0.3, u.z, { color: 0x7ef0c8, r: 3 });
    }
    if (n) this._toast(`${n} 只单位进入驻守：只打防区内目标，不追击。`);
    return n;
  }
  /** 巡逻：在给定点之间循环往返，途中遇敌则交战，脱离后自动回到巡逻路线。 */
  commandPatrol(ids, points) {
    const pts = (points || []).filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.z))
      .map(p => ({ x: clamp(p.x, -HALF_W + 3, HALF_W - 3), z: clamp(p.z, -HALF_H + 3, HALF_H - 3) }));
    if (!pts.length) return 0;
    let n = 0;
    for (const id of ids) {
      const u = this.getUnit(id); if (!u || UNITS[u.type].role === 'econ') continue;
      u.repairId = null; u.waypoints = []; u.target = null;
      u.patrol = pts.map(p => ({ ...p })); u.patrolIdx = 0; u.state = 'patrol'; u.order = 'manual'; n++;
      this._fx('ring', pts[0].x, 0.3, pts[0].z, { color: 0x7ec8f0, r: 3 });
    }
    if (n) this._toast(`${n} 只单位开始巡逻（${pts.length} 个路径点）。`);
    return n;
  }
  /** 阵型：设置选中单位后续行军落点的散布形态，并立刻以该阵型重排到指定点。 */
  commandFormation(ids, formation = 'auto', x, z) {
    const valid = ['auto', 'line', 'wedge', 'column', 'spread'];
    const f = valid.includes(formation) ? formation : 'auto';
    const n = ids.length;
    let applied = 0;
    ids.forEach((id, i) => {
      const u = this.getUnit(id); if (!u) return;
      u.formation = f; applied++;
      if (Number.isFinite(x) && Number.isFinite(z)) {
        const p = this._formationPoint(i, n, x, z, f);
        u.repairId = null; u.waypoints = []; u.state = 'move'; u.order = 'manual'; u.target = p;
        u.burrowed = false;
      }
    });
    return applied;
  }
  /** 集结：把选中的建筑集结点统一设到某点（与 setRally 等价，批量版）。 */
  commandRally(buildingIds, x, z) {
    let n = 0;
    for (const id of buildingIds) if (this.setRally(id, x, z)) n++;
    return n;
  }

  _holdUnit(u, dt) {
    // 防区内出现敌人则原地开火；目标出圈立刻放弃，不追击（与 _attack 的移动逻辑区分）
    const t = this._nearestEnemyEntity(u.side, u.holdX ?? u.x, u.holdZ ?? u.z, HOLD_LEASH, this._targetOpts(u));
    if (t && dist(u.x, u.z, t.x, t.z) <= u.range * this._terrainRangeMul(u) + (t.size ? t.size * 0.5 : 0)) {
      if (u.atkTimer <= 0) {
        this._dealDamage(u, t, u.dmg, u.x, u.z, !u.melee, u.dtype);
        if (u.splash > 0) this._applySplash(u, t, u.dmg);
        u.atkTimer = u.atkcd;
      }
    } else if (t) {
      // 在防区内但够不着：小幅向目标挪动，仍不越过防区边界
      const dx = t.x - u.x, dz = t.z - u.z, d = Math.hypot(dx, dz) || 1;
      const nx = u.x + dx / d * Math.min(1.2, d), nz = u.z + dz / d * Math.min(1.2, d);
      if (dist(nx, nz, u.holdX, u.holdZ) <= HOLD_LEASH * 0.5) { u.x = nx; u.z = nz; u.heading = Math.atan2(dz, dx); u.moving = true; }
    }
  }
  _patrolUnit(u, dt) {
    const pts = u.patrol;
    if (!pts || !pts.length) { u.state = 'idle'; u.order = 'auto'; return; }
    // 途中遇敌：切到 attack 交战，交战结束由 _attack 回 idle 再被 _autoUnit 重新拉回巡逻
    const t = this._nearestEnemyEntity(u.side, u.x, u.z, AGGRO * 0.7, this._targetOpts(u));
    if (t) { u.target = { id: t.id, x: t.x, z: t.z }; u.state = 'attack'; u.retPatrol = true; return; }
    const p = pts[u.patrolIdx % pts.length];
    this._moveTo(u, p.x, p.z, dt, () => { u.patrolIdx = (u.patrolIdx + 1) % pts.length; });
  }

  // ------------------------------------------------------------ 工蚁维修巢室
  /** 选中受损己方建筑时，派最近的工蚁去维修；返回派出的工蚁数。 */
  assignRepair(buildingId, maxWorkers = 2) {
    const b = this.getBuilding(buildingId);
    if (!b || b.side !== SIDES.PLAYER) return 0;
    if (b.state === 'constructing') { this._toast('施工中的巢室无需维修'); return 0; }
    if (b.hp >= b.maxHp - 0.5) { this._toast('该巢室完好，无需维修'); return 0; }
    if (this.res_(SIDES.PLAYER, 'min') < 1) { this._toast('维修需要矿物，当前矿不足'); return 0; }
    const busy = this.units.filter(u => u.repairId === b.id).length;
    const cands = this.units
      .filter(u => u.side === SIDES.PLAYER && UNITS[u.type].role === 'econ' && u.repairId == null)
      .sort((a, c) => dist(a.x, a.z, b.x, b.z) - dist(c.x, c.z, b.x, b.z))
      .slice(0, Math.max(0, maxWorkers - busy)).map(u => u.id);
    if (!cands.length) { this._toast(busy ? '已有工蚁在维修该巢室' : '暂无可调度的工蚁'); return 0; }
    return this.commandRepair(cands, b.id);
  }
  /** 直接给指定工蚁下达维修指令（选中工蚁右键己方受损建筑）。 */
  commandRepair(ids, buildingId) {
    const b = this.getBuilding(buildingId);
    if (!b || b.side !== SIDES.PLAYER || b.state === 'constructing' || b.hp >= b.maxHp - 0.5) return 0;
    let n = 0;
    for (const id of ids) {
      const u = this.getUnit(id);
      if (!u || u.side !== SIDES.PLAYER || UNITS[u.type].role !== 'econ') continue;
      u.waypoints = []; u.repairId = b.id; u.state = 'repair'; u.order = 'manual';
      u.target = { x: b.x, z: b.z }; u.burrowed = false;
      n++;
    }
    if (n) {
      this._fx('ring', b.x, 0.4, b.z, { color: 0xffd27f });
      this._emit('repair', { id: b.id, workers: n });
      this._toast(`${n} 只工蚁前往维修「${BUILDINGS[b.type].name}」（消耗矿物）`);
    }
    return n;
  }
  /** 维修进行中：靠近后按秒消耗矿物恢复耐久；修满 / 矿耗尽 / 建筑损毁即回归采集。
   *  按工蚁所属方结算资源与统计（玩家路径与泛化前逐字等价，敌方由 _aiRepairCheck 指派）。 */
  _repair(u, dt) {
    const b = this.getBuilding(u.repairId);
    if (!b || b.side !== u.side || b.state === 'constructing' || b.hp >= b.maxHp - 0.5) { this._endRepair(u); return; }
    const d = dist(u.x, u.z, b.x, b.z) - b.size * 0.5;
    if (d > REPAIR_RANGE) { this._moveTo(u, b.x, b.z, dt); return; }
    const heal = Math.min(REPAIR_RATE * dt, b.maxHp - b.hp);
    const cost = heal * REPAIR_MIN_PER_HP;
    if (this.res_(u.side, 'min') < cost) {
      if (u.side === SIDES.PLAYER && this.time - (this._repairWarnT || -9) > 2) {
        this._repairWarnT = this.time; this._toast('矿物耗尽，维修中止');
      }
      this._endRepair(u); return;
    }
    this.res[u.side].min -= cost;
    b.hp = Math.min(b.maxHp, b.hp + heal);
    b.repairGlow = 0.8;
    if (this.stats && this.stats[u.side]) this.stats[u.side].repaired += heal;
    u.repairAcc = (u.repairAcc || 0) + dt;
    if (u.repairAcc > 0.45) {
      u.repairAcc = 0;
      this._fx('ring', b.x, 0.4, b.z, { color: 0xffd27f, r: b.size * 0.6 });
    }
    if (b.hp >= b.maxHp - 0.5) {
      if (u.side === SIDES.PLAYER) this._log(`「${BUILDINGS[b.type].name}」维修完成，耐久已恢复。`, 'good');
      this._fx('levelup', b.x, b.size * 0.6, b.z, { color: 0x7ef0a0 });
      this._endRepair(u);
    }
  }
  _endRepair(u) {
    u.repairId = null; u.repairAcc = 0;
    u.state = 'idle'; u.order = 'auto'; u.target = null; u.waypoints = [];
  }

  /** 空闲工蚁：闲置 / 被手动打断采集的己方采集单位。 */
  idleWorkers(side = SIDES.PLAYER) {
    return this.units.filter(u => u.side === side && UNITS[u.type].role === 'econ'
      && (u.state === 'idle' || u.order === 'manual')).map(u => u.id);
  }
  /** 让选中的己方工蚁重新就近采集（清掉手动命令与路径点）。返回生效数量。 */
  resumeHarvest(ids) {
    let n = 0;
    for (const id of ids) {
      const u = this.getUnit(id);
      if (!u || u.side !== SIDES.PLAYER || UNITS[u.type].role !== 'econ') continue;
      u.waypoints = []; u.order = 'auto'; u.target = null; u.nodeId = null; u.repairId = null;
      this._assignHarvest(u);
      n++;
    }
    return n;
  }

  // 集结点：选中生产建筑后，右键地面设置；新生产的作战单位会前往该点
  setRally(buildingId, x, z) {
    const b = this.getBuilding(buildingId);
    if (!b || b.side !== SIDES.PLAYER) return false;
    if (!BUILDINGS[b.type].produces) { this._toast('该建筑无法设置集结点'); return false; }
    if (dist(x, z, b.x, b.z) > b.size + 60) { this._toast('集结点离建筑过远'); return false; }
    b.rally = { x, z };
    this._emit('rally', { id: b.id, x, z });
    this._toast('已设置集结点（新作战单位将前往）');
    return true;
  }

  // 进化（成长系统）
  canEvolve(u) {
    if (!u || u.side !== SIDES.PLAYER) return null;
    const def = UNITS[u.type]; if (!def.evolveTo) return null;
    const ev = def.evo;
    if (u.level < ev.level) return `需 Lv.${ev.level}`;
    if (this.era.P < ev.era) return `需纪元 ${ev.era + 1}`;
    if (!this.canAfford(SIDES.PLAYER, { min: ev.min })) return `需矿 ${ev.min}`;
    return true;
  }
  evolve(unitId) {
    const u = this.getUnit(unitId);
    const chk = this.canEvolve(u);
    if (chk !== true) { if (chk) this._toast(chk); return false; }
    const def = UNITS[u.type]; const ev = def.evo;
    this.spend(SIDES.PLAYER, { min: ev.min });
    if (this.stats) this.stats.P.evolved++;
    const to = def.evolveTo;
    const e = effectiveUnit(to, this.sp.P, this.era.P, { level: u.level, elite: false });
    u.type = to; u.caste = e.caste; u.domain = e.domain; u.armor = e.armor; u.ability = e.ability;
    u.maxHp = e.hp; u.hp = e.hp; u.dmg = e.dmg; u.speed = e.speed; u.range = e.range;
    u.atkcd = e.atkcd; u.melee = e.melee; u.dtype = e.dtype; u.splash = e.splash;
    u.elite = false; u.xp = 0;
    this._syncTraits(u);
    this._fx('evolve', u.x, 2, u.z, { color: this.sp.P.color });
    this._log(`进化成功：「${UNITS[to].name}」！`, 'good');
    this._emit('evolve', { id: u.id });
    return true;
  }

  // -------------------------------------------------------------- 主循环
  tick(dt) {
    if (this.ended) return;
    this.time += dt;
    for (const b of this.buildings) this._tickBuilding(b, dt);
    this._tickNodes(dt);
    this._tickWells(dt);
    this._tickAura(dt);
    // 精炼巢室：每帧重算双方「全军强化」标记（建成即生效、被拆即失效、多座不叠加）
    for (const s of ['P', 'E']) {
      this.refined[s] = this.buildings.some(b => b.side === s && b.type === 'refinery' && b.state === 'idle' && b.hp > 0);
    }
    for (const u of this.units) this._tickUnit(u, dt);
    this._tickHazards(dt);
    this._tickTerrain(dt);
    this._reap();
    this._tickEcho();
    this._tickWeather(dt);
    this._tickDynamics(dt);
    this._tickAI(dt);
    this._checkEnd();
    // 能力冷却倒计时递减（此前只设置不递减，会导致技能永久处于冷却）
    for (const side of ['P', 'E']) for (const k in this.cd[side]) {
      if (this.cd[side][k] > 0) this.cd[side][k] = Math.max(0, this.cd[side][k] - dt);
    }
    this._updateVision();
    // 峰值兵力统计（用于结算页）
    for (const side of ['P', 'E']) {
      let p = 0;
      for (const u of this.units) if (u.side === side) p += (UNITS[u.type].pop || 1);
      if (p > this.peakPop[side]) this.peakPop[side] = p;
    }
  }

  // 巨人回响：战役模式下在设定时间触发一次
  _tickEcho() {
    if (this.echoFired || !this.echo || this.time < this.echo.at) return;
    this.echoFired = true;
    const e = this.echo;
    this._log(e.text, 'key');
    this._emit('echo', { type: e.type, text: e.text });
    this._fx('resonance', 0, 8, 0, { color: 0xc7b3ff });
    if (e.type === 'boon') {
      for (const n of this.nodes) { n.amount = n.max; }
      this._fx('ring', 0, 1, 0, { color: 0x9fe0c8, r: 120 });
    } else if (e.type === 'surge') {
      this.res.P.ph += 40; this.res.P.bio += 120;
      this._fx('ring', PLAYER_BASE.x, 1, PLAYER_BASE.z, { color: 0xffe27f, r: 40 });
    } else if (e.type === 'storm') {
      const spots = [[40, 30], [-45, -25], [10, -40], [-30, 45]];
      for (const [x, z] of spots) this._addHazard(x, z, 12, 10, 'E', 'acid', 0, 8, 'storm');
      this._log('酸雨降临：注意躲避随机落点！', 'bad');
    }
  }

  /* ----------------------------- 动态战场 ----------------------------- */
  /** 天气阶段：战役按时间线切换天气（视野 / 远程命中随之变化），遭遇战时间线为空 → 零影响。
   *  切换走既有 log 播报 + ring 全图提示圈；不新增事件 / 特效类型，不消费随机数。 */
  _tickWeather(dt) {
    const tl = this.weatherTimeline;
    if (!tl || this.weatherIdx >= tl.length) return;
    const step = tl[this.weatherIdx];
    if (this.time < step.at) return;
    this.weatherIdx++;
    this.weather = step.next;
    this._log(`【天气转变·${this.weather.name}】${step.text || this.weather.desc}`, 'key');
    this._fx('ring', 0, 1, 0, { color: step.color || 0x9fc8e0, r: 120 });
    if (this.stats) { this.stats.P.weatherShifts++; this.stats.E.weatherShifts++; }
    this._updateVision();   // 视野半径立即跟随新天气，避免延迟一帧的隔墙透视
  }

  /** 地脉共振：周期性唤醒一处高台（确定性轮转，不用 RNG），驻留其上的真实单位攻击获小幅加成。
   *  第一个周期不激活，避免开局即改变采集/交火节奏；仅配置了 dynamics 的战役章节生效。 */
  _tickDynamics(dt) {
    const cfg = this.dynamics && this.dynamics.resonance;
    if (!cfg || !this.ridgeZones.length) return;
    const phase = Math.floor(this.time / cfg.period);
    if (phase === this.resonancePhase) return;
    this.resonancePhase = phase;
    for (const q of this.ridgeZones) q.resonant = false;
    if (phase < 1) { this.resonance = null; return; }
    const q = this.ridgeZones[phase % this.ridgeZones.length];
    q.resonant = true;
    this.resonance = { x: q.x, z: q.z, r: Math.max(q.rx, q.rz), bonus: cfg.bonus, zoneId: q.id };
    this._log(`【地脉共振】${cfg.label}「${q.id}」被唤醒：驻留其上的单位攻击 +${Math.round(cfg.bonus * 100)}%。`, 'key');
    this._fx('ring', q.x, 1, q.z, { color: cfg.color, r: this.resonance.r });
    this._fx('resonance', q.x, 4, q.z, { color: cfg.color });
  }

  /** 当前共振高台（只读快照，供 B 侧渲染光柱 / 小地图脉冲；无共振时返回 null）。 */
  activeResonance() { return this.resonance ? { ...this.resonance } : null; }

  /** 战场里程碑：首杀 / 10 / 25 / 50 杀播报，只走 log + ring，去重且纯表现、零数值影响。 */
  _killMilestone(side, kills) {
    if (![1, 10, 25, 50].includes(kills)) return;
    const key = `${side}:${kills}`;
    if (this.milestones[key]) return;
    this.milestones[key] = true;
    const mine = side === SIDES.PLAYER;
    this._log(`【战场里程碑】${mine ? '我方' : '敌方'}累计击杀 ${kills}：${kills >= 25 ? '战线已被彻底改写。' : '交锋进入白热化。'}`, mine ? 'good' : 'info');
    this._fx('ring', mine ? PLAYER_BASE.x : ENEMY_BASE.x, 1, mine ? PLAYER_BASE.z : ENEMY_BASE.z,
      { color: mine ? 0x9fe0c8 : 0xff8a6a, r: 26 });
    if (this.stats) this.stats[side].milestones++;
  }

  /* ----------------------------- 动作状态机 ----------------------------- */
  /** 切换动画状态：只在真正变化时递增 seq，B 侧可据此做「一次播放」判定，无需逐帧比对。 */
  _setAnim(u, state) {
    const a = u.anim;
    if (!a || a.state === state || !UNIT_ANIM[state]) return;
    a.prev = a.state; a.state = state; a.t = 0; a.seq++;
  }
  /** 每帧从「逻辑状态 + 瞬时事件窗口」推导表现状态。纯写字段，不改任何战斗数值 / 时机。 */
  _tickAnim(u, dt) {
    const a = u.anim; if (!a) return;
    a.t += dt;
    if (u.animStrike > 0) u.animStrike = Math.max(0, u.animStrike - dt);
    if (u.animHurt > 0) u.animHurt = Math.max(0, u.animHurt - dt);
    let s;
    if (u.hp <= 0) s = 'death';
    else if (u.animHurt > 0) s = 'hurt';
    else if (u.animStrike > 0) s = 'attack';
    else if (u.state === 'harvest') s = 'harvest';
    else if (u.state === 'repair') s = 'repair';
    else if (u.state === 'return' || u.carrying > 0) s = 'carry';
    else if (u.moving) s = 'move';
    else s = 'idle';
    this._setAnim(u, s);
  }
  /** 只读查询：单位当前动画状态与规格（B 侧可选消费；无该单位返回 null）。 */
  animOf(id) {
    const u = this.getUnit(id);
    return u && u.anim ? { ...u.anim, spec: UNIT_ANIM[u.anim.state] || null } : null;
  }

  _tickAura(dt) {
    for (const s of ['P', 'E']) if (this.aura[s].t > 0) { this.aura[s].t -= dt; if (this.aura[s].t <= 0) this.aura[s].dmg = 1; }
  }

  _tickBuilding(b, dt) {
    if (b.repairGlow > 0) b.repairGlow = Math.max(0, b.repairGlow - dt);   // 维修光效衰减
    if (b.state === 'constructing') {
      b.buildProg += dt / b.buildTime;
      b.hp = Math.max(1, b.maxHp * clamp(b.buildProg, 0, 1) * 0.9);
      if (b.buildProg >= 1) {
        b.state = 'idle'; b.buildProg = 1; b.hp = b.maxHp;
        this._log(`${b.side === SIDES.PLAYER ? '我方' : '敌方'}「${BUILDINGS[b.type].name}」建成。`, b.side === SIDES.PLAYER ? 'good' : 'info');
      }
      return;
    }
    if (b.phGen) this.gainRes(b.side, 'ph', b.phGen * this._clim().phGenMul * dt);
    // 蚁后巢：队列空闲时缓慢自动孵化工蚁（降低操作负担；仅玩家侧）
    if (b.type === 'hq' && b.side === SIDES.PLAYER && b.queue.length === 0) {
      b.autoT = (b.autoT || 0) + dt;
      const interval = 11;   // 缓慢（略快，降低操作负担）
      const workers = this.units.filter(u => u.side === SIDES.PLAYER && u.type === 'worker').length;
      if (b.autoT >= interval && workers < 14) {
        const cost = effectiveCost('worker', this.sp.P);
        if (this.canAfford(SIDES.PLAYER, cost)) {
          this.spend(SIDES.PLAYER, cost);
          b.queue.push({ type: 'worker', t: UNITS['worker'].build });
          b.autoT = 0;
        }
      }
    }
    if (b.queue.length) {
      const item = b.queue[0];
      const isWorker = UNITS[item.type].role === 'econ';
      const speedMul = isWorker ? this._workerSpeedMul(b.side) : 1;   // 育幼室多座叠加加速工蚁产能
      item.t -= dt * speedMul;
      if (item.t <= 0) {
        b.queue.shift();
        const a = Math.random() * 6.28, r = b.size + 4;
        const nx = clamp(b.x + Math.cos(a) * r, -HALF_W + 4, HALF_W - 4);
        const nz = clamp(b.z + Math.sin(a) * r, -HALF_H + 4, HALF_H - 4);
        const u = this._makeUnit(b.side, item.type, nx, nz);
        this._fx('ring', nx, 0.4, nz, { color: b.side === SIDES.PLAYER ? 0x7ef0ff : 0xffb070 });
        // 集结点：玩家侧作战单位生产后前往集结点（攻击移动，途中可迎敌）
        if (b.rally && b.side === SIDES.PLAYER && UNITS[item.type].role !== 'econ' && u) {
          this.commandAttackMove([u.id], b.rally.x, b.rally.z);
        }
        if (b.side === SIDES.PLAYER) this._log(`生产完成：「${UNITS[item.type].name}」。`, 'good');
      }
    }
    if (b.research) {
      b.research.t -= dt;
      if (b.research.t <= 0) { const side = b.side, newEra = b.research.era; b.research = null; this._applyEra(side, newEra); }
    }
    if (b.attack) {
      b.cooldown = Math.max(0, b.cooldown - dt);   // 长期无目标时不让冷却累积成巨大负数
      if (b.cooldown <= 0) {
        const tgt = this._nearestEnemyEntity(b.side, b.x, b.z, b.attack.range + b.size * 0.5);
        if (tgt) { this._dealDamage(b, tgt, b.attack.dmg, b.x, b.z, true, b.attack.dtype); b.cooldown = b.attack.atkcd; }
      }
    }
  }

  _applyEra(side, newEra) {
    this.era[side] = newEra;
    this._log(`${side === SIDES.PLAYER ? '我方' : '敌方'}推进至纪元 ${newEra + 1}（${ERA_NAMES[newEra]}）—— 全族群属性成长。`, side === SIDES.PLAYER ? 'key' : 'info');
    this._emit('era', { side, era: newEra });
    for (const u of this.units) {
      if (u.side !== side) continue;
      const ratio = u.hp / u.maxHp;
      const e = effectiveUnit(u.type, this.sp[side], newEra, { level: u.level, elite: u.elite });
      u.maxHp = e.hp; u.hp = clamp(e.hp * ratio, 1, e.hp);
      u.dmg = e.dmg; u.speed = e.speed;
      this._syncTraits(u);
    }
  }

  _tickUnit(u, dt) {
    u.moving = false;
    // 每帧刷新脚下地貌（静止单位也要更新，状态环/属性卡据此显示高台、泥沼、浅滩）
    const tq = this.zoneAt(u.x, u.z);
    u.terrain = tq ? tq.type : 'plain';
    if (u.atkTimer > 0) u.atkTimer -= dt;
    if (u.flash > 0) u.flash -= dt;
    // 战术掩体受击闪白衰减（与单位共用 0.16 包络）
    for (const ob of this.obstacles) if (ob.flash > 0) ob.flash -= dt;
    if (u.buff.t > 0) { u.buff.t -= dt; if (u.buff.t <= 0) { u.buff.dmg = 1; u.buff.tank = 1; u.buff.spd = 1; } }
    this._tickStatuses(u, dt);
    // 地下掘蚁：静止/移动时潜行（不可锁定、提速）
    if (u.domain === 'underground') {
      const surfaced = u.state === 'attack' || u.state === 'harvest' || u.state === 'return' || u.order === 'manual';
      u.burrowed = !surfaced;
    }
    switch (u.state) {
      case 'idle': this._autoUnit(u, dt); break;
      case 'move': this._moveTo(u, u.target.x, u.target.z, dt, () => {
        // 路径点队列：走完当前点后继续下一段；全部走完才恢复自主行为
        const next = u.waypoints && u.waypoints.length ? u.waypoints.shift() : null;
        if (next) { u.target = next; u.state = 'move'; u.order = 'manual'; }
        else { u.state = 'idle'; u.order = 'auto'; }
      }); break;
      case 'harvest': this._harvest(u, dt); break;
      case 'return': this._return(u, dt); break;
      case 'repair': this._repair(u, dt); break;
      case 'attack': this._attack(u, dt); break;
      case 'attackmove': this._attackMove(u, dt); break;
      case 'hold': this._holdUnit(u, dt); break;
      case 'patrol': this._patrolUnit(u, dt); break;
    }
    // 放在状态机之后：本帧的 state / moving / carrying / 攻击与受击窗口都已确定，
    // 一次集中推导表现状态，避免把动画写入散落到十几个战斗方法里。
    this._tickAnim(u, dt);
  }

  /** 状态效果结算：中毒叠层 DoT / 腐蚀破甲 / 减速分层 / 眩晕停工。
   *  中毒 DoT 用「无 traits 的代理」走 _dealDamage 统一口径（统计 / 飘字 / 尸体总闸），
   *  不会再触发第二次中毒或暴击；能力自带的酸池 / 毒雾仍走 _tickHazards，互不重复。 */
  _tickStatuses(u, dt) {
    if (u.corrodeT > 0) u.corrodeT = Math.max(0, u.corrodeT - dt);
    if (u.slowT > 0) { u.slowT = Math.max(0, u.slowT - dt); if (u.slowT <= 0) u.slowMul = 1; }
    if (u.stunT > 0) {
      u.stunT = Math.max(0, u.stunT - dt);
      if (this.stats && this.stats[u.side]) this.stats[u.side].stunTicks += dt;
      return;   // 眩晕期间不行动（索敌 / 移动 / 攻击全停），但上面的计时照常衰减
    }
    const p = u.poison;
    if (p && p.t > 0 && p.stacks > 0 && u.hp > 0) {
      p.t -= dt;
      p.acc = (p.acc || 0) + dt;
      if (p.acc >= 0.5) {
        const step = p.acc; p.acc = 0;
        const before = u.hp;
        this._dealDamage({ side: p.src || (u.side === SIDES.PLAYER ? SIDES.ENEMY : SIDES.PLAYER) },
          u, p.dps * step, u.x, u.z, true, 'psi');
        if (this.stats && p.src && this.stats[p.src]) this.stats[p.src].poisonTicks++;
        if (before > 0 && u.hp <= 0 && this.stats && p.src && this.stats[p.src]) this.stats[p.src].statusKills++;
      }
      if (p.t <= 0) { p.stacks = 0; p.dps = 0; p.acc = 0; p.src = null; }
    }
  }

  _autoUnit(u, dt) {
    if (UNITS[u.type].role === 'econ') { this._assignHarvest(u); return; }
    // 巡逻单位若因故回到 idle（如集结/停止后再自主），重新接上巡逻路线
    if (u.patrol && u.patrol.length && u.order !== 'manual') { u.state = 'patrol'; u.order = 'manual'; return; }
    const t = this._nearestEnemyEntity(u.side, u.x, u.z, AGGRO, this._targetOpts(u));
    if (t) { u.target = { id: t.id, x: t.x, z: t.z }; u.state = 'attack'; if (u.domain === 'underground') u.burrowed = false; }
  }

  /** 战术索敌开关：只有敌方 AI 且难度 targeting>0 时启用，玩家单位与手动指令保持原行为。 */
  _targetOpts(u) {
    const w = (u.side === SIDES.ENEMY && this._ai) ? (this._ai.diff.targeting || 0) : 0;
    return w > 0 ? { tactical: u, tacticalWeight: w } : undefined;
  }

  _harvest(u, dt) {
    let n = this.nodes.find(x => x.id === u.nodeId);
    if (!n || n.amount <= 0) {
      const nn = this._reassignNode(u);
      if (!nn) return;
      n = nn;
    }
    if (dist(u.x, u.z, n.x, n.z) > HARVEST_RANGE) {
      this._moveTo(u, n.x, n.z, dt);
    } else {
      const take = Math.min(GATHER_RATE * this._clim().gatherMul * dt, u.carryCap - u.carrying, n.amount);
      u.carrying += take; u.carryRes = n.res; n.amount -= take;
      n.owner = u.side; n.glow = 1;   // 采集热度：地图底座环按归属方着色
      if (u.carrying >= u.carryCap - 0.01) u.state = 'return';
    }
  }

  _return(u, dt) {
    const d = this.nearestDepot(u.side, u.x, u.z);
    if (!d) { u.state = 'harvest'; return; }
    if (dist(u.x, u.z, d.x, d.z) > DEPOSIT_RANGE) {
      this._moveTo(u, d.x, d.z, dt);
    } else {
      const haul = Math.round(u.carrying);
      const haulRes = u.carryRes;
      this.gainRes(u.side, haulRes, haul);
      if (this.stats) this.stats[u.side].harvested += haul;
      this._fx('ring', d.x, 0.4, d.z, { color: haulRes === 'min' ? 0xc9b07a : 0x9fe0c8 });
      // 卸货入账事件：供 HUD 飘出 "+N 生/矿"，把采集循环做成看得见的收益
      if (u.side === SIDES.PLAYER && haul > 0) {
        this._emit('gain', { x: d.x, z: d.z, y: (d.size || 5) + 2, amount: haul, res: haulRes });
      }
      u.carrying = 0; u.carryRes = 'bio';
      this._reassignNode(u);
    }
  }

  _attack(u, dt) {
    const tgt = u.target && (this.getUnit(u.target.id) || this.getBuilding(u.target.id) || this.getObstacle(u.target.id));
    // 目标已在同帧被友军击杀（_reap 在帧末才清理）：立刻释放锁定，避免后续单位对着尸体空放一轮。
    // 原实现会置 state='auto'，但状态机并无该分支，单位将永久静止 —— 统一回到 idle 由 _autoUnit 重新索敌。
    if (!tgt || tgt.hp <= 0) {
      if (tgt && this.stats && this.stats[u.side]) this.stats[u.side].overkillSaved++;
      // 巡逻单位交战结束后回到巡逻路线（不丢命令）；其余单位照旧回 idle 重新索敌。
      if (u.retPatrol && u.patrol && u.patrol.length) { u.state = 'patrol'; u.order = 'manual'; u.retPatrol = false; }
      else u.state = 'idle';
      u.target = null;
      return;
    }
    if (u.domain === 'underground') u.burrowed = false;
    const r = (tgt.r ? tgt.r : (tgt.size ? tgt.size * 0.5 : 0));   // 障碍用半径作为停火距离
    const reach = u.range * this._terrainRangeMul(u) + r;   // 高台上的远程单位射程更远
    if (dist(u.x, u.z, tgt.x, tgt.z) > reach) {
      this._moveTo(u, tgt.x, tgt.z, dt);
    } else if (u.atkTimer <= 0) {
      u.animStrike = 0.35;   // 攻击动作窗口（表现层只读，不影响伤害与冷却）
      this._dealDamage(u, tgt, u.dmg, u.x, u.z, !u.melee, u.dtype);
      if (u.splash > 0) this._applySplash(u, tgt, u.dmg);
      u.atkTimer = u.atkcd;
    }
  }

  /** 溅射：w_glider 等武器配了 splash 半径且属性卡已展示「溅射」，但此前战斗结算从未消费该字段。
   *  主目标结算后，对落点半径内的其他敌方单位按 SPLASH_RATIO 结算一次递减伤害。
   *  约束：只打敌方、不重复结算主目标、不打建筑/障碍、不误伤友军；
   *  用「无 xp 的攻击者代理」走 _dealDamage 统一口径（统计 / 飘字 / 尸体总闸），
   *  但不会让攻击者因溅射再刷一遍经验；能力自带 _dmgRadius，不经过此路径。 */
  _applySplash(u, tgt, dmg) {
    const r = u.splash || 0;
    if (r <= 0 || !tgt || !tgt.side) return;
    const enemy = u.side === SIDES.PLAYER ? SIDES.ENEMY : SIDES.PLAYER;
    const candidates = [];
    for (const o of this.units) {
      if (o === tgt || o.side !== enemy || o.hp <= 0 || !this.isTargetable(o)) continue;
      const d = dist(o.x, o.z, tgt.x, tgt.z);
      if (d <= r) candidates.push({ o, d });
    }
    // 取最近的有限个目标：既兑现「范围爆破」的手感，又不让密集阵型把单体武器的输出放大数倍
    candidates.sort((a, b) => a.d - b.d);
    let hits = 0;
    for (const { o } of candidates.slice(0, SPLASH_MAX_TARGETS)) {
      this._dealDamage({ side: u.side }, o, dmg * SPLASH_RATIO, tgt.x, tgt.z, false, u.dtype);
      hits++;
    }
    if (hits && this.stats && this.stats[u.side]) this.stats[u.side].splashHits += hits;
  }

  _attackMove(u, dt) {
    const tgt = this._nearestEnemyEntity(u.side, u.x, u.z, AGGRO + 6, this._targetOpts(u));
    if (tgt) { u.target = { id: tgt.id, x: tgt.x, z: tgt.z }; u.state = 'attack'; return; }
    if (u.target) this._moveTo(u, u.target.x, u.target.z, dt, () => { u.state = 'idle'; u.order = 'auto'; });
    else { u.state = 'idle'; u.order = 'auto'; }   // 无落点时不要滞留在 attackmove 空转
  }

  _moveTo(u, tx, tz, dt, onArrive) {
    const dx = tx - u.x, dz = tz - u.z;
    const d = Math.hypot(dx, dz);
    const stopR = (u.state === 'attack' || u.state === 'harvest') ? 0.2 : 0.6;
    if (d <= stopR) { u.moving = false; if (onArrive) onArrive(); return; }
    let vx = dx / d, vz = dz / d;
    let sx = 0, sz = 0;
    for (const o of this.units) {
      if (o === u || o.side !== u.side) continue;
      const od = dist(u.x, u.z, o.x, o.z);
      if (od < 2.6 && od > 1e-3) { sx += (u.x - o.x) / od; sz += (u.z - o.z) / od; }
    }
    vx += sx * 0.35; vz += sz * 0.35;
    // 战术掩体软碰撞：把单位推离障碍，并叠加切向分量避免正对障碍来回抖动
    for (const ob of this.obstacles) {
      const od = dist(u.x, u.z, ob.x, ob.z);
      const minD = ob.r + 0.8;
      if (od < minD && od > 1e-3) {
        const push = (minD - od) / minD;
        const nx = (u.x - ob.x) / od, nz = (u.z - ob.z) / od;
        vx += nx * push * 1.5 - nz * push * 0.9;
        vz += nz * push * 1.5 + nx * push * 0.9;
      }
    }
    const vl = Math.hypot(vx, vz) || 1; vx /= vl; vz /= vl;
    // 命中减速（slowMul）与地形减速叠乘；眩晕由 _tickStatuses 直接挡住整帧行动。
    let sp = u.speed * u.buff.spd * (u.slowT > 0 ? (u.slowMul || 1) : 1)
      * (u.burrowed ? BURROW_IDLE_SPEED : 1) * this._terrainSpeedMul(u);
    const step = sp * dt;
    u.x = clamp(u.x + vx * step, -HALF_W + 2, HALF_W - 2);
    u.z = clamp(u.z + vz * step, -HALF_H + 2, HALF_H - 2);
    u.heading = Math.atan2(vz, vx);
    u.moving = true;
  }

  _nearestEnemyEntity(side, x, z, radius, opts = {}) {
    // 战术评分是可选增量：不传 opts.tactical 时，下面这段原「最近目标」逻辑逐字保持不变。
    if (opts.tactical && opts.tacticalWeight > 0) {
      return this._tacticalTarget(side, x, z, radius, opts.tactical, opts.tacticalWeight, opts);
    }
    const enemy = side === SIDES.PLAYER ? SIDES.ENEMY : SIDES.PLAYER;
    let best = null, bd = radius;
    for (const u of this.units) {
      if (u.side !== enemy || u.hp <= 0) continue;   // 帧内已阵亡、尚未回收的单位不再被锁定
      if (!this.isTargetable(u)) continue;
      if (opts.combatOnly && u.type === 'worker') continue;
      const d = dist(x, z, u.x, u.z);
      if (d < bd) { bd = d; best = u; }
    }
    for (const b of this.buildings) {
      if (b.side !== enemy || b.hp <= 0 || b.state === 'constructing') continue;
      const d = dist(x, z, b.x, b.z) - b.size * 0.5;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  /** 战术索敌评分：距离 − 武器克制 − 残血/补刀 − 远程威胁 − 经济骚扰 + 建筑降权。
   *  w 为难度权重（0..1），w 越大越「聪明」；硬约束仍是 radius 内才可选。 */
  _tacticalTarget(side, x, z, radius, atk, w, opts = {}) {
    const enemy = side === SIDES.PLAYER ? SIDES.ENEMY : SIDES.PLAYER;
    let best = null, bestScore = Infinity;
    const consider = (t, d, isBuilding) => {
      if (d >= radius || t.hp <= 0) return;   // 与默认索敌一致：跳过帧内已阵亡目标
      const armor = t.armor || (isBuilding ? 'chitin' : 'soft');
      const mult = dmgMult(atk.dtype, armor);
      let score = d - (mult - 1) * w * 30;
      if (t.maxHp) {
        score -= (1 - clamp(t.hp / t.maxHp, 0, 1)) * w * 10;
        if (atk.dmg && t.hp <= atk.dmg * mult) score -= w * 7;   // 可一击击杀
      }
      if (!isBuilding) {
        if (opts.combatOnly && t.type === 'worker') return;
        const def = UNITS[t.type];
        if (def && def.role === 'econ') score -= w * 4;
        else if (def && (def.range || 0) > 10) score -= w * 5;   // 优先点掉远程输出
      } else {
        score += w * 2;
      }
      if (score < bestScore) { bestScore = score; best = t; }
    };
    for (const u of this.units) {
      if (u.side !== enemy || !this.isTargetable(u)) continue;
      consider(u, dist(x, z, u.x, u.z), false);
    }
    for (const b of this.buildings) {
      if (b.side !== enemy || b.state === 'constructing') continue;
      consider(b, dist(x, z, b.x, b.z) - b.size * 0.5, true);
    }
    return best;
  }

  _dealDamage(attacker, tgt, dmg, fromX, fromZ, ranged, dtype) {
    // 总闸：尸体不再吃伤害。同帧集火 / 范围溅射 / 持续酸雨都经此路径，
    // 避免「打死之后还有 4 发命中」把攻防统计与击杀归因抬虚。
    if (!tgt || tgt.hp <= 0) return;
    const aSide = attacker && attacker.side ? attacker.side : null;
    const armor = tgt.armor || (BUILDINGS[tgt.type] ? 'chitin' : 'soft');
    // 真实单位攻击者带 critChance 字段，才拥有战斗 traits；溅射 / 危害 / 范围伤害
    // 传的是 {side} 代理，建筑攻击者也没有 traits —— 二者保持原结算路径逐字不变。
    const unitAtk = !!(attacker && attacker.critChance !== undefined);
    const st = this.stats && aSide ? this.stats[aSide] : null;
    let d = dmg;
    if (aSide) d *= this.aura[aSide].dmg;
    if (tgt.buff) d *= tgt.buff.tank;
    const baseMult = dmgMult(dtype, armor);
    let mult = baseMult;
    // 破甲 trait + 腐蚀状态：只把「护甲抗性（mult<1）」按比例拉回 1，不放大已有克制。
    if (mult < 1) {
      if (unitAtk && attacker.pierce > 0) { mult += (1 - mult) * attacker.pierce; if (st) st.pierceHits++; }
      if (tgt.corrodeT > 0) { mult += (1 - mult) * CORRODE_SHRED; if (st) st.corrodeHits++; }
    }
    d *= mult;
    // 暴击：专用确定性随机流，不扰动 AI 的 Math.random 序列。
    let crit = false;
    if (unitAtk && attacker.critChance > 0 && this._crand() < attacker.critChance) {
      crit = true; d *= attacker.critMul || 1.5;
      if (st) st.critRolls++;
      this._fx('critBurst', tgt.x, (tgt.size ? tgt.size : 2) + 1, tgt.z, { color: 0xffe27f });
    }
    // 侧翼夹击：从目标背后 / 侧后方命中（与目标朝向夹角 > 120°）触发加成。
    if (unitAtk && attacker.flankBonus > 0 && tgt.poison && tgt.heading !== undefined) {
      const ang = Math.atan2(fromZ - tgt.z, fromX - tgt.x);
      let diff = Math.abs(ang - (tgt.heading || 0));
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff > 2.1) { d *= 1 + attacker.flankBonus; if (st) st.flankHits++; }
    }
    // 天气：只削弱真实单位的远程普攻命中，能力 / 危害 / 溅射 / 塔不受影响。
    if (unitAtk && ranged) d *= this._wea().hitMul;
    // 地脉共振：仅战役配置了该机制、且攻击者站在被唤醒的高台上时生效。
    // 遭遇战 resonance 恒 null → 不进入分支、不额外调用 zoneAt，节奏与基线逐字一致。
    if (unitAtk && this.resonance) {
      const q = this.zoneAt(attacker.x, attacker.z);
      if (q && q.resonant) { d *= 1 + this.resonance.bonus; if (st) st.resonanceHits++; }
    }
    // 精炼巢室：全军作战单位 +8% 伤害（双方对等，多座不叠加）。
    if (aSide && this.refined[aSide] && attacker && UNITS[attacker.type] && UNITS[attacker.type].role === 'combat') d *= 1.08;
    tgt.hp -= d;
    // 吸血：按实际结算伤害回复攻击者（不超上限、尸体不回血）。
    if (unitAtk && attacker.lifesteal > 0 && attacker.hp > 0 && attacker.maxHp) {
      const heal = Math.min(d * attacker.lifesteal, attacker.maxHp - attacker.hp);
      if (heal > 0) { attacker.hp += heal; if (st) st.lifestealHp += heal; }
    }
    // 命中附带状态：仅对「存活的真实单位目标」生效。
    if (unitAtk && tgt.poison && tgt.hp > 0) {
      if (attacker.poisonOnHit > 0) {
        const p = tgt.poison;
        p.stacks = Math.min(POISON_MAX_STACKS, p.stacks + 1);
        p.t = POISON_T;
        p.dps = dmg * attacker.poisonOnHit * POISON_STACK_DPS * p.stacks;
        p.src = aSide;
      }
      if (attacker.slowOnHit > 0) {
        tgt.slowT = Math.max(tgt.slowT, 2);
        tgt.slowMul = 1 - attacker.slowOnHit;
        if (st) st.slowHits++;
      }
    }
    // 酸蚀：任何酸属性命中都给单位挂 3 秒破甲（与武器 / 能力文案呼应）。
    if (dtype === 'acid' && tgt.corrodeT !== undefined && tgt.hp > 0) tgt.corrodeT = 3;
    // 只有「真实单位的直接命中」才触发受击动作；DoT / 危害 / 溅射的代理攻击不打断动画。
    if (unitAtk && tgt.animHurt !== undefined && tgt.hp > 0) tgt.animHurt = 0.22;
    if (tgt.flash !== undefined) tgt.flash = 0.16;
    if (tgt.lastAttacker !== undefined) tgt.lastAttacker = aSide;
    // 我方巢室受袭分级告警：跨过 75 / 50 / 25% 各播报一次，混战不刷屏，
    // 也不会让玩家在毫无预警的情况下被推平。用既有 log + ring，不新增事件类型。
    // 建造中的巢室 hp 随进度从 1 起跳，按比例会误判为「濒毁」，故排除。
    if (aSide === SIDES.ENEMY && tgt.side === SIDES.PLAYER && tgt.alarmStep !== undefined
        && tgt.state !== 'constructing' && tgt.hp > 0 && BUILDINGS[tgt.type]) {
      const ratio = tgt.hp / tgt.maxHp;
      const step = ratio <= 0.25 ? 3 : ratio <= 0.5 ? 2 : ratio <= 0.75 ? 1 : 0;
      if (step > tgt.alarmStep) {
        tgt.alarmStep = step;
        this._log(`警报：我方「${BUILDINGS[tgt.type].name}」耐久跌破 ${[0, 75, 50, 25][step]}%，请回防！`, 'bad');
        this._fx('ring', tgt.x, 0.5, tgt.z, { color: 0xff6b5a, r: tgt.size + 3 });
        if (this.stats) this.stats.P.alarms++;
      }
    }
    // 战局统计：实际结算伤害（已含增益、护甲与武器克制）
    if (this.stats) {
      if (aSide && this.stats[aSide]) {
        this.stats[aSide].dmgDealt += d;
        if (mult >= 1.15) this.stats[aSide].critHits++;   // 克制命中次数（战术索敌效果可观测）
      }
      if (tgt.side && this.stats[tgt.side]) this.stats[tgt.side].dmgTaken += d;
    }
    this._emit('dmg', { x: tgt.x, z: tgt.z, amount: Math.max(1, Math.round(d)), victim: tgt.side, atk: aSide,
      y: (tgt.size ? tgt.size : 2) + 1, mult, dtype, armor, crit });
    const y = (tgt.size ? tgt.size : 2) + 1;
    if (ranged) this._fx(this._projFor(dtype), tgt.x, y, tgt.z, { from: { x: fromX, y: 1, z: fromZ }, color: aSide === SIDES.PLAYER ? 0xaef06a : 0xff8a5a, dtype });
    else this._fx('hit', tgt.x, y, tgt.z, { color: 0xffd27f });
    if (attacker && attacker.xp !== undefined) {
      // 过量击杀不按满额伤害刷经验：只有这一发打穿目标时按「实际承伤比例」折算，
      // 未击杀 / 未过量时与原先 dmg*0.4 完全一致，不改变正常升级节奏。
      const before = tgt.hp + d;                  // 结算前剩余血量（tgt.hp 已扣过 d）
      const scale = before > 0 && d > before ? before / d : 1;
      this._gainXp(attacker, dmg * 0.4 * scale);
    }
  }
  // 用伤害类型映射一个弹道特效
  _projFor(dtype) {
    return ({ acid: 'acid', sting: 'sting', pierce: 'bolt', bomb: 'bomb', bite: 'melee', psi: 'psi' })[dtype] || 'bolt';
  }

  _gainXp(u, amt) {
    u.xp += amt;
    while (u.level < MAX_LEVEL && u.xp >= XP_PER_LEVEL[u.level + 1]) {
      u.xp -= XP_PER_LEVEL[u.level + 1];
      u.level++;
      const ratio = u.hp / u.maxHp;
      const e = effectiveUnit(u.type, this.sp[u.side], this.era[u.side], { level: u.level, elite: u.elite });
      u.maxHp = e.hp; u.hp = clamp(e.hp * ratio, 1, e.hp);
      u.dmg = e.dmg;
      this._syncTraits(u);
      this._fx('levelup', u.x, 2, u.z, { color: this.sp[u.side].color });
      if (this.stats && this.stats[u.side]) this.stats[u.side].levelUps++;
      this._levelMilestone(u);
    }
    // 满级后经验不再无限累积：封顶到最高阈值，属性/存档里显示稳定的满经验值
    if (u.level >= MAX_LEVEL) u.xp = Math.min(u.xp, XP_PER_LEVEL[MAX_LEVEL]);
  }

  /** 等级里程碑：界面目前不展示单位等级，而升级在战斗中极频繁。
   *  只在「首只单位达到可进化门槛 Lv.3」与「首只单位满级」各播报一次，避免逐次升级刷屏。 */
  _levelMilestone(u) {
    if (u.side !== SIDES.PLAYER) return;
    if (!this._levelFlags) this._levelFlags = {};
    const key = u.level >= MAX_LEVEL ? 'max' : u.level >= 3 ? 'evo' : null;
    if (!key || this._levelFlags[key]) return;
    this._levelFlags[key] = true;
    this._log(key === 'max'
      ? `老兵诞生：「${UNITS[u.type].name}」达到满级 Lv.${MAX_LEVEL}，成长已至上限。`
      : `老兵诞生：首只「${UNITS[u.type].name}」升至 Lv.3，满足进化等级门槛。`, 'good');
  }

  _reap() {
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (u.hp > 0) continue;
      // 掠夺：任何携带资源的工蚁（陆 / 海 / 空 / 地下）被敌方击杀都应结算。
      // 原先的 `u.type !== 'worker'` 把最常见的陆域工蚁排除在外，只剩三个域工蚁能触发。
      if (u.carrying > 0 && u.lastAttacker && u.lastAttacker !== u.side) {
        const raid = 0.45 + this.sp[u.lastAttacker].mods.mobility * 0.40;
        const gain = Math.round(u.carrying * raid);
        if (gain > 0) {
          this.gainRes(u.lastAttacker, u.carryRes, gain);
          if (this.stats && this.stats[u.lastAttacker]) {
            this.stats[u.lastAttacker].raided += gain;
            this.stats[u.lastAttacker].raids++;
          }
          // 混战中工蚁阵亡密集：播报 6s 节流，但特效 / 统计每次照常结算
          if (this.time - this._lastRaidLogAt >= 6) {
            this._lastRaidLogAt = this.time;
            const mine = u.lastAttacker === SIDES.PLAYER;
            const txt = mine
              ? `掠夺成功：截获敌方工蚁携带的 ${gain} ${RESOURCES[u.carryRes].short}！`
              : `我方运粮工蚁被截获，损失 ${gain} ${RESOURCES[u.carryRes].short}。`;
            this._log(txt, mine ? 'good' : 'bad');
          }
          this._fx('ring', u.x, 0.4, u.z, { color: 0xffd27f });
        }
      }
      if (this.stats) {
        this.stats[u.side].losses++;
        const killer = u.lastAttacker;
        if (killer && killer !== u.side && this.stats[killer]) {
          this.stats[killer].kills++;
          this._killMilestone(killer, this.stats[killer].kills);
        }
      }
      this._setAnim(u, 'death');   // 死亡演出快照拿到终态，B 侧 _dying 可直接读 u.anim
      this._fx('death', u.x, 1.2, u.z, { color: this.sp[u.side].color });
      this._emit('death', { side: u.side, kind: 'unit', x: u.x, z: u.z });
      this.units.splice(i, 1);
      this.selected.delete(u.id);
    }
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      const b = this.buildings[i];
      if (b.hp > 0) continue;
      if (this.stats) {
        this.stats[b.side].losses++;
        const killer = b.lastAttacker;
        if (killer && killer !== b.side && this.stats[killer]) this.stats[killer].kills++;
      }
      this._fx('death', b.x, b.size, b.z, { color: 0x8a7f56 });
      this._emit('death', { side: b.side, kind: 'building', x: b.x, z: b.z });
      const cost = BUILDINGS[b.type].cost || {};
      const total = (cost.bio || 0) + (cost.min || 0);
      const bounty = Math.round(total * 0.3);
      if (bounty > 0) {
        if (b.lastAttacker && b.lastAttacker !== b.side) {
          this.gainRes(b.lastAttacker, 'bio', bounty);
          this._log(`摧毁「${BUILDINGS[b.type].name}」并掠夺 ${bounty} 生物质！`, b.lastAttacker === SIDES.PLAYER ? 'good' : 'bad');
        } else {
          this._log(`${b.side === SIDES.PLAYER ? '我方' : '敌方'}「${BUILDINGS[b.type].name}」被摧毁。`, 'bad');
        }
      }
      // 在建 / 在制 / 研究中的投入随建筑损毁一并损失，给一句明确交代（原先只报摧毁，投入静默蒸发）
      if (b.side === SIDES.PLAYER) {
        const lost = [];
        if (b.state === 'constructing') lost.push('建造进度');
        if (b.queue.length) lost.push(`${b.queue.length} 项生产队列`);
        if (b.research) lost.push('纪元研究');
        if (lost.length) this._log(`「${BUILDINGS[b.type].name}」损毁，${lost.join('、')}一并损失。`, 'bad');
      }
      this.buildings.splice(i, 1);
      if (this.selectedBuilding === b.id) this.selectedBuilding = null;
    }
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const ob = this.obstacles[i];
      if (ob.hp > 0) continue;
      this._fx('death', ob.x, ob.r, ob.z, { color: ob.kind === 'log' ? 0x6b4a2a : 0x9a9a93 });
      this._emit('destroy', { id: ob.id, x: ob.x, z: ob.z, kind: ob.kind });
      this.obstacles.splice(i, 1);
    }
  }

  _tickHazards(dt) {
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      // 延时型危害（钻地突袭）：先埋伏倒计时，到点一次性结算；期间不造成持续伤害、不消耗 t（避免提前移除）
      if (h.delay && h.delay > 0) {
        h.delay -= dt;
        if (h.delay <= 0) {
          this._dmgRadius(h.x, h.z, h.r, h.dmg, h.owner, h.dtype);
          this._fx(h.fx, h.x, 1, h.z, { color: 0x8a7f56 });
        }
        continue;
      }
      h.t -= dt; h.accum += dt;
      if (h.accum >= 0.25) {
        h.accum = 0;
        const enemy = h.owner === SIDES.PLAYER ? SIDES.ENEMY : SIDES.PLAYER;
        for (const u of this.units) {
          if (u.side === h.owner || u.hp <= 0 || !this.isTargetable(u)) continue;
          if (dist(u.x, u.z, h.x, h.z) <= h.r) {
            this._dealDamage({ side: h.owner }, u, h.dps * 0.25, h.x, h.z, true, h.dtype);
            if (h.slow > 0) { u.buff.spd = Math.min(u.buff.spd, 1 - h.slow); u.buff.t = Math.max(u.buff.t, 0.3); }
          }
        }
        for (const b of this.buildings) {
          if (b.side === h.owner || b.state === 'constructing') continue;
          if (dist(b.x, b.z, h.x, h.z) <= h.r + b.size * 0.5) this._dealDamage({ side: h.owner }, b, h.dps * 0.25, h.x, h.z, true, h.dtype);
        }
      }
      if (h.t <= 0) this.hazards.splice(i, 1);
    }
  }

  /** 静态危害地块：熔岩 / 酸池，双方单位与建筑驻留其中持续受灼（战役特定章节）。
   *  用「中立代理」走 _dealDamage 统一口径，故不会给任何一方刷击杀/经验，也不触发我方告警。
   *  按 TERRAIN_TICK 节流结算，避免每帧对每个单位全表扫描刷伤害事件。 */
  _tickTerrain(dt) {
    if (!this.terrainHazards.length) return;
    for (const h of this.terrainHazards) {
      h.accum += dt;
      if (h.accum < TERRAIN_TICK) continue;
      const step = h.accum; h.accum = 0;
      h.fxAcc = (h.fxAcc || 0) + step;
      const showFx = h.fxAcc >= 1;
      if (showFx) h.fxAcc = 0;
      const dtype = h.type === 'lava' ? 'bomb' : 'acid';
      const neutral = h.type === 'lava' ? 'E' : 'P';   // 归属仅用于 dtype 与色泽，不产生阵营收益
      for (const u of this.units) {
        if (u.hp <= 0 || !this.isTargetable(u)) continue;
        if (u.domain === 'air') continue;               // 空域单位不触地，免疫地面危害
        if (dist(u.x, u.z, h.x, h.z) <= h.r + (u.size || 1)) {
          this._dealDamage({ side: neutral }, u, h.dps * step, h.x, h.z, true, dtype);
          if (dtype === 'acid' && u.corrodeT !== undefined) u.corrodeT = 3;
        }
      }
      for (const b of this.buildings) {
        if (b.hp <= 0 || b.state === 'constructing') continue;
        if (dist(b.x, b.z, h.x, h.z) <= h.r + b.size * 0.5) this._dealDamage({ side: neutral }, b, h.dps * step, h.x, h.z, true, dtype);
      }
      if (showFx) this._fx('ring', h.x, 0.4, h.z, { color: h.type === 'lava' ? 0xff7a3a : 0x9fe06a, r: h.r });
    }
  }

  _checkEnd() {
    const pHQ = this.buildings.find(b => b.side === SIDES.PLAYER && b.type === 'hq');
    const eHQ = this.buildings.find(b => b.side === SIDES.ENEMY && b.type === 'hq');
    const win = (reason) => {
      if (this.ended) return;
      this.ended = 'win';
      this._log(`作战目标达成：${reason}`, 'key');
      this._emit('end', { type: 'win', mode: this.mode, chapter: this.chapter, objective: this.objective ? this.objective.type : 'destroy', reason });
    };
    // 摧毁敌方蚁后巢永远是最高优先级胜利条件（所有目标共享）
    if (!eHQ) { win('敌方蚁后巢已被摧毁'); return; }
    if (!pHQ) { this.ended = 'lose'; this._emit('end', { type: 'lose', mode: this.mode, chapter: this.chapter }); return; }
    const o = this.objective;
    if (!o || o.type === 'destroy') return;   // 默认目标：逐字保持原判定
    if (o.type === 'survive') {
      // 存活到时限：只需蚁后巢还在（前面已确认 pHQ 存在）
      if (this.time >= o.surviveT) win(`在敌方攻势下守住 ${o.surviveT} 秒`);
    } else if (o.type === 'harvest') {
      const got = this.stats ? this.stats.P.harvested : 0;
      if (got >= o.harvestGoal) win(`累计采集 ${Math.round(got)} 生物质`);
    } else if (o.type === 'dominate') {
      const all = this.wells.length > 0 && this.wells.every(w => w.owner === SIDES.PLAYER);
      const dt = Math.max(0, this.time - (o._lastCheckT == null ? this.time : o._lastCheckT));
      o.holdT = all ? o.holdT + dt : 0;
      if (o.holdT >= o.dominateHold) win(`占领全部信息素井并守住 ${o.dominateHold} 秒`);
    }
    if (this.objective) this.objective._lastCheckT = this.time;
  }
  /** 目标进度（供 B 侧 HUD 只读显示，不新增事件类型） */
  objectiveProgress() {
    const o = this.objective;
    if (!o || o.type === 'destroy') return { type: 'destroy', label: o ? o.label : '', ratio: 0 };
    let ratio = 0;
    if (o.type === 'survive') ratio = clamp(this.time / o.surviveT, 0, 1);
    else if (o.type === 'harvest') ratio = clamp((this.stats ? this.stats.P.harvested : 0) / o.harvestGoal, 0, 1);
    else if (o.type === 'dominate') ratio = clamp(o.holdT / o.dominateHold, 0, 1);
    return { type: o.type, label: o.label, ratio };
  }

  // ------------------------------------------------------------ 经济细化
  /** 资源贸易：按固定比价把一种资源换成另一种（含 20% 折损）。
   *  仅在玩家侧可用；用于「生多矿少」时的应急调剂，不改变自动采集与造价。 */
  commandTrade(from, to, amount = 100) {
    if (from === to || !RES_ORDER.includes(from) || !RES_ORDER.includes(to)) return 0;
    const RATE = { bio: 1, min: 2.2, ph: 3.0 };   // 相对价值：矿 / 信息素更贵
    const n = Math.max(0, Math.floor(amount));
    if (!n || this.res_(SIDES.PLAYER, from) < n) { this._toast('可用于贸易的资源不足'); return 0; }
    const out = Math.max(1, Math.floor(n * RATE[from] / RATE[to] * 0.8));
    this.res.P[from] -= n; this.gainRes(SIDES.PLAYER, to, out);
    this.tradeDone++;
    this._log(`贸易：${n} ${RESOURCES[from].short} → ${out} ${RESOURCES[to].short}（含折损）。`, 'info');
    this._fx('ring', PLAYER_BASE.x, 1, PLAYER_BASE.z, { color: 0xffe27f, r: 8 });
    return out;
  }
  /** 卵孵化加速：消耗信息素，立刻把指定建筑队列首项的剩余时间压缩一半。 */
  commandBoostHatch(buildingId) {
    const b = this.getBuilding(buildingId);
    if (!b || b.side !== SIDES.PLAYER || !b.queue || !b.queue.length) return false;
    const cost = 12;
    if (this.res_(SIDES.PLAYER, 'ph') < cost) { this._toast('信息素不足，无法催孵'); return false; }
    this.res.P.ph -= cost;
    b.queue[0].t *= 0.5;
    this._fx('ring', b.x, 0.5, b.z, { color: 0xd98ad0, r: b.size });
    this._toast(`催孵成功：「${BUILDINGS[b.type].name}」生产提速。`);
    return true;
  }
  /** 精炼状态（供 B 侧只读）：该族群是否已建成精炼巢室。 */
  isRefined(side = SIDES.PLAYER) { return !!this.refined[side]; }

  // -------------------------------------------------------------- 敌方 AI
  _tickAI(dt) {
    const ai = this._ai;
    const E = SIDES.ENEMY;
    const eb = this.buildings.filter(b => b.side === E);
    const hq = eb.find(b => b.type === 'hq');
    if (!hq) return;
    const diff = ai.diff, arch = ai.arch;
    this._aiDefenseCheck(dt, hq);
    this._aiRepairCheck(dt);
    const workers = this.units.filter(u => u.side === E && u.type === 'worker');
    const soldiers = this.units.filter(u => u.side === E && u.type !== 'worker');
    const bio = this.res.E.bio, min = this.res.E.min, ph = this.res.E.ph;
    // 资源预留：建造计划下一项 + 研究纪元，二者取大，避免被爆兵掏空而无法升纪元
    let resBio = 0, resMin = 0;
    if (ai.buildIdx < ai.buildPlan.length) {
      const nc = BUILDINGS[ai.buildPlan[ai.buildIdx]].cost || {};
      resBio = nc.bio || 0; resMin = nc.min || 0;
    }
    if (this.era[E] < MAX_ERA && eb.some(b => b.type === 'tech')) {
      resBio = Math.max(resBio, researchCost(this.sp[E], this.era[E]) + 80);
    }

    ai.buildTimer -= dt;
    if (ai.buildTimer <= 0 && ai.buildIdx < ai.buildPlan.length) {
      ai.buildTimer = 9 * diff.thinkMul * arch.buildSpeed;
      const type = ai.buildPlan[ai.buildIdx];
      const cost = BUILDINGS[type].cost || {};
      if (this.canAfford(E, cost) && !eb.some(b => b.type === type)) {
        const off = this._aiBuildPos(type);
        if (this._makeAIBuilding(type, off.x, off.z)) ai.buildIdx++;
      }
    }

    ai.prodTimer -= dt;
    if (ai.prodTimer <= 0) {
      ai.prodTimer = 2.4 * diff.thinkMul;
      const workerCap = arch.expandBias > 1.2 ? 11 : 8;
      if (workers.length < workerCap && hq.queue.length === 0 && bio > 60 + resBio) {
        const e = effectiveUnit('worker', this.sp[E], this.era[E]);
        if (bio >= e.cost.bio) { this.spend(E, { bio: e.cost.bio }); hq.queue.push({ type: 'worker', t: e.build }); }
      }
      const sig = ARCHETYPE_UNITS[this.archetype.id];
      for (const b of eb) {
        if (b.state !== 'idle' || !BUILDINGS[b.type].produces) continue;
        const avail = BUILDINGS[b.type].produces.filter(t => this.era[E] >= UNITS[t].tech);
        if (!avail.length || b.queue.length >= 3) continue;
        let ut = avail[avail.length - 1];
        // 兵营优先产出性格专属兵种（玩家不可造，仅对应性格敌方）。
        // 保证性：达到专属兵种纪元后，先强制补足配额（sigTarget），其后保持 ~45% 比例混编。
        if (b.type === 'barracks' && sig && this.era[E] >= UNITS[sig].tech) {
          const sigTarget = 5 + Math.floor(this.era[E] * 1.5);
          if (ai.sigCount < sigTarget || Math.random() < 0.45) ut = sig;
        }
        const cost = effectiveCost(ut, this.sp[E]);
        if (this.canAfford(E, cost) && bio > resBio + 30 && this.pop(E) < 100 && Math.random() < diff.armyMul) {
          this.spend(E, cost); b.queue.push({ type: ut, t: UNITS[ut].build });
          if (ut === sig) ai.sigCount++;
        }
      }
    }

    ai.researchTimer -= dt;
    if (ai.researchTimer <= 0) {
      ai.researchTimer = 28 * diff.thinkMul * (ai.techDelay || 1);
      const tech = eb.find(b => b.type === 'tech' && b.state === 'idle');
      if (tech && !tech.research && this.era[E] < MAX_ERA && bio > researchCost(this.sp[E], this.era[E]) + 80) {
        this.res.E.bio -= researchCost(this.sp[E], this.era[E]);
        tech.research = { t: 12, era: this.era[E] + 1 };
      }
    }

    ai.abilityTimer -= dt;
    if (ai.abilityTimer <= 0 && soldiers.length > 4) {
      ai.abilityTimer = (20 + Math.random() * 8) * diff.thinkMul;
      if (Math.random() < arch.abilityUse) {
        const smart = diff.abilitySmart || 0;
        // 基础候选：2 增益 + 3 主攻（easy/normal 逐字保持旧列表，零平衡影响）。
        // hard 专属的「涡卷 / 俯冲轰炸」采用隔轮置顶轮换：每轮 abilityTimer 至多放 1 个且 break 即止，
        // 若把专属能力固定排在增益之后，a_frenzy 几乎总是先成功 → 专属能力永远饿死。
        // 奇数轮把一枚专属能力提到队首，偶数轮回到常规组合，两个专属能力交替上场；
        // 相位计数不用 Math.random，保证固定随机流 A/B 不受污染。
        const extraAbilities = diff.aiAbilities || [];
        let cand = ['a_frenzy', 'a_rally', 'a_bomb', 'a_venom', 'a_acidpool'];
        if (extraAbilities.length) {
          ai.abilityPhase = (ai.abilityPhase || 0) + 1;
          if (ai.abilityPhase % 2 === 1) {
            const lead = extraAbilities[Math.floor(ai.abilityPhase / 2) % extraAbilities.length];
            cand = [lead, ...cand];
          }
        }
        for (const k of cand) {
          // 先筛冷却与信息素，避免「选好落点却放不出来」白算一次
          if ((this.cd[E][k] || 0) > 0 || this.res_(E, 'ph') < (ABILITIES[k].cost || 0)) continue;
          let pt;
          if (smart > 0) {
            const offensive = AI_OFFENSIVE_ABILITIES.has(k);
            const pool = offensive
              ? this.units.filter(u => u.side === SIDES.PLAYER && u.type !== 'worker')
              : soldiers;
            // 进攻类没有敌方目标就不浪费信息素；增益类用己方最密集簇
            pt = offensive && !pool.length ? null : this._bestCluster(pool, offensive ? 9 : 12);
          } else {
            const army = soldiers.filter(s => dist(s.x, s.z, PLAYER_BASE.x, PLAYER_BASE.z) < 60);
            pt = army.length ? army[Math.floor(Math.random() * army.length)] : soldiers[0];
          }
          if (pt && this.castAbility(E, k, pt.x, pt.z)) {
            if (smart > 0 && this.stats) this.stats[E].smartCasts++;
            break;
          }
        }
      }
    }

    // 防御/增益智能（仅 hard 经 aiDefensive 开启）：军团受损时施放甲壳硬化减伤，
    // 平时机会性补纪元共鸣增伤。独立计时器，不挤占进攻节奏；easy/normal 的 aiDefensive=0 → 整段跳过。
    ai.defAbilityTimer -= dt;
    if (ai.defAbilityTimer <= 0 && (diff.aiDefensive || 0) > 0 && soldiers.length > 3) {
      ai.defAbilityTimer = 22 * diff.thinkMul;   // 固定间隔，避免额外消费种子 RNG 干扰 A/B 对比
      const armyHp = soldiers.reduce((a, s) => a + s.hp, 0);
      const armyMax = soldiers.reduce((a, s) => a + s.maxHp, 0);
      const hurt = armyHp < armyMax * 0.82;
      const order = hurt ? ['a_harden', 'a_resonance'] : ['a_resonance', 'a_harden'];
      for (const k of order) {
        if ((this.cd[E][k] || 0) > 0 || this.res_(E, 'ph') < (ABILITIES[k].cost || 0)) continue;
        const c = this._bestCluster(soldiers, 12);
        if (c && this.castAbility(E, k, c.x, c.z)) {
          if (this.stats) this.stats[E].smartCasts++;
          break;
        }
      }
    }

    // 进化：达到条件的兵种进化
    for (const s of soldiers) {
      const def = UNITS[s.type];
      if (def.evolveTo && s.level >= def.evo.level && this.era[E] >= def.evo.era && min >= def.evo.min) {
        this.spend(E, { min: def.evo.min });
        const to = def.evolveTo, e = effectiveUnit(to, this.sp[E], this.era[E], { level: s.level, elite: false });
        s.type = to; s.caste = e.caste; s.domain = e.domain; s.armor = e.armor; s.ability = e.ability;
        s.maxHp = e.hp; s.hp = e.hp; s.dmg = e.dmg; s.speed = e.speed; s.range = e.range; s.atkcd = e.atkcd; s.melee = e.melee; s.dtype = e.dtype; s.splash = e.splash; s.xp = 0;
      }
    }

    ai.attackTimer -= dt;
    const reqNow = ai.soldierReq + Math.floor((arch.expandBias - 1) * 4);
    if (ai.attackTimer <= 0 && soldiers.filter(s => s.order !== 'manual').length >= reqNow) {
      const [lo, hi] = arch.attackInterval;
      // 持续波次档拉长组波间隔，避免「每 20s 全军压上」把对局在 100s 内打完
      ai.attackTimer = (lo + Math.random() * (hi - lo)) * diff.thinkMul * (1 + 0.6 * ai.waveReinforce);
      if (this.stats) this.stats[E].waves++;
      // 波次门槛：原先误取 arch.soldierReqMax（undefined）→ NaN，使 `>= reqNow` 恒假，
      // AI 首波后不再组织进攻。现在改为显式难度配置：
      //   waveReinforce=0 → 置 Infinity 保持「只发首波」的既有节奏（不再依赖 NaN 这种隐式行为）；
      //   >0 → 固定为「起征兵力 + 2×强度」的稳定目标，攒够就发、战损后自动重新攒兵，
      //         不做逐波递增（递增会让兵力越打越少时永久卡在过高门槛上）。
      ai.soldierReq = ai.waveReinforce > 0
        ? Math.min(ai.soldierReqMax, arch.soldierReq[0] + 2 * ai.waveReinforce)
        : Infinity;
      // 持续波次档留 20% 离巢最近的兵力作预备队，避免全军压上后老家空虚、战损一次性耗尽。
      // 默认档 waveReinforce=0 → holdN=0，派遣逻辑与原先逐字一致。
      const wave = soldiers.filter(s => s.order !== 'manual' && !(s.defendUntil > this.time));
      const holdN = ai.waveReinforce > 0
        ? Math.max(0, Math.min(wave.length - 1, Math.ceil(wave.length * 0.2 * ai.waveReinforce))) : 0;
      const hold = new Set();
      if (holdN > 0) {
        const byHome = [...wave].sort((a, b) => dist(a.x, a.z, hq.x, hq.z) - dist(b.x, b.z, hq.x, hq.z));
        for (let k = 0; k < holdN; k++) hold.add(byHome[k].id);
      }
      for (const s of soldiers) {
        if (s.order === 'manual' || s.defendUntil > this.time) continue;   // 回防中的单位不被进攻波次覆盖
        s.state = 'attackmove'; s.order = 'auto';
        s.target = hold.has(s.id)
          ? { x: hq.x, z: hq.z }                       // 预备队回巢守家
          : { x: PLAYER_BASE.x, z: PLAYER_BASE.z };
      }
      this._emit('aiAttack', {});
    }
  }

  /** 找密度最高的簇心：返回半径 r 内同伴最多的那个单位的位置。
   *  AI 能力落点专用，规模 <=100、约 20s 调用一次，O(n²) 可接受。 */
  _bestCluster(list, r = 9) {
    if (!list.length) return null;
    let best = list[0], bestN = -1;
    for (const c of list) {
      let n = 0;
      for (const o of list) if (dist(c.x, c.z, o.x, o.z) <= r) n++;
      if (n > bestN) { bestN = n; best = c; }
    }
    return best;
  }

  /** 基地回防：玩家战斗单位逼近敌方蚁后巢时，按难度灵敏度抽调离巢最近的兵力回救。
   *  4s 评估一次 + 12s 指派锁，避免与进攻波次互相拉扯导致来回震荡。 */
  _aiDefenseCheck(dt, hq) {
    const ai = this._ai;
    const sens = (ai.diff && ai.diff.defense) || 0;
    if (sens <= 0) return;
    ai.defTimer -= dt;
    if (ai.defTimer > 0) return;
    // 灵敏度越低评估越迟钝（蛰伏 ~8.5s / 回响 4s），配合警戒半径与抽调比例形成三级手感
    ai.defTimer = 4 + (1 - sens) * 6;
    const E = SIDES.ENEMY;
    const R = 24 + 34 * sens;
    const threats = this.units.filter(u => u.side === SIDES.PLAYER && u.type !== 'worker' && dist(u.x, u.z, hq.x, hq.z) < R);
    if (!threats.length) { ai.defending = false; return; }
    const pool = this.units.filter(u => u.side === E && u.type !== 'worker'
      && u.order !== 'manual' && !(u.defendUntil > this.time));
    const need = Math.min(pool.length, Math.max(2, Math.ceil(threats.length * sens * 0.8)));
    if (!need) return;
    let cx = 0, cz = 0;
    for (const t of threats) { cx += t.x; cz += t.z; }
    cx /= threats.length; cz /= threats.length;
    const near = pool.sort((a, b) => dist(a.x, a.z, hq.x, hq.z) - dist(b.x, b.z, hq.x, hq.z)).slice(0, need);
    for (const s of near) {
      s.state = 'attackmove'; s.order = 'auto';
      s.target = { x: cx, z: cz };
      s.defendUntil = this.time + 12;
    }
    ai.defending = true;
    if (this.stats) this.stats[E].defenses++;
  }

  /** 敌方后勤维修：巢室/箭塔受损时按难度抽调少量工蚁抢修。
   *  玩家侧仍完全由 assignRepair / commandRepair 手动驱动，这里只补 AI 侧缺失的行为。
   *  严格限流（4s 评估、全场最多 2 只、只修 55% 血以下、工蚁>=6、矿物>=20、
   *  只挑空载工蚁避免丢货），避免战线拉扯时工蚁反复离岗拖垮敌方经济。 */
  _aiRepairCheck(dt) {
    const ai = this._ai;
    const r = ai.repair || 0;
    if (r <= 0) return;
    ai.repairTimer -= dt;
    if (ai.repairTimer > 0) return;
    ai.repairTimer = 4;
    const E = SIDES.ENEMY;
    const cap = Math.ceil(2 * r) + (r >= 1 ? 1 : 0);   // hard 额外多 1 只预备队（normal r=0.5 → ceil(1)+0=1，不变）
    const busy = this.units.filter(u => u.side === E && u.state === 'repair').length;
    if (busy >= cap) return;
    const workers = this.units.filter(u => u.side === E && UNITS[u.type].role === 'econ');
    if (workers.length < 6 || this.res_(E, 'min') < 20) return;
    const damaged = this.buildings
      .filter(b => b.side === E && b.state === 'idle' && b.hp < b.maxHp * 0.55)
      .sort((a, b) => (b.type === 'hq') - (a.type === 'hq') || (a.hp / a.maxHp) - (b.hp / b.maxHp));
    if (!damaged.length) return;
    const pick = damaged[0];
    const assigned = this.units.filter(u => u.repairId === pick.id).length;
    const want = pick.type === 'hq' ? cap : 1;
    const n = Math.min(cap - busy, want - assigned);
    if (n <= 0) return;
    const cands = workers.filter(u => u.repairId == null && u.state !== 'repair' && u.carrying === 0)
      .sort((a, c) => dist(a.x, a.z, pick.x, pick.z) - dist(c.x, c.z, pick.x, pick.z))
      .slice(0, n);
    for (const u of cands) {
      u.waypoints = []; u.repairId = pick.id; u.state = 'repair'; u.order = 'auto';
      u.target = { x: pick.x, z: pick.z }; u.burrowed = false;
      if (this.stats) this.stats[E].repairs++;
    }
    if (cands.length) this._fx('ring', pick.x, 0.4, pick.z, { color: 0xffb070 });
  }

  _bestTier(side) {
    let t = 0;
    for (let i = 0; i < ['s1', 's2', 's3'].length; i++) if (this.era[side] >= UNITS[['s1', 's2', 's3'][i]].tech) t = i;
    return t;
  }

  _aiBuildPos(type) {
    const b = ENEMY_BASE;
    const map = {
      nursery: { x: 12, z: -10 }, barracks: { x: -14, z: -8 },
      tower: { x: 16, z: 4 }, tech: { x: 0, z: -16 },
      seanest: { x: -20, z: -4 }, airnest: { x: 20, z: -4 }, ugnest: { x: 0, z: -22 },
    };
    const o = map[type] || { x: 0, z: -12 };
    return { x: clamp(b.x + o.x, -HALF_W + 6, HALF_W - 6), z: clamp(b.z + o.z, -HALF_H + 6, HALF_H - 6) };
  }

  // 育幼室多座叠加加速：每多一座育幼室，工蚁（经济兵种）产能 +25%。
  _workerSpeedMul(side) {
    const n = this.buildings.filter(b => b.side === side && b.type === 'nursery').length;
    return 1 + 0.25 * Math.max(0, n - 1);
  }

  _makeAIBuilding(type, x, z) {
    for (const ex of this.buildings) {
      if (ex.side === SIDES.ENEMY && dist(x, z, ex.x, ex.z) < (ex.size + BUILDINGS[type].size) * 0.7) return false;
    }
    this._makeBuilding(SIDES.ENEMY, type, x, z, false);
    return true;
  }
}
