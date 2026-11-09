import {loadBirdSilhouettes} from './BirdSilhouette.js';
import {skyBirdMotion} from './SkyBirdMotion.js';
const ease=(a,b,t)=>{const x=Math.max(0,Math.min(1,(t-a)/(b-a)));return x*x*(3-2*x);};
const mix=(a,b,t)=>a+(b-a)*t;
const duration=3.2;
// The first second is authored takeoff, independent of the moving sky target.
// Then a Hermite segment joins the sky with matching position and velocity.
export function createReleasePath(asset,rect,started,width,height){
 const origin={x:rect.x+rect.width/2,y:rect.y+rect.height/2};
 const run=Math.min(width*.095,rect.height*.8),rise=Math.min(height*.13,rect.height*.65);
 const launch={x:origin.x-run,y:origin.y-rise};
 const velocity={x:-2*run,y:-1.75*rise};
 const arrival=started+duration,end=skyBirdMotion(asset,arrival,width,height);
 const before=skyBirdMotion(asset,arrival-.04,width,height),after=skyBirdMotion(asset,arrival+.04,width,height);
 return {origin,run,rise,launch,velocity,end,endVelocity:{x:(after.x-before.x)/.08,y:(after.y-before.y)/.08}};
}
export function sampleReleasePath(path,elapsed){
 const t=Math.max(0,Math.min(duration,elapsed));
 if(t<=1)return {x:path.origin.x-path.run*t*t,y:path.origin.y-path.rise*(.25*t+.75*t*t),vx:-2*path.run*t,vy:-path.rise*(.25+1.5*t)};
 const length=duration-1,u=(t-1)/length;
 const h00=2*u*u*u-3*u*u+1,h10=u*u*u-2*u*u+u,h01=-2*u*u*u+3*u*u,h11=u*u*u-u*u;
 const d00=(6*u*u-6*u)/length,d10=3*u*u-4*u+1,d01=(-6*u*u+6*u)/length,d11=3*u*u-2*u;
 const result={};
 for(const axis of ['x','y']){
  result[axis]=h00*path.launch[axis]+h10*length*path.velocity[axis]+h01*path.end[axis]+h11*length*path.endVelocity[axis];
  result['v'+axis]=d00*path.launch[axis]+d10*path.velocity[axis]+d01*path.end[axis]+d11*path.endVelocity[axis];
 }
 return result;
}
export class BirdAnimation {
 constructor(collection){
  this.collection=collection;this.canvas=document.createElement('canvas');this.canvas.id='bird-flight-canvas';this.canvas.hidden=true;
  document.querySelector('.binocular-overlay').append(this.canvas);this.ctx=this.canvas.getContext('2d');this.time=0;this.active=false;
  this.ready=loadBirdSilhouettes().then(art=>{this.art=art;return art;});
  // Asset creation awaits the same loader and reports errors on the release UI.
  this.ready.catch(error=>console.error('Bird silhouette unavailable',error));
 }
 start(asset,rect){
  const started=performance.now();
  this.flight={asset,rect,started,path:createReleasePath(asset,rect,started/1000,innerWidth,innerHeight)};
  this.active=true;this.canvas.hidden=false;
 }
 showCollection({preview=false}={}){this.flight=null;this.previewAsset=preview?{id:'archive-preview-bird',productId:'preview-only'}:null;this.active=true;this.canvas.hidden=false;}
 hide(){this.active=false;this.flight=null;this.previewAsset=null;this.canvas.hidden=true;}
 destination(asset){
  return skyBirdMotion(asset,this.time,innerWidth,innerHeight);
 }
 drawPose(image,x,y,width,rotation=0,alpha=1){
  if(!image||alpha<=0)return;
  const c=this.ctx,scale=width/image.naturalWidth;c.save();c.globalAlpha=alpha;c.translate(x,y);c.rotate(rotation);
  // A single scale for both axes preserves the fixed drawing's proportions.
  c.scale(scale,scale);c.drawImage(image,-image.naturalWidth/2,-image.naturalHeight/2);c.restore();
 }
 flyingPose(time,phase=0,right=false,glide=false){
  const sequence=[0,1,2,1,3,1];
  const index=glide?3:sequence[(Math.floor(time*7+phase))%sequence.length];
  return (right?this.art?.rightFrames:this.art?.frames)?.[index];
 }
 drawFlying(asset,d,alpha=1){
  this.drawPose(this.flyingPose(this.time,d.phase,false,d.glide),d.x,d.y,d.width,d.rotation,alpha*(1-d.facing));
  this.drawPose(this.flyingPose(this.time,d.phase,true,d.glide),d.x,d.y,d.width,d.rotation,alpha*d.facing);
 }
 update(){
  if(!this.active)return null;
  this.time=performance.now()/1000;
  const dpr=Math.min(devicePixelRatio||1,1.75);
  if(this.canvas.width!==Math.round(innerWidth*dpr)||this.canvas.height!==Math.round(innerHeight*dpr)){
   this.canvas.width=Math.round(innerWidth*dpr);this.canvas.height=Math.round(innerHeight*dpr);
  }
  const c=this.ctx;c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,innerWidth,innerHeight);
  const flight=this.flight;
  const skyAssets=this.previewAsset?[...this.collection.items,this.previewAsset]:this.collection.items;
  for(const asset of skyAssets){
   if(asset.id===flight?.asset.id)continue;
   const d=this.destination(asset);this.drawFlying(asset,d);
  }
  if(!flight)return {finished:true,skyMix:1};
  const elapsed=(performance.now()-flight.started)/1000,t=Math.min(elapsed/duration,1);
  const d=this.destination(flight.asset),r=flight.rect,{x,y,vx,vy}=sampleReleasePath(flight.path,elapsed);
  const radius=Math.min(innerWidth*.26,innerHeight*.46),facing=ease(-radius*.045,radius*.045,vx);
  const rotation=Math.max(-.5,Math.min(.5,Math.atan2(vy,Math.abs(vx)+radius*.06)))*(facing*2-1);
  const span=mix(r.height,d.width,ease(0,.88,t)),poseMix=ease(.12,.32,elapsed),appear=ease(0,.18,elapsed);
  this.drawPose(this.art?.standing,x,y,span*192/310,rotation,(1-poseMix)*appear);
  if(elapsed<1){
   // Begin at a mid pose and a firm downstroke, rather than global-clock flapping.
   const beat=[1,2,1,0,1,2,1,0];
   this.drawPose(this.art?.frames[beat[Math.floor(elapsed*10)%beat.length]],x,y,span,rotation,poseMix*appear);
  }else this.drawFlying(flight.asset,{...d,x,y,width:span,rotation,facing},poseMix*appear);
  const state={finished:t===1,skyMix:ease(.5,1.65,elapsed),asset:flight.asset,position:{x,y,width:span,height:span*160/240},time:elapsed};
  if(state.finished)this.flight=null;
  return state;
 }
}
