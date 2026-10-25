/* WorldSimulation Nature 0.5 — soil, rainfall, biome plants and slow regrowth. */
(function(global){
'use strict';
global.createWorldNature=function({width:W,height:H,tile:T,terrain,onTerrainChange,onWater}){
  const SOIL=10,GRASS=3,SAND=7,SNOW=6,ASH=9;
  const BIOMES=['Обычный','Пустыня','Саванна','Зима','Джунгли','Болото'];
  const B={normal:0,desert:1,savanna:2,winter:3,jungle:4,swamp:5};
  const biome=new Uint8Array(W*H),moisture=new Uint8Array(W*H),growth=new Uint8Array(W*H);
  const species=new Uint8Array(W*H),overrides=new Map(),drops=[],recentlyWatered=new Set();
  const I=(x,y)=>y*W+x,valid=(x,y)=>x>=0&&y>=0&&x<W&&y<H;
  const hash=(x,y,seed)=>{
    let t=Math.imul((x+1)|0,374761393)^Math.imul((y+1)|0,668265263)^(seed|0);
    t=Math.imul(t^(t>>>13),1274126177);return ((t^(t>>>16))>>>0)/4294967295;
  };
  let seed=1,elapsed=0,clock=0;
  function getBiome(x,y){return valid(x,y)?biome[I(x,y)]:0;}
  function getMoisture(x,y){return valid(x,y)?moisture[I(x,y)]:0;}
  function getPlant(x,y){return valid(x,y)?growth[I(x,y)]:0;}
  function assignSpecies(i){
    const b=biome[i];
    if(b===1)return moisture[i]>125?3:2; // palm vs cactus
    return [1,2,4,5,6,7][b]||1;
  }
  function initialize(worldSeed){
    seed=worldSeed|0;elapsed=0;clock=0;overrides.clear();drops.length=0;recentlyWatered.clear();
    moisture.fill(0);growth.fill(0);species.fill(0);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const i=I(x,y),t=terrain[i],r=hash(x>>3,y>>3,seed+218);
      const latitude=Math.abs(y/H-.48);
      let b;
      if(latitude>.39)b=3;
      else if(r<.16)b=1;
      else if(r<.33)b=2;
      else if(r>.79)b=4;
      else if(r>.64)b=5;
      else b=0;
      biome[i]=b;
      if(t<2||t===8||t===5)continue;
      moisture[i]=b===4?78:b===5?95:b===2?28:b===1?5:b===3?18:35;
      if(t===3||t===4){
        if(b===1){terrain[i]=SAND;}
        else if(b===3){terrain[i]=SNOW;}
        else {
          // Planting is based on the underlying surface; some initial grass
          // and trees make the generated world feel alive from the first frame.
          const grass=hash(x,y,seed+47)<(b===4?.77:b===5?.61:b===2?.25:.43);
          terrain[i]=grass?GRASS:SOIL;
          if(grass&&t===4&&hash(x,y,seed+89)<.37){
            growth[i]=255;species[i]=assignSpecies(i);
          }
        }
      }
    }
  }
  function seedAt(x,y,amount=2){
    if(!valid(x,y))return false;
    const i=I(x,y),t=terrain[i],b=biome[i];
    if(growth[i]||!(t===GRASS||(b===1&&t===SAND)||(b===3&&t===SNOW)))return false;
    if((b!==1&&b!==3)&&moisture[i]<18)return false;
    growth[i]=Math.max(1,Math.round(hash(x,y,seed+Math.round(clock))*18)+1);
    species[i]=assignSpecies(i);
    return true;
  }
  function scatterSeeds(cx,cy,radius=2){
    for(let y=cy-radius;y<=cy+radius;y++)for(let x=cx-radius;x<=cx+radius;x++){
      if((x-cx)**2+(y-cy)**2>radius*radius||!valid(x,y))continue;
      if(hash(x,y,seed+Math.round(clock*10))<.62)seedAt(x,y);
    }
  }
  function clearPlant(i){growth[i]=0;species[i]=0;}
  function terrainUpdated(i){
    if(!Number.isInteger(i)||i<0||i>=terrain.length)return;
    const t=terrain[i],b=biome[i];
    if((t!==GRASS&&!(b===1&&t===SAND)&&!(b===3&&t===SNOW))||t===ASH)clearPlant(i);
  }
  function waterAt(cx,cy,radius=2,amount=38,animate=true){
    cx=Math.floor(cx);cy=Math.floor(cy);
    for(let y=cy-radius;y<=cy+radius;y++)for(let x=cx-radius;x<=cx+radius;x++){
      if(!valid(x,y)||(x-cx)**2+(y-cy)**2>radius*radius)continue;
      const i=I(x,y),b=biome[i],t=terrain[i];
      if(t<2||t===5||t===8)continue;
      if(t!==SNOW){moisture[i]=Math.min(255,moisture[i]+amount);if(t===SOIL)recentlyWatered.add(i);}
      if(onWater)onWater(x,y);
      if(animate&&drops.length<180)drops.push({x:x*T+T*.5,y:y*T+T*.4,t:0,life:.5+hash(x,y,seed)*.35});
    }
  }
  function paintBiome(cx,cy,kind,radius=3){
    const b=B[kind];if(b===undefined)return;
    for(let y=cy-radius;y<=cy+radius;y++)for(let x=cx-radius;x<=cx+radius;x++){
      if(!valid(x,y)||(x-cx)**2+(y-cy)**2>radius*radius)continue;
      const i=I(x,y);biome[i]=b;overrides.set(i,b);
      const t=terrain[i];
      if(t<2||t===5||t===8)continue;
      if(b===1&&[GRASS,SOIL,4,SNOW].includes(t)){terrain[i]=SAND;onTerrainChange(i);}
      else if(b===3&&[GRASS,SOIL,4,SAND].includes(t)){terrain[i]=SNOW;onTerrainChange(i);}
      else if((t===SAND||t===SNOW)&&[0,2,4,5].includes(b)){
        terrain[i]=SOIL;onTerrainChange(i);
      }
      if(b===4)moisture[i]=Math.max(moisture[i],70);
      else if(b===5)moisture[i]=Math.max(moisture[i],88);
      else if(b===1)moisture[i]=Math.min(moisture[i],22);
      terrainUpdated(i);
    }
  }
  function rain(storms,dt){
    // A shower wets soil; it cannot create a flood or accumulating water cells.
    for(const s of storms){
      const attempts=storms.length>35?1:3;
      for(let n=0;n<attempts;n++){
        const a=Math.random()*Math.PI*2,r=Math.sqrt(Math.random())*s.radius/T;
        const x=Math.floor(s.x/T+Math.cos(a)*r),y=Math.floor(s.y/T+Math.sin(a)*r);
        waterAt(x,y,0,19,false);
      }
    }
  }
  function tick(){
    const attempts=1200;
    for(let k=0;k<attempts;k++){
      const i=Math.floor(Math.random()*terrain.length),t=terrain[i],b=biome[i];
      if(t===SOIL&&b!==1&&b!==3){
        // Wet soil greens quickly; ordinary climate occasionally grows wild grass.
        if(moisture[i]>70&&Math.random()<.40 || moisture[i]>26&&Math.random()<.012){
          terrain[i]=GRASS;onTerrainChange(i);
        }
      }
      if(t===GRASS&&!growth[i]&&moisture[i]>35&&Math.random()<.0015)seedAt(i%W,Math.floor(i/W));
      if(moisture[i]>0&&Math.random()<.20)moisture[i]--;
    }
    let wetChecked=0;
    for(const i of recentlyWatered){
      if(++wetChecked>1700)break;
      if(terrain[i]===SOIL&&biome[i]!==1&&biome[i]!==3){
        if(moisture[i]>60&&Math.random()<(.13+moisture[i]/900)){
          terrain[i]=GRASS;onTerrainChange(i);recentlyWatered.delete(i);
        }
      }else recentlyWatered.delete(i);
      if(moisture[i]<12)recentlyWatered.delete(i);
    }
    // Existing planted seeds grow faster on damp soil; spontaneous plants have
    // the same biology but appear much less often.
    for(let i=0;i<growth.length;i++){
      const g=growth[i];if(!g||g===255)continue;
      const b=biome[i],need=b===1?1:b===3?5:12;
      if(moisture[i]>=need&&Math.random()<(moisture[i]>80?.35:.12)){
        growth[i]=Math.min(255,g+Math.max(1,Math.round(moisture[i]/65)));
      }else if(b===1||b===3){
        if(Math.random()<.07)growth[i]=Math.min(255,g+1);
      }
    }
  }
  function step(dt,storms=[]){
    clock+=dt;elapsed=Math.min(elapsed+dt,.9);
    drops.forEach(d=>d.t+=dt);
    for(let i=drops.length-1;i>=0;i--)if(drops[i].t>drops[i].life)drops.splice(i,1);
    while(elapsed>=.45){elapsed-=.45;rain(storms,.45);tick();}
  }
  function drawPlants(ctx,view,vw,vh,time){
    const x0=Math.max(0,Math.floor((view.x-vw/view.z/2)/T)-3),
      x1=Math.min(W,Math.ceil((view.x+vw/view.z/2)/T)+3),
      y0=Math.max(0,Math.floor((view.y-vh/view.z/2)/T)-3),
      y1=Math.min(H,Math.ceil((view.y+vh/view.z/2)/T)+3);
    let count=0;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      const i=I(x,y),g=growth[i];if(!g||++count>700)continue;
      const sp=species[i]||assignSpecies(i),size=(g===255?1:.13+.87*g/255);
      const px=(x+.5)*T,py=(y+.5)*T,sway=Math.sin(time*1.3+x*.7+y*.5)*.55;
      ctx.save();ctx.translate(px,py);ctx.scale(Math.max(.15,size),Math.max(.15,size));
      ctx.fillStyle='rgba(36,52,39,.22)';ctx.beginPath();ctx.ellipse(1,3,5,2,0,0,Math.PI*2);ctx.fill();
      if(sp===2){ // cactus
        ctx.strokeStyle='#318867';ctx.lineWidth=3.5;ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(0,3);ctx.lineTo(0,-10);ctx.moveTo(0,-4);ctx.lineTo(-4,-4);
        ctx.lineTo(-4,-8);ctx.moveTo(0,-6);ctx.lineTo(4,-6);ctx.lineTo(4,-9);ctx.stroke();
      }else if(sp===5){ // fir
        ctx.strokeStyle='#81694d';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,3);ctx.lineTo(0,-9);ctx.stroke();
        for(let j=0;j<3;j++){const yy=-4-j*4,w=6-j*1.4;
          ctx.fillStyle=['#2a7359','#3d9367','#66ac79'][j];
          ctx.beginPath();ctx.moveTo(sway,yy-8);ctx.lineTo(-w,yy+2);ctx.lineTo(w,yy+2);ctx.closePath();ctx.fill();}
      }else if(sp===4){ // acacia
        ctx.strokeStyle='#8b7149';ctx.lineWidth=2.3;ctx.beginPath();ctx.moveTo(0,3);ctx.lineTo(sway,-7);ctx.stroke();
        ctx.fillStyle='#819d4c';ctx.beginPath();ctx.ellipse(sway,-9,9,3.6,0,0,Math.PI*2);ctx.fill();
      }else{
        ctx.strokeStyle=sp===7?'#6c6356':'#927653';ctx.lineWidth=2.5;
        ctx.beginPath();ctx.moveTo(0,3);ctx.quadraticCurveTo(sway*2,-4,sway,-9);ctx.stroke();
        const base=sp===3?'#39a17a':sp===6?'#2e9160':sp===7?'#698270':'#4caa63';
        ctx.fillStyle=base;ctx.beginPath();ctx.ellipse(sway-2,-10,6.5,6,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=sp===7?'#859482':sp===6?'#3ac47b':'#8bd775';
        ctx.beginPath();ctx.arc(sway+2,-12,5.2,0,Math.PI*2);ctx.fill();
      }
      ctx.restore();
    }
    // Droplets travel down without forming flood water.
    ctx.save();ctx.strokeStyle='rgba(156,224,255,.75)';ctx.lineWidth=1.2;
    for(const d of drops){
      if(Math.abs(d.x-view.x)>vw/(2*view.z)+20||Math.abs(d.y-view.y)>vh/(2*view.z)+20)continue;
      const progress=Math.min(1,d.t/d.life);ctx.globalAlpha=1-progress;
      ctx.beginPath();ctx.moveTo(d.x,d.y-10+progress*12);
      ctx.lineTo(d.x-1,d.y-5+progress*12);ctx.stroke();
      if(progress>.7){ctx.beginPath();ctx.ellipse(d.x,d.y+5,(progress-.7)*11,1.1,0,0,Math.PI*2);ctx.stroke();}
    }
    ctx.restore();
  }
  function serialize(){
    const m=[],p=[];
    for(let i=0;i<moisture.length;i++){if(moisture[i]>4)m.push([i,moisture[i]]);if(growth[i])p.push([i,growth[i],species[i]]);}
    return {m,p,b:[...overrides.entries()]};
  }
  function restore(data){
    if(!data||typeof data!=='object')return;
    moisture.fill(0);growth.fill(0);species.fill(0);recentlyWatered.clear();
    if(Array.isArray(data.b))for(const [i,b] of data.b.slice(0,W*H)){
      if(Number.isInteger(i)&&i>=0&&i<biome.length&&Number.isInteger(b)&&b>=0&&b<6){
        biome[i]=b;overrides.set(i,b);
      }
    }
    if(Array.isArray(data.m))for(const [i,m] of data.m.slice(0,W*H)){
      if(Number.isInteger(i)&&i>=0&&i<moisture.length)moisture[i]=Math.max(0,Math.min(255,Number(m)||0));
    }
    if(Array.isArray(data.p))for(const [i,g,sp] of data.p.slice(0,W*H)){
      if(Number.isInteger(i)&&i>=0&&i<growth.length&&Number.isInteger(g)&&g>0){
        growth[i]=Math.min(255,g);species[i]=Number.isInteger(sp)?sp:assignSpecies(i);terrainUpdated(i);
      }
    }
  }
  function getBiomeColor(type,x,y){
    const b=getBiome(x,y);
    if(type===GRASS)return ['#a2d575','#e5c780','#c5af55','#edf0e5','#5bac67','#789879'][b];
    if(type===SOIL)return ['#9c7553','#d6b47a','#b48a4e','#d2cbb6','#82644c','#71635b'][b];
    if(type===SAND)return b===1?'#edcf83':'#ebca89';
    return null;
  }
  return {initialize,waterAt,scatterSeeds,seedAt,paintBiome,terrainUpdated,step,drawPlants,
    serialize,restore,getBiome,getMoisture,getPlant,getBiomeColor,BIOMES};
};
})(window);
