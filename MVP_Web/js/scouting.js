// Player scouting memory. Enemy movements are never stored as live contacts.
import { MAP } from './rts.js';
export class ScoutingMemory {
  constructor(cols=47,rows=34){this.cols=cols;this.rows=rows;this.visible=new Uint8Array(cols*rows);this.explored=new Uint8Array(cols*rows);this.buildings=new Map();}
  update(sources,buildings,time){
    this.visible.fill(0);
    for(let row=0;row<this.rows;row++)for(let col=0;col<this.cols;col++){
      const x=((col+.5)/this.cols-.5)*MAP.W,z=((row+.5)/this.rows-.5)*MAP.H;
      const i=row*this.cols+col;
      if(sources.some(s=>(x-s.x)**2+(z-s.z)**2<=s.r**2)){this.visible[i]=1;this.explored[i]=1;}
    }
    for(const b of buildings)if(b.side==='E'&&b.hp>0&&b.visible)this.buildings.set(b.id,{id:b.id,type:b.type,x:b.x,z:b.z,at:time});
    for(const [id,b] of this.buildings)if(this.isVisible(b.x,b.z)&&!buildings.some(live=>live.id===id&&live.hp>0))this.buildings.delete(id);
  }
  index(x,z){const col=Math.max(0,Math.min(this.cols-1,Math.floor((x/MAP.W+.5)*this.cols))),row=Math.max(0,Math.min(this.rows-1,Math.floor((z/MAP.H+.5)*this.rows)));return row*this.cols+col;}
  isVisible(x,z){return !!this.visible[this.index(x,z)];}
  snapshot(){return {cols:this.cols,rows:this.rows,visible:this.visible.slice(),explored:this.explored.slice(),buildings:[...this.buildings.values()].map(b=>({...b}))};}
}
export function drawScouting(g,state,width,height){
  if(!state)return;const cw=width/state.cols,ch=height/state.rows;
  for(let row=0;row<state.rows;row++)for(let col=0;col<state.cols;col++){
    const i=row*state.cols+col;if(state.visible[i])continue;
    g.fillStyle=state.explored[i]?'rgba(10,18,17,.30)':'rgba(4,10,10,.65)';
    g.fillRect(col*cw,row*ch,cw+.5,ch+.5);
  }
}
