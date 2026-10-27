// Smoke tests for procedural world generation: determinism, bounds, biome palettes,
// snow caps, cliff vines, forests, canyon rivers, the five landscape personalities
// (volcano, mesas, dunes, pillars, craters) and giant 500-block worlds.
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
const T=pal('temperate');
const countType=(gen,id)=>{let m=0;for(const t of gen.map.values())if(t===id)m++;return m;};
// Ground-surface height per column: water and vegetation (trees/vines) don't count.
const groundIds=bio=>{const P=pal(bio);return new Set([P.surface,P.subsurface,P.stone,P.beach,P.snow]);};
const tops=(gen,bio='temperate')=>{const ids=groundIds(bio),H=new Map();for(const[k,t]of gen.map){if(!ids.has(t))continue;const[x,y,z]=k.split(',').map(Number);const kk=x+','+z;if(!H.has(kk)||y>H.get(kk))H.set(kk,y);}return H;};

// ── determinism ──
const a=generateTerrain({seed:'arena',size:64,style:'mountains',biome:'temperate'});
const b=generateTerrain({seed:'arena',size:64,style:'mountains',biome:'temperate'});
ok(a.map instanceof Map&&a.map.size>0,'generation returns a non-empty Map');
let identical=a.map.size===b.map.size;
if(identical)for(const[k,t]of a.map)if(b.map.get(k)!==t){identical=false;break;}
ok(identical,'same seed → identical world');
const other=generateTerrain({seed:'other',size:64,style:'mountains'});
let differs=other.map.size!==a.map.size;
if(!differs)for(const[k,t]of a.map)if(other.map.get(k)!==t){differs=true;break;}
ok(differs,'different seed → different world');
ok(hashSeed(42)===42&&hashSeed('x')===hashSeed('x')&&hashSeed('x')!==hashSeed('y'),'seed hashing is stable');

// ── bounds + type validity across every cell ──
let boundsOk=true,yOk=true,typeOk=true,keyOk=true;
for(const[k,t]of a.map){
  const parts=k.split(',');if(parts.length!==3||parts.some(p=>!/^-?\d+$/.test(p)))keyOk=false;
  const[x,y,z]=parts.map(Number);
  if(Math.abs(x)>32||Math.abs(z)>32)boundsOk=false;
  if(y<-8||y>40)yOk=false;
  if(!blockDefs[t]?.available)typeOk=false;
}
ok(keyOk,'every key is a cellKey triple');
ok(boundsOk,'every cell inside the requested footprint');
ok(yOk,'every cell inside the vertical build range');
ok(typeOk,'every cell uses an available catalog block');
ok(a.map.size>1000,'a real world, not a stub');
ok(a.stats.size===64&&a.stats.columns>500,'stats reported');

// ── mountains: peaks, snow caps, water, beaches ──
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

// ── volcano: central cone, crater lake, barren rock flanks ──
const vol=generateTerrain({seed:'arena',size:96,style:'volcano'});
ok(vol.stats.peak>=18,'the volcano towers (peak '+vol.stats.peak+')');
let highWater=0;for(const[k,t]of vol.map){if(t!==T.water)continue;if(+k.split(',')[1]>4)highWater++;}
ok(highWater>0,'the crater holds a lake up in the caldera');
ok(countType(vol,T.stone)>countType(vol,T.surface),'volcano flanks are bare rock');
const volLava=generateTerrain({seed:'arena',size:96,style:'volcano',biome:'volcanic'});
ok(countType(volLava,pal('volcanic').water)>0,'volcanic-biome crater fills with lava');

// ── mesas: stepped plateaus with sheer cliffs ──
const mes=generateTerrain({seed:'arena',size:96,style:'mesas'});
ok(mes.stats.peak>=10&&mes.stats.peak<=26,'mesas rise in stepped plateaus (peak '+mes.stats.peak+')');
ok(mes.stats.vines>0,'mesa cliffs grow hanging vines');
{const H=tops(mes);let flat=0,total=0;for(const[k,y]of H){const[x,z]=k.split(',').map(Number);const e=H.get((x+1)+','+z);if(e===undefined)continue;total++;if(e===y)flat++;}
ok(flat/total>.45,'most mesa ground is flat-topped ('+Math.round(flat/total*100)+'%)');}

