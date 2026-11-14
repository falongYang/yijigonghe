// Isolated combat: no campaign difficulty inference. Costs are bio + min.
import {Simulation} from './MVP_Web/js/sim.js';
import {UNITS,BUILDINGS} from './MVP_Web/js/rts.js';
const value=t=>Object.values((UNITS[t]||BUILDINGS[t]).cost).reduce((a,b)=>a+b,0);
const scale=Number(process.env.ATTACK_COST_SCALE||1);
for(const t of ['aA','aB','uA'])for(const key of Object.keys(UNITS[t].cost))UNITS[t].cost[key]=Math.round(UNITS[t].cost[key]*scale);
const original=Math.random, rows=[];
try {
for(const difficulty of ['easy','normal','hard']) for(const seed0 of [20261114,20261115,20261116]) for(const scenario of ['C1','C2','C3']) {
 const s=new Simulation();s.reset('SP01',{difficulty});let seed=seed0;
 Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 s._ai=null;s.units=[];s.buildings=[];s.obstacles=[];
 const atk=scenario==='C3'?['uA','uA','uA','uA','uA','uA','uA']:['aA','aA','aA','aB','aB'];
 const def=scenario==='C1'?['s2','s2','s2','sB']:scenario==='C2'?['s3','s3','s1','s1','s1']:['s3','s3','s1'];
 if(scale!==1||process.argv.includes("--budget")){const pattern=[...atk];atk.length=0;let spent=0;for(let i=0;i<100;i++){const t=pattern[i%pattern.length];if(spent+value(t)>1000)break;atk.push(t);spent+=value(t);}}
 atk.forEach((t,i)=>s._makeUnit('P',t,20+i%2,(Math.floor(i/2)-1)*2));
 def.forEach((t,i)=>s._makeUnit('E',t,i%2,(Math.floor(i/2)-1)*2));
 if(scenario!=='C2')s._makeBuilding('E','tower',0,0,true);
 const entities=[...s.units,...s.buildings], cost=side=>entities.filter(e=>e.side===side).reduce((a,e)=>a+value(e.type),0);
 let reveals=0;const seen=new Set();let elapsed=0;
 for(let i=0;i<1800;i++){
  elapsed=(i+1)*.05;s.time+=.05;s._updateDetection(.05);
  for(const u of s.units)if(u.revealed&&!seen.has(u.id)){seen.add(u.id);reveals++;}
  for(const b of s.buildings)if(b.hp>0)s._tickBuilding(b,.05);
  s._tickProjectiles(.05);for(const u of s.units)if(u.hp>0)s._tickUnit(u,.05);s._tickTracers(.05);
  if(['P','E'].some(side=>!entities.some(e=>e.side===side&&e.hp>0)))break;
 }
 const loss=side=>entities.filter(e=>e.side===side&&e.hp<=0).reduce((a,e)=>a+value(e.type),0);
 rows.push({difficulty,seed:seed0,scenario,attackerRoster:atk,defenderRoster:[...def,...(scenario==='C2'?[]:['tower'])],survivors:{attacker:entities.filter(e=>e.side==='P'&&e.hp>0).length,defender:entities.filter(e=>e.side==='E'&&e.hp>0).length},attackerBudget:cost('P'),defenderBudget:cost('E'),attackerLoss:loss('P'),defenderLoss:loss('E'),R:loss('P')?loss('E')/loss('P'):loss('E')?'Infinity':null,reveals,seconds:+elapsed.toFixed(2),timeout:elapsed>=90});
 Math.random=original;
}
const s=new Simulation();s.reset('SP01');s.units=[];const u=s._makeUnit('P','uA',30,0);u.burrowed=true;s.commandMove([u.id],0,0);const move=u.burrowed;u.burrowed=true;s.commandAttackMove([u.id],0,0);
console.log(JSON.stringify({method:{baseline:'52c7562; current working-tree costs when --budget',geometry:'attacker x20/21 z -2/0/2/4; defender x0/1 z-2/0/2; tower0,0',species:'reset SP01 defaults; no artificial burrow movement',timeout:'90 seconds; unfinished battle fails combat completion; no inferred campaign result',cost:'base bio+min; --budget repeats roster pattern until next unit exceeds 1000; fixed defender; tower 190 <= 1000/3'},burrowCommands:{moveKeepsBurrow:move,attackMoveKeepsBurrow:u.burrowed},rows},null,2));
}finally{Math.random=original;}
