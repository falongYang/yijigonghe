// Seeded unattended campaigns exercise all chapters/difficulties. No win-rate claim.
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {Simulation} from './MVP_Web/js/sim.js';
const originalRandom=Math.random;let seed=12345,ticks=0;
Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const start=performance.now();
try {
 for(let chapter=0;chapter<6;chapter++)for(const difficulty of ['easy','normal','hard']){
  const s=new Simulation();s.reset(`SP0${chapter+1}`,{mode:'campaign',chapter,difficulty});
  for(let frame=0;frame<3600&&!s.ended;frame++){
   s.tick(.05);ticks++;
   assert.ok(s.units.every(u=>[u.x,u.z,u.hp,u.atkTimer].every(Number.isFinite)),'finite unit state');
   assert.ok(s.projectiles.every(p=>Number.isFinite(p.remaining)),'finite projectiles');
   assert.ok(Object.values(s.res).every(r=>Object.values(r).every(n=>Number.isFinite(n)&&n>=-1e-6)),'finite nonnegative economy');
   assert.ok(s.wells.every(w=>Number.isFinite(w.progress)&&Math.abs(w.progress)<=1),'bounded capture progress');
   assert.ok(s.nodes.every(n=>Number.isFinite(n.amount)&&n.amount>=-1e-6),'bounded resource stock');
  }
  console.log(`PASS chapter ${chapter+1} / ${difficulty}: ${s.time.toFixed(1)}s, ${s.ended||'active'}, units=${s.units.length}`);
 }
 console.log(`18 campaigns, ${ticks} ticks, ${Math.round(performance.now()-start)}ms; state invariants passed`);
} finally {Math.random=originalRandom;}
