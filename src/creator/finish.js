import * as T from 'three';

// All fragment and particle decisions use original, unwarped model coordinates.
// The mask leaves the face, glasses and hair intact through the entire effect.
const shell = /* glsl */ `
uniform float uProfile, uLiquid, uScatter;
float cloth(vec3 p) {
  return (1.-smoothstep(.39,.68,p.y))*smoothstep(-2.1,-1.1,p.y);
}
float releaseEdge(vec3 p){
  return cloth(p)*smoothstep(.015,.45,p.x)*smoothstep(-1.15,-.41,p.y);
}
float flake(vec3 p){
  vec3 cell=floor(p*mix(55.,31.,step(3.5,uProfile)* (1.-step(4.5,uProfile))));
  return fract(sin(dot(cell,vec3(12.1,71.7,34.2)))*4375.15);
}
float releaseAmount(vec3 p) {
  return releaseEdge(p)*min(.91,uScatter*(.64+.38*uLiquid));
}
`;
const deformation = /* glsl */ `
uniform float uTime; uniform vec4 uAudio;
vec3 displaced(vec3 p) {
  // Duplicated positions at UV seams may have different normals. Use one
  // continuous outward field so the cloth deforms without opening those seams.
  vec3 n=normalize(vec3(.94*p.x,.12+.065*sin(p.y*4.),1.2*p.z+.025));
  float fabric=cloth(p);
  float t=uTime*1.65;
  float wave=sin(p.y*7.+p.x*4.-t);
  float crossWave=cos(p.x*6.-p.z*3.+t*.56);
  vec3 d=n*(wave*uAudio.x*.064)+vec3(crossWave*.026*uAudio.y,0.,0.);
  if(uProfile>.5 && uProfile<1.5) {
    float twist=sin(p.y*10.+t*1.8+p.z*4.)*(.08*uAudio.y+.035*uAudio.z);
    d+=vec3(twist*(.45+p.z),0.,-twist*p.x)+n*wave*.028*uAudio.x;
  } else if(uProfile>1.5 && uProfile<2.5) {
    d*=.38;
    d.z+=sin(p.x*4.+p.y*4.-t*.55)*.055*uAudio.y;
  } else if(uProfile>3.5 && uProfile<4.5) {
    float plate=floor((p.y+1.)*8.);
    d+=vec3(sin(plate*5.),.21,cos(plate*2.))*.064*uAudio.x;
  } else if(uProfile>4.5) {
    d.y+=.073*uAudio.y*(.5+.5*crossWave);
    d.x+=.037*uAudio.z*sin(p.y*5.-t*.72);
  }
  d+=uLiquid*(n*wave*crossWave*.085*uAudio.y+
     vec3(sin(7.*p.y-t)*.053,-.104*(.5+.5*wave),.03*crossWave)*uAudio.w);
  return p+d*fabric;
}
`;

export const sculptureVertex = /* glsl */ `
varying vec3 vPos, vNorm, vEye;
varying vec2 vUv;
${shell}
${deformation}
void main(){
  vUv=uv;
  vec4 view=modelViewMatrix*vec4(displaced(position),1.);
  vPos=position; vNorm=normalize(normalMatrix*normal);vEye=-view.xyz;
  gl_Position=projectionMatrix*view;
}`;

