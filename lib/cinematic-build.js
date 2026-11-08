// Cinematic build: a selected zone of voxel cells becomes a layered construction
// animation. Pure data — no scene access — so ordering, timing and key baking are
// unit-testable, exactly like the clip bakers in anim-clips.js.
//
// The studio plays a build back by lifting every selected cell out of the voxel world
// into its own editable `block` record and writing transform keys onto it:
//   hidden @ 0              the block is scaled to nothing and parked outside its cell;
//                           keyInterval() clamps before the first key, so it stays that way
//   hidden @ block start    only when the build begins later than 0 s — otherwise the
//                           block would already be easing in during the pre-roll
//   final @ block end       the block sits exactly on its cell at full size, and holds
//                           there for the rest of the clip
// Timing: the zone is sliced into beats (one per horizontal layer for bottom-up /
// top-down, one per distance ring for centre-out, waves for random). Each beat owns an
// equal slot of the requested duration; `stagger` is the sweep spent rippling across a
// single beat, and `blockTime` is how long one block takes to appear.
import { easeWeight } from './anim-clips.js';

export const BUILD_ORDERS=['layers','top-down','center-out','random'];
export const BUILD_ORDER_LABELS={layers:'Bottom-up layers','top-down':'Top-down layers','center-out':'Centre out',random:'Random shimmer'};
export const BUILD_STYLES=['pop','rise','drop','spin'];
export const BUILD_STYLE_LABELS={pop:'Pop in place',rise:'Rise from below',drop:'Drop from above',spin:'Spin in'};
export const BUILD_EASES=['smooth','linear','in','out','inout','hold'];
export const BUILD_EASE_LABELS={smooth:'Smooth',linear:'Linear',in:'Ease in',out:'Ease out',inout:'In & out',hold:'Hold'};

// Each cell becomes a live scene object with its own key track, so the zone has to stay
// small enough for the timeline to remain editable.
export const MAX_ZONE_BLOCKS=2000;
export const ZONE_DEFAULTS={order:'layers',style:'rise',ease:'out',duration:4,blockTime:.3,stagger:.08,seed:'zone',camera:true};

const MIN_BLOCK=.02;        // shortest time one block may take to appear
const POP_MIN=.25;          // below this a pop is too quick to overshoot
const POP_OVER=1.18;        // pop overshoot scale
const RISE_LIFT=.95;        // how far below its cell a rising block waits
const DROP_LIFT=1.6;        // how far above its cell a dropping block waits
const SPIN_TURN=Math.PI*.85;// quarter-and-a-bit turn while a block spins in
const MAX_BEATS=24;         // beats are merged down to this so the gap never vanishes

// ── regions ────────────────────────────────────────────────────────────────────
export function normalizeRegion(from,to){
  const a=(from||[0,0,0]).map(n=>Math.round(Number(n)||0));
  const b=(to||[0,0,0]).map(n=>Math.round(Number(n)||0));
  const min=[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.min(a[2],b[2])];
  const max=[Math.max(a[0],b[0]),Math.max(a[1],b[1]),Math.max(a[2],b[2])];
  const size=[max[0]-min[0]+1,max[1]-min[1]+1,max[2]-min[2]+1];
  return {min,max,size,volume:size[0]*size[1]*size[2]};
}
function asRegion(input){
  if(input&&typeof input==='object'&&Array.isArray(input.min)&&Array.isArray(input.max))return input;
  if(Array.isArray(input)&&Array.isArray(input[0]))return normalizeRegion(input[0],input[1]);
  return normalizeRegion(input,[0,0,0]);
}
// Inclusive containment test for one cell against a region (or a from/to pair).
export function inRegion(cell,from,to){
  const pair=Array.isArray(from)&&Array.isArray(from[0])?{min:from,max:to}:{min:from,max:to};
  const {min,max}=asRegion(pair);
  return cell[0]>=min[0]&&cell[0]<=max[0]&&cell[1]>=min[1]&&cell[1]<=max[1]&&cell[2]>=min[2]&&cell[2]<=max[2];
}
// Centre of the covered cells (min + half a side), not of the min/max corners.
export function regionCenter(region){
  const {min,size}=asRegion(region);
  return [min[0]+size[0]/2,min[1]+size[1]/2,min[2]+size[2]/2];
}
export function regionRadius(region){
  return Math.max(...asRegion(region).size);
}
export function zoneWarning(count){
  if(!count)return 'That zone holds no blocks — drag a box over the world first.';
  if(count>MAX_ZONE_BLOCKS)return `${count.toLocaleString()} blocks is too many for one build (limit ${MAX_ZONE_BLOCKS.toLocaleString()}). Pick a smaller zone.`;
  return null;
}

