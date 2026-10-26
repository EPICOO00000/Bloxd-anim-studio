// FX module: GPU particle emitters (fire, smoke, rain, snow, sparkle) and 3D image
// panels from imported PNGs. Emitters are deterministic: every particle position is a
// pure function of (seed, uTime), so scrubbing the timeline and video exports stay
// frame-exact — the studio just feeds timeline.time while playing and a wall clock
// for the idle preview.
import * as THREE from 'three';

export const PARTICLE_TYPES={
  fire:{label:'Fire',count:260,life:1.05,rise:.05,fall:-2.1,spread:.5,sway:.12,grow:-.35,size:15,colorA:'#ffd76b',colorB:'#ff4a12',opacity:.95,flicker:.4,additive:true},
  smoke:{label:'Smoke',count:170,life:2.8,rise:.15,fall:-1.6,spread:.45,sway:.3,grow:1.35,size:24,colorA:'#c3cbd2',colorB:'#59616a',opacity:.34,flicker:0,additive:false},
  rain:{label:'Rain',count:650,life:.85,rise:9,fall:12.5,spread:7,sway:.03,grow:0,size:2.4,colorA:'#eaf6ff',colorB:'#aacdf0',opacity:.7,flicker:0,additive:false},
  snow:{label:'Snow',count:380,life:5.2,rise:6,fall:6.6,spread:7,sway:.6,grow:0,size:4.5,colorA:'#ffffff',colorB:'#dce9f7',opacity:.9,flicker:.15,additive:false},
  sparkle:{label:'Sparkle',count:220,life:1.7,rise:.15,fall:-1.15,spread:1.1,sway:.28,grow:-.15,size:7,colorA:'#fff3a6',colorB:'#c9a2ff',opacity:.95,flicker:.85,additive:true}
};

const PARTICLE_VERT=`
attribute vec3 aSeed;
uniform float uTime,uSize,uLife,uRise,uFall,uSpread,uSway,uGrow;
varying float vAge;varying float vSeed;
void main(){
  vSeed=aSeed.x;
  float life=uLife*(0.55+0.9*aSeed.x);
  float age=mod(uTime*(0.75+0.5*aSeed.y)+aSeed.z*life,life);
  float nf=age/life;vAge=nf;
  float ang=aSeed.z*6.2831853;
  float rad=uSpread*(0.2+0.8*aSeed.y);
  vec3 p=position;
  p.x+=cos(ang)*rad+sin(uTime*1.7+aSeed.x*12.56)*uSway*nf;
  p.z+=sin(ang)*rad+cos(uTime*1.31+aSeed.y*11.3)*uSway*nf;
  p.y+=uRise-nf*uFall+sin(uTime*2.9+aSeed.z*9.4)*uSway*0.4*nf;
  vec4 mv=modelViewMatrix*vec4(p,1.0);
  gl_Position=projectionMatrix*mv;
  gl_PointSize=max(1.0,uSize*(1.0+nf*uGrow)*(160.0/max(0.25,-mv.z)));
}`;
const PARTICLE_FRAG=`
uniform vec3 uColorA,uColorB;
uniform float uOpacity,uFlicker,uTime;
uniform sampler2D uTex;uniform bool uUseTex;
varying float vAge;varying float vSeed;
void main(){
  vec4 tex=uUseTex?texture2D(uTex,gl_PointCoord):vec4(1.0);
  float d=length(gl_PointCoord-vec2(0.5));
  float soft=uUseTex?tex.a:smoothstep(0.5,0.06,d);
  float fade=smoothstep(0.0,0.12,vAge)*(1.0-smoothstep(0.55,1.0,vAge));
  float flick=1.0-uFlicker*0.5*(0.5+0.5*sin(uTime*24.0+vSeed*94.0));
  float alpha=soft*fade*uOpacity*flick;
  if(alpha<0.02)discard;
  gl_FragColor=vec4(mix(uColorA,uColorB,vAge)*tex.rgb,alpha);
}`;

