import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const js = pathToFileURL(process.argv[2] + '/MVP_Web/js/');
const { Simulation } = await import(new URL('sim.js', js));
const { HALF_W, HALF_H } = await import(new URL('rts.js', js));
const { minimapZonesFor } = await import(new URL('maps.js', js));
const times = [];
for (let chapter=0; chapter<6; chapter++) {
 let rand=12345;
 Math.random=()=>((rand=(Math.imul(rand,1664525)+1013904223)>>>0)/4294967296);
 const s=new Simulation();
 s.reset('SP01',{mode:'campaign',chapter,difficulty:'normal'});
 const { water, edge }=minimapZonesFor('campaign',chapter);
 assert.deepEqual(edge,{w:HALF_W*2,h:HALF_H*2});
 assert.ok([...s.nodes,...s.wells,...water].every(({x,z,r=0})=>Math.abs(x)+r<=HALF_W&&Math.abs(z)+r<=HALF_H));
 const nav=s.navigation;
 nav.sync(s.obstacles,s.buildings);
 for(const z of [-0.6,0,0.6]) for(let r=0;r<20;r++){
  const a={x:-HALF_W+4,z:z*HALF_H}, b={x:HALF_W-4,z:-z*HALF_H};
  const t=performance.now(), route=nav.path(a,b);
  times.push(performance.now()-t);
  assert.ok(route.length>0);
 }
 const u=s._makeUnit('P','s1',3,HALF_H*.62-8);
 let arrived=false, step=0;
 for (;step<1800&&!arrived;step++)s._moveTo(u,0,0,.05,()=>{arrived=true;});
 assert.ok(arrived);
 console.log({chapter:chapter+1,nodes:s.nodes.length,wells:s.wells.length,water:water.length,marchSeconds:step*.05});
}
times.sort((a,b)=>a-b);
console.log({routes:times.length,medianMs:times[Math.floor(times.length*.5)],p95Ms:times[Math.floor(times.length*.95)]});
