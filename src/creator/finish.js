import * as T from 'three';

export const sculptureVertex = /* glsl */ `
varying vec3 vPos, vNorm, vEye;
varying vec2 vUv;
void main(){
  vUv=uv;
  vec4 view=modelViewMatrix*vec4(position,1.);
  vPos=position; vNorm=normalize(normalMatrix*normal);vEye=-view.xyz;
  gl_Position=projectionMatrix*view;
}`;

const common = /* glsl */ `
float hash3(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,52.047)))*43758.5453);}
`;
export const sculptureFragment = /* glsl */ `
uniform sampler2D uSkin; uniform vec3 uAccent; uniform vec4 uAudio;
uniform float uTime,uLook,uAcid,uNoir;
varying vec3 vPos,vNorm,vEye; varying vec2 vUv;
${common}
float stripe(float x,float center,float width){float d=(x-center)/width;return exp(-d*d);}
void main(){
 vec3 N=normalize(vNorm), V=normalize(vEye), K=normalize(vec3(-.58,.76,.6));
 vec3 albedo=texture2D(uSkin,vUv).rgb;
 float tone=dot(albedo,vec3(.2126,.7152,.0722));
 float face=smoothstep(.55,.79,vPos.y);
 float side=smoothstep(.11,.57,vPos.x)*smoothstep(-1.4,-.1,vPos.y);
 float liquid=step(1.5,uLook), natural=1.-step(.5,uLook);
 float edge=pow(1.-max(dot(N,V),0.),2.);
 float dotKey=dot(N,K);
 float key=max(.0,dotKey);
 float cheek=pow(max(dot(reflect(-K,N),V),0.),24.);
 vec3 shaded=albedo*(.36+1.9*key+.25*max(N.y,0.)) + vec3(.06,.072,.09)*edge;
 vec3 skin=mix(vec3(dot(shaded,vec3(.23,.65,.12))),shaded,.73);
 float strength=(.68+.28*liquid)*(1.-face*.82);
 vec3 P=vPos;
 float t=uTime*.085;
 vec3 wave=vec3(sin(P.y*8.+P.x*3.+t),sin(P.x*7.-P.y*3.-t),cos((P.x+P.y)*5.+t));
 vec3 M=normalize(N+wave*(.045+.076*liquid+.11*uAudio.y)*strength);
 vec3 R=reflect(-V,M);
 // Wide reflected softboxes and contrasting dark flags carve the volume. The ripple only moves the reflected light.
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
 foil=mix(foil,vec3(.81,.87,.97)*luma*.86,uNoir*.88);
 // Preserve details of the source texture around the eyes, lips, hair and spectacles.
 float dark=1.-smoothstep(.026,.18,tone);
 float amount=face*mix(.73,.95,dark);
 vec3 coated=mix(foil,skin*(.85+diffuse*.20)+vec3(.26,.23,.25)*cheek,amount);
 coated+=face*edge*.18*uAccent;
 float graphite=dot(skin,vec3(.23,.65,.12));
 vec3 editorial=mix(vec3(graphite)*vec3(.91,.98,1.02),skin,.23);
 editorial+=vec3(.12,.15,.17)*smoothstep(.65,1.,edge)*(1.-face);
 float dissolve=side*(.14+.15*natural+.22*uAudio.w)*smoothstep(-.6,.86,vPos.y)*smoothstep(.12,.55,vPos.x);
 float grain=hash3(floor(P*125.))*.73+hash3(floor(P*29.))*.27;
 if(grain < dissolve*(.43+1.35*natural))discard;
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
    attribute float seed; uniform float uTime,uLook,uDpr;uniform vec4 uAudio;
    varying float a,hue;void main(){
     vec3 p=position;float move=uTime*.14;float strength=.14+.34*(1.-step(.5,uLook))+.19*uAudio.w;
     float d=pow(seed,2.)*strength*(1.+.18*sin(seed*17.+move));
     p+=normal*d*.35+vec3(d*2.0,d*(.34+1.18*sin(seed*35.+move)),d*.36);
     vec4 mv=modelViewMatrix*vec4(p,1.);
     a=(.14+.56*seed)*(.54+.46*max(0.,normal.y));hue=seed;
     gl_Position=projectionMatrix*mv;gl_PointSize=uDpr*(1.+2.6*pow(seed,4.)+.8*uAudio.z);
    }`,
    fragmentShader: /* glsl */ `
    uniform vec3 uAccent;uniform float uLook;varying float a,hue;void main(){
      float radius=length(gl_PointCoord-.5);if(radius>.5)discard;
      vec3 c=mix(mix(uAccent,vec3(.98,.88,.99),hue),vec3(.87,.91,.93),1.-step(.5,uLook));
      gl_FragColor=vec4(c,a*(1.-smoothstep(.12,.5,radius)));
      #include <colorspace_fragment>
    }`,
  });
  return new T.Points(g, m);
}
