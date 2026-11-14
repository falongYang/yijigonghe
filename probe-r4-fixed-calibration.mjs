import assert from 'node:assert/strict';
// 线一（固定阵容强度校准）：阵容死锁，只动强度参数，造价用 52c7562 基线值计价。
// 用法: node r4-fixed-roster-probe.mjs [towerDmgMul]
import { Simulation } from './MVP_Web/js/sim.js';
import { UNITS, BUILDINGS } from './MVP_Web/js/rts.js';

// 仓库当前造价已被 5e63e90 改过，这里按基线还原，R 才与 R3 可比。
const BASE_COST = {
  aA: { bio: 120, min: 30 }, aB: { bio: 210, min: 60 }, uA: { bio: 110, min: 20 },
};
for (const [t, c] of Object.entries(BASE_COST)) UNITS[t].cost = { ...c };

const abHp = Number(process.env.AB_HP || 0);
if (abHp) UNITS.aB.hp = abHp;

const value = t => Object.values((UNITS[t] || BUILDINGS[t]).cost).reduce((a, b) => a + b, 0);
const towerMul = Number(process.argv[2] ?? 1);
const original = Math.random;

function run(scenario, seed0, difficulty = 'normal') {
  const s = new Simulation();
  s.reset('SP01', { difficulty });
  let seed = seed0;
  Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  s._ai = null; s.units = []; s.buildings = []; s.obstacles = [];

  const atk = scenario === 'C3' ? ['uA','uA','uA','uA','uA','uA','uA'] : ['aA','aA','aA','aB','aB'];
  const def = scenario === 'C1' ? ['s2','s2','s2','sB'] : ['s3','s3','s1'];
  atk.forEach((t, i) => s._makeUnit('P', t, 20 + i % 2, (Math.floor(i / 2) - 1) * 2));
  def.forEach((t, i) => s._makeUnit('E', t, i % 2, (Math.floor(i / 2) - 1) * 2));
  const tower = process.argv[3] === "notower" ? null : s._makeBuilding("E", "tower", 0, 0, true);
  if (tower?.attack) tower.attack.dmg = tower.attack.dmg * towerMul;
  const hpMul = Number(process.env.TOWER_HP_MUL || 1);
  if (tower && hpMul !== 1) { tower.maxHp = Math.round(tower.maxHp * hpMul); tower.hp = tower.maxHp; }

  const entities = [...s.units, ...s.buildings];
  const cost = side => entities.filter(e => e.side === side).reduce((a, e) => a + value(e.type), 0);
  let elapsed = 0;
  for (let i = 0; i < 1800; i++) {
    elapsed = (i + 1) * 0.05; s.time += 0.05; s._updateDetection(0.05);
    for (const b of s.buildings) if (b.hp > 0) s._tickBuilding(b, 0.05);
    s._tickProjectiles(0.05);
    for (const u of s.units) if (u.hp > 0) s._tickUnit(u, 0.05);
    s._tickTracers(0.05);
    if (['P','E'].some(side => !entities.some(e => e.side === side && e.hp > 0))) break;
  }
  const loss = side => entities.filter(e => e.side === side && e.hp <= 0).reduce((a, e) => a + value(e.type), 0);
  Math.random = original;
  const lossA = loss('P'), lossD = loss('E');
  return {
    scenario, seed: seed0, towerDmgMul: towerMul,
    atkBudget: cost('P'), defBudget: cost('E'),
    atkLoss: lossA, defLoss: lossD,
    R: lossA ? +(lossD / lossA).toFixed(3) : (lossD ? 'Infinity' : null),
    survivors: {
      atk: entities.filter(e => e.side === 'P' && e.hp > 0).length,
      def: entities.filter(e => e.side === 'E' && e.hp > 0).length,
    },
    seconds: +elapsed.toFixed(2),
  };
}

const rows = [];
for (const sc of ['C1','C3']) for (const seed of [20261114,20261115,20261116]) {
  try { rows.push(run(sc, seed)); } catch (err) { rows.push({ scenario: sc, seed, error: String(err?.message || err) }); }
}
console.log(JSON.stringify({ towerMul, rows }, null, 2));

if(towerMul===1&&!process.env.AB_HP&&!process.env.TOWER_HP_MUL&&!process.argv[3]){for(const r of rows){assert.ok(!r.error);assert.ok(r.seconds<90);assert.ok(r.defLoss>0&&r.atkLoss>0);assert.ok(r.scenario==='C1'?r.R>0.15:r.R>=0.6&&r.R<=1.6);}}
