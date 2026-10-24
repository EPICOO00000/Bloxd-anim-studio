import * as THREE from 'three';
import { blockDefs, getBlockPrototype, resolveBlock } from './assets.js';
import { mulberry32 } from './noise.js';
import { buildWaterGeometry, waterMaterial } from './water.js';
const geo=new THREE.BoxGeometry(1,1,1),dummy=new THREE.Object3D();
export const cellKey=(x,y,z)=>`${x},${y},${z}`;
const neighbours=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
function voxelMeshes(entries,group,exposed=true){
  const batches=new Map(),waterCells=[];
  for(const [key,type] of entries){
    const p=key.split(',').map(Number);
    if(type==='water'){waterCells.push(p);continue;}
    if(exposed && blockDefs[type]?.fullCube && neighbours.every(d=>{const n=entries.get(cellKey(p[0]+d[0],p[1]+d[1],p[2]+d[2]));return n&&blockDefs[n]?.occludes;}))continue;
    if(!batches.has(type))batches.set(type,[]);batches.get(type).push(p);
  }
  const meshes=[];
  for(const [type,cells] of batches){
    const def=blockDefs[type];if(!def?.available)continue;const prototype=getBlockPrototype(type);
    const mesh=new THREE.InstancedMesh(prototype.geometry,prototype.materials,cells.length);
    mesh.name=def.label;mesh.castShadow=true;mesh.receiveShadow=true;
    mesh.userData.cells=cells;mesh.userData.block=type;
    mesh.frustumCulled=false; // voxel batches span the whole build; per-batch culling hid distant blocks
    for(let i=0;i<cells.length;i++){
      dummy.position.set(cells[i][0]+.5,cells[i][1]+.5,cells[i][2]+.5);
      dummy.scale.set(1,1,1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();group.add(mesh);meshes.push(mesh);
  }
  if(waterCells.length){
    // One welded, animated water surface: full-height blocks, faces only where water meets air.
    const g=buildWaterGeometry(waterCells,(x,y,z)=>entries.get(cellKey(x,y,z)),t=>t!=='water'&&!!blockDefs[t]?.occludes);
    const mesh=new THREE.Mesh(g,waterMaterial());
    mesh.name='Water';mesh.receiveShadow=false;mesh.castShadow=false;mesh.renderOrder=2;
    mesh.userData.waterCells=waterCells;mesh.userData.block='water';
    mesh.dispose=()=>g.dispose();
    group.add(mesh);meshes.push(mesh);
  }
  return meshes;
}
export class VoxelWorld{
  constructor(){this.map=new Map();this.group=new THREE.Group();this.group.name='Maple clearing';this.meshes=[];this.size=18;this.seed=42;}
  get count(){return this.map.size;}
  set(x,y,z,type){const k=cellKey(x,y,z);if(type&&blockDefs[resolveBlock(type)]?.available)this.map.set(k,resolveBlock(type));else this.map.delete(k);}
  get(x,y,z){return this.map.get(cellKey(x,y,z));}
  heightAt(x,z){x=Math.floor(x);z=Math.floor(z);for(let y=40;y>=-4;y--){const v=this.get(x,y,z);if(v&&v!=='water'&&blockDefs[v]?.solid!==false)return y+(blockDefs[v]?.surfaceHeight||1);}return -3.02;}
  rebuild(){for(const m of this.meshes){this.group.remove(m);m.dispose();}this.meshes=voxelMeshes(this.map,this.group);}
  generate(size=18,seed=42){
    this.map.clear();this.size=size;this.seed=seed;
    const r=mulberry32(seed),half=size/2;
    for(let x=-half;x<half;x++)for(let z=-half;z<half;z++){
      const nx=(x+.5)/half,nz=(z+.5)/(half*.78);
      if(Math.pow(Math.abs(nx),4)+Math.pow(Math.abs(nz),4)>1)continue;
      let h=0;
      if(z<-2&&x>1)h=1;
      if(z<-4&&x>4)h=2;
      if(seed!==42 && z<-2 && r()>.6)h++;
      const pond=x>=-5&&x<=-3&&z>=1&&z<=3&&!(x===-5&&z===3);
      const path=Math.abs(x-(Math.sin(z*.3)*1.2-1))<.7 && z>1;
      for(let y=-3;y<=h;y++){
        const edge=Math.pow(Math.abs(nx),4)+Math.pow(Math.abs(nz),4)>.75;
        if(y===-3&&edge)continue;
        let type=y===h?(path?'sand':'grass'):y>=h-1?'dirt':'stone';
        if(y<=-2&&r()<.045)type=r()>.55?'ironore':'diamondore';
        if(pond&&y===h)type='water';if(pond&&y===h-1)type='sand';
        this.set(x,y,z,type);
      }
    }
    // Small, readable mining outcrop beside the hero.
    for(const [x,y,z,type] of [[-1,1,2,'stone'],[-1,2,2,'diamondore'],[-2,1,2,'diamondore'],[-1,1,3,'stone'],[0,1,2,'cobble']])this.set(x,y,z,type);
    // A simple wooden bridge over the pond.
    for(let x=-6;x<=-2;x++)this.set(x,1,2,'planks');
    this.rebuild();return this;
  }
}
export function createTree(autumn=false){
  const root=new THREE.Group();root.name=autumn?'Autumn maple':'Maple tree';
  const map=new Map(),leaf=autumn?'autumn':'maple';
  for(let y=0;y<4;y++)map.set(cellKey(0,y,0),'log');
  for(let y=3;y<=5;y++)for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++){
    if(y===5&&(Math.abs(x)>1||Math.abs(z)>1))continue;
    if(Math.abs(x)===2&&Math.abs(z)===2)continue;
    if(x===0&&z===0&&y===3)continue;
    map.set(cellKey(x,y,z),leaf);
  }
  voxelMeshes(map,root);return root;
}
export function createRock(){
  const root=new THREE.Group();root.name='Stone outcrop';
  const map=new Map();for(const [x,y,z]of [[0,0,0],[1,0,0],[0,1,0],[0,0,1],[-1,0,0]])map.set(cellKey(x,y,z),y?'diamondore':'stone');
  voxelMeshes(map,root);return root;
}