// Builds a placeable emitter: a Group holding one THREE.Points cloud. Move/rotate/scale
// the Group and key it like any other object — particles inherit the transform.
export function createEmitter(type='fire'){
  const cfg=PARTICLE_TYPES[type]||PARTICLE_TYPES.fire;
  const n=cfg.count,geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3));
  const seeds=new Float32Array(n*3);
  for(let i=0;i<n*3;i++)seeds[i]=Math.random();
  geo.setAttribute('aSeed',new THREE.BufferAttribute(seeds,3));
  // Volumes for the selection box / raycast early-out (particles themselves are
  // computed on the GPU, so the CPU geometry is all zeros).
  const yMin=Math.min(0,cfg.rise,cfg.rise-cfg.fall)-.2,yMax=Math.max(cfg.rise,cfg.rise-cfg.fall)+.2,rad=Math.max(cfg.spread,.5);
  geo.boundingBox=new THREE.Box3(new THREE.Vector3(-rad,yMin,-rad),new THREE.Vector3(rad,yMax,rad));
  geo.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,(yMin+yMax)/2,0),Math.hypot(rad,(yMax-yMin)/2));
  const mat=new THREE.ShaderMaterial({
    uniforms:{
      uTime:{value:0},uSize:{value:cfg.size},uLife:{value:cfg.life},uRise:{value:cfg.rise},
      uFall:{value:cfg.fall},uSpread:{value:cfg.spread},uSway:{value:cfg.sway},uGrow:{value:cfg.grow},
      uOpacity:{value:cfg.opacity},uFlicker:{value:cfg.flicker},
      uColorA:{value:new THREE.Color(cfg.colorA)},uColorB:{value:new THREE.Color(cfg.colorB)},
      uTex:{value:null},uUseTex:{value:false}
    },
    vertexShader:PARTICLE_VERT,fragmentShader:PARTICLE_FRAG,
    transparent:true,depthWrite:false,
    blending:cfg.additive?THREE.AdditiveBlending:THREE.NormalBlending
  });
  const points=new THREE.Points(geo,mat);points.frustumCulled=false;points.name=cfg.label+' particles';
  const root=new THREE.Group();root.name=cfg.label;root.add(points);
  return {type:PARTICLE_TYPES[type]?type:'fire',root,points,material:mat,update(t){mat.uniforms.uTime.value=t;},dispose(){geo.dispose();mat.dispose();}};
}
// Swap the soft-dot sprite for any imported image (PNG logos become fire/sparkle shapes).
export function setEmitterTexture(emitter,tex){
  if(!emitter?.material)return;
  emitter.material.uniforms.uTex.value=tex||null;
  emitter.material.uniforms.uUseTex.value=!!tex;
}

// A flat, double-sided panel sized like a billboard: ~2.2 blocks tall, aspect kept,
// bottom edge on the placement point.
export function imagePlaneSize(w,h,{maxH=2.2,maxW=8,minH=.2}={}){
  w=Math.max(1,+w||1);h=Math.max(1,+h||1);
  let height=maxH,width=maxH*(w/h);
  if(width>maxW){width=maxW;height=maxW*(h/w);}
  if(height<minH){height=minH;width=Math.max(minH,minH*(w/h));}
  return {width,height};
}
export function createImageObject(tex,name='Image'){
  const img=tex?.image||{};
  const {width,height}=imagePlaneSize(img.width||img.naturalWidth||64,img.height||img.naturalHeight||64);
  const mesh=new THREE.Mesh(
    new THREE.PlaneGeometry(width,height),
    new THREE.MeshBasicMaterial({map:tex||null,transparent:true,side:THREE.DoubleSide})
  );
  mesh.name=name+' panel';mesh.position.y=height/2;
  const root=new THREE.Group();root.name=name;root.add(mesh);
  return root;
}

// Tiny emoji badges for the FX tab (data-URL SVGs, no assets needed).
const FX_ICONS={fire:'🔥',smoke:'💨',rain:'🌧️',snow:'❄️',sparkle:'✨',png:'🖼️'};
export function fxIcon(kind){
  const c=FX_ICONS[kind]||'✨';
  return 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" rx="8" fill="#202a2d"/><text x="24" y="33" font-size="24" text-anchor="middle">'+c+'</text></svg>');
}
