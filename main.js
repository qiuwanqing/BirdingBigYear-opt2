import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import sourcePhoto from './assets/supermarket.jpg?url';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import aisleURL from './assets/scanned-aisle.glb?url';
import skyURL from './assets/sky-panorama.png?url';
import { VideoHistory, HISTORY } from './VideoHistory.js';
import { VolumePass } from './VolumePass.js';
import { HabitatControls } from './HabitatControls.js';
import { BirdEncounter } from './BirdEncounter.js';
import { HabitatToolTray } from './HabitatToolTray.js';

const $ = id => document.getElementById(id);
const app = $('app');
const canvas = $('webgl');
const toolTray=new HabitatToolTray();
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
} catch (error) {
  $('loading').hidden = true;
  $('gl-fallback').hidden = false;
  throw error;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;

const exterior = new THREE.Scene();
const exteriorCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
exteriorCamera.position.set(0, 0, 12.9);
const interior = new THREE.Scene();
const insideCamera = new THREE.PerspectiveCamera(67, 1, .1, 150);
insideCamera.position.set(0, 1.5, 4.6);
const target = new THREE.Vector3(0, 1.7, -12);
insideCamera.lookAt(target);
const volume = new THREE.Group();
const volumeScene = new THREE.Scene();
volumeScene.add(volume);
const volumePass = new VolumePass();

// Photographed 360° sky, stored locally so visitors do not depend on a third-party CDN.
exterior.background=new THREE.Color('#d6e6ef');
new THREE.TextureLoader().load(skyURL,texture=>{
 texture.colorSpace=THREE.SRGBColorSpace;
 texture.mapping=THREE.EquirectangularReflectionMapping;
 exterior.background=texture;
 uniforms.uSky.value=texture;
 uniforms.uGlass.value=.7;
 // The cube steers this equirectangular panorama with the same drag angles.
 exterior.backgroundRotation.set(-.12,1.8,0);
 exterior.backgroundIntensity=1;
},undefined,error=>{
 console.error('Sky panorama failed to load',error);
 $('gl-fallback').hidden=false;
 $('gl-fallback').textContent='天空贴图加载失败，请刷新页面重试。';
});

// Actual 3D rounded cuboid with the user's supermarket photograph mapped by a custom GLSL shader.
const dims = new THREE.Vector3(5.8, 3.15, 5.8);
const geometry = new RoundedBoxGeometry(dims.x, dims.y, dims.z, 16, .68);
const uniforms = {
  uImage: { value: null },
  uTime: { value: 0 },
  uVideo: { value: null },
  uHistory: { value: null },
  uUseVideo: { value: 0 },
  uVideoAspect: { value: 16/9 },
  uPhotoAspect: { value: 1 },
  uHistoryHead: { value: 0 },
  uHistoryCount: { value: 0 },
  uHistoryLayout: { value: new THREE.Vector2(HISTORY.columns, HISTORY.rows) },
  uHistoryTile: { value: new THREE.Vector2(HISTORY.tileWidth, HISTORY.tileHeight) },
  uHistoryLength: { value: HISTORY.columns * HISTORY.rows },
  uSoft: { value: .88 },
  uDepth: { value: dims },
  uApproach: { value: 0 },
  uBlackout: { value: 0 },
  uEye: { value: new THREE.Vector3() },
  uOpacity: { value: 1 },
  uSky: { value: null },
  uSkyRotation: { value: new THREE.Matrix3() },
  uGlass: { value: 0 }
};
const vertexShader = `
 uniform float uTime, uApproach;
 varying vec3 vP; varying vec3 vNormal; varying vec3 vWorld; varying vec3 vWorldNormal;
 void main(){
  vP=position;vNormal=normalize(normal);
  vec4 wp=modelMatrix*vec4(position,1.);
  vWorld=wp.xyz;
  vWorldNormal=normalize(mat3(modelMatrix)*normal);
  gl_Position=projectionMatrix*viewMatrix*wp;
 }`;
const fragmentShader = `
  precision highp float;
  uniform sampler2D uImage, uVideo, uHistory, uSky;
  uniform mat3 uSkyRotation;
  uniform float uGlass;
  uniform float uTime, uSoft, uOpacity, uUseVideo, uHistoryHead, uHistoryCount, uVideoAspect, uPhotoAspect;
  uniform vec3 uDepth, uEye;
  uniform vec2 uHistoryLayout, uHistoryTile;
  uniform float uHistoryLength;
  uniform float uBlackout;
  varying vec3 vP, vNormal, vWorld, vWorldNormal;

  vec3 glassEnvironment(vec3 worldDirection){
    vec3 direction=normalize(uSkyRotation*worldDirection);
    vec2 envUV=vec2(atan(direction.z,direction.x)*.159154943+.5,asin(clamp(direction.y,-1.,1.))*.318309886+.5);
    return sRGBTransferEOTF(texture2D(uSky,envUV)).rgb;
  }
  vec2 coverUV(vec2 uv,float sourceAspect) {
    float faceAspect=uDepth.x/uDepth.y;
    vec2 fit=vec2(min(1.,faceAspect/sourceAspect),min(1.,sourceAspect/faceAspect));
    return .5+(uv-.5)*fit;
  }
  // One affine camera move for the entire photo, never local waves or mesh warping.
  // Evaluating the same move at an earlier time gives a coherent preview of depth.
  vec3 photoFrame(vec2 uv, float time) {
    float zoom=1.24+.045*sin(time*.43);
    vec2 pan=vec2(.082*sin(time*.56),.026*sin(time*.37));
    vec2 sampleUV=(coverUV(uv,uPhotoAspect)-.5)/zoom+.5+pan;
    return texture2D(uImage,clamp(sampleUV,.004,.996)).rgb;
  }
  vec3 historyFrame(vec2 uv, float age) {
    float index=mod(uHistoryHead-age+uHistoryLength,uHistoryLength);
    vec2 cell=vec2(mod(index,uHistoryLayout.x),floor(index/uHistoryLayout.x));
    // Half-texel inset prevents filtering from leaking across atlas cells.
    vec2 pixelUV=clamp(uv,.5/uHistoryTile,1.-.5/uHistoryTile);
    return texture2D(uHistory,(cell+pixelUV)/uHistoryLayout).rgb;
  }
  vec3 frameAtDepth(vec2 uv,float depth) {
    if(uUseVideo<.5) return photoFrame(uv,uTime-depth*3.9);
    uv=coverUV(uv,uVideoAspect);
    // Three.js stores native video in sRGB; the history render target is linear.
    vec3 live=sRGBTransferEOTF(texture2D(uVideo,clamp(uv,.002,.998))).rgb;
    float age=depth*uHistoryLength;
    if(age<1.) return mix(live,historyFrame(uv,0.),age);
    age=min(age-1.,max(0.,uHistoryCount-1.));
    float older=min(floor(age)+1.,max(0.,uHistoryCount-1.));
    return mix(historyFrame(uv,floor(age)),historyFrame(uv,older),fract(age));
  }
  void main() {
    // Space-time volume: X/Y locate an image pixel, Z selects when it was seen.
    // The flat front is always the newest frame; side/top show its actual history.
    vec2 uv=vP.xy/uDepth.xy+.5;
    float depth=clamp(.5-vP.z/uDepth.z,0.,1.);
    vec3 n=normalize(vNormal);
    float side=1.-abs(n.z);
    float facing=abs(dot(normalize(vWorldNormal),normalize(uEye-vWorld)));
    vec2 frontEdge=abs(vP.xy)/(uDepth.xy*.5);
    float perimeter=smoothstep(.50,.98,max(frontEdge.x,frontEdge.y));
    // Keep the image core crisp, then widen both the optical and time exposure
    // through the rounded perimeter and along the volume's history.
    float softness=clamp(perimeter*.65+side*.40+depth*.50,0.,1.);
    float radius=mix(.0005,.021,softness*softness)*uSoft;
    float exposure=(.002+.026*side+.026*depth)*softness;
    vec3 col=frameAtDepth(uv,depth);
    if(softness>.02){
      col*=.28;
      for(int i=0;i<6;i++){
        float angle=float(i)*2.399963;
        vec2 direction=vec2(cos(angle),sin(angle));
        vec2 offset=direction*sqrt((float(i)+1.)/6.)*radius;
        col+=frameAtDepth(uv+offset,clamp(depth+direction.x*exposure,0.,1.))*.12;
      }
    }
    col*=1.-side*.035;
    // A restrained clear dielectric finish over the time-volume imagery.
    // Reflection and refraction use the same panorama orientation as the sky.
    if(uGlass>0.){
      vec3 normal=normalize(vWorldNormal);
      vec3 view=normalize(uEye-vWorld);
      float grazing=1.-facing;
      float fresnel=.04+.96*pow(grazing,5.);
      vec3 reflected=glassEnvironment(reflect(-view,normal));
      vec3 transmitted=glassEnvironment(refract(-view,normal,1./1.45));
      col=mix(col,transmitted,(.035+.13*grazing*grazing)*uGlass);
      col=mix(col,reflected,(.04+.38*fresnel)*uGlass);
      col+=reflected*pow(grazing,3.)*.08*uGlass;
    }
    // Absorb the image as the camera approaches, while retaining an opaque volume.
    // At full blackout even the last bright video details disappear before entry.
    float light=1.-uBlackout;
    vec3 rimShade=vec3(.004,.008,.012)*pow(clamp(1.-facing,0.,1.),2.);
    col=col*pow(light,2.2)+rimShade*uBlackout*light;
    gl_FragColor=vec4(col,uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
const bodyMaterial = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true, side: THREE.FrontSide, depthWrite: true });
const volumeMesh = new THREE.Mesh(geometry, bodyMaterial);
volume.add(volumeMesh);

// Linear HDR scene targets keep the blend continuous, with tone mapping applied once.
const targetOptions={type:THREE.HalfFloatType, depthBuffer:true};
const outsideTarget=new THREE.WebGLRenderTarget(1,1,targetOptions);
const insideTarget=new THREE.WebGLRenderTarget(1,1,targetOptions);
const compositeScene=new THREE.Scene();
const compositeCamera=new THREE.Camera();
const compositeMaterial=new THREE.ShaderMaterial({
 depthTest:false,depthWrite:false,
 uniforms:{uOutside:{value:outsideTarget.texture},uInside:{value:insideTarget.texture},uBlend:{value:0},uStretch:{value:0}},
 vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
 fragmentShader:`varying vec2 vUv;uniform sampler2D uOutside,uInside;uniform float uBlend,uStretch;
 void main(){
   vec2 delta=vUv-.5;
   vec3 outside=vec3(0.);
   for(int i=0;i<6;i++){
     float trail=float(i)/5.;
     outside+=texture2D(uOutside,clamp(.5+delta*(1.-trail*uStretch),.001,.999)).rgb/6.;
   }
   vec3 inside=texture2D(uInside,vUv).rgb;
   gl_FragColor=vec4(mix(outside,inside,uBlend),1.);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
 }`
});
compositeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),compositeMaterial));

function box(parent,w,h,d,color,x,y,z,material=null){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material||new THREE.MeshStandardMaterial({color,roughness:.85}));
 mesh.position.set(x,y,z);parent.add(mesh);return mesh;
}
// Real scanned merchandise, with a clean architectural shell around missing areas.
interior.background=new THREE.Color('#8b8c80');
interior.add(new THREE.HemisphereLight(0xfff9e9,0x5a6055,1.35));
const keylight=new THREE.DirectionalLight(0xfff7e6,1.1);
keylight.position.set(1,5,3);interior.add(keylight);
const tileCanvas=document.createElement('canvas');tileCanvas.width=tileCanvas.height=256;
const tileContext=tileCanvas.getContext('2d');
tileContext.fillStyle='#aaa99e';tileContext.fillRect(0,0,256,256);
tileContext.strokeStyle='#8f9189';tileContext.lineWidth=2;tileContext.strokeRect(0,0,256,256);
const tileMap=new THREE.CanvasTexture(tileCanvas);tileMap.colorSpace=THREE.SRGBColorSpace;
tileMap.wrapS=tileMap.wrapT=THREE.RepeatWrapping;tileMap.repeat.set(14,18);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(5.8,9),new THREE.MeshStandardMaterial({map:tileMap,roughness:.68}));
floor.rotation.x=-Math.PI/2;floor.position.set(0,.275,1.1);interior.add(floor);
box(interior,5.8,.16,9,'#deddd3',0,2.03,1.1);
box(interior,5.8,2.0,.15,'#93968a',0,1.25,-3.02);
// Complete the reverse view, which is now reachable by turning around.
box(interior,5.8,2.0,.15,'#b5b6aa',0,1.25,5.55);
box(interior,1.25,1.82,.08,'#525f59',0,1.2,5.43);
box(interior,.08,.28,.06,'#b6bbb2',.44,1.12,5.36);
box(interior,.15,2.0,9,'#bbbcb0',-2.95,1.25,1.1);
box(interior,.15,2.0,9,'#bbbcb0',2.95,1.25,1.1);
// Neutral backing panels conceal torn shelf backs without replacing scanned goods.
for(const x of [-2.85,2.85])box(interior,.12,1.9,8,'#77796d',x,1.23,1);
for(const x of [-1.95,1.95])box(interior,1.8,.12,8,'#77796d',x,1.98,1);
for(let k=0;k<3;k++){
 const z=3-k*2.35;
 for(const x of [-1.15,1.15]){
  box(interior,.18,.045,1.65,'#e8e8dd',x,1.94,z,new THREE.MeshBasicMaterial({color:'#fff8de'}));
 }
 const light=new THREE.PointLight(0xfff8e8,4,5,2);light.position.set(0,1.88,z);interior.add(light);
}
let habitatReady=false;
new GLTFLoader().load(aisleURL,gltf=>{
 const scan=gltf.scene;
 // Blender source +X is the aisle entrance; align it to the observer's +Z.
 scan.rotation.y=-Math.PI/2;
 scan.traverse(obj=>{
  if(!obj.isMesh)return;
  // The scan already contains photographed lighting. Avoid lighting it twice.
  obj.material=new THREE.MeshBasicMaterial({map:obj.material.map,side:THREE.DoubleSide});
  if(obj.material.map)obj.material.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
 });
 scan.userData.habitatScan=true;interior.add(scan);habitatReady=true;
 $('skip-button').disabled=false;
},undefined,error=>{
 console.error('Scanned aisle failed to load',error);
 $('skip-button').disabled=true;
 $('skip-button').textContent='HABITAT UNAVAILABLE';
});
$('skip-button').disabled=true;

// Photo fallback for the exterior volume only.
// Drop a local supermarket.mp4 or supermarket.webm into assets to use real motion.
// The photo fallback uses the same current-frame / delayed-depth relationship.
const videoSources=import.meta.glob('./assets/supermarket.{mp4,webm}', { eager:true, query:'?url', import:'default' });
const videoURL=videoSources['./assets/supermarket.mp4'] || videoSources['./assets/supermarket.webm'];
let videoHistory=null;
const loader=new THREE.TextureLoader();
loader.load(sourcePhoto,(texture)=>{
 texture.colorSpace=THREE.SRGBColorSpace;
 texture.anisotropy=renderer.capabilities.getMaxAnisotropy();
 uniforms.uImage.value=texture;
 uniforms.uPhotoAspect.value=texture.image.width/texture.image.height;
 uniforms.uVideo.value=texture;
 uniforms.uHistory.value=texture;
 if(videoURL)videoHistory=new VideoHistory(renderer,videoURL,uniforms);
 $('loading').classList.add('hidden');
 setTimeout(()=>$('loading').remove(),650);
},undefined,err=>{
 $('loading').remove();$('gl-fallback').hidden=false;
 $('gl-fallback').textContent='超市照片加载失败。请确认 assets/supermarket.jpg 存在，并从 npm run dev 启动。';
 console.error(err);
});

const clamp=THREE.MathUtils.clamp;
const mix=THREE.MathUtils.lerp;
const smooth=(edge0,edge1,x)=>{let t=clamp((x-edge0)/(edge1-edge0),0,1);return t*t*(3-2*t)};
let progress=0;
let desired=0;
let paused=false;
let pointerX=0,pointerY=0,dragX=0,dragY=0;
let isDragging=false,lastX=0,lastY=0;
let currentInside=false;
let zoomLevel=1;
let encounter;
const habitatControls=new HabitatControls(canvas,()=>currentInside&&!encounter?.locked&&!encounter?.isOpen);
encounter=new BirdEncounter({canvas,interior,camera:insideCamera,controls:habitatControls,isInside:()=>currentInside,sky:exterior,toolTray});
function setObservationZoom(value){
 zoomLevel=clamp(value,1,2);
 $('zoom-button').setAttribute('aria-pressed',String(zoomLevel>1.01));
 $('zoom-button').textContent=`ZOOM ${Number(zoomLevel.toFixed(1))}×`;
}
let hovered=false, pointerOnCanvas=false;
let pointerClientX=0, pointerClientY=0;
let photoElapsed=0, glowStrength=0, skyFlowTime=0;
const hoverRay=new THREE.Raycaster();
const hoverPointer=new THREE.Vector2();
function hitVolume(x,y){
 const rect=canvas.getBoundingClientRect();
 hoverPointer.set((x-rect.left)/rect.width*2-1,1-(y-rect.top)/rect.height*2);
 exteriorCamera.updateMatrixWorld(true);
 volume.updateMatrixWorld(true);
 hoverRay.setFromCamera(hoverPointer,exteriorCamera);
 return hoverRay.intersectObject(volumeMesh,false).length>0;
}
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if(reducedMotion)paused=true;

function setDesired(next){desired=clamp(next,0,1)}
window.addEventListener('wheel',e=>{
  e.preventDefault();
  if(currentInside&&(encounter.locked||encounter.isOpen))return;
  if(currentInside){setObservationZoom(zoomLevel-e.deltaY*.002);return;}
  if(isDragging)return;
  const magnitude=clamp(e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?innerHeight:1),-140,140);
  setDesired(desired+magnitude*.00078);
},{passive:false});
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
   if(!document.getElementById('capture-card').hidden){encounter.closeRecord();return;}
   if(encounter.isOpen){encounter.close();return;}
   if(encounter.locked){encounter.unlock();return;}
   habitatControls.stop();setDesired(0);return;
  }
  if(currentInside||isDragging)return;
  if(e.target instanceof Element && e.target.closest('button,a,input,textarea,select'))return;
  if(e.key==='ArrowDown'||e.key==='PageDown'||e.key===' '){e.preventDefault();setDesired(desired+.09)}
  if(e.key==='ArrowUp'||e.key==='PageUp'){e.preventDefault();setDesired(desired-.09)}
});
$('zoom-button').addEventListener('click',()=>{if(!encounter.locked)setObservationZoom(zoomLevel>1.01?1:2)});
$('skip-button').addEventListener('click',()=>{if(habitatReady)setDesired(1)});
$('exit-button').addEventListener('click',()=>{encounter.exit();habitatControls.stop();setDesired(0)});
canvas.addEventListener('pointerenter',e=>{pointerOnCanvas=e.pointerType!=='touch';pointerClientX=e.clientX;pointerClientY=e.clientY});
canvas.addEventListener('pointerleave',()=>{pointerOnCanvas=false;videoHistory?.setActive(false)});
canvas.addEventListener('pointerdown',e=>{if(currentInside||e.button!==0)return;if(!hitVolume(e.clientX,e.clientY))return;isDragging=true;videoHistory?.setActive(false);lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener('pointerup',()=>{isDragging=false});
canvas.addEventListener('pointercancel',()=>{isDragging=false;pointerOnCanvas=false});
canvas.addEventListener('lostpointercapture',()=>{isDragging=false});
window.addEventListener('blur',()=>{isDragging=false;pointerOnCanvas=false;videoHistory?.setActive(false)});
window.addEventListener('pointermove',e=>{
 if(currentInside)return;
 pointerOnCanvas=e.target===canvas&&e.pointerType!=='touch';
 pointerClientX=e.clientX;pointerClientY=e.clientY;
 if(!pointerOnCanvas||isDragging||!hitVolume(e.clientX,e.clientY))videoHistory?.setActive(false);
 pointerX=e.clientX/innerWidth-.5;
 pointerY=e.clientY/innerHeight-.5;
 if(isDragging&&progress<.83){dragX+=(e.clientX-lastX)*.006;dragY=clamp(dragY+(e.clientY-lastY)*.004,-1.1,1.1)}
 lastX=e.clientX;lastY=e.clientY;
});
let touchStart=null;
window.addEventListener('touchstart',e=>{if(!currentInside&&e.touches.length===1){const t=e.touches[0];touchStart=hitVolume(t.clientX,t.clientY)?null:t.clientY}},{passive:true});
window.addEventListener('touchmove',e=>{
 if(!currentInside&&touchStart!==null&&e.touches.length===1){const y=e.touches[0].clientY;setDesired(desired+(touchStart-y)*.00145);touchStart=y}
},{passive:true});
window.addEventListener('touchend',()=>{touchStart=null},{passive:true});
function resize(){
 const w=Math.max(1,innerWidth),h=Math.max(1,innerHeight);
 renderer.setSize(w,h,false);
 const size=renderer.getDrawingBufferSize(new THREE.Vector2());
 outsideTarget.setSize(size.x,size.y);insideTarget.setSize(size.x,size.y);
 volumePass.setSize(size.x,size.y);
 exteriorCamera.aspect=insideCamera.aspect=w/h;
 exteriorCamera.updateProjectionMatrix();
 insideCamera.updateProjectionMatrix();
}
window.addEventListener('resize',resize);resize();
const skyRotationMatrix=new THREE.Matrix4();
const clock=new THREE.Clock();
let elapsed=0;
function update(){
 requestAnimationFrame(update);
 const frameDt=clock.getDelta();
 const dt=Math.min(frameDt,.06);
 const easing=reducedMotion?12:3.6;
 const readyDesired=habitatReady?desired:Math.min(desired,.86);
 progress+=(readyDesired-progress)*(1-Math.exp(-dt*easing));
 if(Math.abs(progress-readyDesired)<.0003)progress=readyDesired;
 elapsed+=paused?0:dt;
 const p=progress;
 const approach=smooth(.07,.91,p);
 uniforms.uApproach.value=approach;
 uniforms.uBlackout.value=smooth(.22,.78,p);
 uniforms.uOpacity.value=1;
 // Approach the front surface through camera travel; keep the volume's physical size.
 const swallow=smooth(.83,1.,p);
 volume.scale.setScalar(.92);
 volume.position.x=0;
 volume.position.y=.14+Math.sin(elapsed*.52)*.055*(1-approach);
 const settle=1.-smooth(.25,.87,p);
 volume.rotation.x=(.17+dragY)*settle;
 volume.rotation.y=(-.86+dragX)*settle;
 volume.rotation.z=0;
 // Keep the panorama oriented after release; approach still controls only entry.
 exterior.backgroundRotation.set(-.12+dragY,1.8+dragX,0,'YXZ');
 skyRotationMatrix.makeRotationFromEuler(exterior.backgroundRotation).invert();
 uniforms.uSkyRotation.value.setFromMatrix4(skyRotationMatrix);
 const framing=innerWidth/innerHeight<1?1.35:1.;
 exteriorCamera.position.set(0,0,mix(24.0*framing,5.4,approach)-2.4*swallow);
 exteriorCamera.fov=40+swallow*12;
 exteriorCamera.updateProjectionMatrix();
 exteriorCamera.lookAt(0,.14,0);
 uniforms.uEye.value.copy(exteriorCamera.position);
 hovered=pointerOnCanvas&&!isDragging&&p<.985&&hitVolume(pointerClientX,pointerClientY);
 if(!currentInside)canvas.style.cursor=isDragging?'grabbing':hovered?'grab':'default';
 if(hovered&&!paused)photoElapsed+=dt;
 uniforms.uTime.value=photoElapsed;
 videoHistory?.update(elapsed,paused||!hovered||isDragging||p>=.985);
 // Start while the volume is still medium sized, leaving sky visible for the lens.
 const skyPull=reducedMotion||isDragging?0:smooth(.12,.48,p);
 if(skyPull>.001&&p<.985)skyFlowTime+=Math.min(frameDt,.25);
 if(p===0)skyFlowTime=0;
 const glowTarget=isDragging||p>=.985?0:clamp((hovered ? .40 : 0)+skyPull*.85,0,1);
 glowStrength=isDragging?0:mix(glowStrength,glowTarget,1-Math.exp(-dt*9));
 if(glowStrength<.003)glowStrength=0;
 // Hold a black threshold before revealing the separate 3D store.
 const blend=smooth(.90,.985,p);
 compositeMaterial.uniforms.uBlend.value=blend;
 compositeMaterial.uniforms.uStretch.value=Math.sin(blend*Math.PI)*.16;
 const inside=p>=.985;
 if(inside!==currentInside){
  currentInside=inside;
  toolTray.setInside(inside);
  if(inside){habitatControls.reset();setObservationZoom(1);canvas.style.cursor='default';}
  else {encounter.exit();habitatControls.stop();}
  app.classList.toggle('mode-inside',inside);
  app.classList.toggle('mode-outside',!inside);
  $('inside-ui').setAttribute('aria-hidden',String(!inside));
  $('inside-ui').inert=!inside;
  $('skip-button').inert=inside;
 }
 $('scroll-indicator').style.opacity=String(1-smooth(.05,.5,p));
 // The observer keeps their position and view until they actively walk or drag.
 encounter.update();
 if(currentInside&&!encounter.locked&&!encounter.isOpen)habitatControls.update(dt,insideCamera);
 else if(p<.9){
  insideCamera.position.set(0,1.5,mix(6.2,4.6,smooth(.86,1.,p)));
  insideCamera.rotation.set(0,0,0,'YXZ');
 }
 const observationFov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(67)/2)/zoomLevel));
 if(!encounter.locked&&!encounter.isOpen)insideCamera.fov=mix(insideCamera.fov,observationFov,1-Math.exp(-dt*7));
 insideCamera.updateProjectionMatrix();
 if(currentInside&&encounter.isOpen){encounter.render(renderer,dt);return;}
 if(blend===0){
   volumePass.render(renderer,exterior,volumeScene,exteriorCamera,outsideTarget,skyPull,glowStrength,skyFlowTime);
   renderer.setRenderTarget(null);renderer.render(compositeScene,compositeCamera);
 }
 else if(blend===1){renderer.render(interior,insideCamera)}
 else{
   volumePass.render(renderer,exterior,volumeScene,exteriorCamera,outsideTarget,skyPull,glowStrength,skyFlowTime);
   renderer.setRenderTarget(insideTarget);renderer.render(interior,insideCamera);
   renderer.setRenderTarget(null);renderer.render(compositeScene,compositeCamera);
 }
}
$('inside-ui').inert=true;
update();
