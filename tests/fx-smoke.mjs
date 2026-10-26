// Smoke tests for the FX module: particle emitters, 3D image panels and the
// playback-only lens-distortion track. Run via esbuild bundle (three alias) — see README.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PARTICLE_TYPES, createEmitter, setEmitterTexture, imagePlaneSize, createImageObject, fxIcon } from '../lib/fx.js';
import { sampleScalar } from '../lib/tracks.js';

let n=0;const ok=(c,m)=>{assert.ok(c,m);n++;};
const near=(a,b,e=1e-6)=>Math.abs(a-b)<=e;

// ── presets ──
const names=Object.keys(PARTICLE_TYPES);
ok(names.length===5,['fire','smoke','rain','snow','sparkle'].every(k=>names.includes(k)),'five particle presets');
for(const[k,p]of Object.entries(PARTICLE_TYPES)){
  ok(p.count>0&&p.life>0&&p.size>0,'sane numbers: '+k);
  ok(Number.isFinite(p.rise)&&Number.isFinite(p.fall)&&Number.isFinite(p.spread)&&p.opacity>0&&p.opacity<=1,'finite fields: '+k);
  ok(typeof p.label==='string'&&p.label.length>0,'label: '+k);
  ok(typeof p.additive==='boolean','blend flag: '+k);
}
ok(PARTICLE_TYPES.rain.rise>0&&PARTICLE_TYPES.rain.fall>PARTICLE_TYPES.rain.rise,'rain starts high and falls past the ground');
ok(PARTICLE_TYPES.fire.fall<0,'fire rises (negative fall)');

// ── emitter construction (no GL context needed) ──
const em=createEmitter('fire');
ok(em.root.isGroup&&em.root.name==='Fire','emitter root is a named group');
ok(em.points.isPoints&&em.points.frustumCulled===false,'points cloud, never frustum-culled');
const u=em.material.uniforms;
for(const key of ['uTime','uSize','uLife','uRise','uFall','uSpread','uSway','uGrow','uOpacity','uFlicker','uColorA','uColorB','uTex','uUseTex'])ok(key in u,'uniform present: '+key);
ok(u.uSize.value===PARTICLE_TYPES.fire.size&&u.uLife.value===PARTICLE_TYPES.fire.life,'uniforms fed from the preset');
ok(em.material.uniforms.uColorA.value.isColor,'colors are THREE.Color');
ok(em.material.transparent===true&&em.material.depthWrite===false,'transparent, no depth write');
ok(em.material.blending===THREE.AdditiveBlending,'fire is additive');
ok(createEmitter('smoke').material.blending===THREE.NormalBlending,'smoke is normal-blended');
const seeds=em.points.geometry.getAttribute('aSeed');
ok(seeds&&seeds.count===PARTICLE_TYPES.fire.count,'one seed per particle');
let inRange=true;for(let i=0;i<seeds.array.length;i++)if(seeds.array[i]<0||seeds.array[i]>1)inRange=false;
ok(inRange,'seeds in [0,1]');
ok(em.points.geometry.boundingBox&&em.points.geometry.boundingSphere,'volumes set for selection box + raycast');
ok(em.points.geometry.boundingSphere.radius>1,'bounding sphere covers the plume');
em.update(3.25);ok(em.material.uniforms.uTime.value===3.25,'update(t) feeds the deterministic clock');
const fallback=createEmitter('nope');
ok(fallback.root.name==='Fire'&&fallback.type==='fire','unknown type falls back to fire');
em.dispose();fallback.dispose();ok(true,'dispose is clean');

// ── particle sprite swap (imported PNGs as particles) ──
const em2=createEmitter('sparkle');
ok(em2.material.uniforms.uUseTex.value===false&&em2.material.uniforms.uTex.value===null,'soft dot by default');
const tex=new THREE.Texture();
setEmitterTexture(em2,tex);
ok(em2.material.uniforms.uUseTex.value===true&&em2.material.uniforms.uTex.value===tex,'image becomes the sprite');
setEmitterTexture(em2,null);
ok(em2.material.uniforms.uUseTex.value===false,'and clears again');
em2.dispose();

// ── image panels ──
ok(imagePlaneSize(64,64).width===2.2&&imagePlaneSize(64,64).height===2.2,'square image → 2.2×2.2 panel');
const wide=imagePlaneSize(200,100);
ok(near(wide.width,4.4)&&near(wide.height,2.2),'aspect kept for wide images');
const huge=imagePlaneSize(2000,100);
ok(near(huge.width,8)&&near(huge.height,.4),'very wide images clamp to 8 blocks');
const tall=imagePlaneSize(50,400);
ok(near(tall.height,2.2)&&near(tall.width,.275),'tall images keep aspect');
ok(imagePlaneSize(0,0).width>0&&imagePlaneSize(undefined,undefined).height>0,'degenerate sizes fall back safely');
const fakeTex={image:{width:100,height:50}};
const panel=createImageObject(fakeTex,'Logo');
ok(panel.isGroup&&panel.name==='Logo','panel root named');
const mesh=panel.children[0];
ok(mesh.isMesh&&mesh.material.map===fakeTex,'mesh carries the texture');
ok(near(mesh.position.y,mesh.geometry.parameters.height/2),'panel stands on its bottom edge');
ok(mesh.material.side===THREE.DoubleSide&&mesh.material.transparent===true,'double-sided + transparent for PNG alpha');
const dflt=createImageObject(null,'X');
ok(dflt.children[0].isMesh,'works even without a texture');

// ── fx icons ──
for(const k of ['fire','smoke','rain','snow','sparkle','png','unknown'])ok(fxIcon(k).startsWith('data:image/svg+xml,'),'icon data url: '+k);

// ── distortion track sampling ──
ok(sampleScalar([],2)===0,'no keys → no warp');
const dk=[{time:1,amount:0},{time:3,amount:1}];
ok(sampleScalar(dk,0)===0,'before the first key clamps to its value');
ok(sampleScalar(dk,5)===1,'after the last key clamps to its value');
ok(near(sampleScalar(dk,2),.5),'smoothstep midpoint is exact');
const quarter=sampleScalar(dk,1.5);ok(quarter>0&&quarter<.5,'eased ramp sits below linear at the quarter point');
const hold=[{time:0,amount:.8,ease:'hold'},{time:2,amount:0}];
ok(near(sampleScalar(hold,1),.8),'hold keeps the warp until the next key');
const lin=[{time:0,amount:0,ease:'linear'},{time:2,amount:1}];
ok(near(sampleScalar(lin,.5),.25),'linear ramp');
const single=[{time:2,amount:.6}];
ok(near(sampleScalar(single,0),.6)&&near(sampleScalar(single,9),.6),'a lone key warps the whole clip');

console.log('fx smoke OK · '+n+' assertions passed');
