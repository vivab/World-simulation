/* Lightweight elemental layer, alpha 0.3 */
(function(g){
g.createWorldElements=function({width:W,height:H,tile:T,terrain,altitude,onTerrainChange:changed}){
 const A=new Uint8Array(W*H),P=new Uint8Array(W*H),B=new Uint8Array(W*H),Q=new Uint8Array(W*H);
 const cv=document.createElement('canvas');cv.width=W;cv.height=H;const cx=cv.getContext('2d');
 let timer=0,frame=0,dirty=true;
 const at=(x,y)=>x+y*W,inside=(x,y)=>x>=0&&y>=0&&x<W&&y<H;
 const color=[null,[82,167,236],[255,119,31],[169,220,98],[250,109,54]];
 function place(x,y,t,p=7){if(!inside(x,y))return;const i=at(x,y);
   if(t===2&&(terrain[i]<2||terrain[i]>=5))return;
   if(t===1&&terrain[i]<2)return;
   if(t===4&&terrain[i]<2){terrain[i]=5;changed(i);}
   A[i]=t;P[i]=Math.max(P[i],p);dirty=true;
 }
 function paint(x,y,kind,radius=2){
   x=Math.floor(x);y=Math.floor(y);
   if(kind==='volcano')radius=5;
   for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
     const d=dx*dx+dy*dy;if(d>(radius+.2)**2||!inside(x+dx,y+dy))continue;
     const i=at(x+dx,y+dy),was=terrain[i];
     let to={ground:3,sand:7,rock:5,mountain:6,forest:4}[kind];
     if(kind==='volcano'){to=d<8?5:undefined;if(d<13)place(x+dx,y+dy,4,9);}
     if(to!==undefined){if(was!==to){terrain[i]=to;changed(i);}if(A[i]&&kind!=='volcano'){A[i]=P[i]=0;dirty=true;}}
     else if(kind==='water')place(x+dx,y+dy,1);
     else if(kind==='fire')place(x+dx,y+dy,2);
     else if(kind==='acid')place(x+dx,y+dy,3);
     else if(kind==='lava')place(x+dx,y+dy,4,9);
   }
 }
 function rain(storms){
  for(const s of storms){const n=storms.length>40?1:3;
    for(let k=0;k<n;k++){
      const a=Math.random()*6.283,r=Math.sqrt(Math.random())*s.radius/T;
      const x=Math.floor(s.x/T+Math.cos(a)*r),y=Math.floor(s.y/T+Math.sin(a)*r);
      if(!inside(x,y))continue;
      const i=at(x,y);
      if(A[i]===2){A[i]=P[i]=0;dirty=true;}
      else if(terrain[i]>=2&&A[i]===0&&Math.random()<.45)place(x,y,1,2);
    }
  }
 }
 function tick(storms){
  frame++;rain(storms);B.set(A);Q.set(P);
  const dirs=[[-1,0],[1,0],[0,-1],[0,1]];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const i=at(x,y),t=A[i],p=P[i];if(!t||!p)continue;
   const adj=[];
   for(const [dx,dy] of dirs){const nx=x+dx,ny=y+dy;if(inside(nx,ny))adj.push(at(nx,ny));}
   if(t===1){
     let best=-1,h=altitude[i]+.006;
     for(const j of adj){
       if(A[j]===2){B[j]=Q[j]=0;dirty=true;}
       if(A[j]===4){B[j]=Q[j]=0;B[i]=Q[i]=0;terrain[j]=5;changed(j);dirty=true;break;}
       if(terrain[j]<2||A[j]===3||A[j]===4||B[j]===2)continue;
       if(B[j]===1&&Q[j]>=p-1)continue;
       const val=altitude[j]+(B[j]===1?Q[j]*.002:0);
       if(val<h){h=val;best=j;}
     }
     if(best>=0&&Q[i]>1){B[best]=1;Q[best]=Math.min(9,Q[best]+1);Q[i]--;dirty=true;}
     if(Math.random()<.03){Q[i]=Math.max(0,Q[i]-1);dirty=true;}
   }else if(t===2){
     if(adj.some(j=>A[j]===1)){B[i]=Q[i]=0;dirty=true;continue;}
     if(terrain[i]===4&&Math.random()<.16){terrain[i]=3;changed(i);}
     for(const j of adj){
       if(A[j]||B[j])continue;
       if((terrain[j]===4||terrain[j]===3||terrain[j]===7)
          &&Math.random()<(terrain[j]===4?.2:.06)){B[j]=2;Q[j]=6;dirty=true;}
     }
     if(Math.random()<.27)Q[i]=Math.max(0,Q[i]-1);
   }else{
     for(const j of adj){
       if(A[j]===1){B[i]=Q[i]=0;B[j]=Q[j]=0;dirty=true;
         if(t===4){terrain[i]=5;changed(i);}break;}
       if(t===3&&(terrain[j]===4||terrain[j]===5||terrain[j]===6)&&Math.random()<.10){
         terrain[j]=terrain[j]===4?3:7;changed(j);}
       if(t===4&&terrain[j]===4&&Math.random()<.23){terrain[j]=3;changed(j);
         if(!B[j]){B[j]=2;Q[j]=5;}}
       if(terrain[j]>=2&&!B[j]&&p>2&&altitude[j]<=altitude[i]+.03
          &&Math.random()<(t===4?.11:.25)){
         B[j]=t;Q[j]=Math.max(2,p-2);Q[i]=Math.max(0,Q[i]-1);dirty=true;break;
       }
     }
     if(Math.random()<(t===4?.065:.14)){Q[i]=Math.max(0,Q[i]-1);
       if(t===4&&!Q[i]&&terrain[i]>=2){terrain[i]=5;changed(i);}dirty=true;}
   }
  }
  for(let i=0;i<A.length;i++)if(!Q[i])B[i]=0;
  A.set(B);P.set(Q);dirty=true;
 }
 function texture(){
  const im=cx.createImageData(W,H),d=im.data;
  for(let i=0;i<A.length;i++){const t=A[i];if(!t)continue;
    const c=color[t],k=i*4,w=Math.sin((i%W)*.5+frame*.3)*7;
    d[k]=c[0]+w;d[k+1]=c[1]+w;d[k+2]=c[2]+w;d[k+3]=Math.round(154+P[i]*10);}
  cx.clearRect(0,0,W,H);cx.putImageData(im,0,0);dirty=false;
 }
 function step(dt,storms=[]){
  timer=Math.min(.4,timer+dt);
  let n=0;while(timer>=.14&&n<3){timer-=.14;tick(storms);n++;}
  if(dirty)texture();
 }
 function reset(){A.fill(0);P.fill(0);B.fill(0);Q.fill(0);dirty=true;timer=0;}
 function serialize(){const out=[];for(let i=0;i<A.length;i++)if(A[i])out.push([i,A[i],P[i]]);return out;}
 function restore(data){reset();if(Array.isArray(data))for(const row of data.slice(0,A.length)){
   const [i,t,p]=row;if(Number.isInteger(i)&&i>=0&&i<A.length&&t>=1&&t<=4){
    A[i]=t;P[i]=Math.max(1,Math.min(9,Number(p)||1));}}
  texture();}
 function draw(ctx){ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(cv,0,0,W*T,H*T);ctx.restore();}
 return{paint,step,draw,reset,serialize,restore};
};
})(window);
