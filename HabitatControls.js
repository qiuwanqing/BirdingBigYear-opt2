import * as THREE from 'three';

// A bounded walking corridor inside the repaired scan. These limits leave a
// body-width margin around the shelf fronts and the display at the far end.
export const WALK_BOUNDS=Object.freeze({left:-.48,right:.48,back:4.65,front:-1.0});
const movementCodes=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);

export class HabitatControls {
 constructor(canvas,enabled){
  this.canvas=canvas;this.enabled=enabled;this.keys=new Set();
  this.position=new THREE.Vector3(0,1.5,4.6);
  this.yaw=0;this.pitch=0;this.baseYaw=0;this.pointerId=null;
  this.pointerActive=false;this.pointerX=0;this.pointerY=0;
  canvas.addEventListener('pointerdown',e=>{
   if(!enabled()||e.pointerType!=='touch')return;
   this.pointerId=e.pointerId;this.lastX=e.clientX;this.lastY=e.clientY;
   canvas.setPointerCapture(e.pointerId);
  });
  window.addEventListener('pointermove',e=>{
   if(!enabled())return;
   if(e.pointerType!=='touch'){
    this.pointerActive=e.target===canvas;
    if(this.pointerActive){
     const rect=canvas.getBoundingClientRect();
     this.pointerX=THREE.MathUtils.clamp((e.clientX-rect.left)/rect.width*2-1,-1,1);
     this.pointerY=THREE.MathUtils.clamp((e.clientY-rect.top)/rect.height*2-1,-1,1);
    }
    return;
   }
   if(e.pointerId!==this.pointerId)return;
   this.look(e.clientX-this.lastX,e.clientY-this.lastY);
   this.lastX=e.clientX;this.lastY=e.clientY;
  });
  canvas.addEventListener('pointerleave',()=>{this.pointerActive=false});
  const release=e=>{if(e.pointerId===this.pointerId)this.release()};
  canvas.addEventListener('pointerup',release);
  canvas.addEventListener('pointercancel',release);
  canvas.addEventListener('lostpointercapture',release);
  window.addEventListener('keydown',e=>{
   if(!enabled()||!movementCodes.has(e.code)||e.metaKey||e.ctrlKey||e.altKey)return;
   if(e.target instanceof Element&&e.target.closest('input,textarea,select,[contenteditable="true"]'))return;
   e.preventDefault();this.keys.add(e.code);
  });
  window.addEventListener('keyup',e=>this.keys.delete(e.code));
  window.addEventListener('blur',()=>this.stop());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.stop()});
 }
 look(dx,dy){
  this.yaw-=dx*.004;this.baseYaw=this.yaw;
  this.pitch=THREE.MathUtils.clamp(this.pitch-dy*.004,-1.15,1.15);
 }
 release(){
  const id=this.pointerId;this.pointerId=null;
  if(id!==null&&this.canvas.hasPointerCapture(id))this.canvas.releasePointerCapture(id);
  if(this.enabled())this.canvas.style.cursor='default';
 }
 stop(){this.keys.clear();this.pointerActive=false;this.release()}
 reset(){this.stop();this.position.set(0,1.5,4.6);this.yaw=0;this.pitch=0;this.baseYaw=0}
 update(dt,camera){
  const elapsed=Math.min(dt,.06);
  if(this.pointerActive){
   const edge=THREE.MathUtils.smoothstep(Math.abs(this.pointerX),.65,1);
   this.baseYaw-=Math.sign(this.pointerX)*edge*1.15*elapsed;
   const damping=1-Math.exp(-elapsed*5);
   this.yaw=THREE.MathUtils.lerp(this.yaw,this.baseYaw-this.pointerX*.3,damping);
   this.pitch=THREE.MathUtils.lerp(this.pitch,-this.pointerY*.3,damping);
  }
  const forward=Number(this.keys.has('KeyW')||this.keys.has('ArrowUp'))-Number(this.keys.has('KeyS')||this.keys.has('ArrowDown'));
  const side=Number(this.keys.has('KeyD')||this.keys.has('ArrowRight'))-Number(this.keys.has('KeyA')||this.keys.has('ArrowLeft'));
  const length=Math.hypot(forward,side)||1;
  const step=Math.min(dt,.06)*1.15/length;
  this.position.x+=(-Math.sin(this.yaw)*forward+Math.cos(this.yaw)*side)*step;
  this.position.z+=(-Math.cos(this.yaw)*forward-Math.sin(this.yaw)*side)*step;
  this.position.x=THREE.MathUtils.clamp(this.position.x,WALK_BOUNDS.left,WALK_BOUNDS.right);
  this.position.z=THREE.MathUtils.clamp(this.position.z,WALK_BOUNDS.front,WALK_BOUNDS.back);
  camera.position.copy(this.position);
  camera.rotation.set(this.pitch,this.yaw,0,'YXZ');
 }
}
