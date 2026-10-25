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

// Procedural clips (dance, punch, kick, backflip tuck, sneak, death, cheer, clap,
// swim) + a dispatcher that falls back to presetPose for the classic names.
export function clipPose(name,t){
  const p=presetPose('idle',t,false);
  switch(name){
    case 'dance':{
      const s=Math.sin(t*5.2),c=Math.cos(t*5.2);
      p.body[1]=s*14;p.head[1]=-s*10;
      p.armL=[-25+s*40,0,42+c*18];p.armR=[-25-s*40,0,-42-c*18];
      p.forearmL=[-50+s*25,0,0];p.forearmR=[-50-s*25,0,0];
      p.legL[0]=s*16;p.legR[0]=-s*16;p.shinL[0]=Math.max(0,-s)*18;p.shinR[0]=Math.max(0,s)*18;
      p.offset=Math.abs(Math.sin(t*5.2))*.09;
      return p;
    }
    case 'punch':{
      const ph=Math.sin(t*8),kr=Math.max(0,ph),kl=Math.max(0,-ph);
      p.armR=[-25-70*kr,0,-8];p.forearmR=[-65+55*kr,0,0];
      p.armL=[-25-70*kl,0,8];p.forearmL=[-65+55*kl,0,0];
      p.body=[6,ph*10,0];p.head[0]=8;
      p.legR[0]=-14;p.legL[0]=10;p.shinR[0]=18;p.shinL[0]=8;p.offset=-.04;
      return p;
    }
    case 'kick':{
      const k=Math.max(0,Math.sin(t*4.5));
      p.legR=[10-105*k,0,0];p.shinR=[55*(1-k),0,0];
      p.legL[0]=6;p.shinL[0]=12;
      p.body=[-16*k,0,0];p.head[0]=10*k;
      p.armR=[-20+35*k,0,-14];p.armL=[-15-40*k,0,14];
      p.forearmR=[-30,0,0];p.forearmL=[-30,0,0];
      p.offset=-.05*k;
      return p;
    }
    case 'backflip':{
      const r=Math.min(1,t/.2);
      p.body[0]=-30*r;p.head[0]=-25*r;
      p.armR=[-70*r,0,-25];p.armL=[-70*r,0,25];
      p.forearmR=[-60*r,0,0];p.forearmL=[-60*r,0,0];
      p.legR=[-75*r,0,0];p.legL=[-75*r,0,0];
      p.shinR=[70*r,0,0];p.shinL=[70*r,0,0];
      p.offset=-.1*r;
      return p;
    }
    case 'sneak':{
      const s=Math.sin(t*4.8);
      p.legL[0]=s*20;p.legR[0]=-s*20;
      p.shinL[0]=25+Math.max(0,-s)*15;p.shinR[0]=25+Math.max(0,s)*15;
      p.body[0]=14;p.head[0]=-12;
      p.armL=[-25-s*10,0,4];p.armR=[-25+s*10,0,-4];
      p.forearmL=[-40,0,0];p.forearmR=[-40,0,0];
      p.offset=-.3+Math.abs(s)*.015;
      return p;
    }
    case 'death':{
      const f=Math.min(1,t/1.2),e=1-(1-f)*(1-f);
      p.body[0]=-78*e;p.head[0]=-15*e;
      p.armR=[-25-125*Math.sin(Math.PI*f),0,-10-25*e];
      p.armL=[-25-125*Math.sin(Math.PI*f),0,10+25*e];
      p.forearmR=[-30*(1-e),0,0];p.forearmL=[-30*(1-e),0,0];
      p.legR=[-4-8*e,0,0];p.legL=[-6*e,0,0];
      p.shinR=[22*e,0,0];p.shinL=[14*e,0,0];
      p.offset=-.55*e;
      return p;
    }
    case 'cheer':{
      const s=Math.sin(t*7),h=Math.abs(Math.sin(t*3.5));
      p.armL=[-160,0,28+s*10];p.armR=[-160,0,-28-s*10];
      p.forearmL=[-12,0,0];p.forearmR=[-12,0,0];
      p.legL[0]=-14*Math.max(0,Math.sin(t*3.5));p.legR[0]=-14*Math.max(0,-Math.sin(t*3.5));
      p.shinL[0]=10;p.shinR[0]=10;
      p.body[0]=-5;p.head[0]=-10;
      p.offset=h*.2;
      return p;
    }
    case 'clap':{
      const open=Math.max(0,Math.sin(t*8))*14;
      p.armL=[-72,0,16+open];p.armR=[-72,0,-16-open];
      p.forearmL=[-32,0,0];p.forearmR=[-32,0,0];
      p.body[0]=6;p.head[0]=12;
      p.legL[0]=4;p.legR[0]=-4;p.shinL[0]=6;p.shinR[0]=6;
      p.offset=Math.abs(Math.sin(t*8))*.02;
      return p;
    }
    case 'swim':{
      const ph=Math.sin(t*4.2),fl=Math.sin(t*9);
      p.body[0]=52;p.head[0]=-40;
      p.armR=[-70-95*ph,0,-6];p.armL=[-70+95*ph,0,6];
      p.forearmR=[-18,0,0];p.forearmL=[-18,0,0];
      p.legR=[-52+fl*9,0,0];p.legL=[-52-fl*9,0,0];
      p.shinR=[8+Math.max(0,fl)*8,0,0];p.shinL=[8+Math.max(0,-fl)*8,0,0];
      p.offset=.55+ph*.05;
      return p;
    }
    default:return presetPose(name,t,true);
  }
}

