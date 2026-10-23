import * as THREE from 'three';
import { GLTFLoader } from '../vendor/loaders/GLTFLoader.js';
import { OBJLoader } from '../vendor/loaders/OBJLoader.js';
import { STLLoader } from '../vendor/loaders/STLLoader.js';
import { PLYLoader } from '../vendor/loaders/PLYLoader.js';

export async function parseModel(name,data){
  const ext=name.toLowerCase().split('.').pop();
  let content,animations=[];
  if(ext==='glb'){
    const dv=new DataView(data);
    if(data.byteLength<20||dv.getUint32(0,true)!==0x46546c67)throw new Error('This is not a valid GLB file.');
    const len=dv.getUint32(12,true);
    const json=JSON.parse(new TextDecoder().decode(new Uint8Array(data,20,len)));
    for(const entry of [...(json.buffers||[]),...(json.images||[])])
      if(entry.uri && !entry.uri.startsWith('data:'))throw new Error('Use a self-contained GLB with embedded textures.');
    if((json.extensionsRequired||[]).some(x=>/draco|basisu|meshopt/i.test(x)))throw new Error('Compressed GLB is not supported. Export without Draco, KTX or meshopt compression.');
    const gltf=await new GLTFLoader().parseAsync(data,'');content=gltf.scene;animations=gltf.animations;
  }else if(ext==='obj'){
    content=new OBJLoader().parse(new TextDecoder().decode(data));
  }else if(ext==='stl'||ext==='ply'){
    const geometry=ext==='stl'?new STLLoader().parse(data):new PLYLoader().parse(data);
    const colored=!!geometry.attributes.color;
    geometry.computeVertexNormals();
    content=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:colored?0xffffff:0xb9cebc,vertexColors:colored,roughness:.75,side:THREE.DoubleSide}));
  }else throw new Error('Choose a GLB, OBJ, STL or PLY file.');
  let vertexCount=0;
  content.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;vertexCount+=o.geometry.attributes.position?.count||0;}});
  if(!vertexCount)throw new Error('No mesh faces found in this file.');
  if(vertexCount>1500000)throw new Error('This model is too large. Try a simplified model below 1.5 million vertices.');
  const box=new THREE.Box3().setFromObject(content),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  if(!Number.isFinite(size.x+size.y+size.z)||size.length()<.00001)throw new Error('The model has empty or invalid bounds.');
  const s=2.5/Math.max(size.x,size.y,size.z);
  const normalized=new THREE.Group();normalized.add(content);content.position.sub(center);content.position.y+=size.y/2;normalized.scale.setScalar(s);
  const root=new THREE.Group();root.name=name.replace(/\.[^.]+$/,'');root.add(normalized);root.animations=animations;
  return {root,animations};
}

// Surface + solid voxelisation: independent down-ray intervals for each mesh,
// using a uniform cell size (never overlapping rectangular-grid cubes).
export function voxelise(root,res=16){
  root.updateWorldMatrix(true,true);
  const bb=new THREE.Box3().setFromObject(root),size=bb.getSize(new THREE.Vector3());
  const cell=Math.max(size.x,size.y,size.z)/res;
  if(!Number.isFinite(cell)||cell<.00001)throw new Error('The model has no volume.');
  const nx=Math.max(1,Math.ceil(size.x/cell)),nz=Math.max(1,Math.ceil(size.z/cell));
  const meshes=[];root.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh)meshes.push(o);});
  if(!meshes.length)throw new Error('This object is already voxelised or has no mesh.');
  const cells=new Map(),ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
  const oldSides=new Map();
  for(const m of meshes)for(const mat of (Array.isArray(m.material)?m.material:[m.material])){if(!oldSides.has(mat))oldSides.set(mat,mat.side);mat.side=THREE.DoubleSide;}
  const imageCache=new Map();
  function hitColor(hit){
    const materials=hit.object.material;
    const m=Array.isArray(materials)?materials[hit.face.materialIndex]:materials;
    const color=m.color?.clone()||new THREE.Color(0xc4d9c0);
    if(m.map?.image&&hit.uv){
      try{
        let sample=imageCache.get(m.map);
        if(!sample){const image=m.map.image,canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);sample={data:ctx.getImageData(0,0,canvas.width,canvas.height).data,w:canvas.width,h:canvas.height};imageCache.set(m.map,sample);}
        const uv=hit.uv.clone();m.map.updateMatrix();m.map.transformUv(uv);
        const x=THREE.MathUtils.clamp(Math.floor(uv.x*sample.w),0,sample.w-1),y=THREE.MathUtils.clamp(Math.floor(uv.y*sample.h),0,sample.h-1),i=(y*sample.w+x)*4;
        color.multiply(new THREE.Color().setRGB(sample.data[i]/255,sample.data[i+1]/255,sample.data[i+2]/255,THREE.SRGBColorSpace));
      }catch{}
    }return color;
  }
  try{
    for(let x=0;x<nx;x++)for(let z=0;z<nz;z++){
      ray.set(new THREE.Vector3(bb.min.x+(x+.5)*cell,bb.max.y+cell,bb.min.z+(z+.5)*cell),down);
      for(const mesh of meshes){
        const hits=ray.intersectObject(mesh,false),unique=[];
        for(const h of hits)if(!unique.length||Math.abs(h.distance-unique.at(-1).distance)>cell*.001)unique.push(h);
        for(let i=0;i<unique.length;i+=2){
          const hi=unique[i].point.y,lo=unique[i+1]?.point.y ?? hi;
          const start=Math.max(0,Math.floor((lo-bb.min.y)/cell)),end=Math.min(res-1,Math.floor((hi-bb.min.y)/cell));
          const col=hitColor(unique[i]);
          for(let y=start;y<=end;y++)cells.set(`${x},${y},${z}`,{x,y,z,col});
        }
      }
    }
  }finally{for(const[mat,side]of oldSides)mat.side=side;}
  if(!cells.size)throw new Error('No voxels found. Use a closed mesh or increase resolution.');
  const group=new THREE.Group();group.name=root.name+' · voxels';group.position.copy(bb.min);
  const im=new THREE.InstancedMesh(new THREE.BoxGeometry(cell*.99,cell*.99,cell*.99),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.9}),cells.size);
  im.castShadow=im.receiveShadow=true;
  const dummy=new THREE.Object3D();let i=0;
  for(const c of cells.values()){dummy.position.set((c.x+.5)*cell,(c.y+.5)*cell,(c.z+.5)*cell);dummy.updateMatrix();im.setMatrixAt(i,dummy.matrix);im.setColorAt(i,c.col);i++;}
  im.instanceMatrix.needsUpdate=true;im.instanceColor.needsUpdate=true;im.computeBoundingSphere();group.add(im);
  return group;
}
