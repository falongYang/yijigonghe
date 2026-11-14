import assert from 'node:assert/strict';
// R3 C1/C2/C3 造价口径交战探针（项目负责人交叉核对）
// 只读引用 yijigonghe/sim.js，不写仓库。
// 口径：双方预算各 1000 造价（bio+min）；塔 ≤ 防守预算 1/3；
//       R = 防守方损失造价 ÷ 进攻方损失造价；90 模拟秒超时；每档 3 个种子。
// 实验控制：reset 之后再设种子（reset 内 AI 初始化的随机抽取次数随难度变化，先设种子会把三档错位）。
import { Simulation } from './MVP_Web/js/sim.js';

const COST = { s1: 95, s2: 170, s3: 320, sB: 240, aA: 150, aB: 270, uA: 130 };
const TOWER = 190, BUDGET = 1000, DT = 0.05, TIMEOUT = 90;
const ARMY = {
  air:      ['aA', 'aA', 'aA', 'aB', 'aB'],                 // 990
  burrow:   ['uA', 'uA', 'uA', 'uA', 'uA', 'uA', 'uA'],     // 910
  counter:  { tower: 1, units: ['s2', 's2', 's2', 'sB'] },  // 940
  melee:    { tower: 0, units: ['s3', 's3', 's1', 's1', 's1'] }, // 925
  towerLine:{ tower: 1, units: ['s3', 's3', 's1'] },        // 925
};
const costOf = l => l.reduce((a, t) => a + COST[t], 0);

const seedWith = seed => {
  const orig = Math.random; let s = seed >>> 0;
  Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  return () => { Math.random = orig; };
};
const ring = (sim, side, list, cx, cz) => list.forEach((t, i) => {
  const a = (i / list.length) * Math.PI * 2, r = 3.5 + (i % 3) * 1.6;
  sim._makeUnit(side, t, cx + Math.cos(a) * r, cz + Math.sin(a) * r);
});
const step = sim => {
  sim.time += DT; sim._updateDetection(DT);
  for (const b of sim.buildings) if (b.hp > 0) sim._tickBuilding(b, DT);
  sim._tickProjectiles(DT);
  for (const u of sim.units) if (u.hp > 0) sim._tickUnit(u, DT);
  sim._tickTracers(DT);
};
const alive = (sim, s) => sim.units.filter(u => u.side === s && u.hp > 0);
const lostCost = (sim, s) => sim.units.filter(u => u.side === s && u.hp <= 0).reduce((a, u) => a + (COST[u.type] || 0), 0) + sim.buildings.filter(b => b.side === s && b.hp <= 0).reduce((a, b) => a + (b.type === 'tower' ? TOWER : 0), 0);
const lostMap = (sim, s) => { const m = {}; for (const u of sim.units) if (u.side === s && u.hp <= 0) m[u.type] = (m[u.type] || 0) + 1; return m; };

function run(sc, difficulty, seed, symmetric) {
  const sim = new Simulation();
  sim.reset('SP01', { difficulty });
  sim._ai = null;   // 中性化敌方位 AI 索敌权重，让双方用同一套最近目标逻辑
  if (symmetric) sim.sp.E = sim.sp.P;
  const restore = seedWith(seed);
  try {
    sim.units = []; sim.buildings = []; sim.obstacles = [];
    let def, atk, tower;
    if (sc === 'C1') { def = ARMY.counter.units; tower = 1; atk = ARMY.air; }
    if (sc === 'C2') { def = ARMY.melee.units; tower = 0; atk = ARMY.air; }
    if (sc === 'C3') { def = ARMY.towerLine.units; tower = 1; atk = ARMY.burrow; }
    ring(sim, 'P', def, 0, 0);
    if (tower) sim._makeBuilding('P', 'tower', 0, 0, true);
    // 进攻方从 40 外进场：C3 潜行队先潜行推进，其余直接压上
    ring(sim, 'E', atk, 40, 0);
    if (sc === 'C3') sim.commandAttackMove(alive(sim,'E').map(u=>u.id),0,0,{formation:false});
    else for (const u of alive(sim, 'E')) { u.state = 'move'; u.order = 'auto'; u.target = { x: 0, z: 0 }; }

    const rev = new Set();
    let firstReveal = null;
    let ticks = 0;
    for (; ticks < TIMEOUT / DT; ticks++) {
      step(sim);
      for (const u of sim.units) {
        if (u.side === 'E' && u.hp > 0 && u.revealed) {
          if (!rev.has(u.id)) { rev.add(u.id); if (firstReveal === null) firstReveal = { t: +sim.time.toFixed(2), dist: +Math.hypot(u.x, u.z).toFixed(1) }; }
        }
      }
      if (!alive(sim, 'P').length || !alive(sim, 'E').length) break;
    }
    const dL = lostCost(sim, 'P'), aL = lostCost(sim, 'E');
    return {
      sc, difficulty, seed, symmetric,
      defBudget: costOf(def) + tower * TOWER, atkBudget: costOf(atk),
      t: +sim.time.toFixed(1), timeout: ticks >= TIMEOUT / DT - 1,
      defLoss: dL, defLossPct: +(dL / (costOf(def) + tower * TOWER) * 100).toFixed(1),
      atkLoss: aL, atkLossPct: +(aL / costOf(atk) * 100).toFixed(1),
      R: aL ? +(dL / aL).toFixed(2) : (dL ? '∞' : null),
      defSurv: alive(sim, 'P').length, atkSurv: alive(sim, 'E').length,
      defLost: lostMap(sim, 'P'), atkLost: lostMap(sim, 'E'),
      revealed: rev.size, firstReveal,
      towerDmg: tower ? Math.round(sim.stats.P.dmgTaken) : null,
      towerHp: tower ? (sim.buildings.find(b=>b.type==='tower')?.hp ?? 0) : null,
    };
  } finally { restore(); }
}

const seeds = [20261114, 20261115, 20261116];
const rows = [];
for (const sc of ['C1', 'C2', 'C3'])
  for (const d of ['normal'])
    for (const s of seeds) rows.push(run(sc, d, s, false));
// 对照臂：双方同种，剥离 SP01/SP03 品种差
for (const sc of ['C1', 'C3']) rows.push(run(sc, 'normal', 20261114, true));

const med = a => { const x = [...a].sort((p, q) => p - q); return x[Math.floor(x.length / 2)]; };
for (const sc of ['C1', 'C2', 'C3']) {
  const rs = rows.filter(r => r.sc === sc && !r.symmetric);
  const fin = rs.map(r => r.R).filter(v => typeof v === 'number');
  console.log(sc, '| R:', rs.map(r => r.R).join(','), '| median:', fin.length ? med(fin) : '∞/undef',
    '| defLoss%:', rs.map(r => r.defLossPct).join(','), '| atkLoss%:', rs.map(r => r.atkLossPct).join(','),
    '| revealed:', rs.map(r => r.revealed).join(','), '| t:', rs.map(r => r.t).join(','));
}
for (const r of rows.filter(x => x.symmetric)) console.log('SYM', r.sc, 'R', r.R, 'defLoss', r.defLoss, 'atkLoss', r.atkLoss);
for(const sc of ['C1','C2','C3']) console.log('DETAIL', JSON.stringify(rows.find(r => r.sc === sc && r.difficulty==='normal' && r.seed === 20261114 && !r.symmetric)));

console.log("RAW", JSON.stringify(rows));

for(const r of rows.filter(r=>r.sc==='C3')){assert.equal(r.revealed,7);assert.ok(r.firstReveal.dist>22 && r.firstReveal.dist<=26,'tower must reveal before underground aggro');}
