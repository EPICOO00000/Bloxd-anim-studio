// Codec parity with VoxelForge (Blockstudio V4.7 bloxd-schematic.js): the writer below is
// a verbatim port of the author's encodeSchematic, so anything it produces must round-trip
// through our parseBloxdschem + readSchematicFile exactly like it does in their editor.
import { parseBloxdschem } from '../lib/bloxdschem.js';
import { readSchematicFile } from '../lib/schematics.js';
import { loadAssets } from '../lib/assets.js';

const CHUNK_SIZE=32,CHUNK_VOLUME=32768;
function writeUvarint(value){let n=Math.max(0,Math.floor(value));const bytes=[];while(n>=0x80){bytes.push((n&0x7f)|0x80);n=Math.floor(n/128);}bytes.push(n&0x7f);return new Uint8Array(bytes);}
function writeAvroInt(value){const n=Math.floor(value);return writeUvarint(n<0?(-n*2-1):n*2);}
function concatBytes(parts){const size=parts.reduce((t,p)=>t+p.length,0),out=new Uint8Array(size);let o=0;parts.forEach(p=>{out.set(p,o);o+=p.length;});return out;}
function writeAvroString(value){const bytes=new TextEncoder().encode(value);return concatBytes([writeAvroInt(bytes.length),bytes]);}
function writeAvroBytes(value){return concatBytes([writeAvroInt(value.length),value]);}
function encodeChunkRLE(blocks){const parts=[];for(let index=0;index<blocks.length;){const id=blocks[index];let count=1;while(index+count<blocks.length&&blocks[index+count]===id)count++;parts.push(writeUvarint(count),writeUvarint(id));index+=count;}return concatBytes(parts);}
// Verbatim structure of VoxelForge encodeSchematic, with an extra origin parameter so we
// can also verify the header-position behaviour their decodeSchematic applies.
function encodeSchematic(voxels,name,origin={x:0,y:0,z:0}){
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  voxels.forEach((id,key)=>{const [x,y,z]=key.split(',').map(Number);minX=Math.min(minX,x);minY=Math.min(minY,y);minZ=Math.min(minZ,z);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);maxZ=Math.max(maxZ,z);});
  const actualSize={x:maxX-minX+1,y:maxY-minY+1,z:maxZ-minZ+1};
  const chunkCount={x:Math.ceil(actualSize.x/CHUNK_SIZE),y:Math.ceil(actualSize.y/CHUNK_SIZE),z:Math.ceil(actualSize.z/CHUNK_SIZE)};
  const totalChunks=chunkCount.x*chunkCount.y*chunkCount.z;
  const chunks=new Map();
  voxels.forEach((id,key)=>{const [x0,y0,z0]=key.split(',').map(Number);const x=x0-minX,y=y0-minY,z=z0-minZ;const cx=Math.floor(x/CHUNK_SIZE),cy=Math.floor(y/CHUNK_SIZE),cz=Math.floor(z/CHUNK_SIZE);const k=`${cx},${cy},${cz}`;if(!chunks.has(k))chunks.set(k,new Int32Array(CHUNK_VOLUME));chunks.get(k)[(x%32)*1024+(y%32)*32+(z%32)]=id;});
  const paddedSize={x:chunkCount.x*32,y:chunkCount.y*32,z:chunkCount.z*32};
  const emptyRLE=encodeChunkRLE(new Int32Array(CHUNK_VOLUME));
  const parts=[new Uint8Array([0,0,0,0]),writeAvroString(name||'3D Model')];
  parts.push(writeAvroInt(origin.x),writeAvroInt(origin.y),writeAvroInt(origin.z));
  parts.push(writeAvroInt(paddedSize.x),writeAvroInt(paddedSize.y),writeAvroInt(paddedSize.z));
  parts.push(writeAvroInt(totalChunks));
  for(let cx=0;cx<chunkCount.x;cx++)for(let cy=0;cy<chunkCount.y;cy++)for(let cz=0;cz<chunkCount.z;cz++){
    const key=`${cx},${cy},${cz}`;
    parts.push(writeAvroInt(cx),writeAvroInt(cy),writeAvroInt(cz));
    parts.push(writeAvroBytes(chunks.has(key)?encodeChunkRLE(chunks.get(key)):emptyRLE));
  }
  parts.push(writeAvroInt(0));
  return concatBytes(parts);
}

// A build spanning 3 X-chunks with a hole in the middle (forces the empty-chunk path),
// using real Bloxd ids: 2 Dirt, 4 Grass Block, 28 Stone, 126 Water.
const voxels=new Map();
for(let x=0;x<8;x++)for(let z=0;z<8;z++){voxels.set(`${x},0,${z}`,x+z<4?4:2);}
voxels.set('2,1,2',126);voxels.set('3,1,3',28);
for(let y=0;y<6;y++)voxels.set(`64,${y},0`,28);   // far chunk → middle chunk stays empty
const bytes=encodeSchematic(voxels,'parity model');

const parsed=parseBloxdschem(bytes,'parity model.bloxdschem');
if(parsed.total!==voxels.size)throw new Error('decoded '+parsed.total+' blocks, encoder wrote '+voxels.size);
for(const [key,id] of voxels)if(parsed.cells.get(key)!==id)throw new Error('cell '+key+' = '+parsed.cells.get(key)+', want '+id);
console.log('VoxelForge encoder round-trip OK:',parsed.total,'blocks · name "'+parsed.name+'" · padded size',parsed.size.join('×'));

// Their decoder adds the header origin to every coordinate — ours must too.
const shifted=parseBloxdschem(encodeSchematic(voxels,'origin model',{x:5,y:2,z:-3}),'origin.bloxdschem');
if(shifted.cells.get('5,2,-3')!==4)throw new Error('origin not applied to cells');
if(shifted.total!==voxels.size)throw new Error('origin variant total mismatch');
console.log('header origin application OK');

// Routing through the real app entry point.
await loadAssets().catch(e=>console.warn('asset load warn:',e.message));
const r1=readSchematicFile('model.bloxdschem',bytes);
if(!r1.sch||r1.kind!=='bloxdschem')throw new Error('magic+ext routing failed: '+(r1.error||r1.kind));
if(r1.sch.cells.size!==voxels.size)throw new Error('mapped cells '+r1.sch.cells.size);
// Same bytes WITHOUT the four-zero magic must still decode via the extension path.
const r2=readSchematicFile('model.bloxdschem',bytes.subarray(4));
if(!r2.sch)throw new Error('no-magic .bloxdschem routing failed: '+r2.error);
// JSON text schematics keep working.
const r3=readSchematicFile('build.json',new TextEncoder().encode(JSON.stringify({blocks:{'0,0,0':'grass','1,0,0':'dirt'}})));
if(!r3.sch||r3.kind!=='text'||r3.sch.cells.size!==2)throw new Error('text routing failed');
// Garbage with a schem extension yields a real error message, not a generic shrug.
const r4=readSchematicFile('broken.bloxdschem',new Uint8Array([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]));
if(r4.sch||!r4.error)throw new Error('garbage should fail with an error message');
console.log('routing OK · garbage error message: "'+r4.error+'"');
console.log('ALL VOXELFORGE CODEC PARITY TESTS PASSED');
