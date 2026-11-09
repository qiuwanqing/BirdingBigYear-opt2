import placeholderURL from './assets/bird-release-placeholder.webm?url';

// Replace this source with the approved clip for the corresponding saved shot.
// Placeholder footage is deliberately labelled and never creates a sighting.
export const RELEASE_VIDEO={url:placeholderURL,placeholder:true};
export class BirdReleaseVideo {
 constructor(parent){
  this.layer=document.createElement('div');this.layer.className='bird-release-video';this.layer.hidden=true;
  this.video=document.createElement('video');this.video.muted=true;this.video.playsInline=true;this.video.preload='auto';
  this.video.setAttribute('aria-label','鸟离开包装的视频，目前为占位素材');
  this.video.src=RELEASE_VIDEO.url;this.layer.append(this.video);parent.append(this.layer);
 }
 play(){
  this.cancel();this.layer.hidden=false;this.video.currentTime=0;
  return new Promise((resolve,reject)=>{
   const cleanup=()=>{this.video.onended=null;this.video.onerror=null;this.finish=null;};
   this.finish=()=>{cleanup();resolve(false);};
   this.video.onended=()=>{cleanup();resolve(true);};
   this.video.onerror=()=>{cleanup();reject(new Error('视频加载失败，请重试或跳过。'));};
   this.video.play().catch(error=>{cleanup();reject(error);});
  });
 }
 cancel(){
  this.finish?.();this.video.pause();this.layer.hidden=true;
 }
}
