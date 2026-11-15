
(()=>{
"use strict";
const $=s=>document.querySelector(s),canvas=$("#game"),ctx=canvas.getContext("2d",{alpha:false});
const W=1280,H=720,FLOOR=588,LIMIT_L=178,LIMIT_R=1102;
const PI=Math.PI,TAU=PI*2,clamp=(v,a,b)=>Math.min(b,Math.max(a,v)),lerp=(a,b,t)=>a+(b-a)*t;
let sw=1280,sh=720,scale=1,dpr=1,last=0,clock=0,shake=0,flash=0,particles=[],stains=[],floating=[],audio=null,muted=false;
const input=new Set();
const ATT={
 jab:{time:.36,start:.37,end:.69,reach:151,cost:5,damage:5.7,zone:"head",stun:.13},
 cross:{time:.56,start:.4,end:.7,reach:159,cost:10,damage:10,zone:"head",stun:.2},
 hook:{time:.62,start:.39,end:.66,reach:118,cost:12,damage:12.8,zone:"head",stun:.24},
 kick:{time:.82,start:.43,end:.72,reach:186,cost:17,damage:15.4,zone:"head",stun:.28},
 low:{time:.68,start:.39,end:.67,reach:186,cost:11,damage:9.1,zone:"leg",stun:.17},
 grab:{time:.87,start:.35,end:.7,reach:106,cost:20,damage:4,zone:"body",stun:.3}
};
const palettes=[
 {skin:"#c99877",shade:"#714330",lit:"#ecc6a2",short:"#b64037",trim:"#ff9b79",glove:"#c4463d",hair:"#29201b"},
 {skin:"#a6775d",shade:"#543b31",lit:"#d6a486",short:"#2b5269",trim:"#87bcdf",glove:"#356f9b",hair:"#19191b"}
];
class Fighter{
 constructor(id){
  this.id=id;this.name=id===0?"PLAYER":"CHALLENGER";this.x=id===0?435:845;this.face=id===0?1:-1;
  this.color=palettes[id];this.hp=100;this.st=100;this.head=0;this.body=0;this.leg=0;this.score=0;this.roundScore=0;this.hits=0;
  this.rounds=0;this.knockdowns=0;this.vx=0;this.stun=0;this.heat=0;this.recoil=0;this.guard=false;this.slip=0;
  this.attack=null;this.at=0;this.didHit=false;this.down=0;this.downMax=0;this.ko=false;this.getup=0;this.steps=0;
  this.aiClock=0;this.aiMove=0;this.aiGuard=0;this.aiChoice=0;this.aiSlip=0;this.top=0;this.cut=0;
 }
 resetRound(){
  this.x=this.id===0?435:845;this.face=this.id===0?1:-1;this.vx=0;this.st=100;this.stun=0;
  this.attack=null;this.at=0;this.didHit=false;this.down=0;this.downMax=0;this.top=0;
  this.roundScore=0;this.guard=false;this.slip=0;this.aiClock=.2;this.aiMove=0;
 }
}
const p=new Fighter(0),e=new Fighter(1);
const match={phase:"menu",round:1,time:180,between:0,winner:null,pause:false};
function resize(){
 sw=window.innerWidth;sh=window.innerHeight;dpr=Math.min(window.devicePixelRatio||1,2);
 canvas.width=Math.round(sw*dpr);canvas.height=Math.round(sh*dpr);
 scale=Math.min(sw/1140,sh/720);
}
window.addEventListener("resize",resize,{passive:true});resize();
function elText(id,v){let n=$(id);if(n&&n.textContent!==v)n.textContent=v}
function updateUI(){
 $("#pHealth").style.width=clamp(p.hp,0,100)+"%";$("#eHealth").style.width=clamp(e.hp,0,100)+"%";
 $("#pStamina").style.width=clamp(p.st,0,100)+"%";$("#eStamina").style.width=clamp(e.st,0,100)+"%";
 elText("#time",String(Math.floor(match.time/60)).padStart(2,"0")+":"+String(Math.floor(match.time%60)).padStart(2,"0"));
 elText("#round","ROUND "+match.round+" / 3");
 elText("#pScore",p.rounds+" ROUNDS · "+p.hits+" HITS");elText("#eScore",e.rounds+" ROUNDS · "+e.hits+" HITS");
}
function tip(title,sub="",duration=1.1){
 const m=$("#message");m.innerHTML=title+(sub?'<span id="msgSub">'+sub+"</span>":"");m.classList.add("on");
 m.dataset.until=String(clock+duration);
}
function sound(freq=90,decay=.14,type="triangle",vol=.1){
 if(muted)return;
 try{
  if(!audio)audio=new(window.AudioContext||window.webkitAudioContext)();
  if(audio.state==="suspended")audio.resume();
  const os=audio.createOscillator(),gain=audio.createGain(),t=audio.currentTime;
  os.type=type;os.frequency.setValueAtTime(freq,t);os.frequency.exponentialRampToValueAtTime(Math.max(35,freq*.39),t+decay);
  gain.gain.setValueAtTime(vol,t);gain.gain.exponentialRampToValueAtTime(.0001,t+decay);
  os.connect(gain).connect(audio.destination);os.start(t);os.stop(t+decay+.01);
 }catch{}
}
function pressAttack(f,type){
 if(match.phase!=="fighting"||match.pause||f.ko||f.stun>.08||f.down>0)return false;
 const a=ATT[type];if(!a||f.attack||f.st<a.cost)return false;
 f.attack=type;f.at=0;f.didHit=false;f.st-=a.cost;
 f.guard=false;f.heat=.15;f.top=Math.max(0,f.top-.2);
 sound(type==="kick"||type==="low"?135:175,.075,"triangle",.025);
 return true;
}
function spawnFX(x,y,n,color,force=1,blood=false){
 for(let i=0;i<n;i++){
  const angle=Math.random()*TAU,speed=(28+Math.random()*105)*force;
  particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-30,
   life:.25+Math.random()*.5,max:.65,r:1+Math.random()*(blood?3:5),color,blood});
 }
 if(particles.length>250)particles.splice(0,particles.length-250);
}
function bloodStain(x){
 stains.push({x:clamp(x+Math.random()*75-37,175,1100),y:FLOOR+9+Math.random()*27,r:2+Math.random()*7});
 if(stains.length>80)stains.shift();
}
function hit(attacker,defender,type){
 const a=ATT[type],dist=Math.abs(attacker.x-defender.x);
 const ground=defender.down>0;
 if(dist>a.reach+(ground?42:0)||attacker.face*(defender.x-attacker.x)<-18)return;
 if(ground&&type==="kick"||ground&&type==="low"||ground&&type==="grab")return;
 if(type==="grab"&&!ground){
  if(dist>106||defender.st>25&&defender.guard&&Math.random()<.65){
   tip("TAKEDOWN DEFENDED","GOOD SPRAWL",.7);attacker.st=Math.max(0,attacker.st-9);return;
  }
  defender.hp=Math.max(1,defender.hp-4);defender.body+=9;defender.down=6.7;defender.downMax=6.7;defender.knockdowns++;
  defender.stun=.4;attacker.top=1.1;attacker.score+=10;attacker.roundScore+=10;
  spawnFX(defender.x,FLOOR-40,13,"#e6bd87",1.3);
  sound(62,.26,"sawtooth",.12);tip("TAKEDOWN","GROUND CONTROL",1.1);
  return;
 }
 const defended=!ground&&defender.guard&&defender.st>4&&
  ((a.zone==="head"&&!defender.slip)||(a.zone==="leg"&&defender.slip<.3));
 let damage=a.damage*(.88+Math.random()*.24);
 if(ground)damage*=.7;
 if(attacker.st<19)damage*=.72;
 if(defended){
  damage*=a.zone==="leg"?.58:.22;defender.st=Math.max(0,defender.st-(type==="kick"?10:6));
  spawnFX(defender.x-attacker.face*27,FLOOR-252,8,"#e9c38f",.65);
  sound(110,.11,"triangle",.08);
 }else{
  defender.stun=Math.max(defender.stun,a.stun*(ground?.8:1));
  defender.recoil=.16;flash=Math.max(flash,type==="kick"?.075:.04);
  shake=Math.max(shake,type==="kick"?9:type==="hook"?6:3.3);
  if(a.zone==="head"){
   defender.head+=damage*(ground?.85:1.25);
   defender.cut+=damage*.16;
   if(defender.head>17||defender.hp<60){
    spawnFX(defender.x+defender.face*20,FLOOR-299,Math.ceil(damage/3),
    "#9e202b",.9,true);
    if(Math.random()<.38)bloodStain(defender.x);
   }
  }else if(a.zone==="leg")defender.leg+=damage*1.2;
  else defender.body+=damage*1.1;
  const fy=a.zone==="head"?FLOOR-273:a.zone==="leg"?FLOOR-80:FLOOR-161;
  spawnFX(defender.x-attacker.face*14,fy,10,"#ead3a6",.8);
  sound(a.zone==="head"?84:73,.2,"triangle",.12);
  if(a.zone==="head"&&damage>8&&Math.random()<.46)
   tip(type==="kick"?"HEAD KICK!":type==="hook"?"CLEAN HOOK!":"SOLID SHOT!", "",.35);
 }
 defender.hp=clamp(defender.hp-damage,0,100);
 attacker.score+=damage*(defended?.3:1.3);attacker.roundScore+=damage*(defended?.3:1.3);attacker.hits++;
 if(defender.hp<=0||(defender.head>88&&Math.random()<.13)){
  knockout(attacker,defender);return;
 }
 if(!defended&&!ground&&a.zone==="head"&&defender.hp<62&&
    (type==="hook"||type==="kick"||type==="cross")&&
    Math.random()<clamp(.06+(65-defender.hp)*.008+defender.head*.002,0,.53)){
  defender.down=6.9;defender.downMax=6.9;defender.knockdowns++;
  defender.stun=.2;defender.attack=null;defender.vx=0;
  tip("KNOCKDOWN","FIGHT CONTINUES",1.1);
  sound(58,.29,"sawtooth",.12);
 }
}
function knockout(winner,loser){
 if(match.phase==="ended")return;
 loser.ko=true;loser.down=999;loser.downMax=999;loser.attack=null;loser.vx=0;loser.hp=0;
 winner.rounds=2;match.winner=winner;match.phase="ended";shake=11;
 spawnFX(loser.x,FLOOR-170,24,"#d7ae7b",1.3);
 tip("KNOCKOUT!","REFEREE STOPS THE FIGHT",2);
 sound(52,.65,"sawtooth",.18);
 window.setTimeout(()=>showResult(winner,"KO / TKO"),1650);
}
function showResult(winner,how){
 const overlay=$("#overlay");overlay.classList.remove("hidden");
 $("#modalTitle").innerHTML=winner===p?"YOU <em>WIN</em>":"YOU <em>LOSE</em>";
 $("#modalTag").textContent=how+" · ROUND "+match.round;
 $("#modalIntro").textContent=(winner===p?"Your hand is raised.":"The opponent gets the victory.")+
   "  "+p.hits+" strikes landed by you · "+e.hits+" by opponent.";
 $("#modalStats").innerHTML="<span>RED "+p.rounds+"</span><span>BLUE "+e.rounds+"</span><span>"+how+"</span>";
 $("#start").textContent="FIGHT AGAIN";
}
function resetMatch(){
 for(let f of [p,e]){
  f.hp=100;f.st=100;f.head=0;f.body=0;f.leg=0;f.score=0;f.hits=0;f.rounds=0;
  f.cut=0;f.knockdowns=0;f.ko=false;f.resetRound();
 }
 particles=[];stains=[];input.clear();match.phase="fighting";match.round=1;
 match.time=180;match.pause=false;match.winner=null;clock=0;
 $("#overlay").classList.add("hidden");$("#pause").textContent="Ⅱ";
 tip("ROUND 1","FIGHT!",1.1);updateUI();
 sound(320,.17,"sine",.06);
}
function decideRound(){
 const pw=p.roundScore+p.hp*.2,ew=e.roundScore+e.hp*.2;
 const victor=pw>=ew?p:e;victor.rounds++;
 if(victor.rounds>=2||match.round>=3){
  match.winner=p.rounds===e.rounds?(p.score>=e.score?p:e):(p.rounds>e.rounds?p:e);
  match.phase="ended";
  tip("DECISION","THE JUDGES HAVE SCORED THE BOUT",2);
  window.setTimeout(()=>showResult(match.winner,"DECISION"),1800);
 }else{
  match.phase="between";match.between=3.8;
  tip("END OF ROUND "+match.round, (victor===p?"RED":"BLUE")+" TAKES THE ROUND",2.1);
 }
}
function nextRound(){
 match.round++;match.time=180;match.phase="fighting";
 for(const f of [p,e]){
  f.hp=Math.min(100,f.hp+18);f.st=100;f.stun=0;f.resetRound();
 }
 tip("ROUND "+match.round,"FIGHT!",1.2);sound(330,.16,"sine",.05);
}
function updateInput(dt){
 p.guard=(input.has("guard")||input.has("space"))&&!p.attack&&p.down<=0&&p.st>1;
 p.slip=(input.has("slip")||input.has("shift")||input.has("s"))&&!p.attack?1:0;
 let move=(input.has("right")||input.has("d")||input.has("arrowright")?1:0)-
  (input.has("left")||input.has("a")||input.has("arrowleft")?1:0);
 if(p.down>0||p.stun>.3||p.attack){move*=p.attack?.4:.1;}
 p.vx=lerp(p.vx,move*(p.guard?88:p.slip?125:220)*(p.leg>40?.78:1),Math.min(1,dt*9));
 if(p.slip>0){p.st=Math.max(0,p.st-5*dt);}
 if(p.guard&&p.st<1)p.guard=false;
 const acts=["jab","cross","hook","kick","low","grab"];
 for(const a of acts)if(input.has(a)){pressAttack(p,a);break;}
}
function botAI(dt){
 if(e.ko)return;
 e.aiClock-=dt;
 const dist=Math.abs(e.x-p.x),isPDown=p.down>0,adv=e.hp>p.hp+12;
 if(e.aiClock<=0){
  e.aiClock=.12+Math.random()*.22;
  const pThreat=p.attack&&p.at<ATT[p.attack].time*.68;
  e.aiGuard=pThreat&&dist<197&&Math.random()<.61;
  e.aiSlip=pThreat&&dist<155&&Math.random()<.21?1:0;
  if(isPDown) e.aiMove=dist>104?1:0;
  else if(e.down>0)e.aiMove=0;
  else if(dist>165)e.aiMove=1;
  else if(dist<93)e.aiMove=adv||e.st<25?-1:Math.random()>.6?-1:0;
  else e.aiMove=Math.random()<.17?-1:Math.random()<.65?1:0;
  e.aiChoice=Math.random();
 }
 e.guard=e.aiGuard&&!e.attack&&e.down<=0&&e.st>4;
 e.slip=e.aiSlip;
 if(e.down>0){e.vx=0;return;}
 if(e.attack||e.stun>.16)e.vx=lerp(e.vx,0,dt*7);
 else e.vx=lerp(e.vx,e.aiMove*e.face*(e.guard?65:155),Math.min(1,dt*6));
 if(match.phase!=="fighting"||e.attack||e.stun>.05||e.st<10)return;
 const near=dist<185;
 if(isPDown&&dist<150){
  if(Math.random()<dt*2.7)pressAttack(e,Math.random()<.6?"cross":"jab");
 }else if(near&&!isPDown&&Math.random()<dt*(e.st>30?1.65:.83)){
  const r=Math.random();
  const choice=(dist<103&&r<.18)?"grab":r<.25?"jab":r<.5?"cross":r<.68?"hook":r<.83?"low":"kick";
  if(dist<ATT[choice].reach)pressAttack(e,choice);
 }
}
function advanceFighter(f,other,dt){
 f.face=(other.x-f.x)>=0?1:-1;
 f.heat=Math.max(0,f.heat-dt);f.stun=Math.max(0,f.stun-dt);f.recoil=Math.max(0,f.recoil-dt);
 f.top=Math.max(0,f.top-dt);f.getup=Math.max(0,f.getup-dt);
 if(f.down>0){
  if(f.down!==999){f.down-=dt;if(f.down<=0){
   if(f.hp<12&&f.knockdowns>=2){knockout(other,f);return;}
   f.down=0;f.stun=.55;f.getup=.55;tip(f.id===0?"BACK ON YOUR FEET":"OPPONENT STANDS UP","",.6);
  }} f.attack=null;f.vx=0;
 }else if(f.attack){
  const a=ATT[f.attack];f.at+=dt;
  const pr=f.at/a.time;
  if(!f.didHit&&pr>=a.start){f.didHit=true;hit(f,other,f.attack);}
  if(pr>=1){f.attack=null;f.at=0;f.didHit=false;}
 }
 if(f.down<=0){f.x=clamp(f.x+f.vx*dt,LIMIT_L,LIMIT_R);f.steps+=Math.abs(f.vx)*dt*.038;
  f.st=clamp(f.st+(f.guard?4:f.attack?6:13)*dt,0,100);}
}
function updateParticles(dt){
 for(let i=particles.length-1;i>=0;i--){
  let q=particles[i];q.life-=dt;q.vy+=310*dt;q.x+=q.vx*dt;q.y+=q.vy*dt;
  if(q.y>FLOOR+2){if(q.blood&&Math.random()<.5)bloodStain(q.x);particles.splice(i,1);}
  else if(q.life<=0)particles.splice(i,1);
 }
}
function step(dt){
 clock+=dt;shake=Math.max(0,shake-dt*35);flash=Math.max(0,flash-dt*.6);
 if($("#message").dataset.until&&clock>Number($("#message").dataset.until))
  $("#message").classList.remove("on");
 updateParticles(dt);
 if(match.pause)return;
 if(match.phase==="between"){
  match.between-=dt;
  if(match.between<=0)nextRound();
  return;
 }
 if(match.phase!=="fighting")return;
 match.time=Math.max(0,match.time-dt);
 updateInput(dt);botAI(dt);
 advanceFighter(p,e,dt);
 if(match.phase!=="fighting")return;
 advanceFighter(e,p,dt);
 if(p.down<=0&&e.down<=0){
  const dx=e.x-p.x,sep=82;
  if(Math.abs(dx)<sep){
   const push=(sep-Math.abs(dx))*.5,sign=Math.sign(dx)||1;
   p.x=clamp(p.x-push*sign,LIMIT_L,LIMIT_R);
   e.x=clamp(e.x+push*sign,LIMIT_L,LIMIT_R);
  }
 }
 if(match.time<=0)decideRound();
 updateUI();
}
function grad(x1,y1,x2,y2,a,b){
 const g=ctx.createLinearGradient(x1,y1,x2,y2);g.addColorStop(0,a);g.addColorStop(1,b);return g;
}
function ellipse(x,y,rx,ry,fill,stroke=null,lw=1){
 ctx.beginPath();ctx.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,TAU);
 ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();}
}
function poly(points,fill,stroke=null,sw=1){
 ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
 ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.lineWidth=sw;ctx.strokeStyle=stroke;ctx.stroke();}
}
function limb(x1,y1,x2,y2,w1,w2,c,shade){
 const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy),ang=Math.atan2(dy,dx);
 ctx.save();ctx.translate(x1,y1);ctx.rotate(ang);
 const g=grad(0,-w1*.5,0,w1*.6,c,shade);
 ctx.beginPath();ctx.moveTo(0,-w1/2);ctx.bezierCurveTo(len*.2,-w1*.56,len*.78,-w2*.56,len,-w2/2);
 ctx.arc(len,0,w2/2,-PI/2,PI/2);ctx.bezierCurveTo(len*.75,w2*.54,len*.2,w1*.54,0,w1/2);
 ctx.arc(0,0,w1/2,PI/2,PI*1.5);
 ctx.fillStyle=g;ctx.fill();ctx.strokeStyle="#0e1119a0";ctx.lineWidth=2;ctx.stroke();
 ctx.restore();
}
function shoe(x,y,c="#171c24",forward=1){
 ctx.save();ctx.translate(x,y);
 ellipse(14*forward,-4,31,10,grad(0,-10,0,10,"#343c45",c),"#06080b",2);
 ctx.strokeStyle="#c5c6ba76";ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(-3*forward,-12);ctx.lineTo(12*forward,-12);ctx.stroke();
 ctx.restore();
}
function glove(x,y,c){
 ellipse(x,y,18,15,grad(x,y-14,x,y+15,c,"#311a1b"),"#1d1618",2);
 poly([[x+10,y-9],[x+21,y-4],[x+21,y+10],[x+8,y+11]],"#191d24");
 ctx.strokeStyle="#f7e6ce66";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-8,y-6);ctx.quadraticCurveTo(x,y-13,x+7,y-8);ctx.stroke();
}
function head(f,x,y,t){
 const c=f.color,shiver=f.recoil>0?Math.sin(clock*55)*3:0;
 ctx.save();ctx.translate(x+shiver,y);
 limb(-3,18,-3,30,23,23,c.skin,c.shade);
 ellipse(5,0,28,37,grad(-20,-14,30,14,c.lit,c.shade),"#452e29",2);
 // nose is forward, chin has distinct angular profile
 poly([[26,-5],[42,4],[29,10]],c.skin,"#6b4135",1.1);
 ellipse(-20,3,7,10,c.shade,"#54342e",1.7);
 ellipse(-19,3,3,5,c.skin);
 ctx.strokeStyle="#442d2a";ctx.lineWidth=2.8;
 ctx.beginPath();ctx.moveTo(8,-8);ctx.quadraticCurveTo(17,-11,25,-7);ctx.stroke();
 ellipse(19,-5,2.6,2.4,"#151317");
 ctx.lineWidth=1.6;ctx.strokeStyle="#65423c";ctx.beginPath();ctx.moveTo(21,19);ctx.lineTo(34,17);ctx.stroke();
 ctx.beginPath();ctx.moveTo(9,23);ctx.quadraticCurveTo(19,34,26,26);ctx.stroke();
 // close cropped hair
 ctx.fillStyle=c.hair;ctx.beginPath();ctx.moveTo(-22,-15);
 ctx.bezierCurveTo(-28,-53,25,-52,31,-29);
 ctx.quadraticCurveTo(17,-34,10,-30);ctx.quadraticCurveTo(-2,-24,-13,-27);
 ctx.lineTo(-23,-17);ctx.closePath();ctx.fill();
 ctx.strokeStyle="#1414198c";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-11,-28);ctx.lineTo(10,-33);ctx.stroke();
 // bruised cheek and cut
 if(f.head>15){
  ctx.globalAlpha=clamp((f.head-12)/60,0,.5);
  ellipse(12,12,17,11,"#6b394f");ctx.globalAlpha=1;
 }
 if(f.cut>11){
  ctx.strokeStyle="#8e242e";ctx.lineWidth=Math.min(3,f.cut*.12);ctx.beginPath();
  ctx.moveTo(22,6);ctx.lineTo(16,16);ctx.stroke();
 }
 if(f.cut>17){
  ctx.strokeStyle="#ad2734";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(16,17);ctx.lineTo(17,28);ctx.stroke();
 }
 ctx.restore();
}
function drawDown(f){
 const c=f.color,dir=f.face;ctx.save();ctx.translate(f.x,FLOOR-24);ctx.scale(dir,1);
 let wobble=f.ko?0:Math.sin(clock*3)*1.7;
 ellipse(-4,8,124,13,"#0007");
 // legs
 limb(-58,-8,-103,-5,32,25,c.skin,c.shade);limb(-101,-5,-132,1,24,19,c.skin,c.shade);
 shoe(-132,0);limb(-48,-18,-102,-18,30,23,c.skin,c.shade);shoe(-121,-16);
 // shorts, torso
 poly([[-76,-42],[-16,-52],[5,-20],[-63,-5]],grad(-55,-35,-7,-4,c.short,"#111823"),"#14141a",2);
 ellipse(32,-37,67,33,grad(12,-71,49,3,c.lit,c.shade),"#593a32",2);
 ctx.strokeStyle="#865641aa";ctx.lineWidth=2;ctx.beginPath();
 ctx.moveTo(8,-42);ctx.lineTo(34,-33);ctx.moveTo(24,-55);ctx.lineTo(28,-23);ctx.stroke();
 limb(59,-30,80,-8,23,17,c.skin,c.shade);glove(83,-4,c.glove);
 limb(47,-55,91,-59,24,17,c.skin,c.shade);glove(98,-56,c.glove);
 head(f,100,-35);
 ctx.restore();
}

