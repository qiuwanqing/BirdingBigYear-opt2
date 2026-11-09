import * as THREE from 'three';
import { ScanTraceView } from './ScanTraceView.js';

// The single Habitat view. Its point/surface renderer and user-selected
// background remain unchanged; these contours are a separate
// diagrammatic interpretation of the space, not a surveyed reconstruction.
export class ScanSpaceView extends ScanTraceView {
 constructor(source,edges){
  super(source,edges);
  this.group.name='Points and lines with spatial contours';
  const localTraces=this.lines;
  this.lines=new THREE.Group();this.lines.name='Spatial contour comparison';this.lines.visible=false;
  localTraces.visible=true;localTraces.raycast=()=>{};
  this.lines.add(localTraces);
  this.contours=this.makeContours(source);this.lines.add(this.contours);
 }
 makeContours(source){
  const positions=[];
  let stroke=0;
  const path=(vertices,{echo=false}={})=>{
   const number=stroke++;
   for(let edge=0;edge<vertices.length-1;edge++){
    const start=new THREE.Vector3(...vertices[edge]),end=new THREE.Vector3(...vertices[edge+1]);
    const length=start.distanceTo(end),steps=Math.max(1,Math.ceil(length/.6));
    let previous=start;
    for(let step=1;step<=steps;step++){
     const t=step/steps,point=new THREE.Vector3().lerpVectors(start,end,t);
     // Small, fixed deviations suggest recorded contours without moving lines.
     const wobble=Math.sin(t*Math.PI)*Math.sin(step*1.7+number)*.014;
     point.x+=wobble;point.z+=wobble*.65;
     positions.push(...previous.toArray(),...point.toArray());previous=point;
    }
   }
   if(echo){
    // Only selected long contours receive a light second trace.
    const shifted=vertices.map(([x,y,z])=>[x+.035,y+.025,z-.028]);
    path(shifted);
   }
  };
  source.updateMatrixWorld(true);
  const rooms=[];
  source.traverse(mesh=>{
   if(mesh.isMesh&&mesh.userData.scanMeshIndex<=3){
    rooms.push({index:mesh.userData.scanMeshIndex,bounds:new THREE.Box3().setFromObject(mesh)});
   }
  });
  for(const {bounds:b,index} of rooms){
   const center=(b.min.x+b.max.x)/2,width=b.max.x-b.min.x;
   const left=b.min.x-.55,right=b.max.x+.55,front=b.max.z+.85,back=b.min.z-.85;
   const ground=index===3?.08:Math.max(-.02,b.min.y+.08),upper=ground+2.50,top=ground+2.95;
   // Long open footprint edges extend beyond the scanned material into the void.
   path([[left,ground,front],[left,ground,(front+back)/2],[left+.18,ground,back]],{echo:true});
   path([[right,ground,front],[right,ground,back]],{echo:index===1});
   path([[left,ground,back],[center-.9,ground,back]]);
   path([[center+.9,ground,back],[right,ground,back]]);
   // Two heights and sparse uprights describe the volume; the front stays open.
   path([[left,upper,front],[left,upper,back],[right,upper,back],[right,upper,front]],{echo:true});
   path([[left+.25,top,front+.45],[left+.25,top,back-.5],[right-.3,top,back-.5]]);
   for(const [x,z] of [[left,back],[right,back],[index===1?left:right,front]]){
    path([[x,ground,z],[x,upper,z]]);
   }
   // A pair of long overhead shelf directions is visible from inside the aisle.
   const inner=Math.min(1.15,width*.17),shelfTop=ground+2.13;
   for(const side of [-1,1])path([[center+side*inner,shelfTop,front+1],[center+side*inner,shelfTop,back-1.2]],{echo:index===1&&side===-1});
   // Partial transverse contours, above the products rather than across labels.
   const crossZ=back+(front-back)*.60;
   path([[left-.8,upper,crossZ],[center,upper,crossZ],[right+.8,upper,crossZ]]);
  }
  // Open cross-aisle branches bridge gaps between separately staged scan blocks.
  // These are spatial cues, deliberately left without enclosing wall surfaces.
  const ordered=rooms.filter(room=>room.index<=2).sort((a,b)=>b.bounds.max.z-a.bounds.max.z);
  for(let i=0;i<ordered.length-1;i++){
   const near=ordered[i].bounds,far=ordered[i+1].bounds;
   const z=(near.min.z+far.max.z)/2,reach=Math.max(near.max.x,far.max.x)+2.8;
   const left=Math.min(near.min.x,far.min.x)-2;
   path([[left,.08,z],[left+1.5,.08,z],[reach,.08,z]],{echo:true});
   path([[left,2.55,z],[reach-1,2.55,z],[reach,2.55,z-1.4]]);
  }
  const sideRoom=rooms.find(room=>room.index===3),mainRoom=rooms.find(room=>room.index===1);
  if(sideRoom&&mainRoom){
   const z=(sideRoom.bounds.min.z+sideRoom.bounds.max.z)/2;
   const from=(mainRoom.bounds.min.x+mainRoom.bounds.max.x)/2+1.3,to=sideRoom.bounds.max.x+1.6;
   path([[from,.08,z-.7],[to,.08,z-.7]]);
   path([[from,2.55,z+.7],[to,2.55,z+.7]],{echo:true});
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const result=new THREE.Group();result.name='Long ground and overhead contours';
  // Main strokes respect depth; a faint echo preserves continuity through scans.
  const solid=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:'#dce5e1',transparent:true,opacity:.62,depthWrite:false,fog:false}));
  const ghost=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:'#c2d0cc',transparent:true,opacity:.09,depthWrite:false,depthTest:false,fog:false}));
  ghost.renderOrder=2;
  solid.raycast=ghost.raycast=()=>{};result.add(solid,ghost);
  return result;
 }
}
