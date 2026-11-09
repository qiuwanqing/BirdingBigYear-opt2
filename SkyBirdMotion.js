const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
function identitySeed(asset){
 let hash=2166136261;
 for(const char of asset.id??asset.productId??'bird')hash=Math.imul(hash^char.charCodeAt(0),16777619);
 return (hash>>>0)/4294967296;
}
// Analytic, seeded wandering: position is shared by drawing and hit testing.
// Large smooth sweeps, climbing turns and changes of pace, with no random jumps.
export function skyBirdMotion(asset,time,viewportWidth,viewportHeight){
 const radius=Math.min(viewportWidth*.26,viewportHeight*.46),seed=identitySeed(asset);
 const phase=seed*Math.PI*2,rate=.32+seed*.15;
 const position=t=>{
  const s=t*rate+phase;
  const x=radius*(1.19*Math.sin(s)+.24*Math.sin(s*.59+phase));
  // Keep the entire bird inside the union of the binocular lenses, even on phones.
  const outer=Math.abs(Math.abs(x)-radius*.70);
  const room=Math.sqrt(Math.max(0,(radius*.80)**2-outer**2));
  const y=room*(.74*Math.sin(s*.91+phase+1)+.14*Math.sin(s*1.83-.4));
  return {x:viewportWidth/2+x,y:viewportHeight/2+y};
 };
 const p=position(time),before=position(time-.06),after=position(time+.06);
 const vx=(after.x-before.x)/.12,vy=(after.y-before.y)/.12;
 const facing=smooth(-radius*.045,radius*.045,vx);
 const rotation=clamp(Math.atan2(vy,Math.abs(vx)+radius*.06),-.5,.5)*(facing*2-1);
 const depth=.91+.18*Math.sin(time*.23+phase);
 const width=clamp(radius*.12,19,43)*depth;
 return {...p,width,height:width*160/240,rotation,facing,phase,glide:Math.sin(time*.49+phase)>.30};
}

// Archive flight in world coordinates, independent of the viewer/canvas.
// The same route continues when a bird is behind the viewer or out of frame.
export function skyBirdWorldMotion(asset,time){
 const seed=identitySeed(asset),phase=seed*Math.PI*2,direction=seed<.5?1:-1;
 const position=t=>{
  const angle=(seed-.5)*.55+direction*((.15+seed*.035)*t+.12*(Math.sin(t*.29+phase)-Math.sin(phase)));
  const distance=20+6*Math.sin(t*.19+phase);
  return {x:Math.sin(angle)*distance,y:2+2.5*Math.sin(t*.28+phase)+.7*Math.sin(t*.63+phase),z:-Math.cos(angle)*distance};
 };
 const p=position(time),a=position(time-.04),b=position(time+.04);
 return {...p,vx:(b.x-a.x)/.08,vy:(b.y-a.y)/.08,vz:(b.z-a.z)/.08,
  size:.60+seed*.15,phase,glide:Math.sin(time*.49+phase)>.3};
}

// Wander inside the binocular field, with genuine depth in front of the viewer.
// The caller rotates this local flight volume gently toward the camera.
export function skyBirdViewMotion(asset,time,aspect=1){
 const mixed=Math.sin(identitySeed(asset)*98765.4321)*43758.5453;
 const seed=mixed-Math.floor(mixed),phase=seed*Math.PI*2;
 const routeAsset={id:`${asset.id}-route-${Math.floor(seed*100000)}`};
 const position=t=>{
  const p=skyBirdMotion(routeAsset,t,1000*aspect,1000);
  const distance=19+4*Math.sin(t*.23+phase),halfHeight=Math.tan(20*Math.PI/180)*distance;
  return {x:(p.x/(1000*aspect)-.5)*2*halfHeight*aspect*.82,
   y:(.5-p.y/1000)*2*halfHeight*.45,z:-distance};
 };
 const p=position(time),a=position(time-.04),b=position(time+.04);
 return {...p,vx:(b.x-a.x)/.08,vy:(b.y-a.y)/.08,vz:(b.z-a.z)/.08,
  size:.8+seed*.25,phase,glide:Math.sin(time*.49+phase)>.3};
}
