import * as THREE from 'three';
import { renderDistanceUniform } from './render-dist.js';

// Shared uniforms for every water surface in the scene (terrain ponds and placed water blocks).
export const waterUniforms={
  uTime:{value:0},
  uRenderDist:renderDistanceUniform,
  uSunDir:{value:new THREE.Vector3(.4,.7,.5).normalize()},
  uSunColor:{value:new THREE.Color('#ffe6b9')},
  uSkyColor:{value:new THREE.Color('#c5d6d3')},
  uShallow:{value:new THREE.Color('#5fc8b4')},
  uDeep:{value:new THREE.Color('#123f63')},
  uFogColor:{value:new THREE.Color('#c5d6d3')},
  uFogNear:{value:160},
  uFogFar:{value:1400}
};

// Scene time in seconds driving the waves. Export passes explicit timestamps so renders stay deterministic.
export function setWaterTime(t){waterUniforms.uTime.value=t;}

// Keep water lighting/fog in sync with the editor's Light panel.
export function updateWaterEnv({sunDir,sunColor,sky,fog}={}){
  if(sunDir)waterUniforms.uSunDir.value.copy(sunDir).normalize();
  if(sunColor)waterUniforms.uSunColor.value.set(sunColor);
  if(sky)waterUniforms.uSkyColor.value.set(sky);
  if(fog){waterUniforms.uFogColor.value.set(fog.color??fog);waterUniforms.uFogNear.value=fog.near??160;waterUniforms.uFogFar.value=fog.far??1400;}
  else{waterUniforms.uFogColor.value.set(sky||'#c5d6d3');waterUniforms.uFogNear.value=160;waterUniforms.uFogFar.value=1400;}
}

const VERT=/* glsl */`
attribute float aDepth;
uniform float uTime;
uniform float uRenderDist;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vDepth;
float waveH(vec2 p,float t){
  return sin(p.x*0.85+t*1.25)*0.5
       + sin((p.x*0.55+p.y*0.75)*1.15+t*0.85)*0.32
       + sin(p.y*1.6+t*1.6)*0.18;
}
void main(){
  vec4 wp=modelMatrix*vec4(position,1.0);
  // Gentle swell: same height for any vertex sharing (x,z), so top and side faces stay welded.
  wp.y+=waveH(wp.xz,uTime)*0.045;
  vWorld=wp.xyz;
  vNormal=normalize(mat3(modelMatrix)*normal);
  vDepth=aDepth;
  gl_Position=projectionMatrix*viewMatrix*wp;
  // Render-distance culling: water beyond the limit collapses off-screen (same
  // shared uniform as every block material, so one slider drives the whole scene).
  if(distance(wp.xz,cameraPosition.xz)>uRenderDist)gl_Position=vec4(0.0,0.0,-2.0,1.0);
}`;