function drawGroundAttacker(f){
 const c=f.color,dir=f.face;
 const attacking=f.attack&&(f.attack==="jab"||f.attack==="cross"||f.attack==="hook");
 const phase=attacking?f.at/ATT[f.attack].time:0;
 const strike=attacking?Math.sin(clamp((phase-.04)/.89,0,1)*PI):0;
 ctx.save();ctx.translate(f.x,FLOOR);ctx.scale(dir,1);
 ellipse(-12,7,86,13,"#020409a8");
 // rear knee planted, lead foot supporting balance
 limb(-33,-75,-85,-24,35,29,c.skin,c.shade);
 limb(-85,-24,-102,-4,30,20,c.skin,c.shade);
 shoe(-101,-5);
 limb(-26,-72,20,-30,37,28,c.skin,c.shade);
 limb(20,-30,26,-5,27,21,c.skin,c.shade);
 shoe(27,-3);
 poly([[-60,-99],[-2,-109],[16,-67],[-45,-52]],
  grad(-40,-96,12,-65,c.short,"#1c202b"),"#14151d",2);
 ctx.strokeStyle=c.trim;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-53,-98);ctx.lineTo(-5,-104);ctx.stroke();
 // torso leaning over the knocked-down opponent
 poly([[-35,-99],[6,-154],[56,-143],[51,-106],[8,-80]],
  grad(-35,-139,56,-101,c.shade,c.lit),"#4c312b",2.2);
 ctx.strokeStyle="#835743aa";ctx.lineWidth=2;ctx.beginPath();
 ctx.moveTo(7,-141);ctx.lineTo(12,-99);ctx.moveTo(26,-126);ctx.lineTo(43,-116);ctx.stroke();
 // supporting rear arm
 limb(3,-147,36,-97,28,23,c.skin,c.shade);
 limb(36,-97,64,-54,22,18,c.skin,c.shade);
 glove(68,-53,c.glove);
 limb(57,-143,69,-157,21,20,c.skin,c.shade);
 head(f,75,-177);
 // striking arm angles down toward the opponent, rather than punching in the air
 let ex=86+strike*42,ey=-69+strike*31;
 limb(53,-135,83+strike*14,-104+strike*12,28,23,c.skin,c.shade);
 limb(83+strike*14,-104+strike*12,ex,ey,23,18,c.skin,c.shade);
 glove(ex,ey,c.glove);
 ctx.restore();
}