export const CLIP_DEFAULTS={
  walk:{dur:4,step:.25,speed:1.4},
  run:{dur:3,step:.2,speed:3.2},
  wave:{dur:2,step:.2},
  jump:{dur:1.4,step:.1},
  dance:{dur:4,step:.2},
  spin:{dur:2,step:.5},
  mine:{dur:2,step:.2},
  punch:{dur:1.6,step:.1},
  kick:{dur:1.6,step:.1},
  backflip:{dur:1.6,step:.1},
  sneak:{dur:4,step:.25,speed:.7},
  death:{dur:1.8,step:.1},
  cheer:{dur:2.4,step:.15},
  clap:{dur:2.4,step:.15},
  swim:{dur:4,step:.25,speed:1.1}
};
// Clips that travel along the character's facing (direction -1 walks backwards).
export const MOVING_CLIPS=new Set(['walk','run','sneak','swim']);
// Bake a clip into character-track keys starting at `start` seconds.
// forward = (sin yaw, cos yaw): yaw is the character root's Y rotation in radians.
export function bakeClip({clip,start=0,duration,from=[0,0,0],yaw=0,speed,step,heightAt,direction=1}){
  const d=CLIP_DEFAULTS[clip]||CLIP_DEFAULTS.walk;
  duration=Math.max(d.step,Number(duration)||d.dur);
  const moving=MOVING_CLIPS.has(clip);
  speed=moving?(Number(speed)||d.speed||0):0;
  step=Number(step)||d.step;
  const dir=direction<0?-1:1,fx=Math.sin(yaw),fz=Math.cos(yaw);
  const poseName=clip==='spin'?'idle':clip;
  const sampleAt=t=>{
    const f=duration>0?Math.min(1,t/duration):1;
    let x=from[0],z=from[2];
    if(moving){x+=fx*speed*dir*t;z+=fz*speed*dir*t;}
    if(clip==='backflip'){x-=fx*.45*dir*f;z-=fz*.45*dir*f;}
    const y=heightAt?heightAt(x,z):from[1];
    let rot=[0,yaw,0];
    if(clip==='spin')rot=[0,yaw+Math.PI*2*f,0];
    if(clip==='backflip')rot=[-Math.PI*2*f,yaw,0];
    return {time:start+Math.min(t,duration),position:[x,clip==='backflip'?y+Math.sin(Math.PI*f)*1.15:y,z],rotation:rot,scale:[1,1,1],pose:clipPose(poseName,t)};
  };
  const keys=[];
  for(let t=0;t<=duration+1e-6;t+=step)keys.push(sampleAt(t));
  if(keys.at(-1).time<start+duration-1e-6)keys.push(sampleAt(duration));
  return {keys,duration};
}
// Plan a queued clip sequence: each clip starts where the previous ends.
export function planSequence(clips,{duration,start=0}={}){
  if(!clips?.length)throw new Error('Queue some clips first.');
  let cursor=start;const plan=[];
  for(const clip of clips){
    const d=CLIP_DEFAULTS[clip]||CLIP_DEFAULTS.walk;
    const dur=Math.max(d.step,Number(duration)||d.dur);
    plan.push({clip,start:cursor,duration:dur});
    cursor+=dur;
  }
  return {plan,totalTime:cursor-start};
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
