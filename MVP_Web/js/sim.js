/* RTS 模拟层 v2 —— 武器 / 能力 / 成长 / 资源 / 四域环境
 * 单位·建筑·资源节点·采集卸货·建造出兵·纪元研究·四域作战·能力施放·
 * 经验升级与进化·敌方 AI·资源掠夺·胜负判定。纯逻辑 + 事件，渲染由 world.js 镜像。
 */
import { SPECIES_BY_ID } from './data.js';
import {
  MAP, HALF_W, HALF_H, SIDES, START_BIO, START_MIN, START_PH,
  RESOURCES, RES_ORDER, DOMAINS, DOMAIN_ORDER, WEAPONS, DMG_TYPES, ARMOR_TYPES,
  ARMOR_MULT, ABILITIES, BUILDINGS, BUILD_ORDER, UNITS, UNIT_ORDER,
  XP_PER_LEVEL, MAX_LEVEL, LEVEL_HP, LEVEL_DMG, ELITE_HP, ELITE_DMG,
  SPECIALTY, specialtyOf, rtsMods, effectiveUnit, effectiveCost,
  effectiveBuilding, effectiveBuildingCost, researchCost, ERA_NAMES, MAX_ERA, canEngage, pickEnemySpecies, dmgMult,
  ENEMY_ARCHETYPES, DIFFICULTY, CAMPAIGN, applyArchetype, applyDifficulty,
  getMapConfig, SKIRMISH_MAP, ARCHETYPE_UNITS,
  terrainHeight, TERRAIN, mapZones, mapWells, mapObstacles, zoneAt, WELL,
} from './rts.js';

