// Terrain & biome brushes, ported from VoxelForge / Blockstudio (bloxd-terrain-brush.js)
// with permission from the author. Adapted to the studio's string-typed VoxelWorld:
// numeric Bloxd ids become catalog block ids resolved through resolveBlock(), and every
// write is clamped to the world's vertical range so heightAt() keeps seeing the surface.
import { resolveBlock } from './assets.js';
export const Y_MIN=-8,Y_MAX=40;
const C={
  grass:['grass','Grass Block'],dirt:['dirt','Dirt'],stone:['stone','Stone'],sand:['sand','Sand'],
  water:['water','Water'],snow:['snow','Snow'],gravel:['Gravel','gravel'],
  pinelog:['Pine Log','log'],maplelog:['Maple Log','log'],palmlog:['Palm Log','log'],
  cactus:['Cactus'],obsidian:['Obsidian'],lava:['Lava'],
  pineleaves:['Pine Leaves','Maple Leaves'],mapleleaves:['Maple Leaves','Pine Leaves'],palmleaves:['Palm Leaves','Pine Leaves','Maple Leaves'],
  sandstone:['Sandstone','sand'],brownconcrete:['Brown Concrete'],blackconcrete:['Black Concrete'],
  whiteconcrete:['White Concrete'],purpleconcrete:['Purple Concrete'],magentaconcrete:['Magenta Concrete'],
  blueconcrete:['Blue Concrete'],grayconcrete:['Gray Concrete','Dark Grey Concrete'],
  cyanglass:['Cyan Glass'],whiteglass:['White Glass'],limewool:['Lime Wool'],
  basalt:['Basalt','Gray Concrete','stone'],charcoal:['Charcoal Block','Black Concrete'],
  path:['Dirt Path','Gravel','planks','dirt'],pinksand:['Pink Sand','sand']
};
const cache=new Map();
export function pick(list){const k=list.join('|');if(cache.has(k))return cache.get(k);let r=null;for(const n of list){r=resolveBlock(n);if(r)break;}cache.set(k,r);return r;}
export const BIOMES={
  tropical:{surface:C.grass,subsurface:C.dirt,stone:C.stone,water:C.water,beach:C.sand,road:C.path,snow:C.snow,log:C.palmlog,leaves:C.palmleaves},
  temperate:{surface:C.grass,subsurface:C.dirt,stone:C.stone,water:C.water,beach:C.sand,road:C.path,snow:C.snow,log:C.pinelog,leaves:C.pineleaves},
  arid:{surface:C.sand,subsurface:C.sandstone,stone:C.stone,water:C.water,beach:C.sand,road:C.brownconcrete,snow:C.whiteconcrete,log:C.cactus,leaves:C.cactus},
  alpine:{surface:C.grass,subsurface:C.dirt,stone:C.stone,water:C.water,beach:C.gravel,road:C.stone,snow:C.snow,log:C.pinelog,leaves:C.pineleaves},
  volcanic:{surface:C.basalt,subsurface:C.stone,stone:C.obsidian,water:C.lava,beach:C.blackconcrete,road:C.basalt,snow:C.whiteconcrete,log:C.charcoal,leaves:C.grayconcrete},
  alien:{surface:C.purpleconcrete,subsurface:C.magentaconcrete,stone:C.obsidian,water:C.cyanglass,beach:C.pinksand,road:C.blackconcrete,snow:C.whiteglass,log:C.blueconcrete,leaves:C.limewool}
};
export const BRUSH_TOOLS=['raise','lower','flatten','smooth','erode','terrace','cliff','road','beach','river','snow','biome','vegetation'];
export const BRUSH_LABELS={raise:'Raise',lower:'Lower',flatten:'Flatten',smooth:'Smooth',erode:'Erode',terrace:'Terrace',cliff:'Cliff',road:'Road',beach:'Beach',river:'River',snow:'Snow cover',biome:'Biome paint',vegetation:'Vegetation'};
function hash(x,z,seed){let h=Math.imul(x,374761393)^Math.imul(z,668265263)^String(seed||'1').split('').reduce((n,c)=>Math.imul(n^c.charCodeAt(0),16777619),2166136261);h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967295;}
export function topAt(world,x,z,hint=0,range=256){for(let y=Math.min(Y_MAX,Math.round(hint+range));y>=Math.max(Y_MIN,Math.round(hint-range));y--){const v=world.get(x,y,z);if(v&&v!=='water')return y;}return null;}
function columns(center,radius,falloff){const out=[];radius=Math.max(1,Math.round(radius));for(let dx=-radius;dx<=radius;dx++)for(let dz=-radius;dz<=radius;dz++){const d=Math.hypot(dx,dz);if(d>radius)continue;const n=1-d/radius,weight=falloff==='hard'?1:falloff==='linear'?n:n*n*(3-2*n);out.push({x:center[0]+dx,z:center[2]+dz,weight,distance:d});}return out;}
// Applies one brush stamp. Returns Map(cellKey → [oldType|null, newType|null]) for undo/redo.
export function apply(world,center,options={}){
  const changed=new Map();
  const setB=(x,y,z,list)=>{if(y<Y_MIN||y>Y_MAX||!list)return;const type=pick(list);if(!type)return;const old=world.get(x,y,z)||null;if(old===type)return;world.set(x,y,z,type);const now=world.get(x,y,z)||null;if(old!==now)changed.set(`${x},${y},${z}`,[old,now]);};
  const delB=(x,y,z)=>{if(y<Y_MIN||y>Y_MAX)return;const old=world.get(x,y,z)||null;if(!old)return;world.set(x,y,z,null);changed.set(`${x},${y},${z}`,[old,null]);};
  const radius=Math.max(1,Number(options.radius)||6),strength=Math.max(.1,Number(options.strength)||2),depth=Math.max(1,Math.round(Number(options.depth)||3));
  const tool=options.tool||'biome',preset=BIOMES[options.biome]||BIOMES.temperate,seed=options.seed||'studio';
  const mat=role=>preset[role]||preset.surface;
  const cols=columns(center,radius,options.falloff||'smooth'),tops=new Map();
  cols.forEach(c=>tops.set(`${c.x},${c.z}`,topAt(world,c.x,c.z,center[1],Math.max(128,radius*4))));
  const top=(x,z)=>tops.get(`${x},${z}`);
  for(const c of cols){
    let y=top(c.x,c.z);
    if(y==null&&['raise','cliff','biome','beach','road','snow'].includes(tool))y=Math.round(center[1]);
    if(y==null)continue;
    const amount=Math.max(1,Math.round(strength*c.weight));
    if(tool==='raise'||tool==='cliff'){
      const add=tool==='cliff'?Math.max(amount,Math.round(strength)):amount;
      if(world.get(c.x,y,c.z))setB(c.x,y,c.z,mat('subsurface'));
      for(let n=1;n<=add;n++)setB(c.x,y+n,c.z,mat(n===add?'surface':'stone'));
    }else if(tool==='lower'){
      for(let n=0;n<amount;n++)delB(c.x,y-n,c.z);
      const next=y-amount;if(world.get(c.x,next,c.z))setB(c.x,next,c.z,mat('surface'));
    }else if(tool==='flatten'||tool==='road'||tool==='beach'||tool==='river'){
      let target=Math.round(Number(options.targetY));if(!Number.isFinite(target))target=Math.round(center[1]);
      if(tool==='river')target-=Math.max(1,Math.round(strength*c.weight));
      if(y>target)for(let yy=y;yy>target;yy--)delB(c.x,yy,c.z);
      else for(let yy=y+1;yy<=target;yy++)setB(c.x,yy,c.z,mat('subsurface'));
      const role=tool==='road'?'road':tool==='beach'?'beach':tool==='river'?'stone':'surface';
      setB(c.x,target,c.z,mat(role));
      if(tool==='river'&&options.water!==false)setB(c.x,target+1,c.z,mat('water'));
    }else if(tool==='smooth'){
      const nb=[[1,0],[-1,0],[0,1],[0,-1]].map(d=>top(c.x+d[0],c.z+d[1])).filter(v=>Number.isFinite(v));
      if(!nb.length)continue;
      const target=Math.round((y+nb.reduce((a,b)=>a+b,0)/nb.length)/2);
      if(target<y)for(let yy=y;yy>target;yy--)delB(c.x,yy,c.z);
      else for(let yy=y+1;yy<=target;yy++)setB(c.x,yy,c.z,mat('subsurface'));
      setB(c.x,target,c.z,mat('surface'));
    }else if(tool==='erode'){
      const nb=[[1,0],[-1,0],[0,1],[0,-1]].map(d=>top(c.x+d[0],c.z+d[1])).filter(v=>Number.isFinite(v));
      const avg=nb.length?nb.reduce((a,b)=>a+b,0)/nb.length:y;
      if(y-avg>1&&hash(c.x,c.z,seed)<c.weight){delB(c.x,y,c.z);if(world.get(c.x,y-1,c.z))setB(c.x,y-1,c.z,mat('surface'));}
    }else if(tool==='terrace'){
      const step=Math.max(1,Math.round(strength)),target=Math.round(y/step)*step;
      if(target<y)for(let yy=y;yy>target;yy--)delB(c.x,yy,c.z);
      else for(let yy=y+1;yy<=target;yy++)setB(c.x,yy,c.z,mat('subsurface'));
      setB(c.x,target,c.z,mat('surface'));
    }else if(tool==='biome'){
      setB(c.x,y,c.z,mat('surface'));
      for(let n=1;n<=depth;n++)if(world.get(c.x,y-n,c.z))setB(c.x,y-n,c.z,mat(n<depth?'subsurface':'stone'));
    }else if(tool==='snow')setB(c.x,y,c.z,mat('snow'));
    else if(tool==='vegetation'&&hash(c.x,c.z,seed)<Math.min(.35,c.weight*Number(options.density||.08))){
      const h=3+Math.round(hash(c.x,c.z,seed+':h')*4);
      for(let n=1;n<=h;n++)setB(c.x,y+n,c.z,mat('log'));
      for(let dx=-2;dx<=2;dx++)for(let dy=-1;dy<=2;dy++)for(let dz=-2;dz<=2;dz++)if(dx*dx+dz*dz+dy*dy<5)setB(c.x+dx,y+h+dy,c.z+dz,mat('leaves'));
    }
  }
  return changed;
}
