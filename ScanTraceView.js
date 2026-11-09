import * as THREE from 'three';
import edgeURL from './assets/scan-edges.bin?url';
import edgeMetadata from './assets/scan-edges.json';
import {HabitatColorGrade,scanGradeGLSL} from './HabitatColorGrade.js';

// Surface samples retain the scan's UV colors and actual 3D positions. No
// random particles are added in the empty space between the separate scans.
export class ScanTraceView {
 static async create(source){
  const response=await fetch(edgeURL);
  if(!response.ok)throw new Error(`Scan boundary field: HTTP ${response.status}`);
  return new this(source,new Uint8Array(await response.arrayBuffer()));
 }
 constructor(source,edges){
  this.group=source.clone(true);this.group.name='Scan points and structural traces';
  this.group.visible=false;
  this.color=new THREE.Color('#3b454a');
  this.fog=new THREE.FogExp2(this.color,.027);
  this.background=this.makeBackground();
  this.pixelRatio={value:1};this.viewportHeight={value:900};
  this.colorGrade=new HabitatColorGrade();
  const meshes=[];this.group.traverse(object=>{if(object.isMesh)meshes.push(object)});
  for(const mesh of meshes){
   const field=edgeMetadata.meshes[mesh.userData.scanMeshIndex];
   if(!field||field.count!==mesh.geometry.attributes.position.count)throw new Error(`Scan boundary mismatch: ${mesh.name}`);
   const geometry=mesh.geometry.clone();
   geometry.setAttribute('scanEdge',new THREE.Uint8BufferAttribute(edges.subarray(field.offset,field.offset+field.count),1,true));
   mesh.geometry=geometry;
   const original=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
   mesh.material=this.makeSurface(original.map);
   const points=this.sampleSurface(geometry);
   const cloud=new THREE.Points(points,this.makePoints(original.map));
   cloud.raycast=()=>{};mesh.add(cloud);
  }
  source.updateMatrixWorld(true);
  this.lines=this.makeTraces(source);
  const bounds=new THREE.Box3().setFromObject(source);
  this.floor=new THREE.Mesh(new THREE.PlaneGeometry(bounds.max.x-bounds.min.x+4,bounds.max.z-bounds.min.z+4),new THREE.ShaderMaterial({
   uniforms:{color:{value:new THREE.Color('#303a3e')}},transparent:true,depthWrite:false,
   vertexShader:`varying float vDepth;void main(){vec4 view=modelViewMatrix*vec4(position,1.);vDepth=-view.z;gl_Position=projectionMatrix*view;}`,
   fragmentShader:`uniform vec3 color;varying float vDepth;void main(){gl_FragColor=vec4(color,.24*exp(-max(vDepth,0.)*.24));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`
  }));
  this.floor.rotation.x=-Math.PI/2;
  this.floor.position.set((bounds.min.x+bounds.max.x)/2,-.10,(bounds.min.z+bounds.max.z)/2);
  this.floor.visible=false;this.lines.visible=false;
 }
 makeBackground(){
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=512;
  const context=canvas.getContext('2d'),gradient=context.createLinearGradient(0,0,0,512);
  // Visible charcoal inside the binoculars, distinct from their pure black mask.
  gradient.addColorStop(0,'#000000');gradient.addColorStop(.5,'#000000');gradient.addColorStop(1,'#000000');
  context.fillStyle=gradient;context.fillRect(0,0,64,512);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
 }
 makeSurface(map){
  const material=new THREE.MeshBasicMaterial({map,side:THREE.DoubleSide,alphaHash:true});
  material.onBeforeCompile=shader=>{
   this.colorGrade.compiledSurfaces++;
   Object.assign(shader.uniforms,this.colorGrade.uniforms);
   shader.uniforms.uPrintTextureSize={value:new THREE.Vector2(map?.image?.width??1024,map?.image?.height??1024)};
   shader.vertexShader='attribute float scanEdge; varying float vTraceEdge; varying vec3 vTraceWorld; varying float vTraceDepth;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    vTraceEdge=scanEdge;vTraceWorld=(modelMatrix*vec4(transformed,1.)).xyz;`);
   shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
    vTraceDepth=-mvPosition.z;`);
   shader.fragmentShader=scanGradeGLSL+'\nvarying float vTraceEdge; varying vec3 vTraceWorld; varying float vTraceDepth;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
    float intact=smoothstep(.02,.90,vTraceEdge);
    float distant=1.-smoothstep(3.5,10.,vTraceDepth);
    float ceiling=1.-smoothstep(2.0,2.8,vTraceWorld.y);
    float base=smoothstep(.02,.23,vTraceWorld.y);
    diffuseColor.a*=intact*distant*ceiling*mix(.35,1.,base);
    // Original keeps the scan texture unchanged before global rendering.
    diffuseColor.rgb=gradeScanColor(diffuseColor.rgb);
    #ifdef USE_MAP
     diffuseColor.rgb=printScanColor(diffuseColor.rgb,vMapUv);
    #endif
   `);
  };
  material.customProgramCacheKey=()=> 'scan-trace-vintage-print-surface-v3';
  return material;
 }
 sampleSurface(geometry){
  const positions=geometry.attributes.position,uvs=geometry.attributes.uv;
  const edge=geometry.attributes.scanEdge,index=geometry.index;
  const triangles=index.count/3,cumulative=new Float32Array(triangles);
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3();
  let area=0;
  for(let i=0;i<triangles;i++){
   a.fromBufferAttribute(positions,index.getX(i*3));b.fromBufferAttribute(positions,index.getX(i*3+1));c.fromBufferAttribute(positions,index.getX(i*3+2));
   area+=ab.subVectors(b,a).cross(ac.subVectors(c,a)).length()*.5;cumulative[i]=area;
  }
  const count=Math.min(110000,Math.max(900,Math.ceil(area*1800)));
  const p=new Float32Array(count*3),uv=new Float32Array(count*2),d=new Float32Array(count);
  let seed=173+positions.count;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
  for(let i=0;i<count;i++){
   // Stratified area sampling prevents dense triangulation from becoming bright patches.
   const target=area*(i+random())/count;let low=0,high=triangles-1;
   while(low<high){const middle=(low+high)>>>1;if(cumulative[middle]<target)low=middle+1;else high=middle;}
   const ids=[index.getX(low*3),index.getX(low*3+1),index.getX(low*3+2)];
   const r=Math.sqrt(random()),s=random(),weights=[1-r,r*(1-s),r*s];
   for(let j=0;j<3;j++){
    const id=ids[j],weight=weights[j];
    p[i*3]+=positions.getX(id)*weight;p[i*3+1]+=positions.getY(id)*weight;p[i*3+2]+=positions.getZ(id)*weight;
    uv[i*2]+=uvs.getX(id)*weight;uv[i*2+1]+=uvs.getY(id)*weight;d[i]+=edge.getX(id)*weight;
   }
  }
  const result=new THREE.BufferGeometry();
  result.setAttribute('position',new THREE.BufferAttribute(p,3));result.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  result.setAttribute('scanEdge',new THREE.BufferAttribute(d,1));return result;
 }
 makePoints(map){
  return new THREE.ShaderMaterial({
   uniforms:{map:{value:map},pixelRatio:this.pixelRatio,viewportHeight:this.viewportHeight,voidColor:{value:this.color},uPrintTextureSize:{value:new THREE.Vector2(map?.image?.width??1024,map?.image?.height??1024)},...this.colorGrade.uniforms},
   transparent:true,depthWrite:false,
   vertexShader:`attribute float scanEdge;varying vec2 vUv;varying float vEdge,vDepth,vHeight;
    uniform float pixelRatio,viewportHeight;
    void main(){vUv=uv;vEdge=scanEdge;vec4 world=modelMatrix*vec4(position,1.);vHeight=world.y;
     vec4 view=viewMatrix*world;vDepth=-view.z;gl_Position=projectionMatrix*view;
     gl_PointSize=clamp(.0065*projectionMatrix[1][1]*viewportHeight*.5/max(vDepth,.1),.7*pixelRatio,2.1*pixelRatio);}`,
   fragmentShader:scanGradeGLSL+`uniform sampler2D map;uniform vec3 voidColor;
    varying vec2 vUv;varying float vEdge,vDepth,vHeight;
    void main(){float radius=length(gl_PointCoord-.5);if(radius>.5)discard;
     float edge=1.-smoothstep(.05,.95,vEdge),farther=smoothstep(3.,9.,vDepth);
     float ceiling=smoothstep(1.95,2.8,vHeight);
     float opacity=max(max(edge*.88,farther*.72),ceiling*.5);
     float fog=exp(-.0009*vDepth*vDepth);
     vec3 color=texture2D(map,vUv).rgb;
     // Same unmodified texture input and shared grade as the scan surfaces.
     color=gradeScanColor(color);
     color=printScanColor(color,vUv);
     color=mix(voidColor,color,fog);
     gl_FragColor=vec4(color,opacity*(1.-smoothstep(.28,.5,radius))*.84*fog);
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`
  });
 }
 makeTraces(source){
  const segments=[],world=new THREE.Vector3();
  const add=(a,b)=>segments.push(...a,...b);
  source.traverse(mesh=>{
   if(!mesh.isMesh||mesh.userData.scanMeshIndex>2)return;
   const bounds=new THREE.Box3().setFromObject(mesh),center=(bounds.min.x+bounds.max.x)/2;
   const width=bounds.max.x-bounds.min.x,step=.50;
   const start=bounds.min.z+.35,end=bounds.max.z-.35;
   const levels=[.55,.94,1.33,1.70],bins=Math.ceil((end-start)/step);
   const rows=levels.map(()=>[Array.from({length:bins},()=>[]),Array.from({length:bins},()=>[])]);
   const position=mesh.geometry.attributes.position;
   for(let i=0;i<position.count;i+=2){
    world.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
    const bin=Math.floor((world.z-start)/step),dx=world.x-center;
    if(bin<0||bin>=bins||Math.abs(dx)<.48||Math.abs(dx)>width*.43)continue;
    for(let row=0;row<levels.length;row++)if(Math.abs(world.y-levels[row])<.035)rows[row][dx>0?1:0][bin].push(world.x);
   }
   for(let row=0;row<levels.length;row++)for(let side=0;side<2;side++){
    let previous=null;
    for(let bin=0;bin<bins;bin++){
     const values=rows[row][side][bin];
     // Broken, short traces only where sampled shelf surfaces support them.
     if(values.length<5||(bin+row)%5===0){previous=null;continue;}
     values.sort((a,b)=>side?a-b:b-a);
     const x=values[Math.floor(values.length*.18)]+(side?-.085:.085);
     const point=[x,levels[row]+.009,start+(bin+.5)*step];
     if(previous&&Math.abs(previous[0]-point[0])<.20)add(previous,point);
     previous=point;
    }
   }
   // A few open ground traces extend the aisle direction into missing areas.
   // They are diagrammatic guides, not a reconstructed floor plan or closed box.
   const ground=Math.max(.12,bounds.min.y+.22),half=Math.min(.72,width*.14);
   for(const side of [-1,1]){
    const x=center+side*half;
    for(let z=start+.3;z<end-.8;z+=2.3)add([x,ground,z],[x,ground,Math.min(z+1.45,end)]);
   }
   // Short vertical indications at just two shelf positions per scan.
   for(const side of [0,1])for(const bin of [Math.floor(bins*.28),Math.floor(bins*.72)]){
    const values=rows[1][side][bin];if(values.length<5)continue;
    values.sort((a,b)=>side?a-b:b-a);
    const x=values[Math.floor(values.length*.18)]+(side?-.085:.085),z=start+(bin+.5)*step;
    add([x,.48,z],[x,.82,z]);add([x,1.05,z],[x,1.55,z]);
   }
  });
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(segments,3));
  const lines=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:'#c3cece',transparent:true,opacity:.55,depthWrite:false}));
  lines.name='Sparse shelf traces';lines.raycast=()=>{};return lines;
 }
 update(renderer){this.pixelRatio.value=renderer.getPixelRatio();this.viewportHeight.value=renderer.domElement.height;this.colorGrade.update(renderer)}
 setVisible(visible){this.group.visible=visible;this.floor.visible=visible;this.lines.visible=visible}
}
