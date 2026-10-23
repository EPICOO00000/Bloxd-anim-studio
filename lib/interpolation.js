import * as THREE from 'three';

const TAU=Math.PI*2,EPS=1e-10;
const qa=new THREE.Quaternion(),qb=new THREE.Quaternion(),result=new THREE.Quaternion(),euler=new THREE.Euler(0,0,0,'XYZ');
const near=(angle,reference)=>angle+TAU*Math.round((reference-angle)/TAU);
function shortestDelta(angle){let d=((angle+Math.PI)%TAU+TAU)%TAU-Math.PI;return Math.abs(Math.abs(d)-Math.PI)<EPS?Math.PI:d;}

// Orientation endpoints, not a record of the drag gesture. A canonical endpoint
// quaternion convention makes even the exactly-180-degree tie independent of Euler winding.
export function interpolateRotation(a,b,t,mode='shortest',degrees=false){
 if(t<=0)return a.slice();if(t>=1)return b.slice();
 if(mode==='spins')return a.map((n,i)=>THREE.MathUtils.lerp(n,b[i],t));
 if(a.every((n,i)=>Math.abs(n-b[i])<EPS))return a.slice();
 const unit=degrees?Math.PI/180:1,A=a.map(n=>n*unit),B=b.map(n=>n*unit);
 qa.setFromEuler(euler.set(...A,'XYZ'));qb.setFromEuler(euler.set(...B,'XYZ'));
 if(1-Math.abs(qa.dot(qb))<1e-14)return a.slice();
 const canonical=q=>{if(Math.abs(q.w)<EPS){q.w=0;const first=[q.x,q.y,q.z].find(n=>Math.abs(n)>EPS)||1;if(first<0)q.set(-q.x,-q.y,-q.z,0);q.normalize();}else if(q.w<0)q.set(-q.x,-q.y,-q.z,-q.w);};
 canonical(qa);canonical(qb);
 if(Math.abs(qa.dot(qb))<EPS){const u=Math.sin((1-t)*Math.PI/2),v=Math.sin(t*Math.PI/2);result.set(qa.x*u+qb.x*v,qa.y*u+qb.y*v,qa.z*u+qb.z*v,qa.w*u+qb.w*v).normalize();}
 else result.copy(qa).slerp(qb,t).normalize();
 euler.setFromQuaternion(result,'XYZ');
 // Choose the equivalent Euler representation nearest the endpoint reference.
 // This avoids unnecessary inspector flips at a pitch of 90 degrees; it does
 // not change the quaternion path or add any turns to the animation.
 const reference=A.map((n,i)=>n+shortestDelta(B[i]-n)*t),first=[euler.x,euler.y,euler.z].map((n,i)=>near(n,reference[i]));
 const second=[euler.x+Math.PI,Math.PI-euler.y,euler.z+Math.PI].map((n,i)=>near(n,reference[i]));
 const distance=v=>v.reduce((sum,n,i)=>sum+(n-reference[i])**2,0),chosen=distance(second)+EPS<distance(first)?second:first;
 return chosen.map(n=>Math.abs(n)<1e-14?0:n/unit);
}
