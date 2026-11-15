import {Simulation} from './MVP_Web/js/sim.js';
const rows=[];
const original=Math.random;
try{for(const difficulty of ['easy','normal','hard'])for(let j=0;j<10;j++){
 let seed=20261114+j;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const s=new Simulation();s.reset('SP01',{mode:'campaign',chapter:0,difficulty});
 for(let i=0;i<1800&&!s.ended;i++)s.tick(.05);
 rows.push({difficulty,seed:20261114+j,time:+s.time.toFixed(2),ended:s.ended,harvested:s.stats.E.harvested,pop:s.pop('E'),towers:s.buildings.filter(b=>b.side==='E'&&b.type==='tower'&&b.hp>0).length,waves:s.stats.E.waves});
}}finally{Math.random=original;}
console.log(JSON.stringify({method:'Chapter 1 unmodified initial setup, full tick, passive player; 90s or terminal. harvested is credited income after multiplier; pop is total population including workers. No injected C1/C3 armies.',rows},null,2));
