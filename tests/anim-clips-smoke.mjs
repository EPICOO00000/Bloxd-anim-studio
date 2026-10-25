// Smoke tests for the one-click animation suite: per-key easing, pose mirroring,
// baked clips and walk-path baking. Run via esbuild bundle (three alias) — see README.
import assert from 'node:assert/strict';
import { mirrorPose, clipPose, bakeClip, bakeWalkPath, easeWeight, CLIP_DEFAULTS } from '../lib/anim-clips.js';
import { putKey, sampleTransform } from '../lib/tracks.js';
import { presetPose } from '../lib/character.js';

let n=0;const ok=(c,m)=>{assert.ok(c,m);n++;};
const near=(a,b,e=1e-6)=>Math.abs(a-b)<=e;

// ── easeWeight ──
ok(near(easeWeight(undefined,.37),.37*.37*(3-2*.37)),'default ease = classic smoothstep');
ok(near(easeWeight('smooth',.37),.37*.37*(3-2*.37)),'smooth alias');
ok(near(easeWeight('linear',.25),.25),'linear');
ok(near(easeWeight('in',.5),.25),'ease in');
ok(near(easeWeight('out',.5),.75),'ease out');
ok(near(easeWeight('inout',.5),.5),'in-out midpoint');
ok(near(easeWeight('hold',.9),0),'hold stays put');

// ── sampleTransform honours the outgoing key's ease ──
const base={time:0,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]};
const end={time:1,position:[2,0,0],rotation:[0,0,0],scale:[1,1,1]};
const sm=sampleTransform([{...base},{...end}],.25);
const ln=sampleTransform([{...base,ease:'linear'},{...end}],.25);
const hd=sampleTransform([{...base,ease:'hold'},{...end}],.25);
ok(near(sm.position[0],2*.15625),'uneased sampling unchanged (smoothstep .25)');
ok(near(ln.position[0],.5),'linear sampling exact lerp');
ok(near(hd.position[0],0),'hold sampling sticks to outgoing key');

// ── putKey keeps existing ease when replacing without one ──
const keys=[{...base,ease:'linear'}];
putKey(keys,{...base,position:[9,0,0]});
ok(keys.length===1&&keys[0].ease==='linear'&&near(keys[0].position[0],9),'putKey replaces in place + inherits ease');
putKey(keys,{...base,position:[1,0,0],ease:'out'});
ok(keys[0].ease==='out','explicit ease overrides');

// ── mirrorPose ──
const idle=presetPose('idle',0,false);
const mm=mirrorPose(mirrorPose(idle));
for(const j of Object.keys(idle)){
  if(j==='offset'){ok(mm.offset===idle.offset,'offset untouched');continue;}
  for(let c=0;c<3;c++)ok(near(mm[j][c],idle[j][c],1e-9),'mirror² identity '+j+'['+c+']');
}
const wave=presetPose('wave',0,false);
const mw=mirrorPose(wave);
ok(near(mw.armL[0],wave.armR[0])&&near(mw.armL[2],-wave.armR[2]),'wave mirrors onto the left arm');
ok(near(mw.armR[0],wave.armL[0])&&near(mw.armR[2],-wave.armL[2]),'and the left arm back to the right');
const walkM=mirrorPose(presetPose('walk',.3,true));
ok(walkM.legL&&walkM.shinR,'mirrored walk keeps joint set');

// ── clipPose ──
const dp=clipPose('dance',.5);
ok(dp&&Array.isArray(dp.armL)&&Array.isArray(dp.legR)&&typeof dp.offset==='number','dance pose shape');
ok(near(clipPose('walk',.5).armL[0],presetPose('walk',.5,true).armL[0]),'non-dance clips delegate to animated presetPose');

// ── bakeClip ──
const gen=bakeClip({clip:'walk',start:1,duration:4,from:[10,0,-4],yaw:0,speed:1.4,step:.25,heightAt:()=>2});
ok(gen.keys.length===17,'walk 4s @ .25 step → 17 keys, got '+gen.keys.length);
const k0=gen.keys[0],kN=gen.keys.at(-1);
ok(near(k0.time,1)&&near(kN.time,5),'keys anchored to start time');
ok(near(k0.position[0],10)&&near(k0.position[2],-4),'first key at origin pose spot');
ok(near(kN.position[2],-4+1.4*4),'forward is +z at yaw 0, distance = speed·duration');
ok(gen.keys.every(k=>k.position[1]===2),'heightAt respected');
ok(k0.pose&&Array.isArray(k0.pose.armL)&&Array.isArray(k0.scale)&&k0.scale.length===3&&Array.isArray(k0.rotation),'key shape {time,position,rotation,scale,pose}');
ok(near(k0.rotation[1],0),'facing yaw preserved');
const g2=bakeClip({clip:'walk',start:0,duration:1,from:[0,0,0],yaw:Math.PI/2,step:.5});
ok(near(g2.keys.at(-1).position[0],1.4)&&near(g2.keys.at(-1).position[2],0),'yaw π/2 walks toward +x');
const gs=bakeClip({clip:'spin',start:0,duration:2,yaw:.3,step:.5});
ok(near(gs.keys.at(-1).rotation[1],.3+Math.PI*2),'spin completes one full turn');
ok(gs.keys.every(k=>k.pose&&Array.isArray(k.pose.body)),'spin keys carry poses');
ok(CLIP_DEFAULTS.walk.dur===4&&CLIP_DEFAULTS.run.speed===3.2&&CLIP_DEFAULTS.dance.step===.2&&CLIP_DEFAULTS.spin.dur===2,'clip defaults');

// ── bakeWalkPath ──
const gp=bakeWalkPath({points:[[0,0],[0,3],[4,3]],speed:2,start:.5,step:.25,heightAt:()=>1});
ok(near(gp.distance,7),'path distance = 3+4');
ok(near(gp.totalTime,3.5),'totalTime = distance/speed');
ok(near(gp.keys[0].time,.5)&&near(gp.keys.at(-1).time,4),'path key times');
ok(near(gp.keys[0].position[0],0)&&near(gp.keys[0].position[2],0),'starts at first point');
ok(near(gp.keys.at(-1).position[0],4)&&near(gp.keys.at(-1).position[2],3),'ends exactly on last point');
ok(near(gp.keys[0].rotation[1],0),'first segment faces +z');
ok(near(gp.keys.at(-1).rotation[1],Math.PI/2),'second segment faces +x');
ok(gp.keys.every(k=>k.position[1]===1&&k.pose&&Array.isArray(k.pose.legL)),'path keys grounded + posed');
assert.throws(()=>bakeWalkPath({points:[[0,0]]}),/at least two/,'single point rejected');
assert.throws(()=>bakeWalkPath({points:[[1,1],[1,1]]}),/identical/,'degenerate path rejected');

console.log('anim-clips smoke OK · '+n+' assertions passed');
