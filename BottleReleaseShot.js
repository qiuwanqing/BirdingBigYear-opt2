import * as THREE from 'three';

// Keep this framing stable when preparing the video. The exported square PNG
// contains the bottle only, with alpha, and is the reference for the first frame.
export const BOTTLE_RELEASE_SHOT=Object.freeze({
 id:'bottle-release-v2-closeup',width:1080,height:1080,fov:38,
 position:[.015,-.12,.68],target:[.015,-.12,.14],pivotRotation:[0,0,0],
 exposure:1.18,transitionSeconds:.95
});
export function makeBottleShotCamera(){
 const shot=BOTTLE_RELEASE_SHOT,camera=new THREE.PerspectiveCamera(shot.fov,shot.width/shot.height,.01,30);
 camera.position.fromArray(shot.position);camera.lookAt(new THREE.Vector3().fromArray(shot.target));camera.updateMatrixWorld(true);
 return camera;
}
// A per-click framing, aimed at the actual point chosen on the cylindrical label.
export function makeBottlePointCamera(point,center,currentCamera){
 const outward=new THREE.Vector3(point.x-center.x,0,point.z-center.z);
 if(outward.lengthSq()<.000001)outward.copy(currentCamera.position).sub(point).setY(0);
 if(outward.lengthSq()<.000001)outward.set(0,0,1);
 outward.normalize();
 const camera=currentCamera.clone();camera.fov=BOTTLE_RELEASE_SHOT.fov;
 camera.position.copy(point).addScaledVector(outward,.54);camera.lookAt(point);
 camera.updateProjectionMatrix();camera.updateMatrixWorld(true);return camera;
}
export async function renderBottleShotPNG(scene,options={}){
 const shot={...BOTTLE_RELEASE_SHOT,...options};
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
 const background=scene.background;
 try{
  renderer.setPixelRatio(1);renderer.setSize(shot.width,shot.height,false);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=shot.exposure;renderer.setClearColor(0x000000,0);
  const camera=options.camera?.clone()??makeBottleShotCamera();
  camera.aspect=shot.width/shot.height;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  scene.background=null;renderer.render(scene,camera);
  return await new Promise((resolve,reject)=>renderer.domElement.toBlob(blob=>blob?resolve(blob):reject(new Error('透明首帧导出失败，请重试。')),'image/png'));
 }finally{scene.background=background;renderer.dispose();renderer.forceContextLoss();}
}
