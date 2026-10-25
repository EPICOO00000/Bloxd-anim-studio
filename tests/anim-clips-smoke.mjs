// Smoke tests for the one-click animation suite: per-key easing, pose mirroring,
// baked clips and walk-path baking. Run via esbuild bundle (three alias) — see README.
import assert from 'node:assert/strict';
import { mirrorPose, clipPose, bakeClip, bakeWalkPath, easeWeight, planSequence, CLIP_DEFAULTS, MOVING_CLIPS } from '../lib/anim-clips.js';
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

// ── expanded clip library: every default produces a valid pose ──
const JOINT_IDS=['body','head','armR','forearmR','armL','forearmL','legR','shinR','legL','shinL'];
for(const name of Object.keys(CLIP_DEFAULTS)){
  ok(CLIP_DEFAULTS[name].dur>0&&CLIP_DEFAULTS[name].step>0,'defaults sane: '+name);
  const p=clipPose(name,.7);
  ok(Number.isFinite(p.offset),'pose offset finite: '+name);
  for(const j of JOINT_IDS)ok(Array.isArray(p[j])&&p[j].length===3&&p[j].every(Number.isFinite),'pose joint finite: '+name+'.'+j);
}
ok([...MOVING_CLIPS].every(m=>CLIP_DEFAULTS[m].speed>0),'moving clips have travel speeds');

// ── movement vs in-place clips ──
const gS=bakeClip({clip:'sneak',start:0,duration:4,from:[0,0,0],yaw:0,heightAt:()=>0});
ok(near(gS.keys.at(-1).position[2],.7*4),'sneak travels at its slower default speed');
const gSw=bakeClip({clip:'swim',start:0,duration:4,from:[0,0,0],yaw:0,heightAt:()=>0});
ok(near(gSw.keys.at(-1).position[2],1.1*4),'swim travels forward');
const gP=bakeClip({clip:'punch',start:0,duration:1.6,from:[3,0,7],yaw:.4,heightAt:()=>0});
ok(gP.keys.every(k=>near(k.position[0],3)&&near(k.position[2],7)),'punch stays in place');
const gD=bakeClip({clip:'death',start:0,duration:1.8,from:[1,0,1],yaw:0,heightAt:()=>0});
ok(gD.keys.every(k=>near(k.position[0],1)&&near(k.position[1],0)),'death collapses in place on the ground');

// ── backwards baking ──
const gB=bakeClip({clip:'walk',start:0,duration:2,from:[0,0,0],yaw:0,speed:1.5,direction:-1,heightAt:()=>0});
ok(near(gB.keys.at(-1).position[2],-3),'backwards walk travels -z');
ok(gB.keys.every(k=>near(k.rotation[1],0)),'backwards keeps the character facing forward');

// ── backflip: full backward rotation, air arc, landing, slight drift ──
const gF=bakeClip({clip:'backflip',start:0,duration:1.6,from:[0,0,0],yaw:0,heightAt:()=>0});
const fMid=gF.keys[Math.floor(gF.keys.length/2)],fEnd=gF.keys.at(-1);
ok(near(fEnd.rotation[0],-Math.PI*2),'backflip rotates a full turn backwards');
ok(near(fMid.rotation[0],-Math.PI,Math.PI/4),'mid-flip is roughly upside down');
ok(fMid.position[1]>1,'backflip arcs into the air');
ok(near(fEnd.position[1],0),'backflip lands back on the ground');
ok(near(fEnd.position[2],-.45),'backflip drifts slightly backwards');
ok(clipPose('backflip',1).legR[0]<-50,'flip pose tucks the legs');

// ── death pose: stands at t=0, flat on the back at the end ──
ok(near(clipPose('death',0).body[0],0),'death starts standing');
ok(clipPose('death',2).body[0]<-60&&clipPose('death',2).offset<-.3,'death ends flat on the back');

// ── punch alternates both arms ──
let rMin=0,lMin=0;
for(let t=0;t<1.6;t+=.05){const p=clipPose('punch',t);rMin=Math.min(rMin,p.armR[0]);lMin=Math.min(lMin,p.armL[0]);}
ok(rMin<-70&&lMin<-70,'punch fully extends each arm over the cycle');

// ── sequence planning ──
const plan=planSequence(['walk','wave','dance'],{start:2});
ok(near(plan.totalTime,4+2+4),'sequence total = sum of clip defaults');
ok(near(plan.plan[0].start,2)&&near(plan.plan[1].start,6)&&near(plan.plan[2].start,8),'clips chain end to end from the cursor');
const plan2=planSequence(['walk','run'],{duration:1,start:0});
ok(near(plan2.totalTime,2)&&near(plan2.plan[1].start,1),'duration option applies to every clip');
assert.throws(()=>planSequence([]),'empty queue rejected');

// ── chained travel: a walk segment continues from where it ended ──
const segA=bakeClip({clip:'walk',start:0,duration:2,from:[0,0,0],yaw:0,heightAt:()=>0});
const endA=segA.keys.at(-1);
const segB=bakeClip({clip:'walk',start:2,duration:2,from:endA.position,yaw:endA.rotation[1],heightAt:()=>0});
ok(near(segB.keys.at(-1).position[2],1.4*4),'two chained walks cover the summed distance');

console.log('anim-clips smoke OK · '+n+' assertions passed');
