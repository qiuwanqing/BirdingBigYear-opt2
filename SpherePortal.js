import * as THREE from 'three';
import { environmentConfig } from './environment-config.js';
import { PullBackground } from './PullBackground.js';
import { loadPlasticBag } from './PlasticBag.js';
import { PortalSilhouette } from './PortalSilhouette.js';

// The entrance from the user's sphere-portal project, with its DOM observation
// replaced by the existing 3D Habitat. Its optics and environment settings match.
export class SpherePortal {
 constructor(renderer,canvas,enabled){
  this.renderer=renderer;this.canvas=canvas;this.enabled=enabled;this.ready=false;
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#26302c');
  this.camera=new THREE.PerspectiveCamera(42,1,.005,100);
  this.state={dragging:false,yaw:0,pitch:0,shownYaw:0,shownPitch:0,velocityX:0,velocityY:0};
  this.darkness={value:0};this.edgeSoftness={value:environmentConfig.sphereEdgeSoftness};
  this.pullBackground=new PullBackground();this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();
  this.silhouette=new PortalSilhouette(renderer);
  this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Keep the same drag/entry root; replace only its central model and material.
  this.sphere=new THREE.Group();this.sphere.name='Plastic bag portal';
  this.sphere.visible=false;this.scene.add(this.sphere);
  this.bindControls();
  this.readyPromise=Promise.all([this.loadEnvironment(),loadPlasticBag(this.darkness,this.edgeSoftness).then(bag=>{
   this.bag=bag;this.sphere.add(bag.object);
  })]).then(()=>{this.orient();this.sphere.visible=true;this.ready=true});
 }
 async loadEnvironment(){
  const texture=await new THREE.TextureLoader().loadAsync(environmentConfig.url);
  if(Math.abs(texture.image.width/texture.image.height-2)>.02){texture.dispose();throw new Error('The entrance requires a full 2:1 panorama.');}
  texture.colorSpace=THREE.SRGBColorSpace;texture.mapping=THREE.EquirectangularReflectionMapping;
  const pmrem=new THREE.PMREMGenerator(this.renderer);
  try{this.environmentTarget=pmrem.fromEquirectangular(texture)}finally{pmrem.dispose()}
  this.scene.environment=this.environmentTarget.texture;this.panorama=texture;
  this.orient();
 }
 orient(){
  const s=this.state;
  this.scene.backgroundRotation.set(s.shownPitch,environmentConfig.rotation+s.shownYaw,0,'YXZ');
  this.scene.environmentRotation.copy(this.scene.backgroundRotation);
  this.sphere.rotation.copy(this.scene.backgroundRotation);
 }
 hitsSphere(x,y){
  if(!this.ready||!this.enabled())return false;
  const rect=this.canvas.getBoundingClientRect();
  this.pointer.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);
  this.camera.updateMatrixWorld(true);this.sphere.updateMatrixWorld(true);
  this.raycaster.setFromCamera(this.pointer,this.camera);
  return this.raycaster.intersectObject(this.sphere,true).length>0;
 }
 bindControls(){
  const canvas=this.canvas,s=this.state;
  canvas.addEventListener('pointerdown',e=>{
   if(e.button!==0||!this.hitsSphere(e.clientX,e.clientY))return;
   s.dragging=true;s.lastX=e.clientX;s.lastY=e.clientY;s.lastMoveTime=performance.now();
   s.velocityX=s.velocityY=0;canvas.style.cursor='grabbing';canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{
   if(!this.enabled())return;
   canvas.style.cursor=s.dragging?'grabbing':this.hitsSphere(e.clientX,e.clientY)?'grab':'default';
   if(!s.dragging)return;
   const dx=(e.clientX-s.lastX)*.006,dy=(e.clientY-s.lastY)*.006;
   const now=performance.now(),dt=Math.max((now-s.lastMoveTime)/1000,.008);
   s.yaw+=dx;s.pitch+=dy;
   s.velocityX=this.reducedMotion?0:THREE.MathUtils.clamp(dx/dt,-2,2);
   s.velocityY=this.reducedMotion?0:THREE.MathUtils.clamp(dy/dt,-2,2);
   s.lastX=e.clientX;s.lastY=e.clientY;s.lastMoveTime=now;
  });
  const release=()=>{
   if(!s.dragging)return;
   if(performance.now()-s.lastMoveTime>100)s.velocityX=s.velocityY=0;
   s.dragging=false;canvas.style.cursor='default';
  };
  for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,release);
  window.addEventListener('blur',()=>{release();s.velocityX=s.velocityY=0});
 }
 resize(width,height,bufferWidth,bufferHeight){
  this.camera.aspect=width/height;this.camera.fov=width<650?55:42;this.camera.updateProjectionMatrix();
  this.pullBackground.setSize(bufferWidth,bufferHeight);
  this.silhouette.setSize(bufferWidth,bufferHeight);
 }
 update(progress,dt){
  const s=this.state,ease=THREE.MathUtils.smoothstep;
  const distance=THREE.MathUtils.lerp(6.35,.25,ease(progress,0,1));
  this.camera.position.set(0,0,distance);this.camera.lookAt(0,0,0);
  if(!s.dragging){
   s.yaw+=s.velocityX*dt;s.pitch+=s.velocityY*dt;
   const friction=Math.exp(-dt*6);s.velocityX*=friction;s.velocityY*=friction;
  }
  const response=1-Math.exp(-dt*14);
  s.shownYaw+=(s.yaw-s.shownYaw)*response;s.shownPitch+=(s.pitch-s.shownPitch)*response;
  this.orient();
  this.bag?.update(dt,progress,this.reducedMotion);
  const diameter=1/(Math.sqrt(Math.max(distance*distance-1,.0001))*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2))*Math.min(this.camera.aspect,1));
  this.darkness.value=ease(diameter,.60,1.00)*environmentConfig.sphereDarkness;
 }
 render(target,progress){
  const silhouette=this.ready&&progress>.025?
   this.silhouette.render(this.renderer,this.scene,this.camera,environmentConfig.haloWidth):null;
  if(this.panorama)this.scene.background=this.pullBackground.render(this.renderer,this.camera,this.panorama,
   this.scene.environmentRotation,environmentConfig.blur,progress,this.reducedMotion,environmentConfig,silhouette);
  this.renderer.setRenderTarget(target);this.renderer.render(this.scene,this.camera);
 }
}