// ── cell collection ────────────────────────────────────────────────────────────
// Walks the region in x → z → y order and keeps every solid cell the world reports.
export function collectCells(world,region){
  const {min,max}=asRegion(region),out=[];
  for(let x=min[0];x<=max[0];x++)for(let z=min[2];z<=max[2];z++)for(let y=min[1];y<=max[1];y++){
    const type=world.get(x,y,z);
    if(type)out.push({x,y,z,type});
  }
  return out;
}
// Everything a zone covers: every solid world cell (water stays in the welded world
// mesh) plus any already-editable block whose terrainCell falls inside the box — those
// were lifted out of the world, so the world no longer reports them.
export function zoneCells(world,region,lifted=[]){
  const reg=asRegion(region);
  const cells=collectCells(world,reg).filter(c=>c.type!=='water');
  const seen=new Set(cells.map(c=>c.x+','+c.y+','+c.z));
  for(const l of lifted||[]){
    const key=l.x+','+l.y+','+l.z;
    if(seen.has(key)||!inRegion([l.x,l.y,l.z],reg.min,reg.max))continue;
    seen.add(key);
    cells.push({x:l.x,y:l.y,z:l.z,type:l.type,record:l.record||null});
  }
  return cells;
}
function centroid(cells){
  let x=0,y=0,z=0;for(const c of cells){x+=c.x;y+=c.y;z+=c.z;}
  return [x/cells.length,y/cells.length,z/cells.length];
}
function hash01(x,y,z,seed){
  let h=Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^Math.imul(z|0,2246822519)
    ^String(seed==null?'zone':seed).split('').reduce((n,c)=>Math.imul(n^c.charCodeAt(0),16777619),2166136261);
  h=Math.imul(h^(h>>>13),1274126177);
  return ((h^(h>>>16))>>>0)/4294967295;
}

// ── build order ────────────────────────────────────────────────────────────────
// Returns beats: ordered groups of cells that appear together. Horizontal layers sweep
// from the middle outwards, which reads as construction instead of a row-by-row wipe.
export function groupCells(cells,order='layers',seed='zone'){
  const list=(cells||[]).map(c=>({x:c.x,y:c.y,z:c.z,type:c.type}));
  if(!list.length)return [];
  if(order==='random'){
    const waves=Math.max(3,Math.min(24,Math.round(Math.sqrt(list.length))));
    const shuffled=[...list].sort((a,b)=>hash01(a.x,a.y,a.z,seed)-hash01(b.x,b.y,b.z,seed)||a.x-b.x||a.z-b.z||a.y-b.y);
    const per=Math.max(1,Math.ceil(shuffled.length/waves)),out=[];
    for(let i=0;i<shuffled.length;i+=per)out.push({cells:shuffled.slice(i,i+per)});
    return out;
  }
  const c=centroid(list);
  const flat=p=>Math.hypot(p.x-c[0],p.z-c[2]);
  const dist=p=>Math.hypot(p.x-c[0],p.y-c[1],p.z-c[2]);
  if(order==='center-out'){
    const sorted=[...list].sort((a,b)=>dist(a)-dist(b)||a.y-b.y||a.x-b.x||a.z-b.z);
    const rings=[];let current=null,last=NaN;
    for(const cell of sorted){
      if(!current||Math.abs(dist(cell)-last)>1e-9){current=[];rings.push(current);last=dist(cell);}
      current.push(cell);
    }
    return rings.map(cells=>({cells}));
  }
  const byY=new Map();
  for(const cell of list){if(!byY.has(cell.y))byY.set(cell.y,[]);byY.get(cell.y).push(cell);}
  const ys=[...byY.keys()].sort((a,b)=>order==='top-down'?b-a:a-b);
  return ys.map(y=>({cells:[...byY.get(y)].sort((a,b)=>flat(a)-flat(b)||a.x-b.x||a.z-b.z)}));
}
function mergeGroups(groups,max){
  if(groups.length<=max)return groups;
  const per=Math.ceil(groups.length/max),out=[];
  for(let i=0;i<groups.length;i+=per){
    const cells=[];for(const g of groups.slice(i,i+per))cells.push(...g.cells);
    out.push({cells});
  }
  return out;
}

