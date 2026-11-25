import * as T from 'three';

const TAU=Math.PI*2;
const vertex=(x,y,z)=>new T.Vector3(x,y,z);
function line(points,material){
 return new T.Line(new T.BufferGeometry().setFromPoints(points),material);
}
// Deliberately different spatial scores for the 16 live scenes.
export function spatialScore(index){
 const group=new T.Group();
 const material=new T.LineBasicMaterial({color:0xbacee2,transparent:true,opacity:.22,depthWrite:false,blending:T.AdditiveBlending});
 const meshMaterial=new T.MeshBasicMaterial({color:0xbacee2,wireframe:true,transparent:true,opacity:.19,depthWrite:false});
 const paths=[];
 function curve(count,points,formula){
   for(let j=0;j<count;j++) {
     const vs=[];
     for(let i=0;i<=points;i++)vs.push(vertex(...formula(j,i/points,i)));
     paths.push(line(vs,material));
   }
 }
 const ring=(a,r,y,z)=>[r*Math.cos(a),y+r*.27*Math.sin(a),z+.8*Math.sin(a)];
 if(index===0) curve(5,100,(j,f)=>ring(f*TAU,1.65+j*.19,-.32+j*.06,-.35));
 if(index===1) curve(11,64,(j,f)=>[4.8*(f-.5),-1.77+.08*j+.18*Math.sin(f*9.+j*.42),-.8-.09*j]);
 if(index===2) curve(23,20,(j,f)=>[(j-11)*.22+.1*Math.sin(f*9+j),-1.8+f*(1.1+.8*Math.sin(j*2)),.35*Math.sin(j)+f*.2]);
 if(index===3) curve(9,90,(j,f)=>[2.1*Math.sin(f*TAU)*Math.cos(j*.63),1.75*Math.cos(f*TAU),2.1*Math.sin(f*TAU)*Math.sin(j*.63)]);
 if(index===4) curve(8,170,(j,f)=>{const a=f*TAU*2.6+j*.4;return [1.5*Math.cos(a)+.12*Math.cos(a*4),-1.6+3.2*f,.75*Math.sin(a)];});
 if(index===5) curve(12,100,(j,f)=>{const a=TAU*f,r=.65+j*.15+.14*Math.sin(2*a);return [r*Math.cos(a),r*.24*Math.sin(a)+.35*Math.cos(a),-1+r*.68*Math.sin(a)];});
 if(index===6) curve(18,7,(j,f,i)=>[2.7*(f-.5)+.2*Math.sin(j), (j-9)*.16+.12*(i%2),-.7+.06*Math.floor(i*2)]);
 if(index===7) {const box=new T.OctahedronGeometry(2.29,0);group.add(new T.Mesh(box,meshMaterial));}
 if(index===8) curve(37,2,(j,f)=>[(j%13-6)*.38+Math.sin(j*4)*.3,-1.7+(j%5)*.8+f*.48,(j%4-2)*.55]);
 if(index===9) curve(5,115,(j,f)=>{const a=TAU*f;return [(1.45+j*.18)*Math.cos(a)-j*.04,(1.65+j*.06)*Math.sin(a),-.55-j*.28];});
 if(index===10||index===15) curve(7,150,(j,f)=>{const a=TAU*(1.6*f+j/7);return [(1.+f*1.5)*Math.cos(a),(1.+f*1.5)*Math.sin(a),-3.+f*4.2];});
 if(index===11) {
   const tetra=new T.TetrahedronGeometry(1,0),is=new T.InstancedMesh(tetra,meshMaterial,64),m=new T.Object3D();
   const corners=[[1,1,1],[-1,-1,1],[-1,1,-1],[1,-1,-1]];
   for(let j=0;j<64;j++){
     m.position.set(0,0,-.65);
     for(let k=0;k<3;k++){const c=corners[(j>>(2*k))&3],scale=1.1/(2**k);m.position.x+=c[0]*scale;m.position.y+=c[1]*scale;m.position.z+=c[2]*scale*.6;}
     m.scale.setScalar(.15);m.rotation.set(.2,.2,.1);m.updateMatrix();is.setMatrixAt(j,m.matrix);
   }group.add(is);
 }
 if(index===12) curve(4,270,(j,f)=>{const a=TAU*f;return [1.97*Math.sin(3*a+j*.18),1.52*Math.sin(4*a+j*.27),-.75+.56*Math.cos(5*a+j*.2)];});
 if(index===13) curve(9,4,(j,f,i)=>[(i===0||i===3||i===4?-1:1)*(1.48+.052*j),(i===0||i===1||i===4?-1:1)*(1.37+.045*j),-.28-j*.15]);
 if(index===14) curve(18,70,(j,f)=>{const a=f*TAU,r=1.6+.12*Math.sin(5*a+j*.4)+j*.045;return [r*Math.cos(a),r*.81*Math.sin(a),-2+j*.12];});
 group.add(...paths);
 return {group,
   update(strength,t,energy,tint,depth){
     group.visible=strength>.003;
     if(!group.visible)return;
     material.color.copy(tint);meshMaterial.color.copy(tint);
     const opacity=strength*(.12+.13*energy);
     material.opacity=opacity;meshMaterial.opacity=opacity;
     group.rotation.z=(index===8?-.14:Math.sin(t*.13)*.12)+(index===10||index===15?t*.045:0);
     group.rotation.y=Math.sin(t*.13+index)*.14;group.scale.z=.55+depth;
     const scale=1+.025*energy;group.scale.x=scale;group.scale.y=scale;
   },
   dispose(){group.traverse(o=>o.geometry?.dispose());material.dispose();meshMaterial.dispose();}
 };
}