const FRAG=/* glsl */`
uniform float uTime;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFogColor;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vDepth;
float waveH(vec2 p,float t){
  return sin(p.x*0.85+t*1.25)*0.5
       + sin((p.x*0.55+p.y*0.75)*1.15+t*0.85)*0.32
       + sin(p.y*1.6+t*1.6)*0.18;
}
float detailH(vec2 p,float t){
  return sin(p.x*2.3+t*2.1)*0.5
       + sin((p.x+p.y)*3.1-t*1.7)*0.3
       + sin(p.y*4.7+t*2.6)*0.2;
}
void main(){
  vec2 p=vWorld.xz;
  float e=0.09;
  float h=waveH(p,uTime),hx=waveH(p+vec2(e,0.0),uTime),hz=waveH(p+vec2(0.0,e),uTime);
  float d=detailH(p,uTime),dx=detailH(p+vec2(e,0.0),uTime),dz=detailH(p+vec2(0.0,e),uTime);
  float sx=((hx-h)/e)*0.045+((dx-d)/e)*0.012;
  float sz=((hz-h)/e)*0.045+((dz-d)/e)*0.012;
  vec3 ripple=normalize(vec3(-sx,1.0,-sz));
  float upright=clamp(vNormal.y*0.85+0.15,0.0,1.0);
  vec3 n=normalize(mix(vNormal,ripple,upright));
  vec3 view=normalize(cameraPosition-vWorld);
  float fres=pow(1.0-clamp(dot(view,n),0.0,1.0),3.0);
  float depthMix=clamp(vDepth/5.0,0.0,1.0);
  vec3 col=mix(uShallow,uDeep,depthMix);
  col=mix(col,uSkyColor*1.12+0.06,fres*0.85);
  vec3 halfV=normalize(view+uSunDir);
  float spec=pow(max(dot(n,halfV),0.0),220.0)*1.7;
  col+=uSunColor*spec;
  // Shoreline / waterline foam where the water column is thin.
  float foam=smoothstep(0.62,0.10,vDepth)*(0.55+0.45*sin(uTime*2.2+p.x*3.4+p.y*2.7)*sin(uTime*1.7+p.y*4.1));
  foam=clamp(foam,0.0,1.0)*0.8;
  col=mix(col,vec3(0.93,0.97,0.98),foam);
  float alpha=clamp(mix(0.62,0.94,fres)+foam*0.45+spec*0.25,0.0,1.0);
  float fogDist=length(cameraPosition-vWorld);
  float fogF=clamp((fogDist-uFogNear)/max(uFogFar-uFogNear,1.0),0.0,1.0);
  col=mix(col,uFogColor,fogF);
  gl_FragColor=vec4(col,alpha*(1.0-fogF*0.4));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

let shared=null;
export function waterMaterial(){
  if(shared)return shared;
  shared=new THREE.ShaderMaterial({
    uniforms:waterUniforms,
    vertexShader:VERT,
    fragmentShader:FRAG,
    transparent:true,
    depthWrite:false,
    side:THREE.DoubleSide
  });
  return shared;
}

// Face table: [direction, 4 corners (CCW seen from outside), normal]
const FACES=[
  [[1,0,0],[[1,0,1],[1,0,0],[1,1,0],[1,1,1]],[1,0,0]],
  [[-1,0,0],[[0,0,0],[0,0,1],[0,1,1],[0,1,0]],[-1,0,0]],
  [[0,1,0],[[0,1,1],[1,1,1],[1,1,0],[0,1,0]],[0,1,0]],
  [[0,-1,0],[[0,0,0],[1,0,0],[1,0,1],[0,0,1]],[0,-1,0]],
  [[0,0,1],[[0,0,1],[1,0,1],[1,1,1],[0,1,1]],[0,0,1]],
  [[0,0,-1],[[1,0,0],[0,0,0],[0,1,0],[1,1,0]],[0,0,-1]]
];
const UV=[[0,0],[1,0],[1,1],[0,1]];

// Builds one welded water surface for a set of water cells: only faces exposed to
// air/transparent neighbours are emitted, so a pond reads as a single body of water.
// get(x,y,z) -> block type string or null/undefined; isOpaque(type) -> whether the face is hidden.
export function buildWaterGeometry(cells,get,isOpaque=()=>false){
  const set=new Set(cells.map(c=>c.join(',')));
  const columns=new Map();
  for(const [x,y,z] of cells){
    const k=x+','+z,c=columns.get(k)||{min:Infinity,max:-Infinity};
    c.min=Math.min(c.min,y);c.max=Math.max(c.max,y);columns.set(k,c);
  }
  const pos=[],nor=[],uv=[],dep=[],idx=[];
  for(const [x,y,z] of cells){
    const col=columns.get(x+','+z),surface=col.max+1,height=col.max-col.min+1;
    for(const [dir,corners,normal] of FACES){
      const n=get(x+dir[0],y+dir[1],z+dir[2]);
      if(set.has((x+dir[0])+','+(y+dir[1])+','+(z+dir[2])))continue; // inside the water body
      if(n&&isOpaque(n))continue;                                     // buried against solid rock
      const base=pos.length/3;
      for(let i=0;i<4;i++){
        const c=corners[i],vy=y+c[1];
        pos.push(x+c[0],vy,z+c[2]);
        nor.push(normal[0],normal[1],normal[2]);
        uv.push(UV[i][0],UV[i][1]);
        dep.push(normal[1]>0.5||normal[1]<-0.5?height:Math.max(0,surface-vy));
      }
      idx.push(base,base+1,base+2,base,base+2,base+3);
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setAttribute('aDepth',new THREE.Float32BufferAttribute(dep,1));
  g.setIndex(idx);
  g.computeBoundingBox();g.computeBoundingSphere();
  return g;
}
