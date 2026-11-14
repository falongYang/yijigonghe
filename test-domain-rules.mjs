import assert from 'node:assert/strict';
import {Simulation} from './MVP_Web/js/sim.js';
import {UNITS,BUILDINGS,WEAPONS,DETECTION,combatTags} from './MVP_Web/js/rts.js';
import {UI} from './MVP_Web/js/ui.js';
import {World} from './MVP_Web/js/world.js';
const make=()=>{const s=new Simulation();s.reset('SP01');s.units=[];s.buildings=[];s.obstacles=[];return s;};
const airTypes=['s2','sB','aA','aB'];
for(const type of ['s1','s3','sA','uA','uB',...airTypes]) {
 const s=make(),a=s._makeUnit('P',type,0,0),b=s._makeUnit('E','aA',1,0);
 const allowed=airTypes.includes(type);
 assert.equal(s.canAttack(a,b),allowed,type+' target permission');
 assert.equal(s._nearestEnemyEntity('P',0,0,20,s._targetOpts(a))?.id===b.id,allowed,type+' auto acquisition');
 s.commandAttack([a.id],b.id);
 assert.equal(a.state==='attack',allowed,type+' manual attack');
 const hp=b.hp;s._beginStrike(a,b);
 for(let i=0;i<30;i++){s._tickStrike(a,.05);s._tickProjectiles(.05);}
 assert.equal(b.hp<hp,allowed,type+' damage gate');
 assert.equal(combatTags(UNITS[type]).includes('对空'),allowed);
}
{
 const s=make(),t=s._makeBuilding('E','tower',0,0,true),f=s._makeUnit('P','aA',5,0),hp=f.hp;
 s._tickBuilding(t,.05);s._tickProjectiles(2);
 assert.ok(f.hp<hp,'tower projectile damages air');
 const ground=s._makeUnit('E','s1',1,0);assert.ok(s.canAttack(f,ground),'air still attacks ground');
}
for(const detector of ['tower','hq','contact']) {
 const s=make(),u=s._makeUnit('E','uA',0,0);u.burrowed=true;
 assert.equal(s.isTargetable(u),false);
 const source=detector==='contact'?s._makeUnit('P','s1',3,0):s._makeBuilding('P',detector,10,0,true);
 s._updateDetection(0);assert.equal(u.revealed,true,detector+' reveals');assert.equal(s.isTargetable(u),true);
 s._updateVision();assert.equal(u.visible,true);
 source.x=90;source.z=60;
 s._updateDetection(1.4);assert.equal(u.revealed,true,'linger retained');
 s._updateDetection(.1);assert.equal(u.revealed,false,'linger expires exactly at boundary');
 s._updateVision();assert.equal(u.visible,false,'hidden underground enemy not rendered');
}
{
 const s=make(),u=s._makeUnit('P','uA',0,0),v=s._makeUnit('E','s1',1,0);u.burrowed=true;u.state='hold';
 s._beginStrike(u,v);assert.equal(u.burrowed,false,'starting attack surfaces immediately');
 u.burrowed=true;const dead=s._makeBuilding('E','tower',0,0,true);dead.hp=0;v.hp=0;
 s._updateDetection(0);assert.equal(u.revealed,false,'dead sources do not detect');
 dead.hp=100;dead.state='constructing';s._updateDetection(0);assert.equal(u.revealed,false,'construction does not detect');
}
{
 const s=make(),u=s._makeUnit('E','uA',0,0),a=s._makeUnit('P','s2',8,0);u.burrowed=true;u.revealed=true;
 a.state='attack';a.target={id:u.id};s._beginStrike(a,u);s._tickStrike(a,.25);
 assert.equal(s.projectiles.length,1);u.revealed=false;const hp=u.hp;s._tickProjectiles(2);
 assert.equal(u.hp,hp,'projectile loses unrevealed underground target');
}
// Help derives its labels from the same data as the unit card and simulation.
{
 const saved=globalThis.document,target={textContent:''};globalThis.document={getElementById:()=>target};
 try{UI.prototype._buildDomainHelp();}finally{globalThis.document=saved;}
 for(const def of Object.values(UNITS))if(WEAPONS[def.weapon]?.air)assert.ok(target.textContent.includes(def.name));
 for(const def of Object.values(BUILDINGS))if(def.detectRadius)assert.ok(target.textContent.includes(def.name+' '+def.detectRadius));
 assert.ok(target.textContent.includes(String(DETECTION.linger)));
}
// Identical random stream and input must reproduce full economy/army/AI pace snapshots.
function pace(seed,difficulty){
 const random=Math.random;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 try{const s=new Simulation();s.reset('SP01',{difficulty});const samples=[];
 for(let i=0;i<1200&&!s.ended;i++){s.tick(.05);if(i%200===0)samples.push({time:s.time,res:s.res,units:s.units.map(u=>[u.id,u.type,u.side,u.hp,u.x,u.z]),buildings:s.buildings.map(b=>[b.type,b.hp,b.queue]),ai:s._ai});
 // snapshot immediately, before referenced state changes again
 if(i%200===0)samples[samples.length-1]=JSON.stringify(samples.at(-1));}
 return JSON.stringify(samples);
 }finally{Math.random=random;}
}
for(const difficulty of ['easy','normal','hard'])assert.equal(pace(4567,difficulty),pace(4567,difficulty),'seeded pace repeat '+difficulty);
console.log('Domain targeting, detection, help and deterministic pace checks passed');

for (const visible of [true,false]) {
 const s=make();s._makeBuilding('E','hq',0,0,true);const barracks=s._makeBuilding('E','barracks',0,0,true);
 s._makeUnit('P','aA',visible?10:190,0);s.era.E=2;s.res.E={bio:10000,min:10000,ph:0};
 s._ai.prodTimer=0;s._ai.buildIdx=s._ai.buildPlan.length;s._ai.attackTimer=999;
 const random=Math.random;Math.random=()=>0;
 try{s._tickAI(.05);}finally{Math.random=random;}
 assert.equal(barracks.queue[0].type==='s2',visible,'AI adapts only to observed aircraft');
}

{
 const hidden={visible:true,userData:{kind:'unit',id:1},parent:{visible:false}};
 const shown={visible:true,userData:{kind:'unit',id:2},parent:{visible:true}};
 const fake={_setNdc(){},pickables:[],raycaster:{intersectObjects:()=>[{object:hidden},{object:shown}]}};
 assert.deepEqual(World.prototype.pickEntity.call(fake,0,0),{kind:'unit',id:2},'hidden parent excludes raycast target');
}
