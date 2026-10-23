import * as THREE from 'three';
import { blendPose } from './character.js';
import { interpolateRotation } from './interpolation.js';
const V=a=>new THREE.Vector3().fromArray(a);
export const KEY_EPS=.001;
export function putKey(keys,key){const i=keys.findIndex(k=>Math.abs(k.time-key.time)<=KEY_EPS);if(i>=0)keys[i]=key;else keys.push(key);keys.sort((a,b)=>a.time-b.time);}
export function keyInterval(keys,time){
  if(!keys.length)return null;
  if(keys.length===1||time<=keys[0].time)return[keys[0],keys[0],0,0];
  if(time>=keys.at(-1).time)return[keys.at(-1),keys.at(-1),0,keys.length-1];
  for(let i=0;i<keys.length-1;i++)if(time>=keys[i].time&&time<=keys[i+1].time)return[keys[i],keys[i+1],(keys[i+1].time-keys[i].time)>1e-9?(time-keys[i].time)/(keys[i+1].time-keys[i].time):1,i];
}
export function blendTransform(a,b,e,rotationMode='shortest'){
  return{position:a.position.map((n,i)=>THREE.MathUtils.lerp(n,b.position[i],e)),rotation:interpolateRotation(a.rotation,b.rotation,e,rotationMode),scale:a.scale.map((n,i)=>THREE.MathUtils.lerp(n,b.scale[i],e))};
}
export function sampleTransform(keys,time,rotationMode='shortest'){
  const int=keyInterval(keys,time);if(!int)return null;const[a,b,f]=int;return blendTransform(a,b,f*f*(3-2*f),rotationMode);
}
export function samplePose(keys,time,rotationMode='shortest'){
  const int=keyInterval(keys,time);if(!int)return null;
  const[a,b,f]=int,e=f*f*(3-2*f),result={pose:blendPose(a.pose,b.pose,e,rotationMode),...blendTransform(a,b,e,rotationMode)};
  if(a.held||b.held)result.held=blendTransform(a.held||b.held,b.held||a.held,e,rotationMode);
  return result;
}
export class CameraTrack{
  constructor(){this.keys=[];this.smooth=true;this.curve=null;this.lengths=[];}
  rebuild(){
    this.keys.sort((a,b)=>a.time-b.time);this.lengths=[];this.curve=null;
    if(this.keys.length<2)return;
    this.curve=new THREE.CatmullRomCurve3(this.keys.map(k=>V(k.position)),false,'centripetal');
    // Arc-length lookup per segment: each key still lands at its exact time.
    for(let s=0;s<this.keys.length-1;s++){
      const lens=[0];let prev=this.curve.getPoint(s/(this.keys.length-1));
      for(let j=1;j<=40;j++){const p=this.curve.getPoint((s+j/40)/(this.keys.length-1));lens.push(lens.at(-1)+p.distanceTo(prev));prev=p;}
      this.lengths.push(lens);
    }
  }
  sample(time){
    const int=keyInterval(this.keys,time);if(!int)return null;
    const[a,b,f,i]=int;let position;
    if(a===b)position=V(a.position);
    else if(!this.smooth||!this.curve)position=V(a.position).lerp(V(b.position),f);
    else{
      const lens=this.lengths[i],wanted=f*lens.at(-1);let j=1;
      while(j<40&&lens[j]<wanted)j++;
      const local=(j-1+(wanted-lens[j-1])/(lens[j]-lens[j-1]||1))/40;
      position=this.curve.getPoint((i+local)/(this.keys.length-1));
    }
    return{position,target:V(a.target).lerp(V(b.target),f),fov:THREE.MathUtils.lerp(a.fov,b.fov,f)};
  }
}
