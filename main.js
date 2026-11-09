import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import allScansURL from './assets/all-scans.glb?url';
import releaseSkyURL from './assets/sky-panorama.png?url';
import { environmentConfig } from './environment-config.js';
import { SpherePortal } from './SpherePortal.js';
import { ScanSpaceView } from './ScanSpaceView.js';
import { HabitatControls } from './HabitatControls.js';
import { BirdEncounter } from './BirdEncounter.js';
import { HabitatToolTray } from './HabitatToolTray.js';

const $=id=>document.getElementById(id);
const app=$('app'),canvas=$('webgl');
const toolTray=new HabitatToolTray();
let renderer;
try{
 renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
}catch(error){$('loading').hidden=true;$('gl-fallback').hidden=false;throw error}
renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=environmentConfig.exposure;
const clamp=THREE.MathUtils.clamp,mix=THREE.MathUtils.lerp;
const smooth=(a,b,value)=>THREE.MathUtils.smoothstep(value,a,b);
let progress=0,desired=0,currentInside=false,zoomLevel=1,habitatReady=false,spaceView=null;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const portal=new SpherePortal(renderer,canvas,()=>!currentInside);
const interior=new THREE.Scene();
const insideCamera=new THREE.PerspectiveCamera(67,1,.1,150);
insideCamera.position.set(0,1.5,4.6);insideCamera.lookAt(0,1.7,-12);
interior.add(new THREE.HemisphereLight(0xfff9e9,0x5a6055,1.35));
const keylight=new THREE.DirectionalLight(0xfff7e6,1.1);keylight.position.set(1,5,3);interior.add(keylight);
// Kept from the existing Habitat; it is separate from the new entrance exposure.
for(let k=0;k<3;k++){
 const light=new THREE.PointLight(0xfff8e8,4,5,2);light.position.set(0,1.88,3-k*2.35);interior.add(light);
}

// The captured silhouette still flies into the existing blue sky. The supermarket
// panorama replaces the entrance only, not this already-authored release scene.
const releaseSky=new THREE.Scene();releaseSky.background=new THREE.Color('#d6e6ef');
new THREE.TextureLoader().load(releaseSkyURL,texture=>{
 texture.colorSpace=THREE.SRGBColorSpace;texture.mapping=THREE.EquirectangularReflectionMapping;
 releaseSky.background=texture;
},undefined,error=>console.error('Bird release sky failed to load',error));
let encounter;
const habitatControls=new HabitatControls(canvas,()=>currentInside&&!encounter?.locked&&!encounter?.isOpen&&!encounter?.productArchive.isOpen);
encounter=new BirdEncounter({canvas,interior,camera:insideCamera,controls:habitatControls,isInside:()=>currentInside,sky:releaseSky,toolTray});

const targets={type:THREE.HalfFloatType,depthBuffer:true};
const outsideTarget=new THREE.WebGLRenderTarget(1,1,targets);
const insideTarget=new THREE.WebGLRenderTarget(1,1,targets);
const compositeScene=new THREE.Scene(),compositeCamera=new THREE.Camera();
const compositeMaterial=new THREE.ShaderMaterial({
 depthTest:false,depthWrite:false,
 uniforms:{uOutside:{value:outsideTarget.texture},uInside:{value:insideTarget.texture},uBlend:{value:0}},
 vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
 fragmentShader:`varying vec2 vUv;uniform sampler2D uOutside,uInside;uniform float uBlend;
 void main(){gl_FragColor=vec4(mix(texture2D(uOutside,vUv).rgb,texture2D(uInside,vUv).rgb,uBlend),1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`
});
compositeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),compositeMaterial));

function refreshEntry(){
 $('environment-status').textContent=portal.ready?(habitatReady?'超市全景与 SPACE LINES 已准备好。':'超市全景已加载，正在准备 SPACE LINES…'):'正在加载超市全景…';
}
function fail(message,error){
 $('gl-fallback').hidden=false;$('gl-fallback').textContent=message;
 $('loading').hidden=true;console.error(message,error);
}
refreshEntry();
portal.readyPromise.then(()=>{
 refreshEntry();$('loading').classList.add('hidden');setTimeout(()=>$('loading')?.remove(),650);
}).catch(error=>fail('超市全景加载失败，请刷新页面重试。',error));

new GLTFLoader().load(allScansURL,async gltf=>{
 try{
  const scan=gltf.scene;scan.rotation.y=-Math.PI/2;scan.userData.habitatScan=true;
  scan.traverse(object=>{
   if(!object.isMesh)return;
   object.userData.scanMeshIndex=gltf.parser.associations.get(object)?.meshes;
   const source=Array.isArray(object.material)?object.material:[object.material];
   const mapped=source.map(material=>{
    const result=new THREE.MeshBasicMaterial({map:material.map,side:THREE.DoubleSide});
    if(result.map)result.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    return result;
   });
   object.material=Array.isArray(object.material)?mapped:mapped[0];
  });
  spaceView=await ScanSpaceView.create(scan);
  interior.add(spaceView.group,spaceView.floor,spaceView.lines);
  spaceView.setVisible(true);interior.background=spaceView.background;interior.fog=spaceView.fog;
  const bounds=new THREE.Box3().setFromObject(scan);
  habitatControls.setWalkBounds({left:bounds.min.x+.15,right:bounds.max.x-.15,front:bounds.min.z+.15,back:bounds.max.z-.15});
  habitatReady=true;refreshEntry();
 }catch(error){fail('SPACE LINES 加载失败，请刷新页面重试。',error)}
},undefined,error=>fail('超市扫描加载失败，请刷新页面重试。',error));

