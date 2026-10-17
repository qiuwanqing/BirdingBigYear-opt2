import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import bottleURL from './assets/bird-bottle.glb?url';

const STORAGE_KEY='supermarket-birding:first-sighting:v1';
const $=id=>document.getElementById(id);

// One explicitly authored discovery: the bird illustrated on the user's bottle.
// This is a raycast against a placed product and an annotated label region,
// rather than an automatic bird classifier for arbitrary supermarket textures.
export class BirdEncounter {
 constructor({canvas,interior,camera,controls,isInside,sky,toolTray}){
  Object.assign(this,{canvas,interior,camera,controls,isInside,sky,toolTray});
  this.locked=false;this.isOpen=false;this.ready=false;this.found=false;
  this.pointer=new THREE.Vector2();this.ray=new THREE.Raycaster();
  this.aim={x:innerWidth/2,y:innerHeight/2};this.targeted=false;
  this.captureRequested=false;this.flightTime=-1;this.record=null;
  try{this.record=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch{}
  this.scene=new THREE.Scene();
  this.skyScene=new THREE.Scene();this.skyCamera=new THREE.PerspectiveCamera(40,1,.1,500);
  this.productCamera=new THREE.PerspectiveCamera(38,1,.01,30);
  this.productCamera.position.set(0,.12,1.9);
  this.orbit=new OrbitControls(this.productCamera,canvas);
  this.orbit.enabled=false;this.orbit.enablePan=false;this.orbit.enableDamping=true;
  this.orbit.minDistance=.38;this.orbit.maxDistance=2.8;
  this.pivot=new THREE.Group();this.scene.add(this.pivot);
  this.birdTarget=new THREE.Mesh(new THREE.SphereGeometry(.065,16,12),new THREE.MeshBasicMaterial());
  this.birdTarget.position.set(.015,-.12,.14);
  this.birdTarget.visible=false;this.pivot.add(this.birdTarget);
  // An authored region of the original shelf is the entry point. No added
  // bottle or platform is placed in the aisle; the isolated scan is a close-up.
  this.product=new THREE.Object3D();this.product.position.set(.58,1.28,2.7);
  this.anchorReady=false;
  $('inspect-button').disabled=true;
  new GLTFLoader().load(bottleURL,gltf=>{
   const scan=gltf.scene;scan.rotation.y=-.52;
   scan.traverse(obj=>{if(obj.isMesh)obj.material=new THREE.MeshBasicMaterial({map:obj.material.map,side:THREE.DoubleSide})});
   this.pivot.add(scan);this.model=scan;

   this.ready=true;$('inspect-button').disabled=false;
  },undefined,error=>{
   console.error('Bird bottle failed to load',error);
   $('inspect-button').textContent='PRODUCT UNAVAILABLE';
  });
  canvas.addEventListener('dblclick',e=>{
   if(!isInside()||this.isOpen)return;
   e.preventDefault();this.moveAim(e.clientX,e.clientY);
   if(!this.locked)this.lock();else if(this.targeted)this.open();else this.unlock();
  });
  window.addEventListener('pointermove',e=>{
   if(!isInside()||(!this.locked&&!this.isOpen)||e.target!==canvas)return;
   this.moveAim(e.clientX,e.clientY);
   if(this.down&&Math.hypot(e.clientX-this.down.x,e.clientY-this.down.y)>5)this.dragged=true;
  });
  canvas.addEventListener('pointerdown',e=>{this.down={x:e.clientX,y:e.clientY};this.dragged=false});
  canvas.addEventListener('click',e=>{
   if(!isInside()||this.dragged)return;
   this.moveAim(e.clientX,e.clientY);
   if(this.isOpen){if(this.birdHit())this.capture();}
   else if(this.locked&&this.targeted)this.open();
  });
  $('spot-button').addEventListener('click',()=>{
   if(!this.locked)this.lock();else if(this.targeted)this.open();else this.unlock();
  });
  $('inspect-button').addEventListener('click',()=>{if(this.birdHit())this.capture()});
  $('close-product').addEventListener('click',()=>this.close());
  $('resume-button').addEventListener('click',()=>this.unlock());
  $('capture-card-close').addEventListener('click',()=>this.closeRecord());
  $('collection-button').addEventListener('click',()=>this.showRecord());
  $('product-collection').addEventListener('click',()=>this.showRecord());
  window.addEventListener('blur',()=>{this.down=null;this.dragged=true});
  this.updateCollection();
 }
 moveAim(x,y){
  this.aim={x,y};
  if(!this.isOpen)this.targeted=this.productHit();
 }
 inLens(){
  const radius=Math.min(innerWidth*.26,innerHeight*.46),offset=radius*.82;
  return [-1,1].some(sign=>Math.hypot(this.aim.x-innerWidth/2-sign*offset,this.aim.y-innerHeight/2)<radius*.94);
 }
 setRay(camera){
  const rect=this.canvas.getBoundingClientRect();
  this.pointer.set((this.aim.x-rect.left)/rect.width*2-1,1-(this.aim.y-rect.top)/rect.height*2);
  camera.updateMatrixWorld(true);this.ray.setFromCamera(this.pointer,camera);
 }
 productHit(){
  if(!this.ready||!this.inLens())return false;
  this.setRay(this.camera);this.interior.updateMatrixWorld(true);
  const hits=this.ray.intersectObjects(this.interior.children,true);
  if(!hits.length)return false;
  return this.anchorReady&&hits[0].point.distanceTo(this.product.position)<.17;
 }
 birdHit(){
  if(!this.isOpen||!this.ready||this.found||this.flightTime>=0||!this.inLens())return false;
  this.setRay(this.productCamera);this.scene.updateMatrixWorld(true);
  const bird=this.ray.intersectObject(this.birdTarget,false)[0];
  const surface=this.ray.intersectObject(this.model,true)[0];
  return !!(bird&&surface&&Math.abs(bird.distance-surface.distance)<.14);
 }
 lock(){
  if(!this.isInside()||this.isOpen)return;
  this.locked=true;this.controls.stop();
  this.moveAim(innerWidth/2,innerHeight/2);
  $('app').classList.add('aim-locked');
  $('spot-button').setAttribute('aria-pressed','true');
  $('resume-button').hidden=false;
  $('zoom-button').disabled=true;
 }
 unlock(){
  if(this.isOpen)return;
  this.locked=false;this.targeted=false;this.controls.stop();
  $('app').classList.remove('aim-locked');
  $('spot-button').setAttribute('aria-pressed','false');
  $('resume-button').hidden=true;
  $('zoom-button').disabled=false;
  this.resetReticle();
 }
 open(){
  if(!this.ready||!this.targeted||this.isOpen)return;
  this.isOpen=true;this.controls.stop();this.found=false;this.flightTime=-1;
  this.pivot.rotation.set(0,0,0);this.productCamera.position.set(0,-.1,1.9);
  this.openTime=0;
  this.orbit.target.set(0,-.1,0);this.orbit.enabled=true;this.orbit.update();
  $('app').classList.add('inspecting-product');
  $('product-ui').hidden=false;$('inside-ui').inert=true;
  this.toolTray.setMode('product');
  $('capture-card').hidden=true;$('released-bird').setAttribute('hidden','');
  $('release-sky').style.opacity='0';$('release-sky').hidden=true;
  this.moveAim(innerWidth/2,innerHeight/2);
  $('close-product').focus({preventScroll:true});
 }
 close(){
  if(!this.isOpen)return;
  this.isOpen=false;this.orbit.enabled=false;this.orbit.update();
  $('app').classList.remove('inspecting-product');
  $('product-ui').hidden=true;$('inside-ui').inert=false;
  this.toolTray.setMode('habitat');
  $('released-bird').setAttribute('hidden','');$('capture-card').hidden=true;
  $('release-sky').style.opacity='0';$('release-sky').hidden=true;
  this.flightTime=-1;this.captureRequested=false;this.down=null;
  this.locked=true;this.moveAim(innerWidth/2,innerHeight/2);
  $('spot-button').focus({preventScroll:true});
 }
 exit(){this.close();this.unlock();$('capture-card').hidden=true}
 capture(){
  if(this.found||this.captureRequested||!this.birdHit())return;
  this.captureRequested=true;
 }
 updateCollection(){
  $('collection-button').hidden=!this.record;
  $('product-collection').hidden=!this.record;
  $('collection-button').textContent='SIGHTING 01 ↗';
 }
 showRecord(){
  if(!this.record)return;
  if(!this.locked)this.lock();
  $('capture-image').src=this.record.image;
  $('capture-card').hidden=false;
  this.toolTray.setMode('record');
  $('capture-card-close').focus({preventScroll:true});
 }
 closeRecord(){
  $('capture-card').hidden=true;
  this.toolTray.setMode(this.isOpen?'product':'habitat');
  $(this.isOpen?'close-product':'spot-button').focus({preventScroll:true});
 }
 resetReticle(){
  const reticle=document.querySelector('.aim-reticle');
  reticle.style.left='50%';reticle.style.top='50%';reticle.classList.remove('on-target');
 }
 update(){
  if(!this.anchorReady){
   const scan=this.interior.children.find(child=>child.userData.habitatScan);
   if(scan){
    this.interior.updateMatrixWorld(true);
    const origin=new THREE.Vector3(0,1.5,4.6);
    this.ray.set(origin,this.product.position.clone().sub(origin).normalize());
    const hit=this.ray.intersectObject(scan,true)[0];
    if(hit){this.product.position.copy(hit.point);this.anchorReady=true;}
   }
  }
  if(!this.isInside())return;
  const reticle=document.querySelector('.aim-reticle');
  if(this.locked&&!this.isOpen){
   this.targeted=this.productHit();reticle.style.left=`${this.aim.x}px`;reticle.style.top=`${this.aim.y}px`;
   reticle.classList.toggle('on-target',this.targeted);
   $('spot-button').textContent=this.targeted?'OPEN PRODUCT ↗':'AIM AT PRODUCT ⌖';
   $('spot-button').disabled=!this.targeted;
  }else if(!this.isOpen){$('spot-button').textContent='LOCK VIEW ⌖';$('spot-button').disabled=false}
 }
 render(renderer,dt){
  this.productCamera.aspect=innerWidth/innerHeight;this.productCamera.updateProjectionMatrix();
  if(this.openTime<.8&&!this.found){
   this.openTime+=dt;
   const t=THREE.MathUtils.smoothstep(this.openTime,0,.8);
   this.productCamera.position.set(0,-.1,THREE.MathUtils.lerp(1.9,.62,t));
  }
  this.orbit.update();
  const drawView=()=>{
   renderer.setRenderTarget(null);renderer.render(this.interior,this.camera);
   renderer.autoClear=false;renderer.clearDepth();renderer.render(this.scene,this.productCamera);renderer.autoClear=true;
  };
  drawView();
  const hit=this.birdHit();
  $('inspect-button').disabled=!hit;
  $('inspect-button').textContent=this.found?'CAPTURED ✓':'CAPTURE BIRD ⌖';
  const reticle=$('product-reticle');
  reticle.style.left=`${this.aim.x}px`;reticle.style.top=`${this.aim.y}px`;
  reticle.classList.toggle('on-target',hit);reticle.hidden=this.found||!this.inLens();
  if(this.captureRequested){
   this.captureRequested=false;this.found=true;
   // Capture the rendered model immediately, before the drawing buffer clears.
   const crop=document.createElement('canvas');crop.width=480;crop.height=480;
   const source=renderer.domElement,side=Math.min(source.width,source.height)*.25;
   const rect=source.getBoundingClientRect();
   const x=THREE.MathUtils.clamp((this.aim.x-rect.left)/rect.width*source.width-side/2,0,source.width-side);
   const y=THREE.MathUtils.clamp((this.aim.y-rect.top)/rect.height*source.height-side/2,0,source.height-side);
   crop.getContext('2d').drawImage(source,x,y,side,side,0,0,480,480);
   this.record={product:'Bird-illustrated bottle',capturedAt:new Date().toISOString(),image:crop.toDataURL('image/jpeg',.82)};
   try{localStorage.setItem(STORAGE_KEY,JSON.stringify(this.record))}catch{}
   this.updateCollection();this.flightTime=0;this.orbit.enabled=false;
   // The release uses the actual sky panorama already present outside.
   this.skyScene.background=this.sky.background;
   this.skyScene.backgroundRotation.copy(this.sky.backgroundRotation);
   this.skyScene.backgroundIntensity=this.sky.backgroundIntensity;
   this.skyCamera.aspect=innerWidth/innerHeight;this.skyCamera.updateProjectionMatrix();
   renderer.render(this.skyScene,this.skyCamera);
   $('release-sky').style.backgroundImage=`url(${renderer.domElement.toDataURL('image/jpeg',.9)})`;
   $('release-sky').hidden=false;
   drawView();
   const bird=$('released-bird');bird.removeAttribute('hidden');bird.style.left=`${this.aim.x}px`;bird.style.top=`${this.aim.y}px`;
  }
  if(this.flightTime>=0){
   this.flightTime+=dt;
   const t=Math.min(this.flightTime/3.2,1),bird=$('released-bird');
   const skyMix=THREE.MathUtils.smoothstep(this.flightTime,.35,1.5);
   $('release-sky').style.opacity=String(skyMix);
   const x=(innerWidth*.62-this.aim.x)*t;
   const y=(innerHeight*.25-this.aim.y)*t-Math.sin(t*Math.PI)*innerHeight*.12;
   bird.style.transform=`translate(${x}px,${y}px) scale(${1.1-t*.85}) rotate(${-t*12}deg)`;
   bird.style.opacity=String(1-THREE.MathUtils.smoothstep(t,.78,1));
   if(t===1){this.flightTime=-1;bird.setAttribute('hidden','');}
  }
 }
}
