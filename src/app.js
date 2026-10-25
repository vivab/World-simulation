/* WorldSimulation alpha 0.3 — mobile-friendly world physics sandbox. */
(() => {
  'use strict';
  const W = 224, H = 144, TILE = 8, SAVE_KEY = 'worldsimulation-save-v1';
  const COLORS = ['#e9b56e', '#ca98e2', '#89d4c9', '#e47e83', '#bed678'];
  const NAMES = ['Аурелия', 'Нордхейм', 'Валория', 'Элирия', 'Равенхольд', 'Соларис', 'Аркания', 'Эстерия'];
  const BIOME = ['Глубокий океан', 'Море', 'Пляж', 'Луг', 'Лес', 'Горы', 'Снежные горы', 'Пустыня', 'Река'];
  const PALETTE = ['#225a83', '#498bb6', '#f3d78d', '#92c77b', '#52a46c', '#999ba0', '#d9dee1', '#ebbb72', '#6eb8db'];
  const canvas = document.querySelector('#world'), ctx = canvas.getContext('2d', {alpha:false});
  const minimap = document.querySelector('#minimap'), miniCtx = minimap.getContext('2d');
  const $ = id => document.getElementById(id);
  const worldCanvas = document.createElement('canvas');
  worldCanvas.width = W*TILE; worldCanvas.height = H*TILE;
  const tctx = worldCanvas.getContext('2d');
  const terrain = new Uint8Array(W*H), altitude = new Float32Array(W*H);
  let terrainDirty=false,terrainRedrawAt=0;
  const elements=window.createWorldElements({width:W,height:H,tile:T,terrain,altitude,
    onTerrainChange:(index)=>{terrainDirty=true;if(Number.isInteger(index))state.changes[index]=terrain[index];}});
  const PAINT_TOOLS=new Set(['ground','forest','sand','rock','mountain','water','fire','acid','lava','rain','meteor','volcano']);
  let activeCategory='world',lastBrushCell='',lastRainSpot=null;
  const camera = {x:0,y:0,z:1};
  // Rendered camera follows the target instead of snapping to touch input.
  const targetCamera = {x:0,y:0,z:1};
  const motion = {vx:0,vy:0};
  const syncCamera = () => {camera.x=targetCamera.x;camera.y=targetCamera.y;camera.z=targetCamera.z;motion.vx=0;motion.vy=0;};
  const state = {seed:1,year:1,cities:[],units:[],effects:[],storms:[],weatherTime:0,changes:{},tool:'look',speed:1,paused:false,ready:false,elapsed:0};
  let random = Math.random, viewW=0, viewH=0, last=0, statsAt=0, toastTimeout=0, moved=false;
  const pointers = new Map(); let dragStart=null,pinchStart=null,gestureMoved=false;
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const at = (x,y) => y*W+x;
  const rand = (a,b) => a+(b-a)*random();
  const rng = seed => {let a=seed>>>0;return () => {a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};};
  const hash = (x,y,s) => {let n=Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(s,1442695041);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
  const smooth = t => t*t*(3-2*t);
  function noise(x,y,s) {const ix=Math.floor(x), iy=Math.floor(y), u=smooth(x-ix),v=smooth(y-iy);
    const a=hash(ix,iy,s)*(1-u)+hash(ix+1,iy,s)*u, b=hash(ix,iy+1,s)*(1-u)+hash(ix+1,iy+1,s)*u;return a*(1-v)+b*v;}
  function fbm(x,y,s) {return .52*noise(x,y,s)+.28*noise(x*2,y*2,s)+.14*noise(x*4,y*4,s)+.06*noise(x*8,y*8,s);}
  function setInfo(title,message) {$('infoTitle').textContent=title;$('infoText').textContent=message;}
  function toast(message) {const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.remove('show'),2400);}
  function isLand(x,y) {return x>=0&&y>=0&&x<W&&y<H&&terrain[at(x,y)]>=2&&terrain[at(x,y)]!==8;}
  function passable(x,y) {return isLand(Math.floor(x),Math.floor(y));}
  function generate(seed) {
    state.seed=seed>>>0;random=rng(state.seed);state.changes={};
    const islands=Array.from({length:6},()=>({x:rand(.12,.88)*W,y:rand(.13,.86)*H,rx:rand(23,55),ry:rand(18,37)}));
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      let shape=0;for(const i of islands){const dx=(x-i.x)/i.rx,dy=(y-i.y)/i.ry;shape=Math.max(shape,Math.exp(-1.35*(dx*dx+dy*dy)));}
      const h=clamp(.64*fbm(x*.027,y*.027,seed)+.48*shape-.12,0,1);
      const m=fbm(x*.035+80,y*.035-40,seed+37);
      const temperature=.82-Math.abs(y/H-.5)*.9-h*.25;
      const idx=at(x,y);altitude[idx]=h;
      terrain[idx]=h<.33?0:h<.455?1:h<.49?2:h>.76&&temperature<.42?6:h>.735?5:temperature>.59&&m<.43?7:m>.525?4:3;
    }
    // A handful of mountain-sourced rivers, following downhill to the sea.
    for(let r=0;r<15;r++){
      let x=Math.floor(rand(0,W)),y=Math.floor(rand(0,H));
      if(altitude[at(x,y)]<.64)continue;
      const seen=new Set();
      for(let k=0;k<85;k++){
        const i=at(x,y);if(seen.has(i)||terrain[i]<2)break;
        seen.add(i);if(terrain[i]!==5&&terrain[i]!==6)terrain[i]=8;
        let best=null,bestValue=Infinity;
        for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){const nx=x+dx,ny=y+dy;
          if(nx<0||nx>=W||ny<0||ny>=H||seen.has(at(nx,ny)))continue;
          const v=altitude[at(nx,ny)]+hash(nx,ny,seed+2)*.006;
          if(v<bestValue){bestValue=v;best=[nx,ny];}}
        if(!best||bestValue>altitude[i]+.012)break;[x,y]=best;
      }
    }
    elements.reset();drawTerrain();
  }
  function drawTerrain() {
    const img=tctx.createImageData(W*TILE,H*TILE), d=img.data;
    // Build the terrain texture once. Runtime draws a single cached bitmap.
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const type=terrain[at(x,y)],color=PALETTE[type];
      const base=[parseInt(color.slice(1,3),16),parseInt(color.slice(3,5),16),parseInt(color.slice(5,7),16)];
      const tint=(hash(x,y,state.seed+8)-.5)*23;
      for(let py=0;py<TILE;py++)for(let px=0;px<TILE;px++){
        const idx=((y*TILE+py)*(W*TILE)+(x*TILE+px))*4;
        const variation=hash(x*TILE+px,y*TILE+py,state.seed+9);
        let shade=tint+(variation>.94?13:variation<.06?-12:0);
        if((type===0||type===1)&&(px===0||py===0))shade+=4;
        if(type===4&&px>=2&&px<=5&&py>=1&&py<=4)shade-=11;
        if(type===5&&px>=Math.abs(py-4)+1&&px<=7-Math.abs(py-4))shade+=19;
        if(type===6&&px>1&&px<6&&py<4)shade+=17;
        d[idx]=clamp(base[0]+shade,0,255);d[idx+1]=clamp(base[1]+shade,0,255);d[idx+2]=clamp(base[2]+shade,0,255);d[idx+3]=255;
      }
    }
    tctx.putImageData(img,0,0);drawMinimap();terrainDirty=false;
  }
  function chooseLand(minDistance=0,near=null) {
    for(let attempts=0;attempts<1800;attempts++){
      let x=near?Math.round(near.x+rand(-30,30)):Math.floor(rand(10,W-10));
      let y=near?Math.round(near.y+rand(-25,25)):Math.floor(rand(10,H-10));
      if(!isLand(x,y)||![3,4,7].includes(terrain[at(x,y)]))continue;
      if(state.cities.some(c=>Math.hypot(c.x-x,c.y-y)<minDistance))continue;
      return {x,y};
    }return null;
  }
  function createCity(x,y,kingdom=null,quiet=false){
    if(!isLand(x,y))return false;
    if(state.cities.some(c=>Math.hypot(c.x-x,c.y-y)<7))return false;
    const faction=kingdom??state.cities.reduce((m,c)=>Math.max(m,c.faction),-1)+1;
    const city={id:state.cities.reduce((m,c)=>Math.max(m,c.id),0)+1,x,y,faction,
      name:NAMES[faction%NAMES.length]+(kingdom===null?'':` · ${state.cities.length+1}`),pop:Math.floor(rand(12,27)),food:25,age:0};
    state.cities.push(city);
    for(let i=0;i<Math.min(12,city.pop);i++)spawnUnit(city);
    if(!quiet){toast(`Основано поселение ${city.name}`);setInfo(city.name,'Новое поселение основано. Жители будут собирать ресурсы, расти и исследовать соседние земли.');}
    return true;
  }
  function spawnUnit(city){
    if(state.units.length>=600)return;
    state.units.push({x:city.x+rand(-2,2),y:city.y+rand(-2,2),tx:city.x,ty:city.y,city:city.id,speed:rand(.35,.85)});
  }
  function startNew(seed= Math.floor(Math.random()*4294967295)) {
    state.year=1;state.cities=[];state.units=[];state.effects=[];state.storms=[];state.weatherTime=0;state.elapsed=0;
    generate(seed);
    for(let f=0;f<3;f++){const p=chooseLand(25);if(p)createCity(p.x,p.y,null,true);}
    const first=state.cities[0];if(first){targetCamera.x=first.x*TILE;targetCamera.y=first.y*TILE;}
    syncCamera();clampCamera(camera);clampCamera(targetCamera);
    state.ready=true;updateStats();toast('Рождён новый мир!');setInfo('Новая эпоха','Три молодых народа начинают свою историю. Используй инструменты внизу, чтобы менять их судьбу.');
  }
  function updateSim(){
    state.year++;
    const additions=[];
    for(const city of state.cities){
      city.age++;const resources=(terrain[at(city.x,city.y)]===7?.6:1);
      const production=Math.floor(rand(2,6)*resources),need=Math.max(1,Math.floor(city.pop/28));
      city.food=clamp(city.food+production-need,0,200);
      if(city.food>4&&random()<.68){city.pop+=Math.max(1,Math.floor(city.pop*.025));city.food-=2;}
      else if(city.food===0&&city.pop>5)city.pop--;
      if(city.pop>42&&state.units.filter(u=>u.city===city.id).length<Math.min(23,Math.floor(city.pop/4)))spawnUnit(city);
      if(city.pop>=55&&state.cities.length+additions.length<22&&random()<.037){
        const site=chooseLand(14,city);if(site)additions.push({site,faction:city.faction});
      }
    }
    for(const item of additions)createCity(item.site.x,item.site.y,item.faction,true);
    updateStats();
    if(state.year%18===0)save(true);
  }
  function updateUnits(dt){
    for(const u of state.units){
      const city=state.cities.find(c=>c.id===u.city);
      if(!city)continue;
      const dx=u.tx-u.x,dy=u.ty-u.y,dist=Math.hypot(dx,dy);
      if(dist<.35){const theta=rand(0,Math.PI*2),radius=rand(1,7);
        const tx=clamp(city.x+Math.cos(theta)*radius,0,W-1),ty=clamp(city.y+Math.sin(theta)*radius,0,H-1);
        if(passable(tx,ty)){u.tx=tx;u.ty=ty;}else{u.tx=city.x;u.ty=city.y;}
      }else{const step=Math.min(dist,dt*u.speed*1.3);const nx=u.x+dx/dist*step,ny=u.y+dy/dist*step;
        if(passable(nx,ny)){u.x=nx;u.y=ny;}else{u.tx=city.x;u.ty=city.y;}
      }
    }
  }
  function updateStats(){
    $('year').textContent=state.year.toLocaleString('ru');
    $('population').textContent=state.cities.reduce((n,c)=>n+c.pop,0).toLocaleString('ru');
    $('kingdoms').textContent=new Set(state.cities.map(c=>c.faction)).size;
  }
  function drawMinimap(){
    const off=document.createElement('canvas');off.width=W;off.height=H;const o=off.getContext('2d');
    const img=o.createImageData(W,H);
    for(let i=0;i<terrain.length;i++){const c=PALETTE[terrain[i]];img.data[i*4]=parseInt(c.slice(1,3),16);img.data[i*4+1]=parseInt(c.slice(3,5),16);img.data[i*4+2]=parseInt(c.slice(5,7),16);img.data[i*4+3]=255;}
    o.putImageData(img,0,0);miniCtx.imageSmoothingEnabled=false;miniCtx.clearRect(0,0,minimap.width,minimap.height);miniCtx.drawImage(off,0,0,minimap.width,minimap.height);
  }
  function drawMinimapOverlay(){
    // Terrain is static; markers and viewport are cheap to redraw over it.
    drawMinimap();
    const sx=minimap.width/W,sy=minimap.height/H;
    for(const c of state.cities){miniCtx.fillStyle=COLORS[c.faction%COLORS.length];miniCtx.fillRect(c.x*sx-2,c.y*sy-2,4,4);}
    const left=(camera.x-viewW/(2*camera.z))/TILE,top=(camera.y-viewH/(2*camera.z))/TILE;
    miniCtx.strokeStyle='#fff7d9';miniCtx.lineWidth=1.4;miniCtx.strokeRect(left*sx,top*sy,viewW/(camera.z*TILE)*sx,viewH/(camera.z*TILE)*sy);
  }
  function clampCamera(view=camera){
    const halfW=viewW/(2*view.z),halfH=viewH/(2*view.z);
    view.x=halfW*2>W*TILE?W*TILE/2:clamp(view.x,halfW,W*TILE-halfW);
    view.y=halfH*2>H*TILE?H*TILE/2:clamp(view.y,halfH,H*TILE-halfH);
  }
  function updateCamera(dt){
    // Inertial glide slows exponentially; user input interrupts it immediately.
    const friction=Math.exp(-dt*5.8);
    if(pointers.size===0){
      targetCamera.x+=motion.vx*dt;
      targetCamera.y+=motion.vy*dt;
      motion.vx*=friction;motion.vy*=friction;
      if(Math.abs(motion.vx)<1)motion.vx=0;
      if(Math.abs(motion.vy)<1)motion.vy=0;
    }
    clampCamera(targetCamera);
    if(targetCamera.x<=viewW/(2*targetCamera.z)||targetCamera.x>=W*TILE-viewW/(2*targetCamera.z))motion.vx=0;
    if(targetCamera.y<=viewH/(2*targetCamera.z)||targetCamera.y>=H*TILE-viewH/(2*targetCamera.z))motion.vy=0;
    const follow=1-Math.exp(-dt*(pointers.size?22:13));
    const zoomFollow=1-Math.exp(-dt*16);
    camera.x+=(targetCamera.x-camera.x)*follow;
    camera.y+=(targetCamera.y-camera.y)*follow;
    camera.z+=(targetCamera.z-camera.z)*zoomFollow;
    clampCamera(camera);
  }
  function resize(){
    const rect=canvas.getBoundingClientRect();viewW=rect.width;viewH=rect.height;
    const dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(viewW*dpr);canvas.height=Math.round(viewH*dpr);
    camera.z=camera.z||1;ctx.imageSmoothingEnabled=false;clampCamera();clampCamera(targetCamera);
  }
  function screenToWorld(sx,sy,view=camera){return {x:(sx-viewW/2)/view.z+view.x,y:(sy-viewH/2)/view.z+view.y};}
  function zoomAt(sx,sy,factor){const before=screenToWorld(sx,sy,targetCamera);
    const minZ=Math.max(.22,Math.min(viewW/(W*TILE),viewH/(H*TILE))*.9);
    targetCamera.z=clamp(targetCamera.z*factor,minZ,3.6);
    targetCamera.x=before.x-(sx-viewW/2)/targetCamera.z;
    targetCamera.y=before.y-(sy-viewH/2)/targetCamera.z;clampCamera(targetCamera);
  }
  function draw(timestamp){
    const dt=Math.min(.05,(timestamp-last)/1000||.016);last=timestamp;
    updateCamera(dt);
    if(state.ready){
      if(!state.paused){state.elapsed+=dt*state.speed;while(state.elapsed>=2){state.elapsed-=2;updateSim();}updateUnits(dt*state.speed);}
      state.effects=state.effects.filter(e=>(e.life-=dt)>0);
      if(!state.paused)state.weatherTime+=dt;
      state.storms=state.storms.filter(storm=>state.weatherTime-storm.start<storm.duration);
      if(!state.paused)elements.step(dt*state.speed,state.storms);
    }
    if(terrainDirty&&timestamp-terrainRedrawAt>110){drawTerrain();terrainRedrawAt=timestamp;}
    const dpr=canvas.width/viewW;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#1c3a50';ctx.fillRect(0,0,viewW,viewH);
    ctx.save();ctx.translate(viewW/2,viewH/2);ctx.scale(camera.z,camera.z);ctx.translate(-camera.x,-camera.y);
    ctx.imageSmoothingEnabled=false;ctx.drawImage(worldCanvas,0,0);
    elements.draw(ctx);
    for(const c of state.cities){
      const x=c.x*TILE+4,y=c.y*TILE+4;
      if(Math.abs(x-camera.x)>viewW/camera.z/2+100||Math.abs(y-camera.y)>viewH/camera.z/2+100)continue;
      const radius=Math.min(18,8+c.pop/30);
      ctx.fillStyle=COLORS[c.faction%COLORS.length]+'29';ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=COLORS[c.faction%COLORS.length];ctx.lineWidth=1.3;ctx.stroke();
      ctx.fillStyle='#27333a';ctx.fillRect(x-6,y-7,12,12);ctx.fillStyle='#b4c9b8';ctx.fillRect(x-5,y-7,10,6);
      ctx.fillStyle=COLORS[c.faction%COLORS.length];ctx.fillRect(x-2,y-12,4,5);ctx.fillStyle='#28292b';ctx.fillRect(x-1,y+1,3,4);
    }
    if(camera.z>.36){for(const u of state.units){const city=state.cities.find(c=>c.id===u.city);if(!city)continue;
      ctx.fillStyle=COLORS[city.faction%COLORS.length];ctx.fillRect(u.x*TILE+2,u.y*TILE+2,3,3);}}
    for(const e of state.effects){const r=(1-e.life/e.max)*e.radius*TILE;
      ctx.strokeStyle=e.color;ctx.lineWidth=2.4;ctx.globalAlpha=e.life/e.max;ctx.beginPath();ctx.arc(e.x*TILE,e.y*TILE,r,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}
    drawWeather();
    ctx.restore();
    // Labels remain legible even at low zoom.
    ctx.font='600 11px system-ui';ctx.textAlign='center';ctx.textBaseline='bottom';
    for(const c of state.cities){const x=(c.x*TILE+4-camera.x)*camera.z+viewW/2,y=(c.y*TILE+4-camera.y)*camera.z+viewH/2;
      if(x<-70||y<-50||x>viewW+70||y>viewH+50)continue;
      const name=c.name.split(' · ')[0];const tw=ctx.measureText(name).width;
      ctx.fillStyle='#0c1b1fe0';ctx.fillRect(x-tw/2-7,y-28,tw+14,19);
      ctx.fillStyle=COLORS[c.faction%COLORS.length];ctx.fillText(name,x,y-14);
    }
    if(timestamp-statsAt>450){drawMinimapOverlay();statsAt=timestamp;}
    requestAnimationFrame(draw);
  }
  // Rain is rendered in world coordinates: storms stay above the land that was tapped.
  // Stable hashed particles give smooth 60fps motion without creating objects each frame.
  function drawWeather(){
    if(!state.storms.length)return;
    const visible=state.storms.filter(st=>
      Math.abs(st.x-camera.x)<viewW/(2*camera.z)+st.radius&&
      Math.abs(st.y-camera.y)<viewH/(2*camera.z)+st.radius);
    const dropsPerStorm=Math.max(7,Math.min(165,Math.floor(2300/Math.max(1,visible.length))));
    const splashCount=Math.max(2,Math.floor(14/Math.sqrt(Math.max(1,visible.length))));
    for(const storm of visible){
      const age=Math.max(0,state.weatherTime-storm.start);
      const fade=clamp(age/.65,0,1)*clamp((storm.duration-age)/1.4,0,1);
      if(fade<=0)continue;
      const r=storm.radius,x=storm.x,y=storm.y;
      if(Math.abs(x-camera.x)>viewW/(2*camera.z)+r||Math.abs(y-camera.y)>viewH/(2*camera.z)+r)continue;
      ctx.save();
      ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.clip();
      // Translucent cloud shadow builds up and fades out softly.
      const shadow=ctx.createRadialGradient(x,y,5,x,y,r);
      shadow.addColorStop(0,'rgba(23,55,75,.38)');
      shadow.addColorStop(.72,'rgba(36,73,93,.24)');
      shadow.addColorStop(1,'rgba(46,91,107,0)');
      ctx.globalAlpha=fade;ctx.fillStyle=shadow;ctx.fillRect(x-r,y-r,r*2,r*2);
      const count=Math.min(dropsPerStorm,clamp(Math.round(85*camera.z+40),55,165));
      const fall=18; // World pixels per second at normal speed.
      const length=clamp(8/camera.z,5,18);
      ctx.strokeStyle='#c9f3ff';ctx.lineWidth=clamp(1.05/camera.z,.6,3);
      ctx.lineCap='round';ctx.globalAlpha=fade*.76;ctx.beginPath();
      for(let i=0;i<count;i++){
        const a=hash(i,17,storm.seed),b=hash(i,41,storm.seed),v=hash(i,61,storm.seed);
        const px=x+(a*2-1)*r;
        const py=y+(((b*2*r+age*fall*(.72+v*.65))%(2*r))-r);
        if((px-x)*(px-x)+(py-y)*(py-y)>r*r)continue;
        ctx.moveTo(px,py);ctx.lineTo(px-length*.32,py+length);
      }
      ctx.stroke();
      // Little concentric ripples appear where droplets meet water and soil.
      ctx.strokeStyle='#ddf7ff';ctx.lineWidth=clamp(.8/camera.z,.6,2);
      for(let i=0;i<splashCount;i++){
        const local=(age*.85+hash(i,23,storm.seed))%1;
        const spread=hash(i,88,storm.seed),angle=hash(i,93,storm.seed)*Math.PI*2;
        const px=x+Math.cos(angle)*r*.91*spread,py=y+Math.sin(angle)*r*.91*spread;
        ctx.globalAlpha=fade*(1-local)*.54;
        ctx.beginPath();ctx.ellipse(px,py,clamp((1+local*5)/camera.z,1,12),
          clamp((.3+local*1.7)/camera.z,.4,5),0,0,Math.PI*2);ctx.stroke();
      }
      ctx.restore();
    }
  }

  function modifyTerrain(cx,cy,tool){
    if(cx<0||cy<0||cx>=W||cy>=H)return;
    if(tool==='rain'){
      const radius=11;
      state.storms.push({x:cx*TILE+4,y:cy*TILE+4,radius:radius*TILE,
        start:state.weatherTime,duration:12,seed:Math.floor(random()*2147483647)});
      for(const c of state.cities)if(Math.hypot(c.x-cx,c.y-cy)<radius+5)c.food+=7;
      return;
    }
    if(tool==='meteor'){
      for(let y=Math.max(0,cy-7);y<Math.min(H,cy+8);y++)for(let x=Math.max(0,cx-7);x<Math.min(W,cx+8);x++){
        const d=Math.hypot(x-cx,y-cy),i=at(x,y);let type=terrain[i];
        if(d<3)type=0;else if(d<4.6)type=1;else if(d<7&&type===4)type=3;
        if(terrain[i]!==type){terrain[i]=type;state.changes[i]=type;terrainDirty=true;}
      }
      state.cities=state.cities.filter(c=>Math.hypot(c.x-cx,c.y-cy)>7);
      const ids=new Set(state.cities.map(c=>c.id));
      state.units=state.units.filter(u=>ids.has(u.city));
      state.effects.push({x:cx,y:cy,life:1.4,max:1.4,radius:7,color:'#ffd17f'});
      updateStats();return;
    }
    const radius=tool==='volcano'?5:tool==='forest'||tool==='ground'||tool==='sand'?3:2;
    elements.paint(cx,cy,tool,radius);
    // Store only terrain changes; elemental cells are stored separately.
  }
  function paintBrush(sx,sy){
    const p=screenToWorld(sx,sy),x=Math.floor(p.x/TILE),y=Math.floor(p.y/TILE);
    if(x<0||y<0||x>=W||y>=H)return;
    const id=state.tool+':'+x+','+y;
    if(id===lastBrushCell)return;
    if(state.tool==='rain'&&lastRainSpot&&Math.hypot(x-lastRainSpot.x,y-lastRainSpot.y)<7)return;
    if(state.tool==='meteor'&&lastRainSpot&&Math.hypot(x-lastRainSpot.x,y-lastRainSpot.y)<9)return;
    lastBrushCell=id;
    if(state.tool==='rain'||state.tool==='meteor')lastRainSpot={x,y};
    modifyTerrain(x,y,state.tool);
  }
  function action(sx,sy){
    const p=screenToWorld(sx,sy),x=Math.floor(p.x/TILE),y=Math.floor(p.y/TILE);
    if(x<0||y<0||x>=W||y>=H)return;
    const tool=state.tool,terrainType=terrain[at(x,y)];
    if(PAINT_TOOLS.has(tool)){paintBrush(sx,sy);return;}
    if(tool==='village'){
      if(!isLand(x,y)){toast('Поселение можно поставить только на суше');return;}
      if(!createCity(x,y))toast('Слишком близко к другому городу');return;
    }
    const nearest=state.cities.find(c=>Math.hypot(c.x-x,c.y-y)<6);
    if(nearest){setInfo(nearest.name,`Население: ${nearest.pop} · Пища: ${nearest.food} · Основано: ${state.year-nearest.age} год.`);}
    else setInfo(BIOME[terrainType],`Участок ${x}:${y}. Высота: ${Math.round(altitude[at(x,y)]*100)}%.`);
  }
  function selectCategory(category){
    activeCategory=category;
    document.querySelectorAll('.tool-tab').forEach(el=>{
      const active=el.dataset.category===category;
      el.classList.toggle('active',active);el.setAttribute('aria-selected',String(active));
    });
    document.querySelectorAll('.tool').forEach(el=>{
      el.hidden=el.dataset.category!==category;
    });
    const first=document.querySelector('.tool[data-category="'+category+'"]');
    if(first)setTool(first.dataset.tool);
    $('toolbar').scrollLeft=0;
  }
  function setTool(tool){
    state.tool=tool;lastBrushCell='';lastRainSpot=null;
    document.querySelectorAll('.tool').forEach(el=>el.classList.toggle('active',el.dataset.tool===tool));
    const labels={look:'Перемещение и масштаб',inspect:'Осмотреть мир',
      ground:'Рисуй землю пальцем',forest:'Рисуй лес пальцем',sand:'Песок',rock:'Камни',
      mountain:'Заснеженные горы',water:'Вода растекается и тушит огонь',
      rain:'Можно создавать сколько угодно дождей',fire:'Огонь распространяется по растениям',
      acid:'Кислота разрушает камни и растения',lava:'Горячая лава течёт и остывает',
      volcano:'Создать вулкан и лаву',meteor:'Падение метеорита',
      village:'Коснись суши для основания'};
    $('toolDescription').textContent=labels[tool]||tool;
    canvas.style.cursor=tool==='look'?'grab':'crosshair';
  }
  function save(silent=false){
    try {const data={v:1,seed:state.seed,year:state.year,cities:state.cities,units:state.units,changes:state.changes,elements:elements.serialize()};
      localStorage.setItem(SAVE_KEY,JSON.stringify(data));if(!silent)toast('Мир сохранён на этом устройстве');return true;
    }catch(e){if(!silent)toast('Не удалось сохранить мир в браузере');return false;}
  }
  function restore(){
    try{const text=localStorage.getItem(SAVE_KEY);if(!text)return false;
      const data=JSON.parse(text);if(data.v!==1||!Number.isInteger(data.seed)||!Array.isArray(data.cities)||!Array.isArray(data.units))return false;
      generate(data.seed);state.year=Math.max(1,data.year||1);
      state.changes=data.changes||{};
      for(const [key,val] of Object.entries(state.changes)){const n=Number(key);if(n>=0&&n<terrain.length&&Number.isInteger(val)&&val>=0&&val<PALETTE.length)terrain[n]=val;}
      drawTerrain();elements.restore(data.elements);state.cities=data.cities.slice(0,22);state.units=data.units.slice(0,600);state.ready=true;updateStats();
      const first=state.cities[0];if(first){targetCamera.x=first.x*TILE;targetCamera.y=first.y*TILE;}syncCamera();return true;
    }catch(e){return false;}
  }
  function bindInput(){
    let painting=null;
    const point=e=>{const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top,t:performance.now()};};
    const startPinch=()=>{
      const [a,b]=[...pointers.values()];
      const x=(a.x+b.x)/2,y=(a.y+b.y)/2;
      pinchStart={distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),
        zoom:targetCamera.z,anchor:screenToWorld(x,y,targetCamera)};
      dragStart=null;painting=null;gestureMoved=true;motion.vx=motion.vy=0;
    };
    canvas.addEventListener('pointerdown',e=>{
      e.preventDefault();canvas.setPointerCapture(e.pointerId);
      const p=point(e),previous=pointers.size;pointers.set(e.pointerId,p);
      motion.vx=motion.vy=0;
      if(previous===0){
        gestureMoved=false;lastBrushCell='';lastRainSpot=null;
        dragStart={x:p.x,y:p.y,cx:targetCamera.x,cy:targetCamera.y,prev:p,vx:0,vy:0};
        pinchStart=null;
        if(PAINT_TOOLS.has(state.tool)){
          painting={x:p.x,y:p.y};dragStart=null;gestureMoved=true;paintBrush(p.x,p.y);
        }
      }
      if(pointers.size===2)startPinch();
      if(pointers.size>2){dragStart=null;gestureMoved=true;}
    });
    canvas.addEventListener('pointermove',e=>{
      if(!pointers.has(e.pointerId))return;
      const p=point(e);pointers.set(e.pointerId,p);
      if(pointers.size===1&&painting){
        const dx=p.x-painting.x,dy=p.y-painting.y;
        const distance=Math.hypot(dx,dy);
        const segments=Math.min(90,Math.max(1,Math.ceil(distance/Math.max(5,TILE*camera.z*1.6))));
        for(let k=1;k<=segments;k++){
          const t=k/segments;
          paintBrush(painting.x+dx*t,painting.y+dy*t);
        }
        painting={x:p.x,y:p.y};gestureMoved=true;return;
      }
      if(pointers.size===2){
        if(!pinchStart)startPinch();
        const [a,b]=[...pointers.values()];
        const distance=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));
        const midX=(a.x+b.x)/2,midY=(a.y+b.y)/2;
        const minZ=Math.max(.22,Math.min(viewW/(W*TILE),viewH/(H*TILE))*.9);
        targetCamera.z=clamp(pinchStart.zoom*distance/pinchStart.distance,minZ,3.6);
        targetCamera.x=pinchStart.anchor.x-(midX-viewW/2)/targetCamera.z;
        targetCamera.y=pinchStart.anchor.y-(midY-viewH/2)/targetCamera.z;
        clampCamera(targetCamera);gestureMoved=true;
      }else if(pointers.size===1&&dragStart){
        const dx=p.x-dragStart.x,dy=p.y-dragStart.y;
        if(Math.hypot(dx,dy)>6)gestureMoved=true;
        targetCamera.x=dragStart.cx-dx/targetCamera.z;
        targetCamera.y=dragStart.cy-dy/targetCamera.z;
        clampCamera(targetCamera);
        const elapsed=Math.max(.008,(p.t-dragStart.prev.t)/1000);
        const ivx=clamp(-(p.x-dragStart.prev.x)/targetCamera.z/elapsed,-1600,1600);
        const ivy=clamp(-(p.y-dragStart.prev.y)/targetCamera.z/elapsed,-1600,1600);
        dragStart.vx=dragStart.vx*.35+ivx*.65;
        dragStart.vy=dragStart.vy*.35+ivy*.65;
        dragStart.prev=p;
      }
    });
    function release(e){
      if(!pointers.has(e.pointerId))return;
      const p=point(e),wasLast=pointers.size===1;
      if(wasLast&&!gestureMoved&&e.type==='pointerup')action(p.x,p.y);
      if(wasLast&&gestureMoved&&dragStart&&e.type==='pointerup'){
        const age=performance.now()-dragStart.prev.t;
        if(age<85){motion.vx=dragStart.vx*.65;motion.vy=dragStart.vy*.65;}
      }
      pointers.delete(e.pointerId);
      if(wasLast)painting=null;
      if(pointers.size===1){
        const remaining=[...pointers.values()][0];
        dragStart={x:remaining.x,y:remaining.y,cx:targetCamera.x,cy:targetCamera.y,prev:remaining,vx:0,vy:0};
        pinchStart=null;gestureMoved=true;
      }else if(pointers.size===0){dragStart=null;pinchStart=null;}
    }
    canvas.addEventListener('pointerup',release);
    canvas.addEventListener('pointercancel',release);
    canvas.addEventListener('lostpointercapture',release);
    canvas.addEventListener('wheel',e=>{
      e.preventDefault();const r=canvas.getBoundingClientRect();
      zoomAt(e.clientX-r.left,e.clientY-r.top,Math.exp(-clamp(e.deltaY,-160,160)*.0014));
    },{passive:false});
    minimap.addEventListener('click',e=>{
      const r=minimap.getBoundingClientRect();
      targetCamera.x=(e.clientX-r.left)/r.width*W*TILE;
      targetCamera.y=(e.clientY-r.top)/r.height*H*TILE;
      motion.vx=motion.vy=0;clampCamera(targetCamera);
    });
    document.querySelectorAll('.tool').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
    document.querySelectorAll('.tool-tab').forEach(b=>b.addEventListener('click',()=>selectCategory(b.dataset.category)));
    selectCategory('world');
    document.querySelectorAll('.speed').forEach(b=>b.addEventListener('click',()=>{
      state.speed=Number(b.dataset.speed);state.paused=false;$('pause').textContent='Ⅱ';
      document.querySelectorAll('.speed').forEach(el=>el.classList.toggle('active',el===b));
    }));
    $('pause').addEventListener('click',()=>{state.paused=!state.paused;$('pause').textContent=state.paused?'▶':'Ⅱ';});
    $('newWorld').addEventListener('click',()=>{startNew();save(true);});
    $('saveWorld').addEventListener('click',()=>save());
    window.addEventListener('resize',resize);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)save(true);});
    window.addEventListener('keydown',e=>{if(e.key===' '){e.preventDefault();$('pause').click();}else if(e.key.toLowerCase()==='s')save();});
  }
  // Bootstrap: no network requests, external scripts or build steps.
  resize();targetCamera.z=Math.max(.23,Math.min(viewW/(W*TILE),viewH/(H*TILE))*1.85);
  targetCamera.x=W*TILE/2;targetCamera.y=H*TILE/2;syncCamera();
  bindInput();if(!restore())startNew();clampCamera();clampCamera(targetCamera);updateStats();requestAnimationFrame(draw);
})();