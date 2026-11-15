import assert from 'node:assert/strict';
import {Simulation} from './MVP_Web/js/sim.js';
import {BUILDINGS,HALF_W,HALF_H} from './MVP_Web/js/rts.js';
const s=new Simulation();s.reset('SP01');
s._makeBuilding('E','tech',0,-57.54,true);
assert.equal(s._makeAIBuilding('ugnest',0,-61),true);
const b=s.buildings.at(-1);assert.equal(b.type,'ugnest');
assert.ok(Math.abs(b.x)<=HALF_W-6&&Math.abs(b.z)<=HALF_H-6);
for(const e of s.buildings)if(e!==b&&e.side==='E')assert.ok(Math.hypot(e.x-b.x,e.z-b.z)>=(e.size+BUILDINGS.ugnest.size)*.7);
assert.equal(s._makeAIBuilding('tower',16,-37.54),true);
console.log('PASS blocked edge placement retries without blocking tower');

const t=new Simulation();t.reset("SP01");t._ai.buildPlan=["tower","tower"];t._ai.buildIdx=0;t.res.E.bio=10000;t.res.E.min=10000;for(let i=0;i<2;i++){t._ai.buildTimer=0;t._tickAI(.05);}assert.equal(t._ai.buildIdx,2);assert.equal(t.buildings.filter(b=>b.side==="E"&&b.type==="tower").length,2);
