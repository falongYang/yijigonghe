// Optional real-browser check. Start npm run serve first; provide Playwright externally.
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE || chromium.executablePath(),headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
const page=await browser.newPage({viewport:{width:1440,height:960}}), errors=[];
page.on('pageerror',e=>errors.push(e.stack));
page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
await page.addInitScript(()=>localStorage.setItem('ant_epoch_tut_v1','1'));
await page.goto((process.env.GAME_URL || 'http://127.0.0.1:8000/') + '#auto?sp=SP01',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.__ANT_EPOCH__?.game.running);
await page.evaluate(()=>{const {world:w}=window.__ANT_EPOCH__.game;w.intro=null;w.cam.dist=120;w.cam.pitch=.92;w.cam.tx=0;w.cam.tz=15;w._camT.dist=120;w._camT.pitch=.92;document.querySelector('#map-brief')?.classList.add('hidden');});
await page.waitForTimeout(1800);
await page.screenshot({path:join(tmpdir(),'yijigonghe-navigation-desktop.png')});
const result=await page.evaluate(()=>{
 const {sim:s,world:w}=window.__ANT_EPOCH__.game;
 const scenerySafe=w.hillsGroup.children.every(h=>{const r=h.geometry.parameters.radius;return Math.hypot(Math.max(0,Math.abs(h.position.x)-94),Math.max(0,Math.abs(h.position.z)-67))>r&&h.renderOrder<0&&!h.material.depthWrite;});
 const u=s._makeUnit('P','s1',-30,0);u.state='move';
 const ob=s.obstacles[0]; u.x=ob.x-ob.r-10;u.z=ob.z;
 const tx=ob.x+ob.r+10,tz=ob.z; u.target={x:tx,z:tz}; u.order='manual';
 let min=Infinity,arrived=false;
 for(let i=0;i<700&&!arrived;i++) {s._moveTo(u,tx,tz,.05,()=>{arrived=true;u.state='idle';u.target=null;});min=Math.min(min,Math.hypot(u.x-ob.x,u.z-ob.z));}
 return {scenerySafe,arrived,minDistance:min,solidRadius:ob.r+.65,webgl:!!document.querySelector('#scene').getContext('webgl2'),time:s.time};
});
console.log('DESKTOP',JSON.stringify(result));
const geometryChecks=await page.evaluate(()=>{
 const {sim:s,world:w}=window.__ANT_EPOCH__.game;
 const m=[...w.unitMeshes.values()][0],u=s.getUnit(m.body.userData.id),h=m.body.geometry.getAttribute('antHinge');
 const groups=new Set();for(let i=0;i<h.count;i++)groups.add(h.getW(i));
 return {limbs:[1,2,3,4].every(n=>groups.has(n)),grounded:Math.abs(m.group.position.y-w._groundY(u.x,u.z))<.01,stance:m.body.position.y>0,shadowShared:m.body.customDepthMaterial.userData.locomotion===m.body.material.userData.locomotion};
});
console.log('GEOMETRY',JSON.stringify(geometryChecks));
assert.ok(geometryChecks.limbs&&geometryChecks.grounded&&geometryChecks.stance&&geometryChecks.shadowShared,'articulated feet, ground stance and shadow share animation');
assert.ok(result.arrived && result.minDistance >= result.solidRadius-1e-5, 'browser unit reaches goal without clipping');
assert.ok(result.scenerySafe, 'background hills stay outside battlefield and behind playable geometry');
await page.setViewportSize({width:844,height:390});await page.waitForTimeout(300);
await page.screenshot({path:join(tmpdir(),'yijigonghe-navigation-mobile.png')});
const separateRows=await page.evaluate(()=>{const a=document.querySelector('#res').getBoundingClientRect(), b=document.querySelector('#topright').getBoundingClientRect();return a.top>=b.bottom;});
assert.ok(separateRows, 'narrow-screen resources do not overlap controls');
// Exercise the actual UI hook that starts campaign matches (not #auto alone).
await page.evaluate(()=>window.__ANT_EPOCH__.game.ui.hooks.onStart('SP01',{mode:'campaign',chapter:1,difficulty:'easy',archetype:'defensive'}));
assert.ok(await page.evaluate(()=>{const s=window.__ANT_EPOCH__.game.sim;return s.mode==='campaign'&&s.chapter===1&&s.difficulty.id==='easy';}), 'menu selection reaches simulation');
await page.evaluate(()=>{const {game:g}=window.__ANT_EPOCH__;g.paused=true;g.world.intro=null;document.querySelector('#map-brief').classList.add('hidden');const s=g.sim;const u=s._makeUnit('P','s1',0,0);s.selected.clear();s.selected.add(u.id);s._tl('milestone',0,0,{side:'P',text:'中央高台已建立侦察点'});});
await page.keyboard.press('h');
// Paused commands are deliberately blocked. Resume, then hold should actually hold.
await page.evaluate(()=>window.__ANT_EPOCH__.game.paused=false);
await page.keyboard.press('h');
assert.ok(await page.evaluate(()=>{const s=window.__ANT_EPOCH__.game.sim;return [...s.selected].every(id=>s.getUnit(id).state==='hold');}), 'H enters actual hold state');
await page.setViewportSize({width:1440,height:960});await page.waitForTimeout(600);
await page.keyboard.press('l');
await page.waitForFunction(()=>window.__ANT_EPOCH__.game.ui.atlas.open);
await page.screenshot({path:join(tmpdir(),'yijigonghe-atlas-desktop.png')});
assert.ok((await page.locator('#atlas-events').textContent()).includes('中央高台'), 'chronicle consumes real events');
await page.setViewportSize({width:844,height:390});await page.waitForTimeout(600);
await page.screenshot({path:join(tmpdir(),'yijigonghe-atlas-mobile.png')});
assert.ok(await page.evaluate(()=>{const b=document.querySelector('.atlas-shell').getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&b.height<=innerHeight;}),'atlas fits narrow viewport');
await page.keyboard.press('Escape');
assert.ok(await page.evaluate(()=>!window.__ANT_EPOCH__.game.ui.atlas.open),'Escape closes atlas');
await page.evaluate(()=>{const g=window.__ANT_EPOCH__.game;g.paused=true;g.sim._tl('victory',0,0,{side:'P',text:'守住据点'});g.ui.showEnd({type:'win',mode:'campaign',chapter:1,objective:'dominate',reason:'守住据点'});});
assert.ok((await page.locator('#end-desc').textContent()).includes('守住据点'),'victory copy matches objective');
assert.ok((await page.locator('#end-highlights').textContent()).includes('守住据点'),'postmatch highlights render');
console.log('ERRORS',JSON.stringify(errors));
assert.deepEqual(errors, [], 'no browser runtime errors');
} finally { await browser.close(); }
