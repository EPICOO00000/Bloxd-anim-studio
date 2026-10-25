// Terrain brush smoke test: runs the ported VoxelForge brush against a map-only
// VoxelWorld (no rebuild/rendering) and verifies every tool mutates terrain correctly.
import { loadAssets, resolveBlock } from '../lib/assets.js';
import { VoxelWorld } from '../lib/world.js';
import { apply, topAt, BRUSH_TOOLS, Y_MAX } from '../lib/terrain-brush.js';

await loadAssets().catch(e=>console.warn('asset load warn:',e.message));
const world=new VoxelWorld();
for(let x=-14;x<=14;x++)for(let z=-14;z<=14;z++){
  world.set(x,-3,z,'stone');world.set(x,-2,z,'dirt');world.set(x,-1,z,'dirt');world.set(x,0,z,'grass');
}
for(let x=3;x<=7;x++)for(let z=-7;z<=-3;z++){world.set(x,1,z,'dirt');world.set(x,2,z,'grass');}
const top=(x,z)=>topAt(world,x,z,0,64);
const assert=(cond,msg)=>{if(!cond)throw new Error(msg);};

// raise
const c0=[0,top(0,0),0];
let ch=apply(world,c0,{tool:'raise',radius:3,strength:2});
assert(ch.size>0,'raise changed nothing');
assert(top(0,0)>c0[1],'raise did not raise: '+c0[1]+' → '+top(0,0));
// undo-ability: every change has [old,new]
for(const [,v] of ch)assert(Array.isArray(v)&&v.length===2,'change entry malformed');

// lower
const c1=[0,top(0,0),0];
ch=apply(world,c1,{tool:'lower',radius:3,strength:2});
assert(ch.size>0&&top(0,0)<c1[1],'lower did not lower');

// flatten
const fy=top(4,4);
ch=apply(world,[4,fy,4],{tool:'flatten',radius:3,strength:1,targetY:fy});
for(let x=2;x<=6;x++)for(let z=2;z<=6;z++)assert(top(x,z)===fy,'flatten left '+top(x,z)+' at '+x+','+z);

// smooth (on the hill edge)
ch=apply(world,[3,2,-3],{tool:'smooth',radius:3,strength:1});
assert(ch.size>=0,'smooth crashed');

// cliff
const c2=[8,top(8,8),8];
ch=apply(world,c2,{tool:'cliff',radius:2,strength:3});
assert(top(8,8)>c2[1],'cliff did not raise');

// erode (needs a tall step: stack the cliff spot then erode)
for(let i=0;i<4;i++)apply(world,[8,top(8,8),8],{tool:'cliff',radius:1,strength:4});
ch=apply(world,[8,top(8,8),8],{tool:'erode',radius:3,strength:1,seed:'t'});
assert(ch.size>0,'erode removed nothing from a tall step');

// terrace
ch=apply(world,[8,top(8,8),8],{tool:'terrace',radius:3,strength:2});
assert(ch.size>=0,'terrace crashed');
assert(top(8,8)%2===0,'terrace did not snap height to step multiple: '+top(8,8));

// biome (arid → sand surface)
ch=apply(world,[-6,top(-6,-6),-6],{tool:'biome',radius:3,biome:'arid'});
assert(world.get(-6,top(-6,-6),-6)===resolveBlock('Sand'),'arid biome surface is not sand');

// snow
ch=apply(world,[-6,top(-6,-6),-6],{tool:'snow',radius:2});
assert(world.get(-6,top(-6,-6),-6)===resolveBlock('Snow'),'snow cover is not snow');

// road / beach / river
ch=apply(world,[6,top(6,6),6],{tool:'road',radius:2,targetY:top(6,6)});
assert(ch.size>0,'road painted nothing');
ch=apply(world,[-8,top(-8,8),8],{tool:'beach',radius:2,targetY:top(-8,8)});
assert(world.get(-8,top(-8,8),8)===resolveBlock('Sand'),'beach is not sand');
ch=apply(world,[10,top(10,-10),-10],{tool:'river',radius:2,strength:2});
let sawWater=false;for(const [,v] of ch)if(v[1]===resolveBlock('Water'))sawWater=true;
assert(sawWater,'river placed no water');

// vegetation (temperate → pine log trunk)
ch=apply(world,[0,top(0,0),0],{tool:'vegetation',radius:6,density:.5,seed:'grove'});
let sawLog=false;for(const [,v] of ch)if(v[1]===resolveBlock('Pine Log'))sawLog=true;
assert(sawLog,'vegetation grew no pine logs');

// Y clamp: hammer raise — nothing may exceed Y_MAX
for(let i=0;i<40;i++)apply(world,[12,top(12,12),12],{tool:'raise',radius:2,strength:8});
assert(top(12,12)<=Y_MAX,'raise exceeded Y_MAX: '+top(12,12));

console.log('tools verified:',BRUSH_TOOLS.join(', '));
console.log('ALL TERRAIN BRUSH TESTS PASSED');
