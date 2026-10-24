// Runtime access to the embedded prefab build library (923 house/tree/rock/stand assets
// from the open Bloxd Map Editor pack). Decodes .bloxdschem payloads on demand and maps
// the numeric Bloxd ids onto the studio catalog.
import PACK from './prefab-data.js';
import { gunzipSync } from '../vendor/fflate.js';
import { decode64 } from './assets.js';
import { parseBloxdschem } from './bloxdschem.js';
import { mapBloxdschem } from './schematics.js';
export const prefabAssets=PACK.assets;
let bytes=null;
const cache=new Map();
export function loadPrefabs(){if(!bytes)bytes=gunzipSync(new Uint8Array(decode64(PACK.payload)));return prefabAssets;}
export function prefabRaw(asset){loadPrefabs();return bytes.subarray(asset.off,asset.off+asset.s);}
export function prefabCells(asset){
  if(cache.has(asset.n))return cache.get(asset.n);
  const sch=mapBloxdschem(parseBloxdschem(prefabRaw(asset),asset.f));
  if(cache.size>40)cache.clear();
  cache.set(asset.n,sch);
  return sch;
}
