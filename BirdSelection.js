import {BirdSegmentation} from './BirdSegmentation.js';
import {BIRD_SOURCE_URL,loadImage,createBirdAsset} from './BirdAsset.js';

const $=id=>document.getElementById(id);
// These are prompts for the one supplied sample, not a replacement mask or a
// classifier. Every proposed mask is inferred from bird1.png in the worker.
const SAMPLE_POINTS=[{x:215,y:325,label:1},{x:150,y:160,label:1},{x:145,y:270,label:1},
 {x:194,y:565,label:1},{x:208,y:437,label:1},{x:35,y:490,label:0},{x:330,y:550,label:0},{x:237,y:420,label:0}];

export class BirdSelection {
 constructor({toolTray,onConfirm,onCancel}){
  Object.assign(this,{toolTray,onConfirm,onCancel});this.segmentation=new BirdSegmentation();
  this.canvas=document.createElement('canvas');this.canvas.id='bird-selection-canvas';this.canvas.hidden=true;
  document.querySelector('.binocular-overlay').append(this.canvas);this.ctx=this.canvas.getContext('2d');
  this.cutout=document.createElement('canvas');this.active=false;this.revision=0;this.history=[];
  this.canvas.addEventListener('pointerdown',e=>this.pointerDown(e));
  this.canvas.addEventListener('pointermove',e=>this.pointerMove(e));
  for(const type of ['pointerup','pointercancel'])this.canvas.addEventListener(type,e=>this.pointerUp(e));
  this.canvas.addEventListener('contextmenu',e=>e.preventDefault());
  for(const mode of ['point','exclude','box','brush','erase'])$(`bird-${mode}`).addEventListener('click',()=>this.setMode(mode));
  $('bird-undo').addEventListener('click',()=>this.undo());
  $('bird-reset').addEventListener('click',()=>this.reset());
  $('bird-candidate').addEventListener('click',()=>this.nextCandidate());
  $('bird-confirm').addEventListener('click',()=>this.confirm());
  $('bird-cancel').addEventListener('click',()=>{this.hide();this.onCancel();});
 }
 status(text){$('bird-selection-status').textContent=text;}
 async open(){
  this.active=true;this.canvas.hidden=false;this.toolTray.setMode('selection');this.toolTray.setExpanded(true);
  this.setMode('point');this.status('LOADING IMAGE…');this.points=[];this.box=null;this.history=[];this.mask=null;this.result=null;
  this.image=await loadImage(BIRD_SOURCE_URL);
  if(!this.active)return;
  this.width=this.image.naturalWidth;this.height=this.image.naturalHeight;
  this.cutout.width=this.width;this.cutout.height=this.height;
  this.mask=new Uint8Array(this.width*this.height);this.points=SAMPLE_POINTS.map(p=>({...p}));
  this.draw();await this.predict();
 }
 hide(){this.active=false;this.revision++;this.canvas.hidden=true;this.down=null;this.busy=false;this.saving=false;}
 setMode(mode){this.mode=mode;for(const name of ['point','exclude','box','brush','erase'])$(`bird-${name}`).setAttribute('aria-pressed',String(mode===name));}
 layout(){
  const radius=Math.min(innerWidth*.26,innerHeight*.46),offset=radius*.70;
  const height=radius*1.60,width=height*this.width/this.height;
  this.rect={x:innerWidth/2-offset-width/2,y:innerHeight/2-height/2,width,height};
  this.preview={...this.rect,x:innerWidth/2+offset-width/2};
 }
 local(e){
  this.layout();const r=this.rect;
  const x=(e.clientX-r.x)/r.width*this.width,y=(e.clientY-r.y)/r.height*this.height;
  return x>=0&&y>=0&&x<this.width&&y<this.height?{x,y}:null;
 }
 remember(){this.history.push({mask:this.mask.slice(),points:this.points.map(p=>({...p})),box:this.box?.slice()??null});if(this.history.length>20)this.history.shift();}
 undo(){
  const previous=this.history.pop();if(!previous||this.saving)return;
  this.revision++;this.busy=false;Object.assign(this,previous);this.updateCutout();this.status('LEFT: SELECT · RIGHT: PREVIEW');this.draw();
 }
 reset(){
  if(!this.mask||this.saving)return;
  this.remember();this.revision++;this.busy=false;this.mask.fill(0);this.points=[];this.box=null;this.result=null;
  this.status('CLICK OR BOX THE BIRD');this.updateCutout();this.draw();
 }
 pointerDown(e){
  if(!this.active||!this.mask||this.saving)return;
  const p=this.local(e);if(!p)return;e.preventDefault();this.canvas.setPointerCapture(e.pointerId);this.remember();
  this.down={...p,last:p};
  if(this.mode==='brush'||this.mode==='erase'){
   this.revision++;this.busy=false;this.paint(p,p);this.updateCutout();this.draw();
  }else if(this.mode!=='box'){
   this.points.push({...p,label:this.mode==='exclude'||e.button===2?0:1});this.predict();this.draw();
  }
 }
 pointerMove(e){
  if(!this.down||!this.active)return;const p=this.local(e);if(!p)return;
  if(this.mode==='brush'||this.mode==='erase'){this.paint(this.down.last,p);this.updateCutout();}
  else if(this.mode==='box')this.box=[Math.min(this.down.x,p.x),Math.min(this.down.y,p.y),Math.max(this.down.x,p.x),Math.max(this.down.y,p.y)];
  this.down.last=p;this.draw();
 }
 pointerUp(e){
  if(!this.down)return;
  if(this.mode==='box'&&this.box&&this.box[2]-this.box[0]>8&&this.box[3]-this.box[1]>8){
   this.points=this.points.filter(p=>p.x>=this.box[0]&&p.x<=this.box[2]&&p.y>=this.box[1]&&p.y<=this.box[3]);this.predict();
  }
  this.down=null;if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);
 }
 paint(a,b){
  const radius=8,steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/3)),value=this.mode==='erase'?0:255;
  for(let t=0;t<=steps;t++){
   const px=a.x+(b.x-a.x)*t/steps,py=a.y+(b.y-a.y)*t/steps;
   for(let y=Math.max(0,Math.floor(py-radius));y<Math.min(this.height,py+radius);y++)for(let x=Math.max(0,Math.floor(px-radius));x<Math.min(this.width,px+radius);x++)
    if((x-px)**2+(y-py)**2<=radius**2)this.mask[y*this.width+x]=value;
  }
  this.status('CORRECTION ADDED · CHECK PREVIEW');
 }
 async predict(){
  const version=++this.revision;this.busy=true;$('bird-confirm').disabled=true;
  try{
   const result=await this.segmentation.predict(BIRD_SOURCE_URL,this.points,this.box,text=>{if(this.active&&version===this.revision)this.status(text);});
   if(!this.active||version!==this.revision)return;
   this.result=result;this.candidate=result.scores.indexOf(Math.max(...result.scores));this.mask=result.candidates[this.candidate].slice();
   this.status('CHECK HEAD, BEAK & LEGS');this.updateCutout();
  }catch(error){if(this.active&&version===this.revision)this.status(`${error.message} · BRUSH / ERASE`);}
  finally{if(this.active&&version===this.revision){this.busy=false;this.draw();}}
 }
 nextCandidate(){
  if(!this.result||this.busy||this.saving)return;
  this.remember();this.candidate=(this.candidate+1)%this.result.candidates.length;this.mask=this.result.candidates[this.candidate].slice();
  this.status(`PREVIEW ${this.candidate+1} / ${this.result.candidates.length}`);this.updateCutout();this.draw();
 }
 updateCutout(){
  const c=this.cutout.getContext('2d',{willReadFrequently:true});c.clearRect(0,0,this.width,this.height);c.drawImage(this.image,0,0);
  const p=c.getImageData(0,0,this.width,this.height);for(let i=0;i<this.mask.length;i++)p.data[i*4+3]=this.mask[i];c.putImageData(p,0,0);
 }
 draw(){
  if(!this.active||!this.image)return;
  this.layout();const dpr=Math.min(devicePixelRatio||1,1.75);
  if(this.canvas.width!==Math.round(innerWidth*dpr)||this.canvas.height!==Math.round(innerHeight*dpr)){
   this.canvas.width=Math.round(innerWidth*dpr);this.canvas.height=Math.round(innerHeight*dpr);
  }
  const c=this.ctx;c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,innerWidth,innerHeight);
  c.fillStyle='rgba(0,0,0,.78)';c.fillRect(0,0,innerWidth,innerHeight);
  const r=this.rect,p=this.preview;c.drawImage(this.image,r.x,r.y,r.width,r.height);
  if(this.mask){
   for(let y=0;y<p.height;y+=12)for(let x=0;x<p.width;x+=12){c.fillStyle=(Math.floor(x/12)+Math.floor(y/12))%2?'#383838':'#505050';c.fillRect(p.x+x,p.y+y,Math.min(12,p.width-x),Math.min(12,p.height-y));}
   c.drawImage(this.cutout,p.x,p.y,p.width,p.height);
  }
  const scale=r.width/this.width;
  for(const point of this.points){const x=r.x+point.x*scale,y=r.y+point.y*scale;c.strokeStyle=point.label?'#fff':'#ff1515';c.lineWidth=1.5;c.beginPath();c.moveTo(x-4,y);c.lineTo(x+4,y);if(point.label){c.moveTo(x,y-4);c.lineTo(x,y+4);}c.stroke();}
  if(this.box){c.strokeStyle='#fff';c.lineWidth=1;c.strokeRect(r.x+this.box[0]*scale,r.y+this.box[1]*scale,(this.box[2]-this.box[0])*scale,(this.box[3]-this.box[1])*scale);}
  $('bird-confirm').disabled=this.busy||this.saving||!this.mask?.some(v=>v>0);
 }
 async confirm(){
  if(this.busy||this.saving||!this.mask?.some(v=>v>0))return;
  this.saving=true;this.status('PREPARING ORIGINAL CUTOUT…');this.draw();
  try{
   const asset=await createBirdAsset(this.image,this.mask,{points:this.points,box:this.box,model:this.result?.model??'manual alpha correction',timing:this.result?.timing??null});
   if(!this.active)return;
   const r=this.rect,crop=asset.crop,scale=r.width/this.width;
   await this.onConfirm(asset,{x:r.x+crop.x*scale,y:r.y+crop.y*scale,width:crop.width*scale,height:crop.height*scale},{image:this.image,rect:{...r}});
  }catch(error){this.status(error.message);this.saving=false;this.draw();}
 }
}
