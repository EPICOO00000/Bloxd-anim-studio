// Smoke tests for wearable armor: spec normalization, joint parenting, plate
// clearance, set swapping with cleanup, and posing with armor on.
import assert from 'node:assert/strict';
import { createCharacter, applyPose, presetPose } from '../lib/character.js';
import { wearArmor, armorSpec, armorWorn, ARMOR_SETS, ARMOR_SLOTS } from '../lib/armor.js';

let n=0;const ok=(c,m)=>{assert.ok(c,m);n++;};

ok(Object.keys(ARMOR_SETS).length===5,'five armor materials (leather/iron/gold/diamond/netherite)');
ok(ARMOR_SLOTS.length===4,'four armor slots');
ok(JSON.stringify(armorSpec({helmet:'iron',bogus:'x'}))===JSON.stringify({helmet:'iron',chestplate:null,leggings:null,boots:null}),'spec normalizes and drops junk');
ok(JSON.stringify(armorSpec(null))===JSON.stringify({helmet:null,chestplate:null,leggings:null,boots:null}),'null spec is all-empty');

const c=createCharacter('Test Bob');
ok(c.armor===undefined||c.armor===null,'fresh character wears nothing');
const spec=wearArmor(c,{helmet:'diamond',chestplate:'iron',leggings:'iron',boots:'gold'});
ok(spec.helmet==='diamond'&&spec.boots==='gold','wearArmor returns the normalized spec');
ok(c.armor&&c.armor.chestplate==='iron','character records its armor');
ok(c.armorRoots.length===9,'all nine plates attach (1 helmet + 3 chest + 3 legs + 2 boots)');
const byJoint=j=>c.armorRoots.filter(g=>g.parent===c.joints[j]).length;
ok(byJoint('head')===1,'helmet on the head joint');
ok(byJoint('body')===2,'chest plate + belt on the torso joint');
ok(byJoint('armR')===1&&byJoint('armL')===1,'shoulder sleeves on both arms');
ok(byJoint('legR')===1&&byJoint('legL')===1,'leg plates on both hips');
ok(byJoint('shinR')===1&&byJoint('shinL')===1,'boots on both shins');
const helmet=c.armorRoots.find(g=>g.userData.armorSlot==='helmet').children[0];
ok(helmet.geometry.parameters.width>.5&&helmet.geometry.parameters.width<.75,'helmet clears the 8/16 head box ('+helmet.geometry.parameters.width+')');
ok(helmet.material.metalness===ARMOR_SETS.diamond.metalness&&helmet.material.color.getHex()===ARMOR_SETS.diamond.color,'plate material matches the chosen set');
ok(helmet.castShadow&&helmet.receiveShadow,'armor casts and receives shadows');

// Swapping sets strips the old plates completely.
wearArmor(c,{helmet:'leather'});
ok(c.armorRoots.length===1&&c.armor.helmet==='leather'&&c.armor.chestplate===null,'changing armor strips the old plates');
ok(c.armorRoots.filter(g=>g.parent!==c.joints.head).length===0,'no stale plates on other joints');
// Clearing takes everything off.
wearArmor(c,null);
ok(!c.armor&&c.armorRoots.length===0,'null spec takes everything off');
ok(armorWorn(c).helmet===null,'armorWorn on a bare character is all-null');
// Invalid input is sanitized, not thrown.
const bad=wearArmor(c,{helmet:'unobtainium',boots:42});
ok(!c.armor&&c.armorRoots.length===0&&bad.helmet===null,'invalid set names are ignored');

// Posing still works with a full set on (armor follows the joints).
wearArmor(c,{helmet:'netherite',chestplate:'netherite',leggings:'netherite',boots:'netherite'});
applyPose(c,presetPose('tpose'));
ok(Math.abs(c.joints.armL.rotation.z-Math.PI/2)<1e-6,'armor does not block posing');
ok(c.armorRoots.length===9,'full set still worn after posing');

console.log('armor smoke OK · '+n+' assertions passed');