const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const HARVEST_RANGE = 3.6;
const REPAIR_RATE = 11;          // 每只工蚁每秒修复的耐久
const REPAIR_MIN_PER_HP = 0.25;  // 每点耐久消耗的矿物
const REPAIR_RANGE = 3.2;
const DEPOSIT_RANGE = 8.5;
const GATHER_RATE = 10;       // 每秒采集量（再生资源场，故适度下调以保证可再生）
const AGGRO = 22;             // 自动索敌半径
const PLAYER_BASE = { x: 0, z: HALF_H * 0.62 };
const ENEMY_BASE = { x: 0, z: -HALF_H * 0.62 };
const BURROW_IDLE_SPEED = 1.45;          // 潜行提速

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
  }

  on(fn) { this.listeners.push(fn); }
  _emit(type, payload = {}) { for (const fn of this.listeners) fn(type, payload); }
  _log(text, kind = 'info') { this._emit('log', { text, kind }); }
  _toast(text) { this._emit('toast', { text }); }
  _fx(type, x, y, z, opts = {}) { this.effects.push({ type, pos: { x, y, z }, opts }); }

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
    const blank = () => ({ kills: 0, losses: 0, built: 0, harvested: 0, abilities: 0, evolved: 0, raided: 0, repaired: 0, wellPh: 0, dmgDealt: 0, dmgTaken: 0 });
    this.stats = { P: blank(), E: blank() };
    this.map = getMapConfig(mode, chapter);
    // 战术地形与信息素井用同一套确定性配置生成：模拟、3D 渲染与小地图读取的都是这一份。
    this.zones = mapZones(this.map);
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
    this._emit('reset', { mode: this.mode, chapter: this.chapter, archetype: this.archetype.id, difficulty: this.difficulty.id });
    this._updateVision();
  }

  // ----------------------------------------------------------- 地图资源（四域）
  _initNodes() {
    const cfg = this.map || SKIRMISH_MAP;
    for (const n of cfg.nodes) {
      // 资源点为可再生场：regen 使被采空的点在约 16s 内回满，避免双方经济在开局一分钟内枯竭。
      this.nodes.push({ id: this.nextId++, x: n.x, z: n.z, amount: n.amt, max: n.amt, domain: n.domain, res: n.res, regen: n.amt * 0.06,
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
    // 记录单位脚下地貌，供 3D 状态环 / 属性卡读取（渲染与逻辑共用同一判定）
    u.terrain = q ? q.type : 'plain';
    if (!q) return 1;
    if (q.type === 'mire') return (u.domain === 'air' || u.domain === 'underground') ? 1 : TERRAIN.mire.speed;
    if (q.type === 'water') {
      if (u.domain === 'sea') return 1.10;
      if (u.domain === 'air' || u.domain === 'underground') return 1;
      return TERRAIN.water.speed;
    }
    return TERRAIN[q.type] ? TERRAIN[q.type].speed : 1;
  }
  /** 站在高台上的远程单位射程 +18%（近战不享受）。 */
  _terrainRangeMul(u) {
    if (u.melee) return 1;
    const q = this.zoneAt(u.x, u.z);
    return q && q.type === 'ridge' ? TERRAIN.ridge.range : 1;
  }

  /** 侦测视野（轻量战争迷雾）：敌方单位 / 建筑仅在己方视野半径内可见，
   *  超视距则隐藏（不影响逻辑，只影响渲染与小地图）。敌方蚁后巢始终可见，作为胜利目标。 */
  _updateVision() {
    if (!this.units.length) return;
    const sources = [];
    for (const u of this.units) {
      if (u.side !== SIDES.PLAYER) continue;
      if (u.domain === 'underground' && u.burrowed) continue;   // 潜行单位不提供视野
      sources.push({ x: u.x, z: u.z, r: u.domain === 'air' ? 42 : 30 });
    }
    for (const b of this.buildings) {
      if (b.side !== SIDES.PLAYER) continue;
      sources.push({ x: b.x, z: b.z, r: b.type === 'hq' ? 50 : 44 });
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
        this.gainRes(w.owner, 'ph', WELL.rate * dt);
        if (this.stats && this.stats[w.owner]) this.stats[w.owner].wellPh += WELL.rate * dt;
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
    const plan = ['nursery', 'barracks', 'tech', nestByDomain[spec] || 'tower'];
    for (let i = 0; i < towers; i++) plan.push('tower');
    const aint = arch.attackInterval;
    this._ai = {
      spec,
      nest: nestByDomain[spec] || 'barracks',
      arch, diff,
      buildPlan: plan,
      buildIdx: 0, buildTimer: 5 * diff.thinkMul * arch.buildSpeed,
      prodTimer: 2, researchTimer: 18 * diff.thinkMul, abilityTimer: 16 * diff.thinkMul,
      attackTimer: aint[0] * diff.thinkMul + 10,   // +10s 首波宽限，避免开局即被压
      attackInterval: aint, soldierReq: arch.soldierReq[0], soldierReqMax: arch.soldierReq[1],
      abilityUse: arch.abilityUse, expandBias: arch.expandBias,
      sigCount: 0,
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
      carryCap: e.carry, carryRes: 'bio', carrying: 0,
      level: opts.level || 1, elite: !!opts.elite, xp: 0, accent, sig,
      state: 'idle', target: null, waypoints: [], nodeId: null, homeId: null,
      heading: Math.random() * 6.28, moving: false, atkTimer: 0,
      order: 'auto', lastAttacker: null, burrowed: false, phase: Math.random() * 6.28,
      buff: { dmg: 1, tank: 1, spd: 1, t: 0 },
    };
    this.units.push(u);
    if (base.role === 'econ') this._assignHarvest(u);
    return u;
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

  nearestNode(x, z, domain, minAmount = 1) {
    let best = null, bd = Infinity;
    for (const n of this.nodes) {
      if (n.amount < minAmount) continue;
      if (domain && n.domain !== domain) continue;
      const d = dist(x, z, n.x, n.z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  nearestDepot(side, x, z) {
    const ds = this.depots(side);
    let best = null, bd = Infinity;
    for (const b of ds) { const d = dist(x, z, b.x, b.z); if (d < bd) { bd = d; best = b; } }
    return best;
  }

  _assignHarvest(u) {
    const dom = UNITS[u.type].domain;
    const n = this.nearestNode(u.x, u.z, dom, 1);
    if (!n) { u.state = 'idle'; return; }
    u.nodeId = n.id; u.state = 'harvest'; u.order = 'auto'; u.target = { x: n.x, z: n.z };
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
    const tag = q && TERRAIN[q.type] ? ` · ${TERRAIN[q.type].name}${q.type === 'ridge' ? '（远程射程 +18%）' : ''}` : '';
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
    if (this.pop(SIDES.PLAYER) >= 110) { this._toast('人口已达上限'); return false; }
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
      case 'a_dive': this._dmgRadius(x, z, 7, 42, side, 'bite'); this._fx('dive', x, 6, z, { color: 0xffd27f }); break;
      case 'a_bomb': this._dmgRadius(x, z, 9, 34, side, 'bomb'); this._fx('bomb', x, 5, z, { color: 0xff9a5a }); break;
      case 'a_burrow': this._dmgRadius(x, z, 7, 30, side, 'pierce'); this._fx('ambush', x, 0.4, z, { color: 0x8a7f56 }); break;
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
  _addHazard(x, z, r, dps, owner, dtype, slow, t, fx) { this.hazards.push({ x, z, r, dps, owner, dtype, slow, t, fx, accum: 0 }); }
  _dmgRadius(x, z, r, dmg, owner, dtype) {
    for (const u of this.units) { if (u.side === owner) continue; if (dist(u.x, u.z, x, z) <= r + (u.size || 0)) this._dealDamage({ side: owner }, u, dmg, x, z, true, dtype); }
    for (const b of this.buildings) { if (b.side === owner || b.state === 'constructing') continue; if (dist(b.x, b.z, x, z) <= r + b.size * 0.5) this._dealDamage({ side: owner }, b, dmg, x, z, true, dtype); }
  }

  /** 多选阵型：按近似方阵分散落点，避免整队挤在同一坐标上互相推挤。 */
  _formationPoint(i, n, x, z) {
    if (n <= 1) return { x, z };
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const gap = 3.6;
    const ox = ((i % cols) - (cols - 1) / 2) * gap;
    const oz = (Math.floor(i / cols) - (rows - 1) / 2) * gap;
    return { x: clamp(x + ox, -HALF_W + 3, HALF_W - 3), z: clamp(z + oz, -HALF_H + 3, HALF_H - 3) };
  }

  /** 移动指令。opts.append=true 时把落点追加到路径队列（Shift+右键），单位依次走完。 */
  commandMove(ids, x, z, opts = {}) {
    const n = ids.length;
    ids.forEach((id, i) => {
      const u = this.getUnit(id); if (!u) return; u.repairId = null;
      const p = opts.formation === false ? { x, z } : this._formationPoint(i, n, x, z);
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
      const p = opts.formation === false ? { x, z } : this._formationPoint(i, n, x, z);
      u.waypoints = []; u.state = 'attackmove'; u.order = 'manual'; u.target = p;
      if (u.domain === 'underground') u.burrowed = false;
    });
  }
  commandHarvest(ids, nodeId) {
    const n = this.nodes.find(x => x.id === nodeId);
    for (const id of ids) { const u = this.getUnit(id); if (!u || u.type === 'worker' === false && UNITS[u.type].role !== 'econ') continue; if (n) { u.repairId = null; u.nodeId = n.id; u.state = 'harvest'; u.order = 'manual'; u.target = { x: n.x, z: n.z }; } }
  }
  commandStop(ids) { for (const id of ids) { const u = this.getUnit(id); if (!u) continue; u.repairId = null; u.state = 'idle'; u.order = 'auto'; u.target = null; u.waypoints = []; } }

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
  /** 维修进行中：靠近后按秒消耗矿物恢复耐久；修满 / 矿耗尽 / 建筑损毁即回归采集。 */
  _repair(u, dt) {
    const b = this.getBuilding(u.repairId);
    if (!b || b.state === 'constructing' || b.hp >= b.maxHp - 0.5) { this._endRepair(u); return; }
    const d = dist(u.x, u.z, b.x, b.z) - b.size * 0.5;
    if (d > REPAIR_RANGE) { this._moveTo(u, b.x, b.z, dt); return; }
    const heal = Math.min(REPAIR_RATE * dt, b.maxHp - b.hp);
    const cost = heal * REPAIR_MIN_PER_HP;
    if (this.res_(SIDES.PLAYER, 'min') < cost) {
      if (this.time - (this._repairWarnT || -9) > 2) { this._repairWarnT = this.time; this._toast('矿物耗尽，维修中止'); }
      this._endRepair(u); return;
    }
    this.res.P.min -= cost;
    b.hp = Math.min(b.maxHp, b.hp + heal);
    b.repairGlow = 0.8;
    if (this.stats) this.stats.P.repaired += heal;
    u.repairAcc = (u.repairAcc || 0) + dt;
    if (u.repairAcc > 0.45) {
      u.repairAcc = 0;
      this._fx('ring', b.x, 0.4, b.z, { color: 0xffd27f, r: b.size * 0.6 });
    }
    if (b.hp >= b.maxHp - 0.5) {
      this._log(`「${BUILDINGS[b.type].name}」维修完成，耐久已恢复。`, 'good');
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
    for (const u of this.units) this._tickUnit(u, dt);
    this._tickHazards(dt);
    this._reap();
    this._tickEcho();
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
    if (b.phGen) this.gainRes(b.side, 'ph', b.phGen * dt);
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
      b.cooldown -= dt;
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
    }
  }

  _autoUnit(u, dt) {
    if (UNITS[u.type].role === 'econ') { this._assignHarvest(u); return; }
    const t = this._nearestEnemyEntity(u.side, u.x, u.z, AGGRO);
    if (t) { u.target = { id: t.id, x: t.x, z: t.z }; u.state = 'attack'; if (u.domain === 'underground') u.burrowed = false; }
  }

  _harvest(u, dt) {
    let n = this.nodes.find(x => x.id === u.nodeId);
    if (!n || n.amount <= 0) {
      const dom = UNITS[u.type].domain;
      const nn = this.nearestNode(u.x, u.z, dom, 1);
      if (nn) { u.nodeId = nn.id; u.target = { x: nn.x, z: nn.z }; }
      else { u.state = 'idle'; return; }
      n = this.nodes.find(x => x.id === u.nodeId);
    }
    if (dist(u.x, u.z, n.x, n.z) > HARVEST_RANGE) {
      this._moveTo(u, n.x, n.z, dt);
    } else {
      const take = Math.min(GATHER_RATE * dt, u.carryCap - u.carrying, n.amount);
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
      const nn = this.nearestNode(u.x, u.z, UNITS[u.type].domain, 1);
      if (nn) { u.nodeId = nn.id; u.state = 'harvest'; u.target = { x: nn.x, z: nn.z }; }
      else u.state = 'idle';
    }
  }

  _attack(u, dt) {
    const tgt = u.target && (this.getUnit(u.target.id) || this.getBuilding(u.target.id) || this.getObstacle(u.target.id));
    if (!tgt) { u.state = u.order === 'manual' ? 'idle' : 'auto'; u.target = null; return; }
    if (u.domain === 'underground') u.burrowed = false;
    const r = (tgt.r ? tgt.r : (tgt.size ? tgt.size * 0.5 : 0));   // 障碍用半径作为停火距离
    const reach = u.range * this._terrainRangeMul(u) + r;   // 高台上的远程单位射程更远
    if (dist(u.x, u.z, tgt.x, tgt.z) > reach) {
      this._moveTo(u, tgt.x, tgt.z, dt);
    } else if (u.atkTimer <= 0) {
      this._dealDamage(u, tgt, u.dmg, u.x, u.z, !u.melee, u.dtype);
      u.atkTimer = u.atkcd;
    }
  }

  _attackMove(u, dt) {
    const tgt = this._nearestEnemyEntity(u.side, u.x, u.z, AGGRO + 6);
    if (tgt) { u.target = { id: tgt.id, x: tgt.x, z: tgt.z }; u.state = 'attack'; return; }
    if (u.target) this._moveTo(u, u.target.x, u.target.z, dt, () => { u.state = 'idle'; u.order = 'auto'; });
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
    let sp = u.speed * u.buff.spd * (u.burrowed ? BURROW_IDLE_SPEED : 1) * this._terrainSpeedMul(u);
    const step = sp * dt;
    u.x = clamp(u.x + vx * step, -HALF_W + 2, HALF_W - 2);
    u.z = clamp(u.z + vz * step, -HALF_H + 2, HALF_H - 2);
    u.heading = Math.atan2(vz, vx);
    u.moving = true;
  }

  _nearestEnemyEntity(side, x, z, radius, opts = {}) {
    const enemy = side === SIDES.PLAYER ? SIDES.ENEMY : SIDES.PLAYER;
    let best = null, bd = radius;
    for (const u of this.units) {
      if (u.side !== enemy) continue;
      if (!this.isTargetable(u)) continue;
      if (opts.combatOnly && u.type === 'worker') continue;
      const d = dist(x, z, u.x, u.z);
      if (d < bd) { bd = d; best = u; }
    }
    for (const b of this.buildings) {
      if (b.side !== enemy || b.state === 'constructing') continue;
      const d = dist(x, z, b.x, b.z) - b.size * 0.5;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  _dealDamage(attacker, tgt, dmg, fromX, fromZ, ranged, dtype) {
    const aSide = attacker && attacker.side ? attacker.side : null;
    const armor = tgt.armor || (BUILDINGS[tgt.type] ? 'chitin' : 'soft');
    let d = dmg;
    if (aSide) d *= this.aura[aSide].dmg;
    if (tgt.buff) d *= tgt.buff.tank;
    const mult = dmgMult(dtype, armor);
    d *= mult;
    tgt.hp -= d;
    if (tgt.flash !== undefined) tgt.flash = 0.16;
    if (tgt.lastAttacker !== undefined) tgt.lastAttacker = aSide;
    // 战局统计：实际结算伤害（已含增益、护甲与武器克制）
    if (this.stats) {
      if (aSide && this.stats[aSide]) this.stats[aSide].dmgDealt += d;
      if (tgt.side && this.stats[tgt.side]) this.stats[tgt.side].dmgTaken += d;
    }
    this._emit('dmg', { x: tgt.x, z: tgt.z, amount: Math.max(1, Math.round(d)), victim: tgt.side, atk: aSide,
      y: (tgt.size ? tgt.size : 2) + 1, mult, dtype, armor });
    const y = (tgt.size ? tgt.size : 2) + 1;
    if (ranged) this._fx(this._projFor(dtype), tgt.x, y, tgt.z, { from: { x: fromX, y: 1, z: fromZ }, color: aSide === SIDES.PLAYER ? 0xaef06a : 0xff8a5a, dtype });
    else this._fx('hit', tgt.x, y, tgt.z, { color: 0xffd27f });
    if (attacker && attacker.xp !== undefined) this._gainXp(attacker, dmg * 0.4);
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
      this._fx('levelup', u.x, 2, u.z, { color: this.sp[u.side].color });
    }
  }

  _reap() {
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (u.hp > 0) continue;
      if (u.type !== 'worker' && u.carrying > 0 && u.lastAttacker && u.lastAttacker !== u.side) {
        const raid = 0.45 + this.sp[u.lastAttacker].mods.mobility * 0.40;
        const gain = Math.round(u.carrying * raid);
        this.gainRes(u.lastAttacker, u.carryRes, gain);
        if (this.stats && this.stats[u.lastAttacker]) this.stats[u.lastAttacker].raided += gain;
        this._log(`掠夺成功：截获敌方工蚁携带的 ${gain} ${RESOURCES[u.carryRes].short}！`, u.lastAttacker === SIDES.PLAYER ? 'good' : 'bad');
        this._fx('ring', u.x, 0.4, u.z, { color: 0xffd27f });
      }
      if (this.stats) {
        this.stats[u.side].losses++;
        const killer = u.lastAttacker;
        if (killer && killer !== u.side && this.stats[killer]) this.stats[killer].kills++;
      }
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
      h.t -= dt; h.accum += dt;
      if (h.accum >= 0.25) {
        h.accum = 0;
        const enemy = h.owner === SIDES.PLAYER ? SIDES.ENEMY : SIDES.PLAYER;
        for (const u of this.units) {
          if (u.side === h.owner || !this.isTargetable(u)) continue;
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

  _checkEnd() {
    const pHQ = this.buildings.find(b => b.side === SIDES.PLAYER && b.type === 'hq');
    const eHQ = this.buildings.find(b => b.side === SIDES.ENEMY && b.type === 'hq');
    if (!eHQ) { this.ended = 'win'; this._emit('end', { type: 'win', mode: this.mode, chapter: this.chapter }); }
    else if (!pHQ) { this.ended = 'lose'; this._emit('end', { type: 'lose', mode: this.mode, chapter: this.chapter }); }
  }

  // -------------------------------------------------------------- 敌方 AI
  _tickAI(dt) {
    const ai = this._ai;
    const E = SIDES.ENEMY;
    const eb = this.buildings.filter(b => b.side === E);
    const hq = eb.find(b => b.type === 'hq');
    if (!hq) return;
    const diff = ai.diff, arch = ai.arch;
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
      ai.researchTimer = 28 * diff.thinkMul;
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
        const army = soldiers.filter(s => dist(s.x, s.z, PLAYER_BASE.x, PLAYER_BASE.z) < 60);
        const pt = army.length ? army[Math.floor(Math.random() * army.length)] : soldiers[0];
        const cand = ['a_frenzy', 'a_rally', 'a_bomb', 'a_venom', 'a_acidpool'];
        for (const k of cand) if (this.castAbility(E, k, pt.x, pt.z)) break;
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
      ai.attackTimer = (lo + Math.random() * (hi - lo)) * diff.thinkMul;
      ai.soldierReq = Math.min(arch.soldierReqMax, ai.soldierReq + 2);
      for (const s of soldiers) { if (s.order === 'manual') continue; s.state = 'attackmove'; s.order = 'auto'; s.target = { x: PLAYER_BASE.x, z: PLAYER_BASE.z }; }
      this._emit('aiAttack', {});
    }
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
