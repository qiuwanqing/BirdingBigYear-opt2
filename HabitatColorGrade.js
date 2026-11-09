// Shared by the visible scan surfaces and their UV-colored point samples.
// Lines, geometry, alpha/edge dissolution, the entrance and bird assets bypass it.
// Original bypasses this entire transform, retaining the renderer's exposure/ACES.
export const VINTAGE_PRESET={exposure:.15,temperature:.42,tint:-.08,saturation:1.02,contrast:.94,grain:.008};
const parameters=[
 ['exposure','Exposure',-1.5,1.5,.05],['temperature','Temperature',-1,1,.02],
 ['tint','Tint',-1,1,.02],['saturation','Saturation',0,1.5,.02],
 ['contrast','Contrast',.5,1.5,.02],['grain','Grain',0,.06,.002]
];

export const scanGradeGLSL=`
 uniform float uGradeEnabled,uGradeExposure,uGradeTemperature,uGradeTint;
 uniform float uGradeSaturation,uGradeContrast,uGradeGrain,uGradeTime,uGradePixelRatio;
 uniform float uPrintEnabled,uPrintSize,uPrintStrength;
 uniform vec2 uPrintTextureSize;
 float scanInkDot(vec2 p,float ink,float angle){
  float cs=cos(angle),sn=sin(angle);
  vec2 grid=mat2(cs,-sn,sn,cs)*p;
  float aa=max(length(fwidth(grid))*.5,.025);
  float radius=sqrt(clamp(ink,0.,1.)/3.141593);
  float dots=1.-smoothstep(radius-aa,radius+aa,length(fract(grid)-.5));
  // Average subpixel dots instead of allowing distant textures to shimmer.
  return mix(dots,ink,smoothstep(.3,.8,length(fwidth(grid))));
 }
 vec3 printScanColor(vec3 original,vec2 uv){
  if(uPrintEnabled<.5||uGradeEnabled<.5)return original;
  vec3 c=pow(max(original,vec3(0.)),vec3(1./2.2));
  vec3 bounded=clamp(c,0.,1.);
  float k=(1.-max(bounded.r,max(bounded.g,bounded.b)))*.8;
  vec3 ink=clamp((1.-bounded-k)/max(1.-k,.001),0.,1.);
  vec2 p=uv*uPrintTextureSize/uPrintSize;
  vec3 dots=vec3(scanInkDot(p,ink.r,.2618),scanInkDot(p+vec2(.08,-.08),ink.g,1.309),scanInkDot(p,ink.b,0.));
  float black=scanInkDot(p,k,.7854);
  vec3 paper=vec3(1.,.978,.91);
  vec3 printed=paper*(1.-dots*.94)*(1.-black*.96);
  printed+=max(c-1.,vec3(0.));
  return pow(max(mix(c,printed,uPrintStrength),vec3(0.)),vec3(2.2));
 }
 float scanFilmNoise(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 vec3 gradeScanColor(vec3 original){
  if(uGradeEnabled<.5)return original;
  vec3 c=max(original,vec3(0.))*exp2(uGradeExposure);
  float luminance=dot(c,vec3(.2126,.7152,.0722));
  float shadows=1.-smoothstep(.035,.38,luminance);
  float highlights=smoothstep(.16,.85,luminance);
  // Protect red packaging; concentrate fluorescent warmth in neutral mid/high tones.
  float redMask=smoothstep(.02,.22,c.r-max(c.g,c.b));
  float warmWeight=mix(.25,1.,smoothstep(.025,.45,luminance))*(1.-.65*redMask);
  c*=exp2(vec3(.20,.10,-.32)*uGradeTemperature*warmWeight);
  c*=exp2(vec3(.12,-.22,.12)*uGradeTint);
  // Gently reduce electric blue/cyan chroma without flattening other products.
  float coolMask=smoothstep(.015,.18,min(c.g,c.b)-c.r);
  coolMask=max(coolMask,smoothstep(.02,.20,c.b-max(c.r,c.g)));
  c=mix(c,vec3(dot(c,vec3(.2126,.7152,.0722))),coolMask*.16);
  c*=mix(vec3(1.),vec3(1.035,1.025,.955),highlights*(1.-redMask));
  float gray=dot(c,vec3(.2126,.7152,.0722));
  c=mix(vec3(gray),c,uGradeSaturation);
  // Contrast and fine grain in display-like space rather than crushing linear shadows.
  c=pow(max(c,vec3(0.)),vec3(1./2.2));
  c=(c-.42)*uGradeContrast+.42;
  c+=vec3(.009,.010,.007)*shadows;
  c=c/(vec3(1.)+max(c-.68,vec3(0.))*.12);
  vec2 grainPixel=floor(gl_FragCoord.xy/max(uGradePixelRatio,1.));
  float noise=scanFilmNoise(grainPixel+floor(uGradeTime*24.)*vec2(17.,53.))-.5;
  c+=noise*uGradeGrain*(.7+.3*shadows);
  return pow(max(c,vec3(0.)),vec3(2.2));
 }
`;

