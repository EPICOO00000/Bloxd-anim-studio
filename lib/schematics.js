import { resolveBlock, blockDefs } from './assets.js';

// Numeric Bloxd game ids (as stored in .bloxdschem) → our block ids, from the catalog's gameId field.
let GAME_IDS=null;
function gameIdMap(){
  if(GAME_IDS)return GAME_IDS;
  GAME_IDS=new Map();
  for(const [id,d] of Object.entries(blockDefs)){
    if(d?.available&&Number.isFinite(d.gameId)&&!GAME_IDS.has(d.gameId))GAME_IDS.set(d.gameId,id);
  }
  return GAME_IDS;
}
export function mapBloxdschem(parsed){
  const map=gameIdMap(),cells=new Map(),unmapped=new Set();
  for(const [key,id] of parsed.cells){
    const ours=map.get(id);
    if(!ours){unmapped.add('id '+id);continue;}
    cells.set(key,ours);
  }
  if(!cells.size)throw new Error('None of the schematic’s block ids matched the public asset library.');
  return {cells,unmapped:[...unmapped],total:parsed.total,name:parsed.name};
}

// Tolerant Bloxd/community schematic reader. Accepts, among others:
//  · studio project worlds:      {"world":{"blocks":{"x,y,z":"grass"}}}  or  {"blocks":{"x,y,z":{block:"grass"}}}
//  · block lists:                {"blocks":[{"x":1,"y":2,"z":3,"name":"Stone"}]}
//  · paletted lists (Sponge-like):{"palette":[{"Name":"minecraft:stone"}],"blocks":[{"pos":[1,2,3],"state":0}]}
//  · VoxelForge-style exports:   {"cells":[...]} / {"name":..,"size":..,"blocks":[...]} with id|name|block|type fields
// Unknown block names are counted and skipped instead of failing the import.
function clean(s){return String(s??'').trim();}
function resolveName(raw){
  const s=clean(raw);if(!s)return null;
  const bare=s.replace(/^[a-z0-9_-]+:/i,'');
  const direct=resolveBlock(bare);if(direct&&blockDefs[direct]?.available)return direct;
  const lower=bare.toLowerCase().replace(/[_-]/g,' ');
  for(const [id,d] of Object.entries(blockDefs)){
    if(!d?.available)continue;
    const lab=String(d.label||d.name||'').toLowerCase();
    if(lab===lower||lab===lower+' block'||lab.replace(/ block$/,'')===lower)return id;
  }
  if(bare.includes('|')){const base=bare.split('|')[0];if(base&&base!==bare)return resolveName(base);}
  if(lower.includes(' ')){const us=lower.replace(/ /g,'_');const alt=resolveBlock(us);if(alt&&blockDefs[alt]?.available)return alt;}
  return null;
}
function posOf(b){
  let p=b.pos??b.position??b.cell??b.coordinates??b.xyz;
  if(Array.isArray(p)&&p.length>=3)return p.slice(0,3).map(Number);
  if(p&&typeof p==='object'&&'x'in p)return [Number(p.x),Number(p.y),Number(p.z)];
  if('x'in b&&'y'in b&&'z'in b)return [Number(b.x),Number(b.y),Number(b.z)];
  return null;
}
function nameOf(b,palette){
  let n=b.name??b.Name??b.id??b.block??b.type??b.blockName??b.blockId??b.material;
  if((n===undefined||n===null)&&palette){
    const st=b.state??b.palette??b.index;
    if(Number.isFinite(st)&&palette[st])n=typeof palette[st]==='string'?palette[st]:(palette[st].Name??palette[st].name??palette[st].id);
  }
  return n;
}
export function parseSchematic(text){
  let data;
  try{data=JSON.parse(text);}catch(e){throw new Error('Schematic is not valid JSON.');}
  if(!data||typeof data!=='object')throw new Error('Schematic file is empty.');
  const isMap=v=>v&&typeof v==='object'&&!Array.isArray(v);
  const mapSource=[data.world?.blocks,data.blocks,data.schematic?.blocks,data.data].find(isMap)||null;
  const raw=[];
  if(mapSource){
    for(const [k,v] of Object.entries(mapSource)){
      const p=k.split(/[,;\s]+/).filter(Boolean).map(Number);if(p.length!==3||!p.every(Number.isFinite))continue;
      raw.push([p,typeof v==='string'?v:(v?.block??v?.name??v?.id??v?.type)]);
    }
  }
  if(!raw.length){
    const lists=[data,data.blocks,data.cells,data.data,data.schematic?.blocks,data.world?.blocks,mapSource?.blocks].filter(Array.isArray);
    const palette=Array.isArray(data.palette)?data.palette:(Array.isArray(data.schematic?.palette)?data.schematic.palette:null);
    for(const list of lists){
      for(const b of list){
        if(!b||typeof b!=='object')continue;
        const p=posOf(b);if(!p||!p.every(Number.isFinite))continue;
        raw.push([p,nameOf(b,palette)]);
      }
      if(raw.length)break;
    }
  }
  if(!raw.length)throw new Error('This schematic contains no usable blocks.');
  if(raw.length>200000)throw new Error('Schematic too large (200,000 block limit).');
  const cells=new Map(),unmapped=new Set();
  for(const [p,name] of raw){
    const type=resolveName(name);
    if(!type){if(name)unmapped.add(clean(name));continue;}
    cells.set(p.map(Math.round).join(','),type);
  }
  if(!cells.size)throw new Error('None of the schematic’s block names matched the public asset library.');
  return {cells,unmapped:[...unmapped],total:raw.length};
}
