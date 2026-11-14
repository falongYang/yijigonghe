// Compare pre-domain economy/production pace against the recorded baseline, not combat balance.
import assert from 'node:assert/strict';
import {cpSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {Simulation} from './MVP_Web/js/sim.js';
const dir=mkdtempSync(join(tmpdir(),'yijigonghe-pace-'));
const baseline='33559db';
function sample(Sim,difficulty){
 let seed=4567;const original=Math.random;
 Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 try{const s=new Sim();s.reset('SP01',{difficulty});const out=[];
 for(let i=0;i<1200&&!s.ended;i++){
  s.tick(.05);
  if(i%200===0)out.push(JSON.stringify({time:s.time,res:s.res,era:s.era,
   units:s.units.map(u=>[u.id,u.type,u.side,u.hp,u.x,u.z]),
   buildings:s.buildings.map(b=>[b.id,b.type,b.hp,b.state,b.queue]),ai:s._ai}));
 }
 return out.join('\n');
 }finally{Math.random=original;}
}
try{
 cpSync(resolve('MVP_Web/js'),dir,{recursive:true});
 writeFileSync(join(dir,'package.json'),'{"type":"module"}');
 for(const file of ['sim.js','rts.js'])writeFileSync(join(dir,file),execFileSync('git',['show',baseline+':MVP_Web/js/'+file]));
 const {Simulation:Before}=await import(pathToFileURL(join(dir,'sim.js')).href);
 for(const difficulty of ['easy','normal','hard']){
  assert.equal(sample(Simulation,difficulty),sample(Before,difficulty),'pre-combat economy/production pace '+difficulty);
  console.log('PASS baseline '+baseline+' vs current / '+difficulty+' / first 60 seconds');
 }
}finally{rmSync(dir,{recursive:true,force:true});}