export class HabitatColorGrade {
 constructor(){
  this.values={...VINTAGE_PRESET};this.mode='Vintage';this.visible=false;
  this.uniforms={uGradeEnabled:{value:1},uGradeTime:{value:0},uGradePixelRatio:{value:1},uPrintEnabled:{value:0},uPrintSize:{value:3},uPrintStrength:{value:.45}};
  for(const [name] of parameters)this.uniforms[`uGrade${name[0].toUpperCase()+name.slice(1)}`]={value:this.values[name]};
  this.compiledSurfaces=0;
 }
 setMode(mode){
  this.mode=mode;this.uniforms.uGradeEnabled.value=mode==='Vintage'?1:0;
  for(const button of this.element?.querySelectorAll('[data-grade-mode]')??[])button.setAttribute('aria-pressed',String(button.dataset.gradeMode===mode));
  if(this.summary)this.summary.textContent=`COLOR · ${mode.toUpperCase()}`;
 }
 set(name,value){
  const definition=parameters.find(p=>p[0]===name);if(!definition)return;
  value=Math.max(definition[2],Math.min(definition[3],Number(value)));if(!Number.isFinite(value))return;
  this.values[name]=value;this.uniforms[`uGrade${name[0].toUpperCase()+name.slice(1)}`].value=value;
  this.setMode('Vintage');
  if(this.element){this.element.querySelector(`[data-grade-input="${name}"]`).value=String(value);this.element.querySelector(`[data-grade-value="${name}"]`).textContent=this.format(name,value);}
 }
 format(name,value){return name==='grain'?value.toFixed(3):value.toFixed(2);}
 mount(parent){
  const panel=document.createElement('details');panel.id='habitat-color-panel';panel.open=true;panel.hidden=true;
  const summary=document.createElement('summary');panel.append(summary);this.summary=summary;
  const body=document.createElement('div');body.className='grade-body';panel.append(body);
  const modes=document.createElement('div');modes.className='grade-modes';body.append(modes);
  for(const mode of ['Original','Vintage']){
   const button=document.createElement('button');button.textContent=mode;button.dataset.gradeMode=mode;button.addEventListener('click',()=>this.setMode(mode));modes.append(button);
  }
  for(const [name,label,min,max,step] of parameters){
   const row=document.createElement('label');row.className='grade-row';
   const text=document.createElement('span');text.textContent=label;
   const value=document.createElement('output');value.dataset.gradeValue=name;value.textContent=this.format(name,this.values[name]);
   const input=document.createElement('input');input.type='range';input.min=min;input.max=max;input.step=step;input.value=this.values[name];input.dataset.gradeInput=name;input.setAttribute('aria-label',label);
   input.addEventListener('input',()=>this.set(name,input.value));row.append(text,value,input);body.append(row);
  }
  const reset=document.createElement('button');reset.textContent='RESET VINTAGE';reset.addEventListener('click',()=>{for(const [name,value] of Object.entries(VINTAGE_PRESET))this.set(name,value);});body.append(reset);
  const printLabel=document.createElement('label');printLabel.className='grade-row';
  const toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=Boolean(this.uniforms.uPrintEnabled.value);
  toggle.addEventListener('change',()=>{this.uniforms.uPrintEnabled.value=Number(toggle.checked);if(toggle.checked)this.setMode('Vintage');});
  printLabel.append('PRINT · HALFTONE',toggle);body.append(printLabel);
  for(const [key,label,min,max,step] of [['uPrintSize','Dot size',1,8,.25],['uPrintStrength','Print strength',0,1,.02]]){
   const row=document.createElement('label');row.className='grade-row';
   const text=document.createElement('span');text.textContent=label;
   const output=document.createElement('output');output.textContent=this.uniforms[key].value.toFixed(2);
   const input=document.createElement('input');input.type='range';input.min=min;input.max=max;input.step=step;input.value=this.uniforms[key].value;input.setAttribute('aria-label',label);
   input.addEventListener('input',()=>{this.uniforms[key].value=Number(input.value);output.textContent=Number(input.value).toFixed(2);this.setMode('Vintage');});
   row.append(text,output,input);body.append(row);
  }
  panel.addEventListener('pointerenter',()=>{this.hovered=true;});panel.addEventListener('pointerleave',()=>{this.hovered=false;});
  parent.append(panel);this.element=panel;this.setMode(this.mode);
 }
 setVisible(value){if(this.visible===value)return;this.visible=value;if(this.element)this.element.hidden=!value;}
 get interacting(){return this.visible&&(this.hovered||this.element?.contains(document.activeElement));}
 update(renderer){this.uniforms.uGradeTime.value=performance.now()/1000;this.uniforms.uGradePixelRatio.value=renderer.getPixelRatio();}
}