function setDesired(next){desired=clamp(next,0,1)}
function setObservationZoom(value){
 zoomLevel=clamp(value,1,2);
 $('zoom-button').setAttribute('aria-pressed',String(zoomLevel>1.01));
 $('zoom-button').textContent=`ZOOM ${Number(zoomLevel.toFixed(1))}x`;
}
window.addEventListener('wheel',event=>{
 event.preventDefault();
 if(currentInside&&(encounter.locked||encounter.isOpen))return;
 const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?innerHeight:1);
 if(currentInside){setObservationZoom(zoomLevel-delta*.002);return;}
 if(portal.state.dragging)return;
 setDesired(desired+delta/1850);
},{passive:false});
window.addEventListener('keydown',event=>{
 if(event.key==='Escape'){
  if(encounter.productArchive.isOpen){encounter.productArchive.hide();return;}
  if(encounter.isOpen){encounter.close();return;}
  if(encounter.locked){encounter.unlock();return;}
  habitatControls.stop();setDesired(0);return;
 }
 if(currentInside||portal.state.dragging)return;
 if(event.target instanceof Element&&event.target.closest('button,a,input,textarea,select'))return;
 if(event.key==='ArrowDown'||event.key==='PageDown'||event.key===' '){event.preventDefault();setDesired(desired+.10)}
 if(event.key==='ArrowUp'||event.key==='PageUp'){event.preventDefault();setDesired(desired-.10)}
});
$('zoom-button').addEventListener('click',()=>{if(!encounter.locked)setObservationZoom(zoomLevel>1.01?1:2)});
$('exit-button').addEventListener('click',()=>{
 if(encounter.productArchive.isOpen){encounter.productArchive.hide();return;}
 encounter.exit();habitatControls.stop();setDesired(0);
});
let touchStart=null;
canvas.addEventListener('touchstart',event=>{
 if(!currentInside&&event.touches.length===1){const touch=event.touches[0];touchStart=portal.hitsSphere(touch.clientX,touch.clientY)?null:touch.clientY}
},{passive:true});
canvas.addEventListener('touchmove',event=>{
 if(!currentInside&&touchStart!==null&&event.touches.length===1){const y=event.touches[0].clientY;setDesired(desired+(touchStart-y)*.00145);touchStart=y}
},{passive:true});
canvas.addEventListener('touchend',()=>{touchStart=null},{passive:true});
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();fail('WebGL 连接中断，请刷新页面。',new Error('WebGL context lost'))});
function resize(){
 const width=Math.max(1,innerWidth),height=Math.max(1,innerHeight);
 renderer.setSize(width,height,false);
 const size=renderer.getDrawingBufferSize(new THREE.Vector2());
 outsideTarget.setSize(size.x,size.y);insideTarget.setSize(size.x,size.y);
 portal.resize(width,height,size.x,size.y);
 insideCamera.aspect=width/height;insideCamera.updateProjectionMatrix();
}
window.addEventListener('resize',resize);resize();
const clock=new THREE.Clock();
function update(){
 requestAnimationFrame(update);
 const dt=Math.min(clock.getDelta(),.07);
 const readyDesired=portal.ready?(habitatReady?desired:Math.min(desired,.68)):0;
 progress+=(readyDesired-progress)*(1-Math.exp(-dt*5.6));
 if(Math.abs(progress-readyDesired)<.0003)progress=readyDesired;
 const p=progress,blend=smooth(.69,.77,p);
 portal.update(p,dt);
 renderer.toneMappingExposure=mix(environmentConfig.exposure,1.18,blend);
 releaseSky.backgroundRotation.copy(portal.scene.environmentRotation);
 const inside=blend>.975;
 if(inside!==currentInside){
  currentInside=inside;toolTray.setInside(inside);
  if(inside){habitatControls.reset();setObservationZoom(1);canvas.style.cursor='default';}
  else{encounter.exit();habitatControls.stop();}
  app.classList.toggle('mode-inside',inside);app.classList.toggle('mode-outside',!inside);
  $('inside-ui').setAttribute('aria-hidden',String(!inside));$('inside-ui').inert=!inside;
 }
 const guideOpacity=1-smooth(.4,.7,p);
 $('scroll-indicator').style.opacity=String(guideOpacity);
 $('portal-vignette').style.opacity=String(1-blend);
 document.querySelector('.vignette').style.opacity=String(blend);
 encounter.update();spaceView?.update(renderer);
 if(currentInside&&!encounter.locked&&!encounter.isOpen)habitatControls.update(dt,insideCamera);
 const observationFov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(67)/2)/zoomLevel));
 if(!encounter.locked&&!encounter.isOpen)insideCamera.fov=mix(insideCamera.fov,observationFov,1-Math.exp(-dt*7));
 insideCamera.updateProjectionMatrix();
 if(currentInside&&encounter.isOpen){encounter.render(renderer,dt);return;}
 if(blend===0)portal.render(null,p);
 else if(blend===1){renderer.setRenderTarget(null);renderer.render(interior,insideCamera)}
 else{
  portal.render(outsideTarget,p);renderer.setRenderTarget(insideTarget);renderer.render(interior,insideCamera);
  compositeMaterial.uniforms.uBlend.value=blend;
  renderer.setRenderTarget(null);renderer.render(compositeScene,compositeCamera);
 }
}
$('inside-ui').inert=true;update();
