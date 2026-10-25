/* WorldSimulation 0.4 – surface physics, forests and persistent volcano vents.
   Cells simulate surface effects rather than three-dimensional liquids. */
(function(global){
  'use strict';
  global.createWorldElements=function({width:W,height:H,tile:T,terrain,altitude,onTerrainChange:changed,getPlant:plantAt}){
    const WATER=1,FIRE=2,ACID=3,LAVA=4,ASH=9;
    const cells=new Uint8Array(W*H),power=new Uint8Array(W*H);
    const next=new Uint8Array(W*H),nextPower=new Uint8Array(W*H);
    const sheet=document.createElement('canvas');sheet.width=W;sheet.height=H;
    const brush=sheet.getContext('2d');
    const palette=[null,[83,179,232],[252,105,34],[178,235,94],[255,111,41]];
    const volcanoes=[];
    let time=0,frame=0,dirty=true;
    const index=(x,y)=>y*W+x,inside=(x,y)=>x>=0&&x<W&&y>=0&&y<H;
    function setTerrain(i,type){
      if(terrain[i]!==type){terrain[i]=type;changed(i);}
    }
    function place(x,y,type,p=7){
      x|=0;y|=0;if(!inside(x,y))return false;
      const i=index(x,y);
      if(type===FIRE&&!([3,4].includes(terrain[i])||(plantAt&&plantAt(x,y)>0)))return false;
      if(type===WATER)return false; // Water is only moisture droplets, not a flooding cell.
      if(type===LAVA&&terrain[i]<2)setTerrain(i,5);
      if(type===LAVA&&terrain[i]===9)setTerrain(i,5);
      cells[i]=type;power[i]=Math.max(power[i],p);dirty=true;return true;
    }
    function addVolcano(x,y){
      if(!inside(x,y)||x<6||y<6||x>=W-6||y>=H-6)return false;
      if(volcanoes.some(v=>Math.hypot(v.x-x,v.y-y)<8))return false;
      const v={x,y,phase:Math.random()*Math.PI*2,eruption:0};
      volcanoes.push(v);
      for(let dy=-5;dy<=5;dy++)for(let dx=-5;dx<=5;dx++){
        const nx=x+dx,ny=y+dy,d=Math.hypot(dx,dy);
        if(!inside(nx,ny)||d>4.8)continue;
        const i=index(nx,ny);
        if(d<=3.1)setTerrain(i,5);
        else if(terrain[i]===4)setTerrain(i,3);
        if(d<=1.2)place(nx,ny,LAVA,9);
      }
      return true;
    }
    function paint(x,y,kind,radius=2){
      x=Math.floor(x);y=Math.floor(y);
      if(kind==='volcano'){addVolcano(x,y);return;}
      const type={ground:10,sand:7,rock:5,mountain:6}[kind];
      for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
        if(dx*dx+dy*dy>(radius+.25)*(radius+.25))continue;
        const nx=x+dx,ny=y+dy;if(!inside(nx,ny))continue;
        const i=index(nx,ny);
        if(type!==undefined){setTerrain(i,type);
          if(cells[i]){cells[i]=0;power[i]=0;dirty=true;}}
        else if(kind!=='water')place(nx,ny,kind==='fire'?FIRE:kind==='acid'?ACID:LAVA,8);
      }
    }
    const dirs=[[-1,0],[1,0],[0,-1],[0,1]];
    function tick(storms){
      frame++;
      for(const volcano of volcanoes){
        volcano.eruption++;
        // Persistent vent: lava leaves the little crater, then moves downhill.
        if(volcano.eruption%3===0){
          const angle=volcano.phase+Math.sin(frame*.073+volcano.x)*.45;
          const radius=2.5+(volcano.eruption%5)*.36;
          const x=Math.round(volcano.x+Math.cos(angle)*radius);
          const y=Math.round(volcano.y+Math.sin(angle)*radius);
          place(volcano.x,volcano.y,LAVA,9);
          place(x,y,LAVA,8);
          if(volcano.eruption%9===0)place(x+Math.sign(Math.cos(angle)),y+Math.sign(Math.sin(angle)),LAVA,7);
        }
      }
      next.set(cells);nextPower.set(power);
      for(let y=0;y<H;y++)for(let x=0;x<W;x++){
        const i=index(x,y),kind=cells[i],p=power[i];
        if(!kind||!p)continue;
        const nearby=[];
        const spin=(frame+x*3+y)%4;
        for(let k=0;k<4;k++){
          const [dx,dy]=dirs[(k+spin)%4],nx=x+dx,ny=y+dy;
          if(inside(nx,ny))nearby.push(index(nx,ny));
        }
        if(kind===FIRE){
          if(nearby.some(j=>cells[j]===WATER)){
            next[i]=nextPower[i]=0;setTerrain(i,ASH);dirty=true;continue;
          }
          // Fire consumes each grassy or wooded cell; ash will not ignite again.
          if(terrain[i]===4||terrain[i]===3||terrain[i]===7){
            if(Math.random()<.21)setTerrain(i,ASH);
          }
          for(const j of nearby){
            if(cells[j]||next[j])continue;
            const fuel=terrain[j],tree=plantAt?plantAt(j%W,Math.floor(j/W)):0;
            const chance=tree?.105:fuel===4?.095:fuel===3?.022:0;
            if(chance&&Math.random()<chance){
              next[j]=FIRE;nextPower[j]=(tree||fuel===4)?8:5;dirty=true;
            }
          }
          if(Math.random()<.36){
            nextPower[i]=Math.max(0,nextPower[i]-1);
            if(!nextPower[i])setTerrain(i,ASH);
            dirty=true;
          }
        }else{
          for(const j of nearby){
            if(cells[j]===WATER){
              next[i]=nextPower[i]=0;next[j]=nextPower[j]=0;
              if(kind===LAVA)setTerrain(i,5);
              dirty=true;break;
            }
            if(kind===ACID&&[3,4,5,6].includes(terrain[j])&&Math.random()<.055){
              setTerrain(j,terrain[j]===4?ASH:7);
            }
            if(kind===LAVA&&terrain[j]===4&&Math.random()<.10){
              setTerrain(j,ASH);
              if(!next[j]){next[j]=FIRE;nextPower[j]=6;}
            }
            if(terrain[j]>=2&&!next[j]&&p>2&&
              altitude[j]<=altitude[i]+(kind===LAVA?.11:.03)&&
              Math.random()<(kind===LAVA?.21:.19)){
              next[j]=kind;nextPower[j]=Math.max(2,p-2);
              nextPower[i]=Math.max(0,nextPower[i]-1);dirty=true;break;
            }
          }
          if(Math.random()<(kind===LAVA?.05:.12)){
            nextPower[i]=Math.max(0,nextPower[i]-1);
            if(kind===LAVA&&!nextPower[i])setTerrain(i,5);
            dirty=true;
          }
        }
      }
      for(let i=0;i<cells.length;i++)if(!nextPower[i])next[i]=0;
      cells.set(next);power.set(nextPower);dirty=true;
    }
    function texture(){
      const img=brush.createImageData(W,H),d=img.data;
      for(let i=0;i<cells.length;i++){
        const kind=cells[i];if(!kind)continue;
        const col=palette[kind],off=i*4,glimmer=Math.sin((i%W)*.65+frame*.17)*6;
        d[off]=col[0]+glimmer;
        d[off+1]=col[1]+glimmer;
        d[off+2]=col[2]+glimmer;
        d[off+3]=Math.min(245,130+power[i]*12);
      }
      brush.putImageData(img,0,0);dirty=false;
    }
    function step(dt,storms=[]){
      time=Math.min(.4,time+dt);
      let steps=0;
      while(time>=.14&&steps<3){time-=.14;tick(storms);steps++;}
      if(dirty)texture();
      return steps;
    }
    function reset(){cells.fill(0);power.fill(0);next.fill(0);nextPower.fill(0);volcanoes.length=0;brush.clearRect(0,0,W,H);time=0;frame=0;dirty=true;}
    function serialize(){
      const out=[];for(let i=0;i<cells.length;i++)if(cells[i])out.push([i,cells[i],power[i]]);
      return out;
    }
    function restore(rows){
      cells.fill(0);power.fill(0);
      if(Array.isArray(rows))for(const entry of rows.slice(0,W*H)){
        if(!Array.isArray(entry))continue;const [i,t,p]=entry;
        if(Number.isInteger(i)&&i>=0&&i<cells.length&&Number.isInteger(t)&&t>=2&&t<=4){
          cells[i]=t;power[i]=Math.max(1,Math.min(9,Number(p)||1));
        }
      }
      dirty=true;texture();
    }
    function restoreVolcanoes(rows){
      volcanoes.length=0;
      if(!Array.isArray(rows))return;
      for(const v of rows.slice(0,128)){
        if(!v||!Number.isInteger(v.x)||!Number.isInteger(v.y)||!inside(v.x,v.y))continue;
        volcanoes.push({x:v.x,y:v.y,phase:Number.isFinite(v.phase)?v.phase:0,
          eruption:Number.isFinite(v.eruption)?v.eruption:0});
      }
    }
    function extinguish(x,y){
      if(!inside(x,y))return;
      const i=index(x,y);
      if(cells[i]===FIRE){cells[i]=power[i]=0;dirty=true;}
      if(cells[i]===LAVA){cells[i]=power[i]=0;setTerrain(i,5);dirty=true;}
    }
    function draw(ctx){
      ctx.save();ctx.imageSmoothingEnabled=true;
      ctx.drawImage(sheet,0,0,W*T,H*T);ctx.restore();
    }
    function drawFlames(ctx,view,viewW,viewH,clock){
      if(view.z<.32)return;
      const x0=Math.max(0,Math.floor((view.x-viewW/(view.z*2))/T)-2);
      const y0=Math.max(0,Math.floor((view.y-viewH/(view.z*2))/T)-2);
      const x1=Math.min(W,Math.ceil((view.x+viewW/(view.z*2))/T)+2);
      const y1=Math.min(H,Math.ceil((view.y+viewH/(view.z*2))/T)+2);
      let painted=0;
      for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
        if(cells[index(x,y)]!==FIRE)continue;
        if(++painted>180)return;
        const px=x*T+T*.5,py=y*T+T*.7;
        const flicker=Math.sin(clock*10+x*1.7+y*.9);
        ctx.fillStyle='rgba(66,55,58,.22)';
        ctx.beginPath();ctx.arc(px+flicker*3,py-10-(clock*5+y)%9,2.6,0,6.283);ctx.fill();
        ctx.fillStyle='#ff9a2c';ctx.beginPath();
        ctx.moveTo(px-3,py+2);ctx.quadraticCurveTo(px-5,py-4,px+flicker*1.8,py-9-flicker*1.5);
        ctx.quadraticCurveTo(px+5,py-2,px+3,py+2);ctx.fill();
        ctx.fillStyle='#ffdf78';ctx.beginPath();
        ctx.moveTo(px-1.4,py+1);ctx.quadraticCurveTo(px-1,py-2,px,py-4);ctx.quadraticCurveTo(px+3,py-1,px+1.3,py+1);ctx.fill();
      }
    }
    return {paint,step,draw,drawFlames,reset,serialize,restore,restoreVolcanoes,
      getVolcanoes:()=>volcanoes,getType:(x,y)=>inside(x,y)?cells[index(x,y)]:0,extinguish,
      ignite:(x,y)=>place(x,y,FIRE,7),getCount:()=>cells.reduce((a,b)=>a+(b!==0),0)};
  };
})(window);