// ── per-block keyframes ────────────────────────────────────────────────────────
// `start` is when the block begins to appear and `end` when it has arrived — both are
// absolute times on the clip, exactly like the key times they become.
export function buildKeys(cell,style='rise',start=0,end=.4,ease){
  const s=Math.max(0,Number(start)||0);
  const e=Math.max(s+.02,end==null?s+.4:Number(end));
  const d=e-s,kind=BUILD_STYLES.includes(style)?style:'rise';
  const home={position:[cell.x+.5,cell.y+.5,cell.z+.5],rotation:[0,0,0],scale:[1,1,1]};
  const hidden=()=>{
    if(kind==='rise')return{position:[cell.x+.5,cell.y+.5-RISE_LIFT,cell.z+.5],rotation:[0,0,0],scale:[0,0,0]};
    if(kind==='drop')return{position:[cell.x+.5,cell.y+.5+DROP_LIFT,cell.z+.5],rotation:[0,0,0],scale:[0,0,0]};
    if(kind==='spin')return{position:[cell.x+.5,cell.y+.5,cell.z+.5],rotation:[0,-SPIN_TURN,0],scale:[0,0,0]};
    return{...home,scale:[0,0,0]};
  };
  // The final key keeps `end` verbatim so a baked track always lands exactly on the
  // time the plan promised — no rounding drift between plan and keys.
  const keys=[{time:0,...hidden(),ease}];
  if(s>1e-6)keys.push({time:s,...hidden(),ease});
  if(kind==='pop'&&d>=POP_MIN)keys.push({time:s+d*.62,...home,scale:[POP_OVER,POP_OVER,POP_OVER],ease});
  keys.push({time:e,...home,ease});
  return keys;
}

