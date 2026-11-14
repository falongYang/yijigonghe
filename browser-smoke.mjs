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
assert.ok(result.arrived && result.minDistance >= result.solidRadius-1e-5, 'browser unit reaches goal without clipping');
assert.ok(result.scenerySafe, 'background hills stay outside battlefield and behind playable geometry');
await page.setViewportSize({width:844,height:390});await page.waitForTimeout(300);
await page.screenshot({path:join(tmpdir(),'yijigonghe-navigation-mobile.png')});
const separateRows=await page.evaluate(()=>{const a=document.querySelector('#res').getBoundingClientRect(), b=document.querySelector('#topright').getBoundingClientRect();return a.top>=b.bottom;});
assert.ok(separateRows, 'narrow-screen resources do not overlap controls');
console.log('ERRORS',JSON.stringify(errors));
assert.deepEqual(errors, [], 'no browser runtime errors');
} finally { await browser.close(); }
