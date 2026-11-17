import {writeFileSync} from 'node:fs';
const {chromium}=await import('/Users/loganyang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const rows=[];
try {
for(const viewport of [{width:844,height:390},{width:390,height:844}]){
 const page=await browser.newPage({viewport,hasTouch:true});
 await page.goto('http://127.0.0.1:8000/#auto?sp=SP01&m=campaign&c=0&d=easy');
 await page.waitForFunction(()=>window.__ANT_EPOCH__?.game.running);
 await page.waitForTimeout(5000);
 // Dismiss briefing via its UI, retain normal speed, camera and simulation.
 const close=page.locator('#map-brief button');if(await close.count())await close.first().click();
 await page.mouse.move(viewport.width/2,viewport.height/2);
 await page.mouse.wheel(0,600);
 await page.waitForTimeout(2000);
 let count=0;
 for(let attempt=0;attempt<120&&count<12;attempt++){
 const spot=await page.evaluate(({attempt})=>{
 const g=window.__ANT_EPOCH__.game,w=g.world;
 const units=[...w.unitMeshes].filter(([,m])=>m.side==='P'&&m.group.visible).map(([id,m])=>{const v=m.body.position.clone();m.body.getWorldPosition(v);return {id,...w.worldToScreen(v.x,v.y,v.z)};}).filter(p=>document.elementFromPoint(p.x,p.y)?.id==='scene');
 if(units.length<2)return null;
 const target=units[attempt%units.length];
 const neighbor=units.filter(p=>p.id!==target.id).sort((a,b)=>Math.hypot(a.x-target.x,a.y-target.y)-Math.hypot(b.x-target.x,b.y-target.y))[0];
 const gap=Math.hypot(neighbor.x-target.x,neighbor.y-target.y);
 if(gap>48||gap<2)return null;
 const offset=8+(attempt%4)*4,sign=attempt%2?1:-1;
 const x=target.x+sign*(neighbor.x-target.x)/gap*offset,y=target.y+sign*(neighbor.y-target.y)/gap*offset;
 if(document.elementFromPoint(x,y)?.id!=='scene')return null;
 const closest=units.slice().sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];
 return {x,y,intended:target.id,nearest:closest.id,gap,offset,exact:w.pickEntity(x,y),expanded:w.pickEntity(x,y,24),speed:g.speed,overlay:document.elementFromPoint(x,y)?.id,time:g.sim.time};
 },{attempt});
 if(!spot){await page.waitForTimeout(150);continue;}
 await page.touchscreen.tap(spot.x,spot.y);
 const selected=await page.evaluate(()=>[...window.__ANT_EPOCH__.game.sim.selected]);
 rows.push({viewport,...spot,selected});count++;
 await page.waitForTimeout(200);
 }
 console.log(JSON.stringify({viewport,count}));await page.close();
}
}finally{await browser.close();writeFileSync('docs/移动扎堆点选-2026-11-17.log',rows.map(r=>JSON.stringify(r)).join('\n')+'\n');}
for(const width of [844,390]){const r=rows.filter(r=>r.viewport.width===width);console.log(JSON.stringify({width,n:r.length,intended:r.filter(r=>r.selected.includes(r.intended)).length,nearest:r.filter(r=>r.selected.includes(r.nearest)).length,rescued:r.filter(r=>!r.exact&&r.selected.includes(r.intended)).length,neighbor:r.filter(r=>r.selected.length&&!r.selected.includes(r.intended)).length}));}
