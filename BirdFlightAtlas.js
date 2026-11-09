import * as THREE from 'three';

const atlasURL=new URL('./assets/bird-flight/generated/egret-multiview-atlas-v1.png',import.meta.url).href;
const blackbirdURL=new URL('./assets/bird-flight/generated/blackbird-multiview-atlas-v1.png',import.meta.url).href;

// UV windows share one image; frame playback never stretches or deforms artwork.
export async function loadBirdFlightAtlas(){
 const [egret,blackbird]=await Promise.all([loadAtlas(atlasURL),loadAtlas(blackbirdURL)]);
 return {egret,blackbird};
}

async function loadAtlas(url){
 const source=await new THREE.TextureLoader().loadAsync(url);
 source.colorSpace=THREE.SRGBColorSpace;
 const rows=Array.from({length:4},(_,row)=>Array.from({length:2},(_,mirror)=>
  Array.from({length:6},(_,column)=>{
   const texture=source.clone();
   texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
   texture.repeat.set((mirror?-1:1)/6,1/4);
   texture.offset.set((column+(mirror?1:0))/6,(3-row)/4);
   // Avoid mipmap bleed between adjacent poses.
   texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;
   texture.needsUpdate=true;return texture;
  })));
 return {rows};
}

export function flightPose(motion,time,previousRow,style='egret'){
 const lateral=Math.abs(motion.vx),depth=Math.abs(motion.vz);
 // Hysteresis keeps a bird from flickering between adjacent viewpoints.
 const threshold=previousRow===0?.85:1.15;
 let row=depth>lateral*threshold?(motion.vz>0?1:2):0;
 const bank=Math.sin(time*.37+motion.phase);
 if(motion.glide&&Math.abs(bank)>.86)row=3;
 const right=motion.vx>0;
 // Rear poses in the generated atlas face right; other rows face left.
 const mirror=row===2?!right:right;
 const fps=6+motion.phase/Math.PI;
 const frame=motion.glide?(row===3?Math.min(5,Math.floor((bank+1)*3)):1):Math.floor(time*fps+motion.phase*3)%6;
 if(style==='blackbird'){
  // This supplied sheet has left/right side cycles, then oblique/front cycles.
  const frontal=depth>lateral*(previousRow>=2?.85:1.15);
  const birdRow=frontal?(depth>lateral*2?3:2):(right?1:0);
  return {row:birdRow,mirror:birdRow===2?Number(right):0,
   frame:motion.glide?2:Math.floor(time*(fps+2)+motion.phase*3)%6};
 }
 return {row,mirror:Number(mirror),frame};
}
