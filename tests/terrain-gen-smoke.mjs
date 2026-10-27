// Smoke tests for procedural world generation: determinism, bounds, biome palettes,
// snow caps, cliff vines, forests, canyon rivers and size limits.
import assert from 'node:assert/strict';
import { loadAssets, blockDefs } from '../lib/assets.js';
import { generateTerrain, GEN_STYLES, hashSeed } from '../lib/terrain-gen.js';
import { BIOMES, pick } from '../lib/terrain-brush.js';

// Same pattern as the terrain-brush smoke: blockDefs fill synchronously, texture
// loading fails harmlessly in node.
await loadAssets().catch(()=>{});

let n=0;const ok=(c,m)=>{assert.ok(c,m);n++;};
// Resolve a biome palette to real catalog ids.
const pal=bio=>{const P=BIOMES[bio],out={};for(const k of Object.keys(P))out[k]=pick(P[k]);return out;};

// ── determinism ──
const a=generateTerrain({seed:'arena',size:64,style:'mountains',biome:'temperate'});
const b=generateTerrain({seed:'arena',size:64,style:'mountains',biome:'temperate'});
ok(a.cells.length===b.cells.length&&a.cells.every((c,i)=>c[0]===b.cells[i][0]&&c[1]===b.cells[i][1]&&c[2]===b.cells[i][2]&&c[3]===b.cells[i][3]),'same seed → identical world');
const other=generateTerrain({seed:'other',size:64,style:'mountains'});
ok(other.cells.length!==a.cells.length||a.cells.some((c,i)=>c[1]!==other.cells[i]?.[1]||c[3]!==other.cells[i]?.[3]),'different seed → different world');
ok(hashSeed(42)===42&&hashSeed('x')===hashSeed('x')&&hashSeed('x')!==hashSeed('y'),'seed hashing is stable');

// ── bounds + type validity across every cell ──
let boundsOk=true,yOk=true,typeOk=true;
for(const[x,y,z,t]of a.cells){
  if(Math.abs(x)>32||Math.abs(z)>32)boundsOk=false;
  if(y<-8||y>40)yOk=false;
  if(!blockDefs[t]?.available)typeOk=false;
}
ok(boundsOk,'every cell inside the requested footprint');
ok(yOk,'every cell inside the vertical build range');
ok(typeOk,'every cell uses an available catalog block');
ok(a.cells.length>1000,'a real world, not a stub');
ok(a.stats.size===64&&a.stats.columns>500,'stats reported');

// ── mountains: peaks, snow caps, water, beaches ──
const T=pal('temperate');
const countType=(gen,id)=>gen.cells.reduce((m,c)=>m+(c[3]===id?1:0),0);
ok(a.stats.peak>=GEN_STYLES.mountains.snow,'mountains reach the snow line (peak '+a.stats.peak+')');
ok(countType(a,T.snow)>0,'snow caps present');
ok(countType(a,T.stone)>0,'exposed rock on steep terrain');
ok(a.stats.water>0&&countType(a,T.water)>0,'lakes / coastal water present');
ok(countType(a,T.beach)>0,'beaches ring the water');
ok(countType(a,T.surface)>countType(a,T.snow),'grass outruns snow');

// ── cliff vines ──
ok(a.stats.vines>0&&countType(a,T.leaves)>0,'ivy hangs on the cliffs by default');
const noVines=generateTerrain({seed:'arena',size:64,style:'mountains',vines:false});
ok(noVines.stats.vines===0,'vines can be turned off');

// ── forests ──
ok(a.stats.trees>0,'temperate mountains grow trees');
const noTrees=generateTerrain({seed:'arena',size:64,style:'mountains',trees:false});
ok(noTrees.stats.trees===0,'trees can be turned off');
const arid=generateTerrain({seed:'arena',size:64,style:'hills',biome:'arid'});
ok(arid.stats.trees>0&&countType(arid,pal('arid').log)>0,'arid hills get cacti');

// ── islands & canyon personalities ──
const isl=generateTerrain({seed:'arena',size:64,style:'islands',biome:'tropical'});
ok(isl.stats.water>0,'islands are surrounded by / filled with sea');
ok(isl.stats.peak<GEN_STYLES.islands.amp+8,'islands stay low and tropical');
const can=generateTerrain({seed:'arena',size:64,style:'canyon'});
ok(can.stats.peak>=GEN_STYLES.canyon.base,'canyon plateaus tower over the river');
ok(can.stats.water>0,'a river runs through the canyon');
const hills=generateTerrain({seed:'arena',size:64,style:'hills'});
ok(hills.stats.peak<12,'rolling hills stay gentle');

// ── exotic biomes swap palettes ──
const volc=generateTerrain({seed:'arena',size:64,style:'mountains',biome:'volcanic'});
ok(countType(volc,pal('volcanic').water)>0,'volcanic worlds fill lows with lava');
ok(countType(volc,pal('volcanic').surface)>0,'basalt surfaces');
const alien=generateTerrain({seed:'arena',size:48,style:'islands',biome:'alien'});
ok(alien.cells.length>0,'alien palette generates');

// ── big worlds stay inside the project limits ──
const big=generateTerrain({seed:'arena',size:160,style:'hills'});
ok(big.stats.size===160,'titanic footprint honoured');
ok(big.cells.length<250000,'block count stays under the 250k project cap ('+big.cells.length+')');
ok(big.stats.peak<=38,'peaks stay inside the heightAt scan range');

console.log('terrain-gen smoke OK · '+n+' assertions passed');
