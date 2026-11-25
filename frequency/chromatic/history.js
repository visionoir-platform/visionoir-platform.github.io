import * as T from 'three';

// Bounded, two-tap GPU history used only by the scenes with optical persistence.
// Targets never contain camera input; only this renderer's own scene is sampled.
export function makeHistory(renderer){
 const cam=new T.OrthographicCamera(-1,1,1,-1,0,1),stage=new T.Scene(),geo=new T.PlaneGeometry(2,2);
 const blend=new T.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{frame:{value:null},history:{value:null},decay:{value:.55}},
  vertexShader:'varying vec2 v; void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader:`uniform sampler2D frame,history; uniform float decay; varying vec2 v;
    void main(){vec4 fresh=texture2D(frame,v),old=texture2D(history,(v-.5)*.995+.5);
    gl_FragColor=vec4(max(fresh.rgb,old.rgb*decay),max(fresh.a,old.a*decay));}`});
 const screen=new T.MeshBasicMaterial({transparent:true,depthTest:false,depthWrite:false,toneMapped:false}),plane=new T.Mesh(geo,blend);stage.add(plane);
 let read,write,current,w=0,h=0;
 function release(){for(const rt of [current,read,write])rt?.dispose();read=write=current=null;}
 function render(scene,camera,width,height,strength){
  const f=Math.min(1,580/Math.max(width,height)),nw=Math.max(1,Math.round(width*f)),nh=Math.max(1,Math.round(height*f));
  if(!current||nw!==w||nh!==h){
   release();w=nw;h=nh;
   current=new T.WebGLRenderTarget(w,h);read=new T.WebGLRenderTarget(w,h,{depthBuffer:false});write=read.clone();
   renderer.setRenderTarget(read);renderer.clear();
  }
  renderer.setRenderTarget(current);renderer.render(scene,camera);
  blend.uniforms.frame.value=current.texture;blend.uniforms.history.value=read.texture;blend.uniforms.decay.value=strength;
  plane.material=blend;renderer.setRenderTarget(write);renderer.render(stage,cam);
  renderer.setRenderTarget(null);screen.map=write.texture;plane.material=screen;renderer.render(stage,cam);
  [read,write]=[write,read];
 }
 return {render,release,dispose(){release();geo.dispose();screen.dispose();blend.dispose();}};
}
