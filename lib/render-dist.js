// Render-distance culling: one shared uniform every world material watches.
// Geometry further than uRenderDist blocks from the camera (horizontal distance,
// Minecraft-style) collapses off-screen in the vertex shader, so distant terrain
// costs no fragments at all — zero CPU work per frame, no buffer rebuilds.
export const RENDER_DIST_MIN=20,RENDER_DIST_MAX=500,RENDER_DIST_DEFAULT=125;
export const renderDistanceUniform={value:RENDER_DIST_DEFAULT};
export function clampRenderDistance(v){
  v=Math.round(Number(v));
  if(!Number.isFinite(v))return RENDER_DIST_DEFAULT;
  return Math.min(RENDER_DIST_MAX,Math.max(RENDER_DIST_MIN,v));
}
// The injected chunk runs right after three's <project_vertex>: `transformed` is
// the local vertex, instanceMatrix (when instanced) and modelMatrix lift it to
// world space, and anything beyond the limit gets a clip-space position the GPU
// discards before rasterization.
const CULL_CHUNK=`#include <project_vertex>
{
  vec4 rdWorld = modelMatrix *
#ifdef USE_INSTANCING
    instanceMatrix *
#endif
    vec4( transformed, 1.0 );
  if ( distance( rdWorld.xz, cameraPosition.xz ) > uRenderDist ) {
    gl_Position = vec4( 0.0, 0.0, -2.0, 1.0 );
  }
}`;
// Adds the culling hook to any material built from three's shader chunks
// (MeshStandardMaterial, MeshBasicMaterial, ...). Custom shaders without
// <project_vertex> are left untouched.
export function applyRenderDistance(material){
  material.onBeforeCompile=shader=>{
    if(!shader.vertexShader.includes('#include <project_vertex>'))return;
    shader.uniforms.uRenderDist=renderDistanceUniform;
    shader.vertexShader='uniform float uRenderDist;\n'+shader.vertexShader.replace('#include <project_vertex>',CULL_CHUNK);
  };
  return material;
}
