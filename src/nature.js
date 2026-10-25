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
      const i=I(x,y),t=terrain[i];
      const fx=x/24,fy=y/24,gx=Math.floor(fx),gy=Math.floor(fy),
        ux=(fx-gx)**2*(3-2*(fx-gx)),uy=(fy-gy)**2*(3-2*(fy-gy));
      const top=hash(gx,gy,seed+218)*(1-ux)+hash(gx+1,gy,seed+218)*ux;
      const bottom=hash(gx,gy+1,seed+218)*(1-ux)+hash(gx+1,gy+1,seed+218)*ux;
      const r=top*(1-uy)+bottom*uy;
      const latitude=Math.abs(y/H-.48);
      let b;
      if(latitude>.39)b=3;
      else if(r<.31)b=1;
      else if(r<.45)b=2;
      else if(r>.71)b=4;
      else if(r>.59)b=5;
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
    // A landscape brush ALWAYS wins over the climate: users can put brown
    // soil, sand or rocks anywhere. Climate only controls natural growth.
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
      const i=I(x,y),before=terrain[i],oldBiome=biome[i];
      biome[i]=b;overrides.set(i,b);
      // Painting a climate is also a terrain brush: it reclaims ANY tile,
      // including the middle of an ocean, a river or the top of a mountain.
      // Existing grass may stay where it is appropriate for the new biome.
      const target=b===1?SAND:b===3?SNOW:
        before===GRASS&&oldBiome!==1&&oldBiome!==3?GRASS:SOIL;
      if(before!==target){terrain[i]=target;onTerrainChange(i);}
      else terrainUpdated(i);
      if(b===4)moisture[i]=Math.max(moisture[i],70);
      else if(b===5)moisture[i]=Math.max(moisture[i],88);
      else if(b===1)moisture[i]=Math.min(moisture[i],22);
      if(growth[i])species[i]=assignSpecies(i);
    }
  }
  function rain(storms,dt){
    // A shower wets soil; it cannot create a flood or accumulating water cells.
    for(const s of storms){
      const attempts=storms.length>35?2:Math.max(3,Math.floor(20/Math.sqrt(storms.length)));
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
        if((moisture[i]>70&&Math.random()<.0035) || (moisture[i]>26&&Math.random()<.0009)){
          terrain[i]=GRASS;onTerrainChange(i);
        }
      }
      if(!growth[i]&&(
          (t===GRASS&&moisture[i]>35)||
          (b===1&&t===SAND)||(b===3&&t===SNOW)
        )&&Math.random()<.00035)seedAt(i%W,Math.floor(i/W));
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
      if(moisture[i]>=need&&Math.random()<(moisture[i]>80?.65:.26)){
        growth[i]=Math.min(255,g+(moisture[i]>80?7:3));
      }else if(b===1||b===3){
        if(Math.random()<.15)growth[i]=Math.min(255,g+3);
      }
    }
  }
  function step(dt,storms=[]){
    clock+=dt;elapsed=Math.min(elapsed+dt,.9);
    drops.forEach(d=>d.t+=dt);
    for(let i=drops.length-1;i>=0;i--)if(drops[i].t>drops[i].life)drops.splice(i,1);
    while(elapsed>=.45){elapsed-=.45;rain(storms,.45);tick();}
  }
  // Nature art: subdued colors, visible wood and layered asymmetrical foliage.
  // Avoid toy-like bright circles while keeping the mobile Canvas renderer light.
  function drawPlants(ctx,view,vw,vh,time){
    const x0=Math.max(0,Math.floor((view.x-vw/view.z/2)/T)-3),
      x1=Math.min(W,Math.ceil((view.x+vw/view.z/2)/T)+3),
      y0=Math.max(0,Math.floor((view.y-vh/view.z/2)/T)-3),
      y1=Math.min(H,Math.ceil((view.y+vh/view.z/2)/T)+3);
    let count=0;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      const i=I(x,y),g=growth[i];if(!g||++count>500)continue;
      const sp=species[i]||assignSpecies(i);
      const size=g===255?1:.17+.83*g/255;
      const px=(x+.5)*T,py=(y+.5)*T;
      const sway=Math.sin(time*.63+x*.47+y*.31)*.18;
      const v=hash(x,y,seed+301);
      ctx.save();ctx.translate(px,py);
      ctx.scale(Math.max(.16,size),Math.max(.16,size));
      ctx.fillStyle='rgba(28,40,31,.25)';
      ctx.beginPath();ctx.ellipse(1.6,3.3,5.7,1.8,-.1,0,Math.PI*2);ctx.fill();
      if(sp===2){ // desert cactus: dark green ribbed stem and thin dry spines
        ctx.strokeStyle='#315f4c';ctx.lineWidth=3.7;ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(0,3);ctx.lineTo(0,-11);ctx.stroke();
        ctx.lineWidth=2.5;ctx.beginPath();
        ctx.moveTo(0,-3);ctx.lineTo(-4,-3);ctx.lineTo(-4,-8);
        ctx.moveTo(0,-6);ctx.lineTo(4,-6);ctx.lineTo(4,-9);ctx.stroke();
        ctx.strokeStyle='#7fa48a';ctx.lineWidth=.7;
        ctx.beginPath();ctx.moveTo(-.8,1);ctx.lineTo(-.8,-10);ctx.moveTo(1.2,-1);ctx.lineTo(1.2,-9);ctx.stroke();
      }else if(sp===3){ // palm with bark and long drooping fronds
        ctx.strokeStyle='#806d52';ctx.lineWidth=2.7;ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(0,3);ctx.bezierCurveTo(1,-2,3,-8,sway,-15);ctx.stroke();
        ctx.strokeStyle='#b19a74';ctx.lineWidth=.6;
        for(let k=0;k<4;k++){const h=1-k*3;
          ctx.beginPath();ctx.moveTo(.5+k*.35,h);ctx.lineTo(2+k*.35,h+1.1);ctx.stroke();}
        const leaf=['#425f45','#536f49','#688151'];
        for(let k=0;k<7;k++){
          const a=(k/7)*Math.PI*2,dx=Math.cos(a)*10,dy=Math.sin(a)*5;
          ctx.strokeStyle=leaf[k%3];ctx.lineWidth=2.3;
          ctx.beginPath();ctx.moveTo(sway,-15);
          ctx.quadraticCurveTo(sway+dx*.7,-19+dy*.55,sway+dx,-14+dy+3);ctx.stroke();
        }
      }else if(sp===5){ // fir: overlapping jagged layers instead of toy triangles
        ctx.strokeStyle='#615f50';ctx.lineWidth=1.9;
        ctx.beginPath();ctx.moveTo(0,3);ctx.lineTo(sway,-15);ctx.stroke();
        const needles=['#234b43','#2d594a','#3d6b51','#55795e'];
        for(let tier=0;tier<4;tier++){
          const yy=-2-tier*3.5,wide=6.8-tier*1.25;
          ctx.fillStyle=needles[tier];ctx.beginPath();
          ctx.moveTo(sway,yy-7.3);
          ctx.lineTo(sway-wide*.65,yy-1);ctx.lineTo(sway-wide,yy+.5);
          ctx.lineTo(sway-wide*.34,yy+.3);
          ctx.lineTo(sway,yy+1.3);
          ctx.lineTo(sway+wide*.45,yy+.3);ctx.lineTo(sway+wide,yy+.5);
          ctx.lineTo(sway,yy-7.3);ctx.fill();
        }
      }else if(sp===4){ // savanna acacia: crooked woody branches, flat dry crown
        ctx.strokeStyle='#75684e';ctx.lineWidth=2;ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(0,3);ctx.lineTo(1,-6);ctx.lineTo(-4,-10);
        ctx.moveTo(1,-6);ctx.lineTo(5,-10);ctx.stroke();
        const leaves=['#596c40','#788448','#8e9957'];
        for(let k=0;k<3;k++){
          ctx.fillStyle=leaves[k];
          ctx.beginPath();ctx.ellipse((k-1)*4,-11-(k===1?2:0),
            5.5+(k===1?2:0),2.8+(k===1?.7:0),-.07,0,Math.PI*2);ctx.fill();
        }
      }else{
        const swamp=sp===7,jungle=sp===6;
        const bark=swamp?'#625d55':jungle?'#5f5c48':'#806c53';
        ctx.strokeStyle=bark;ctx.lineWidth=2.5;ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(0,3);
        ctx.bezierCurveTo(-1.1,-2,1+sway,-6,sway,-11);ctx.stroke();
        ctx.lineWidth=1.1;
        ctx.beginPath();ctx.moveTo(.1,-5);ctx.lineTo(-5,-9);
        ctx.moveTo(.3,-7);ctx.lineTo(5,-11);ctx.stroke();
        const crown=swamp?['#435f53','#586d5a','#778172']:
          jungle?['#255945','#3a7154','#558764']:
          ['#355e42','#4b7950','#668f59'];
        const shift=(v-.5)*1.3;
        // Offset leaf masses and dark underside give a restrained natural canopy.
        for(const [k,dx,dy,rx,ry] of [[0,-3,-9,5.9,4.2],
          [1,2.8,-11,5.7,4.6],[2,-.6,-14,4.6,3.6]]){
          ctx.fillStyle=crown[k];ctx.beginPath();
          ctx.ellipse(dx+shift+sway,dy+shift*.5,rx,ry,(k-1)*.16,0,Math.PI*2);ctx.fill();
        }
        if(swamp){
          ctx.strokeStyle='#7a8474';ctx.lineWidth=.65;
          for(let k=0;k<3;k++){const dx=-5+k*5;
            ctx.beginPath();ctx.moveTo(dx,-9);ctx.quadraticCurveTo(dx+1,-6,dx-.5,-4);ctx.stroke();}
        }
        if(jungle){
          ctx.strokeStyle='#527357';ctx.lineWidth=.75;
          ctx.beginPath();ctx.moveTo(-5,-11);ctx.quadraticCurveTo(-7,-3,-4,1);ctx.stroke();
        }
      }
      ctx.restore();
    }
    // Short lived watering droplets; not a standing body of flood water.
    ctx.save();ctx.strokeStyle='rgba(152,202,226,.72)';ctx.lineWidth=1.2;
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
    if(type===GRASS)return ['#80ab72','#c5b277','#baaa63','#e1e9dd','#589565','#718b74'][b];
    if(type===SOIL)return ['#977858','#c8a77c','#aa865e','#bcb4a5','#826b56','#716559'][b];
    if(type===SAND)return b===1?'#edcf83':'#ebca89';
    return null;
  }
  return {initialize,waterAt,scatterSeeds,seedAt,paintBiome,terrainUpdated,step,drawPlants,
    serialize,restore,getBiome,getMoisture,getPlant,getBiomeColor,BIOMES};
};
})(window);
