import {loadBirdSilhouettes} from './BirdSilhouette.js';
const DB_NAME='supermarket-birding-assets',STORE='sightings';
export const BIRD_SOURCE_URL=new URL('./assets/bird1-source.png',import.meta.url).href;
export const loadImage=url=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('鸟的原始图片加载失败。'));image.src=url;});
const blobFromCanvas=canvas=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG 导出失败。')),'image/png'));
export async function sha256(blob){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');}

// The original label remains the evidence; the flight artwork is a separate,
// deliberately simplified silhouette. No segmentation is required to release it.
export async function createSilhouetteBirdAsset(){
 const [{standing},source]=await Promise.all([loadBirdSilhouettes(),fetch(BIRD_SOURCE_URL).then(r=>{if(!r.ok)throw new Error('原图读取失败。');return r.blob();})]);
 const canvas=document.createElement('canvas');canvas.width=standing.naturalWidth;canvas.height=standing.naturalHeight;
 canvas.getContext('2d').drawImage(standing,0,0);
 const png=await blobFromCanvas(canvas),cutoutURL=URL.createObjectURL(png),bitmap=await loadImage(cutoutURL);
 const original=await createImageBitmap(source),sourceSize={width:original.width,height:original.height};original.close();
 return {id:crypto.randomUUID(),capturedAt:new Date().toISOString(),productId:'bird-bottle-01',product:'Bird-illustrated bottle',sourceName:'bird1-source.png',
  source,png,mask:null,renderStyle:'silhouette-v1',model:'authored bottle-bird silhouette',sourceSha256:await sha256(source),assetSha256:await sha256(png),
  crop:{x:0,y:0,width:canvas.width,height:canvas.height},sourceSize,cutoutURL,bitmap};
}

export async function createBirdAsset(image,mask,{points=[],box=null,model='manual',timing=null}={}){
 const width=image.naturalWidth,height=image.naturalHeight;
 const sourceCanvas=document.createElement('canvas');sourceCanvas.width=width;sourceCanvas.height=height;
 const context=sourceCanvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
 const original=context.getImageData(0,0,width,height);
 let x0=width,y0=height,x1=-1,y1=-1;
 for(let i=0;i<mask.length;i++)if(mask[i]>0){const x=i%width,y=Math.floor(i/width);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
 if(x1<x0)throw new Error('请先选中鸟，再确认放飞。');
 x0=Math.max(0,x0-3);y0=Math.max(0,y0-3);x1=Math.min(width-1,x1+3);y1=Math.min(height-1,y1+3);
 const cutout=document.createElement('canvas');cutout.width=x1-x0+1;cutout.height=y1-y0+1;
 const ctx=cutout.getContext('2d'),pixels=ctx.createImageData(cutout.width,cutout.height);
 for(let y=0;y<cutout.height;y++)for(let x=0;x<cutout.width;x++){
  const from=(y+y0)*width+x+x0,to=(y*cutout.width+x)*4;
  // The segmentation changes alpha only. Every RGB value comes from bird1.png.
  pixels.data[to]=original.data[from*4];pixels.data[to+1]=original.data[from*4+1];pixels.data[to+2]=original.data[from*4+2];
  pixels.data[to+3]=mask[from];
 }
 ctx.putImageData(pixels,0,0);
 const maskCanvas=document.createElement('canvas');maskCanvas.width=width;maskCanvas.height=height;
 const mc=maskCanvas.getContext('2d'),mp=mc.createImageData(width,height);
 for(let i=0;i<mask.length;i++){mp.data[i*4]=mp.data[i*4+1]=mp.data[i*4+2]=mask[i];mp.data[i*4+3]=255;}mc.putImageData(mp,0,0);
 const [source,alphaMask,png]=await Promise.all([fetch(BIRD_SOURCE_URL).then(r=>{if(!r.ok)throw new Error('原图读取失败。');return r.blob();}),blobFromCanvas(maskCanvas),blobFromCanvas(cutout)]);
 const cutoutURL=URL.createObjectURL(png),bitmap=await loadImage(cutoutURL);
 return {id:crypto.randomUUID(),capturedAt:new Date().toISOString(),productId:'bird-bottle-01',product:'Bird-illustrated bottle',sourceName:'bird1.png',
  source,mask:alphaMask,png,sourceSha256:await sha256(source),assetSha256:await sha256(png),crop:{x:x0,y:y0,width:cutout.width,height:cutout.height},
  sourceSize:{width,height},prompts:{points,box},model,timing,cutoutURL,bitmap};
}

export class BirdCollection {
 constructor(){this.items=[];}
 async database(){
  if(!this.dbPromise)this.dbPromise=new Promise((resolve,reject)=>{
   const request=indexedDB.open(DB_NAME,1);
   request.onupgradeneeded=()=>request.result.createObjectStore(STORE,{keyPath:'id'});
   request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });return this.dbPromise;
 }
 async load(){
  const db=await this.database();
  const records=await new Promise((resolve,reject)=>{const request=db.transaction(STORE).objectStore(STORE).getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  this.items=await Promise.all(records.sort((a,b)=>a.capturedAt.localeCompare(b.capturedAt)).map(async item=>{
   item.cutoutURL=URL.createObjectURL(item.png);item.bitmap=await loadImage(item.cutoutURL);return item;
  }));return this.items;
 }
 async add(asset){
  if(this.items.some(item=>item.id===asset.id))return;
  const i=this.items.length;
  asset.sightingId=`SIGHTING ${String(i+1).padStart(3,'0')}`;
  asset.skyPosition={azimuth:(i%5-2)*.16,elevation:.10+Math.floor(i/5)*.08};
  const {bitmap,cutoutURL,...stored}=asset;
  const db=await this.database();
  await new Promise((resolve,reject)=>{const transaction=db.transaction(STORE,'readwrite');transaction.objectStore(STORE).put(stored);transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);});
  this.items.push(asset);
 }
 async remove(id){
  const db=await this.database();
  await new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new Error('删除失败。'));
  });
  const asset=this.items.find(item=>item.id===id);
  for(const url of [asset?.cutoutURL,asset?.sourceURL])if(url)URL.revokeObjectURL(url);
  this.items=this.items.filter(item=>item.id!==id);
 }
 async clear(){
  const db=await this.database();
  await new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).clear();
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new Error('清空失败。'));
  });
  for(const asset of this.items)for(const url of [asset.cutoutURL,asset.sourceURL])if(url)URL.revokeObjectURL(url);
  this.items=[];
 }
}
