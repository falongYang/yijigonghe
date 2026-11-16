import assert from 'node:assert/strict';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=[];
try {
 for (const viewport of [{width:844,height:390},{width:390,height:844}]) {
  const touch=true;
  const page=await browser.newPage({viewport,hasTouch:touch});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8000/#auto?sp=SP01&m=campaign&c=0&d=easy');
  await page.waitForFunction(()=>window.__ANT_EPOCH__?.game.running);
  await page.evaluate(()=>{const g=window.__ANT_EPOCH__.game;g.speed=0;g.world.intro=null;g.world.cam.dist=120;g.world._camT.dist=120;document.getElementById('map-brief').classList.add('hidden');});
  await page.waitForTimeout(1500);
  const selectEntity = async (kind,type) => {
    // Camera fixture only: bring the desired entity into view; selection is a real click.
    await page.evaluate(({kind,type})=>{const g=window.__ANT_EPOCH__.game;const e=(kind==='unit'?g.sim.units:g.sim.buildings).find(e=>e.side==='P'&&e.type===type);if(e)g.world.focus(e.x,e.z,true);},{kind,type});
    await page.waitForTimeout(2000);
    // Aim at rendered body centers, without consulting picking to choose pixels.
    const spot=await page.evaluate(({kind,type})=>{
      const g=window.__ANT_EPOCH__.game;
      const entities=(kind==='unit'?g.sim.units:g.sim.buildings).filter(e=>e.side==='P'&&e.type===type);
      for(const e of entities){
        const mesh=kind==='unit'?g.world.unitMeshes.get(e.id)?.body:g.world.buildingMeshes.get(e.id)?.mesh;
        if(!mesh)continue;
        const v=mesh.position.clone();mesh.getWorldPosition(v);
        const p=g.world.worldToScreen(v.x,v.y,v.z);
        if(document.elementFromPoint(p.x,p.y)?.id==='scene')return {...p,id:e.id};
      }return null;
    },{kind,type});
    assert.ok(spot,`visible ${type} center is reachable`);
    if(touch)await page.touchscreen.tap(spot.x,spot.y);else await page.mouse.click(spot.x,spot.y);
    await page.waitForTimeout(100);
    const actual=await page.evaluate(({kind,id,x,y})=>{
      const g=window.__ANT_EPOCH__.game;
      return {selected:[...g.sim.selected],building:g.sim.selectedBuilding,hit:g.world.pickEntity(x,y,24),overlay:document.elementFromPoint(x,y)?.id,picker:g.world.pickEntity.toString().includes('unitTolerance'),camera:g.world.cam,centers:[...g.world.unitMeshes].slice(0,8).map(([id,m])=>{const v=m.body.position.clone();m.body.getWorldPosition(v);return {id,side:m.side,visible:m.group.visible,p:g.world.worldToScreen(v.x,v.y,v.z)}})};
    },{kind,id:spot.id,x:spot.x,y:spot.y});
    console.log(JSON.stringify({viewport,kind,type,click:spot,actual}));
    assert.ok(kind==='unit'?actual.selected.includes(spot.id):actual.building===spot.id,`screen selection failed: ${type}`);
  };
  assert.ok(await page.locator('#operation-guide').isVisible(),'first chapter guide visible');
  assert.ok((await page.locator('#operation-guide-text').textContent()).includes('1/4'));
  await selectEntity('unit','worker');
  await page.evaluate(()=>{const s=window.__ANT_EPOCH__.game.sim;for(let i=0;i<600;i++)s.tick(1/30);});
  await page.waitForTimeout(100);
  await page.waitForFunction(()=>document.getElementById('operation-guide-text').textContent.includes('2/4')); 
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
  await page.evaluate(()=>{const s=window.__ANT_EPOCH__.game.sim;for(let i=0;i<300;i++)s.tick(1/30);});
  await page.waitForTimeout(100);
  await selectEntity('building','barracks');
  const produce=page.locator('.ctx-btn').filter({hasText:/^生产兵蚁/}).first();
  if(touch)await produce.tap();else await produce.click();
  await page.evaluate(()=>{const s=window.__ANT_EPOCH__.game.sim;for(let i=0;i<210;i++)s.tick(1/30);});
  await page.waitForTimeout(100);
  await selectEntity('unit','s1');
  const tolerance=await page.evaluate(()=>{
    const g=window.__ANT_EPOCH__.game,id=[...g.sim.selected][0],m=g.world.unitMeshes.get(id);
    const v=m.body.position.clone();m.body.getWorldPosition(v);
    const p=g.world.worldToScreen(v.x,v.y,v.z);
    return [[18,0],[-18,0],[0,18],[0,-18]].map(([dx,dy])=>({dx,dy,exact:g.world.pickEntity(p.x+dx,p.y+dy),expanded:g.world.pickEntity(p.x+dx,p.y+dy,24),id}));
  });
  assert.ok(tolerance.some(r=>!r.exact&&r.expanded?.id===r.id),'screen tolerance recovers a ray miss');
  console.log(JSON.stringify({viewport,tolerance}));
  const orderSpot=await page.evaluate(()=>{for(let y=80;y<innerHeight-10;y+=10)for(let x=80;x<innerWidth-10;x+=10)if(document.elementFromPoint(x,y)?.id==='scene'&&window.__ANT_EPOCH__.game.world.screenToGround(x,y))return{x,y};return null;});
  assert.ok(orderSpot);
  if(touch){
   const cdp=await page.context().newCDPSession(page);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:orderSpot.x,y:orderSpot.y}]});
   await page.waitForTimeout(650);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await page.waitForTimeout(100);
  }else await page.mouse.click(orderSpot.x,orderSpot.y,{button:'right'});
  assert.ok(await page.evaluate(()=>window.__ANT_EPOCH__.game.operationGuide.ordered),'order acknowledged');
  await page.waitForTimeout(100);
  await page.waitForFunction(()=>document.getElementById('operation-guide-text').textContent.includes('教学完成'));
  await page.screenshot({path:`/tmp/experience-${viewport.width}x${viewport.height}.png`});
  assert.deepEqual(errors,[]);results.push({viewport,guide:true,cancel:true,placement:true,order:true,errors});await page.close();
 }
 console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}
