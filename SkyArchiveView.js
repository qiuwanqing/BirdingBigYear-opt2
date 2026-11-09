import * as THREE from 'three';
import {loadBirdFlightAtlas,flightPose} from './BirdFlightAtlas.js';
import {skyBirdViewMotion} from './SkyBirdMotion.js';

// A live panorama camera and paper silhouettes placed in actual 3D space.
// The binocular mask and screen texture remain independent DOM overlays.
export class SkyArchiveView {
 constructor({canvas,collection,background,isEnabled}){
  Object.assign(this,{canvas,collection,background,isEnabled});this.active=false;this.elapsed=0;
  this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(40,1,.1,500);this.camera.rotation.order='YXZ';
  this.sprites=new Map();this.yaw=0;this.pitch=0;this.targetYaw=0;this.targetPitch=0;
  this.flockRotation=new THREE.Quaternion();
  this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();this.size=new THREE.Vector2();
  this.right=new THREE.Vector3();this.up=new THREE.Vector3();this.velocity=new THREE.Vector3();
  this.hoverBox=document.createElement('div');this.hoverBox.className='sky-bird-hover';this.hoverBox.hidden=true;this.hoverBox.setAttribute('aria-hidden','true');
  (document.querySelector('.binocular-overlay')??canvas.parentElement).append(this.hoverBox);
  this.ready=loadBirdFlightAtlas().then(art=>{
   this.flightAtlas=art;this.sync();
  });
  this.ready.catch(error=>console.error('Sky silhouettes unavailable',error));
  canvas.addEventListener('pointerdown',e=>{
   if(!this.enabled||e.button!==0||this.drag)return;
   e.preventDefault();
   this.hoveredId=this.nearbyBird(e.clientX,e.clientY,24)?.userData.asset.id??null;
   if(e.pointerType==='touch')this.pinnedId=this.hoveredId;
   this.drag={id:e.pointerId,x:e.clientX,y:e.clientY,total:0};canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{
   if(!this.drag){
    if(e.pointerType!=='touch'&&this.enabled){this.pinnedId=null;this.hoverPoint={x:e.clientX,y:e.clientY};this.updateHover();}
    return;
   }
   if(e.pointerId!==this.drag.id)return;
   if(!this.enabled){this.endDrag();return;}
   const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;
   this.drag.total+=Math.hypot(dx,dy);this.drag.x=e.clientX;this.drag.y=e.clientY;
   if(this.drag.total<=4)return;
   this.unpinBird();
   this.targetYaw+=dx*.004;this.targetPitch=THREE.MathUtils.clamp(this.targetPitch+dy*.004,-1.3,1.3);
  });
  canvas.addEventListener('pointerup',e=>{if(e.pointerId===this.drag?.id)this.endDrag();});
  canvas.addEventListener('pointercancel',()=>this.endDrag());
  canvas.addEventListener('lostpointercapture',()=>this.endDrag());
  canvas.addEventListener('pointerleave',()=>{if(!this.drag)this.clearHover();});
  window.addEventListener('pointermove',e=>{if(e.target!==canvas&&!this.drag)this.clearHover();});
  window.addEventListener('blur',()=>{this.endDrag();this.clearHover();});
 }
 get enabled(){return this.active&&this.isEnabled();}
 endDrag(){
  const drag=this.drag;if(!drag)return;this.drag=null;
  if(drag.total>4)this.ignoreClickUntil=performance.now()+250;
  if(this.canvas.hasPointerCapture(drag.id))this.canvas.releasePointerCapture(drag.id);
 }
 enter({preview=false}={}){
  this.active=true;this.elapsed=0;this.setPreview(preview);
  this.demoBirds=[...Array.from({length:3},(_,i)=>({id:`sky-demo-${i}`,preview:true})),
   ...Array.from({length:3},(_,i)=>({id:`sky-blackbird-${i}`,flightStyle:'blackbird',preview:true}))];this.sync();
  for(const sprite of this.sprites.values())sprite.userData.clock=0;
  this.updateBirds();
  this.yaw=0;this.pitch=0;
  this.targetYaw=this.yaw;this.targetPitch=this.pitch;this.camera.rotation.set(this.pitch,this.yaw,0,'YXZ');
  this.camera.updateMatrixWorld(true);
  this.flockRotation.copy(this.camera.quaternion);
 }
 leave(){this.endDrag();this.unpinBird();this.active=false;}
 setPreview(value){this.unpinBird();this.demoBirds=[];this.previewAsset=value?{id:'archive-preview-bird',preview:true}:null;this.sync();}
 clearHover(){this.hoveredId=null;this.hoverPoint=null;this.hoverBox.hidden=true;}
 pinBird(id){if(this.sprites.has(id)){this.pinnedId=id;this.hoveredId=id;}}
 unpinBird(){this.pinnedId=null;this.clearHover();}
 screenBounds(sprite){
  const rect=this.canvas.getBoundingClientRect(),view=sprite.position.clone().applyMatrix4(this.camera.matrixWorldInverse);
  if(view.z>=-this.camera.near)return null;
  const point=sprite.position.clone().project(this.camera);if(point.z< -1||point.z>1)return null;
  const factor=rect.height*this.camera.projectionMatrix.elements[5]/(-2*view.z);
  const w=sprite.scale.x*factor,h=sprite.scale.y*factor,cs=Math.abs(Math.cos(sprite.material.rotation)),sn=Math.abs(Math.sin(sprite.material.rotation));
  return {x:rect.left+(point.x*.5+.5)*rect.width,y:rect.top+(.5-point.y*.5)*rect.height,width:Math.max(18,w*cs+h*sn),height:Math.max(14,h*cs+w*sn)};
 }
 insideLens(x,y){
  const rect=this.canvas.getBoundingClientRect(),r=Math.min(rect.width*.26,rect.height*.46);
  return [-1,1].some(sign=>Math.hypot(x-rect.left-rect.width/2-sign*r*.7,y-rect.top-rect.height/2)<r*.94);
 }
 proximity(sprite,x,y){
  const b=this.screenBounds(sprite);return b?Math.hypot(Math.max(0,Math.abs(x-b.x)-b.width/2),Math.max(0,Math.abs(y-b.y)-b.height/2)):Infinity;
 }
 nearbyBird(x,y,padding=18){
  if(!this.insideLens(x,y))return null;
  let nearest=null,best=padding;
  for(const sprite of this.sprites.values()){
   const distance=this.proximity(sprite,x,y);if(distance<=best){nearest=sprite;best=distance;}
  }return nearest;
 }
 updateHover(){
  if(this.pinnedId)return;
  if(!this.enabled||!this.hoverPoint||this.drag?.total>4){this.hoveredId=null;return;}
  const {x,y}=this.hoverPoint,current=this.sprites.get(this.hoveredId);
  if(current&&this.insideLens(x,y)&&this.proximity(current,x,y)<=28)return;
  this.hoveredId=this.nearbyBird(x,y)?.userData.asset.id??null;
 }
 updateHoverBox(){
  const sprite=this.sprites.get(this.pinnedId??this.hoveredId),b=sprite&&this.screenBounds(sprite);
  this.hoverBox.hidden=!b;if(!b)return;
  const parent=this.hoverBox.parentElement.getBoundingClientRect();
  Object.assign(this.hoverBox.style,{left:`${b.x-parent.left-b.width/2-5}px`,top:`${b.y-parent.top-b.height/2-5}px`,width:`${b.width+10}px`,height:`${b.height+10}px`});
 }
 sync(){
  if(!this.flightAtlas)return;
  const assets=[...this.collection.items,...(this.demoBirds??[])];
  if(!assets.length&&this.previewAsset)assets.push(this.previewAsset);
  const ids=new Set(assets.map(asset=>asset.id));
  for(const [id,sprite] of this.sprites)if(!ids.has(id)){this.scene.remove(sprite);sprite.material.dispose();this.sprites.delete(id);}
  for(const asset of assets){
   let sprite=this.sprites.get(asset.id);
   if(!sprite){
    const atlas=this.flightAtlas[asset.flightStyle]??this.flightAtlas.egret;
    sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:atlas.rows[0][0][0],transparent:true,alphaTest:.08,depthWrite:false,toneMapped:false}));
    sprite.name='Spatial bird silhouette';this.scene.add(sprite);this.sprites.set(asset.id,sprite);
    sprite.userData.clock=this.elapsed;
   }
   sprite.userData.asset=asset;
  }
 }
 updateBirds(dt=0){
  this.sync();this.right.set(1,0,0).applyQuaternion(this.camera.quaternion);this.up.set(0,1,0).applyQuaternion(this.camera.quaternion);
  for(const sprite of this.sprites.values()){
   const id=sprite.userData.asset.id;
   if(id!==this.hoveredId&&id!==this.pinnedId)sprite.userData.clock+=dt;
   const time=sprite.userData.clock,motion=skyBirdViewMotion(sprite.userData.asset,time,this.camera.aspect);
   const style=sprite.userData.asset.flightStyle??'egret',size=motion.size*(style==='blackbird'?1.15:1.5);
   sprite.position.set(motion.x,motion.y,motion.z).applyQuaternion(this.flockRotation);sprite.scale.set(size,size,1);
   this.velocity.set(motion.vx,motion.vy,motion.vz).applyQuaternion(this.flockRotation);
   const horizontal=this.velocity.dot(this.right),vertical=this.velocity.dot(this.up);
   if(Math.abs(horizontal)>.05)sprite.userData.facesRight=horizontal>0;
   const pose=flightPose(motion,time,sprite.userData.poseRow,style);
   sprite.userData.poseRow=pose.row;
   const atlas=this.flightAtlas[style]??this.flightAtlas.egret;
   sprite.material.map=atlas.rows[pose.row][pose.mirror][pose.frame];
   const tilt=THREE.MathUtils.clamp(Math.atan2(-vertical,Math.abs(horizontal)+1),-.45,.45);
   sprite.material.rotation=sprite.userData.facesRight?tilt:-tilt;
  }
 }
 render(renderer,dt){
  if(!this.active)return;
  const delta=Math.min(Math.max(dt,0),.1);this.elapsed+=delta;
  const response=1-Math.exp(-Math.max(dt,0)*14);
  this.yaw+=(this.targetYaw-this.yaw)*response;this.pitch+=(this.targetPitch-this.pitch)*response;
  this.camera.rotation.set(this.pitch,this.yaw,0,'YXZ');this.camera.updateMatrixWorld(true);
  this.flockRotation.slerp(this.camera.quaternion,1-Math.exp(-Math.max(dt,0)*2.5));
  // A small delayed response, bounded even during a fast panorama drag.
  const lag=this.flockRotation.angleTo(this.camera.quaternion);
  const maxLag=.01*Math.min(1,this.camera.aspect);
  if(lag>maxLag)this.flockRotation.rotateTowards(this.camera.quaternion,lag-maxLag);
  renderer.getSize(this.size);const aspect=this.size.x/Math.max(this.size.y,1);
  if(this.camera.aspect!==aspect){this.camera.aspect=aspect;this.camera.updateProjectionMatrix();}
  this.scene.background=this.background.background;
  this.scene.backgroundRotation.copy(this.background.backgroundRotation);this.scene.backgroundIntensity=this.background.backgroundIntensity;
  this.sync();this.updateHover();this.updateBirds(delta);this.updateHoverBox();renderer.setRenderTarget(null);renderer.render(this.scene,this.camera);
 }
 pick(x,y){
  if(!this.active||performance.now()<(this.ignoreClickUntil??0))return null;
  const sprite=this.nearbyBird(x,y,24);if(!sprite)return null;
  return sprite.userData.asset;
 }
}
