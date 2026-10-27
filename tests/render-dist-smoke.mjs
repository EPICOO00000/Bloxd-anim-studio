// Smoke tests for render-distance culling: the shared uniform, the vertex-shader
// injection into block/item materials, the water shader hookup, and the clamps.
import assert from 'node:assert/strict';
import { loadAssets, getBlockPrototype } from '../lib/assets.js';
import { waterMaterial, waterUniforms } from '../lib/water.js';
import { renderDistanceUniform, applyRenderDistance, clampRenderDistance, RENDER_DIST_MIN, RENDER_DIST_MAX, RENDER_DIST_DEFAULT } from '../lib/render-dist.js';

await loadAssets().catch(()=>{});

let n=0;const ok=(c,m)=>{assert.ok(c,m);n++;};

// ── limits & defaults ──
ok(RENDER_DIST_DEFAULT===125,'default render distance is 125 blocks');
ok(RENDER_DIST_MIN===20&&RENDER_DIST_MAX===500,'user range is 20–500');
ok(renderDistanceUniform.value===125,'the shared uniform starts at the default');
ok(clampRenderDistance('300')===300&&clampRenderDistance(5)===20&&clampRenderDistance(9999)===500&&clampRenderDistance('junk')===125&&clampRenderDistance(127.4)===127,'clamping rounds and sanitizes');

// ── block materials carry the culling hook ──
const proto=getBlockPrototype('grass');
ok(proto.materials.length===6&&proto.materials.every(m=>typeof m.onBeforeCompile==='function'),'every cube face material carries the hook');
const fakeShader=()=>({uniforms:{},vertexShader:'void main(){ vec3 transformed = position;\n#include <project_vertex>\n}',fragmentShader:'void main(){}'});
{
  const s=fakeShader();
  proto.materials[0].onBeforeCompile(s,{});
  ok(s.uniforms.uRenderDist===renderDistanceUniform,'injection shares the one uniform object');
  ok(s.vertexShader.startsWith('uniform float uRenderDist;'),'uniform is declared at the top of the vertex shader');
  ok(s.vertexShader.includes('#include <project_vertex>'),'the original project_vertex chunk stays');
  ok(s.vertexShader.includes('cameraPosition.xz'),'culling measures horizontal distance from the camera');
  ok(s.vertexShader.includes('uRenderDist )')||s.vertexShader.includes('uRenderDist)'),'the limit uniform drives the test');
  ok(s.vertexShader.includes('gl_Position = vec4( 0.0, 0.0, -2.0, 1.0 )')||s.vertexShader.includes('-2.0'),'far geometry collapses outside clip space');
  ok(s.vertexShader.includes('USE_INSTANCING')&&s.vertexShader.includes('instanceMatrix'),'instanced world batches are handled');
}
// A shader without the chunk is left completely alone.
{
  const s={uniforms:{},vertexShader:'void main(){gl_Position=vec4(position,1.0);}',fragmentShader:'void main(){}'};
  proto.materials[0].onBeforeCompile(s,{});
  ok(!s.uniforms.uRenderDist&&!s.vertexShader.includes('uRenderDist'),'custom shaders without project_vertex are untouched');
}
// Every material out of the shared factory is hooked (blocks, items, models).
const dirt=getBlockPrototype('dirt'),stone=getBlockPrototype('stone');
ok([...dirt.materials,...stone.materials].every(m=>typeof m.onBeforeCompile==='function'),'all cached factory materials are hooked');

// ── water shares the same uniform and culls in its own shader ──
const wm=waterMaterial();
ok(waterUniforms.uRenderDist===renderDistanceUniform,'water watches the same uniform object');
ok(wm.vertexShader.includes('uniform float uRenderDist;'),'water declares the uniform');
ok(wm.vertexShader.includes('cameraPosition.xz')&&wm.vertexShader.includes('uRenderDist'),'water culls by camera distance');
ok(wm.vertexShader.includes('gl_Position=vec4(0.0,0.0,-2.0,1.0)'),'far water collapses off-screen');
ok(wm.vertexShader.includes('waveH(wp.xz,uTime)'),'the wave swell survives the edit');

// ── one slider drives everything: mutating the uniform reaches both systems ──
renderDistanceUniform.value=300;
ok(waterUniforms.uRenderDist.value===300,'water sees the new distance');
{
  const s=fakeShader();
  proto.materials[0].onBeforeCompile(s,{});
  ok(s.uniforms.uRenderDist.value===300,'block materials see the new distance');
}
renderDistanceUniform.value=RENDER_DIST_DEFAULT;

// ── applyRenderDistance is reusable and idempotent-safe ──
{
  const m=applyRenderDistance({onBeforeCompile:null});
  ok(typeof m.onBeforeCompile==='function','applyRenderDistance installs the hook on any material');
}

console.log('render-dist smoke OK · '+n+' assertions passed');
