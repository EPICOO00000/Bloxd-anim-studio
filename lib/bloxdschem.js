// Binary .bloxdschem reader.
// Format reference: Souls-equal/Bloxd_Map_Editor (schem_converter-core.js / schem_splitter.js),
// the user's own map-editor suite — used with permission, no attribution required.
//
// Layout:
//   [00 00 00 00]                       four zero bytes
//   [zigzag-varint len][name UTF-8]     schematic name
//   [x,y,z zigzag]                      origin (informational)
//   [sizeX,sizeY,sizeZ zigzag]          dimensions
//   [groupCount zigzag]                 then groupCount chunk entries, finally a 0 terminator
//   per entry: cx,cy,cz zigzag, len zigzag, len bytes of RLE
//   RLE: unsigned-varint pairs (runLength, blockId) filling a 32³ chunk,
//        index inside a chunk = lx*1024 + ly*32 + lz
//   A negative group count means "read one extra zigzag and skip it" (variant writer).
// Multi-part exports carry world offsets in the filename: name_x<ox>_z<oz>.bloxdschem
const CHUNK=32,VOL=32768;
function ruv(b,o){let x=0,s=0;for(let i=0;i<10&&o.v<b.length;i++){const c=b[o.v++];x|=(c&127)<<s;s+=7;if(!(c&128))return x>>>0;}return x>>>0;}
function rai(b,o){const z=ruv(b,o);return (z>>>1)^-(z&1);}
export function isBloxdschem(u8){return u8&&u8.length>16&&u8[0]===0&&u8[1]===0&&u8[2]===0&&u8[3]===0;}
export function parseBloxdschem(u8,fileName=''){
  if(!(u8 instanceof Uint8Array))u8=new Uint8Array(u8);
  const o={v:0};
  for(let i=0;i<4;i++){if(o.v<u8.length&&u8[o.v]===0)o.v++;else break;}
  const nl=rai(u8,o);
  if(nl<0||nl>4096||o.v+nl>u8.length)throw new Error('Not a .bloxdschem file (bad header).');
  const name=new TextDecoder().decode(u8.subarray(o.v,o.v+nl));o.v+=nl;
  rai(u8,o);rai(u8,o);rai(u8,o);            // origin (chunks carry absolute coords)
  const sx=rai(u8,o),sy=rai(u8,o),sz=rai(u8,o);
  let ox=0,oz=0;const m=String(fileName).match(/_x(-?\d+)_z(-?\d+)[./]/);if(m){ox=+m[1];oz=+m[2];}
  const cells=new Map();let total=0,groups=0;
  while(o.v<u8.length){
    let bc=rai(u8,o);
    if(bc===0)break;
    if(bc<0){bc=-bc;rai(u8,o);}
    if(++groups>4096||bc>4096)throw new Error('Corrupt .bloxdschem (too many chunks).');
    for(let i=0;i<bc;i++){
      const cx=rai(u8,o),cy=rai(u8,o),cz=rai(u8,o);
      const l=rai(u8,o);
      if(l<0||o.v+l>u8.length)throw new Error('Corrupt .bloxdschem (truncated chunk).');
      const rle=u8.subarray(o.v,o.v+l);o.v+=l;
      const arr=new Int32Array(VOL);const ro={v:0};let idx=0;
      while(idx<VOL&&ro.v<rle.length){
        const c=ruv(rle,ro),id=ruv(rle,ro);
        if(!c)break;
        for(let k=0;k<c&&idx<VOL;k++)arr[idx++]=id;
      }
      const bX=cx*CHUNK+ox,bY=cy*CHUNK,bZ=cz*CHUNK+oz;
      for(let lx=0;lx<CHUNK;lx++)for(let ly=0;ly<CHUNK;ly++)for(let lz=0;lz<CHUNK;lz++){
        const id=arr[lx*1024+ly*32+lz];
        if(!id)continue;
        cells.set((bX+lx)+','+(bY+ly)+','+(bZ+lz),id);total++;
      }
    }
  }
  if(!total)throw new Error('This .bloxdschem contains no blocks.');
  return {name,cells,size:[sx,sy,sz],total};
}
