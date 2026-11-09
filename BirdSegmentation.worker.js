import {env,SamModel,AutoProcessor,RawImage,Tensor} from '@huggingface/transformers';

let model,processor,embedding,processed,imageURL,sourceImage,region;
let queue=Promise.resolve();
self.onmessage=({data})=>{queue=queue.then(()=>run(data)).catch(error=>self.postMessage({id:data.id,error:'自动分割暂不可用，请重试，或使用补选和擦除。',details:error.message}));};
async function run({id,url,base,points,box}){
 const total=performance.now();
 if(!model){
  self.postMessage({id,status:'正在加载分割模型…'});
  env.allowLocalModels=true;env.allowRemoteModels=false;env.localModelPath=new URL('models/',base).href;
  env.backends.onnx.wasm.numThreads=1;
  env.backends.onnx.wasm.proxy=false;
  env.backends.onnx.wasm.wasmPaths=new URL('inference/',base).href;
  model=await SamModel.from_pretrained('slimsam-77-uniform',{device:'wasm',dtype:'q8'});
  processor=await AutoProcessor.from_pretrained('slimsam-77-uniform');
 }
 let encodingMs=0;
 const imageKey=JSON.stringify([url,box]);
 if(imageURL!==imageKey){
  self.postMessage({id,status:'正在读取包装图案…'});
  sourceImage=await RawImage.fromURL(url);
  region=box?box.map((v,i)=>Math.max(0,Math.min(Math.round(v),(i%2?sourceImage.height:sourceImage.width)-1))):[0,0,sourceImage.width-1,sourceImage.height-1];
  const image=box?await sourceImage.crop(region):sourceImage;
  processed=await processor(image);
  const start=performance.now();embedding=await model.get_image_embeddings(processed);encodingMs=performance.now()-start;
  imageURL=imageKey;
 }
 self.postMessage({id,status:'正在分离这只鸟…'});
 const [h,w]=processed.original_sizes[0],[rh,rw]=processed.reshaped_input_sizes[0];
 // SlimSAM's exported decoder accepts point prompts. A box defines the image
 // ROI, with all click coordinates translated into it before inference.
 const prompts=points.map(p=>[p.x-region[0],p.y-region[1],p.label]);
 if(!prompts.length&&box)prompts.push([w/2,h/2,1]);
 if(!prompts.length)throw new Error('请在鸟身上点一下，或框住整只鸟。');
 const start=performance.now();
 const output=await model({...embedding,
  input_points:new Tensor('float32',Float32Array.from(prompts.flatMap(([x,y])=>[x/w*rw,y/h*rh])),[1,1,prompts.length,2]),
  input_labels:new Tensor('int64',BigInt64Array.from(prompts.map(p=>BigInt(p[2]))),[1,1,prompts.length])});
 const masks=await processor.post_process_masks(output.pred_masks,processed.original_sizes,processed.reshaped_input_sizes);
 const raw=RawImage.fromTensor(masks[0][0]);
 const candidates=Array.from(output.iou_scores.data,(_,c)=>{
  const mask=new Uint8Array(sourceImage.width*sourceImage.height);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)mask[(y+region[1])*sourceImage.width+x+region[0]]=raw.data[(y*w+x)*raw.channels+c]?255:0;
  return mask;
 });
 self.postMessage({id,candidates,scores:Array.from(output.iou_scores.data),width:sourceImage.width,height:sourceImage.height,
  timing:{encodingMs,decodeMs:performance.now()-start,totalMs:performance.now()-total},model:'SlimSAM-77 q8 / WASM'},candidates.map(c=>c.buffer));
}
