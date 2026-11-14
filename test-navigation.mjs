import assert from 'node:assert/strict';
import { Navigation } from './MVP_Web/js/navigation.js';
import { Simulation } from './MVP_Web/js/sim.js';
let checks = 0;
function ok(condition, message) { assert.ok(condition, message); checks++; }
function navFor(circles = [], buildings = []) {
  const n = new Navigation(94, 67); n.sync(circles, buildings); return n;
}
const rock = { x: 0, z: 0, r: 5, hp: 100 };
const nav = navFor([rock]);
const start = { x: -20, z: 0 }, end = { x: 20, z: 0 };
const route = nav.path(start, end);
ok(route.length > 1, 'blocked route goes around rock');
let previous = start;
for (const p of route) { ok(nav.clear(previous, p), 'each route segment avoids solid footprint'); previous = p; }
ok(JSON.stringify(route) === JSON.stringify(nav.path(start, end)), 'same route is deterministic');
const version = nav.version; nav.sync([rock], []); ok(nav.version === version, 'unchanged scene preserves graph');
nav.sync([{ ...rock, hp: 0 }], []); ok(nav.version > version && nav.path(start, end).length === 1, 'destroyed obstacle opens route');
const multi = navFor([{ ...rock, z: -4 }, { ...rock, z: 4 }]);
const mr = multi.path(start, end); ok(mr.length > 1, 'overlapping blockers remain routable');
previous = start;
for (const p of mr) { ok(multi.clear(previous, p), 'overlapping footprint segments are safe'); previous = p; }
const blocked = navFor([rock]);
const goal = blocked.goal(start, { x: 0, z: 0 });
ok(blocked.free(goal) && goal.x < 0, 'solid-centre command projects to near surface');
ok(blocked.clear({ x: 0, z: 0 }, { x: 8, z: 0 }), 'unit inside new building can escape');
ok(!blocked.clear({ x: -3, z: 0 }, { x: 8, z: 0 }), 'escape cannot cross footprint centre');
const ring = Array.from({length: 20}, (_, i) => ({x: Math.cos(i*Math.PI/10)*12,z:Math.sin(i*Math.PI/10)*12,r:2.3,hp:1}));
const enclosed = navFor(ring);
ok(enclosed.path({x:0,z:0},{x:30,z:0}).length === 0, 'sealed enclosure returns no path');
function scene() {
  const s = new Simulation(); s.reset('SP01'); s.units = []; s.buildings = []; s.obstacles = [{ ...rock }]; return s;
}
function move(s, u, x, z, frames = 1000, dt = 0.05) {
  let arrived = false;
  for (let i = 0; i < frames && !arrived; i++) { s.time += dt; s._moveTo(u, x, z, dt, () => { arrived = true; }); }
  return arrived;
}
const s = scene(), unit = s._makeUnit('P', 's1', -20, 0);
unit.state = 'move';
ok(move(s, unit, 20, 0), 'real unit reaches far side of obstacle');
ok(Math.hypot(unit.x-20,unit.z) <= 0.6, 'arrival remains inside stopping radius');
const fast = scene(), fu = fast._makeUnit('P','s1',-20,0); fu.state='move'; fu.speed=100;
ok(move(fast,fu,-19,0,5,0.5), 'large timestep cannot overshoot goal');
const air = scene(), flyer = air._makeUnit('P','aA',-10,0); flyer.state='move';
let crossed = false;
for(let i=0;i<200;i++) { air._moveTo(flyer,10,0,0.05); if(Math.hypot(flyer.x,flyer.z)<5) crossed=true; }
ok(crossed, 'air crosses obstacle directly');
const tunnel = scene(), digger = tunnel._makeUnit('P','uA',-10,0); digger.burrowed=true; digger.state='move';
ok(move(tunnel,digger,10,0), 'burrowed unit bypasses footprints');
const build = scene(); build.obstacles=[];
const soldier = build._makeUnit('P','s1',-20,0); soldier.state='move';
const b = build._makeBuilding('P','barracks',0,0,true);
ok(move(build,soldier,20,0), 'building footprint routes ground units');
soldier.x=-20; soldier.z=0; soldier.navigation=null;
for(let i=0;i<8;i++) build._moveTo(soldier,20,0,0.05);
const oldVersion=build.navigation.version; build._makeBuilding('P','tower',10,0,true);
ok(move(build,soldier,20,0) && build.navigation.version>oldVersion, 'construction invalidates active route');
const repair = scene(); repair.obstacles=[];
const home=repair._makeBuilding('P','hq',0,0,true); home.hp-=100;
const worker=repair._makeUnit('P','worker',-20,0); repair.res.P.min=1000; repair.commandRepair([worker.id],home.id);
for(let i=0;i<500 && home.hp<home.maxHp;i++) {repair.time+=0.05; repair._repair(worker,0.05);}
ok(home.hp>=home.maxHp-0.5, 'repair approaches building and completes');
const group=scene(), ids=[];
for(let i=0;i<30;i++) ids.push(group._makeUnit('P','s1',-25-(i%5)*2,Math.floor(i/5)*2-5).id);
group.commandMove(ids,25,0);
for(let i=0;i<900;i++) {group.time+=0.05; for(const u of group.units) if(u.state==='move') group._tickUnit(u,0.05);}
ok(group.units.every(u=>u.state!=='move'), '30-unit formation completes obstacle traversal');
ok(group.units.every(u=>Math.hypot(u.x,u.z)>=rock.r+0.65-1e-5), 'formation never ends inside rock');
// A blocked order must not complete a waypoint or busy-loop pathfinding every frame.
const trapped=scene(); trapped.obstacles=ring;
const prisoner=trapped._makeUnit('P','s1',0,0); prisoner.state='move';
ok(!move(trapped,prisoner,30,0,40), 'unreachable goal does not report arrival');
const plan=prisoner.navigation; trapped._moveTo(prisoner,30,0,0.05);
ok(plan===prisoner.navigation, 'unreachable result is cached');
console.log(`Navigation: ${checks} checks passed`);
