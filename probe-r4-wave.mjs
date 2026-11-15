import assert from 'node:assert/strict';
import {Simulation} from './MVP_Web/js/sim.js';
const saved=Math.random,rows=[];
try {
for(const w of [0,.5,1]) {
 Math.random=()=>.5;
 const s=new Simulation();s.reset('SP01',{mode:'campaign',chapter:0,difficulty:'normal'});
 s._ai.waveReinforce=w;s._ai.diff={...s._ai.diff,waveReinforce:w};
 for(let i=0;i<40;i++)s._makeUnit('E','s1',0,-40);
 s._ai.attackTimer=0;s._tickAI(.05);assert.equal(s.stats.E.waves,1);
 const timer=s._ai.attackTimer,req=s._ai.soldierReq;
 assert.ok(Math.abs(timer-28*(1+.6*w))<1e-9);
 assert.equal(req,w?4+2*w:Infinity);
 s._ai.attackTimer=0;s._tickAI(.05);assert.equal(s.stats.E.waves,w?2:1);
 rows.push({waveReinforce:w,resetInterval:timer,nextThreshold:Number.isFinite(req)?req:'Infinity',waves:s.stats.E.waves});
}
console.log(JSON.stringify(rows,null,2));
} finally {Math.random=saved;}
