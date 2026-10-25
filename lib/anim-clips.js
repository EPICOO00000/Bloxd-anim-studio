// One-click animation helpers: baked clips, walk paths, pose mirroring and per-key
// easing weights. Pure data — no scene access — so everything here is unit-testable.
// Key shape matches the studio tracks: {time, position:[x,y,z], rotation:[x,y,z](radians),
// scale:[x,y,z], pose:{...}, ease?:'linear'|'in'|'out'|'inout'|'hold'}
import { presetPose } from './character.js';

// easeWeight maps a raw interval fraction f∈[0,1] through the OUTGOING key's ease mode.
// Default (undefined/'smooth') keeps the studio's classic smoothstep so old projects
// play back exactly as before.
export function easeWeight(ease,f){
  switch(ease){
    case 'linear':return f;
    case 'in':return f*f;
    case 'out':return 1-(1-f)*(1-f);
    case 'inout':return f<.5?2*f*f:1-Math.pow(-2*f+2,2)/2;
    case 'hold':return 0;
    default:return f*f*(3-2*f);
  }
}
export const EASES=['smooth','linear','in','out','inout','hold'];

// Mirror a pose left↔right: paired joints swap values; the sagittal swing (x) keeps
// its sign while twist (y) and lateral (z) flip — verified against the walk/wave/idle
// presets so mirroring an idle pose is a no-op and mirroring a wave moves it to the
// other arm.
export function mirrorPose(p){
  const pairs={armL:'armR',forearmL:'forearmR',legL:'legR',shinL:'shinR'};
  const flip=v=>[v[0],-v[1],-v[2]];
  const out={offset:p.offset||0};
  for(const k of Object.keys(p)){
    if(k==='offset')continue;
    const source=pairs[k]||Object.keys(pairs).find(m=>pairs[m]===k)||k;
    out[k]=flip(p[source]||[0,0,0]);
  }
  return out;
}

// Procedural dance (not in presetPose) + a dispatcher for every bakeable clip.
export function clipPose(name,t){
  if(name!=='dance')return presetPose(name,t,true);
  const s=Math.sin(t*5.2),c=Math.cos(t*5.2),p=presetPose('idle',t,false);
  p.body[1]=s*14;p.head[1]=-s*10;
  p.armL=[-25+s*40,0,42+c*18];p.armR=[-25-s*40,0,-42-c*18];
  p.forearmL=[-50+s*25,0,0];p.forearmR=[-50-s*25,0,0];
  p.legL[0]=s*16;p.legR[0]=-s*16;p.shinL[0]=Math.max(0,-s)*18;p.shinR[0]=Math.max(0,s)*18;
  p.offset=Math.abs(Math.sin(t*5.2))*.09;
  return p;
}

export const CLIP_DEFAULTS={
  walk:{dur:4,step:.25,speed:1.4},
  run:{dur:3,step:.2,speed:3.2},
  wave:{dur:2,step:.2},
  jump:{dur:1.4,step:.1},
  dance:{dur:4,step:.2},
  spin:{dur:2,step:.5},
  mine:{dur:2,step:.2}
};
// Bake a clip into character-track keys starting at `start` seconds.
// forward = (sin yaw, cos yaw): yaw is the character root's Y rotation in radians.
export function bakeClip({clip,start=0,duration,from=[0,0,0],yaw=0,speed,step,heightAt}){
  const d=CLIP_DEFAULTS[clip]||CLIP_DEFAULTS.walk;
  duration=Math.max(d.step,Number(duration)||d.dur);
  speed=Number(speed)||d.speed||0;step=Number(step)||d.step;
  const fx=Math.sin(yaw),fz=Math.cos(yaw),keys=[];
  for(let t=0;t<=duration+1e-6;t+=step){
    const time=Math.min(start+t,duration+start);
    const x=from[0]+fx*speed*t,z=from[2]+fz*speed*t;
    const y=heightAt?heightAt(x,z):from[1];
    const rot=[0,clip==='spin'?yaw+Math.PI*2*(t/duration):yaw,0];
    keys.push({time,position:[x,y,z],rotation:rot,scale:[1,1,1],pose:clipPose(clip==='spin'?'idle':clip,t)});
  }
  const last=keys.at(-1);
  if(last.time<start+duration-1e-6){
    const t=duration,x=from[0]+fx*speed*t,z=from[2]+fz*speed*t;
    keys.push({time:start+duration,position:[x,heightAt?heightAt(x,z):from[1],z],rotation:[0,clip==='spin'?yaw+Math.PI*2:yaw,0],scale:[1,1,1],pose:clipPose(clip==='spin'?'idle':clip,t)});
  }
  return {keys,duration};
}
// Bake a clicked ground route into walk keys: constant speed, body turns to face each
// segment, legs cycle with real time so steps stay synced to distance covered.
export function bakeWalkPath({points,speed=1.4,start=0,step=.25,heightAt}){
  const pts=(points||[]).map(p=>[Number(p[0]),Number(p[1])]);
  if(pts.length<2)throw new Error('A walk path needs at least two points.');
  const segs=[];let total=0;
  for(let i=0;i<pts.length-1;i++){
    const dx=pts[i+1][0]-pts[i][0],dz=pts[i+1][1]-pts[i][1],len=Math.hypot(dx,dz);
    if(len<1e-6)continue;
    segs.push({x0:pts[i][0],z0:pts[i][1],dx:dx/len,dz:dz/len,len,yaw:Math.atan2(dx,dz),s0:total});
    total+=len;
  }
  if(!segs.length)throw new Error('Walk path points are all identical.');
  const totalTime=total/speed,keys=[];
  const atTime=t=>{
    const s=Math.min(t*speed,total);
    let seg=segs[0];for(const g of segs)if(s>=g.s0)seg=g;
    const along=Math.min(s-seg.s0,seg.len);
    return {x:seg.x0+seg.dx*along,z:seg.z0+seg.dz*along,yaw:seg.yaw};
  };
  for(let t=0;t<totalTime-1e-6;t+=step){
    const p=atTime(t),y=heightAt?heightAt(p.x,p.z):0;
    keys.push({time:start+t,position:[p.x,y,p.z],rotation:[0,p.yaw,0],scale:[1,1,1],pose:clipPose('walk',t)});
  }
  const p=atTime(totalTime),y=heightAt?heightAt(p.x,p.z):0;
  keys.push({time:start+totalTime,position:[p.x,y,p.z],rotation:[0,p.yaw,0],scale:[1,1,1],pose:clipPose('walk',totalTime)});
  return {keys,totalTime,distance:total};
}
