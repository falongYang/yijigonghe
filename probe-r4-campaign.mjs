import { Simulation } from './MVP_Web/js/sim.js';
import { UNITS, BUILDINGS } from './MVP_Web/js/rts.js';
const rows=[];
for(const scenario of ['C1','C3']) for(const difficulty of ['easy','normal','hard']) for(const seed0 of [20261114,20261115,20261116]) {
 let seed=seed0; const original=Math.random;
 Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 try {
 const s=new Simulation(); s.reset('SP01',{mode:'campaign',chapter:0,difficulty});
 const hq=s.buildings.find(b=>b.side==='E'&&b.type==='hq');
 const atk=scenario==='C1'?['aA','aA','aA','aB','aB']:Array(7).fill('uA');
 const def=scenario==='C1'?['s2','s2','s2','sB']:['s3','s3','s1'];
 const ids=[];
 atk.forEach((t,i)=>{const u=s._makeUnit('P',t,hq.x+20+i%2,hq.z+(Math.floor(i/2)-1)*2);ids.push(u.id);});
 def.forEach((t,i)=>s._makeUnit('E',t,hq.x+i%2,hq.z+(Math.floor(i/2)-1)*2));
 s._makeBuilding('E','tower',hq.x,hq.z,true);
 s.commandAttackMove(ids,hq.x,hq.z);
 const loss={P:0,E:0},seen=new Set();
 const reap=s._reap;
 s._reap=function(){for(const e of [...this.units,...this.buildings])if(e.hp<=0&&!seen.has(e.id)){seen.add(e.id);const c=(UNITS[e.type]||BUILDINGS[e.type]).cost;loss[e.side]+=Object.values(c).reduce((a,b)=>a+b,0);}return reap.call(this);};
 for(let i=0;i<1800&&!s.ended;i++)s.tick(.05);
 rows.push({scenario,difficulty,seed:seed0,seconds:+s.time.toFixed(2),ended:s.ended,atkLoss:loss.P,defLoss:loss.E,R:loss.P?+(loss.E/loss.P).toFixed(3):null});
 }finally{Math.random=original;}
}
console.log(JSON.stringify({method:'Chapter 1 full campaign, initial economy/units/map/AI retained. Fixed added C1/C3 rosters near enemy HQ, player attack-move. All sides losses including campaign reinforcements counted at base bio+min cost; 90s or campaign end. Not isolated or equal-budget combat.',rows},null,2));
