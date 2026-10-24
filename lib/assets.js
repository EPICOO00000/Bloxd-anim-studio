import * as THREE from 'three';
import { buildWaterGeometry, waterMaterial } from './water.js';
import PACK from './asset-data.js';
import { gunzipSync, strFromU8 } from '../vendor/fflate.js';

export const assetData={},catalog={},blockDefs=Object.create(null),itemDefs=Object.create(null),textures=Object.create(null),models=new Map(),toolNames=[];
const materialCache=new Map(),geometryCache=new Map(),rawCache=new Map(),blockCache=new Map(),animations=new Set();let shadeTools=false;
export const textureURL=name=>assetData.textures?.[baseTexture(name)]||null;
export const toolTextureName=name=>itemDefs[name]?.texture||null;
export const toolIcon=name=>textureURL(toolTextureName(name))||(itemDefs[name]?.block?blockIcon(itemDefs[name].block):fallbackIcon());
export const baseTexture=name=>String(name||'').replace(/\[rot\[\d$/,'');
export function decode64(str){const raw=atob(str),a=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)a[i]=raw.charCodeAt(i);return a.buffer;}
export function pixelTexture(t){t.colorSpace=THREE.SRGBColorSpace;t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestMipmapLinearFilter;t.anisotropy=4;return t;}
export function resolveBlock(name){return blockDefs[name]?name:catalog.blockAliases?.[name]||null;}
function textureFor(name,gltf=false){
 const base=baseTexture(name),source=textures[base];if(!source)return null;
 const rotation=String(name).match(/\[rot\[(\d)$/),key='texture:'+name+':'+gltf;
 if(!rotation&&!gltf)return source;
 if(materialCache.has(key))return materialCache.get(key);
 const t=source.clone();t.flipY=!gltf;if(rotation){t.center.set(.5,.5);t.rotation=(Number(rotation[1])-1)*Math.PI/2;}t.needsUpdate=true;materialCache.set(key,t);return t;
}
function material(spec,lit=true){
 const key='mat:'+JSON.stringify(spec)+':'+lit;if(materialCache.has(key))return materialCache.get(key);
 const options={map:spec.texture?textureFor(spec.texture,!!spec.gltf):null,side:spec.double?THREE.DoubleSide:THREE.FrontSide,vertexColors:!!spec.vertexColors,transparent:spec.alpha==='BLEND'||(spec.opacity!==undefined&&spec.opacity<1),alphaTest:spec.alpha==='MASK'?spec.cutoff??.5:spec.cutout?.5:0,opacity:spec.opacity??spec.color?.[3]??1};
 options.depthWrite=!options.transparent;
 const m=lit?new THREE.MeshStandardMaterial({...options,roughness:1,metalness:0}):new THREE.MeshBasicMaterial({...options,toneMapped:false});
 if(spec.color)m.color.setRGB(spec.color[0],spec.color[1],spec.color[2],THREE.LinearSRGBColorSpace);
 if(lit&&spec.glow){m.emissive.setRGB(.35,.35,.35);m.emissiveMap=m.map;m.emissiveIntensity=.8;}
 m.userData.assetMaterialSpec=spec;materialCache.set(key,m);return m;
}
function asMaterials(a){return a.length===1?a[0]:a;}
export function fallbackIcon(color='#5f7163'){return 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><path fill="'+color+'" stroke="#b2c5ad" d="M20 3 36 12v17L20 38 4 29V12Z"/><path fill="none" stroke="#d6e8c7" d="m4 12 16 9 16-9M20 21v17"/></svg>');}
export function blockIcon(type){const d=blockDefs[resolveBlock(type)||type];if(!d)return fallbackIcon();return textureURL(d.icon||d.top||d.side)||fallbackIcon(d.color?'rgb('+d.color.slice(0,3).map(n=>Math.round(n*255)).join(',')+')':'#5f7163');}
export function setToolLighting(lit,scene){
 shadeTools=!!lit;const visit=root=>root.traverse(o=>{if(o.isMesh&&o.userData.itemSpecs)o.material=asMaterials(o.userData.itemSpecs.map(s=>material(s,shadeTools)));});models.forEach(visit);if(scene)visit(scene);
}
function typed(attribute){const b=decode64(attribute.data),C=attribute.type==='u16'?Uint16Array:attribute.type==='u32'?Uint32Array:Float32Array;return new C(b);}
function rawModel(name){
 if(rawCache.has(name))return rawCache.get(name);const data=assetData.models[name];if(!data)throw new Error('Source model unavailable: '+name);
 const root=new THREE.Group();root.name=name;
 for(const p of data.parts){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(typed(p.p),3));if(p.n)g.setAttribute('normal',new THREE.BufferAttribute(typed(p.n),3));if(p.uv)g.setAttribute('uv',new THREE.BufferAttribute(typed(p.uv),2));if(p.c)g.setAttribute('color',new THREE.BufferAttribute(typed(p.c),p.c.size));g.setIndex(new THREE.BufferAttribute(typed(p.i),1));if(!p.n)g.computeVertexNormals();g.computeBoundingBox();
  const spec={...data.mats[p.m],gltf:true,vertexColors:!!p.c},mesh=new THREE.Mesh(g,material(spec,false));mesh.userData.itemSpecs=[spec];mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
 }
 rawCache.set(name,root);return root;
}
export function spriteGeometry(image,thickness=.36){
 const canvas=document.createElement('canvas'),w=image.width,h=image.height;canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const rgba=ctx.getImageData(0,0,w,h).data;
 const opaque=(x,y)=>x>=0&&x<w&&y>=0&&y<h&&rgba[(y*w+x)*4+3]>=128;const positions=[],normals=[],uvs=[],colors=[];
 function quad(points,n,uv,color=1){for(const i of[0,1,2,0,2,3]){positions.push(...points[i]);normals.push(...n);uvs.push(...uv[i]);colors.push(color,color,color);}}
 let pixels=0;for(let row=0;row<h;row++)for(let col=0;col<w;col++){
  if(!opaque(col,row))continue;pixels++;const x0=col-w/2,x1=x0+1,y1=h/2-row,y0=y1-1,z0=-thickness/2,z1=thickness/2,u0=col/w,u1=(col+1)/w,v0=1-(row+1)/h,v1=1-row/h;
  quad([[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],[0,0,1],[[u0,v0],[u1,v0],[u1,v1],[u0,v1]]);quad([[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]],[0,0,-1],[[u1,v0],[u0,v0],[u0,v1],[u1,v1]]);
  const uv=Array.from({length:4},()=>[(col+.5)/w,1-(row+.5)/h]);
  if(!opaque(col-1,row))quad([[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]],[-1,0,0],uv,.72);
  if(!opaque(col+1,row))quad([[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]],[1,0,0],uv,.72);
  if(!opaque(col,row-1))quad([[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]],[0,1,0],uv,.9);
  if(!opaque(col,row+1))quad([[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]],[0,-1,0],uv,.65);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeBoundingBox();g.userData={opaquePixels:pixels,sourceWidth:w,sourceHeight:h,thickness};return g;
}
function cubePart(bounds,crop=true){
 const[a,b,c,d,e,f]=bounds,g=new THREE.BoxGeometry(d-a,e-b,f-c);g.translate((a+d)/2-.5,(b+e)/2-.5,(c+f)/2-.5);
 if(crop){const pos=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;for(let i=0;i<pos.count;i++){const x=pos.getX(i)+.5,y=pos.getY(i)+.5,z=pos.getZ(i)+.5,nx=n.getX(i),ny=n.getY(i),nz=n.getZ(i);if(nx)uv.setXY(i,nx>0?1-z:z,y);else if(ny)uv.setXY(i,x,ny>0?1-z:z);else uv.setXY(i,nz>0?x:1-x,y);}}
 return g;
}
function merge(parts){
 const arrays={position:[],normal:[],uv:[],color:[]},mats=[],specs=[],groups=[];let start=0;
 for(const part of parts){const g=part.geometry.index?part.geometry.toNonIndexed():part.geometry,local=Array.isArray(part.material)?part.material:[part.material],attrs=g.attributes;
  if(!attrs.normal)g.computeVertexNormals();const base=mats.length;mats.push(...local);specs.push(...local.map(m=>m.userData.assetMaterialSpec));
  for(const group of(g.groups.length?g.groups:[{start:0,count:attrs.position.count,materialIndex:0}]))groups.push({start:start+group.start,count:group.count,materialIndex:base+group.materialIndex});
  for(let i=0;i<attrs.position.count;i++){arrays.position.push(attrs.position.getX(i),attrs.position.getY(i),attrs.position.getZ(i));arrays.normal.push(attrs.normal.getX(i),attrs.normal.getY(i),attrs.normal.getZ(i));arrays.uv.push(attrs.uv?.getX(i)||0,attrs.uv?.getY(i)||0);arrays.color.push(attrs.color?.getX(i)??1,attrs.color?.getY(i)??1,attrs.color?.getZ(i)??1,attrs.color?.itemSize===4?attrs.color.getW(i):1);}
  start+=attrs.position.count;
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(arrays.position,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(arrays.normal,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(arrays.uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(arrays.color,4));groups.forEach(x=>g.addGroup(x.start,x.count,x.materialIndex));g.computeBoundingBox();g.computeBoundingSphere();return{geometry:g,materials:mats,specs};
}
function blockMaterial(def,face){
 const name=def.faces[face]||def.icon,water=def.id==='water',base={texture:name||null,double:!!def.transparent,cutout:!!def.transparent,glow:/Neon|Portal|Lava|Glowstone/.test(def.name)};
 if(def.color)return material({color:def.color,opacity:def.color[3]??1,double:true},true);
 const meta=catalog.textureMeta[baseTexture(name)];if(meta?.hasAlpha)base.cutout=true;
 if(water){base.opacity=.72;base.alpha='BLEND';}
 return material(base,true);
}
export function getBlockPrototype(type){
 type=resolveBlock(type)||type;if(blockCache.has(type))return blockCache.get(type);const d=blockDefs[type];if(!d?.available)throw new Error('No public visual is available for block: '+type);
 const parts=[],mats=Array.from({length:6},(_,i)=>blockMaterial(d,i));
 if(d.model){
  const raw=rawModel(d.model),fit=/^(bone|gold)_antlers_model$/.test(d.model)?.1:1,matrix=new THREE.Matrix4().makeScale(d.modelScale/8*fit,d.modelScale/8*fit,d.modelScale/8*fit);
  for(const m of raw.children){const g=m.geometry.clone().applyMatrix4(matrix),spec={...m.material.userData.assetMaterialSpec};if(d.custom?.backFaceCulling===false)spec.double=true;parts.push({geometry:g,material:material(spec,!d.custom?.unlit)});}
 }else if(d.boxes?.length){for(let i=0;i<d.boxes.length;i+=6)parts.push({geometry:cubePart(d.boxes.slice(i,i+6)),material:mats});}
 else if(d.shape==='Slab'){
  let box=d.state.endsWith('|top')?[0,.5,0,1,1,1]:d.state.endsWith('|side')?[0,0,0,1,1,.5]:[0,0,0,1,.5,1];parts.push({geometry:cubePart(box),material:mats});
 }else if(['CentreCross','SquareSided','CustomPlanes|rotatable'].includes(d.shape)){
  const mat=material({texture:d.faces[0]||d.icon,double:true,alpha:'MASK',cutoff:.25},true),planes=d.shape==='SquareSided'?[[0,0,.25],[0,0,-.25],[Math.PI/2,.25,0],[Math.PI/2,-.25,0]]:[[Math.PI/4,0,0],[-Math.PI/4,0,0]];
  for(const [angle,x,z] of planes){const g=new THREE.PlaneGeometry(1,1);g.rotateY(angle);g.translate(x,0,z);parts.push({geometry:g,material:mat});}
 }else parts.push({geometry:cubePart([0,0,0,1,1,1],false),material:mats});
 const result=merge(parts),g=result.geometry,c=d.custom||{},turn=((d.rotation||1)-1)*Math.PI/2;
 if(d.model){
  if(d.shape==='door'){if(d.open){g.rotateY(-Math.PI/2);g.translate(-.4375,0,0);}else g.translate(0,0,-.4375);}
  else if(d.shape==='trapdoor'){if(d.open){g.rotateX(Math.PI/2);g.translate(0,0,-.4375);}else g.translate(0,-.4375,0);}
  else if(d.shape==='rotatableOffset')g.translate(0,0,-(['Pine Ladder','Plum Ladder','Jungle Ladder'].includes(d.name.split('|')[0])?.375:.4375));
  if(c.xRotOffset)g.rotateX(c.xRotOffset);if(c.yRotOffset)g.rotateY(c.yRotOffset);if(c.zRotOffset)g.rotateZ(c.zRotOffset);
  g.translate(c.xOffset||0,c.yOffset||0,c.zOffset||0);
 }
 if(turn&&!d.boxes)g.rotateY(turn);g.computeBoundingBox();g.computeBoundingSphere();d.surfaceHeight=g.boundingBox.max.y+.5;d.fullCube=!d.model&&!d.boxes&&d.shape==='cube';d.occludes=d.fullCube&&!d.transparent&&!d.color&&!d.invisible&&d.id!=='water';
 if(d.animation?.length){const frames=d.animation.filter(n=>textures[baseTexture(n)]);if(frames.length>1)for(const m of result.materials)animations.add({material:m,frames,last:-1});}
 if(d.faceAnimations?.some(Boolean)){d.faceIndices?.forEach((index,side)=>{const frames=d.faceAnimations[index]?.filter(n=>textures[baseTexture(n)]);if(frames?.length>1)animations.add({material:result.materials[side],frames,last:-1});});}
 g.userData.blockType=type;g.userData.sourceShape=d.shape;blockCache.set(type,result);return result;
}
export function updateAssetAnimations(time){for(const a of animations){const frame=Math.floor(Math.max(0,time)*8)%a.frames.length;if(frame!==a.last){a.material.map=textureFor(a.frames[frame]);a.last=frame;}}}
export async function loadAssets(progress=()=>{}){
 const bytes=new Uint8Array(decode64(PACK.payload));Object.assign(assetData,JSON.parse(strFromU8(gunzipSync(bytes))));Object.assign(catalog,assetData.catalog);Object.assign(itemDefs,catalog.items);
 for(const id of catalog.blockOrder){const def={...catalog.blocks[id]};def.water=id==='water';def.fullCube=!def.model&&!def.boxes&&def.shape==='cube';def.occludes=def.fullCube&&!def.transparent&&!def.color&&def.available;def.surfaceHeight=def.shape==='Slab'?(def.state.endsWith('|top')?1:.5):def.model?Math.max(0,assetData.models[def.model].max[1]*def.modelScale/8+(def.custom.yOffset||0)+.5):1;Object.defineProperty(def,'mats',{get:()=>getBlockPrototype(id).materials});blockDefs[id]=def;}
 // Alias the old small library's keys, so saved v1–v3 scenes remain compatible.
 for(const n of catalog.itemOrder)if(itemDefs[n].available)toolNames.push(n);for(const m of catalog.sourceModels)toolNames.push(m.asset);
 progress(.08);const entries=Object.entries(assetData.textures),loader=new THREE.TextureLoader();let cursor=0,done=0;
 async function worker(){while(cursor<entries.length){const[k,url]=entries[cursor++];const t=pixelTexture(await loader.loadAsync(url));textures[k]=t;progress(.08+.88*(++done/entries.length));}}
 await Promise.all(Array.from({length:24},worker));textures.bob=pixelTexture(await loader.loadAsync(assetData.skin));
 // Eagerly create only the initial scene's small set; the rest are lazy and cached.
 for(const name of ['Diamond Pickaxe','Diamond Sword','Diamond Axe'])ensureItem(name);progress(1);
}
function ensureItem(name){
 if(models.has(name))return models.get(name);const d=itemDefs[name];if(!d?.available)throw new Error('No published visual is available for item: '+name);let root;
 if(d.kind==='block-item'&&!d.sprite){root=makeBlock(d.block);root.traverse(o=>{if(o.isMesh){const mats=Array.isArray(o.material)?o.material:[o.material];o.userData.itemSpecs=mats.map(m=>m.userData.assetMaterialSpec);o.material=asMaterials(o.userData.itemSpecs.map(s=>material(s,shadeTools)));}});}
 else if(d.sprite||!d.model){
  const key=d.texture,tex=textures[key];if(!tex?.image)throw new Error('Missing item image: '+name);let geo=geometryCache.get(key);if(!geo){geo=spriteGeometry(tex.image);geometryCache.set(key,geo);}const spec={texture:key,double:true,vertexColors:true};const mesh=new THREE.Mesh(geo,material(spec,shadeTools));mesh.userData.itemSpecs=[spec];mesh.userData.toolTexture=key;mesh.userData.item=true;mesh.castShadow=true;mesh.receiveShadow=true;root=new THREE.Group();root.add(mesh);
 }else{root=rawModel(d.model).clone(true);root.traverse(o=>{if(o.isMesh){o.userData.itemSpecs=o.userData.itemSpecs||[(Array.isArray(o.material)?o.material[0]:o.material).userData.assetMaterialSpec];o.material=asMaterials(o.userData.itemSpecs.map(s=>material(s,shadeTools)));}});}
 root.name=name;models.set(name,root);return root;
}
export function makeTool(name,height=1.05,held=false){
 const source=ensureItem(name),outer=new THREE.Group(),obj=source.clone(true);outer.name=name;const box=new THREE.Box3().setFromObject(obj),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),s=height/Math.max(size.x,size.y,size.z,.01);obj.scale.setScalar(s);
 const oldGrip=held&&itemDefs[name]?.sprite&&/(Pickaxe|Sword|Axe|Spade|Hoe|Bow|Shears|Spear|Dagger)$/.test(name);
 if(oldGrip)obj.position.set(2.5*s,2.5*s,0);else obj.position.set(-center.x*s,-center.y*s,-center.z*s);outer.add(obj);outer.userData.asset=name;outer.userData.item=true;outer.userData.toolTexture=toolTextureName(name);return outer;
}
export function makeBlock(type='grass'){
  type=resolveBlock(type)||type;const def=blockDefs[type],root=new THREE.Group();root.name=def.label;
  if(def.water){
    const g=buildWaterGeometry([[0,0,0]],()=>null,()=>false);g.translate(-.5,-.5,-.5);
    const mesh=new THREE.Mesh(g,waterMaterial());mesh.renderOrder=2;mesh.castShadow=false;mesh.receiveShadow=true;mesh.userData.blockType=type;root.add(mesh);return root;
  }
  const prototype=getBlockPrototype(type);const mesh=new THREE.Mesh(prototype.geometry,prototype.materials);mesh.castShadow=!def.invisible;mesh.receiveShadow=true;mesh.userData.blockType=type;root.add(mesh);return root;
}
export function makeLamp(){
 const root=new THREE.Group();root.name='Lantern';const cube=(w,h,d,c,y)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color:c,roughness:.8}));m.position.y=y;m.castShadow=m.receiveShadow=true;root.add(m);return m;};
 cube(.16,1.7,.16,0x64482d,.85);cube(.42,.10,.42,0x343e39,1.72);const glow=cube(.28,.32,.28,0xffcf70,1.92);glow.material.emissive.set(0xffb63b);glow.material.emissiveIntensity=2;cube(.42,.1,.42,0x343e39,2.12);const light=new THREE.PointLight(0xffbd64,12,7,2);light.position.y=2;root.add(light);return root;
}

// Small previews are generated on demand, not thousands of eager WebGL scenes.
let thumbRenderer=null,thumbScene=null,thumbCamera=null;const thumbs=new Map();
export function renderAssetThumbnail(kind,id){
 const key=kind+':'+id;if(thumbs.has(key))return thumbs.get(key);
 if(!thumbRenderer){thumbRenderer=new THREE.WebGLRenderer({alpha:true,antialias:false});thumbRenderer.setSize(64,64,false);thumbRenderer.setPixelRatio(1);thumbRenderer.outputColorSpace=THREE.SRGBColorSpace;thumbScene=new THREE.Scene();thumbScene.add(new THREE.HemisphereLight(0xffffff,0x626d65,2));const sun=new THREE.DirectionalLight(0xffffff,2.1);sun.position.set(2,4,6);thumbScene.add(sun);thumbCamera=new THREE.OrthographicCamera(-.95,.95,.95,-.95,.01,100);thumbCamera.position.set(2,1.5,3);thumbCamera.lookAt(0,0,0);}
 const object=kind==='block'?makeBlock(id):makeTool(id,1.2),mats=[];
 object.traverse(o=>{if(o.isMesh){const list=(Array.isArray(o.material)?o.material:[o.material]).map(m=>{const n=new THREE.MeshStandardMaterial({map:m.map,color:m.color.clone(),vertexColors:m.vertexColors,transparent:m.transparent,opacity:m.opacity,alphaTest:m.alphaTest,side:THREE.DoubleSide,roughness:1,metalness:0});mats.push(n);return n;});o.material=asMaterials(list);}});
 const box=new THREE.Box3().setFromObject(object),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),scale=1.3/Math.max(size.x,size.y,size.z,.01);object.scale.multiplyScalar(scale);object.position.addScaledVector(center,-scale);thumbScene.add(object);thumbRenderer.render(thumbScene,thumbCamera);const url=thumbRenderer.domElement.toDataURL('image/png');thumbScene.remove(object);mats.forEach(m=>m.dispose());thumbs.set(key,url);return url;
}
