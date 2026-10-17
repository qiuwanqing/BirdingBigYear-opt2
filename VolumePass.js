import * as THREE from 'three';

// Isolate the volume from the sky so blur softens its silhouette, not the page.
export class VolumePass {
  constructor() {
    const options = { type: THREE.HalfFloatType, depthBuffer: false };
    this.sky = new THREE.WebGLRenderTarget(1, 1, options);
    this.sharp = new THREE.WebGLRenderTarget(1, 1, { ...options, depthBuffer: true, samples: 4 });
    this.horizontal = new THREE.WebGLRenderTarget(1, 1, options);
    this.blurred = new THREE.WebGLRenderTarget(1, 1, options);
    this.haloHorizontal = new THREE.WebGLRenderTarget(1, 1, options);
    this.haloSoft = new THREE.WebGLRenderTarget(1, 1, options);
    this.camera = new THREE.Camera();
    this.skyCamera = new THREE.PerspectiveCamera();
    this.projectedCorner = new THREE.Vector3();
    this.minimum = new THREE.Vector2();
    this.maximum = new THREE.Vector2();
    this.scene = new THREE.Scene();
    const vertexShader = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
    this.skyMaterial = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false, toneMapped: false,
      vertexShader,
      uniforms: {
        uSky: { value: this.sky.texture },
        uVolumeMask: { value: this.sharp.texture },
        uSoftMask: { value: this.blurred.texture },
        uWideMask: { value: this.haloSoft.texture },
        uCenter: { value: new THREE.Vector2(.5, .5) },
        uHalfSize: { value: new THREE.Vector2(.25, .2) },
        uAspect: { value: 1 }, uCrop: { value: 1 }, uPull: { value: 0 }, uGlow: { value: 0 }, uFlowTime: { value: 0 }
      },
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D uSky,uVolumeMask,uSoftMask,uWideMask;
        uniform vec2 uCenter,uHalfSize;
        uniform float uAspect,uCrop,uPull,uGlow,uFlowTime;
        vec3 skyAt(vec2 uv){
          // Overscanned sky keeps the lens from smearing clamped viewport borders.
          return texture2D(uSky,clamp(.5+(uv-.5)*uCrop,.001,.999)).rgb;
        }
        vec3 flowingSky(vec2 uv,vec2 transport){
          // Two staggered advection phases hand over before either resets.
          // This keeps clouds streaming inward without a visible loop jump.
          float phase=fract(uFlowTime*.10);
          float other=fract(phase+.5);
          float weight=smoothstep(0.,1.,1.-abs(phase*2.-1.));
          return mix(skyAt(uv+transport*other),skyAt(uv+transport*phase),weight);
        }
        void main(){
          vec2 aspect=vec2(uAspect,1.);
          vec2 p=(vUv-uCenter)*aspect;
          vec2 halfSize=max(uHalfSize*aspect,vec2(.025));
          float radius=min(halfSize.x,halfSize.y)*.24;
          vec2 core=max(halfSize-vec2(radius),vec2(.001));
          vec2 q=abs(p)-core;
          float distanceToPortal=length(max(q,0.))+min(max(q.x,q.y),0.)-radius;
          float outside=max(distanceToPortal,0.);
          float influence=exp(-outside/(.16+.15*uPull));
          vec2 radial=p/max(length(p),.0001);
          // A smooth superellipse gradient avoids a normal jump along a box core.
          vec2 gradient=sign(p)*pow(abs(p)/halfSize,vec2(4.));
          vec2 boxNormal=gradient/max(length(gradient),.0001);
          vec2 direction=normalize(radial*.30+boxNormal*.70+vec2(.00001));
          // Inverse image mapping samples farther out as progress increases:
          // visible cloud features therefore travel inward toward the portal.
          vec2 offset=direction*(.32*uPull*influence)/aspect;
          vec2 uv=vUv+offset;
          vec2 transport=direction*(.85*uPull*influence)/aspect;
          vec3 color=flowingSky(uv,transport);
          float streak=.070*uPull*influence;
          color=color*.55+flowingSky(uv+direction*streak/aspect,transport)*.25
                         +flowingSky(uv+direction*streak*2./aspect,transport)*.20;
          // Preserve the supplied panorama colors; the entry lens grades locally.
          // A saturated blue shoulder makes the lens read as a bulging volume,
          // falling off into the pale photographic sky farther from the portal.
          float shoulder=exp(-pow(outside/.20,1.45));
          vec3 deepBlue=sRGBTransferEOTF(vec4(.18,.38,.65,1.)).rgb;
          color=mix(color,deepBlue,shoulder*.62*uPull);
          // Follow the actual rendered silhouette, not a rectangular bounding box.
          if(uGlow>.001){
            float solid=texture2D(uVolumeMask,vUv).a;
            float soft=max(texture2D(uSoftMask,vUv).a,0.);
            float wide=max(texture2D(uWideMask,vUv).a,0.);
            // A restrained luminous core and a separate, much wider air-light falloff.
            float corona=(1.8*pow(soft,2.6)+.55*pow(wide,.9))*(1.-solid);
            color+=vec3(1.20,1.35,.84)*corona*uGlow;
          }
          gl_FragColor=vec4(color,1.);
        }`
    });
    this.blurMaterial = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false, toneMapped: false,
      uniforms: { uImage: { value: null }, uStep: { value: new THREE.Vector2() }, uWide: { value: 0 }, uSigma: { value: 3 } },
      vertexShader,
      fragmentShader: `
        varying vec2 vUv;uniform sampler2D uImage;uniform vec2 uStep;uniform float uWide,uSigma;
        void main(){
          // Adjacent texel taps form one continuous Gaussian. Spreading a small
          // bilinear kernel farther apart creates multiple visible silhouettes.
          float sigma=uWide>.5?4.:uSigma;
          vec4 total=vec4(0.);float weights=0.;
          for(int i=-12;i<=12;i++){
            float x=float(i);float weight=exp(-x*x/(2.*sigma*sigma));
            total+=texture2D(uImage,vUv+uStep*x)*weight;weights+=weight;
          }
          gl_FragColor=total/weights;
        }`
    });
    this.mixMaterial = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false, transparent: true, toneMapped: false,
      uniforms: { uSharp: { value: this.sharp.texture }, uBlurred: { value: this.blurred.texture } },
      vertexShader,
      fragmentShader: `
        varying vec2 vUv;uniform sampler2D uSharp,uBlurred;
        void main(){
          vec4 sharp=texture2D(uSharp,vUv),blurred=texture2D(uBlurred,vUv);
          // Blurred coverage is a soft distance field around the silhouette.
          float feather=1.-smoothstep(.58,.998,blurred.a);
          vec4 result=mix(sharp,blurred,feather);
          if(result.a<.002)discard;
          // Targets contain premultiplied color; normal blending expects straight RGB.
          gl_FragColor=vec4(result.rgb/max(result.a,.0001),result.a);
        }`
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blurMaterial);
    this.scene.add(this.quad);
    this.savedColor = new THREE.Color();
  }

  setSize(width, height) {
    this.sky.setSize(width, height);
    this.sharp.setSize(width, height);
    this.width = Math.max(1, Math.round(width / 2));
    this.height = Math.max(1, Math.round(height / 2));
    this.horizontal.setSize(this.width, this.height);
    this.blurred.setSize(this.width, this.height);
    this.haloWidth = Math.max(1, Math.round(width / 4));
    this.haloHeight = Math.max(1, Math.round(height / 4));
    this.haloHorizontal.setSize(this.haloWidth, this.haloHeight);
    this.haloSoft.setSize(this.haloWidth, this.haloHeight);
    // Keep optical softness consistent across pixel densities and viewport sizes.
    this.radius = Math.max(1.2, Math.min(3.2, height / 350));
  }

  render(renderer, background, volume, camera, output, pull = 0, glow = 0, flowTime = 0) {
    const previousAutoClear = renderer.autoClear;
    const previousAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this.savedColor);
    renderer.autoClear = true;
    camera.updateMatrixWorld(true);
    // A wider view supplies real sky pixels outside the current viewport for refraction.
    this.skyCamera.copy(camera);
    this.skyCamera.fov = Math.min(130, camera.fov * 2.7);
    this.skyCamera.updateProjectionMatrix();
    renderer.setRenderTarget(this.sky);
    renderer.render(background, this.skyCamera);

    // Track the projected 3D volume as it rotates and the camera approaches.
    volume.updateMatrixWorld(true);
    const mesh = volume.getObjectByProperty('isMesh', true);
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox;
    this.minimum.set(Infinity, Infinity);
    this.maximum.set(-Infinity, -Infinity);
    for (let i = 0; i < 8; i++) {
      this.projectedCorner.set(i & 1 ? bounds.max.x : bounds.min.x,
        i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z);
      this.projectedCorner.applyMatrix4(mesh.matrixWorld).project(camera);
      const x = this.projectedCorner.x * .5 + .5;
      const y = this.projectedCorner.y * .5 + .5;
      this.minimum.x = Math.min(this.minimum.x, x);
      this.minimum.y = Math.min(this.minimum.y, y);
      this.maximum.x = Math.max(this.maximum.x, x);
      this.maximum.y = Math.max(this.maximum.y, y);
    }
    const lens = this.skyMaterial.uniforms;
    lens.uCenter.value.addVectors(this.minimum, this.maximum).multiplyScalar(.5);
    lens.uHalfSize.value.subVectors(this.maximum, this.minimum).multiplyScalar(.5);
    lens.uAspect.value = camera.aspect;
    lens.uCrop.value = Math.tan(THREE.MathUtils.degToRad(camera.fov * .5)) /
      Math.tan(THREE.MathUtils.degToRad(this.skyCamera.fov * .5));
    lens.uPull.value = pull;
    lens.uGlow.value = glow;
    lens.uFlowTime.value = flowTime;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.sharp);
    renderer.render(volume, camera);
    this.quad.material = this.blurMaterial;
    this.blurMaterial.uniforms.uWide.value = 0;
    this.blurMaterial.uniforms.uSigma.value = Math.min(5, this.radius * 1.5);
    this.blurMaterial.uniforms.uImage.value = this.sharp.texture;
    this.blurMaterial.uniforms.uStep.value.set(1 / this.width, 0);
    renderer.setRenderTarget(this.horizontal);
    renderer.render(this.scene, this.camera);
    this.blurMaterial.uniforms.uImage.value = this.horizontal.texture;
    this.blurMaterial.uniforms.uStep.value.set(0, 1 / this.height);
    renderer.setRenderTarget(this.blurred);
    renderer.render(this.scene, this.camera);
    if (glow > .001) {
      this.blurMaterial.uniforms.uWide.value = 1;
      this.blurMaterial.uniforms.uImage.value = this.sharp.texture;
      this.blurMaterial.uniforms.uStep.value.set(1 / this.haloWidth, 0);
      renderer.setRenderTarget(this.haloHorizontal);
      renderer.render(this.scene, this.camera);
      this.blurMaterial.uniforms.uImage.value = this.haloHorizontal.texture;
      this.blurMaterial.uniforms.uStep.value.set(0, 1 / this.haloHeight);
      renderer.setRenderTarget(this.haloSoft);
      renderer.render(this.scene, this.camera);
    }

    renderer.setClearColor(this.savedColor, previousAlpha);
    renderer.setRenderTarget(output);
    // The sky pass now reads this frame's silhouette for a precisely attached halo.
    this.quad.material = this.skyMaterial;
    renderer.render(this.scene, this.camera);
    renderer.autoClear = false;
    this.quad.material = this.mixMaterial;
    renderer.render(this.scene, this.camera);
    renderer.autoClear = previousAutoClear;
  }
}