// ── the plan ───────────────────────────────────────────────────────────────────
export function planBuild(cells,options={}){
  if(!cells||!cells.length)throw new Error('The selected zone holds no blocks to build.');
  const o={...ZONE_DEFAULTS,...options};
  const beats=mergeGroups(groupCells(cells,o.order,o.seed),MAX_BEATS);
  const layers=beats.length;
  const start=Math.max(0,Number(o.start)||0);
  const duration=Math.max(.02,Number(o.duration)||0);
  const total=start+duration;
  const blockTime=Math.max(.02,Number(o.blockTime)||0);
  // The sweep may never eat the whole window, or a block would have no time to appear.
  const ripple=Math.max(0,Math.min(Number(o.stagger)||0,duration-MIN_BLOCK));
  const gap=Math.max(0,(duration-blockTime-ripple)/Math.max(1,layers-1));
  const blocks=[];
  beats.forEach((beat,i)=>{
    const beatStart=start+i*gap,n=beat.cells.length;
    beat.cells.forEach((cell,j)=>{
      const time=beatStart+(n>1?j/(n-1)*ripple:0);
      let end=time+blockTime;
      if(end>total)end=total;
      if(end<=time)end=Math.min(total,time+MIN_BLOCK);
      blocks.push({x:cell.x,y:cell.y,z:cell.z,type:cell.type,layer:i,time,end,
        keys:buildKeys(cell,o.style,time,end,o.ease)});
    });
  });
  return {count:blocks.length,layers,start,duration,total,order:o.order,style:o.style,
    ease:o.ease,stagger:ripple,gap,blocks};
}
// The studio-facing bake: the plan plus one entry per cell saying whether it needs a
// fresh editable block or already owns one, and the exact key track it receives. The
// app only has to create records, drop the cells from the world and hand the keys over.
export function buildEntries(cells,options={}){
  const plan=planBuild(cells,options);
  const source=new Map(cells.map(c=>[c.x+','+c.y+','+c.z,c]));
  const entries=[];
  for(const b of plan.blocks){
    const src=source.get(b.x+','+b.y+','+b.z);
    if(!src)continue;
    entries.push({x:b.x,y:b.y,z:b.z,type:src.type,layer:b.layer,time:b.time,end:b.end,
      record:src.record||null,keys:b.keys.map(k=>({...k}))});
  }
  return {plan,entries};
}
export function planSummary(plan){
  if(!plan||!plan.count)return 'No zone selected';
  return `${plan.count} blocks · ${plan.layers} ${plan.layers===1?'layer':'layers'} · ${plan.start.toFixed(2)}s → ${plan.total.toFixed(2)}s`;
}

// ── cinematic camera ───────────────────────────────────────────────────────────
// A four-key move over the same window as the build: wide and high, easing in closer
// and lower as the structure rises, then pulling back for the finish.
export function cameraPlan(region,options={}){
  const r=asRegion(region),center=regionCenter(r),radius=regionRadius(r);
  const start=Math.max(0,Number(options.start)||0);
  const duration=Math.max(.5,Number(options.duration)||4);
  const moves=[[0,radius*2.2+9,radius*1.15+8,50],[.32,radius*1.45+5,radius*.9+6,44],
               [.68,radius*.95+3,radius*.5+3.4,40],[1,radius*1.6+6,radius*1+6,46]];
  const keys=moves.map(([f,dist,height,fov],i)=>{
    const a=.85+i*.5;
    return {time:+(start+duration*f).toFixed(6),
      position:[+(center[0]+Math.sin(a)*dist).toFixed(4),+(center[1]+height).toFixed(4),+(center[2]+Math.cos(a)*dist).toFixed(4)],
      target:center.map(n=>+n.toFixed(4)),fov};
  });
  return {keys,center,radius,start,duration,total:start+duration};
}

// Preview helpers used by the smoke test to prove a block really is absent before its
// beat and present after it, straight through the studio's own sampler.
export function blockVisibleAt(keys,time){
  if(!keys?.length)return false;
  let a=keys[0];
  for(const k of keys){if(k.time<=time+1e-9)a=k;else break;}
  return (a.scale||[1,1,1]).every(n=>n>.5);
}
export function sampleScaleAt(keys,time){
  if(!keys?.length)return null;
  let a=keys[0],b=keys[0],f=0;
  if(time>=keys.at(-1).time){a=b=keys.at(-1);}
  else for(let i=0;i<keys.length-1;i++)if(time>=keys[i].time&&time<=keys[i+1].time){
    a=keys[i];b=keys[i+1];f=(keys[i+1].time-keys[i].time)>1e-9?(time-keys[i].time)/(keys[i+1].time-keys[i].time):1;break;
  } else if(time<keys[0].time)break;
  const w=easeWeight(a.ease,f);
  return a.scale.map((n,i)=>n+(b.scale[i]-n)*w);
}
