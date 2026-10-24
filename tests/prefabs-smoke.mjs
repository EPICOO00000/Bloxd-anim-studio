// Verifies the embedded prefab pack: every one of the 922 assets must decode with the
// binary .bloxdschem reader and its block total must match the source index metadata.
import { loadPrefabs, prefabAssets, prefabRaw, prefabCells } from '../lib/prefabs.js';
import { parseBloxdschem } from '../lib/bloxdschem.js';
import { loadAssets } from '../lib/assets.js';

loadPrefabs();
console.log('assets in pack:',prefabAssets.length);
if(prefabAssets.length!==922)throw new Error('expected 922 assets, got '+prefabAssets.length);
const byType={};for(const a of prefabAssets)byType[a.t]=(byType[a.t]||0)+1;
console.log('by type:',byType);

let blocks=0,t0=Date.now();
for(const a of prefabAssets){
  const parsed=parseBloxdschem(prefabRaw(a),a.f);
  if(parsed.total!==a.b)throw new Error(a.n+': decoded '+parsed.total+' blocks, index says '+a.b);
  blocks+=parsed.total;
}
console.log('all',prefabAssets.length,'assets decoded in',Date.now()-t0,'ms ·',blocks.toLocaleString(),'blocks total');

// Catalog mapping on one of each type (needs blockDefs).
await loadAssets().catch(e=>console.warn('asset load warn:',e.message));
for(const t of Object.keys(byType)){
  const a=prefabAssets.find(x=>x.t===t),sch=prefabCells(a);
  if(!sch.cells.size)throw new Error('no mapped cells for '+a.n);
  console.log(t,'sample',a.n,'→',sch.cells.size.toLocaleString(),'mapped blocks,',sch.unmapped.length,'unmapped ids');
}
console.log('ALL PREFAB TESTS PASSED');
