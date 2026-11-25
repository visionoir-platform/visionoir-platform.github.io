import { logoPolarityFragment } from '../../src/logo-polarity.js';

// Shared rest-space field: mesh and surface samples travel through identical coordinates.
export const common = `
uniform float uTime, uMode, uNext, uMix, uActive, uWarp, uNoise, uDist, uCut, uSize, uPhase, uDepth, uEcho, uParticle, uRefract, uReflect, uLight, uCreator;
uniform vec4 uSound;
uniform float uVoices[16];
uniform float uBuses[6];
uniform vec3 uTint;
uniform sampler2D uAlbedo;
varying vec2 vUV;
varying vec3 vP,vN,vObj;
varying float vField,vSeed,vCut;
float hash(vec3 p){return fract(sin(dot(p,vec3(17.17,81.13,31.31)))*43758.5453);}
float field(vec3 p){
 vec3 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
 return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
mat2 turn(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float is(float a,float b){return 1.-step(.5,abs(a-b));}
float amount(float mode){return mix(is(mode,uMode),is(mode,uNext),uMix);}
float edgeNoise(vec3 p){return .5*field(p*2.7)+.3*field(p*7.)+.2*field(p*18.);}
vec3 deform(vec3 p,float m,float t,float amp){
 vec3 d=vec3(0.); float r=length(p.xy),b=uSound.x,h=uSound.z, energy=uSound.w;
 float phase=t*.8+uPhase*6.2831; float n=field(vec3(p.xy*2.4,phase*.4))-.5;
 float f=sin(4.*p.y-phase*1.2+p.x);
 if(m<.5){d=vec3(p.x*b*.12,-p.y*b*.12,sin(r*8.-phase*3.)*b*.23);}
 else if(m<1.5){d.y=-.85*pow(.5+.5*sin(5.*p.x+phase+p.z),3.)*(.7+.3*cos(p.y));d.x=.21*f;d.z=n*.42;}
 else if(m<2.5){d.y=.48*abs(n)*sin(7.*p.x+phase*2.);d.x=n*.27;d.z=.12*sin(p.y*11.-phase);}
 else if(m<3.5){d.xyz+=normalize(p+vec3(.01,.1,.3))*n*.75;}
 else if(m<4.5){d.xz=turn(.5*sin(2.7*p.y+phase))*p.xz-p.xz;d.x+=.24*sin(5.*p.y+phase);d.y+=n*.32;}
 else if(m<5.5){vec2 q=p.xy-vec2(.35*sin(phase*.4),.12);d.xy=turn(.9*exp(-r*.85))*q-q;d.xy-=q*.3*exp(-r*r);d.z=-.48*exp(-r);}
 else if(m<6.5){vec3 c=floor(p*3.);d=vec3(hash(c)-.5,hash(c+2.)-.5,hash(c+1.)-.5)*.62;}
 else if(m<7.5){d=normalize(p+vec3(.01,.02,.1))*.15*pow(abs(f),5.);d.z+=.21*n;}
 else if(m<8.5){d.y=-.42*fract(hash(floor(p*14.))+phase*.12);d.x=.1*sin(8.*p.y+phase);}
 else if(m<9.5){d.z=.21*sin(2.*p.x-phase+p.y);d.xy=turn(.16*f)*p.xy-p.xy;}
 else if(m<10.5){d.xy=turn(.5*(2.-r)*sin(phase*.65))*p.xy-p.xy;d.z=.19*cos(5.*r-phase);}
 else if(m<11.5){d=.2*(abs(mod(p*3.+.5,1.)-.5)-.25);d.z+=.26*cos(p.x*6.)*sin(p.y*6.);}
 else if(m<12.5){d=vec3(sin(5.*p.y+phase*1.7),cos(4.*p.x-phase),sin((p.y+p.x)*6.+phase))*.24;}
 else if(m<13.5){float melt=max(0.,sin(phase*.5));d.y=-melt*.55*(.5+.5*sin(9.*p.x));d.x=(hash(floor(p*3.))-.5)*.3*(1.-melt);}
 else if(m<14.5){d.x=.32*sin(r*4.-phase*1.5);d.y=.22*cos(phase+p.x*4.);d.z=.27*sin(p.x*3.+p.y*4.+phase);}
 else {d=vec3(n*.49,.2*sin(phase+p.x)*cos(p.y),sin(5.*r-phase*2.)*.29);}
 // Simultaneous voices act on distinct dimensions and regain rest positions in silence.
 d+=vec3(p.x,-p.y,.2)*uVoices[0]*.12 + vec3(.0,-abs(f)*.22,n*.14)*uVoices[1];
 d.x+=uVoices[2]*sin(p.y*8.+phase)*.18 + uVoices[3]*(hash(floor(p*4.))-.5)*.18;
 d+=p*(uVoices[4]*.07) + vec3(n,f,0.)*uVoices[5]*.08;
 d.z+=sin(p.x*14.+phase)*uVoices[6]*.03 + cos(3.*p.y-phase)*uVoices[7]*.10;
 d.z+=sin(r*13.-phase)*uVoices[8]*.16; d.y-=abs(n)*uVoices[9]*.13;
 d+=normalize(p+vec3(.02,.02,.1))*uVoices[10]*.12; d.xz+=uVoices[11]*(turn(.21*p.y)*p.xz-p.xz);
 d.z+=uVoices[12]*.14*n; d.x+=uVoices[13]*.14*hash(floor(p*4.));
 d.z+=uVoices[14]*sin(p.x*6.+sin(p.y*6.))* .13;d.y+=uVoices[15]*n*.21;
 d+=uNoise*vec3(n*.18,field(p+vec3(phase,0.,0.))*.14-.07,0.);
 // Curl of a two-dimensional stream function: a small, divergence-free
 // current shared by the liquid surface and its detached samples.
 vec2 wave=1.7*p.xy+vec2(.19,-.14)*phase;
 vec2 curl=vec2(sin(wave.x)*cos(wave.y),-cos(wave.x)*sin(wave.y));
 d.xy+=curl*(.025+.05*uBuses[2]+.04*uBuses[4])*uNoise;
 d.z+=.04*(uBuses[0]*cos(r*6.-phase)+uBuses[3]*sin(wave.x+wave.y));
 d.z+=uDist*.14*sin(6.*p.y+phase*1.8);
 return p+d*amp*(.3+1.25*uWarp);
}
`;
export const vertex = `
attribute float aSeed;
`+common+`
void main(){
 float amp=uActive, t=uTime; vec3 p=position;
 vec3 q=mix(deform(p,uMode,t,amp),deform(p,uNext,t,amp),uMix);
 if(uCreator>.5)q=mix(p,q,mix(.72,.34,smoothstep(.45,.88,p.y)));
 float feather=edgeNoise(p*1.14);
 float cut=uCut + amp*(amount(3.)*.52+amount(8.)*.22+amount(2.)*.12+amount(13.)*.14);
 float side=uCreator>.5?clamp(.40+.42*p.x,.08,.93):.45;
 float threshold=clamp(cut,0.,1.)*(1.13+side*.50)-.20;
 if(uCreator>.5){
   float across=smoothstep(-.08,.50,p.x+.12*p.y);
   threshold+=across*(.70*amp*amount(3.)+.38*amp*amount(1.)+.26*amp*amount(13.));
   threshold-=smoothstep(.44,.94,p.y)*(1.-smoothstep(.08,.30,p.x))*.13;
 }
 if(uParticle>.5){
   float detach=smoothstep(feather-.11,feather+.13,threshold);
   float kick=uVoices[0], hot=amount(2.), rain=amount(8.); float spin=t*.8+aSeed*16.;
   vec3 flow=vec3(.65+.45*sin(spin+p.y),.37*sin(aSeed*14.+t*.55),.4*cos(spin*.72));
   flow.y+=hot*1.6-rain*1.38;
   float lift=detach*(.6+uDepth)+amp*(.045+.12*hot+.07*uVoices[5]);
   q+=flow*lift*(.5+aSeed*1.35);
 }
 if(uEcho>0.){q.xy=turn(uEcho*.07)*q.xy+vec2(-.17,.04)*uEcho; q.z-=uEcho*.17;}
 vUV=uv;vSeed=aSeed; vField=feather;vCut=threshold;vObj=p;
 vec4 view=modelViewMatrix*vec4(q,1.);vP=view.xyz;vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*view;
 gl_PointSize=clamp((1.45+uSize*5.)*(.45+aSeed)*3.4/max(.7,-view.z),1.,9.);
}`;
export const fragment=common+logoPolarityFragment+`
void main(){
 float rough=edgeNoise(vObj*1.14);
 float veil=1.-smoothstep(vCut-.025,vCut+.018,rough);
 if(uParticle>.5){
  vec2 xy=gl_PointCoord*2.-1.; float radius=dot(xy,xy);if(radius>1.)discard;
  float strength=clamp(veil+uActive*(.13+.65*amount(2.)+.28*amount(8.)+.20*uVoices[5]+.18*uVoices[6]+.13*uVoices[9]),0.,1.);
  if(strength<.035)discard;
  vec3 steel=mix(vec3(.83,.9,1.),uTint,.38+.48*amount(2.));steel=mix(steel,vec3(1.,.3,.035),amount(2.)*.85);
  gl_FragColor=vec4(developNegative(steel*(1.1+.35*vSeed),vObj,0.),strength*(1.-radius)*.90);return;
 }
 if(rough<vCut)discard;
 vec3 n=normalize(vN); vec3 surf=normalize(cross(dFdx(vP),dFdy(vP)));if(dot(surf,n)<0.)surf=-surf;
 float fracture=amount(6.)+amount(7.)+.5*amount(11.);
 float flatness=mix(.065+.15*uActive+.30*fracture,.20+.30*uActive,uCreator);
 n=normalize(mix(n,surf,flatness));
 if(uCreator<.5)n.xy+=.21*vec2(sin(vObj.y*1.1+.55*vObj.x),cos(vObj.x*1.25-vObj.y*.5));
 n.xy+=uActive*uRefract*.08*vec2(sin(7.*vObj.y+uTime),cos(4.*vObj.x-uTime));
 n=normalize(n);vec3 eye=normalize(-vP);vec3 refl=reflect(-eye,n);float rim=pow(1.-clamp(abs(dot(n,eye)),0.,1.),2.2);
 float band=dot(refl,normalize(vec3(.15,1.,.26)))+.22*sin(refl.x*2.5+uTime*.11)+.09*sin(vObj.y*1.5);
 float broad=smoothstep(-.26,-.02,band)*(1.-smoothstep(.35,.49,band));
 float panel=exp(-pow((band+.53)*11.,2.))+.85*exp(-pow((band-.70)*14.,2.));
 float scratch=.5+.5*sin((band+.1*refl.x)*48.);
 float environment=.014+.88*broad+1.6*panel+.025*scratch+.13*pow(max(0.,refl.x),5.);
 vec3 color=vec3(environment)*(.42+uReflect*.85)*(.48+uLight*.82);
 vec3 film=.54+.46*cos(6.2831*(vec3(.02,.34,.67)+refl.y*.42+refl.x*.2+vObj.y*.11+uTime*.012));
 color*=mix(vec3(.97,1.,1.),uTint,.12+.25*(1.-broad));
 color+=mix(uTint,film,.3+.42*uCreator)*(.023+rim*.48)*(.55+uRefract);
 if(uCreator>.5){
   // Dark and bright studio panels reflected in a thin-film alloy. Keep the
   // original portrait texture as a local facial contrast mask (eyes, glasses).
   float lobe=sin(8.0*refl.y+5.5*refl.x+1.8*sin(4.*refl.z)+.07*uTime);
   float glint=smoothstep(.85,.995,lobe), shadow=smoothstep(-.82,.2,lobe);
   vec3 interference=.5+.5*cos(6.2831*(vec3(.12,.44,.77)+.43*refl.y+.25*refl.x+.14*refl.z+.012*uTime));
   vec3 tintSpec=mix(uTint,interference,.78);
   color=(.010+shadow*(.16+.45*broad))*mix(vec3(1.),tintSpec,.7)+tintSpec*(.035+.75*glint)+vec3(1.,.95,.94)*panel*(.38+.42*shadow);
   color+=mix(tintSpec,uTint,.45)*rim*.46;
   float face=smoothstep(.37,.74,vObj.y);
   vec3 photo=texture2D(uAlbedo,vUV).rgb;float detail=dot(photo,vec3(.2126,.7152,.0722));
   color*=mix(1.,.27+.85*sqrt(max(.015,detail)),face*.96);
   color*=.65+uLight*.66;
 }
 float line=abs(sin(vObj.y*17.+vObj.x*3.+uTime*1.1));
 color+=uTint*pow(1.-line,4.)*amount(4.)*(.28+uActive*.6);
 color=mix(color,color*.18+uTint*pow(1.-abs(sin(9.*rough)),16.)*1.25,amount(7.)*.92);
 color+=vec3(1.,.24,.025)*amount(2.)*(pow(1.-abs(sin(11.*rough-uTime*.33)),6.)*.66+rim*.45);
 color+=uTint*exp(-abs(rough-vCut)*65.)*(uCut+uActive)*1.9;
 color+=film*amount(14.)*(.24+.22*uActive);
 vec3 ray=refract(-eye,normalize(n),.74);
 float glassBand=exp(-pow((ray.y+.11)*5.,2.));
 color+=uTint*glassBand*(.016+.045*uBuses[5])*uRefract;
 color+=uTint*rim*rim*(.06*uBuses[1]+.04*uBuses[4]);
 if(uEcho>.5)color=mix(uTint*.82,color,.25);
 gl_FragColor=vec4(color,uEcho>.5?.27/(1.+uEcho*.3):1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 gl_FragColor.rgb = developNegative(gl_FragColor.rgb, vObj, rim*rim);
}`;