function drawFighter(f){
 if(f.down>0){drawDown(f);return;}
 const opponent=f===p?e:p;
 if(opponent.down>0&&Math.abs(f.x-opponent.x)<160&&!f.ko){drawGroundAttacker(f);return;}
 const c=f.color,dir=f.face,move=clamp(Math.abs(f.vx)/190,0,1),
  walk=Math.sin(f.steps*1.9),wob=Math.cos(f.steps*1.9),
  attack=f.attack,progress=attack?f.at/ATT[attack].time:0,
  punch=attack?Math.sin(clamp((progress-.06)/.79,0,1)*PI):0,
  kick=(attack==="kick"||attack==="low")?punch:0,
  recoil=f.recoil>0?Math.sin(clock*48)*3:0,
  bob=(Math.sin(clock*2.6+f.id)*2+walk*move*5),
  duck=f.slip>0?33:0,lean=f.slip>0?-23:0,
  get=f.getup>0?(f.getup/.55)*45:0;
 ctx.save();ctx.translate(f.x,FLOOR);
 ctx.scale(dir,1);ctx.translate(0,bob+duck+get);
 // shadow
 ellipse(0,8-duck-get,70+Math.abs(walk)*6,12,"#01030898");
 const swing=walk*move*20;
 const hip=[-7+lean,-123],rearK=[-23+swing*.3,-69],rearF=[-48+swing,-7+Math.max(0,-wob)*move*10];
 const frontK=[40-swing*.3,-72],frontF=[56-swing,-7+Math.max(0,wob)*move*10];
 // back foot and leg
 limb(hip[0],hip[1],rearK[0],rearK[1],34,27,c.skin,c.shade);
 limb(rearK[0],rearK[1],rearF[0],rearF[1],25,18,c.skin,c.shade);
 shoe(rearF[0]-10,rearF[1],"#1a1d26");
 // front leg / kicking
 const kY=(attack==="kick"?-158:attack==="low"?-89:-8);
 const kF=[frontF[0]+kick*(attack==="kick"?102:134),lerp(frontF[1],kY,kick)];
 const kK=[frontK[0]+kick*36,frontK[1]-kick*(attack==="kick"?46:9)];
 limb(hip[0]+9,hip[1],kK[0],kK[1],36,26,c.skin,c.shade);
 limb(kK[0],kK[1],kF[0],kF[1],27,19,c.skin,c.shade);
 shoe(kF[0],kF[1],kick>0?"#1c252f":"#151922");
 // shorts are angular and layered
 poly([[-39,-155],[35,-156],[47,-112],[5,-108],[-7,-130],[-25,-109],[-47,-112]],
  grad(-37,-151,44,-111,c.short,"#252332"),"#121723",2.5);
 ctx.fillStyle=c.trim;ctx.fillRect(-36,-152,71,7);
 ctx.strokeStyle="#f1e5d04d";ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(8,-145);ctx.lineTo(7,-118);ctx.stroke();
 // torso and chest
 const torsoX=lean-recoil,shoulderY=-239;
 poly([[-39+torsoX,-166],[29+torsoX,-164],[39+torsoX,-219],[22+torsoX,-251],[-19+torsoX,-246],[-44+torsoX,-208]],
  grad(-42,-220,43,-193,c.shade,c.lit),"#5a382f",2);
 ellipse(-3+torsoX,-212,35,30,grad(-20,-231,25,-198,c.lit,c.skin));
 // torso anatomy lines
 ctx.lineWidth=2;ctx.strokeStyle="#754936a8";ctx.beginPath();
 ctx.moveTo(-3+torsoX,-236);ctx.lineTo(1+torsoX,-177);
 ctx.moveTo(-20+torsoX,-194);ctx.quadraticCurveTo(-2+torsoX,-202,16+torsoX,-192);
 ctx.moveTo(-20+torsoX,-183);ctx.quadraticCurveTo(-2+torsoX,-191,17+torsoX,-180);
 ctx.stroke();
 // rear arm + glove
 const crossP=attack==="cross"?punch:0;
 const rEl=[-21+torsoX+crossP*57,-202-crossP*19];
 const rHa=[10+torsoX+crossP*116,-255+crossP*15];
 limb(-27+torsoX,-235,rEl[0],rEl[1],30,24,c.skin,c.shade);
 limb(rEl[0],rEl[1],rHa[0],rHa[1],23,17,c.skin,c.shade);
 glove(rHa[0],rHa[1],c.glove);
 // neck and head
 limb(5+torsoX,-250,8+torsoX,-270,23,22,c.skin,c.shade);
 head(f,14+torsoX+(attack==="cross"?crossP*8:0),-299+recoil*.4);
 // front arm + glove (strike drives fist forward)
 const jabP=attack==="jab"?punch:0,hookP=attack==="hook"?punch:0;
 const ex=attack==="jab"?jabP*113:attack==="hook"?hookP*72:0;
 const yOff=attack==="hook"?hookP*5:0;
 const fEl=[42+torsoX+jabP*40+hookP*61,-218-jabP*25-hookP*8];
 const fHa=[34+torsoX+ex,-255+yOff+jabP*7];
 limb(23+torsoX,-233,fEl[0],fEl[1],32,24,c.skin,c.shade);
 limb(fEl[0],fEl[1],fHa[0],fHa[1],24,17,c.skin,c.shade);
 glove(fHa[0],fHa[1],c.glove);
 if(f.guard){
  // raised arms with small translucent block highlight
  ctx.strokeStyle="#aad2dc68";ctx.lineWidth=3;ctx.beginPath();
  ctx.arc(28+torsoX,-269,52,-1.13,.84);ctx.stroke();
 }
 if(f.getup>0){
  ctx.globalAlpha=f.getup*.8;ellipse(0,3,70,4,"#efebdc");ctx.globalAlpha=1;
 }
 ctx.restore();
}
const crowd=Array.from({length:122},(_,i)=>({
 x:105+i*9.2+(i%3)*2,y:197+(i*17%33),size:9+(i*7%12),
 tone:["#111720","#1a2027","#2a2630","#1b2735","#3b2c2b"][i%5]
}));
function arena(){
 let bg=grad(0,-120,0,720,"#080e18","#23232b");
 ctx.fillStyle=bg;ctx.fillRect(-500,-500,2300,1600);
 // roof beams and stadium LED
 ctx.fillStyle="#11131b";ctx.fillRect(-500,-60,2300,220);
 for(let i=0;i<7;i++){
  const x=90+i*192;ctx.strokeStyle="#42424c";ctx.lineWidth=8;
  ctx.beginPath();ctx.moveTo(x,-60);ctx.lineTo(x+74,185);ctx.stroke();
 }
 for(let i=0;i<6;i++){
  let x=156+i*197,g=ctx.createRadialGradient(x,95,2,x,265,195);
  g.addColorStop(0,"#f9dfaf26");g.addColorStop(1,"#f5cc9000");
  ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(x-17,74);ctx.lineTo(x-180,380);
  ctx.lineTo(x+180,380);ctx.lineTo(x+17,74);ctx.fill();
  ellipse(x,76,20,7,"#ddd4b2");
 }
 // audience tiers
 ctx.fillStyle="#171c26";ctx.fillRect(0,181,1280,276);
 for(let i=0;i<5;i++){
  ctx.fillStyle=i%2?"#242831":"#1b202b";ctx.fillRect(0,220+i*46,1280,17);
  ctx.strokeStyle="#3c3c43";ctx.lineWidth=2;ctx.beginPath();
  ctx.moveTo(0,234+i*46);ctx.lineTo(W,234+i*46);ctx.stroke();
 }
 crowd.forEach((v,i)=>{
  ellipse(v.x,v.y+28,v.size*.48,v.size*.65,v.tone);
  ellipse(v.x,v.y,v.size*.38,v.size*.44,i%8?"#5b4b46":"#7d7069");
 });
 // central red LED banner behind cage
 ctx.fillStyle="#10151b";ctx.fillRect(0,300,1280,32);
 ctx.fillStyle="#a02f35";ctx.fillRect(0,312,1280,4);
 ctx.font="900 18px system-ui";ctx.letterSpacing="3px";ctx.textAlign="center";
 ctx.fillStyle="#e7d5c38a";ctx.fillText("FIGHT NIGHT   •   MAIN EVENT   •   UNDERGROUND MMA",640,325);
 // cage upper geometry
 ctx.fillStyle="#14171d";ctx.fillRect(99,385,1082,215);
 for(let x=100;x<=1180;x+=12){
  ctx.strokeStyle="#a2b0bf26";ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(x,385);ctx.lineTo(x+205,590);ctx.stroke();
  ctx.beginPath();ctx.moveTo(x,590);ctx.lineTo(x+205,385);ctx.stroke();
 }
 ctx.strokeStyle="#0a0c11";ctx.lineWidth=12;
 ctx.beginPath();ctx.moveTo(135,350);ctx.lineTo(1145,350);
 ctx.moveTo(135,350);ctx.lineTo(135,589);
 ctx.moveTo(1145,350);ctx.lineTo(1145,589);ctx.stroke();
 for(let x of [135,1145]){
  ctx.fillStyle=x<640?"#9c3635":"#2b5b89";
  ctx.fillRect(x-13,350,26,245);
  ctx.fillStyle="#f2dfcf";ctx.save();ctx.translate(x-2,465);ctx.rotate(-PI/2);
  ctx.textAlign="center";ctx.font="900 13px system-ui";ctx.fillText("MMA  /  FIGHT NIGHT",0,0);ctx.restore();
 }
 // canvas floor
 let floor=grad(0,580,0,770,"#c4c6c3","#555c62");
 ctx.fillStyle=floor;ctx.fillRect(-500,FLOOR,2300,340);
 ctx.fillStyle="#9a9b9a";ctx.fillRect(0,FLOOR,1280,6);
 ctx.strokeStyle="#2228309c";ctx.lineWidth=3;ctx.beginPath();
 ctx.moveTo(180,622);ctx.lineTo(1100,622);ctx.moveTo(254,670);ctx.lineTo(1026,670);ctx.stroke();
 ctx.fillStyle="#242d31";ctx.font="1000 78px system-ui";ctx.textAlign="center";
 ctx.save();ctx.translate(640,666);ctx.scale(1,.32);ctx.fillText("UNDERGROUND",0,0);ctx.restore();
 ctx.font="900 15px system-ui";ctx.fillStyle="#464e56";ctx.fillText("FIGHT  •  CONTROL  •  FINISH",640,704);
 stains.forEach(v=>ellipse(v.x,v.y,v.r*1.4,v.r*.4,"#6e2430a8"));
 // foreground fence faint on edges only
 ctx.fillStyle="#090b10a3";ctx.fillRect(0,450,93,150);ctx.fillRect(1187,450,93,150);
}
function drawParticles(){
 for(const q of particles){
  ctx.globalAlpha=clamp(q.life/q.max,0,1);
  ellipse(q.x,q.y,q.r,q.r*.77,q.color);
 }
 ctx.globalAlpha=1;
}
function drawLighting(){
 // radial vignette
 let g=ctx.createRadialGradient(640,300,155,640,343,720);
 g.addColorStop(0,"#00000000");g.addColorStop(1,"#0000007b");
 ctx.fillStyle=g;ctx.fillRect(-300,-100,1900,1200);
 if(flash>0){ctx.fillStyle="rgba(244,224,192,"+flash.toFixed(3)+")";ctx.fillRect(-300,-100,1900,1200);}
}
function render(){
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,sw,sh);
 ctx.fillStyle="#080a10";ctx.fillRect(0,0,sw,sh);
 ctx.save();ctx.translate(sw*.5,sh*.5);ctx.scale(scale,scale);
 ctx.translate(-W*.5+(Math.random()-.5)*shake,-H*.5+(Math.random()-.5)*shake);
 arena();
 const sorted=[p,e].sort((a,b)=>a.down>0?-1:b.down>0?1:a.x-b.x);
 sorted.forEach(drawFighter);drawParticles();drawLighting();
 ctx.restore();
}
function loop(ms){
 const dt=Math.min(.035,Math.max(0,(ms-last)/1000||.016));last=ms;
 step(dt);render();requestAnimationFrame(loop);
}
function setHold(name,on){
 if(on)input.add(name);else input.delete(name);
 document.querySelectorAll('[data-action="'+name+'"]').forEach(b=>b.classList.toggle("pressed",on));
}
document.querySelectorAll("[data-action]").forEach(b=>{
 let name=b.dataset.action;
 b.addEventListener("pointerdown",ev=>{
  ev.preventDefault();if(b.setPointerCapture)b.setPointerCapture(ev.pointerId);
  setHold(name,true);
  if(ATT[name])pressAttack(p,name);
 });
 for(const event of ["pointerup","pointercancel","lostpointercapture"])
  b.addEventListener(event,()=>setHold(name,false));
 b.addEventListener("contextmenu",ev=>ev.preventDefault());
});
const keyMap={
 KeyA:"left",ArrowLeft:"left",KeyD:"right",ArrowRight:"right",
 KeyS:"slip",ShiftLeft:"slip",Space:"guard",
 KeyJ:"jab",KeyK:"cross",KeyL:"hook",KeyI:"kick",KeyO:"low",KeyG:"grab"
};
window.addEventListener("keydown",ev=>{
 const key=keyMap[ev.code];if(key){
  ev.preventDefault();if(!ev.repeat){input.add(key);if(ATT[key])pressAttack(p,key);}
 }else if(ev.code==="KeyP")togglePause();
 else if(ev.code==="KeyR"&&match.phase==="ended")resetMatch();
});
window.addEventListener("keyup",ev=>{
 const key=keyMap[ev.code];if(key){input.delete(key);ev.preventDefault();}
});
window.addEventListener("blur",()=>{input.clear();document.querySelectorAll(".pressed").forEach(b=>b.classList.remove("pressed"));});
document.addEventListener("visibilitychange",()=>{
 if(document.hidden&&match.phase==="fighting"){match.pause=true;$("#pause").textContent="▶";}
});
function togglePause(){
 if(match.phase!=="fighting")return;
 match.pause=!match.pause;$("#pause").textContent=match.pause?"▶":"Ⅱ";
 if(match.pause)tip("PAUSED","TAP ▶ TO RESUME",99);
 else{$("#message").classList.remove("on");$("#message").dataset.until="0";}
}
$("#pause").addEventListener("click",togglePause);
$("#mute").addEventListener("click",()=>{muted=!muted;$("#mute").textContent=muted?"♪̸":"♫";});
$("#start").addEventListener("click",resetMatch);
document.addEventListener("contextmenu",ev=>ev.preventDefault());
updateUI();requestAnimationFrame(loop);
})();
