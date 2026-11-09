import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import bagURL from './assets/plastic_bag_rigged.glb?url';

// Only the central object: carrier-bag geometry, original glass, and local
// motion. The existing panorama, camera, halo and entry thresholds stay outside.
export async function loadPlasticBag(darkness,edgeSoftness){
 const gltf=await new GLTFLoader().loadAsync(bagURL);
 const object=new THREE.Group();object.name='Floating plastic carrier bag';
 // Keep the supplied mesh and its rig intact; center it inside the same
 // two-unit envelope as the original entrance object.
 gltf.scene.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(gltf.scene,true);
 const size=bounds.getSize(new THREE.Vector3());
 const scale=2/size.y;
 const normalized=new THREE.Group();normalized.scale.setScalar(scale);
 normalized.position.copy(bounds.getCenter(new THREE.Vector3())).multiplyScalar(-scale);
 normalized.add(gltf.scene);object.add(normalized);
 // A three-quarter view shows both handles and the depth of the bag.
 object.rotation.y=Math.PI/3;
 // Negative Z rotation leans the top toward the viewer's right.
 const restTilt=THREE.MathUtils.degToRad(-20);
 object.rotation.z=restTilt;
 gltf.scene.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const material=new THREE.MeshPhysicalMaterial({
   // Same physical settings as the original sphere, on the new bag geometry.
   metalness:0,color:0xffffff,transparent:true,depthWrite:false,roughness:.005,
   transmission:1,thickness:2,ior:1.9,
   attenuationColor:new THREE.Color('#f4fff9'),attenuationDistance:10,
   dispersion:.04,envMapIntensity:1.8,specularIntensity:1,
   clearcoat:.65,clearcoatRoughness:.005
  });
  // Preserve the portal's existing darkening/feathering behavior on the new film.
  material.onBeforeCompile=shader=>{
   shader.uniforms.uPortalDarkness=darkness;shader.uniforms.uPortalEdgeSoftness=edgeSoftness;
   shader.fragmentShader='uniform float uPortalDarkness;\nuniform float uPortalEdgeSoftness;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
    outgoingLight*=1.0-uPortalDarkness;
    #include <opaque_fragment>
    float portalFacing=abs(dot(normalize(normal),normalize(vViewPosition)));
    float portalFeather=smoothstep(0.0,max(uPortalEdgeSoftness,0.001),portalFacing);
    gl_FragColor.a=mix(1.0,portalFeather,uPortalDarkness);`);
  };
  material.customProgramCacheKey=()=> 'glass-bag-portal-darkening-v1';
  mesh.material=material;
 });
 let time=0;
 return {object,update(dt,progress,reducedMotion){
  if(reducedMotion)return;
  time+=dt;
  const amount=1-THREE.MathUtils.smoothstep(progress,.35,.70);
  object.position.y=Math.sin(time*.72)*.025*amount;
  object.rotation.z=restTilt+Math.sin(time*.53)*.025*amount;
  object.rotation.x=Math.sin(time*.63+.4)*.012*amount;
 }};
}
