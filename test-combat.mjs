import assert from 'node:assert/strict';
import {Simulation} from './MVP_Web/js/sim.js';
let checks=0;const ok=(c,m)=>{assert.ok(c,m);checks++;};
function scene(type='s2') {
 const s=new Simulation();s.reset('SP01');s.units=[];s.obstacles=[];s.buildings=[];
 const a=s._makeUnit('P',type,0,0),b=s._makeUnit('E','s3',type==='s1'?1.8:8,0);
 a.state='attack';a.order='manual';a.target={id:b.id,x:b.x,z:b.z};b.state='hold';b.holdX=b.x;b.holdZ=b.z;
 return {s,a,b};
}
function step(s,a,dt=.05){s.time+=dt;s._tickProjectiles(dt);s._tickUnit(a,dt);s._tickTracers(dt);}
{
 const {s,a,b}=scene();const hp=b.hp;s._attack(a,.05);
 ok(b.hp===hp&&a.strike,'attack starts with windup, no instant damage');
 step(s,a);ok(b.hp===hp&&s.projectiles.length===0,'no projectile before release');
 for(let i=0;i<3;i++)step(s,a);
 ok(s.projectiles.length===1&&b.hp===hp,'release creates projectile without impact');
 const shot=s.projectiles[0]; b.z=2;step(s,a);
 ok(shot.tracer.to.z===2,'in-flight tracer follows live target');
 for(let i=0;i<20&&b.hp===hp;i++)step(s,a);
 ok(b.hp<hp,'damage occurs after flight');
 ok(s.projectiles.length===0,'impact retires gameplay projectile');
 const after=b.hp; for(let i=0;i<3;i++)step(s,a);
 ok(b.hp===after,'impact does not double apply');
}
{
 const {s,a,b}=scene('s1');const hp=b.hp;s._attack(a,.05);
 ok(b.hp===hp,'melee has readable anticipation');
 for(let i=0;i<4;i++)step(s,a);
 ok(b.hp<hp&&s.projectiles.length===0,'melee contact deals direct damage');
}
{
 const {s,a,b}=scene('s1');s._attack(a,.05);const hp=b.hp;b.x=25;
 for(let i=0;i<4;i++)step(s,a);
 ok(b.hp===hp,'melee windup misses target that leaves reach');
}
{
 const {s,a,b}=scene();s._attack(a,.05);const hp=b.hp;s.commandMove([a.id],-20,0);
 for(let i=0;i<12;i++)step(s,a);
 ok(b.hp===hp&&!a.strike,'new movement cancels unreleased attack');
}
{
 const {s,a,b}=scene();s._attack(a,.05);a.stunT=.3;const hp=b.hp;
 for(let i=0;i<5;i++)step(s,a);
 ok(b.hp===hp&&a.x===0&&a.z===0&&!a.strike,'stun blocks action and cancels anticipation');
}
{
 const {s,a,b}=scene();s._launchStrike(a,b,10,a.dtype,true);a.hp=0;s.units=s.units.filter(u=>u!==a);
 const hp=b.hp;for(let i=0;i<30;i++){s.time+=.05;s._tickProjectiles(.05);}
 ok(b.hp<hp,'released projectile survives attacker death');
 ok(a.hp===0,'dead attacker cannot heal from projectile or level up');
}
{
 const {s,a,b}=scene();s._launchStrike(a,b,10,a.dtype,true);b.hp=0;const damage=s.stats.P.dmgDealt;
 for(let i=0;i<30;i++)s._tickProjectiles(.05);
 ok(s.stats.P.dmgDealt===damage,'dead target does not take extra impact');
 s._launchStrike(a,{...b,hp:100},10,a.dtype,true);s.reset('SP01');
 ok(s.projectiles.length===0,'reset clears in-flight projectiles');
}
{
 const {s,a,b}=scene('s1');s.commandAttackMove([a.id],50,0,{formation:false});s._attackMove(a,.05);
 ok(a.state==='attack'&&a.advanceGoal.x===50,'attack move retains destination');b.hp=0;s._attack(a,.05);
 ok(a.state==='attackmove'&&a.target.x===50,'attack move resumes after skirmish');
 s.commandHold([a.id]);ok(!a.advanceGoal&&a.state==='hold','hold clears old advance order');
 s.ended='win';ok(s.battleSummary().winner==='player','battle report winner reflects string outcome');
}
{
 const {s,a,b}=scene();a.critChance=0;a.flankBonus=0;a.pierce=0;b.armor='soft';b.hp=1000;b.maxHp=1000;
 s._dealDamage(a,b,10,0,0,false,'psi');const base=1000-b.hp;b.hp=1000;
 s._buffUnits([a],1.6,1,1.3,6);s._dealDamage(a,b,10,0,0,false,'psi');
 ok(Math.abs((1000-b.hp)/base-1.6)<1e-8,'frenzy damage bonus is applied to real damage');
 b.hp=1000;s._launchStrike(a,b,10,'psi',true);a.buff.dmg=1;
 for(let i=0;i<30;i++)s._tickProjectiles(.05);
 ok(Math.abs((1000-b.hp)/base-1.6)<1e-8,'launched shot retains attack buff when buff expires in flight');
}
console.log(`Combat timing: ${checks} checks passed`);
