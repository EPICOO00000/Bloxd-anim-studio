// Wearable armor sets for the character rig: helmet, chestplate, leggings and boots,
// built as slightly oversized plates parented to the pose joints, so armor follows
// every animation, key and mirror for free. Pure scene-graph math — no rendering.
import * as THREE from 'three';

export const ARMOR_SETS={
  leather:{label:'Leather',color:0x9c6b3f,metalness:.05,roughness:.85},
  iron:{label:'Iron',color:0xd9d9d9,metalness:.75,roughness:.35},
  gold:{label:'Gold',color:0xf5c542,metalness:.9,roughness:.22},
  diamond:{label:'Diamond',color:0x5ee6d8,metalness:.25,roughness:.12},
  netherite:{label:'Netherite',color:0x4a4148,metalness:.55,roughness:.6}
};
export const ARMOR_SLOTS=['helmet','chestplate','leggings','boots'];
// Pieces per slot: [joint, w, h, d (sixteenths), x, y, z (world units)].
// Sizes hug each body part (head 8³, torso 8×12×4, limbs 4×12×4 in sixteenths)
// with a small clearance so plates never z-fight the skin.
const PIECES={
  helmet:[['head',9.6,9.6,9.6,0,.25,0]],
  chestplate:[['body',9.4,13,5.4,0,.375,0],['armR',5.2,7,5.2,0,-.17,0],['armL',5.2,7,5.2,0,-.17,0]],
  leggings:[['body',9,4.6,5,0,.14,0],['legR',5,7,5,0,-.17,0],['legL',5,7,5,0,-.17,0]],
  boots:[['shinR',5.3,7.4,5.9,0,-.17,.09],['shinL',5.3,7.4,5.9,0,-.17,.09]]
};
// Normalizes loose input ({helmet:'iron'}) into a full spec with every slot present.
export function armorSpec(input){
  const out={};
  for(const s of ARMOR_SLOTS){const v=input&&typeof input==='object'?input[s]:null;out[s]=typeof v==='string'&&ARMOR_SETS[v]?v:null;}
  return out;
}
export function armorWorn(c){return armorSpec(c?.armor);}
function dropArmor(c){
  for(const g of c.armorRoots||[]){
    g.parent?.remove(g);
    g.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
  }
  c.armorRoots=[];
}
// Dresses (or undresses) a character. spec slots may be null; returns the normalized spec.
export function wearArmor(c,spec){
  if(!c?.joints)return armorSpec(null);
  dropArmor(c);
  spec=armorSpec(spec);
  const worn=ARMOR_SLOTS.some(s=>spec[s]);
  c.armor=worn?spec:null;
  for(const slot of ARMOR_SLOTS){
    const setId=spec[slot];if(!setId)continue;
    const set=ARMOR_SETS[setId];
    const mat=new THREE.MeshStandardMaterial({color:set.color,metalness:set.metalness,roughness:set.roughness});
    for(const[joint,w,h,d,x,y,z]of PIECES[slot]){
      const g=new THREE.Group();g.name=setId+' '+slot;g.userData.armorSlot=slot;g.userData.armorSet=setId;
      const m=new THREE.Mesh(new THREE.BoxGeometry(w/16,h/16,d/16),mat);
      m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);
      const j=c.joints[joint];if(j){j.add(g);c.armorRoots.push(g);}
    }
  }
  return spec;
}
