import assert from 'node:assert/strict';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=[];
try {
 for (const touch of [false,true]) {
  const page=await browser.newPage({viewport:touch?{width:844,height:390}:{width:1440,height:960},hasTouch:touch});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8000/#auto?sp=SP01&m=campaign&c=0&d=easy');
  await page.waitForFunction(()=>window.__ANT_EPOCH__?.game.running);
  await page.evaluate(()=>{const g=window.__ANT_EPOCH__.game;g.world.intro=null;g.world.cam.dist=120;g.world._camT.dist=120;document.getElementById('map-brief').classList.add('hidden');});
  await page.waitForTimeout(400);
  assert.ok(await page.locator('#operation-guide').isVisible(),'first chapter guide visible');
  assert.ok((await page.locator('#operation-guide-text').textContent()).includes('1/4'));
  const button=page.getByRole('button',{name:/^兵营/});
  if(touch) await button.tap(); else await button.click();
  await page.waitForFunction(()=>window.__ANT_EPOCH__.game.pendingBuild==='barracks');
  const before=await page.evaluate(()=>window.__ANT_EPOCH__.game.sim.res.P.bio);
  await page.waitForTimeout(200);
  assert.ok(await page.locator('#placement-cancel').isVisible());
  if(touch) await page.locator('#placement-cancel').tap(); else await page.locator('#placement-cancel').click();
  assert.equal(await page.evaluate(()=>window.__ANT_EPOCH__.game.pendingBuild),null);
  assert.ok((await page.evaluate(()=>window.__ANT_EPOCH__.game.sim.res.P.bio))>=before,'cancel never spends');
  if(touch) await button.tap(); else await button.click();
  await page.waitForTimeout(100);
  const spot=await page.evaluate(()=>{const g=window.__ANT_EPOCH__.game;for(let y=40;y<innerHeight-10;y+=8)for(let x=10;x<innerWidth-10;x+=8){if(document.elementFromPoint(x,y)?.id!=='scene')continue;const p=g.world.screenToGround(x,y);if(p&&g.sim.checkBuild('barracks',p.x,p.z).ok)return{x,y};}return null;});
  assert.ok(spot,'valid ground reachable without HUD overlap');
  if(touch) await page.touchscreen.tap(spot.x,spot.y);else await page.mouse.click(spot.x,spot.y);
  await page.waitForFunction(()=>!window.__ANT_EPOCH__.game.pendingBuild);
  assert.ok(await page.evaluate(()=>window.__ANT_EPOCH__.game.sim.buildings.some(b=>b.side==='P'&&b.type==='barracks')));
  // Controlled selection isolates touch long-press dispatch from world picking.
  await page.evaluate(()=>{const g=window.__ANT_EPOCH__.game;for(let i=0;i<600;i++)g.sim.tick(1/30);const b=g.sim.buildings.find(b=>b.side==='P'&&b.type==='barracks');if(!g.sim.produce(b.id,'s1'))throw Error('normal production rejected');for(let i=0;i<300;i++)g.sim.tick(1/30);const u=g.sim.units.find(u=>u.side==='P'&&u.type==='s1');g.sim.selected.clear();g.sim.selected.add(u.id);});
  if(touch){
   await page.dispatchEvent('#scene','pointerdown',{pointerId:31,pointerType:'touch',clientX:spot.x,clientY:spot.y,isPrimary:true,button:0,buttons:1});
   await page.waitForTimeout(620);
   await page.dispatchEvent('#scene','pointerup',{pointerId:31,pointerType:'touch',clientX:spot.x,clientY:spot.y,isPrimary:true,button:0,buttons:0});
  }else await page.mouse.click(spot.x,spot.y,{button:'right'});
  assert.ok(await page.evaluate(()=>window.__ANT_EPOCH__.game.operationGuide.ordered),'order acknowledged');
  assert.deepEqual(errors,[]);results.push({viewport:touch?'844x390':'1440x960',guide:true,cancel:true,placement:true,order:true,errors});await page.close();
 }
 console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}
