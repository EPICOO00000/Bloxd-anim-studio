import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { TransformControls } from './vendor/controls/TransformControls.js';
import { GLTFExporter } from './vendor/exporters/GLTFExporter.js';
import { loadAssets, blockDefs, assetData, textures, toolNames, toolIcon, textureURL, makeTool, makeLamp, makeBlock, pixelTexture, toolTextureName, setToolLighting, decode64, catalog, itemDefs, blockIcon, fallbackIcon, renderAssetThumbnail, resolveBlock, baseTexture, updateAssetAnimations, getBlockPrototype } from './lib/assets.js';
import { VoxelWorld, createTree, createRock } from './lib/world.js';
import { JOINTS, createCharacter, copyPose, neutralPose, presetPose, applyPose, equip } from './lib/character.js';
import { CameraTrack, samplePose, sampleTransform, putKey, KEY_EPS } from './lib/tracks.js';
import { bakeClip, bakeWalkPath, mirrorPose, CLIP_DEFAULTS } from './lib/anim-clips.js';
import { interpolateRotation } from './lib/interpolation.js';
import { parseModel, voxelise } from './lib/importers.js';
import { setWaterTime, updateWaterEnv } from './lib/water.js';
import { readSchematicFile } from './lib/schematics.js';
import { isBloxdschem } from './lib/bloxdschem.js';
import { loadPrefabs, prefabAssets, prefabCells } from './lib/prefabs.js';
import { apply as applyBrush, topAt, BRUSH_TOOLS, BRUSH_LABELS } from './lib/terrain-brush.js';
import { chooseVideoConfig, renderVideoFrames, renderRealtimeVideo } from './lib/video-export.js';
import { Soundtrack } from './lib/audio.js';
import { plainState, stageEdit, mergeEdit, keyFromState, stateFromKey, validateDraft } from './lib/key-edit.js';
import { initGeminiPanel } from './lib/ai-panel.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const clone=v=>JSON.parse(JSON.stringify(v));
const deg=THREE.MathUtils.degToRad, rad=THREE.MathUtils.radToDeg, clamp=THREE.MathUtils.clamp;
const icon=(name)=>`<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const PANEL_CLASS={library:'panel-library',inspector:'panel-inspector',timeline:'panel-timeline'};
let toastTimer;
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3400);}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.hidden=true;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function safeName(name){return String(name).replace(/[^\w .-]/g,'_').slice(0,64)||'scene';}
function readDataURL(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});}
function transformOf(root){return{position:root.position.toArray(),rotation:[root.rotation.x,root.rotation.y,root.rotation.z],scale:root.scale.toArray()};}
function setTransform(root,t){root.position.fromArray(t.position);root.rotation.set(...t.rotation);root.scale.fromArray(t.scale);root.updateMatrixWorld(true);}

async function main(){
  await loadAssets(p=>{$('#load-progress').style.width=(p*100)+'%';});
  loadPrefabs();
  $('#load-message').textContent='Arranging the maple clearing…';
  const viewport=$('#viewport'),canvas=$('#scene');
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.13;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.1,4000);
  const orbit=new OrbitControls(camera,canvas);orbit.enableDamping=true;orbit.dampingFactor=.09;orbit.minDistance=1.2;orbit.maxDistance=600;orbit.maxPolarAngle=Math.PI*.495;
  camera.position.set(15,12,19);orbit.target.set(0,1.5,0);orbit.update();
  const sun=new THREE.DirectionalLight(0xffe6b9,3.1);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.normalBias=.025;sun.shadow.bias=-.00008;
  Object.assign(sun.shadow.camera,{left:-70,right:70,top:70,bottom:-70,near:.5,far:300});sun.shadow.camera.updateProjectionMatrix();
  const hemi=new THREE.HemisphereLight(0xe8f4f5,0x84917c,1.5);scene.add(sun,sun.target,hemi);
  const light={az:-38,el:42,power:3.1,fill:1.5,color:'#ffe6b9',sky:'#c5d6d3',shadows:true,soft:true,fog:true,toolLit:false,preset:'golden'};
  const LIGHTS={
    golden:{az:-38,el:42,power:3.1,fill:1.5,color:'#ffe6b9',sky:'#c5d6d3'},
    day:{az:25,el:65,power:3.1,fill:1.7,color:'#fffaf0',sky:'#c2dce8'},
    night:{az:-65,el:38,power:.95,fill:.38,color:'#9bbaff',sky:'#263947'},
    studio:{az:-25,el:52,power:2.8,fill:1.85,color:'#ffffff',sky:'#d1d4cb'},
  };
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(350,350),new THREE.MeshStandardMaterial({color:0xabb9a9,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-3.04;floor.receiveShadow=true;scene.add(floor);
  const world=new VoxelWorld().generate();scene.add(world.group);
  const objectGroup=new THREE.Group();objectGroup.name='Scene objects';scene.add(objectGroup);
  const helpers=new THREE.Group();helpers.name='Editor guides';scene.add(helpers);
  const grid=new THREE.GridHelper(60,60,0x829d83,0xaabdae);grid.position.y=-3.015;grid.material.transparent=true;grid.material.opacity=.4;grid.visible=false;helpers.add(grid);
  const ring=new THREE.Mesh(new THREE.RingGeometry(.67,.685,48),new THREE.MeshBasicMaterial({color:0xe0f7a3,transparent:true,opacity:.75,depthWrite:false,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;helpers.add(ring);
  const selectionBox=new THREE.BoxHelper(new THREE.Object3D(),0xd4ef9a);selectionBox.material.transparent=true;selectionBox.material.opacity=.45;selectionBox.visible=false;helpers.add(selectionBox);
  const sunGuide=new THREE.DirectionalLightHelper(sun,1.1,0xffdd7f);sunGuide.visible=false;helpers.add(sunGuide);
  let pathLine=null;
  const gizmo=new TransformControls(camera,canvas);gizmo.setSize(.85);helpers.add(gizmo);
  const objects=[];let selected=null,serial=0,frames=0;
  const state={mode:'select',scope:'root',joint:'head',toolAction:'place',category:'blocks',block:'grass',inspector:'object',selectedKey:null,clean:false,libraryPage:0,libraryGroup:'',libraryAdvanced:false,pathMode:false,autoKey:false,onion:true};
  const timeline={time:0,duration:8,playing:false,loop:false,cameraEnabled:true};
  const camTrack=new CameraTrack(),soundtrack=new Soundtrack();
  let viewOverride=false,importBusy=false,recording=null,skinThumb='',playbackLast=performance.now(),sceneName='Maple clearing';
  const history=[],future=[];

  function pushHistory(label,undo,redo){const entry={label,undo,redo};history.push(entry);if(history.length>60)history.shift();future.length=0;historyUI();return entry;}
  function historyUI(){$('#undo').disabled=!history.length;$('#redo').disabled=!future.length;}
  function undo(){const a=history.pop();if(!a)return;setPlaying(false);a.undo();future.push(a);refreshAll();toast('Undid '+a.label);}
  function redo(){const a=future.pop();if(!a)return;setPlaying(false);a.redo();history.push(a);refreshAll();toast('Redid '+a.label);}
  function heldOf(c){const item=c?.mount.children[0];return item?transformOf(item):null;}
  function setHeld(c,t){const item=c?.mount.children[0];if(item&&t){setTransform(item,t);c.heldTransform=clone(t);}}
  function poseState(r){return{transform:transformOf(r.root),pose:r.character?copyPose(r.character.displayPose):null,held:heldOf(r.character)};}
  function actorSnapshot(r){return{...poseState(r),draft:r.draft?clone(r.draft):null};}
  function applyActorState(r,s){setTransform(r.root,s.transform);if(r.character){r.character.pose=copyPose(s.pose);applyPose(r.character,s.pose);setHeld(r.character,s.held);}}
  function restoreActor(r,s){applyActorState(r,s);r.draft=s.draft?clone(s.draft):null;if(r.draft&&r===selected)r.draft.time=timeline.time;if(r.character){r.character.manual=true;r.character.live=false;}refreshInspector();}
  function keysOf(r){return r.character?r.character.keys:r.keys;}
  function sampledState(r,time){
    const key=r.character?samplePose(keysOf(r),time,r.rotationMode):sampleTransform(keysOf(r),time,r.rotationMode);
    if(key){const result=stateFromKey(key,!!r.character);if(r.character&&!result.held)result.held=heldOf(r.character);return result;}
    return r.draft?plainState(r.draft.original):poseState(r);
  }
  function finishInputEdit(){const el=document.activeElement;if(el?.dataset?.actorInput==='true')el.blur();}
  function stageActorEdit(r,before){r.draft=stageEdit(plainState(before),poseState(r),before.draft||null,timeline.time);updateKeyUI();}
  function trackSnapshot(r){return{keys:clone(keysOf(r)),actor:actorSnapshot(r)};}
  function restoreTrack(r,s){if(r.character)r.character.keys=clone(s.keys);else r.keys=clone(s.keys);restoreActor(r,s.actor);refreshTimeline();}
  function applyObjectKey(r,time=timeline.time){
    const before=trackSnapshot(r),keys=keysOf(r),draft=r.draft;
    const value=draft?mergeEdit(sampledState(r,time),draft):poseState(r);
    const addedStart=time>KEY_EPS&&!keys.some(k=>k.time<=KEY_EPS);
    if(addedStart){const first=keys.slice().sort((a,b)=>a.time-b.time)[0],start=first?stateFromKey(first,!!r.character):(draft?.original||value);putKey(keys,keyFromState(start,0,!!r.character));}
    putKey(keys,keyFromState(value,time,!!r.character));r.draft=null;
    applyActorState(r,sampledState(r,timeline.time));const after=trackSnapshot(r);
    pushHistory(r.character?'apply pose key':'apply transform key',()=>restoreTrack(r,before),()=>restoreTrack(r,after));
    return addedStart;
  }
  function applyPendingEdits(){
    finishInputEdit();let count=0;for(const r of objects)if(r.draft){applyObjectKey(r,clamp(r.draft.time,0,60));count++;}
    if(count){refreshTimeline();refreshInspector();}return count;
  }
  function clearObjectKeys(r){
    if(!r)return;finishInputEdit();const before=trackSnapshot(r);if(r.character)r.character.keys=[];else r.keys=[];r.draft=null;
    const after=trackSnapshot(r);pushHistory('clear animation keys',()=>restoreTrack(r,before),()=>restoreTrack(r,after));refreshTimeline();refreshInspector();toast('Animation keys cleared. Your current pose is kept.');
  }
  function revertEdit(){
    const r=selected;if(!r?.draft)return;finishInputEdit();const before=actorSnapshot(r),base=sampledState(r,timeline.time);r.draft=null;applyActorState(r,base);const after=actorSnapshot(r);
    pushHistory('revert unapplied edit',()=>restoreActor(r,before),()=>restoreActor(r,after));refreshInspector();updateKeyUI();
  }
  function updateKeyUI(){
    const r=selected,draft=r?.draft;$('#pending-edit').hidden=!draft;
    if(draft)$('#pending-edit-label').textContent='Edit ready · apply at '+timeline.time.toFixed(2)+' s';
    $('#key-pose').classList.toggle('pending-key',!!draft);
    $('#key-pose').title=r?'Apply '+(r.character?'pose':'transform')+' to '+r.name+' at '+timeline.time.toFixed(2)+' s':'Select a player or object';
    $('#keyframe-hint').textContent=draft?'Edit kept while choosing a time. Apply the key, then use From start to preview.':r&&!keysOf(r).length?'First key at a later time? The original starting pose is added at 0 s automatically.':'Choose a time → edit → Apply pose / transform. From start previews the full animation.';
  }
  function selectedTarget(){if(!selected)return null;const c=selected.character;if(c&&state.scope==='part')return c.joints[state.joint];if(c&&state.scope==='held')return c.mount.children[0]||selected.root;return selected.root;}
  function targetLabel(){if(!selected)return 'Nothing selected';if(selected.character){if(state.scope==='part')return JOINTS[state.joint];if(state.scope==='held')return selected.character.tool;return 'Whole player';}return selected.name;}
  function setScope(scope,joint=state.joint){
    if(!selected?.character)scope='root';
    if(scope==='held'&&!selected.character.mount.children.length){toast('Equip a tool before selecting the held item.');scope='root';}
    state.scope=scope;state.joint=JOINTS[joint]?joint:'head';$('#joint-select').value=state.joint;
    setMode(state.mode);refreshInspector();
  }
  function syncTargetToActor(){
    const c=selected?.character;if(!c)return;
    if(state.scope==='part'){c.pose[state.joint]=['x','y','z'].map(a=>rad(c.joints[state.joint].rotation[a]));c.preset='custom';applyPose(c,c.pose);}
    else if(state.scope==='held')c.heldTransform=heldOf(c);
  }
  function equipTool(r,name){
    if(!r?.character)return;const c=r.character,old=c.tool,before=heldOf(c);prepEdit(r);equip(c,name);const after=heldOf(c);
    const restore=(tool,held)=>{equip(c,tool);setHeld(c,held);if(selected===r){if(tool==='none'&&state.scope==='held')state.scope='root';setMode(state.mode);refreshInspector();}};
    pushHistory('equip '+name,()=>restore(old,before),()=>restore(name,after));if(name==='none'&&state.scope==='held')state.scope='root';setMode(state.mode);refreshInspector();
  }

  function recordActorChange(r,before,label){
    if(JSON.stringify(plainState(before))===JSON.stringify(poseState(r)))return;
    // Auto-key: commit the edit straight onto the track at the playhead — animate by performing.
    if(state.autoKey&&r){r.draft=null;applyObjectKey(r,timeline.time);refreshTimeline();return;}
    stageActorEdit(r,before);const after=actorSnapshot(r);pushHistory(label,()=>restoreActor(r,before),()=>restoreActor(r,after));
  }
  function prepEdit(r=selected){if(!r)return;setPlaying(false);viewOverride=true;if(r.character){r.character.pose=copyPose(r.character.displayPose);r.character.manual=true;r.character.live=false;$('#live-motion').checked=false;}}

  function register(root,type,name,extra={}){
    const rec={id:'object-'+(++serial),type,name,root,keys:[],draft:null,rotationMode:'shortest',...extra};root.name=name;root.userData.studioId=rec.id;
    objectGroup.add(root);objects.push(rec);return rec;
  }
  function attachRecord(r){if(!objects.includes(r))objects.push(r);objectGroup.add(r.root);selectObject(r);}
  function detachRecord(r){objectGroup.remove(r.root);const idx=objects.indexOf(r);if(idx>=0)objects.splice(idx,1);if(selected===r)selectObject(objects.find(o=>o.character)||objects[0]||null);else refreshAll();}
  function added(r){selectObject(r);showInspector('object');pushHistory('add '+r.name,()=>detachRecord(r),()=>attachRecord(r));toast(r.name+' added');}
  function spawnPosition(){const x=clamp(Math.round(orbit.target.x)+2,-7,7),z=clamp(Math.round(orbit.target.z)+2,-5,5);return new THREE.Vector3(x,world.heightAt(x,z),z);}
  function addBob(position,name='Bob'){
    const character=createCharacter(name);const r=register(character.root,'character',name,{character});character.root.position.copy(position);equip(character,'Diamond Pickaxe');return r;
  }
  function addProp(type,position,options={}){
    if(type==='block')options={...options,block:resolveBlock(options.block||'grass')||options.block};
    let root;
    if(type==='tree')root=createTree(!!options.autumn);
    if(type==='rock')root=createRock();
    if(type==='lamp')root=makeLamp();
    if(type==='tool')root=makeTool(options.asset,1.2);
    if(type==='block')root=makeBlock(options.block||'grass');
    if(!root)throw new Error('Unknown prop type: '+type);
    const r=register(root,type,options.name||root.name,{options});root.position.copy(position);if(type==='tool')root.position.y+=.65;return r;
  }
  const bob=addBob(new THREE.Vector3(1,1,1),'Bob');bob.root.rotation.y=.2;
  const tree1=addProp('tree',new THREE.Vector3(-4,1,-4));tree1.root.scale.setScalar(.88);
  const tree2=addProp('tree',new THREE.Vector3(4,2,-4),{name:'Maple tree 02'});tree2.root.scale.setScalar(.82);
  const tree3=addProp('tree',new THREE.Vector3(-7,1,-.5),{autumn:true});tree3.root.scale.setScalar(.62);
  addProp('lamp',new THREE.Vector3(3.2,1,2.6));
  for(const[x,z,name]of[[4.8,.9,'Diamond Sword'],[5.4,-.5,'Diamond Axe']]){
    const stand=addProp('block',new THREE.Vector3(x,1.375,z),{block:'log',name:name+' stand'});stand.root.scale.setScalar(.75);
    addProp('tool',new THREE.Vector3(x,1.75,z),{asset:name});
  }
  function makePoseKey(r,time,pose){return{time,pose:copyPose(pose||r.character.displayPose),held:heldOf(r.character),...transformOf(r.root)};}
  bob.character.keys=[
    makePoseKey(bob,0,presetPose('idle')),
    makePoseKey(bob,1.7,presetPose('wave')),
    makePoseKey(bob,3.2,presetPose('idle')),
    makePoseKey(bob,4.3,presetPose('mine')),
    makePoseKey(bob,4.7,{...presetPose('mine'),armR:[-28,0,-8],forearmR:[-10,0,0]}),
    makePoseKey(bob,5.5,presetPose('mine')),
    makePoseKey(bob,6,{...presetPose('mine'),armR:[-28,0,-8],forearmR:[-10,0,0]}),
    makePoseKey(bob,8,presetPose('idle')),
  ];
  function tour(name){
    const d=timeline.duration,c=selected?.character?selected:objects.find(o=>o.character),p=c?.root.position||new THREE.Vector3(0,1,0),target=[p.x,p.y+1.1,p.z];
    let keys;
    if(name==='orbit'){
      keys=Array.from({length:9},(_,i)=>{const a=Math.PI*.25+i*Math.PI/4;return{time:i*d/8,position:[Math.sin(a)*16,9,Math.cos(a)*16],target:[0,2,0],fov:48};});
    }else if(name==='close'){
      keys=[{time:0,position:[p.x+4,p.y+3.3,p.z+6],target,fov:42},{time:d/2,position:[p.x+.5,p.y+2.2,p.z+4.5],target,fov:40},{time:d,position:[p.x-3,p.y+2.8,p.z+5.5],target,fov:44}];
    }else{
      keys=[{time:0,position:[15,12,19],target:[0,1.5,0],fov:45},{time:d/2,position:[7,6,13],target:[0,2,0],fov:45},{time:d,position:[-6,5.5,13],target:[0,2,0],fov:46}];
    }
    camTrack.keys=keys;camTrack.rebuild();updatePath();refreshTimeline();refreshCameraKeys();
  }
  tour('dolly');

  function updateLight(){
    const az=deg(light.az),el=deg(light.el),distance=36;
    sun.position.set(Math.sin(az)*Math.cos(el)*distance,Math.sin(el)*distance,Math.cos(az)*Math.cos(el)*distance);
    sun.target.position.set(0,1,0);sun.target.updateMatrixWorld();sun.color.set(light.color);sun.intensity=light.power;hemi.intensity=light.fill;
    scene.background=new THREE.Color(light.sky);floor.material.color.set(light.sky).multiplyScalar(.88);
    scene.fog=light.fog?new THREE.Fog(light.sky,160,1400):null;viewport.classList.toggle('night-scene',light.fill<.6);
    updateWaterEnv({sunDir:sun.position,sky:light.sky,fog:scene.fog?{color:light.sky,near:scene.fog.near,far:scene.fog.far}:null});
    if(renderer.shadowMap.enabled!==light.shadows||renderer.shadowMap.type!==(light.soft?THREE.PCFSoftShadowMap:THREE.PCFShadowMap)){
      renderer.shadowMap.enabled=light.shadows;renderer.shadowMap.type=light.soft?THREE.PCFSoftShadowMap:THREE.PCFShadowMap;
      scene.traverse(o=>{if(o.material)for(const m of (Array.isArray(o.material)?o.material:[o.material]))m.needsUpdate=true;});
    }
    sun.castShadow=light.shadows;sunGuide.update();setToolLighting(light.toolLit,scene);
    $('#sun-handle').style.left=((light.az+180)/360*100)+'%';$('#sun-handle').style.top=((90-light.el)/85*78+6)+'%';
  }
  function syncLightUI(){
    for(const[id,key,fmt]of [['sun-az','az',v=>Math.round(v)+'°'],['sun-el','el',v=>Math.round(v)+'°'],['sun-power','power',v=>v.toFixed(1)],['fill-power','fill',v=>v.toFixed(1)]]){
      $('#'+id).value=light[key];$('#'+id+'-value').textContent=fmt(light[key]);
    }
    $('#tool-shading').checked=light.toolLit;$('#sun-color').value=light.color;$('#sky-color').value=light.sky;$('#shadows').checked=light.shadows;$('#soft-shadow').checked=light.soft;$('#show-fog').checked=light.fog;
    $$('[data-light]').forEach(b=>b.classList.toggle('active',b.dataset.light===light.preset));
  }
  function updatePath(){
    if(pathLine){helpers.remove(pathLine);pathLine.geometry.dispose();pathLine.material.dispose();pathLine=null;}
    if(camTrack.keys.length<2)return;
    const points=[];for(let i=0;i<=120;i++){const smp=camTrack.sample(i/120*timeline.duration);if(smp)points.push(smp.position);}
    pathLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineDashedMaterial({color:0x52a7bc,dashSize:.25,gapSize:.12,transparent:true,opacity:.8}));pathLine.computeLineDistances();pathLine.visible=$('#show-path').checked;helpers.add(pathLine);
  }
  function setCamera(sample){if(!sample)return;camera.position.copy(sample.position);orbit.target.copy(sample.target);camera.fov=sample.fov;camera.updateProjectionMatrix();camera.lookAt(sample.target);}
  function applyAtTime(t,includeCamera=true,includeDrafts=false){
    updateAssetAnimations(t);
    for(const r of objects){
      const c=r.character;if(!c){const s=sampleTransform(r.keys||[],t,r.rotationMode);if(s)setTransform(r.root,s);if(includeDrafts&&r.draft)applyActorState(r,mergeEdit(sampledState(r,t),r.draft));continue;}
      const s=samplePose(c.keys,t,r.rotationMode);
      if(s){setTransform(r.root,s);c.pose=copyPose(s.pose);applyPose(c,s.pose);setHeld(c,s.held);}
      else if(c.live)applyPose(c,presetPose(c.preset,t*c.speed,true));
      if(includeDrafts&&r.draft)applyActorState(r,mergeEdit(sampledState(r,t),r.draft));
    }
    if(includeCamera&&timeline.cameraEnabled&&!viewOverride)setCamera(camTrack.sample(t));
  }
  function setPlaying(play){
    if(!play)soundtrack.stopPreview();if(play===timeline.playing)return;if(play)applyPendingEdits();
    if(play&&timeline.time>=timeline.duration-.001)timeline.time=0;
    timeline.playing=play;orbit.enabled=!play;gizmo.enabled=!play;
    if(play){playbackLast=performance.now();viewOverride=false;objects.forEach(r=>{if(r.character)r.character.manual=false;});applyAtTime(timeline.time);}
    else objects.forEach(r=>{if(r.character){r.character.pose=copyPose(r.character.displayPose);r.character.manual=true;}});
    if(play&&!recording&&$('#preview-audio').checked)soundtrack.preview(timeline.time,timeline.duration).catch(e=>toast(e.message));
    $('#play').innerHTML=icon(play?'pause':'play');$('#play').classList.toggle('paused',play);
    $('#playback-status').innerHTML='<i></i> '+(play?'PREVIEWING':'EDIT MODE');
    if(!play&&document.activeElement?.dataset?.actorInput!=='true')refreshInspector();
  }
  function seek(time,previewCamera=state.inspector==='camera'){finishInputEdit();setPlaying(false);timeline.time=clamp(time,0,timeline.duration);if(selected?.draft)selected.draft.time=timeline.time;if(previewCamera)viewOverride=false;applyAtTime(timeline.time,true,true);updateTimeUI();refreshInspector();syncFov();}
  function updateTimeUI(){
    const t=timeline.time,secs=Math.floor(t)%60,mins=Math.floor(t/60),frac=Math.floor((t%1)*100+1e-5);
    $('#time-display').textContent=`${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}.${String(frac).padStart(2,'0')}`;
    $('#duration-display').textContent=timeline.duration.toFixed(2).padStart(5,'0');$('#playhead').style.left=(t/timeline.duration*100)+'%';
    if(document.activeElement!==$('#key-time'))$('#key-time').value=t.toFixed(2);$('#key-time').max=timeline.duration;updateKeyUI();
  }
  const terrainCfg={tool:'raise',biome:'temperate',radius:6,strength:2,falloff:'smooth',depth:3,seed:'studio'};
  function setMode(mode){
    setPlaying(false);
    if(state.scope==='part'&&['translate','scale'].includes(mode)){mode='rotate';toast('Body parts rotate at fixed joints. Choose Whole player to move or scale.');}
    state.mode=mode;$$('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
    gizmo.detach();const target=selectedTarget();if(target&&['translate','rotate','scale'].includes(mode)){gizmo.attach(target);gizmo.setMode(mode);gizmo.setSpace(mode==='translate'&&state.scope!=='held'?'world':'local');}
    hover.visible=false;const building=mode==='build'||mode==='erase',terrain=mode==='terrain';$('#build-badge').hidden=!(building||terrain);
    $('#build-badge').textContent=mode==='erase'?'Remove blocks · click any block':terrain?BRUSH_LABELS[terrainCfg.tool]+' brush · drag over terrain':'Placing '+blockDefs[state.block].label+' · right-click to erase';
    $('#viewport-hint').innerHTML=(building||terrain)?(mode==='erase'?'Click a block to remove <b>·</b> Ctrl+Z to undo <b>·</b> V to select':terrain?'Left-drag sculpts <b>·</b> Right-drag turns the camera <b>·</b> Each stroke is one undo step':'Click to place <b>·</b> Right-click to erase <b>·</b> V to select'):mode==='rotate'?'Drag a colored ring <b>·</b> XYZ angles in inspector <b>·</b> Key to animate':'Drag to orbit <b>·</b> Click a block, part or item <b>·</b> E to rotate';
    $('#place-blocks').classList.toggle('active',mode==='build');$('#erase-blocks').classList.toggle('active',mode==='erase');$('#terrain-toggle').classList.toggle('active',terrain);
    $('#terrain-panel').hidden=!terrain;
    if(terrain){orbit.mouseButtons={LEFT:null,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.ROTATE};orbit.touches={ONE:null,TWO:THREE.TOUCH.DOLLY_PAN};}
    else{orbit.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};orbit.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_PAN};}
    canvas.style.cursor=(building||terrain)?'crosshair':'default';
  }
  function selectObject(r,scope='root',joint=state.joint){finishInputEdit();selected=r;if(r?.draft)r.draft.time=timeline.time;state.selectedKey=null;state.scope=r?.character?scope:'root';state.joint=joint;$('#joint-select').value=joint;refreshOutliner();refreshInspector();refreshTimeline();setMode(['build','erase'].includes(state.mode)?'select':state.mode);}
  function showInspector(tab){$('.inspector-scroll').scrollTop=0;state.inspector=tab;$$('[data-inspector]').forEach(b=>b.classList.toggle('active',b.dataset.inspector===tab));for(const n of ['object','light','camera'])$('#inspect-'+n).hidden=n!==tab;syncDock();}
  function refreshOutliner(){
    const host=$('#outliner');host.replaceChildren();$('#obj-count').textContent=objects.length+1;
    const terrain=document.createElement('button');terrain.className='object-row';terrain.innerHTML=icon('grid')+'<span>Terrain</span><small>BLOCKS</small>';terrain.title='Select an individual block in the viewport';terrain.onclick=()=>{state.category='blocks';refreshLibrary();setMode('select');toast('Click a block to select it, or use Place / Remove in the library.');};host.append(terrain);
    for(const r of objects){
      const b=document.createElement('button');b.className='object-row'+(r===selected?' active':'');b.dataset.object=r.id;
      b.innerHTML=icon(r.character?'person':r.type==='lamp'?'sun':'cube');
      const label=document.createElement('span');label.textContent=r.name;b.append(label);
      if(r===selected){const s=document.createElement('small');s.textContent='SELECTED';b.append(s);}
      b.onclick=()=>{selectObject(r);showInspector('object');};b.ondblclick=()=>focusObject(r);host.append(b);
    }
  }
  function refreshInspector(){
    const r=selected;$('#object-empty').hidden=!!r;$('#object-controls').hidden=!r;$('#selection-type').textContent=r?(state.scope==='part'?'BODY PART':state.scope==='held'?'HELD ITEM':r.type.toUpperCase()):'NOTHING';
    $('#selected-target').textContent=r?(r.character?r.name+' · '+targetLabel():r.name):'Click a block, tool or player';updateKeyUI();
    if(!r)return;
    if(r.character&&state.scope==='held'&&!r.character.mount.children.length)state.scope='root';
    const target=selectedTarget(),part=state.scope==='part';
    $('#object-name').value=r.name;$('#object-kind').textContent=r.character?'Classic skin · recreated rig':r.type==='import'?'Your imported model':r.type==='voxel'?'Converted voxel model':r.type==='tool'?(itemDefs[r.options.asset]?.sprite?'Textured inventory sprite':'Original source geometry'):r.type==='block'?'Individual editable block':'Scene prop';
    $('#object-icon').innerHTML=r.character&&skinThumb?`<img src="${skinThumb}" alt="Bob">`:icon(r.type==='lamp'?'sun':'cube');
    $('#target-name').textContent=targetLabel();$('#scope-actions').hidden=!r.character;
    for(const[id,scope]of[['whole-player','root'],['pose-part','part'],['scope-held','held']])$('#'+id).classList.toggle('active',state.scope===scope);
    $('#scope-held').disabled=!r.character?.mount.children.length;$('#select-held-tool').disabled=!r.character?.mount.children.length;
    $('#drop-ground').disabled=state.scope!=='root';$('#delete-object').title=state.scope==='held'?'Remove held item':part?'Choose Whole player to delete the character':'Delete selected object';
    for(let i=0;i<3;i++){const axis='xyz'[i];$('#obj-'+axis).value=target.position.getComponent(i).toFixed(2);$('#obj-'+axis).disabled=part;$('#rot-'+axis).value=rad(target.rotation[axis]).toFixed(1);}
    $('#rotation-path').value=r.rotationMode||'shortest';$('#rotation-path-note').textContent=r.rotationMode==='spins'?'Full turns are intentional: numeric angle values set the turn count.':'Direct motion between saved poses; drag direction and extra turns are ignored.';
    $('#obj-scale').value=target.scale.x.toFixed(2);$('#obj-scale').disabled=part;$('#char-controls').hidden=!r.character;$('#model-controls').hidden=!['import','voxel'].includes(r.type);$('#clear-object-track').hidden=!!r.character||!r.keys?.length;
    const tool=r.type==='tool'?r.options.asset:(r.character&&!part&&r.character.tool!=='none'?r.character.tool:null),texture=tool?toolTextureName(tool):r.type==='block'?blockDefs[resolveBlock(r.options.block)]?.icon:null;
    $('#texture-preview').hidden=!texture||!textureURL(texture);if(texture&&textureURL(texture)){const meta=catalog.textureMeta[texture]||{};$('#texture-image').src=textureURL(texture);$('#texture-image').alt=meta.name||texture;$('#texture-filename').textContent=meta.name||texture+'.png';$('#download-texture').dataset.texture=texture;$('#tool-shading-row').hidden=!tool;$('#tool-shading').checked=light.toolLit;$('#texture-preview p').textContent=meta.kind==='palette-tint'?'Original grayscale art + the game’s equipment color palette.':meta.kind==='model-image'?'Texture extracted from the source model.':tool?'Original PNG colors are preserved by default.':'Source texture / inventory icon; individual block faces can differ.';}
    if(r.character){
      $('#held-tool').value=r.character.tool;$('#live-motion').checked=r.character.live;$('#show-joints').checked=r.character.markers.visible;refreshJointUI();
      $$('[data-pose]').forEach(b=>b.classList.toggle('active',b.dataset.pose===r.character.preset));
    }
    if(['import','voxel'].includes(r.type)){
      $('#model-anim').disabled=!r.animations?.length;$('#model-anim').checked=!!r.animPlaying;$('#voxelize').disabled=r.type==='voxel';
      $('#model-note').textContent=r.animations?.length?`${r.animations.length} embedded clip(s). Playback uses the first clip.`:'No embedded animation in this model.';
    }
  }
  function refreshJointUI(){
    const c=selected?.character;if(!c)return;const p=c.displayPose,id=$('#joint-select').value||'head';
    for(let i=0;i<3;i++){const ax='xyz'[i],v=p[id]?.[i]||0;$('#joint-'+ax).value=v;$('#joint-'+ax+'-value').textContent=Math.round(v)+'°';}
    $('#body-height').value=p.offset||0;$('#body-height-value').textContent=(p.offset||0).toFixed(2);
  }
  let libraryToken=0,thumbnailQueue=[],thumbnailTimer=0;
  function queueThumbnail(image,kind,id,token){thumbnailQueue.push({image,kind,id,token});if(!thumbnailTimer)thumbnailTimer=setTimeout(runThumbnail,30);}
  function runThumbnail(){
    thumbnailTimer=0;if(recording||timeline.playing){thumbnailTimer=setTimeout(runThumbnail,200);return;}
    let job;while(thumbnailQueue.length){const next=thumbnailQueue.shift();if(next.image.isConnected&&next.token===libraryToken){job=next;break;}}
    if(job){try{job.image.src=renderAssetThumbnail(job.kind,job.id);job.image.className='model-thumb';}catch{}}
    if(thumbnailQueue.length)thumbnailTimer=setTimeout(runThumbnail,18);
  }
  function showTextureAsset(key){
    const meta=catalog.textureMeta[key];if(!meta)return;$('#asset-detail-name').textContent=meta.name;$('#asset-detail-image').src=textureURL(key);$('#asset-detail-download').dataset.texture=key;
    $('#asset-detail-note').textContent=meta.width+' × '+meta.height+' pixels · '+(meta.kind==='original-pack'?'Unchanged PNG from the official public default pack.':meta.kind==='live-png'?'Newer public game texture, retrieved from the BloxdHub live asset mirror.':meta.kind==='palette-tint'?'Derived from '+meta.base+' using the game’s '+meta.color+' equipment tint.':'Image extracted from source model '+meta.model+'.')+' This view is a texture file, not a promise that every atlas is a placeable block.';$('#asset-dialog').showModal();
  }
  function refreshLibrary(){
    const token=++libraryToken,isBlocks=state.category==='blocks',isItems=state.category==='tools',isModels=state.category==='models',isTextures=state.category==='textures',isBob=state.category==='characters',isBuilds=state.category==='builds';
    $$('[data-library]').forEach(b=>b.classList.toggle('active',b.dataset.library===state.category));$('#block-edit-actions').hidden=!isBlocks;$('#tool-edit-actions').hidden=!(isItems||isModels);$('#terrain-panel').hidden=!(isBlocks&&state.mode==='terrain');
    $('#asset-action-note').textContent=isBlocks?'Place / Remove to build. Select + Rotate to animate a block.':isItems||isModels?(state.toolAction==='place'?'Place a separate, rotatable asset. A ghost preview follows your cursor — click to set it down, Esc cancels. Models are static source geometry.':'Select a player, then choose an asset to hold. Adjust its grip in Held item.') :isBuilds?'Whole builds from the open map-editor pack. Click one, then click the world — a ghost shows where it lands. Esc cancels.':isTextures?'All PNG files, embedded model images and labeled palette variants. Click to inspect / download.':'The built-in, editable classic Bob recreation.';
    $('#place-tools').classList.toggle('active',state.toolAction==='place');$('#equip-tools').classList.toggle('active',state.toolAction==='equip');
    $('#catalog-summary').textContent=isBuilds?prefabAssets.length.toLocaleString()+' prefab builds · houses, trees, rocks & stands':catalog.counts.liveBlockRoots.toLocaleString()+' base blocks · '+catalog.counts.liveItemEntries.toLocaleString()+' item entries';
    const query=$('#asset-search').value.trim().toLowerCase(),words=query.split(/\s+/).filter(Boolean),host=$('#asset-grid');host.replaceChildren();host.classList.toggle('characters',isBob);
    let rows=isBlocks?catalog.blockOrder.map(id=>({id,...blockDefs[id],name:blockDefs[id].label,kind:'block'})):isItems?catalog.itemOrder.map(id=>({id,...itemDefs[id]})):isModels?catalog.sourceModels.map(r=>({...r,id:r.asset,name:r.name,kind:'model'})):isBuilds?prefabAssets.map(a=>({id:a.n,name:prefabLabel(a),kind:'build',group:a.t[0].toUpperCase()+a.t.slice(1),available:true,meta:a})):isTextures?Object.entries(catalog.textureMeta).map(([id,m])=>({id,name:m.name,kind:'texture',group:({'original-pack':'Original pack PNGs','live-png':'Live additions','model-image':'Model images','palette-tint':'Equipment color variants'})[m.kind],available:true,meta:m})): [{id:'bob',name:'Bob',kind:'character',group:'Poseable',available:true}];
    const groupSelect=$('#catalog-group'),groups=[...new Set(rows.map(r=>r.group).filter(Boolean))].sort();groupSelect.replaceChildren();const all=document.createElement('option');all.value='';all.textContent='All groups';groupSelect.append(all);for(const g of groups){const o=document.createElement('option');o.value=g;o.textContent=g;groupSelect.append(o);}groupSelect.value=groups.includes(state.libraryGroup)?state.libraryGroup:'';state.libraryGroup=groupSelect.value;
    $('.catalog-filters').hidden=isBob;$('.catalog-filters label').hidden=isTextures||isModels||isBuilds;$('#catalog-advanced').checked=state.libraryAdvanced;
    rows=rows.filter(r=>(!state.libraryGroup||r.group===state.libraryGroup)&&((query||state.libraryAdvanced)||(!r.variant&&!r.internal))&&words.every(w=>(r.name+' '+r.id+' '+(r.group||'')).toLowerCase().includes(w)));
    const pageSize=48,pages=Math.max(1,Math.ceil(rows.length/pageSize));state.libraryPage=Math.max(0,Math.min(state.libraryPage,pages-1));const offset=state.libraryPage*pageSize,visible=rows.slice(offset,offset+pageSize);
    $('#catalog-count').textContent=rows.length?(offset+1)+'–'+(offset+visible.length)+' of '+rows.length.toLocaleString():'No matches';$('#catalog-page').textContent=(state.libraryPage+1)+' / '+pages;$('#catalog-prev').disabled=state.libraryPage===0;$('#catalog-next').disabled=state.libraryPage>=pages-1;$('.catalog-pages').hidden=isBob;
    for(const r of visible){
      const button=document.createElement('button');button.className='asset-card'+(!r.available?' unavailable':'');button.title=r.name;button.dataset.asset=r.id;
      const image=document.createElement('img');image.alt='';image.loading='lazy';image.src=isBlocks?blockIcon(r.id):isBuilds?prefabIcon(r.meta.t):isTextures?textureURL(r.id):isBob?skinThumb:toolIcon(isModels?r.asset:r.id)||fallbackIcon();if(isBlocks&&!r.model&&r.shape==='cube')image.className='block-thumb';button.append(image);
      const label=document.createElement('span');label.textContent=r.name;button.append(label);const tag=document.createElement('i');tag.className='asset-tag';tag.textContent=!r.available?'No published visual':isBuilds?r.meta.b.toLocaleString()+' blocks':r.variant?'State variant':isModels?'Source model':r.kind==='block-item'?'Held block':r.kind==='texture'?(r.meta.kind==='original-pack'?'Original PNG':r.group):isBlocks&&r.shape!=='cube'?r.shape.replace('|rotatable',''):'';button.append(tag);
      if(!r.available){button.disabled=true;button.title=r.name+' — listed in the catalog, but no published graphic was found.';}
      else button.onclick=()=>{
        if(isBlocks){state.block=r.id;setPlaying(false);setMode('build');touchClosePanels();refreshLibrary();}
        else if(isTextures)showTextureAsset(r.id);
        else if(isBob){const n=objects.filter(o=>o.character).length+1;added(addBob(spawnPosition(),'Bob '+String(n).padStart(2,'0')));touchClosePanels();}
        else if(isBuilds){try{startSchemGhost(prefabLabel(r.meta),prefabCells(r.meta));}catch(err){toast('Could not read '+r.meta.n+': '+err.message);}}
        else{const asset=isModels?r.asset:r.id;if(state.toolAction==='equip'){if(!selected?.character){toast('Select a player first, then choose an item.');return;}equipTool(selected,asset);setScope('held');setMode('rotate');touchClosePanels();showInspector('object');}else startPropGhost(asset);}
      };
      if(isBlocks&&state.mode==='build'&&r.id===state.block)button.classList.add('active');
      if(isBob){button.classList.add('character-card');const note=document.createElement('small');note.textContent='Classic skin recreation · 10-joint rig';button.append(note);}
      host.append(button);
      if(r.available&&(isModels||isBlocks&&(r.model||r.shape!=='cube')||isItems&&!itemDefs[r.id]?.sprite))queueThumbnail(image,isBlocks?'block':'item',isModels?r.asset:r.id,token);
    }
    $('#asset-empty').hidden=rows.length>0;
  }
  function refreshCameraKeys(){
    const host=$('#camera-keys');host.replaceChildren();
    if(!camTrack.keys.length){host.innerHTML='<p class="muted">No keys yet. Move the view, then key it.</p>';return;}
    camTrack.keys.forEach((k,i)=>{
      const row=document.createElement('div');row.className='key-list-row';const s=document.createElement('span');s.textContent=`${String(i+1).padStart(2,'0')}   ·   ${k.time.toFixed(2)} s   ·   ${Math.round(k.fov)}°`;
      const jump=document.createElement('button');jump.className='icon-btn';jump.innerHTML=icon('play');jump.title='Preview this key';jump.onclick=()=>seek(k.time);
      const del=document.createElement('button');del.className='icon-btn';del.innerHTML=icon('trash');del.title='Delete this camera key';del.onclick=()=>deleteKey('camera',i);
      row.append(s,jump,del);host.append(row);
    });
  }
  function refreshTimeline(){
    $('#duration').value=timeline.duration;$('#loop').checked=timeline.loop;$('#camera-enabled').checked=timeline.cameraEnabled;$('#camera-smooth').checked=camTrack.smooth;
    const area=$('#track-area');area.style.setProperty('--tick-step',(100/timeline.duration)+'%');
    const ruler=$('#ruler');ruler.replaceChildren();const step=timeline.duration>24?5:timeline.duration>14?2:1;
    for(let t=0;t<=timeline.duration;t+=step){const el=document.createElement('span');el.textContent=t+'s';el.style.left=(t/timeline.duration*100)+'%';ruler.append(el);}
    const poseKeys=selected?(selected.character?.keys||selected.keys||[]):[];$('#camera-key-count').textContent=camTrack.keys.length;$('#pose-key-count').textContent=poseKeys.length;$('#pose-track-name').textContent=selected?selected.name+(selected.character?' · pose':' · transform'):'Select an object';
    for(const[type,keys,host]of [['camera',camTrack.keys,$('#cam-track')],['pose',poseKeys,$('#pose-track')]]){
      host.replaceChildren();keys.forEach((k,i)=>{
        if(k.time>timeline.duration+.001)return;
        const b=document.createElement('button');b.className='key-marker'+(type==='pose'?' pose-key':'');b.style.left=(k.time/timeline.duration*100)+'%';b.title=`${type} key at ${k.time.toFixed(2)}s · drag to retime`;b.setAttribute('aria-label',b.title);
        if(state.selectedKey?.type===type&&state.selectedKey.index===i)b.classList.add('selected-key');
        b.addEventListener('pointerdown',e=>{
          e.stopPropagation();setPlaying(false);const before=clone(keys),owner=selected;state.selectedKey={type,index:i,owner:owner?.id};seek(k.time,type==='camera');b.classList.add('selected-key');
          const start=e.clientX,rect=area.getBoundingClientRect();b.setPointerCapture(e.pointerId);
          const move=ev=>{if(Math.abs(ev.clientX-start)<2)return;k.time=clamp(Math.round((ev.clientX-rect.left)/rect.width*timeline.duration*100)/100,0,timeline.duration);timeline.time=k.time;b.style.left=(k.time/timeline.duration*100)+'%';updateTimeUI();};
          const up=()=>{b.removeEventListener('pointermove',move);b.removeEventListener('pointerup',up);
            const after=keys.filter(other=>other!==k&&Math.abs(other.time-k.time)>KEY_EPS).map(clone);putKey(after,clone(k));
            state.selectedKey={type,index:after.findIndex(other=>Math.abs(other.time-k.time)<=KEY_EPS),owner:owner?.id};
            replaceKeys(type,owner,after);if(JSON.stringify(before)!==JSON.stringify(after))pushHistory('retime key',()=>replaceKeys(type,owner,before),()=>replaceKeys(type,owner,after));
            if(owner?.draft)owner.draft.time=timeline.time;applyAtTime(timeline.time,true,true);updatePath();refreshTimeline();refreshCameraKeys();};
          b.addEventListener('pointermove',move);b.addEventListener('pointerup',up,{once:true});
        });host.append(b);
      });
    }
    $('#key-pose').disabled=!selected;$('#key-pose').innerHTML=icon('key')+(selected?.character?'Apply pose':'Apply transform');$('#delete-key').disabled=!state.selectedKey;
    const easeSel=$('#key-ease'),sk=state.selectedKey;
    const skKey=sk?(sk.type==='camera'?camTrack.keys[sk.index]:(sk.owner===selected?.id?keysOf(selected)[sk.index]:null)):null;
    easeSel.disabled=!skKey;easeSel.value=skKey?.ease||'';
    $('#auto-key').classList.toggle('active',state.autoKey);
    updateTimeUI();
  }
  function replaceKeys(type,owner,keys){if(type==='camera'){camTrack.keys=clone(keys);camTrack.rebuild();updatePath();refreshCameraKeys();}else if(owner){if(owner.character)owner.character.keys=clone(keys);else owner.keys=clone(keys);}refreshTimeline();refreshInspector();}
  function addPoseKey(){
    finishInputEdit();const r=selected;if(!r){toast('Select a player, block, tool or model first.');return;}setPlaying(false);
    const addedStart=applyObjectKey(r,timeline.time),keys=keysOf(r);
    state.selectedKey={type:'pose',index:keys.findIndex(k=>Math.abs(k.time-timeline.time)<=KEY_EPS),owner:r.id};refreshTimeline();refreshInspector();
    toast((r.character?'Pose':'Transform')+' applied at '+timeline.time.toFixed(2)+' s'+(addedStart?' · starting key added at 0 s':'')+'. Use From start to preview.');
  }
  function addCameraKey(){
    setPlaying(false);const before=clone(camTrack.keys);
    putKey(camTrack.keys,{time:timeline.time,position:camera.position.toArray(),target:orbit.target.toArray(),fov:camera.fov});camTrack.rebuild();updatePath();const after=clone(camTrack.keys);
    pushHistory('camera key',()=>replaceKeys('camera',null,before),()=>replaceKeys('camera',null,after));state.selectedKey={type:'camera',index:camTrack.keys.findIndex(k=>Math.abs(k.time-timeline.time)<=KEY_EPS)};refreshTimeline();refreshCameraKeys();toast('Camera keyed at '+timeline.time.toFixed(2)+'s');
  }
  function deleteKey(type,index){
    const owner=selected,keys=type==='camera'?camTrack.keys:(owner?.character?.keys||owner?.keys);if(!keys?.[index])return;
    const before=clone(keys);keys.splice(index,1);const after=clone(keys);replaceKeys(type,owner,after);state.selectedKey=null;
    pushHistory('delete key',()=>replaceKeys(type,owner,before),()=>replaceKeys(type,owner,after));refreshTimeline();
  }
  function refreshAll(){historyUI();refreshOutliner();refreshInspector();refreshTimeline();refreshCameraKeys();refreshLibrary();}
  // ── One-click animation helpers: onion skin, baked clips, pose clipboard, walk paths, follow cam ──
  const onionGroup=new THREE.Group();onionGroup.name='Onion skin';scene.add(onionGroup);
  let onionPrev=null,onionNext=null;
  function makeOnionGhost(color){
    const c=createCharacter('Onion ghost');
    c.root.traverse(o=>{if(o.isMesh){o.material=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.16,depthWrite:false});o.castShadow=false;o.receiveShadow=false;}});
    c.markers.visible=false;c.root.visible=false;onionGroup.add(c.root);
    return c;
  }
  function updateOnion(){
    const show=state.onion&&selected?.character&&!timeline.playing&&!recording;
    if(!show){if(onionPrev){onionPrev.root.visible=false;onionNext.root.visible=false;}return;}
    if(!onionPrev){onionPrev=makeOnionGhost(0xf0ad7d);onionNext=makeOnionGhost(0x7dcedb);}
    let prev=null,next=null;
    for(const k of keysOf(selected)){if(!k.pose)continue;if(k.time<timeline.time-KEY_EPS)prev=k;else if(k.time>timeline.time+KEY_EPS){next=k;break;}}
    for(const[g,k]of[[onionPrev,prev],[onionNext,next]]){
      if(!k){g.root.visible=false;continue;}
      g.root.visible=true;
      g.root.position.fromArray(k.position);g.root.rotation.set(...k.rotation);g.root.scale.fromArray(k.scale);
      applyPose(g,k.pose);
    }
  }
  function bakeClipInto(clip){
    const r=selected;
    if(!r?.character){toast('Select a player first — clips bake real pose keys onto a character.');return;}
    finishInputEdit();setPlaying(false);
    const d=CLIP_DEFAULTS[clip]||CLIP_DEFAULTS.walk;
    let start=timeline.time;if(start+d.dur>timeline.duration+.05)start=Math.max(0,timeline.duration-d.dur);
    const duration=Math.min(d.dur,timeline.duration-start);
    const gen=bakeClip({clip,start,duration,from:r.root.position.toArray(),yaw:r.root.rotation.y,heightAt:(x,z)=>world.heightAt(x,z)});
    const before=trackSnapshot(r);
    for(const k of gen.keys)putKey(keysOf(r),k);
    prepEdit(r,true);r.draft=null;
    applyAtTime(timeline.time,true,true);
    const after=trackSnapshot(r);
    pushHistory('bake '+clip+' clip',()=>restoreTrack(r,before),()=>restoreTrack(r,after));
    refreshTimeline();refreshInspector();
    toast(clip[0].toUpperCase()+clip.slice(1)+' baked · '+gen.keys.length+' keys from '+start.toFixed(2)+'s · Undo restores the track.');
  }
  let poseClip=null;
  function selectedPoseKey(){
    const r=selected;if(!r?.character)return null;
    const sel=state.selectedKey;
    if(sel?.type==='pose'&&sel.owner===r.id){const k=keysOf(r)[sel.index];if(k?.pose)return k;}
    return null;
  }
  function copyPoseClip(){
    const r=selected;if(!r?.character){toast('Select a player first.');return;}
    const k=selectedPoseKey();
    poseClip=copyPose(k?k.pose:r.character.displayPose);
    toast('Pose copied'+(k?' from the key at '+k.time.toFixed(2)+'s':'')+'. Paste turns it into a key — on any player.');
  }
  function pastePoseClip(){
    const r=selected;if(!r?.character){toast('Select a player first.');return;}
    if(!poseClip){toast('Copy a pose first.');return;}
    finishInputEdit();prepEdit(r);
    r.character.pose=copyPose(poseClip);r.character.preset='custom';
    applyPose(r.character,r.character.pose);
    r.draft=null;applyObjectKey(r,timeline.time);
    refreshTimeline();refreshInspector();
    toast('Pose pasted as a key at '+timeline.time.toFixed(2)+' s.');
  }
  function mirrorCurrentPose(){
    const r=selected;if(!r?.character){toast('Select a player first.');return;}
    const k=selectedPoseKey();
    if(k){
      const before=trackSnapshot(r);
      k.pose=mirrorPose(k.pose);
      applyAtTime(timeline.time,true,true);
      const after=trackSnapshot(r);
      pushHistory('mirror key pose',()=>restoreTrack(r,before),()=>restoreTrack(r,after));
      refreshTimeline();refreshInspector();
      toast('Key at '+k.time.toFixed(2)+' s mirrored left ↔ right.');
      return;
    }
    const before=actorSnapshot(r);prepEdit(r);
    r.character.preset='custom';r.character.pose=mirrorPose(r.character.displayPose);
    applyPose(r.character,r.character.pose);
    recordActorChange(r,before,'mirror pose');refreshInspector();
    toast('Pose mirrored left ↔ right. Use Apply pose to key it.');
  }
  let pathPoints=null,pathMarkers=[];
  function clearPathMarkers(){for(const m of pathMarkers){helpers.remove(m);m.geometry?.dispose();m.material?.dispose();}pathMarkers=[];}
  function setPathMode(on){
    state.pathMode=!!on;
    const btn=$('#walk-path');btn.textContent=on?'✔ Bake path':'＋ Path';btn.classList.toggle('active',!!on);
    if(!on){clearPathMarkers();pathPoints=null;$('#ghost-status').hidden=true;canvas.style.cursor='';}
    else{pathPoints=[];canvas.style.cursor='crosshair';setGhostStatus('Walk path · click the ground to add points · Bake path or Enter finishes · Esc cancels',false);}
  }
  function addPathPoint(hit){
    const x=hit.point.x,z=hit.point.z,y=world.heightAt(x,z);
    pathPoints.push([x,y,z]);
    const dot=new THREE.Mesh(new THREE.SphereGeometry(.15,12,10),new THREE.MeshBasicMaterial({color:0xd0ee8e}));
    dot.position.set(x,y+.18,z);helpers.add(dot);pathMarkers.push(dot);
    if(pathPoints.length>1){
      const a=pathPoints.at(-2);
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a[0],a[1]+.18,a[2]),new THREE.Vector3(x,y+.18,z)]),new THREE.LineBasicMaterial({color:0xd0ee8e,transparent:true,opacity:.75}));
      helpers.add(line);pathMarkers.push(line);
    }
    setGhostStatus('Walk path · '+pathPoints.length+' point'+(pathPoints.length>1?'s':'')+' · click to add more · Bake path or Enter finishes · Esc cancels',false);
  }
  function bakePath(){
    const r=selected;
    if(!r?.character){toast('Select a player first — then draw the route.');return;}
    if(!pathPoints||pathPoints.length<2){toast('Click at least two points on the ground first.');return;}
    finishInputEdit();setPlaying(false);
    let gen;
    try{gen=bakeWalkPath({points:pathPoints.map(p=>[p[0],p[2]]),speed:1.4,heightAt:(x,z)=>world.heightAt(x,z)});}
    catch(err){toast(err.message);return;}
    if(gen.totalTime>timeline.duration-.05){timeline.duration=Math.min(60,Math.ceil(gen.totalTime*2)/2+.5);$('#duration').value=timeline.duration;}
    const before=trackSnapshot(r);
    for(const k of gen.keys)putKey(keysOf(r),k);
    prepEdit(r,true);r.draft=null;
    timeline.time=0;applyAtTime(0,true,true);updateTimeUI();
    const after=trackSnapshot(r);
    pushHistory('bake walk path',()=>restoreTrack(r,before),()=>restoreTrack(r,after));
    setPathMode(false);refreshTimeline();refreshInspector();
    toast('Walk path baked · '+gen.keys.length+' keys over '+gen.totalTime.toFixed(1)+' s · press From start to preview.');
  }
  function cameraFollow(){
    const r=selected;
    if(!r){toast('Select a player or object first.');return;}
    if(!keysOf(r).length){toast(r.name+' has no animation keys yet — nothing to follow.');return;}
    finishInputEdit();setPlaying(false);
    const before=clone(camTrack.keys);
    const offset=camera.position.clone().sub(orbit.target);
    const keys=[];
    for(let t=0;t<=timeline.duration+1e-6;t+=.5){
      const s=r.character?samplePose(keysOf(r),t,r.rotationMode):sampleTransform(keysOf(r),t,r.rotationMode);
      if(!s)continue;
      const center=new THREE.Vector3().fromArray(s.position);
      keys.push({time:Math.min(t,timeline.duration),position:center.clone().add(offset).toArray(),target:[center.x,center.y+1,center.z],fov:camera.fov});
    }
    if(keys.length<2){toast('Could not build a follow shot from this track.');return;}
    camTrack.keys=keys;camTrack.rebuild();updatePath();
    const after=clone(camTrack.keys);
    pushHistory('camera follow',()=>replaceKeys('camera',null,before),()=>replaceKeys('camera',null,after));
    refreshCameraKeys();refreshTimeline();
    toast('Camera now follows '+r.name+' for the whole clip · Undo restores the old camera track.');
  }

  function freeView(){setPlaying(false);viewOverride=true;orbit.enabled=true;}
  function focusObject(r){
    if(!r)return;freeView();const box=new THREE.Box3().setFromObject(r.root),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
    const d=Math.max(3,Math.max(size.x,size.y,size.z)*2.2);camera.position.copy(center).add(new THREE.Vector3(d*.55,d*.35,d));orbit.target.copy(center);camera.fov=45;camera.updateProjectionMatrix();orbit.update();syncFov();
  }
  function frameScene(){freeView();camera.position.set(15,12,19);orbit.target.set(0,1.5,0);camera.fov=45;camera.updateProjectionMatrix();orbit.update();syncFov();}
  function syncFov(){$('#camera-fov').value=camera.fov;$('#camera-fov-value').textContent=Math.round(camera.fov)+'°';}
  function cameraView(name){
    if(name==='wide'){frameScene();return;}if(name==='close'){focusObject(selected||bob);return;}
    freeView();const target=selected?new THREE.Box3().setFromObject(selected.root).getCenter(new THREE.Vector3()):new THREE.Vector3(0,2,0);
    const offsets={front:[0,2,12],top:[.001,18,.001],side:[14,2,0]};camera.position.copy(target).add(new THREE.Vector3(...offsets[name]));orbit.target.copy(target);orbit.update();
  }
  orbit.addEventListener('start',()=>{if(!gizmo.dragging)freeView();});
  let gizmoBefore=null;
  gizmo.addEventListener('dragging-changed',e=>{
    orbit.enabled=!e.value;if(e.value&&selected){finishInputEdit();prepEdit();gizmoBefore=actorSnapshot(selected);orbit.enabled=false;}
    else if(selected&&gizmoBefore){recordActorChange(selected,gizmoBefore,'transform '+selected.name);gizmoBefore=null;refreshInspector();}
  });
  gizmo.addEventListener('objectChange',()=>{if(selected){syncTargetToActor();if(gizmoBefore)stageActorEdit(selected,gizmoBefore);refreshInspector();}});

  // Pointer picking uses the viewport rectangle, never the full window.
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
  const hover=new THREE.Mesh(new THREE.BoxGeometry(1.005,1.005,1.005),new THREE.MeshBasicMaterial({color:0xd6f29e,wireframe:true,transparent:true,opacity:.8,depthWrite:false}));hover.visible=false;helpers.add(hover);
  // Ghost placement preview (ported from the Bloxd Map Editor asset placer and the VoxelForge
  // ghost system): a translucent copy of the schematic/asset follows the cursor, the wheel
  // adjusts height, R rotates builds, overlapping destinations tint the ghost red,
  // left-click commits, right-click/Esc cancels.
  let ghostState=null;
  // Terrain brush ring (VoxelForge-style sculpting): drag stamps the brush along the surface.
  const brushRing=new THREE.Mesh(new THREE.RingGeometry(.97,1.05,64),new THREE.MeshBasicMaterial({color:0xd6f29e,transparent:true,opacity:.8,depthWrite:false,side:THREE.DoubleSide}));
  brushRing.rotation.x=-Math.PI/2;brushRing.visible=false;helpers.add(brushRing);
  let terrainStroke=null,terrainLast=null,terrainRebuild=false;
  function queueTerrainRebuild(){if(terrainRebuild)return;terrainRebuild=true;requestAnimationFrame(()=>{terrainRebuild=false;world.rebuild();});}
  function terrainCenter(e){
    const hit=sceneHit(e);if(!hit)return null;
    const x=Math.floor(hit.point.x),z=Math.floor(hit.point.z);
    if(Math.abs(x)>400||Math.abs(z)>400)return null;
    const t=topAt(world,x,z,Math.ceil(world.heightAt(x,z)),64);
    return [x,t==null?Math.floor(hit.point.y):t,z];
  }
  function stampTerrain(c){
    const changed=applyBrush(world,c,{...terrainCfg,targetY:c[1]});
    if(terrainStroke)for(const [k,v] of changed)if(!terrainStroke.has(k))terrainStroke.set(k,v);
    if(changed.size)queueTerrainRebuild();
    return changed.size;
  }
  function endTerrainStroke(){
    const entries=terrainStroke?[...terrainStroke]:[];terrainStroke=null;terrainLast=null;
    if(!entries.length)return;
    world.rebuild();
    const tool=terrainCfg.tool;
    pushHistory('terrain '+tool,
      ()=>{for(const [k,[old]] of entries){const [x,y,z]=k.split(',').map(Number);world.set(x,y,z,old);}world.rebuild();},
      ()=>{for(const [k,[,nw]] of entries){const [x,y,z]=k.split(',').map(Number);world.set(x,y,z,nw);}world.rebuild();});
  }
  function aim(e){const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);camera.updateMatrixWorld();ray.setFromCamera(pointer,camera);}
  function visibleMesh(o){if(!o.isMesh)return false;for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;}
  function recordForHit(hit){let obj=hit?.object;while(obj&&!obj.userData.studioId)obj=obj.parent;return objects.find(r=>r.id===obj?.userData.studioId)||null;}
  function sceneHit(e){aim(e);scene.updateMatrixWorld(true);return ray.intersectObjects([...world.meshes,...objectGroup.children,floor],true).find(h=>visibleMesh(h.object))||null;}
  function terrainHit(e){return sceneHit(e);}
  function cellFromHit(hit,dig=false){
    if(dig&&world.meshes.includes(hit.object)&&hit.instanceId!==undefined)return hit.object.userData.cells[hit.instanceId].slice();
    if(hit.object===floor)return[Math.floor(hit.point.x),-3,Math.floor(hit.point.z)];
    const normal=hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
    if(hit.object.userData.waterCells){const p=hit.point.clone().addScaledVector(normal,-.5);return[Math.floor(p.x),Math.floor(p.y),Math.floor(p.z)];}
    const p=hit.point.clone().addScaledVector(normal,.025);return[Math.floor(p.x),Math.floor(p.y),Math.floor(p.z)];
  }
  function editableHit(hit,dig){if(!hit)return false;if(hit.object===floor)return !dig;if(world.meshes.includes(hit.object))return true;return recordForHit(hit)?.type==='block';}
  function editBlock(hit,dig){
    if(!editableHit(hit,dig))return false;
    const rec=recordForHit(hit);
    if(dig&&rec?.type==='block'){const mode=state.mode;detachRecord(rec);pushHistory('remove '+rec.name,()=>attachRecord(rec),()=>detachRecord(rec));setMode(mode);return true;}
    const p=cellFromHit(hit,dig);if(p.some(n=>Math.abs(n)>400)){toast('Keep the scene within 400 blocks of its center.');return false;}
    const old=world.get(...p),next=dig?null:state.block;if(old===next||(!old&&dig))return false;
    if(!dig&&objects.some(r=>r.type==='block'&&r.root.position.distanceTo(new THREE.Vector3(p[0]+.5,p[1]+.5,p[2]+.5))<.15)){toast('There is already an editable block in this cell.');return false;}
    world.set(...p,next);world.rebuild();
    pushHistory(dig?'erase block':'place '+blockDefs[next].label,()=>{world.set(...p,old||null);world.rebuild();},()=>{world.set(...p,next);world.rebuild();});return true;
  }
  function selectTerrainBlock(hit){
    if(!world.meshes.includes(hit.object))return null;
    let cell;
    if(hit.instanceId!==undefined)cell=hit.object.userData.cells[hit.instanceId].slice();
    else if(hit.object.userData.waterCells){const p=hit.point.clone().addScaledVector(hit.face.normal,-.5);cell=[Math.floor(p.x),Math.floor(p.y),Math.floor(p.z)];}
    else return null;
    const type=world.get(...cell);if(!type)return null;
    const r=addProp('block',new THREE.Vector3(cell[0]+.5,cell[1]+.5,cell[2]+.5),{block:type,terrainCell:cell});
    world.set(...cell,null);world.rebuild();selectObject(r);showInspector('object');
    pushHistory('make block editable',()=>{detachRecord(r);world.set(...cell,type);world.rebuild();},()=>{world.set(...cell,null);world.rebuild();attachRecord(r);});
    toast(type==='water'?'Water block selected. Rotate, move or add a transform key.':'Block selected. Rotate, move or add a transform key.');return r;
  }
  let pointerDown=null;
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('pointerdown',e=>{
    pointerDown={x:e.clientX,y:e.clientY,button:e.button,gizmo:!!gizmo.axis};
    if(state.mode==='terrain'&&!ghostState&&e.button===0){terrainStroke=new Map();terrainLast=null;const c=terrainCenter(e);if(c){terrainLast=c.join(',');stampTerrain(c);}}
  });
  canvas.addEventListener('pointermove',e=>{
    if(ghostState){hover.visible=false;brushRing.visible=false;updateGhost(e);return;}
    if(state.mode==='terrain'){
      hover.visible=false;
      const c=terrainCenter(e);
      if(!c){brushRing.visible=false;return;}
      brushRing.visible=true;brushRing.position.set(c[0]+.5,c[1]+1.03,c[2]+.5);brushRing.scale.setScalar(terrainCfg.radius+.5);
      if(terrainStroke){const k=c.join(',');if(k!==terrainLast){terrainLast=k;stampTerrain(c);}}
      return;
    }
    if(!['build','erase'].includes(state.mode)){hover.visible=false;brushRing.visible=false;return;}brushRing.visible=false;const hit=sceneHit(e),dig=state.mode==='erase'||e.buttons===2||e.shiftKey;hover.visible=editableHit(hit,dig);
    if(hover.visible){const rec=recordForHit(hit);hover.rotation.set(0,0,0);hover.scale.set(1,1,1);if(dig&&rec?.type==='block'){hover.position.copy(rec.root.position);hover.rotation.copy(rec.root.rotation);hover.scale.copy(rec.root.scale);}else{const p=cellFromHit(hit,dig);hover.position.set(p[0]+.5,p[1]+.5,p[2]+.5);}hover.material.color.set(dig?0xf5a179:0xd6f29e);}
  });
  canvas.addEventListener('pointerleave',()=>{hover.visible=false;brushRing.visible=false;if(terrainStroke)endTerrainStroke();});
  canvas.addEventListener('wheel',e=>{if(!ghostState)return;e.preventDefault();ghostState.yOffset+=(e.deltaY<0?1:-1);applyGhostOffset();},{passive:false});
  canvas.addEventListener('pointerup',e=>{
    if(state.mode==='terrain'&&!ghostState){if(terrainStroke)endTerrainStroke();pointerDown=null;return;}
    const down=pointerDown;pointerDown=null;if(!down||Math.hypot(down.x-e.clientX,down.y-e.clientY)>5||down.gizmo)return;
    if(state.pathMode){if(down.button===0){const hit=sceneHit(e);if(hit)addPathPoint(hit);}else setPathMode(false);return;}
    if(ghostState){if(down.button===0){updateGhost(e);commitGhost();}else{cancelGhost();toast('Placement canceled.');}return;}
    if(['build','erase'].includes(state.mode)){editBlock(sceneHit(e),state.mode==='erase'||down.button===2||e.shiftKey);return;}
    if(down.button!==0)return;const hit=sceneHit(e);if(!hit||hit.object===floor){selectObject(null);return;}
    if(world.meshes.includes(hit.object)){selectTerrainBlock(hit);return;}
    const rec=recordForHit(hit);if(rec){
      let scope='root',part=state.joint;if(rec.character){if(hit.object.userData.item||hit.object.userData.toolTexture)scope='held';else if(hit.object.userData.part||hit.object.userData.joint){scope='part';part=hit.object.userData.part||hit.object.userData.joint;}}
      selectObject(rec,scope,part);showInspector('object');if(scope!=='root')setMode('rotate');
    }
  });
  canvas.addEventListener('dblclick',()=>focusObject(selected));

  // Inspector wiring.
  for(const[id,label]of Object.entries(JOINTS)){const o=document.createElement('option');o.value=id;o.textContent=label;$('#joint-select').append(o);}$('#joint-select').value='head';
  const none=document.createElement('option');none.value='none';none.textContent='Empty hand';$('#held-tool').append(none);
  const itemGroups=new Map();for(const name of toolNames){const group=itemDefs[name]?.group||'Other';if(!itemGroups.has(group)){const g=document.createElement('optgroup');g.label=group;itemGroups.set(group,g);$('#held-tool').append(g);}const o=document.createElement('option');o.value=name;o.textContent=name;itemGroups.get(group).append(o);}
  function bindActorInput(el,apply,label){let before=null,owner=null;el.dataset.actorInput='true';
    el.addEventListener('focus',()=>{if(selected){owner=selected;before=actorSnapshot(owner);}});
    el.addEventListener('pointerdown',()=>{if(selected){owner=selected;before=actorSnapshot(owner);}});
    el.addEventListener('input',()=>{if(!selected)return;if(!before){owner=selected;before=actorSnapshot(owner);}prepEdit();apply(selected,parseFloat(el.value)||0);stageActorEdit(selected,before);});
    el.addEventListener('change',()=>{if(owner&&before)recordActorChange(owner,before,label);before=null;owner=null;});
  }
  for(let i=0;i<3;i++){
    const ax='xyz'[i];
    bindActorInput($('#obj-'+ax),(r,v)=>{selectedTarget().position.setComponent(i,clamp(v,-100,100));syncTargetToActor();},'move selection');
    bindActorInput($('#rot-'+ax),(r,v)=>{selectedTarget().rotation[ax]=deg(clamp(v,-36000,36000));syncTargetToActor();refreshJointUI();},'rotate selection');
    bindActorInput($('#joint-'+ax),(r,v)=>{if(!r.character)return;const id=$('#joint-select').value;r.character.pose[id][i]=v;r.character.preset='custom';applyPose(r.character,r.character.pose);if(state.scope!=='part'||state.joint!==id)setScope('part',id);setMode('rotate');$('#joint-'+ax+'-value').textContent=v+'°';$('#rot-'+ax).value=v;},'pose joint');
  }
  bindActorInput($('#obj-scale'),(r,v)=>{selectedTarget().scale.setScalar(clamp(v,.05,20));syncTargetToActor();},'scale selection');
  bindActorInput($('#body-height'),(r,v)=>{if(r.character){r.character.pose.offset=v;applyPose(r.character,r.character.pose);$('#body-height-value').textContent=v.toFixed(2);}},'body lift');
  $('#joint-select').onchange=e=>{setScope('part',e.target.value);setMode('rotate');};
  $('#whole-player').onclick=()=>{setScope('root');setMode('rotate');};$('#pose-part').onclick=()=>{setScope('part',$('#joint-select').value);setMode('rotate');};
  $('#scope-held').onclick=$('#select-held-tool').onclick=()=>{setScope('held');setMode('rotate');};
  $('#rotate-selected').onclick=()=>setMode('rotate');
  $('#snap-rotation').onchange=e=>gizmo.setRotationSnap(e.target.checked?deg(15):null);
  $$('[data-turn]').forEach(b=>b.onclick=()=>{const r=selected;if(!r)return;const before=actorSnapshot(r);prepEdit();selectedTarget().rotation[b.dataset.turn]+=Math.PI/2;syncTargetToActor();recordActorChange(r,before,'quarter turn');refreshInspector();setMode('rotate');});
  $('#place-blocks').onclick=()=>{setPlaying(false);setMode('build');touchClosePanels();refreshLibrary();};$('#erase-blocks').onclick=()=>{setPlaying(false);setMode('erase');touchClosePanels();refreshLibrary();};
  $('#terrain-toggle').onclick=()=>{setPlaying(false);state.category='blocks';setMode(state.mode==='terrain'?'build':'terrain');touchClosePanels();refreshLibrary();};
  for(const t of BRUSH_TOOLS){const o=document.createElement('option');o.value=t;o.textContent=BRUSH_LABELS[t];$('#terrain-tool').append(o);}
  $('#terrain-tool').onchange=e=>terrainCfg.tool=e.target.value;
  $('#terrain-biome').onchange=e=>terrainCfg.biome=e.target.value;
  $('#terrain-radius').oninput=e=>{terrainCfg.radius=+e.target.value;$('#terrain-radius-value').textContent=e.target.value;};
  $('#terrain-strength').oninput=e=>{terrainCfg.strength=+e.target.value;$('#terrain-strength-value').textContent=e.target.value;};
  $('#terrain-falloff').onchange=e=>terrainCfg.falloff=e.target.value;
  $('#place-tools').onclick=()=>{state.toolAction='place';refreshLibrary();};$('#equip-tools').onclick=()=>{state.toolAction='equip';refreshLibrary();};
  function downloadTexture(key){const meta=catalog.textureMeta[key],url=textureURL(key);if(!url)return;const name=safeName(meta?.name||key);download(new Blob([decode64(url.split(',')[1])],{type:'image/png'}),name.endsWith('.png')?name:name+'.png');}
  $('#download-texture').onclick=()=>downloadTexture($('#download-texture').dataset.texture);$('#asset-detail-download').onclick=()=>downloadTexture($('#asset-detail-download').dataset.texture);
  $('#tool-shading').onchange=e=>{light.toolLit=e.target.checked;setToolLighting(light.toolLit,scene);};
  $('#rotation-path').onchange=e=>{const r=selected,after=e.target.value==='spins'?'spins':'shortest';if(!r)return;finishInputEdit();setPlaying(false);const before=r.rotationMode||'shortest';const set=mode=>{r.rotationMode=mode;seek(timeline.time);};set(after);pushHistory('rotation interpolation',()=>set(before),()=>set(after));toast(after==='shortest'?'Rotation now takes the shortest path between saved orientations.':'Explicit full turns enabled for this object’s animation track.');};
  $('#clear-object-track').onclick=()=>clearObjectKeys(selected);$('#revert-edit').onclick=revertEdit;
  $('#object-name').onchange=()=>{if(!selected)return;const r=selected,old=r.name,name=$('#object-name').value.trim().slice(0,40)||r.name;r.name=r.root.name=name;pushHistory('rename object',()=>{r.name=r.root.name=old;},()=>{r.name=r.root.name=name;});refreshOutliner();refreshTimeline();};
  $$('[data-inspector]').forEach(b=>b.onclick=()=>showInspector(b.dataset.inspector));
  $$('[data-library]').forEach(b=>b.onclick=()=>{state.category=b.dataset.library;state.libraryPage=0;state.libraryGroup='';$('#asset-search').value='';refreshLibrary();});
  $('#asset-search').oninput=()=>{state.libraryPage=0;refreshLibrary();};$('#catalog-group').onchange=e=>{state.libraryGroup=e.target.value;state.libraryPage=0;refreshLibrary();};$('#catalog-advanced').onchange=e=>{state.libraryAdvanced=e.target.checked;state.libraryPage=0;refreshLibrary();};$('#catalog-prev').onclick=()=>{state.libraryPage--;refreshLibrary();$('.asset-scroll').scrollTop=0;};$('#catalog-next').onclick=()=>{state.libraryPage++;refreshLibrary();$('.asset-scroll').scrollTop=0;};
  $('#catalog-info').onclick=()=>{const box=$('#catalog-coverage');box.replaceChildren();for(const[label,count]of[['Original pack PNGs',catalog.counts.officialPng],['Base blocks (docs + live)',catalog.counts.liveBlockRoots],['Block / state entries',catalog.counts.blockStates],['Item names (docs + live)',catalog.counts.liveItemEntries],['Source model choices',catalog.counts.modelChoices],['PNG images incl. model/tints',catalog.counts.texturesTotal]]){const d=document.createElement('div'),b=document.createElement('b'),span=document.createElement('span');b.textContent=count.toLocaleString();span.textContent=label;d.append(b,span);box.append(d);}$('#catalog-missing').textContent=[...catalog.unavailableItems,...catalog.unavailableBlocks].join('\n');$('#catalog-dialog').showModal();};
  $$('[data-mode]').forEach(b=>b.onclick=()=>{setMode(b.dataset.mode);refreshLibrary();});
  $$('[data-pose]').forEach(b=>b.onclick=()=>{
    const r=selected;if(!r?.character)return;const before=actorSnapshot(r);prepEdit();r.character.preset=b.dataset.pose;r.character.pose=presetPose(b.dataset.pose);applyPose(r.character,r.character.pose);recordActorChange(r,before,'pose preset');refreshInspector();
  });
  $('#reset-pose').onclick=()=>{const r=selected;if(!r?.character)return;const before=actorSnapshot(r);prepEdit();r.character.preset='idle';r.character.pose=neutralPose();applyPose(r.character,r.character.pose);recordActorChange(r,before,'reset pose');refreshInspector();};
  $('#clear-pose-track').onclick=()=>clearObjectKeys(selected);
  $('#live-motion').onchange=e=>{if(selected?.character){selected.character.live=e.target.checked;if(e.target.checked){selected.draft=null;updateKeyUI();}if(selected.character.preset==='custom')selected.character.preset='idle';selected.character.manual=true;}};
  $('#show-joints').onchange=e=>{if(selected?.character)selected.character.markers.visible=e.target.checked;};
  $('#onion-skin').onchange=e=>{state.onion=e.target.checked;try{localStorage.setItem('studioOnion',state.onion?'1':'0');}catch(err){}updateOnion();};
  $$('[data-clip]').forEach(b=>b.onclick=()=>bakeClipInto(b.dataset.clip));
  $('#pose-copy').onclick=copyPoseClip;$('#pose-paste').onclick=pastePoseClip;$('#pose-mirror').onclick=mirrorCurrentPose;
  $('#walk-path').onclick=()=>{if(state.pathMode){bakePath();return;}if(!selected?.character){toast('Select a player first — then draw the route.');return;}setPathMode(true);};
  $('#held-tool').onchange=e=>equipTool(selected,e.target.value);
  function deleteObject(){const r=selected;if(!r)return;if(r.character&&state.scope==='held'){equipTool(r,'none');return;}if(r.character&&state.scope==='part'){toast('Choose Whole player to delete the character. Joints stay in the rig.');return;}detachRecord(r);pushHistory('delete '+r.name,()=>attachRecord(r),()=>detachRecord(r));}
  $('#delete-object').onclick=deleteObject;
  $('#drop-ground').onclick=()=>{const r=selected;if(!r||state.scope!=='root')return;const before=actorSnapshot(r);prepEdit();r.root.updateMatrixWorld(true);const minY=new THREE.Box3().setFromObject(r.root).min.y;r.root.position.y+=world.heightAt(r.root.position.x,r.root.position.z)-minY;recordActorChange(r,before,'ground object');refreshInspector();};
  async function duplicateSelected(){
    const r=selected;if(!r)return;finishInputEdit();if(r.draft)applyObjectKey(r,r.draft.time);const data=serializeRecord(r);data.name=r.name+' copy';data.transform.position[0]+=1.4;for(const key of(data.character?.keys||data.keys||[]))key.position[0]+=1.4;
    try{const copy=await recordFromData(data);added(copy);}catch(e){toast('Could not duplicate: '+e.message);}
  }
  $('#duplicate').onclick=duplicateSelected;
  $('#add-tree').onclick=()=>added(addProp('tree',spawnPosition()));$('#add-rock').onclick=()=>added(addProp('rock',spawnPosition()));$('#add-lamp').onclick=()=>added(addProp('lamp',spawnPosition()));
  $('#focus').onclick=()=>focusObject(selected);$('#frame-scene').onclick=frameScene;$('#view-select').onchange=e=>cameraView(e.target.value);
  $('#grid-toggle').onclick=()=>{grid.visible=!grid.visible;$('#grid-toggle').classList.toggle('active',grid.visible);};
  $('#undo').onclick=undo;$('#redo').onclick=redo;

  for(const[id,key]of [['sun-az','az'],['sun-el','el'],['sun-power','power'],['fill-power','fill']])$('#'+id).oninput=e=>{light[key]=+e.target.value;light.preset='custom';updateLight();syncLightUI();};
  for(const[id,key]of [['sun-color','color'],['sky-color','sky']])$('#'+id).oninput=e=>{light[key]=e.target.value;light.preset='custom';updateLight();syncLightUI();};
  for(const[id,key]of [['shadows','shadows'],['soft-shadow','soft'],['show-fog','fog']])$('#'+id).onchange=e=>{light[key]=e.target.checked;updateLight();};
  $('#sun-helper').onchange=e=>sunGuide.visible=e.target.checked;
  $$('[data-light]').forEach(b=>b.onclick=()=>{Object.assign(light,LIGHTS[b.dataset.light],{preset:b.dataset.light});updateLight();syncLightUI();});
  $('#sun-pad').onpointerdown=e=>{
    const pad=e.currentTarget;pad.setPointerCapture(e.pointerId);
    const move=ev=>{const r=pad.getBoundingClientRect();light.az=Math.round(clamp((ev.clientX-r.left)/r.width,0,1)*360-180);light.el=Math.round(90-clamp((ev.clientY-r.top)/r.height,0,1)*85);light.preset='custom';updateLight();syncLightUI();};
    move(e);const up=()=>{pad.removeEventListener('pointermove',move);pad.removeEventListener('pointerup',up);};pad.addEventListener('pointermove',move);pad.addEventListener('pointerup',up,{once:true});
  };
  $('#camera-fov').oninput=e=>{freeView();camera.fov=+e.target.value;camera.updateProjectionMatrix();syncFov();};
  $('#cam-capture').onclick=addCameraKey;$('#key-camera').onclick=addCameraKey;$('#key-pose').onclick=addPoseKey;
  $$('[data-tour]').forEach(b=>b.onclick=()=>{const before=clone(camTrack.keys);tour(b.dataset.tour);const after=clone(camTrack.keys);pushHistory('camera tour',()=>replaceKeys('camera',null,before),()=>replaceKeys('camera',null,after));seek(0);toast('Camera move ready. Press Space to preview.');});
  $('#camera-enabled').onchange=e=>timeline.cameraEnabled=e.target.checked;
  $('#camera-smooth').onchange=e=>{camTrack.smooth=e.target.checked;updatePath();};
  $('#show-path').onchange=e=>{if(pathLine)pathLine.visible=e.target.checked;};
  $('#clear-cam').onclick=()=>{const before=clone(camTrack.keys);replaceKeys('camera',null,[]);pushHistory('clear camera keys',()=>replaceKeys('camera',null,before),()=>replaceKeys('camera',null,[]));};
  $('#camera-follow').onclick=cameraFollow;
  $('#play').onclick=()=>setPlaying(!timeline.playing);$('#stop').onclick=()=>seek(0);
  $('#preview-start').onclick=()=>{applyPendingEdits();seek(0);setPlaying(true);};
  $('#key-time').onchange=e=>seek(clamp(+e.target.value||0,0,timeline.duration));$('#key-time').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();e.target.blur();}};
  $('#loop').onchange=e=>timeline.loop=e.target.checked;
  $('#duration').onchange=e=>{const old=timeline.duration,next=clamp(+e.target.value||8,2,60);timeline.duration=next;timeline.time=Math.min(timeline.time,next);refreshTimeline();updatePath();toast('Duration '+next+'s. Keys beyond the end remain saved.');pushHistory('clip duration',()=>{timeline.duration=old;updatePath();},()=>{timeline.duration=next;updatePath();});};
  $('#delete-key').onclick=()=>{const k=state.selectedKey;if(k)deleteKey(k.type,k.index);};
  $('#auto-key').onclick=()=>{state.autoKey=!state.autoKey;$('#auto-key').classList.toggle('active',state.autoKey);toast(state.autoKey?'Auto-key ON — every edit drops a key at the playhead automatically.':'Auto-key off — edits stay drafts until Apply.');};
  $('#key-ease').onchange=e=>{
    const sel=state.selectedKey;if(!sel)return;
    const cam=sel.type==='camera',r=cam?null:(sel.owner===selected?.id?selected:null);
    if(!cam&&!r)return;
    const ease=e.target.value||undefined;
    if(cam){
      const before=clone(camTrack.keys),key=camTrack.keys[sel.index];
      if(!key)return;
      if(ease)key.ease=ease;else delete key.ease;
      camTrack.rebuild();updatePath();
      const after=clone(camTrack.keys);
      pushHistory('camera key easing',()=>replaceKeys('camera',null,before),()=>replaceKeys('camera',null,after));
    }else{
      const before=trackSnapshot(r),key=keysOf(r)[sel.index];
      if(!key)return;
      if(ease)key.ease=ease;else delete key.ease;
      applyAtTime(timeline.time,true,true);
      const after=trackSnapshot(r);
      pushHistory('key easing',()=>restoreTrack(r,before),()=>restoreTrack(r,after));
    }
    refreshTimeline();refreshInspector();refreshCameraKeys();
  };
  $('#track-area').onpointerdown=e=>{
    if(e.target.closest('.key-marker'))return;state.selectedKey=null;const area=e.currentTarget;area.setPointerCapture(e.pointerId);
    const move=ev=>{const r=area.getBoundingClientRect();seek(clamp((ev.clientX-r.left)/r.width,0,1)*timeline.duration);};move(e);
    const up=()=>{area.removeEventListener('pointermove',move);area.removeEventListener('pointerup',up);refreshTimeline();};area.addEventListener('pointermove',move);area.addEventListener('pointerup',up,{once:true});
  };

  function importSchematic(name,sch){
    const cx=Math.round(orbit.target.x),cz=Math.round(orbit.target.z);
    placeSchematic(name,sch,cx,Math.max(0,Math.ceil(world.heightAt(cx,cz))),cz);
  }
  function placeSchematic(name,sch,cx,baseY,cz){
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;
    for(const key of sch.cells.keys()){const [x,y,z]=key.split(',').map(Number);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxZ=Math.max(maxZ,z);minZ=Math.min(minZ,z);}
    const ox=cx-Math.round((minX+maxX)/2),oy=baseY-minY,oz=cz-Math.round((minZ+maxZ)/2);
    const old=new Map(),placed=new Map();
    for(const [key,type] of sch.cells){
      const [x,y,z]=key.split(',').map(Number),p=[x+ox,y+oy,z+oz];
      if(p.some(n=>Math.abs(n)>400))continue;
      const k=p.join(',');if(!old.has(k))old.set(k,world.get(...p)||null);
      placed.set(k,type);world.set(...p,type);
    }
    if(!placed.size){toast('Nothing from '+name+' could be placed here.');return;}
    world.rebuild();
    const undo=()=>{for(const [k,v] of old){const [x,y,z]=k.split(',').map(Number);world.set(x,y,z,v);}world.rebuild();};
    const redo=()=>{for(const [k,v] of placed){const [x,y,z]=k.split(',').map(Number);world.set(x,y,z,v);}world.rebuild();};
    pushHistory('import schematic '+name,undo,redo);
    toast('Imported '+placed.size.toLocaleString()+' blocks from '+name+(sch.unmapped.length?' · '+sch.unmapped.length+' unknown type(s) skipped':'')+'.');
  }
  // ── Ghost placement previews ──────────────────────────────────────────────
  function prefabLabel(a){return a.t[0].toUpperCase()+a.t.slice(1)+' '+a.n.slice(a.t.length);}
  function prefabIcon(t){
    const c={house:'#d3a06a',tree:'#5aa757',rock:'#9aa3b2',stand:'#d07a7a'}[t]||'#8fa07f';
    const shape=t==='house'?'<path d="M8 19 20 8l12 11v13H8z"/><rect x="17" y="22" width="6" height="10" fill="#1c2318"/>':t==='tree'?'<rect x="18" y="22" width="4" height="12"/><circle cx="20" cy="14" r="9"/>':t==='rock'?'<path d="M8 30 14 14l8-4 10 8-2 12z"/>':'<rect x="13" y="8" width="14" height="24" rx="5"/>';
    return 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="7" fill="#1c2318"/><g fill="'+c+'">'+shape+'</g></svg>');
  }
  function setGhostStatus(text,collision){
    const chip=$('#ghost-status');chip.hidden=false;chip.classList.toggle('is-collision',!!collision);chip.textContent=text;
  }
  function cancelGhost(){
    if(!ghostState)return;
    ghostState.dispose();ghostState=null;canvas.style.cursor='';orbit.enableZoom=true;
    $('#ghost-status').hidden=true;
  }
  function buildSchemMesh(sch){
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;
    for(const key of sch.cells.keys()){const [x,y,z]=key.split(',').map(Number);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxZ=Math.max(maxZ,z);minZ=Math.min(minZ,z);}
    const midX=Math.round((minX+maxX)/2),midZ=Math.round((minZ+maxZ)/2);
    const geo=new THREE.BoxGeometry(1,1,1),mat=new THREE.MeshLambertMaterial({transparent:true,opacity:.45,depthWrite:false});
    const mesh=new THREE.InstancedMesh(geo,mat,sch.cells.size);
    const m=new THREE.Matrix4(),col=new THREE.Color();let i=0;
    for(const [key,type] of sch.cells){
      const [x,y,z]=key.split(',').map(Number);
      m.setPosition(x-midX+.5,y-minY+.5,z-midZ+.5);mesh.setMatrixAt(i,m);
      const c=blockDefs[type]?.color;col.setRGB(c?c[0]:.62,c?c[1]:.72,c?c[2]:.55);mesh.setColorAt(i,col);i++;
    }
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.instanceMatrix.needsUpdate=true;mesh.frustumCulled=false;
    return {mesh,geo,mat,mid:[midX,minY,midZ]};
  }
  function ghostSetMesh(g,built){
    if(g.built){g.group.remove(g.built.mesh);g.built.geo.dispose();g.built.mat.dispose();}
    g.built=built;g.mid=built?built.mid:null;
    if(built)g.group.add(built.mesh);
  }
  function startSchemGhost(name,sch){
    cancelGhost();touchClosePanels();
    const group=new THREE.Group();group.visible=false;helpers.add(group);
    const st={kind:'schem',name,sch,group,built:null,yOffset:0,rot:0,anchor:null,lastAnchor:null,collisions:0,
      dispose(){helpers.remove(group);if(st.built){group.remove(st.built.mesh);st.built.geo.dispose();st.built.mat.dispose();st.built=null;}}};
    ghostSetMesh(st,buildSchemMesh(sch));
    ghostState=st;
    canvas.style.cursor='copy';orbit.enableZoom=false;
    toast('Ghost ready for '+name+' — click the world to build it. Wheel = height, R = rotate, right-click or Esc cancels.');
  }
  function startPropGhost(asset){
    cancelGhost();touchClosePanels();
    let root;try{root=makeTool(asset,1.2);}catch(e){toast('Could not build a preview for '+asset+'.');return;}
    const clones=[];
    root.traverse(o=>{if(o.isMesh){
      const list=Array.isArray(o.material)?o.material:[o.material];
      const ghostMats=list.map(mm=>{const g=mm.clone();g.transparent=true;g.opacity=.45;g.depthWrite=false;clones.push(g);return g;});
      o.material=Array.isArray(o.material)?ghostMats:ghostMats[0];o.castShadow=false;o.receiveShadow=false;
    }});
    const group=new THREE.Group();group.add(root);group.visible=false;helpers.add(group);
    ghostState={kind:'prop',asset,group,built:null,yOffset:0,rot:0,anchor:null,lastAnchor:null,collisions:0,
      dispose(){helpers.remove(group);for(const g of clones)g.dispose();}};
    canvas.style.cursor='copy';orbit.enableZoom=false;
    toast('Ghost ready for '+asset+' — click the world to place it. Wheel = height, right-click or Esc cancels.');
  }
  function rotateGhost(){
    const g=ghostState;if(!g||g.kind!=='schem'||!g.built)return;
    let maxZ=-Infinity;
    for(const key of g.sch.cells.keys()){const z=+key.split(',')[2];if(z>maxZ)maxZ=z;}
    const next=new Map();
    for(const [key,type] of g.sch.cells){const p=key.split(',').map(Number);next.set((maxZ-p[2])+','+p[1]+','+p[0],type);}
    g.sch.cells=next;g.rot=(g.rot+90)%360;
    ghostSetMesh(g,buildSchemMesh(g.sch));
    if(g.anchor){g.group.position.set(g.anchor[0],g.anchor[1]+g.yOffset,g.anchor[2]);g.group.visible=true;}
    g.lastAnchor=null;updateGhostStatus();
    toast('Rotated to '+g.rot+'°');
  }
  function updateGhost(e){
    if(!ghostState)return;
    const hit=sceneHit(e);if(!hit)return;
    const g=ghostState;
    const ax=Math.round(hit.point.x),az=Math.round(hit.point.z);
    const ay=g.kind==='schem'?Math.max(0,Math.ceil(world.heightAt(ax,az))):world.heightAt(ax,az);
    if(!g.anchor||g.anchor[0]!==ax||g.anchor[1]!==ay||g.anchor[2]!==az){g.anchor=[ax,ay,az];g.lastAnchor=null;}
    applyGhostOffset();
  }
  function applyGhostOffset(){
    const g=ghostState;if(!g||!g.anchor)return;
    g.group.position.set(g.anchor[0],g.anchor[1]+g.yOffset,g.anchor[2]);g.group.visible=true;
    updateGhostStatus();
  }
  function updateGhostStatus(){
    const g=ghostState;if(!g||!g.anchor)return;
    const ax=g.anchor[0],az=g.anchor[2],y=g.anchor[1]+g.yOffset;
    let hits=0;
    if(g.kind==='schem'&&g.built){
      const sig=ax+','+y+','+az+','+g.rot;
      if(sig!==g.lastAnchor){
        g.lastAnchor=sig;
        for(const key of g.sch.cells.keys()){const p=key.split(',').map(Number);if(world.get(p[0]-g.mid[0]+ax,p[1]-g.mid[1]+y,p[2]-g.mid[2]+az))hits++;}
        g.collisions=hits;
        g.built.mat.color.setHex(hits?0xff9a85:0xffffff);
        g.built.mat.opacity=hits?.32:.45;
        g.built.mat.emissive.setHex(hits?0x5c0a05:0x000000);
      }else hits=g.collisions;
    }
    setGhostStatus(hits?hits.toLocaleString()+' destination blocks overlap — placing replaces them'
      :'Ready at '+ax+', '+y+', '+az+(g.yOffset?' · wheel offset '+g.yOffset:'')+' · click = place · wheel = height'+(g.kind==='schem'?' · R = rotate':'')+' · right-click or Esc = cancel',hits>0);
  }
  function commitGhost(){
    const g=ghostState;if(!g)return;
    let ax,ay,az;
    if(g.anchor){ax=g.anchor[0];ay=g.anchor[1]+g.yOffset;az=g.anchor[2];}
    else{ax=Math.round(orbit.target.x);az=Math.round(orbit.target.z);ay=Math.max(0,Math.ceil(world.heightAt(ax,az)))+g.yOffset;}
    if(g.kind==='schem'){const name=g.name,sch=g.sch;cancelGhost();placeSchematic(name,sch,ax,ay,az);}
    else{const asset=g.asset;cancelGhost();added(addProp('tool',new THREE.Vector3(ax,ay,az),{asset}));setMode('rotate');}
  }
  async function handleFiles(files){
    if(importBusy)return;importBusy=true;
    try{
      for(const f of [...files]){
        if(f.size>20*1024*1024){toast(f.name+': please use a file under 20 MB.');continue;}
        const SCHEMATIC_EXT=/\.(json|schem(atic)?|vf|vfsh|bloxd|bloxdschem|bloxsd|bschem)$/i;
        const u8=new Uint8Array(await f.arrayBuffer());
        const magic=isBloxdschem(u8);
        if(magic||SCHEMATIC_EXT.test(f.name)||/^[{[]/.test(new TextDecoder().decode(u8.subarray(0,64)).trimStart())){
          const r=readSchematicFile(f.name,u8);
          if(r?.sch){startSchemGhost(f.name,r.sch);continue;}
          if(magic||SCHEMATIC_EXT.test(f.name)){toast(f.name+': '+(r?.error||'no usable block list found inside.'));continue;}
        }
        toast('Importing '+f.name+'…');
        try{
          const result=await parseModel(f.name,await f.arrayBuffer()),r=register(result.root,'import',result.root.name,{animations:result.animations});r.root.position.copy(spawnPosition());added(r);focusObject(r);
        }catch(e){toast('Import failed: '+e.message);}
      }
    }finally{importBusy=false;$('#file').value='';}
  }
  $('#import-btn').onclick=()=>$('#file').click();$('#file').onchange=e=>handleFiles(e.target.files);
  $('#import-schematic').onclick=()=>$('#schematic-file').click();
  $('#schematic-file').onchange=e=>{if(e.target.files.length)handleFiles(e.target.files);e.target.value='';};
  let dragDepth=0;
  addEventListener('dragenter',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();dragDepth++;$('#drop-overlay').hidden=false;}});
  addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault();});
  addEventListener('dragleave',()=>{dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('#drop-overlay').hidden=true;});
  addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('#drop-overlay').hidden=true;if(e.dataTransfer?.files.length)handleFiles(e.dataTransfer.files);});
  $('#vox-res').oninput=e=>$('#vox-value').textContent=e.target.value;
  $('#voxelize').onclick=()=>{
    const r=selected;if(!r||r.type!=='import')return;toast('Converting model to voxels…');
    setTimeout(()=>{try{
      if(r.mixer)r.mixer.stopAllAction();const root=voxelise(r.root,+$('#vox-res').value),rec=register(root,'voxel',r.name+' · voxels');detachRecord(r);selectObject(rec);
      pushHistory('voxelise model',()=>{detachRecord(rec);attachRecord(r);},()=>{detachRecord(r);attachRecord(rec);});toast('Converted to '+root.children[0].count.toLocaleString()+' cubes.');
    }catch(e){toast(e.message);}},50);
  };
  $('#model-anim').onchange=e=>{
    const r=selected;if(!r?.animations?.length)return;r.animPlaying=e.target.checked;
    if(!r.mixer){r.mixer=new THREE.AnimationMixer(r.root);r.action=r.mixer.clipAction(r.animations[0]);r.action.play();}
    r.action.paused=!r.animPlaying;
  };
  $('#load-skin').onclick=()=>$('#skin-file').click();
  $('#skin-file').onchange=async e=>{
    const file=e.target.files[0],r=selected;if(!file||!r?.character)return;
    try{if(file.size>4e6)throw new Error('Use a PNG under 4 MB.');const data=await readDataURL(file),texture=pixelTexture(await new THREE.TextureLoader().loadAsync(data));
      if(texture.image.width!==64||texture.image.height!==64)throw new Error('Use a standard 64 × 64 character skin PNG.');
      const before=r.character.material.map,oldData=r.character.skinData;
      r.character.material.map=texture;r.character.skinData=data;r.character.material.needsUpdate=true;
      pushHistory('load skin',()=>{r.character.material.map=before;r.character.skinData=oldData;r.character.material.needsUpdate=true;},()=>{r.character.material.map=texture;r.character.skinData=data;r.character.material.needsUpdate=true;});toast('Skin applied to '+r.name);
    }catch(err){toast(err.message);}e.target.value='';
  };
  $('#export-model').onclick=async()=>{
    const r=selected;if(!r)return;const oldMarkers=r.character?.markers.visible;
    try{
      if(r.character)r.character.markers.visible=false;r.root.updateMatrixWorld(true);
      const data=await new GLTFExporter().parseAsync(selectedTarget(),{binary:true,onlyVisible:true,animations:r.animations||[]});
      download(new Blob([data],{type:'model/gltf-binary'}),safeName(r.name)+'.glb');toast('GLB exported with named, editable parts.');
    }catch(e){toast('Could not export model: '+e.message);}finally{if(r.character)r.character.markers.visible=oldMarkers;}
  };

  function setSceneName(name){sceneName=String(name||'Maple clearing').slice(0,80);$('#project-scene-name').firstChild.nodeValue=sceneName;$('#scene-title').firstChild.nodeValue=sceneName;}

  // AI snapshots contain scene metadata, never asset bytes, audio, or credentials.
  function captureAIScene(){
    return{serial,sceneName,world:{blocks:[...world.map],size:world.size,seed:world.seed},objects:objects.map(r=>{
      const d={id:r.id,type:r.type,name:r.name,transform:transformOf(r.root),options:clone(r.options||{}),rotationMode:r.rotationMode||'shortest',keys:clone(r.keys||[]),draft:r.draft?clone(r.draft):null,animPlaying:!!r.animPlaying,mixerTime:r.mixer?.time||0};
      if(r.character){const c=r.character;d.character={pose:copyPose(c.displayPose),keys:clone(c.keys),tool:c.tool,held:heldOf(c),preset:c.preset,live:c.live,manual:c.manual,speed:c.speed,markers:c.markers.visible};}return d;
    }),light:clone(light),camera:{keys:clone(camTrack.keys),smooth:camTrack.smooth,view:{position:camera.position.toArray(),target:orbit.target.toArray(),fov:camera.fov}},timeline:{...timeline,playing:false},selection:{id:selected?.id||null,scope:state.scope,joint:state.joint},mode:state.mode};
  }
  function createAIRecord(data){
    let root,character;
    if(data.type==='character'){character=createCharacter(data.name);root=character.root;}
    else if(data.type==='tool')root=makeTool(data.options.asset,1.2);
    else if(data.type==='block')root=makeBlock(data.options.block);
    else if(data.type==='tree')root=createTree(!!data.options.autumn);
    else if(data.type==='rock')root=createRock();
    else if(data.type==='lamp')root=makeLamp();
    else throw new Error('AI cannot create this object type.');
    root.name=data.name;root.userData.studioId=data.id;return{id:data.id,type:data.type,name:data.name,root,character,options:clone(data.options||{}),keys:[],draft:null,rotationMode:data.rotationMode==='spins'?'spins':'shortest'};
  }
  function restoreAIScene(snapshot,registry){
    setPlaying(false);gizmo.detach();objectGroup.clear();objects.length=0;
    for(const d of snapshot.objects){
      const r=registry.get(d.id);if(!r||r.type!==d.type)throw new Error('Scene object could not be restored.');
      r.name=r.root.name=d.name;r.options=clone(d.options||{});r.rotationMode=d.rotationMode==='spins'?'spins':'shortest';r.keys=clone(d.keys||[]);r.draft=d.draft?clone(d.draft):null;r.animPlaying=!!d.animPlaying;
      if(r.mixer){if(r.action)r.action.paused=!r.animPlaying;r.mixer.setTime(d.mixerTime||0);}
      setTransform(r.root,d.transform);
      if(r.character){const c=r.character,a=d.character;c.keys=clone(a.keys);c.pose=copyPose(a.pose);c.preset=a.preset;c.live=!!a.live;c.manual=a.manual!==false;c.speed=a.speed||1;c.markers.visible=!!a.markers;if(c.tool!==a.tool||!c.mount.children.length&&a.tool!=='none')equip(c,a.tool);setHeld(c,a.held);applyPose(c,c.pose);}
      objects.push(r);objectGroup.add(r.root);
    }
    serial=Math.max(serial,snapshot.serial);world.map=new Map(snapshot.world.blocks);world.size=snapshot.world.size;world.seed=snapshot.world.seed;world.rebuild();
    Object.assign(light,clone(snapshot.light));updateLight();syncLightUI();camTrack.keys=clone(snapshot.camera.keys);camTrack.smooth=snapshot.camera.smooth;camTrack.rebuild();
    Object.assign(timeline,snapshot.timeline,{playing:false});viewOverride=true;setSceneName(snapshot.sceneName);
    const damping=orbit.enableDamping;orbit.enableDamping=false;orbit.update();orbit.enableDamping=damping;
    setCamera({position:new THREE.Vector3(...snapshot.camera.view.position),target:new THREE.Vector3(...snapshot.camera.view.target),fov:snapshot.camera.view.fov});
    const picked=objects.find(r=>r.id===snapshot.selection?.id)||objects[0]||null;selectObject(picked,snapshot.selection?.scope||'root',snapshot.selection?.joint||'head');setMode(snapshot.mode||'select');updatePath();refreshAll();syncFov();syncAudioUI();
  }
  function applyAIPlan(result,expected,origin){
    if(recording)throw new Error('Stop video recording before applying scene changes.');
    const before=captureAIScene();if(JSON.stringify(before)!==expected)throw new Error('The scene changed after review. Validate the plan again before applying.');
    const registry=new Map(objects.map(r=>[r.id,r]));
    // Prepare all new roots off-scene. Validation/creation failures leave the current scene untouched.
    for(const d of result.next.objects)if(!registry.has(d.id))registry.set(d.id,createAIRecord(d));
    try{restoreAIScene(result.next,registry);}catch(e){restoreAIScene(before,registry);throw new Error('Could not apply the plan; previous scene restored. '+e.message);}
    const after=captureAIScene(),entry=pushHistory(origin+': '+result.title,()=>restoreAIScene(before,registry),()=>restoreAIScene(after,registry));
    toast(result.stats.commands+' scene commands applied · Undo restores the previous scene');return entry;
  }

  // Self-contained project files. AI credentials are never part of this data.
  function serializeRecord(r){
    const data={name:r.name,type:r.type,transform:transformOf(r.root),options:r.options||{},rotationMode:r.rotationMode||'shortest'};if(r.draft)data.draft=clone(r.draft);
    if(r.character){const c=r.character;data.character={pose:copyPose(c.displayPose),keys:clone(c.keys),tool:c.tool,held:heldOf(c),preset:c.preset,live:c.live,skin:c.skinData||null};}
    else if(r.type==='import'||r.type==='voxel')data.object=r.root.toJSON();
    if(!r.character)data.keys=clone(r.keys||[]);return data;
  }
  function projectData(){return{format:'bloxd-studio',version:2,editorVersion:'4.0.0',sceneName,audio:{...clone(soundtrack.state),preview:$('#preview-audio').checked,includeVideo:$('#record-audio').checked},world:{blocks:[...world.map],size:world.size,seed:world.seed},objects:objects.map(serializeRecord),light:clone(light),camera:{keys:clone(camTrack.keys),smooth:camTrack.smooth,view:{position:camera.position.toArray(),target:orbit.target.toArray(),fov:camera.fov}},timeline:{...timeline,playing:false}};}
  async function recordFromData(data){
    if(!data||!['character','tree','rock','lamp','tool','block','import','voxel'].includes(data.type))throw new Error('Unknown object type.');
    const vec=v=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<1000);
    if(!data.transform||!vec(data.transform.position)||!vec(data.transform.rotation)||!vec(data.transform.scale))throw new Error('Invalid object transform.');
    let r;
    if(data.type==='character'){
      const cdata=data.character||{},c=createCharacter(String(data.name).slice(0,60));
      if(cdata.skin){if(!String(cdata.skin).startsWith('data:image/'))throw new Error('Only embedded skin images are supported.');c.material.map=pixelTexture(await new THREE.TextureLoader().loadAsync(cdata.skin));c.skinData=cdata.skin;}
      c.pose=copyPose(cdata.pose||neutralPose());c.keys=clone(cdata.keys||[]);c.preset=cdata.preset||'idle';c.live=!!cdata.live;applyPose(c,c.pose);equip(c,toolNames.includes(cdata.tool)?cdata.tool:'none');setHeld(c,cdata.held);r=register(c.root,'character',String(data.name).slice(0,60),{character:c});
    }else if(data.type==='import'||data.type==='voxel'){
      for(const image of data.object?.images||[]){const urls=Array.isArray(image.url)?image.url:[image.url];if(urls.some(u=>typeof u==='string'&&!u.startsWith('data:')))throw new Error('Projects must embed their textures, not link to external files.');}
      const root=await new THREE.ObjectLoader().parseAsync(data.object);r=register(root,data.type,String(data.name).slice(0,60),{animations:root.animations||[]});
    }else{r=addProp(data.type,new THREE.Vector3(),data.options||{});r.name=r.root.name=String(data.name).slice(0,60);}
    setTransform(r.root,data.transform);r.rotationMode=data.rotationMode==='spins'?'spins':'shortest';if(!r.character)r.keys=clone(data.keys||[]);r.draft=validateDraft(data.draft,poseState(r));return r;
  }
  async function loadProject(data){
    finishInputEdit();
    if(data?.format!=='bloxd-studio'||![1,2].includes(data.version))throw new Error('This is not a Bloxd Studio project file.');
    if(!Array.isArray(data.world?.blocks)||data.world.blocks.length>50000||!Array.isArray(data.objects)||data.objects.length>1000)throw new Error('Invalid or oversized scene.');
    for(const[k,type]of data.world.blocks){const xyz=String(k).split(',').map(Number);if(xyz.length!==3||xyz.some(n=>!Number.isInteger(n)||Math.abs(n)>100)||!blockDefs[resolveBlock(type)]?.available)throw new Error('Invalid or unavailable terrain data.');}
    if(!data.camera?.keys?.every(k=>Number.isFinite(k.time)&&Number.isFinite(k.fov)&&k.position?.every(Number.isFinite)&&k.target?.every(Number.isFinite)))throw new Error('Invalid camera keys.');
    const oldObjects=objects.slice(),newObjects=[];
    try{for(const d of data.objects){const rec=await recordFromData(d);if(data.version===1&&d.type==='tool'){const matrix=rec.root.matrix.clone(),stand=addProp('block',new THREE.Vector3(0,.375,0).applyMatrix4(matrix),{block:'log',name:rec.name+' stand'});stand.root.rotation.copy(rec.root.rotation);stand.root.scale.copy(rec.root.scale).multiplyScalar(.75);newObjects.push(stand);rec.root.position.set(0,1.43,0).applyMatrix4(matrix);}newObjects.push(rec);}await soundtrack.loadState(data.audio||{source:'builtin',volume:.7,offset:0,loop:false});}
    catch(e){for(const r of objects.slice())if(!oldObjects.includes(r))detachRecord(r);throw e;}
    setPlaying(false);gizmo.detach();for(const r of oldObjects){objectGroup.remove(r.root);objects.splice(objects.indexOf(r),1);}
    world.map=new Map(data.world.blocks.map(([key,type])=>[key,resolveBlock(type)]));world.size=data.world.size||18;world.seed=data.world.seed||42;world.rebuild();
    for(const k of Object.keys(light))if(k in(data.light||{}))light[k]=data.light[k];updateLight();syncLightUI();
    camTrack.keys=clone(data.camera.keys);camTrack.smooth=data.camera.smooth!==false;camTrack.rebuild();
    timeline.duration=clamp(+data.timeline?.duration||8,2,60);timeline.time=clamp(+data.timeline?.time||0,0,timeline.duration);timeline.loop=!!data.timeline?.loop;timeline.cameraEnabled=data.timeline?.cameraEnabled!==false;
    if(data.camera.view)setCamera({position:new THREE.Vector3().fromArray(data.camera.view.position),target:new THREE.Vector3().fromArray(data.camera.view.target),fov:data.camera.view.fov});
    $('#preview-audio').checked=!!data.audio?.preview;$('#record-audio').checked=data.audio?.includeVideo!==false;syncAudioUI();
    history.length=0;future.length=0;viewOverride=true;setSceneName(data.sceneName);selectObject(newObjects.find(r=>r.character)||newObjects[0]||null);updatePath();refreshAll();syncFov();toast('Project opened. Everything stays in your browser.');
  }
  $('#save-project').onclick=()=>{try{applyPendingEdits();download(new Blob([JSON.stringify(projectData())],{type:'application/json'}),safeName(sceneName)+'.bloxd.json');toast('Project saved. Open the JSON here to continue later.');}catch(e){toast('Could not save: '+e.message);}};
  $('#open-project').onclick=()=>$('#project-file').click();$('#project-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>40e6)throw new Error('Project is too large (40 MB limit).');await loadProject(JSON.parse(await file.text()));}catch(err){toast('Could not open project: '+err.message);}e.target.value='';};

  function syncAudioUI(){
    const a=soundtrack.state;$('#audio-source').value=a.source;$('#audio-source option[value=import]').disabled=!soundtrack.decoded;
    $('#sound-volume').value=a.volume;$('#sound-volume-value').textContent=Math.round(a.volume*100)+'%';$('#audio-offset').value=a.offset;$('#audio-loop').checked=a.loop;
    $('#audio-file-name').textContent=a.name||'MP3, WAV or OGG · up to 15 MB';$('#import-audio-options').hidden=a.source!=='import';$('#audio-duration').textContent=timeline.duration.toFixed(1)+' s clip';
  }
  function audioChanged(){soundtrack.stopPreview();soundtrack.invalidate();syncAudioUI();if(timeline.playing&&$('#preview-audio').checked)soundtrack.preview(timeline.time,timeline.duration).catch(e=>toast(e.message));}
  $('#audio-source').onchange=e=>{soundtrack.state.source=e.target.value;audioChanged();};
  $('#sound-volume').oninput=e=>{soundtrack.state.volume=+e.target.value;audioChanged();};
  $('#audio-offset').onchange=e=>{soundtrack.state.offset=clamp(+e.target.value||0,0,60);audioChanged();};
  $('#audio-loop').onchange=e=>{soundtrack.state.loop=e.target.checked;audioChanged();};
  $('#preview-audio').onchange=e=>{if(!e.target.checked)soundtrack.stopPreview();else if(timeline.playing)soundtrack.preview(timeline.time,timeline.duration).catch(e=>toast(e.message));};
  $('#load-audio').onclick=()=>$('#audio-file').click();
  $('#audio-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const duration=await soundtrack.loadFile(file);syncAudioUI();toast('Audio imported: '+duration.toFixed(1)+' seconds. Stored locally in your project.');}catch(err){toast('Could not decode audio: '+err.message);}e.target.value='';};
  $('#preview-sound').onclick=()=>soundtrack.preview(0,timeline.duration).catch(e=>toast(e.message));$('#stop-sound').onclick=()=>soundtrack.stopPreview();
  $('#export-mp3').onclick=async()=>{
    const button=$('#export-mp3');if(button.disabled)return;button.disabled=true;setPlaying(false);
    try{const duration=timeline.duration,blob=await soundtrack.mp3(duration,p=>{$('#record-state').textContent='Encoding real MP3 audio… '+Math.round(p*100)+'%';});download(blob,'Maple-clearing-soundtrack.mp3');$('#record-state').textContent='MP3 saved: '+duration.toFixed(1)+' seconds of audio. Use Record video for the moving picture.';toast('MP3 soundtrack downloaded — audio only.');}
    catch(e){toast('Could not export MP3: '+e.message);$('#record-state').textContent=e.message;}finally{button.disabled=false;}
  };

  function cleanRender(){
    const visible=helpers.visible,markerStates=objects.filter(r=>r.character).map(r=>[r.character.markers,r.character.markers.visible]);
    helpers.visible=false;markerStates.forEach(([m])=>m.visible=false);renderer.render(scene,camera);helpers.visible=visible;markerStates.forEach(([m,v])=>m.visible=v);
  }
  function captureStill(){
    try{cleanRender();canvas.toBlob(b=>{if(b){download(b,'Maple-clearing.png');toast('Clean PNG frame saved.');}},'image/png');$('#export-dialog').close();}catch(e){toast('Capture failed: '+e.message);}
  }
  let videoResult=null;
  function videoBusy(busy){
    for(const id of ['rec','shot','export-mp3','video-format','video-size','video-fps','record-audio','audio-source','load-audio','sound-volume','audio-offset','audio-loop','preview-sound'])$('#'+id).disabled=busy;
    $('#video-progress').hidden=!busy;$('#record-overlay').hidden=true;
  }
  function videoProgress(info){
    const total=info.total||0,fraction=total?info.frame/total:info.time/info.duration;
    $('#video-progress-bar').value=info.phase==='finalize'?1:fraction;
    $('#video-progress-label').textContent=info.phase==='finalize'?'Finishing the video file…':info.method==='frames'?'Rendering frame '+info.frame+' / '+total+' · '+Math.round(fraction*100)+'%':'Capturing '+info.time.toFixed(1)+' / '+info.duration.toFixed(1)+' s';
  }
  function stopRecording(){if(recording){recording.controller.abort();$('#video-progress-label').textContent='Cancelling and restoring the editor…';}}
  function retainVideo(result){
    const preview=$('#video-preview');preview.pause();preview.removeAttribute('src');preview.load();
    if(videoResult?.url)URL.revokeObjectURL(videoResult.url);
    const filename=safeName(sceneName)+'-animation.'+result.format,url=URL.createObjectURL(result.blob);videoResult={...result,filename,url};
    preview.poster=result.poster||'';preview.src=url;$('#video-ready').hidden=false;
    const link=$('#video-download');link.href=url;link.download=filename;$('#video-download-label').textContent='Download '+result.format.toUpperCase();
    $('#video-filename').textContent=filename;$('#video-info').textContent=result.width+' × '+result.height+' · '+result.fps+(result.method==='frames'?' fps · ':' fps target · ')+result.duration.toFixed(2)+' s · '+(result.blob.size/1048576).toFixed(2)+' MB';
    $('#video-download-note').textContent=(result.hasAudio?'Sound included. ':'Silent video. ')+(result.method==='frames'?'Frame-by-frame export. ':'Real-time compatibility capture. ')+'Click Download; you can download again without rendering again.';
    $('#record-state').textContent='Video ready. Click the Download button above to save it. No automatic download was attempted.';toast('Video ready — click Download to save it.');
  }
  $('#video-download').addEventListener('click',()=>{$('#video-download-note').textContent='Download requested. If nothing appears, your preview/browser may block downloads: use the live app in its own tab or open the downloaded editor in Chrome / Edge. The clip stays available here.';});
  $('#video-preview').addEventListener('error',()=>{if(videoResult)$('#video-download-note').textContent='This browser/preview could not play the file. Try Download, or render WebM / open the editor in a full browser. The finished clip is still retained.';});
  async function startRecording(){
    if(recording)return;if(importBusy){toast('Wait for the model import to finish before exporting.');return;}
    finishInputEdit();setPlaying(false);applyPendingEdits();soundtrack.stopPreview();$('#video-preview').pause();
    const [width,height]=$('#video-size').value.split('x').map(Number),fps=+$('#video-fps').value,duration=timeline.duration,withAudio=$('#record-audio').checked&&soundtrack.state.source!=='silent';
    const controller=new AbortController(),saved={time:timeline.time,viewOverride,view:{position:camera.position.toArray(),target:orbit.target.toArray(),fov:camera.fov},ratio:renderer.getPixelRatio(),orbitEnabled:orbit.enabled,gizmoEnabled:gizmo.enabled,actors:objects.map(r=>({r,state:actorSnapshot(r),manual:r.character?.manual,live:r.character?.live,preset:r.character?.preset,speed:r.character?.speed,mixerTime:r.mixer?.time,actionPaused:r.action?.paused}))};
    recording={controller,width,height};videoBusy(true);$('#video-progress-bar').value=0;$('#video-progress-label').textContent='Checking video encoders…';$('#video-progress-note').textContent='The scene is temporarily locked while frames are rendered.';$('#record-state').textContent='Preparing a video of the complete timeline…';$('#video-ready').hidden=true;
    let poster='';
    try{
      if(withAudio)soundtrack.context().resume().catch(()=>{});
      const config=await chooseVideoConfig({format:$('#video-format').value,width,height,fps,withAudio,signal:controller.signal});
      $('#video-progress-note').textContent=config.notice||(config.format.toUpperCase()+' · exact timeline frame timestamps · all processing stays in your browser.');
      renderer.setPixelRatio(1);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();orbit.enabled=false;gizmo.enabled=false;viewOverride=false;
      const drawFrame=time=>{if(renderer.getContext().isContextLost())throw new Error('The 3D graphics context was lost. Save your project, reload, and try a lower resolution / smaller scene.');applyAtTime(time,true);setWaterTime(time);for(const r of objects)if(r.mixer&&r.animPlaying)r.mixer.setTime(time);cleanRender();if(!poster)poster=canvas.toDataURL('image/jpeg',.85);};
      const opts={canvas,duration,config,drawFrame,signal:controller.signal,onProgress:videoProgress,title:sceneName};
      const result=config.method==='frames'?await renderVideoFrames({...opts,audioBuffer:withAudio?soundtrack.audioBuffer(duration):null}):await renderRealtimeVideo({...opts,audioFactory:withAudio?()=>soundtrack.recordingStream(duration,false):null});
      retainVideo({...result,poster});
    }catch(e){
      const cancelled=controller.signal.aborted||e.name==='AbortError';$('#record-state').textContent=cancelled?'Export cancelled. No new file was created.':'Could not render video: '+e.message;
      $('#video-ready').hidden=!videoResult;if(videoResult)$('#video-download-note').textContent='Your previous finished clip is still available to download.';toast(cancelled?'Video export cancelled.':'Video export failed. See the message in Export.');
    }finally{
      // Export is sampling, not editing. Restore the user's actual frame/view,
      // live-preset flags and embedded model animation after success or cancel.
      for(const a of saved.actors){if(a.r.mixer){if(a.r.action)a.r.action.paused=false;a.r.mixer.setTime(a.mixerTime||0);if(a.r.action)a.r.action.paused=a.actionPaused;}applyActorState(a.r,a.state);a.r.draft=a.state.draft?clone(a.state.draft):null;if(a.r.character){a.r.character.manual=a.manual;a.r.character.live=a.live;a.r.character.preset=a.preset;a.r.character.speed=a.speed;}}
      timeline.time=saved.time;timeline.playing=false;viewOverride=saved.viewOverride;recording=null;renderer.setPixelRatio(saved.ratio);
      setCamera({position:new THREE.Vector3(...saved.view.position),target:new THREE.Vector3(...saved.view.target),fov:saved.view.fov});orbit.enabled=saved.orbitEnabled;gizmo.enabled=saved.gizmoEnabled;
      resize();updateTimeUI();refreshInspector();syncFov();videoBusy(false);cleanRender();
      if(videoResult&&$('#export-dialog').open)requestAnimationFrame(()=>{if($('#export-dialog').open)$('#video-ready').scrollIntoView({block:'nearest'});});
    }
  }
  $('#sandbox-note').hidden=window.self===window.top;
  $('#open-export').onclick=()=>{if(recording){toast('Finish or cancel the current video export.');return;}setPlaying(false);syncAudioUI();$('#export-dialog').showModal();};$('#shot').onclick=captureStill;$('#rec').onclick=startRecording;$('#stop-record').onclick=stopRecording;$('#cancel-video').onclick=stopRecording;
  $('#export-dialog').addEventListener('cancel',e=>{if(recording){e.preventDefault();stopRecording();}});
  $('#export-dialog').addEventListener('close',()=>{$('#video-preview').pause();if(recording)stopRecording();});
  $('#help-btn').onclick=()=>$('#help-dialog').showModal();$('#credits-btn').onclick=()=>$('#help-dialog').showModal();
  $$('.dialog-close').forEach(b=>b.onclick=()=>b.closest('dialog').close());
  $$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
  function toggleClean(){state.clean=!state.clean;document.body.classList.toggle('clean',state.clean);helpers.visible=!state.clean;for(const r of objects){const m=r.character?.markers;if(!m)continue;if(state.clean){m.userData.previousVisible=m.visible;m.visible=false;}else m.visible=!!m.userData.previousVisible;}resize();}
  $('#clean-view').onclick=toggleClean;$('#clean-return').onclick=toggleClean;
  addEventListener('keydown',e=>{
    if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)||document.activeElement.isContentEditable)return;
    if($$('dialog').some(d=>d.open))return;
    const k=e.key.toLowerCase();
    if(k==='escape'&&ghostState){cancelGhost();toast('Placement canceled.');return;}
    if(k==='r'&&ghostState){e.preventDefault();rotateGhost();return;}
    if(k==='escape'&&state.pathMode){setPathMode(false);toast('Walk path canceled.');return;}
    if(k==='enter'&&state.pathMode){e.preventDefault();bakePath();return;}
    if((e.ctrlKey||e.metaKey)&&k==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}
    if((e.ctrlKey||e.metaKey)&&k==='d'){e.preventDefault();duplicateSelected();return;}
    if((e.ctrlKey||e.metaKey)&&k==='s'){e.preventDefault();$('#save-project').click();return;}
    if(e.code==='Space'){e.preventDefault();setPlaying(!timeline.playing);}
    if(k==='h')toggleClean();if(k==='f')focusObject(selected);if(k==='/'){e.preventDefault();document.body.classList.add('panel-library');syncDock();$('#asset-search').focus();}
    if(k==='b'){state.category='blocks';setMode('build');refreshLibrary();}if(k==='x'){state.category='blocks';setMode('erase');refreshLibrary();}
    if(k==='t'){state.category='blocks';setMode(state.mode==='terrain'?'build':'terrain');refreshLibrary();}
    if(k==='escape'&&(document.body.classList.contains('panel-library')||document.body.classList.contains('panel-inspector')||document.body.classList.contains('panel-timeline'))){closePanels();return;}
    if(k==='v'||k==='escape')setMode('select');if(k==='w')setMode('translate');if(k==='e')setMode('rotate');if(k==='r')setMode('scale');
    if(k==='delete'||k==='backspace'){e.preventDefault();if(state.selectedKey)deleteKey(state.selectedKey.type,state.selectedKey.index);else deleteObject();}
  });

  function resize(){
    const width=viewport.clientWidth,height=viewport.clientHeight;if(!width||!height)return;
    if(!recording){renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
    $('#viewport-size').textContent=`${canvas.width} × ${canvas.height}`;
  }
  new ResizeObserver(resize).observe(viewport);addEventListener('resize',resize);resize();
  // Tiny asset thumbnail is sampled from our recreated skin, not the reference screenshot.
  {const c=document.createElement('canvas');c.width=c.height=8;c.getContext('2d').drawImage(textures.bob.image,8,8,8,8,0,0,8,8);skinThumb=c.toDataURL();}
  updateLight();syncLightUI();syncAudioUI();selectObject(bob);showInspector('object');refreshAll();syncFov();historyUI();
  const clock=new THREE.Clock();let timeSinceStart=0,waterClock=0;
  function animate(){
    requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.25),aiOpen=$('#ai-dialog').open;frames++;if(recording)return;timeSinceStart+=dt;waterClock=timeline.playing?timeline.time:waterClock+dt;setWaterTime(waterClock);if(!timeline.playing)updateAssetAnimations(timeSinceStart);
    if(timeline.playing){
      const now=performance.now();timeline.time+=Math.max(0,(now-playbackLast)/1000);playbackLast=now;
      if(timeline.time>=timeline.duration){
        if(timeline.loop){timeline.time%=timeline.duration;if($('#preview-audio').checked&&!recording)soundtrack.preview(timeline.time,timeline.duration).catch(()=>{});}
        else{timeline.time=timeline.duration;applyAtTime(timeline.time);setPlaying(false);}
      }
      applyAtTime(timeline.time);updateTimeUI();
    }else{
      for(const r of objects){const c=r.character;if(c&&c.live&&!aiOpen)applyPose(c,presetPose(c.preset,timeSinceStart*c.speed,true));}
      if(orbit.enabled&&!gizmo.dragging&&!aiOpen)orbit.update();
    }
    for(const r of objects){if(r.mixer&&r.animPlaying&&!aiOpen)r.mixer.update(dt);if(r.character?.markers.visible)applyPose(r.character,r.character.displayPose);}
    updateOnion();
    if(selected){
      ring.visible=!!selected.character;ring.position.set(selected.root.position.x,world.heightAt(selected.root.position.x,selected.root.position.z)+.013,selected.root.position.z);ring.scale.setScalar(selected.root.scale.x);
      selectionBox.visible=!selected.character&&!timeline.playing;if(selectionBox.visible)selectionBox.setFromObject(selected.root);
    }else{ring.visible=selectionBox.visible=false;}
    renderer.render(scene,camera);
  }
  animate();
  $('#loader').classList.add('gone');setTimeout(()=>$('#loader').remove(),500);
  // ── Dock: small round buttons open the studio menus as drawers ──
  function syncDock(){$$('.dock-btn[data-panel]').forEach(b=>{const on=document.body.classList.contains(PANEL_CLASS[b.dataset.panel]);b.classList.toggle('active',on&&(b.dataset.panel!=='inspector'||!b.dataset.tab||b.dataset.tab===state.inspector));});}
  function closePanels(){document.body.classList.remove('panel-library','panel-inspector','panel-timeline');syncDock();}
  // In phone mode panels are full-screen: whenever the canvas is needed (painting,
  // sculpting, ghost placement), the panel steps away so the scene owns the screen.
  function touchClosePanels(){if(document.body.dataset.device==='touch')closePanels();}
  $$('.panel-close').forEach(b=>b.onclick=()=>{closePanels();resize();});
  $$('.dock-btn[data-panel]').forEach(b=>b.onclick=()=>{
    const cls=PANEL_CLASS[b.dataset.panel],was=document.body.classList.contains(cls);
    closePanels();
    if(!was){document.body.classList.add(cls);if(b.dataset.panel==='inspector')showInspector(b.dataset.tab||state.inspector);}
    syncDock();resize();
  });
  const projectMenu=$('#project-menu');
  $('#open-project-menu').onclick=e=>{e.stopPropagation();projectMenu.hidden=!projectMenu.hidden;};
  projectMenu.addEventListener('click',()=>{projectMenu.hidden=true;});
  addEventListener('pointerdown',e=>{if(!projectMenu.hidden&&!e.target.closest('#project-menu,#open-project-menu'))projectMenu.hidden=true;},true);
  // ── Device gate: adapt menus, sizes and gestures to computer or phone ──
  const deviceDialog=$('#device-dialog');
  function applyDevice(dev,remember){
    document.body.dataset.device=dev;
    try{if(remember)localStorage.setItem('studioDevice',dev);else localStorage.removeItem('studioDevice');}catch(e){}
    $('#device-switch').innerHTML=icon(dev==='touch'?'phone':'desktop');
    $('#viewport-hint').innerHTML=dev==='touch'?'One finger orbits <b>·</b> Pinch to zoom <b>·</b> Two fingers pan <b>·</b> Tap to select':'Drag to orbit <b>·</b> Scroll to zoom <b>·</b> Click to select';
  }
  function openDeviceDialog(){
    const coarse=matchMedia('(pointer:coarse)').matches;
    $('#choose-touch').classList.toggle('suggested',coarse);$('#choose-desktop').classList.toggle('suggested',!coarse);
    deviceDialog.showModal();
  }
  for(const [id,dev] of [['choose-desktop','desktop'],['choose-touch','touch']])$('#'+id).onclick=()=>{applyDevice(dev,$('#device-remember').checked);deviceDialog.close();toast(dev==='touch'?'Interface adapted to touch: big buttons and full-screen menus.':'Interface adapted to computer: shortcuts and compact menus.');};
  $('#device-switch').onclick=()=>openDeviceDialog();
  try{if(localStorage.getItem('studioOnion')==='0'){state.onion=false;$('#onion-skin').checked=false;}}catch(e){}
  // Phone: keep the focused field in view above the virtual keyboard — the panel
  // owning the screen is the whole point, so the field must never hide behind it.
  document.addEventListener('focusin',e=>{
    if(document.body.dataset.device!=='touch')return;
    const t=e.target;if(!t.matches||!t.matches('input,select,textarea'))return;
    const fix=()=>{try{t.scrollIntoView({block:'center',behavior:'smooth'});}catch(err){}};
    setTimeout(fix,80);setTimeout(fix,400);
  });
  let savedDevice=null;try{savedDevice=localStorage.getItem('studioDevice');}catch(e){}
  if(savedDevice)applyDevice(savedDevice,false);else openDeviceDialog();
  // Public debug API is also used by the real-browser regression suite.
  window.STUDIO={THREE,interpolateRotation,scene,camera,renderer,orbit,gizmo,world,objects,camTrack,timeline,light,state,blockDefs,toolNames,
    video:{start:startRecording,cancel:stopRecording,get result(){return videoResult;},get busy(){return!!recording;}},
    get selected(){return selected;},get frames(){return frames;},get ready(){return frames>2;},get recording(){return!!recording;},catalog,itemDefs,getBlockPrototype,
    select:selectObject,setMode,setScope,selectedTarget,selectTerrainBlock,addProp,sceneHit,soundtrack,seek,setPlaying,updateLight,addPoseKey,addCameraKey,projectData,loadProject,parseModel,voxelise,equip,applyPose,neutralPose,presetPose,
    serializeRecord,handleFiles,undo,redo,frameScene,focusObject,refreshAll,editBlock,cellFromHit,history,cleanRender,actorSnapshot,restoreActor,makeTool,toolTextureName,setToolLighting,applyObjectKey,applyPendingEdits,revertEdit,keysOf,poseState};
  window.STUDIO.ai=initGeminiPanel({
    catalog:{blocks:Object.entries(blockDefs).filter(([id,d])=>d.available).map(([id,d])=>({id,label:d.label,root:d.root,solid:d.solid,surfaceHeight:d.surfaceHeight})),blockAliases:catalog.blockAliases,tools:toolNames.slice(),inventoryTools:catalog.itemOrder.filter(n=>itemDefs[n].available&&itemDefs[n].kind==='item'),sourceModels:catalog.sourceModels.map(m=>m.asset),lights:clone(LIGHTS)},
    snapshot:captureAIScene,apply:applyAIPlan,canUndo:entry=>history.at(-1)===entry,undo,
    prepare:()=>{if(recording){toast('Stop the recording before opening Gemini.');return false;}finishInputEdit();setPlaying(false);return true;},
    play:()=>{applyPendingEdits();seek(0,true);setPlaying(true);}
  });
}
main().catch(e=>{console.error(e);$('#load-message').textContent='Could not start the 3D editor: '+e.message+'. Please try a WebGL-capable browser.';});
