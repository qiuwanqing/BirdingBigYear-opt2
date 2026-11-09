// Model downloads and CPU inference start only after a selection, in a worker.
export class BirdSegmentation {
 constructor(){this.pending=new Map();this.nextId=0;}
 predict(url,points,box,onStatus){
  if(!this.worker){
   this.worker=new Worker(new URL('./BirdSegmentation.worker.js',import.meta.url),{type:'module'});
   this.worker.onmessage=({data})=>{
    const request=this.pending.get(data.id);if(!request)return;
    if(data.status){request.onStatus?.(data.status);return;}
    this.pending.delete(data.id);
    if(data.details)console.warn('Bird segmentation:',data.details);
    data.error?request.reject(new Error(data.error)):request.resolve(data);
   };
   this.worker.onerror=()=>{
    for(const p of this.pending.values())p.reject(new Error('自动分割暂不可用，可以重试，或使用补选和擦除。'));
    this.pending.clear();this.worker.terminate();this.worker=null;
   };
  }
  const id=++this.nextId;
  return new Promise((resolve,reject)=>{
   this.pending.set(id,{resolve,reject,onStatus});
   this.worker.postMessage({id,url,points,box,base:new URL(import.meta.env.BASE_URL,location.origin).href});
  });
 }
}
