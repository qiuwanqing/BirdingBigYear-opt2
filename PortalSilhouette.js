import * as THREE from 'three';

// Project the actual (including skinned) model, then find the nearest occupied
// pixel. Distances follow its silhouette and handle openings at every angle.
export class PortalSilhouette {
 constructor(renderer){
  this.size=new THREE.Vector2(1,1);
  this.mask=new THREE.WebGLRenderTarget(1,1,{
   depthBuffer:true,samples:Math.min(4,renderer.capabilities.maxSamples)
  });
  const fieldOptions={type:THREE.HalfFloatType,depthBuffer:false,
   minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter};
  this.fields=[new THREE.WebGLRenderTarget(1,1,fieldOptions),new THREE.WebGLRenderTarget(1,1,fieldOptions)];
  this.distance=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false});
  this.maskMaterial=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,toneMapped:false});
  this.screen=new THREE.Scene();this.camera=new THREE.Camera();
  const vertexShader='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
  const options={vertexShader,depthTest:false,depthWrite:false,toneMapped:false};
  this.seedMaterial=new THREE.ShaderMaterial({...options,
   uniforms:{uMask:{value:this.mask.texture}},
   fragmentShader:`varying vec2 vUv;uniform sampler2D uMask;
    void main(){gl_FragColor=vec4(texture2D(uMask,vUv).r>.5?vUv:vec2(-1.),0.,1.);}`
  });
  this.floodMaterial=new THREE.ShaderMaterial({...options,
   uniforms:{uField:{value:null},uSize:{value:this.size},uStep:{value:1},uAspect:{value:1}},
   fragmentShader:`varying vec2 vUv;uniform sampler2D uField;
    uniform vec2 uSize;uniform float uStep,uAspect;
    void main(){
     vec2 nearest=vec2(-1.);float best=1.e6;vec2 aspect=vec2(uAspect,1.);
     for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
      vec2 uv=vUv+vec2(float(x),float(y))*uStep/uSize;
      if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.)continue;
      vec2 seed=texture2D(uField,uv).rg;
      if(seed.x<0.)continue;
      vec2 delta=(vUv-seed)*aspect;float d=dot(delta,delta);
      if(d<best){best=d;nearest=seed;}
     }
     gl_FragColor=vec4(nearest,0.,1.);
    }`
  });
  // Filter scalar distances rather than seed coordinates, so interpolation
  // cannot invent a bright line between the separated handles.
  this.distanceMaterial=new THREE.ShaderMaterial({...options,
   uniforms:{uField:{value:null},uAspect:{value:1}},
   fragmentShader:`varying vec2 vUv;uniform sampler2D uField;uniform float uAspect;
    void main(){vec2 seed=texture2D(uField,vUv).rg;
     float d=seed.x<0.?1.:length((vUv-seed)*vec2(uAspect,1.));
     gl_FragColor=vec4(d,0.,0.,1.);}`
  });
  this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.seedMaterial);this.screen.add(this.quad);
 }
 setSize(width,height){
  // Half resolution is enough for the soft halo; MSAA preserves thin handles.
  this.size.set(Math.max(1,Math.ceil(width/2)),Math.max(1,Math.ceil(height/2)));
  for(const target of [this.mask,...this.fields,this.distance])target.setSize(this.size.x,this.size.y);
 }
 render(renderer,scene,camera,width){
  const previousTarget=renderer.getRenderTarget(),background=scene.background,override=scene.overrideMaterial;
  const clearColor=renderer.getClearColor(new THREE.Color()),clearAlpha=renderer.getClearAlpha();
  try{
   scene.background=null;scene.overrideMaterial=this.maskMaterial;
   renderer.setClearColor(0x000000,0);renderer.setRenderTarget(this.mask);renderer.render(scene,camera);
   this.quad.material=this.seedMaterial;renderer.setRenderTarget(this.fields[0]);renderer.render(this.screen,this.camera);
   const aspect=camera.aspect;this.floodMaterial.uniforms.uAspect.value=aspect;
   this.quad.material=this.floodMaterial;
   // Only the neighborhood covered by the luminous lip and shoulder is needed.
   const radius=Math.max(1,Math.ceil(width*this.size.y*16)+2);
   let current=0;
   for(let step=2**Math.floor(Math.log2(radius));step>=1;step/=2){
    this.floodMaterial.uniforms.uStep.value=step;
    this.floodMaterial.uniforms.uField.value=this.fields[current].texture;
    current=1-current;renderer.setRenderTarget(this.fields[current]);renderer.render(this.screen,this.camera);
   }
   this.distanceMaterial.uniforms.uField.value=this.fields[current].texture;
   this.distanceMaterial.uniforms.uAspect.value=aspect;
   this.quad.material=this.distanceMaterial;
   renderer.setRenderTarget(this.distance);renderer.render(this.screen,this.camera);
  }finally{
   scene.background=background;scene.overrideMaterial=override;
   renderer.setClearColor(clearColor,clearAlpha);renderer.setRenderTarget(previousTarget);
  }
  return {mask:this.mask.texture,distance:this.distance.texture};
 }
}
