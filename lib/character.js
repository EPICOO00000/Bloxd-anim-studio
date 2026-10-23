import * as THREE from 'three';
import { textures, makeTool } from './assets.js';
import { interpolateRotation } from './interpolation.js';
export const JOINTS={body:'Torso',head:'Head',armR:'Right shoulder',forearmR:'Right elbow',armL:'Left shoulder',forearmL:'Left elbow',legR:'Right hip',shinR:'Right knee',legL:'Left hip',shinL:'Left knee'};
export function neutralPose(){ const p={offset:0};for(const k of Object.keys(JOINTS))p[k]=[0,0,0];return p; }
export const copyPose=p=>JSON.parse(JSON.stringify(p));
export function presetPose(name,t=0,animate=false){
  const p=neutralPose();
  p.armL[2]=3;p.armR[2]=-3;
  if(name==='tpose'){p.armL[2]=90;p.armR[2]=-90;}
  if(name==='wave'){
    p.armR=[-155,0,-18];p.forearmR=[-22,0,0];p.head[2]=-6;
    if(animate)p.armR[2]+=Math.sin(t*7)*16;
  }
  if(name==='walk'||name==='run'){
    const s=animate?Math.sin(t*(name==='run'?10:6)):1;
    const amp=name==='run'?55:32;
    p.legL[0]=s*amp;p.legR[0]=-s*amp;p.armL[0]=-s*amp;p.armR[0]=s*amp;
    p.shinL[0]=Math.max(0,-s)*25;p.shinR[0]=Math.max(0,s)*25;
    if(name==='run'){p.body[0]=10;p.forearmL[0]=p.forearmR[0]=-65;p.offset=Math.abs(s)*.07;}
  }
  if(name==='mine'){
    const phase=animate?(Math.sin(t*5)+1)/2:.8;
    p.armR=[-35-phase*105,-8,-8];p.forearmR=[-phase*30,0,0];p.body=[8+phase*8,0,-phase*5];p.head[0]=15;
    p.armL[0]=-20;
  }
  if(name==='jump'){
    p.offset=animate?Math.max(0,Math.sin(t*3))*.7:.55;
    p.armR=[-145,0,-30];p.armL=[-145,0,30];p.legR[0]=-20;p.shinR[0]=45;p.legL[0]=15;
  }
  if(name==='sit'){p.legR[0]=p.legL[0]=-90;p.offset=-.52;p.armR[0]=p.armL[0]=-25;}
  if(name==='idle'&&animate){p.head[1]=Math.sin(t*.6)*6;p.armL[2]-=Math.sin(t*1.6)*2;p.armR[2]+=Math.sin(t*1.6)*2;}
  return p;
}
// Standard 64x64 atlas cuboid layout, with separate UV spans for elbow/knee halves.
function skinGeometry(w,h,d,ox,oy,start=0,partHeight=h){
  const rects=[
    [ox,oy+d+start,d,partHeight],
    [ox+d+w,oy+d+start,d,partHeight],
    [ox+d,oy,w,d],
    [ox+d+w,oy,w,d],
    [ox+d,oy+d+start,w,partHeight],
    [ox+2*d+w,oy+d+start,w,partHeight],
  ];
  const g=new THREE.BoxGeometry(w/16,partHeight/16,d/16), uv=g.attributes.uv;
  for(let face=0;face<6;face++){
    const [x,y,rw,rh]=rects[face];
    for(let v=0;v<4;v++){
      const i=face*4+v,u=uv.getX(i),vv=uv.getY(i);
      uv.setXY(i,(x+u*rw)/64,1-(y+(1-vv)*rh)/64);
    }
  }
  uv.needsUpdate=true;return g;
}
export function createCharacter(name='Bob',skin=textures.bob){
  const root=new THREE.Group();root.name=name;
  const motion=new THREE.Group();motion.name='Motion';root.add(motion);
  const hips=new THREE.Group();hips.position.y=.75;hips.name='Hips';motion.add(hips);
  const mat=new THREE.MeshStandardMaterial({map:skin,roughness:1,alphaTest:.5});
  const joints={};
  function joint(id,parent,pos){const j=new THREE.Group();j.name=JOINTS[id];j.position.set(...pos);parent.add(j);joints[id]=j;return j;}
  function mesh(id,parent,geo,y){
    const m=new THREE.Mesh(geo,mat);m.position.y=y;m.name=id+' mesh';m.userData.part=id;
    m.castShadow=m.receiveShadow=true;parent.add(m);return m;
  }
  const body=joint('body',hips,[0,0,0]);mesh('body',body,skinGeometry(8,12,4,16,16),.375);
  const head=joint('head',body,[0,.75,0]);mesh('head',head,skinGeometry(8,8,8,0,0),.25);
  for(const [side,x,ax,ay,lx,ly] of [['R',-.375,40,16,0,16],['L',.375,32,48,16,48]]){
    const arm=joint('arm'+side,body,[x,.75,0]);
    mesh('arm'+side,arm,skinGeometry(4,12,4,ax,ay,0,6),-.1875);
    const fore=joint('forearm'+side,arm,[0,-.375,0]);
    mesh('forearm'+side,fore,skinGeometry(4,12,4,ax,ay,6,6),-.1875);
    const leg=joint('leg'+side,hips,[Math.sign(x)*.125,0,0]);
    mesh('leg'+side,leg,skinGeometry(4,12,4,lx,ly,0,6),-.1875);
    const shin=joint('shin'+side,leg,[0,-.375,0]);
    mesh('shin'+side,shin,skinGeometry(4,12,4,lx,ly,6,6),-.1875);
  }
  const mount=new THREE.Group();mount.name='Right hand item';mount.position.set(0,-.29,.075);joints.forearmR.add(mount);
  const markers=new THREE.Group();root.add(markers);markers.name='Joint overlay';markers.visible=false;
  const markerMat=new THREE.MeshBasicMaterial({color:0xd7fb90,depthTest:false,transparent:true,opacity:.9});
  const markerGeo=new THREE.SphereGeometry(.04,8,6);
  for(const id of Object.keys(JOINTS)){
    const dot=new THREE.Mesh(markerGeo,markerMat);dot.renderOrder=1000;dot.userData.joint=id;markers.add(dot);
  }
  const c={root,motion,hips,joints,mount,markers,material:mat,pose:neutralPose(),displayPose:neutralPose(),keys:[],tool:'none',preset:'idle',live:false,manual:true,speed:1};
  applyPose(c,presetPose('idle'));
  return c;
}
export function applyPose(c,p){
  c.displayPose=copyPose(p);c.motion.position.y=p.offset||0;
  for(const id of Object.keys(JOINTS)){
    const a=p[id]||[0,0,0];c.joints[id].rotation.set(...a.map(THREE.MathUtils.degToRad));
  }
  if(c.markers.visible){
    c.root.updateMatrixWorld(true);
    const inv=new THREE.Matrix4().copy(c.root.matrixWorld).invert();
    c.markers.children.forEach(m=>{c.joints[m.userData.joint].getWorldPosition(m.position);m.position.applyMatrix4(inv);});
  }
}
export function equip(c,name){
  c.mount.clear();c.tool=name||'none';if(c.tool==='none')return;
  const item=makeTool(c.tool,.85,true);item.rotation.set(0,-.18,1.35);c.mount.add(item);
  c.heldTransform={position:item.position.toArray(),rotation:[item.rotation.x,item.rotation.y,item.rotation.z],scale:item.scale.toArray()};
}
export function blendPose(a,b,f,rotationMode='shortest'){
  const p=neutralPose();p.offset=THREE.MathUtils.lerp(a.offset||0,b.offset||0,f);
  for(const k of Object.keys(JOINTS))p[k]=interpolateRotation(a[k]||[0,0,0],b[k]||[0,0,0],f,rotationMode,true);
  return p;
}
