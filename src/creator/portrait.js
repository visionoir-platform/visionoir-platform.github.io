import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';

export async function loadPortrait(url,signal){
 const response=await fetch(url,{signal});
 if(!response.ok)throw Error('Portrait unavailable');
 const file=await response.arrayBuffer();
 const model=await new GLTFLoader().parseAsync(file,new URL('.',new URL(url,location.href)).href);
 if(model.animations.length)throw Error('The public portrait must be static');
 const meshes=[];model.scene.updateMatrixWorld(true);
 model.scene.traverse(o=>{if(o.isMesh)meshes.push(o);});
 if(meshes.length!==1||meshes[0].isSkinnedMesh)throw Error('Expected a single static portrait mesh');
 const mesh=meshes[0],geometry=mesh.geometry;
 geometry.applyMatrix4(mesh.matrixWorld);geometry.computeBoundingBox();
 const bounds=geometry.boundingBox,center=bounds.getCenter(new T.Vector3()),height=bounds.max.y-bounds.min.y;
 if(!height||!Number.isFinite(height))throw Error('Invalid sculpture proportions');
 geometry.translate(-center.x,-center.y,-center.z);geometry.scale(3.65/height,3.65/height,3.65/height);
 // Portrait view frames upper body. Coordinates and original UVs remain intact.
 geometry.translate(0,-.66,0);
 const natural=mesh.material;
 const textures=new Set(Object.values(natural).filter(v=>v?.isTexture));
 return {geometry,natural,dispose(){natural.dispose();for(const t of textures)t.dispose();}};
}
