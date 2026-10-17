import * as THREE from 'three';

export const HISTORY = Object.freeze({ columns: 12, rows: 8, tileWidth: 320, tileHeight: 180, fps: 24 });

// A ring of actual decoded frames, captured on the GPU. No canvas readback or seeking.
export class VideoHistory {
  constructor(renderer, url, uniforms) {
    this.renderer = renderer;
    this.uniforms = uniforms;
    this.capacity = HISTORY.columns * HISTORY.rows;
    this.head = -1;
    this.count = 0;
    this.nextCapture = 0;
    this.lastVideoTime = -1;
    this.active = false;
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.loop = false;
    this.video.defaultPlaybackRate = .5;
    this.video.playbackRate = .5;
    this.video.playsInline = true;
    this.video.preload = 'auto';
    this.video.src = url;
    this.video.addEventListener('error', () => {
      console.warn('Volume video could not load; using the animated photo preview.');
      uniforms.uUseVideo.value = 0;
    });

    this.texture = new THREE.VideoTexture(this.video);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.atlas = new THREE.WebGLRenderTarget(HISTORY.columns * HISTORY.tileWidth, HISTORY.rows * HISTORY.tileHeight, {
      depthBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false
    });
    this.atlas.scissorTest = true;
    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false, depthTest: false, depthWrite: false })));
    uniforms.uVideo.value = this.texture;
    uniforms.uHistory.value = this.atlas.texture;

    // Decode the first frame without autoplay. Playback belongs to object hover.
    this.video.load();
  }

  setActive(active) {
    if (active === this.active) return;
    this.active = active;
    if (!active) { this.video.pause(); return; }
    if (this.video.ended) {
      this.video.currentTime = 0;
      this.head = -1;
      this.count = 0;
      this.lastVideoTime = -1;
      this.nextCapture = 0;
    }
    this.video.play().then(() => {
      // A late play() resolution must not resume a video after pointer leave.
      if (!this.active) this.video.pause();
    }).catch(() => { /* Keep the paused frame if the browser denies playback. */ });
  }

  update(time, paused) {
    this.setActive(!paused);
    if (this.video.readyState < 2) return;
    // Capture one paused poster frame, then preserve the entire history on leave.
    if (this.count && (paused || this.video.paused || time < this.nextCapture)) return;
    if (this.video.currentTime === this.lastVideoTime) return;

    this.head = (this.head + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
    const x = (this.head % HISTORY.columns) * HISTORY.tileWidth;
    const y = Math.floor(this.head / HISTORY.columns) * HISTORY.tileHeight;
    this.atlas.viewport.set(x, y, HISTORY.tileWidth, HISTORY.tileHeight);
    this.atlas.scissor.copy(this.atlas.viewport);
    const previousTarget = this.renderer.getRenderTarget();
    const previousAutoClear = this.renderer.autoClear;
    this.renderer.autoClear = false;
    this.renderer.setRenderTarget(this.atlas);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(previousTarget);
    this.renderer.autoClear = previousAutoClear;
    this.uniforms.uHistoryHead.value = this.head;
    this.uniforms.uHistoryCount.value = this.count;
    this.uniforms.uVideoAspect.value = this.video.videoWidth / this.video.videoHeight;
    this.uniforms.uUseVideo.value = 1;
    this.lastVideoTime = this.video.currentTime;
    this.nextCapture = time + 1 / HISTORY.fps;
  }
}
