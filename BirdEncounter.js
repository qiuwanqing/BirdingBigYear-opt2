import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import bottleURL from './assets/bird-bottle.glb?url';
import {BirdCollection} from './BirdAsset.js';
import {makeBottlePointCamera,renderBottleShotPNG} from './BottleReleaseShot.js';
import {BirdSelection} from './BirdSelection.js';
import {BirdAnimation} from './BirdAnimation.js';
import {BirdReleaseVideo,RELEASE_VIDEO} from './BirdReleaseVideo.js';
import {ProductArchive} from './ProductArchive.js';
import {SkyArchiveView} from './SkyArchiveView.js';

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
  this.captureRequested=false;this.flightTime=-1;this.record=null;this.releaseRevision=0;
  this.collection=new BirdCollection();this.animation=new BirdAnimation(this.collection);
  this.releaseVideo=new BirdReleaseVideo(document.querySelector('.binocular-overlay'));
  this.productArchive=new ProductArchive();
  this.selection=new BirdSelection({toolTray,onConfirm:(...args)=>this.confirmRelease(...args),onCancel:()=>{
   $('app').classList.remove('selecting-bird');this.toolTray.setMode('product');this.orbit.enabled=true;
  }});
  this.collectionReady=this.collection.load().then(()=>{this.record=this.collection.items.at(-1)??null;this.updateCollection();}).catch(error=>{
   this.collectionError=error;console.error('Bird collection could not be loaded',error);
  });
  this.scene=new THREE.Scene();
  this.skyScene=new THREE.Scene();this.skyCamera=new THREE.PerspectiveCamera(40,1,.1,500);
  this.skyArchive=new SkyArchiveView({canvas,collection:this.collection,background:sky,
   isEnabled:()=>this.birdInSky&&!this.videoPlaying});
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
   if(this.selection.active)return;
   if(this.birdInSky)return;
   if(this.isOpen){if(this.birdHit())this.capture();}
   else if(this.locked&&this.targeted)this.open();
  });
  $('spot-button').addEventListener('click',()=>{
   if(!this.locked)this.lock();else if(this.targeted)this.open();else this.unlock();
  });
  $('inspect-button').addEventListener('click',()=>{if(this.birdHit())this.capture()});
  $('close-product').addEventListener('click',()=>this.close());
  $('shot-back').addEventListener('click',()=>this.close());
  $('shot-resume').addEventListener('click',()=>this.resumeProductOrbit());
  $('shot-download').addEventListener('click',()=>this.downloadFixedShot());
  $('shot-sky-preview').addEventListener('click',()=>this.showCollection(true));
  $('video-retry').addEventListener('click',()=>this.playReleaseVideo());
  $('video-skip').addEventListener('click',()=>{this.stopReleaseVideo();this.showCollection(true);});
  $('video-back').addEventListener('click',()=>{this.stopReleaseVideo();this.toolTray.setMode('shot');this.toolTray.setExpanded(true);$('shot-note').hidden=false;});
  $('resume-button').addEventListener('click',()=>this.unlock());
  $('sky-clear').addEventListener('click',()=>this.clearSkyArchive());
  $('collection-button').addEventListener('click',()=>this.showProductArchive());
  $('product-collection').addEventListener('click',()=>this.showProductArchive());
  $('sky-button').addEventListener('click',()=>{this.productArchive.hide();this.showCollection();});
  $('sky-back').addEventListener('click',()=>this.close());
  window.addEventListener('blur',()=>{this.down=null;this.dragged=true});
  this.updateCollection();
 }
 moveAim(x,y){
  this.aim={x,y};
  if(!this.isOpen)this.targeted=this.productHit();
 }
 inLens(){
  const radius=Math.min(innerWidth*.26,innerHeight*.46),offset=radius*.70;
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
  if(!this.isOpen||!this.ready||this.found||this.videoPlaying||this.fixedShot?.ready===false||this.exportingShot||this.selection.active||this.birdInSky||this.flightTime>=0||!this.inLens())return false;
  this.setRay(this.productCamera);this.scene.updateMatrixWorld(true);
  // Shot preparation uses the user's chosen point on the bottle, rather than
  // restricting clicks to the old single authored bird target. No classification.
  this.labelHit=this.ray.intersectObject(this.model,true)[0]??null;
  return !!this.labelHit;
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
  this.productArchive.hide();this.productArchive.record('bird-bottle-01');
  this.releaseRevision++;this.captureError=null;this.fixedShot=null;
  this.isOpen=true;this.controls.stop();this.found=false;this.flightTime=-1;this.birdInSky=false;
  this.pivot.rotation.set(0,0,0);this.productCamera.position.set(0,-.1,1.9);
  this.openTime=0;
  this.orbit.target.set(0,-.1,0);this.orbit.enabled=true;this.orbit.update();
  $('app').classList.add('inspecting-product');
  $('product-ui').hidden=false;$('inside-ui').inert=false;
  this.toolTray.setMode('product');
  this.animation.hide();
  $('release-sky').style.opacity='0';$('release-sky').hidden=true;
  this.moveAim(innerWidth/2,innerHeight/2);
  $('close-product').focus({preventScroll:true});
 }
 close(){
  if(!this.isOpen)return;
  this.releaseRevision++;this.fixedShot=null;$('shot-note').hidden=true;
  this.stopReleaseVideo();
  this.isOpen=false;this.orbit.enabled=false;this.orbit.update();
  this.skyArchive.leave();
  this.selection.hide();this.animation.hide();this.birdInSky=false;
  $('app').classList.remove('inspecting-product','selecting-bird','bird-in-sky');
  $('product-ui').hidden=true;$('inside-ui').inert=false;
  this.toolTray.setMode('habitat');
  $('release-sky').style.opacity='0';$('release-sky').hidden=true;
  this.flightTime=-1;this.captureRequested=false;this.down=null;
  this.locked=true;this.moveAim(innerWidth/2,innerHeight/2);
  $('spot-button').focus({preventScroll:true});
 }
 exit(){this.productArchive.hide();this.close();this.unlock();}
 capture(){
  if(this.found||this.captureRequested||this.exportingShot||!this.birdHit())return;
  this.orbit.enabled=false;
  const point=this.labelHit.point.clone(),center=new THREE.Box3().setFromObject(this.model).getCenter(new THREE.Vector3());
  const camera=makeBottlePointCamera(point,center,this.productCamera),height=1080,width=Math.max(2,Math.round(height*camera.aspect/2)*2);
  this.fixedShot={ready:false,elapsed:0,camera,target:point,width,height,
   id:`bottle-shot-${Date.now()}`,
   from:this.productCamera.clone(),sequence:this.shotSequence=(this.shotSequence??0)+1,
   exposure:this.renderer?.toneMappingExposure??1.18};
  this.openTime=.8;this.toolTray.setMode('shot');this.toolTray.setExpanded(true);
  $('shot-download').disabled=true;$('shot-note').hidden=false;
  $('shot-note').textContent='正在对准你点击的瓶身位置…';
 }
 updateFixedShot(dt){
  const shot=this.fixedShot;if(!shot||shot.ready)return;
  shot.elapsed=Math.min(.85,shot.elapsed+dt);
  const u=shot.elapsed/.85,t=u*u*(3-2*u);
  this.productCamera.position.lerpVectors(shot.from.position,shot.camera.position,t);
  this.productCamera.quaternion.slerpQuaternions(shot.from.quaternion,shot.camera.quaternion,t);
  this.productCamera.fov=THREE.MathUtils.lerp(shot.from.fov,shot.camera.fov,t);
  this.productCamera.updateProjectionMatrix();
  if(u===1){
   shot.ready=true;this.orbit.target.copy(shot.target);$('shot-download').disabled=false;
   $('shot-note').textContent=`已固定所选位置 · ${shot.width} × ${shot.height} · 播放占位视频后进入天空。`;
   this.playReleaseVideo();
  }
 }
 stopReleaseVideo(){
  this.videoToken=(this.videoToken??0)+1;this.videoPlaying=false;
  this.releaseVideo.cancel();if(this.model)this.model.visible=true;
 }
 async playReleaseVideo(){
  if(!this.fixedShot?.ready||this.videoPlaying||!this.isOpen)return;
  const shot=this.fixedShot,revision=this.releaseRevision,token=this.videoToken=(this.videoToken??0)+1;
  this.videoPlaying=true;this.orbit.enabled=false;
  this.model.visible=false;$('shot-note').hidden=true;$('video-status').hidden=true;
  this.toolTray.setMode('video');this.toolTray.setExpanded(true);$('video-retry').hidden=true;
  try{
   const ended=await this.releaseVideo.play();
   if(!ended||this.videoToken!==token||this.releaseRevision!==revision||this.fixedShot!==shot||!this.isOpen)return;
   this.stopReleaseVideo();this.showCollection(true);
  }catch(error){
   if(this.videoToken!==token||!this.isOpen)return;
   this.stopReleaseVideo();this.toolTray.setMode('video');$('video-status').hidden=false;$('video-status').textContent='视频播放失败';
   $('video-retry').hidden=false;console.error('Release video failed',error);
  }
 }
 resumeProductOrbit(){
  if(!this.fixedShot)return;
  const {camera,target}=this.fixedShot;
  this.orbit.target.copy(target);
  // Clear old orbit inertia without letting it shift the saved viewpoint.
  const damping=this.orbit.enableDamping;this.orbit.enableDamping=false;this.orbit.update();
  this.productCamera.position.copy(camera.position);this.productCamera.quaternion.copy(camera.quaternion);
  this.orbit.update();this.orbit.enableDamping=damping;
  this.fixedShot=null;$('shot-note').hidden=true;this.orbit.enabled=true;
  this.toolTray.setMode('product');
 }
 async downloadFixedShot(){
  if(!this.fixedShot?.ready||this.exportingShot)return;
  const revision=this.releaseRevision;this.exportingShot=true;$('shot-download').disabled=true;
  try{
   const shot=this.fixedShot;
   const blob=await renderBottleShotPNG(this.scene,shot);
   if(!this.isOpen||this.releaseRevision!==revision)return;
   const url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download=`${shot.id}-${shot.width}x${shot.height}-transparent.png`;
   link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
   if(this.fixedShot)$('shot-note').textContent='透明首帧已导出 · 鸟与瓶身标签近景，无准星或屏幕纹理。';
  }catch(error){
   console.error('Fixed shot export failed',error);
   if(this.fixedShot)$('shot-note').textContent='首帧导出失败，请重试。';
  }finally{this.exportingShot=false;if(this.fixedShot?.ready)$('shot-download').disabled=false;}
 }
 downloadShotConfig(){
  const shot=this.fixedShot;if(!shot?.ready)return;
  const camera=shot.camera;
  const metadata={schemaVersion:1,shotId:shot.id,productId:'bird-bottle-01',
   frame:{width:shot.width,height:shot.height,file:`${shot.id}-${shot.width}x${shot.height}-transparent.png`},
   camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),target:shot.target.toArray(),fov:camera.fov,aspect:shot.width/shot.height,near:camera.near,far:camera.far},
   model:{rotation:this.model.rotation.toArray(),pivotQuaternion:this.pivot.quaternion.toArray()},
   exposure:shot.exposure,video:{status:'placeholder',sources:[RELEASE_VIDEO.url],placeholder:RELEASE_VIDEO.placeholder,finalRequiresAlpha:true},
   afterVideo:{view:'sky-archive',birdStyle:'small-black-silhouette'}};
  const url=URL.createObjectURL(new Blob([JSON.stringify(metadata,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=`${shot.id}-config.json`;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
 }
 updateCollection(){
  const count=this.collection.items.length;
  for(const id of ['collection-button','product-collection']){$(id).hidden=false;$(id).textContent='ARCHIVE';$(id).setAttribute('aria-label','商品 Archive');}
  $('sky-button').setAttribute('aria-label',`Sky, ${count} birds`);
 }
 showProductArchive(){
  if(this.productArchive.isOpen){this.productArchive.hide();return;}
  if(this.isOpen)this.close();
  this.controls.stop();this.toolTray.setExpanded(true);this.productArchive.open();
 }
 async clearSkyArchive(){
  if(this.deletingArchive)return;
  const count=this.collection.items.length;
  if(count&&!window.confirm(`清空全部 ${count} 只已保存的鸟？刷新后也不会恢复。`))return;
  this.deletingArchive=true;$('sky-clear').disabled=true;
  try{
   await this.collection.clear();this.record=null;
   this.updateCollection();if(this.birdInSky)this.refreshSkyArchive();
  }catch(error){window.alert('清空失败，请重试。');console.error(error);}
  finally{this.deletingArchive=false;$('sky-clear').disabled=false;}
 }
 refreshSkyArchive(){
  this.skyArchive.setPreview(false);this.toolTray.setMode('collection');this.toolTray.setExpanded(true);
 }
 prepareSky(renderer){
  this.skyScene.background=this.sky.background;this.skyScene.backgroundRotation.copy(this.sky.backgroundRotation);
  this.skyScene.backgroundIntensity=this.sky.backgroundIntensity;
  this.skyCamera.aspect=innerWidth/innerHeight;this.skyCamera.updateProjectionMatrix();
  renderer.setRenderTarget(null);renderer.render(this.skyScene,this.skyCamera);
  $('release-sky').style.backgroundImage=`url(${renderer.domElement.toDataURL('image/jpeg',.9)})`;
  $('release-sky').hidden=false;this.skyViewport=`${innerWidth}x${innerHeight}`;
  // Restore the product immediately after taking the sky snapshot, so preparing
  // the background cannot flash the live WebGL canvas to the sky for one frame.
  this.drawProductView(renderer);
 }
 drawProductView(renderer){
  renderer.setRenderTarget(null);renderer.render(this.interior,this.camera);
  const autoClear=renderer.autoClear;
  try{renderer.autoClear=false;renderer.clearDepth();renderer.render(this.scene,this.productCamera);}
  finally{renderer.autoClear=autoClear;}
 }
 async confirmRelease(asset,rect,source,isCurrent=null){
  const revision=this.selection.revision;
  const valid=isCurrent??(()=>this.isOpen&&this.selection.active&&this.selection.revision===revision);
  await this.collectionReady;
  if(!valid())return;
  if(this.collectionError)throw new Error('收藏存储不可用，请允许浏览器保存本站数据后重试。');
  await this.collection.add(asset);
  if(!valid()){this.updateCollection();return;}
  this.record=asset;this.updateCollection();this.selection.hide();
  this.found=true;this.birdInSky=true;this.orbit.enabled=false;this.flightTime=0;
  $('app').classList.remove('selecting-bird');$('app').classList.add('bird-in-sky');
  this.prepareSky(this.renderer);$('release-sky').style.opacity='0';
  this.animation.start(asset,rect,source);this.toolTray.setMode('collection');this.toolTray.setExpanded(false);
 }
 showCollection(preview=false){
  this.productArchive.hide();
  this.stopReleaseVideo();
  this.fixedShot=null;$('shot-note').hidden=true;
  this.controls.stop();this.locked=true;this.isOpen=true;this.birdInSky=true;this.orbit.enabled=false;
  $('app').classList.add('inspecting-product','bird-in-sky');$('product-ui').hidden=false;$('inside-ui').inert=false;
  $('release-sky').hidden=true;
  const demo=preview&&!this.collection.items.length;
  this.animation.hide();this.skyArchive.enter({preview:demo});this.toolTray.setMode('collection');
  if(this.renderer)this.skyArchive.render(this.renderer,0);
  if(preview)this.toolTray.setExpanded(true);
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
   $('spot-button').textContent=this.targeted?'OPEN PRODUCT':'AIM AT BIRD';
   $('spot-button').disabled=!this.targeted;
  }else if(!this.isOpen){$('spot-button').textContent='LOCK VIEW';$('spot-button').disabled=false}
 }
 render(renderer,dt){
  this.renderer=renderer;
  if(this.birdInSky&&!this.animation.flight){
   if(!this.skyArchive.active){this.animation.hide();this.skyArchive.enter();}
   $('release-sky').hidden=true;this.skyArchive.render(renderer,dt);return;
  }
  if(this.birdInSky&&this.skyViewport!==`${innerWidth}x${innerHeight}`)this.prepareSky(renderer);
  this.productCamera.aspect=innerWidth/innerHeight;this.productCamera.updateProjectionMatrix();
  if(this.fixedShot)this.updateFixedShot(dt);
  if(!this.fixedShot&&this.openTime<.8&&!this.found&&!this.selection.active){
   this.openTime+=dt;
   const t=THREE.MathUtils.smoothstep(this.openTime,0,.8);
   this.productCamera.position.set(0,-.1,THREE.MathUtils.lerp(1.9,.62,t));
  }
  if(!this.fixedShot)this.orbit.update();
  this.drawProductView(renderer);
  const hit=this.birdHit();
  $('inspect-button').disabled=!hit||this.captureRequested;
  $('inspect-button').textContent=this.captureRequested?'RELEASING…':this.found?'RELEASED ✓':this.captureError??'PREPARE VIDEO SHOT ↗';
  const reticle=$('product-reticle');
  reticle.style.left=`${this.aim.x}px`;reticle.style.top=`${this.aim.y}px`;
  reticle.classList.toggle('on-target',hit);reticle.hidden=!!this.fixedShot||this.found||this.selection.active||!this.inLens();
  if(this.selection.active)this.selection.draw();
  if(this.animation.active){
   const state=this.animation.update(dt);$('release-sky').style.opacity=String(state.skyMix);
   this.flightTime=state.finished?-1:state.time;
  }
 }
}
