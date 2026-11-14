// Controlled engagements, not campaign win rates. Manual stepping avoids victory/AI economy side effects.
import assert from 'node:assert/strict';
import {Simulation} from './MVP_Web/js/sim.js';
const results=[];
for (const difficulty of ['easy','normal','hard']) for (const scenario of ['air-v-melee','air-v-counter','burrow-v-tower']) {
 const random=Math.random;let seed=20261114;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 try {
  const s=new Simulation();s.reset('SP01',{difficulty});s.units=[];s.buildings=[];s.obstacles=[];
  const atk=scenario==='burrow-v-tower'?'uA':'aA';
  for(let i=0;i<4;i++)s._makeUnit('P',atk,8+i%2,(i>>1)*2);
  for(let i=0;i<4;i++)s._makeUnit('E',scenario==='air-v-counter'?'s2':'s3',i%2,(i>>1)*2);
  if(scenario!=='air-v-melee')s._makeBuilding('E','tower',0,0,true);
  for(let i=0;i<800;i++){
   s.time+=.05;s._updateDetection(.05);
   for(const b of s.buildings)if(b.hp>0)s._tickBuilding(b,.05);
   s._tickProjectiles(.05);
   for(const u of s.units)if(u.hp>0)s._tickUnit(u,.05);
   s._tickTracers(.05);
  }
  const pLost=s.units.filter(u=>u.side==='P'&&u.hp<=0).length,eLost=s.units.filter(u=>u.side==='E'&&u.hp<=0).length;
  const damageP=Math.round(s.stats.P.dmgTaken);
  if(scenario==='air-v-melee')assert.equal(damageP,0,'melee cannot hit aircraft');
  else assert.ok(damageP>0,'counter defense must inflict damage');
  results.push({difficulty,scenario,playerLosses:pLost,enemyLosses:eLost,exchange:pLost?+(eLost/pLost).toFixed(2):null,playerDamageTaken:damageP});
 }finally{Math.random=random;}
}
console.log(JSON.stringify(results,null,2));
