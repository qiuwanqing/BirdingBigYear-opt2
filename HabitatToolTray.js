// This lives directly under #app, outside every optical/scene stacking context.
export class HabitatToolTray {
 constructor(){
  this.root=document.getElementById('habitat-tools');
  this.toggle=document.getElementById('tools-toggle');
  this.panel=document.getElementById('tools-panel');
  this.expanded=false;
  // Keep the menu open until explicitly toggled or clicked outside.
  this.toggle.addEventListener('click',()=>this.setExpanded(!this.expanded));
  window.addEventListener('pointerdown',e=>{
   if(!this.root.contains(e.target))this.setExpanded(false);
  });
  this.setMode('habitat');this.setInside(false);
 }
 setExpanded(value){
  this.expanded=value;
  if(!value&&this.panel.contains(document.activeElement))this.toggle.focus({preventScroll:true});
  this.toggle.setAttribute('aria-expanded',String(value));
  this.root.classList.toggle('expanded',value);
  this.panel.hidden=!value;this.panel.inert=!value;
 }
 setMode(mode){
  for(const group of this.panel.querySelectorAll('[data-tool-mode]')){
   group.hidden=group.dataset.toolMode!==mode;
   group.inert=group.hidden;
  }
 }
 setInside(value){
  this.root.hidden=!value;this.root.inert=!value;
  if(!value)this.setExpanded(false);
 }
}