export const sculptureFragment = /* glsl */ `
uniform sampler2D uSkin; uniform vec3 uAccent; uniform vec4 uAudio;
uniform float uTime,uLook,uAcid,uNoir;
varying vec3 vPos,vNorm,vEye; varying vec2 vUv;
${shell}
float stripe(float x,float center,float width){float d=(x-center)/width;return exp(-d*d);}
void main(){
 vec3 N=normalize(vNorm), V=normalize(vEye), K=normalize(vec3(-.58,.76,.6));
 vec3 albedo=texture2D(uSkin,vUv).rgb;
 float tone=dot(albedo,vec3(.2126,.7152,.0722));
 float face=smoothstep(.55,.79,vPos.y);

 float liquid=uLiquid, natural=1.-step(.5,uLook);
 float edge=pow(1.-max(dot(N,V),0.),2.);
 float dotKey=dot(N,K);
 float key=max(.0,dotKey);
 float cheek=pow(max(dot(reflect(-K,N),V),0.),24.);
 vec3 shaded=albedo*(.36+1.9*key+.25*max(N.y,0.)) + vec3(.06,.072,.09)*edge;
 vec3 skin=mix(vec3(dot(shaded,vec3(.23,.65,.12))),shaded,.73);
 float strength=(.68+.28*liquid)*(1.-face*.82);
 vec3 P=vPos;
 float t=sin(uTime*.085)*smoothstep(0.,.18,uAudio.w);
 vec3 wave=vec3(sin(P.y*8.+P.x*3.+t),sin(P.x*7.-P.y*3.-t),cos((P.x+P.y)*5.+t));
 vec3 M=normalize(N+wave*(.045+.076*liquid+.11*uAudio.y)*strength);
 vec3 R=reflect(-V,M);
 // Wide softboxes and dark flags sculpt the reflections independently of silhouette displacement.
 float h=R.y+.26*sin(2.8*R.x+.7*P.y)+.065*sin(8.*R.x+t);
 float v=R.x+.26*R.z+.14*sin(4.*R.y-t);
 float fres=pow(1.-max(dot(M,V),0.),1.6);
 float diffuse=max(dot(M,K),0.);
 vec3 base=mix(vec3(.022,.020,.055),vec3(.15,.19,.29),diffuse);
 vec3 cyan=mix(vec3(.015,.42,1.08),uAccent,.17);
 vec3 pink=mix(vec3(.92,.09,.54),uAccent,.12);
 vec3 copper=vec3(1.02,.40,.15);
 vec3 foil=base + cyan*(.95*stripe(h,-.27,.27)+.60*stripe(v,-.65,.14))+
  pink*(.94*stripe(h,.28,.29)+.54*stripe(v,.43,.13))+
  copper*(.43*stripe(h,.67,.12)+.32*stripe(v,-.30,.085))+
  vec3(.37,.20,.68)*stripe(h,-.76,.21);
 foil+=vec3(1.42,1.32,1.31)*(stripe(h,.53,.115)+.63*stripe(h,-.52,.095)+.46*stripe(v,.76,.11));
 foil+=vec3(.25,.33,.54)*fres + uAccent*.18*stripe(v,.05,.14)*uAudio.x;
 // Narrow reflected strips sweep across the cloth folds and curved silhouette.
 float path=4.1*h+2.2*R.x+1.8*sin(2.9*P.y+2.6*R.x+.64*sin(P.x*4.4-t))+t*.16;
 float swirl=5.6*R.x+2.9*R.y+2.4*sin(P.y*4.1+1.8*R.y+.8*sin(5.*P.x+t))-t*.26;
 float film=.5+.5*sin(mix(path,swirl,liquid*.83));
 vec3 oil=mix(vec3(.009,.009,.042),vec3(.035,.018,.27),smoothstep(.02,.19,film));
 oil=mix(oil,vec3(.012,.17,.86),smoothstep(.16,.32,film));
 oil=mix(oil,vec3(.008,.90,1.25),smoothstep(.31,.44,film));
 oil=mix(oil,vec3(.81,1.05,1.34),smoothstep(.43,.51,film));
 oil=mix(oil,vec3(.98,.23,.44),smoothstep(.51,.64,film));
 oil=mix(oil,vec3(.46,.028,.39),smoothstep(.63,.76,film));
 oil=mix(oil,vec3(.055,.025,.13),smoothstep(.75,.87,film));
 oil+=vec3(1.,.48,.12)*stripe(film,.90,.043)+vec3(.99,.88,.85)*stripe(film,.95,.025);
 foil=mix(oil,foil,.22)+vec3(.33,.38,.55)*stripe(v,-.72,.075);
 float polished=dot(foil,vec3(.22,.68,.1));
 vec3 mercury=vec3(.018,.024,.042)+vec3(.72,.84,.99)*polished+
  vec3(.26,.68,.98)*stripe(film,.38,.09)+vec3(.62,.29,.48)*stripe(film,.72,.06);
 foil=mix(foil,mercury,liquid*.80);
 foil*=.58+.42*diffuse;
 float luma=dot(foil,vec3(.22,.68,.1));
 foil=mix(foil,vec3(.006,.026,.014)+vec3(.085,.95,.44)*luma*1.2,uAcid*.90);
 if(uAcid>.5){
   float filament=pow(.5+.5*cos(P.y*49.+P.x*16.+5.*sin(P.x*7.-t*4.)-t*16.),14.);
   foil+=uAccent*filament*uAudio.y*(.40+.45*liquid);
 } else if(uNoir>.5){
   foil=mix(foil,vec3(.016,.010,.033)+luma*vec3(.43,.31,.72),.88);
   foil+=uAccent*(.1+.16*uAudio.y)*fres;
 } else if(uProfile>2.5){
   vec3 metal=uProfile<3.5?vec3(1.03,.26,.19):uProfile<4.5?vec3(1.04,.44,.18):vec3(.24,.88,.79);
   foil=mix(foil,metal*luma*1.22,uProfile<3.5?.53:.68);
   foil+=metal*fres*(.09+.21*uAudio.z);
 }
 // Preserve details of the source texture around the eyes, lips, hair and spectacles.
 float dark=1.-smoothstep(.026,.18,tone);
 float amount=face*mix(.73,.95,dark);
 vec3 coated=mix(foil,skin*(.85+diffuse*.20)+vec3(.26,.23,.25)*cheek,amount);
 coated+=face*edge*.18*uAccent;
 float graphite=dot(skin,vec3(.23,.65,.12));
 vec3 editorial=mix(vec3(graphite)*vec3(.91,.98,1.02),skin,.23);
 editorial+=vec3(.12,.15,.17)*smoothstep(.65,1.,edge)*(1.-face);
 if(uScatter>0. && flake(P)<releaseAmount(P))discard;
 vec3 color=mix(coated,editorial,natural);
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

export function makeFinish(asset, uniforms) {
  return new T.ShaderMaterial({
    uniforms: { ...uniforms, uSkin: { value: asset.natural.map } },
    vertexShader: sculptureVertex,
    fragmentShader: sculptureFragment,
  });
}

export function makeShards(geometry, uniforms, mobile) {
  const points = geometry.attributes.position,
    normals = geometry.attributes.normal;
  const pos = [],
    norm = [],
    seeds = [];
  let seed = 97531;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const wanted = mobile ? 950 : 1900;
  for (let j = 0; j < points.count && seeds.length < wanted; j++) {
    const i = Math.floor(random() * points.count),
      x = points.getX(i),
      y = points.getY(i),
      z = points.getZ(i);
    if (x < 0.12 || y < -0.8 || z < -0.26 || random() > 0.16 + 0.75 * Math.min(1, Math.max(0, x))) continue;
    pos.push(x, y, z);
    norm.push(normals.getX(i), normals.getY(i), normals.getZ(i));
    seeds.push(random());
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(norm, 3));
  g.setAttribute('seed', new T.Float32BufferAttribute(seeds, 1));
  const m = new T.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
    attribute float seed; uniform float uDpr;
    varying float a,hue;
    ${shell}
    ${deformation}
    void main(){
      float release=releaseAmount(position);
      float distanceOut=max(0.,release-flake(position));
      vec3 p=displaced(position);
      float t=uTime*.9;
      vec3 drift=vec3(.96,.22+.44*sin(seed*31.+t),.18)+normal*.35;
      if(uProfile>.5 && uProfile<1.5)drift.y+=.33*sin(t*2.+position.y*8.);
      if(uProfile>3.5 && uProfile<4.5)drift=normal*.61+vec3(1.,.31+floor(seed*4.)*.13,.26);
      if(uProfile>4.5)drift=vec3(.46+.42*sin(t+seed*9.),1.19+seed,.24)+normal*.20;
      p+=drift*distanceOut*(.56+.86*seed);
      a=smoothstep(0.,.065,distanceOut)*(.39+.57*seed);
      hue=seed;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
      gl_PointSize=uDpr*(1.1+2.5*seed+.8*uAudio.z);
    }`,
    fragmentShader: /* glsl */ `
    uniform vec3 uAccent;uniform float uLook;varying float a,hue;void main(){
      float radius=length(gl_PointCoord-.5);if(a<.005||radius>.5)discard;
      vec3 c=mix(mix(uAccent,vec3(.98,.88,.99),hue),vec3(.87,.91,.93),1.-step(.5,uLook));
      gl_FragColor=vec4(c,a*(1.-smoothstep(.12,.5,radius)));
      #include <colorspace_fragment>
    }`,
  });
  return new T.Points(g, m);
}

// A rear outline pass shares the static mesh's buffers. It is drawn only while
// Afterimage is audible and trails the surface on a slower attack and release.
export function makeEcho(geometry, uniforms) {
  const material = new T.ShaderMaterial({
    uniforms,
    side: T.BackSide,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uEcho; varying float rim;
      void main(){
        vec4 v=modelViewMatrix*vec4(position,1.);
        rim=pow(1.-abs(dot(normalize(normalMatrix*normal),normalize(-v.xyz))),.85);
        vec3 offset=vec3(.17+.08*sin(position.y*4.),.055,.0)+normal*.037;
        v=modelViewMatrix*vec4(position+offset*uEcho,1.);
        gl_Position=projectionMatrix*v;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uEcho; uniform vec3 uAccent; varying float rim;
      void main(){
        gl_FragColor=vec4(mix(vec3(.31,.014,.012),uAccent,rim),uEcho*(.10+.39*rim));
        #include <colorspace_fragment>
      }`,
  });
  const echo = new T.Mesh(geometry, material);
  echo.visible = false;
  return echo;
}
