import assert from 'node:assert/strict';
import {Simulation} from './MVP_Web/js/sim.js';
const original=Math.random;
const quantile=(a,p)=>{a=[...a].sort((x,y)=>x-y);const n=(a.length-1)*p;return a[Math.floor(n)]+(a[Math.ceil(n)]-a[Math.floor(n)])*(n%1);};
const rows=[];
try {
for(const difficulty of ['easy','normal','hard'])for(let j=0;j<30 && rows.filter(r=>r.difficulty===difficulty&&r.sample==="90s").length<10;j++){
 let rng=20261114+j;Math.random=()=>((rng=(Math.imul(rng,1664525)+1013904223)>>>0)/4294967296);
 const s=new Simulation();s.reset('SP01',{mode:'campaign',chapter:0,difficulty});
 const placements=[];const make=s._makeAIBuilding.bind(s);s._makeAIBuilding=(type,x,z)=>{const ok=make(type,x,z);if(ok){const b=s.buildings.at(-1);placements.push({type,x:b.x,z:b.z,drift:Math.hypot(b.x-x,b.z-z)});}return ok;};
 for(let i=0;i<1800&&!s.ended;i++)s.tick(.05);
 rows.push({difficulty,seed:20261114+j,time:+s.time.toFixed(2),sample:s.time>=89.999?'90s':'early-terminal',ended:s.ended,harvested:s.stats.E.harvested,pop:s.pop('E'),towers:s.buildings.filter(b=>b.side==='E'&&b.type==='tower'&&b.hp>0).length,waves:s.stats.E.waves,buildIdx:s._ai.buildIdx,placements});
}
const ab=[];
for(const [armyMul,thinkMul] of [[1,1],[2,1],[1,.5]]){
 Math.random=()=>.5;const s=new Simulation();s.reset('SP01',{mode:'campaign',chapter:0,difficulty:'normal'});
 s._ai.diff={...s._ai.diff,armyMul,thinkMul};
 assert.equal(s._ai.prodTimer,2); // first decision intentionally has a fixed 2-second grace
 s._ai.prodTimer=0;s._tickAI(.05);
 const expected=2.4*thinkMul/armyMul;assert.equal(s._ai.prodTimer,expected);
 let cycles=0;for(let i=0;i<200;i++){const before=s._ai.prodTimer;s._tickAI(.05);if(s._ai.prodTimer>before)cycles++;}
 ab.push({armyMul,thinkMul,resetInterval:expected,decisionCyclesIn10s:cycles});
}
assert.ok(ab[1].decisionCyclesIn10s>ab[0].decisionCyclesIn10s);assert.ok(ab[2].decisionCyclesIn10s>ab[0].decisionCyclesIn10s);
const summary={};for(const d of ['easy','normal','hard']){const valid=rows.filter(r=>r.difficulty===d&&r.sample==='90s');summary[d]={n:valid.length,earlyTerminal:rows.filter(r=>r.difficulty===d&&r.sample==='early-terminal').length};for(const key of ['harvested','pop','towers','waves'])summary[d][key]=valid.length?[quantile(valid.map(r=>r[key]),.25),quantile(valid.map(r=>r[key]),.75)]:null;}
console.log(JSON.stringify({method:'Chapter1 passive player, full tick; early terminal samples excluded from 90s quartiles and retained separately. prodTimer initialization is fixed 2s, subsequent decision intervals receive difficulty multipliers. A/B measures decision cadence, not resource-limited completed production.',ab,summary,rows},null,2));
}finally{Math.random=original;}
