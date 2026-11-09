import shelfURL from './assets/archive-shelf.png?url';
import bottleURL from './assets/archive-bottle.png?url';
import {referenceProducts as placeholders} from './ArchiveReferenceProducts.js';
const key='supermarket-product-archive-v1';
const catalogue={'bird-bottle-01':{name:'Bird-illustrated bottle',image:bottleURL,row:0},...Object.fromEntries(placeholders.map(item=>[item.id,item]))};
const seedKey='supermarket-product-shelf-seed';
const seedVersion='reference-png-1-12-v1';
const layoutKey='supermarket-product-shelf-layout-v1';
const shelfLevels=[.367,.512,.652,.79,.922];
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export class ProductArchive {
 constructor(){
  this.isOpen=false;this.items=[];this.catalogue={...catalogue};this.selected=null;
  try{const saved=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(saved))this.items=[...new Set(saved)].filter(id=>catalogue[id]&&!catalogue[id].placeholder);}catch{}
  let layout=null;try{const saved=JSON.parse(localStorage.getItem(layoutKey));if(Array.isArray(saved))layout=saved.filter(e=>e&&typeof e.id==='string'&&Number.isFinite(e.x)&&Number.isFinite(e.y)).map(e=>({...e,x:clamp(e.x,.04,.96),y:clamp(e.y,.235,.96),h:clamp(Number(e.h)||.112,.04,.25)}));}catch{}
  const referenceLayout=placeholders.map(({id,x,y,h})=>({id,x,y,h}));
  let seeded=false;try{seeded=localStorage.getItem(seedKey)===seedVersion;}catch{}
  if(!seeded){
   // Replace only the old demo arrangement. Keep uploaded products and user
   // placements of real discoveries when introducing this reference layout.
   const kept=(layout??this.items.map(id=>({id,x:.85,y:.79,h:.112}))).filter(e=>e.id.startsWith('upload-')||(catalogue[e.id]&&!catalogue[e.id].placeholder));
   this.entries=[...referenceLayout,...kept];
   try{localStorage.setItem(layoutKey,JSON.stringify(this.entries));localStorage.setItem(seedKey,seedVersion);}catch{}
  }else this.entries=layout??referenceLayout;
  // Add new supplied products once without resetting edited or removed items.
  try{
   if(localStorage.getItem('supermarket-shelf-extra-13-14')!=='v1'){
    for(const entry of referenceLayout.filter(e=>/^demo-ref-(13|14)-/.test(e.id)))if(!this.entries.some(e=>e.id===entry.id))this.entries.push(entry);
    localStorage.setItem(layoutKey,JSON.stringify(this.entries));localStorage.setItem('supermarket-shelf-extra-13-14','v1');
   }
  }catch{}
  this.root=document.createElement('section');this.root.id='product-archive';this.root.hidden=true;this.root.setAttribute('aria-label','商品 Archive 货架');
  this.root.innerHTML=`<button class="product-archive-backdrop" aria-label="关闭商品货架"></button><div class="archive-shelf-stage"><img class="archive-shelf-art" src="${shelfURL}" alt="Supermarket Birding Archive 商品货架"/><div class="archive-product-layer"></div><div class="archive-editor"><button class="archive-add" aria-label="增加商品" title="增加商品">+</button><button class="archive-remove" aria-label="移除选中的商品" title="移除选中的商品" disabled>−</button><input class="archive-file-input" type="file" accept="image/*" multiple hidden/></div><button class="archive-shelf-close" aria-label="关闭商品货架">×</button><output class="archive-edit-status" role="status">拖动调整位置 · 选择商品后可移除</output></div><aside class="archive-product-preview" hidden><img alt=""/><p></p></aside>`;
  document.getElementById('app').append(this.root);
  this.stage=this.root.querySelector('.archive-shelf-stage');this.layer=this.root.querySelector('.archive-product-layer');this.preview=this.root.querySelector('.archive-product-preview');this.status=this.root.querySelector('.archive-edit-status');
  this.removeButton=this.root.querySelector('.archive-remove');this.addButton=this.root.querySelector('.archive-add');this.fileInput=this.root.querySelector('.archive-file-input');
  this.root.querySelector('.product-archive-backdrop').addEventListener('click',()=>this.hide());
  this.root.querySelector('.archive-shelf-close').addEventListener('click',()=>this.hide());
  this.addButton.addEventListener('click',()=>this.fileInput.click());
  this.fileInput.addEventListener('change',()=>{this.addFiles([...this.fileInput.files]);this.fileInput.value='';});
  this.removeButton.addEventListener('click',()=>this.removeSelected());
  window.addEventListener('resize',()=>{if(this.isOpen)this.positionPreview();});
  this.toolsObserver=new ResizeObserver(()=>{if(this.isOpen)this.positionPreview();});
  this.toolsObserver.observe(document.getElementById('habitat-tools'));
  this.render();this.ready=this.restoreUploads();
 }
 database(){
  if(!this.dbPromise)this.dbPromise=new Promise((resolve,reject)=>{
   const request=indexedDB.open('supermarket-product-shelf-v1',1);
   request.onupgradeneeded=()=>request.result.createObjectStore('uploads',{keyPath:'id'});
   request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });return this.dbPromise;
 }
 async restoreUploads(){
  try{
   const db=await this.database();
   const records=await new Promise((resolve,reject)=>{const r=db.transaction('uploads').objectStore('uploads').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
   for(const item of records)this.catalogue[item.id]={...item,image:URL.createObjectURL(item.blob),custom:true};
   this.render();
  }catch{this.status.textContent='图片存储不可用；现有商品仍可移动。';}
 }
 saveLayout(){
  try{localStorage.setItem(layoutKey,JSON.stringify(this.entries));this.status.textContent='位置已保存 · 拖动可继续调整';return true;}
  catch{this.status.textContent='本次修改未能保存，请检查浏览器存储空间。';return false;}
 }
 nextPosition(){
  for(const y of shelfLevels)for(let column=0;column<6;column++){
   const x=.16+column*.12;if(!this.entries.some(e=>Math.abs(e.x-x)<.08&&Math.abs(e.y-y)<.055))return {x,y};
  }return {x:.5,y:.922};
 }
 record(id){
  if(!catalogue[id]||catalogue[id].placeholder||this.items.includes(id))return;
  this.items.push(id);try{localStorage.setItem(key,JSON.stringify(this.items));}catch{}
  this.entries.push({id,...this.nextPosition(),h:.112});this.saveLayout();this.render();
 }
 async addFiles(files){
  if(this.adding)return;this.adding=true;this.addButton.disabled=true;
  let added=0,saved=true;
  try{
   await this.ready;
   for(const file of files){
    if(!file.type.startsWith('image/'))continue;
    const id=`upload-${crypto.randomUUID()}`,url=URL.createObjectURL(file);
    try{
     const image=new Image();image.src=url;await image.decode();
     const item={id,name:file.name,blob:file,aspect:image.naturalWidth/image.naturalHeight};
     const db=await this.database();
     await new Promise((resolve,reject)=>{const tx=db.transaction('uploads','readwrite');tx.objectStore('uploads').put(item);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
     this.catalogue[id]={...item,image:url,custom:true};this.entries.push({id,...this.nextPosition(),h:.112});
     saved=this.saveLayout()&&saved;this.render();this.select(id);added++;
    }catch(error){URL.revokeObjectURL(url);console.error('Product image import failed',error);this.status.textContent=`无法添加 ${file.name}，请使用有效的图片并检查存储空间。`;}
   }
   if(added&&saved)this.status.textContent=`已添加 ${added} 个商品，可直接拖动。`;
  }finally{this.adding=false;this.addButton.disabled=false;}
 }
 async removeSelected(){
  const id=this.selected;if(!id||this.removing)return;
  this.removing=true;this.removeButton.disabled=true;
  try{
   const item=this.catalogue[id];
   if(item?.custom){const db=await this.database();await new Promise((resolve,reject)=>{const tx=db.transaction('uploads','readwrite');tx.objectStore('uploads').delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});URL.revokeObjectURL(item.image);delete this.catalogue[id];}
   this.entries=this.entries.filter(e=>e.id!==id);this.selected=null;this.preview.hidden=true;const saved=this.saveLayout();this.render();if(saved)this.status.textContent='商品已从货架移除';
  }catch(error){console.error(error);this.status.textContent='移除失败，请重试。';}
  finally{this.removing=false;this.removeButton.disabled=!this.selected;}
 }
 positionButton(button,entry){button.style.left=`${entry.x*100}%`;button.style.top=`${entry.y*100}%`;button.style.height=`${entry.h*100}%`;}
 startDrag(event,entry,button){
  if(event.button!==0||this.drag)return;
  event.preventDefault();this.select(entry.id);button.setPointerCapture(event.pointerId);
  this.drag={entry,button,pointerId:event.pointerId,x:event.clientX,y:event.clientY,originalX:entry.x,originalY:entry.y,moved:false};
 }
 moveDrag(event){
  const drag=this.drag;if(!drag||event.pointerId!==drag.pointerId)return;
  const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(!drag.moved&&Math.hypot(dx,dy)<4)return;
  drag.moved=true;const bounds=this.stage.getBoundingClientRect();
  drag.entry.x=clamp(drag.originalX+dx/bounds.width,.04,.96);drag.entry.y=clamp(drag.originalY+dy/bounds.height,.235,.96);
  drag.button.classList.add('dragging');this.positionButton(drag.button,drag.entry);
 }
 endDrag(commit=true){
  const drag=this.drag;if(!drag)return;this.drag=null;
  if(!commit){drag.entry.x=drag.originalX;drag.entry.y=drag.originalY;this.positionButton(drag.button,drag.entry);}
  else if(drag.moved){this.saveLayout();this.ignoreClickUntil=performance.now()+250;}
  drag.button.classList.remove('dragging');if(drag.button.hasPointerCapture(drag.pointerId))drag.button.releasePointerCapture(drag.pointerId);
 }
 render(){
  this.layer.replaceChildren();
  for(const entry of this.entries){const item=this.catalogue[entry.id];if(!item)continue;
   const button=document.createElement('button');button.className='archive-product';button.dataset.productId=entry.id;
   button.setAttribute('aria-label',`${item.name}，拖动或用方向键移动`);button.setAttribute('aria-pressed',String(this.selected===entry.id));
   const relativeWidth=entry.h*2556/2100*(item.aspect??.625);
   button.style.width=`${(item.bounds?relativeWidth:clamp(relativeWidth,.045,.19))*100}%`;this.positionButton(button,entry);
   const image=document.createElement('img');image.src=item.image;image.alt=item.name;image.draggable=false;
   if(item.bounds){
    const [left,top,right,bottom]=item.bounds,w=right-left,h=bottom-top;
    // Offset transparent canvas margins in CSS; leave all source pixels intact.
    image.style.cssText=`position:absolute;left:${-left/w*100}%;top:${-top/h*100}%;width:${item.nativeWidth/w*100}%;height:${item.nativeHeight/h*100}%;max-width:none`;
   }
   button.append(image);
   button.addEventListener('click',()=>{if(performance.now()>(this.ignoreClickUntil??0))this.select(entry.id);});
   button.addEventListener('pointerdown',event=>this.startDrag(event,entry,button));
   button.addEventListener('pointermove',event=>this.moveDrag(event));
   button.addEventListener('pointerup',()=>this.endDrag());button.addEventListener('pointercancel',()=>this.endDrag(false));
   button.addEventListener('lostpointercapture',()=>{if(this.drag?.button===button)this.endDrag(false);});
   button.addEventListener('keydown',event=>{
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
     event.preventDefault();this.select(entry.id);const step=event.shiftKey ? .03 : .01;
     entry.x=clamp(entry.x+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0),.04,.96);
     entry.y=clamp(entry.y+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0),.235,.96);
     this.positionButton(button,entry);this.saveLayout();
    }else if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();this.select(entry.id);this.removeSelected();}
   });this.layer.append(button);
  }
  this.removeButton.disabled=!this.selected;
 }
 select(id){
  const item=this.catalogue[id];if(!item)return;this.selected=id;this.removeButton.disabled=false;
  this.preview.hidden=false;const image=this.preview.querySelector('img');image.src=item.image;image.alt=item.name;
  this.preview.querySelector('p').textContent=item.name;
  this.root.querySelectorAll('.archive-product').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.productId===id)));this.positionPreview();
 }
 positionPreview(){
  const tools=document.getElementById('habitat-tools').getBoundingClientRect(),app=document.getElementById('app').getBoundingClientRect();
  const top=tools.bottom-app.top+12,available=Math.max(0,app.height-top-18);
  this.root.style.setProperty('--archive-preview-top',`${top}px`);
  this.root.style.setProperty('--archive-preview-left',`${tools.left-app.left}px`);
  this.root.style.setProperty('--archive-preview-height',`${Math.min(innerHeight*.38,380,available)}px`);
 }
 open(){this.isOpen=true;this.root.hidden=false;document.getElementById('app').classList.add('product-archive-open');this.positionPreview();}
 hide(){this.endDrag(false);this.isOpen=false;this.root.hidden=true;this.preview.hidden=true;document.getElementById('app').classList.remove('product-archive-open');}
 toggle(){if(this.isOpen)this.hide();else this.open();}
}
