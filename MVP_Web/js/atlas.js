import { MAP, SIDES, UNITS, DOMAINS, BUILDINGS, RESOURCES, TERRAIN } from './rts.js';
import { drawScouting } from './scouting.js';
import { timelineHTML, timeLabel } from './battle-report.js';
const COLORS = { land:'#b8ca83', sea:'#64c8e0', air:'#d0baff', underground:'#d4a66e' };
export function atlasPoint(clientX, clientY, rect) {
  if (!(rect.width > 0) || !(rect.height > 0)) return {x:0,z:0};
  const x = Math.max(0,Math.min(1,(clientX-rect.left)/rect.width));
  const y = Math.max(0,Math.min(1,(clientY-rect.top)/rect.height));
  return {x:(x-.5)*MAP.W,z:(y-.5)*MAP.H};
}
export class BattlefieldAtlas {
  constructor(ui) {
    this.ui=ui; this.box=document.getElementById('battlefield-atlas');this.canvas=document.getElementById('atlas-canvas');
    if(!this.box||!this.canvas)return;
    this.g=this.canvas.getContext('2d');this.layers={resources:true,terrain:true,orders:true};this.orderMode=false;
    document.getElementById('btn-atlas').onclick=()=>this.toggle();
    document.getElementById('atlas-close').onclick=()=>this.close();
    document.getElementById('atlas-order').onclick=e=>{this.orderMode=!this.orderMode;e.currentTarget.setAttribute('aria-pressed',this.orderMode);this.hint();};
    this.box.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const items=[...this.box.querySelectorAll('button,input')];const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
    this.box.addEventListener('click',e=>{if(e.target===this.box)this.close();});
    for(const input of this.box.querySelectorAll('[data-atlas-layer]')) input.onchange=()=>{this.layers[input.dataset.atlasLayer]=input.checked;this.render();};
    this.canvas.addEventListener('pointerdown',e=>{
      if(e.button!==0&&e.button!==2)return;e.preventDefault();
      const p=atlasPoint(e.clientX,e.clientY,this.canvas.getBoundingClientRect());
      if(this.orderMode||e.button===2) {
        if(this.ui.game.paused||this.ui.game.tutOpen){this.ui.toast('暂停期间可以查看地图，恢复战局后再下令');return;}
        this.ui.hooks.onMinimapOrder(p.x,p.z,{attackMove:e.shiftKey});
      } else this.ui.hooks.onMinimap(p.x,p.z);
    });
    this.canvas.addEventListener('contextmenu',e=>e.preventDefault());
    this.canvas.addEventListener('pointermove',e=>this.inspect(atlasPoint(e.clientX,e.clientY,this.canvas.getBoundingClientRect())));
  }
  get open(){return this.box&&!this.box.classList.contains('hidden');}
  toggle(){if(this.open)this.close();else{this.previousFocus=document.activeElement;this.box.classList.remove('hidden');this.ui.world?.setEdge?.(0,0,false);if(this.ui.world?.keys)for(const key in this.ui.world.keys)this.ui.world.keys[key]=false;this.render();document.getElementById('atlas-close').focus();}}
  close(){if(!this.box)return;this.box.classList.add('hidden');this.orderMode=false;document.getElementById('atlas-order').setAttribute('aria-pressed','false');this.previousFocus?.focus?.();}
  hint(){const el=document.getElementById('atlas-hint');if(el)el.textContent=this.orderMode?'下令模式：点击移动；Shift + 点击攻击移动。暂停时仅可查看。':'点击定位镜头 · 右键下令 · Shift + 右键攻击移动 · Esc 关闭';}
  inspect(p){
    const s=this.ui.sim;let text=`坐标 ${Math.round(p.x)}, ${Math.round(p.z)}`;
    const node=s.nodes.find(n=>Math.hypot(n.x-p.x,n.z-p.z)<6);
    const well=s.wells.find(w=>Math.hypot(w.x-p.x,w.z-p.z)<6);
    if(node)text+=` · ${DOMAINS[node.domain]?.name||'陆'}域${RESOURCES[node.res]?.name||'资源'} · ${s.scouting.isVisible(node.x,node.z)?'储量 '+Math.round(node.amount||0):'储量待侦察'}`;
    else if(well)text+=` · 信息素井 · ${well.owner==='P'?'我方控制':well.owner==='E'?'敌方控制':'中立'} · 占领 ${Math.round(Math.abs(well.progress||0)*100)}%`;
    else {const zone=s.zoneAt(p.x,p.z);if(zone)text+=` · ${TERRAIN[zone.type]?.name||zone.type}`;}
    document.getElementById('atlas-inspect').textContent=text;
  }
  render(){
    if(!this.open||!this.ui.sim.sp||!this.g)return;
    const s=this.ui.sim,g=this.g,W=this.canvas.width,H=this.canvas.height;
    const scouting=s.scouting?.snapshot();
    const x=v=>(v/MAP.W+.5)*W,z=v=>(v/MAP.H+.5)*H;
    g.fillStyle='#192319';g.fillRect(0,0,W,H);
    if(this.baseMap!==s.map){this.baseMap=s.map;this.base=this.ui._buildMinimapBase(s.map,{width:W,height:H});}
    if(this.base)g.drawImage(this.base,0,0,W,H);
    if(!this.layers.terrain){g.fillStyle='#192319';g.fillRect(0,0,W,H);}
    g.strokeStyle='rgba(210,227,187,.13)';g.lineWidth=1;
    for(let i=1;i<8;i++){g.beginPath();g.moveTo(W*i/8,0);g.lineTo(W*i/8,H);g.stroke();}
    for(let i=1;i<6;i++){g.beginPath();g.moveTo(0,H*i/6);g.lineTo(W,H*i/6);g.stroke();}
    drawScouting(g,scouting,W,H);
    g.fillStyle='#c9d3ba';g.font='11px sans-serif';for(let i=0;i<8;i++)g.fillText(String.fromCharCode(65+i),W*(i+.5)/8,14);for(let i=0;i<6;i++)g.fillText(String(i+1),6,H*(i+.5)/6);
    const circle=(a,r,color)=>{g.beginPath();g.arc(x(a.x),z(a.z),r,0,Math.PI*2);g.fillStyle=color;g.fill();};
    for(const ob of s.obstacles)if(ob.hp>0)circle(ob,ob.r/MAP.W*W,'#77766a');
    if(this.layers.resources)for(const n of s.nodes){circle(n,5,COLORS[n.domain]||COLORS.land);g.fillStyle='#f1ead2';g.font='12px sans-serif';g.fillText(s.scouting?.isVisible(n.x,n.z)?`${Math.round(n.amount||0)}`:'?',x(n.x)+8,z(n.z)+4);}
    for(const w of s.wells){const color=w.owner==='P'?'#8fe6ad':w.owner==='E'?'#ff9b73':'#ffdb8a';circle(w,8,color);g.strokeStyle=color;g.lineWidth=3;g.beginPath();g.arc(x(w.x),z(w.z),12,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.abs(w.progress||0));g.stroke();}
    for(const h of [...(s.terrainHazards||[]),...(s.hazards||[])])circle(h,(h.r||3)/MAP.W*W,'rgba(235,105,74,.28)');
    if(this.layers.orders){g.strokeStyle='#9ce8d4';g.lineWidth=1.5;g.setLineDash([5,4]);for(const u of s.units){if(u.side!=='P'||!s.selected.has(u.id))continue;const target=u.advanceGoal||u.target;if(!target||!Number.isFinite(target.x))continue;g.beginPath();g.moveTo(x(u.x),z(u.z));for(const point of [...(u.navigation?.route?.slice(u.navigation.index)||[]),target,...(u.waypoints||[])])g.lineTo(x(point.x),z(point.z));g.stroke();}g.setLineDash([]);}
    for(const b of scouting?.buildings||[]){if(s.buildings.some(live=>live.id===b.id&&live.visible))continue;g.strokeStyle='#ab9684';g.setLineDash([3,2]);g.strokeRect(x(b.x)-5,z(b.z)-5,10,10);g.setLineDash([]);}
    for(const b of s.buildings){if(b.side!=='P'&&b.visible===false)continue;g.fillStyle=b.side==='P'?'#9feaaf':'#ff9c78';const size=b.type==='hq'?12:7;g.fillRect(x(b.x)-size/2,z(b.z)-size/2,size,size);if(b.type==='hq'){g.font='bold 12px sans-serif';g.fillText(b.side==='P'?'我方蚁后巢':'敌方蚁后巢',x(b.x)+9,z(b.z)+4);}}
    for(const u of s.units){if(u.hp<=0||(u.side!=='P'&&u.visible===false))continue;circle(u,UNITS[u.type]?.role==='econ'?2.3:3.5,u.side==='P'?COLORS[u.domain]:'#ff856b');if(s.selected.has(u.id)){g.strokeStyle='#fff';g.beginPath();g.arc(x(u.x),z(u.z),6,0,Math.PI*2);g.stroke();}}
    const cam=this.ui.world?.cam;if(cam){g.strokeStyle='#fff';g.lineWidth=1.5;g.beginPath();g.arc(x(cam.tx),z(cam.tz),13,0,Math.PI*2);g.moveTo(x(cam.tx)-18,z(cam.tz));g.lineTo(x(cam.tx)+18,z(cam.tz));g.moveTo(x(cam.tx),z(cam.tz)-18);g.lineTo(x(cam.tx),z(cam.tz)+18);g.stroke();}
    document.getElementById('atlas-title').textContent=`${s.map.name} · ${timeLabel(s.time)}`;
    this.hint();
    const events=s.battleTimeline();const signature=events.map(e=>e.id).join(',');
    if(signature!==this.signature){this.signature=signature;document.getElementById('atlas-events').innerHTML=timelineHTML(events.slice(-12).reverse());}
  }
}
