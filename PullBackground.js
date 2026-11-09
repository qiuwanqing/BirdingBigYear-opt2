import * as THREE from 'three';

// Adapted from the local Sky Portal Study 003: overscan plus inverse radial
// transport. Progress alone drives the warp, so reverse scrolling retraces it.
export class PullBackground {
  constructor() {
    const options = { type: THREE.HalfFloatType, depthBuffer: false };
    this.source = new THREE.WebGLRenderTarget(1, 1, options);
    this.output = new THREE.WebGLRenderTarget(1, 1, options);
    this.world = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera();
    this.screen = new THREE.Scene();
    this.screenCamera = new THREE.Camera();
    this.material = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false, toneMapped: false,
      uniforms: {
        uImage: { value: this.source.texture },
        uAspect: { value: 1 }, uCrop: { value: 1 },
        uRadius: { value: .2 }, uPull: { value: 0 },
        uSilhouetteMask: { value: null }, uSilhouetteDistance: { value: null },
        uHasSilhouette: { value: 0 },
        uHalo: { value: 0 }, uHaloWidth: { value: .012 },
        uHaloStrength: { value: .65 }, uShoulderStrength: { value: .26 }
      },
      vertexShader: `varying vec2 vUv;
        void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D uImage;
        uniform sampler2D uSilhouetteMask,uSilhouetteDistance;
        uniform float uHasSilhouette;
        uniform float uAspect,uCrop,uRadius,uPull;
        uniform float uHalo,uHaloWidth,uHaloStrength,uShoulderStrength;
        vec3 sampleWorld(vec2 uv){
          return texture2D(uImage,.5+(uv-.5)*uCrop).rgb;
        }
        void main(){
          vec2 aspect=vec2(uAspect,1.);
          vec2 p=(vUv-.5)*aspect;
          float r=length(p);
          vec2 direction=p/max(r,.0001);
          float outside=max(r-uRadius,0.);
          float influence=exp(-outside/(.18+.14*uPull));
          // Sample farther outward: recognizable features move toward the sphere.
          float inward=.30*uPull*influence*smoothstep(0.,max(uRadius,.05),r);
          vec2 uv=vUv+direction*inward/aspect;
          float trail=.045*uPull*influence;
          vec3 color=sampleWorld(uv)*.60;
          color+=sampleWorld(uv+direction*trail/aspect)*.25;
          color+=sampleWorld(uv+direction*trail*2./aspect)*.15;
          // Distance from the projected bag, in screen-height units.
          // A narrow luminous lip, a wider shaded shoulder, then a faint soft recovery.
          // This is one smooth profile, not repeating concentric rings.
          float edge=texture2D(uSilhouetteDistance,vUv).r;
          float w=uHaloWidth;
          float exterior=(1.-texture2D(uSilhouetteMask,vUv).r)*uHasSilhouette;
          float lip=exp(-pow((edge-w*.25)/w,2.));
          float shoulder=exp(-pow((edge-w*3.0)/(w*1.9),2.));
          float recovery=exp(-pow((edge-w*6.4)/(w*3.0),2.));
          float strength=uHalo*exterior;
          color*=1.-shoulder*uShoulderStrength*strength;
          // Scale to the surrounding radiance so the lip reads on bright LDR interiors too.
          float luminance=dot(color,vec3(.2126,.7152,.0722));
          color+=vec3(1.0,.95,.82)*(lip*uHaloStrength+recovery*.07)
            *strength*(.5+luminance);
          gl_FragColor=vec4(color,1.);
        }`
    });
    this.screen.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
  }
  setSize(width, height) {
    this.source.setSize(width, height);
    this.output.setSize(width, height);
  }
  render(renderer, camera, panorama, rotation, blur, progress, reducedMotion, settings = {}, silhouette = null) {
    this.world.background = panorama;
    this.world.backgroundRotation.copy(rotation);
    this.world.backgroundBlurriness = blur;
    this.camera.copy(camera);
    this.camera.fov = Math.min(130, camera.fov * 2.5);
    this.camera.updateProjectionMatrix();
    const u = this.material.uniforms;
    u.uHasSilhouette.value = silhouette ? 1 : 0;
    u.uSilhouetteMask.value = silhouette?.mask ?? null;
    u.uSilhouetteDistance.value = silhouette?.distance ?? null;
    u.uAspect.value = camera.aspect;
    u.uCrop.value = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) /
      Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const distance = Math.max(camera.position.z, 1.001);
    u.uRadius.value = .5 / (Math.sqrt(distance * distance - 1) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    u.uHalo.value = THREE.MathUtils.smoothstep(progress, .025, .38);
    u.uHaloWidth.value = settings.haloWidth ?? .012;
    u.uHaloStrength.value = settings.haloStrength ?? .65;
    u.uShoulderStrength.value = settings.shoulderStrength ?? .26;
    u.uPull.value = reducedMotion ? 0 : THREE.MathUtils.smoothstep(progress, .08, .62);
    const previousTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.source);
    renderer.render(this.world, this.camera);
    renderer.setRenderTarget(this.output);
    renderer.render(this.screen, this.screenCamera);
    renderer.setRenderTarget(previousTarget);
    return this.output.texture;
  }
}
