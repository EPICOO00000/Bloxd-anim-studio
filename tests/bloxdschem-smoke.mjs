// Round-trip smoke test for the binary .bloxdschem decoder.
// Encoder here mirrors Bloxd_Map_Editor's encodeSchem (zigzag header, group count, wab-length-prefixed RLE).
import { parseBloxdschem, isBloxdschem } from '../lib/bloxdschem.js';
import { loadAssets } from '../lib/assets.js';
import { mapBloxdschem } from '../lib/schematics.js';

function wuv(a,n){while(n>127){a.push((n&127)|128);n>>>=7;}a.push(n);}
function wai(a,n){wuv(a,n<0?(-n*2-1):(n*2));}
function was(a,s){const b=new TextEncoder().encode(s);wai(a,b.length);a.push(...b);}
function wab(a,b){wai(a,b.length);a.push(...b);}
function encodeRLE(arr){ // Int32Array(32768)
  const out=[];let i=0;
  while(i<arr.length){const id=arr[i];let c=1;while(i+c<arr.length&&arr[i+c]===id&&c<2147483647)c++;wuv(out,c);wuv(out,id);i+=c;}
  return new Uint8Array(out);
}
function encodeSchem(name,chunks,{neg=false}={}){
  const a=[0,0,0,0];
  was(a,name);
  wai(a,0);wai(a,0);wai(a,0);          // origin
  wai(a,64);wai(a,32);wai(a,32);       // size
  if(neg){wai(a,-chunks.length);wai(a,0);}else wai(a,chunks.length);
  for(const ch of chunks){wai(a,ch.cx);wai(a,ch.cy);wai(a,ch.cz);wab(a,ch.rle);}
  wai(a,0);                            // terminator
  return new Uint8Array(a);
}
function chunk(cx,cy,cz,fill){const arr=new Int32Array(32768);fill(arr);return {cx,cy,cz,rle:encodeRLE(arr)};}
const idx=(x,y,z)=>x*1024+y*32+z;

// Scene: chunk0 = 5×5 dirt floor (id 2) + water (126) at (2,1,2) + stone (28) pillar; chunk1 = grass (4) at world x=32.
const c0=chunk(0,0,0,arr=>{
  for(let x=0;x<5;x++)for(let z=0;z<5;z++)arr[idx(x,0,z)]=2;
  arr[idx(2,1,2)]=126; arr[idx(4,1,4)]=28; arr[idx(4,2,4)]=28;
});
const c1=chunk(1,0,0,arr=>{arr[idx(0,0,0)]=4;});
const bytes=encodeSchem('house',[c0,c1]);
if(!isBloxdschem(bytes))throw new Error('isBloxdschem rejected own encoder output');
const parsed=parseBloxdschem(bytes,'house.bloxdschem');
console.log('name:',parsed.name,'total:',parsed.total,'size:',parsed.size);
const expect={'0,0,0':2,'2,1,2':126,'4,2,4':28,'32,0,0':4};
for(const [k,v] of Object.entries(expect))if(parsed.cells.get(k)!==v)throw new Error('cell '+k+' = '+parsed.cells.get(k)+', want '+v);
if(parsed.total!==25+1+2+1)throw new Error('total '+parsed.total+' != 29');

// Negative-count group variant
const neg=parseBloxdschem(encodeSchem('house',[c0,c1],{neg:true}),'house.bloxdschem');
if(neg.total!==parsed.total)throw new Error('negative-count variant total mismatch');

// Multi-part filename offsets shift X/Z
const part=parseBloxdschem(bytes,'house_x-32_z64.bloxdschem');
if(part.cells.get('-32,0,64')!==2||part.cells.get('0,0,64')!==4)throw new Error('filename offset not applied');

// Map through real catalog (needs assets loaded)
await loadAssets().catch(e=>console.warn('asset load warn:',e.message));
const mapped=mapBloxdschem(parsed);
console.log('mapped total:',mapped.cells.size,'unmapped:',mapped.unmapped);
for(const [k,v] of Object.entries({'0,0,0':'dirt','2,1,2':'water','32,0,0':'grass'})){
  if(mapped.cells.get(k)!==v)throw new Error('mapped '+k+' = '+mapped.cells.get(k)+', want '+v);
}
console.log('ALL BLOXDSCHEM TESTS PASSED');