// ── dunes: long smooth crests, no cliffs ──
const dun=generateTerrain({seed:'arena',size:96,style:'dunes',biome:'arid'});
ok(dun.stats.peak>=4&&dun.stats.peak<15,'dunes stay low and rolling (peak '+dun.stats.peak+')');
ok(dun.stats.vines<30,'dunes have almost no sheer cliffs');
{const H=tops(dun,'arid');let worst=0;for(const[k,y]of H){const[x,z]=k.split(',').map(Number);for(const[dx,dz]of[[1,0],[0,1]]){const o=H.get((x+dx)+','+(z+dz));if(o!==undefined)worst=Math.max(worst,Math.abs(y-o));}}
ok(worst<=4,'no dune step exceeds 4 blocks (worst '+worst+')');}

// ── stone pillars: karst towers over lake valleys ──
const pil=generateTerrain({seed:'arena',size:96,style:'pillars'});
ok(pil.stats.peak>=14,'pillars tower over the valley (peak '+pil.stats.peak+')');
ok(pil.stats.vines>50,'ivy hangs all over the pillar walls');
ok(pil.stats.water>0,'lakes fill the valley floor');
{const H=tops(pil);let towers=0;for(const y of H.values())if(y>=8)towers++;
ok(towers>40,'real standing pillars ('+towers+' tall columns)');}

// ── crater field: pocked plain with flooded bowls and raised rims ──
const cra=generateTerrain({seed:'arena',size:96,style:'craters'});
ok(cra.stats.water>0,'crater bowls flood into lakes');
ok(cra.stats.peak<14,'the crater plain stays low');
{const H=tops(cra);let deep=0;for(const y of H.values())if(y<1)deep++;
ok(deep>20,'impact bowls cut below the plain ('+deep+' sunken columns)');}
ok(cra.stats.trees>0,'trees colonize the crater rims');

// ── exotic biomes swap palettes ──
const volcB=generateTerrain({seed:'arena',size:64,style:'mountains',biome:'volcanic'});
ok(countType(volcB,pal('volcanic').water)>0,'volcanic worlds fill lows with lava');
ok(countType(volcB,pal('volcanic').surface)>0,'basalt surfaces');
const alien=generateTerrain({seed:'arena',size:48,style:'islands',biome:'alien'});
ok(alien.map.size>0,'alien palette generates');

// ── big worlds stay inside the project limits ──
const big=generateTerrain({seed:'arena',size:160,style:'hills'});
ok(big.stats.size===160,'titanic footprint honoured');
ok(big.map.size<250000,'160 world stays under 250k blocks ('+big.map.size+')');
ok(big.stats.peak<=38,'peaks stay inside the heightAt scan range');

// ── giant worlds: the full 500×500 option ──
const t0=Date.now();
const giant=generateTerrain({seed:'arena',size:500,style:'mountains'});
const ms=Date.now()-t0;
ok(giant.stats.size===500,'500-block world honoured');
ok(giant.map.size>300000,'giant world is densely built ('+giant.map.size+' blocks)');
ok(giant.map.size<1500000,'giant world stays under the 1.5M project cap');
let gBounds=true;for(const k of giant.map.keys()){const[x,,z]=k.split(',').map(Number);if(Math.abs(x)>250||Math.abs(z)>250){gBounds=false;break;}}
ok(gBounds,'giant world fits the ±250 coordinate window');
ok(ms<60000,'giant world generates in reasonable time ('+ms+'ms)');
console.log('  (giant 500 mountains: '+giant.map.size+' blocks, peak '+giant.stats.peak+', '+ms+'ms)');

console.log('terrain-gen smoke OK · '+n+' assertions passed');
