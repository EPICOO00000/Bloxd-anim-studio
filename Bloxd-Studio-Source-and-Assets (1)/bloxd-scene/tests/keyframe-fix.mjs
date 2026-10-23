import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'tests/results');fs.mkdirSync(out,{recursive:true});
const checks=[],errors=[];const check=(name,pass,detail='')=>{checks.push({name,pass:!!pass,detail});console.log((pass?'PASS ':'FAIL ')+name+(detail?' — '+detail:''));};const close=(a,b)=>Math.abs(a-b)<1e-5;
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const get=fn=>page.evaluate(fn);
async function time(t){await page.locator('#key-time').fill(String(t));await page.locator('#key-time').press('Tab');}
async function angle(axis,value){await page.locator('#rot-'+axis).fill(String(value));}
async function terrain(){const p=await get(()=>{STUDIO.camera.updateMatrixWorld();const v=new STUDIO.THREE.Vector3(5.5,1.001,4.5).project(STUDIO.camera),r=document.querySelector('#scene').getBoundingClientRect();return{x:r.x+(v.x+1)*r.width/2,y:r.y+(1-v.y)*r.height/2};});await page.mouse.click(p.x,p.y);}
async function reset(data){await page.evaluate(d=>STUDIO.loadProject(d),data);await get(()=>{STUDIO.frameScene();STUDIO.setMode('select');});}
async function apply(){await page.locator('#key-pose').click();}
try{
 await page.goto(process.env.APP_URL||'http://127.0.0.1:8000/');await page.waitForFunction(()=>window.STUDIO?.ready,null,{timeout:60000});await page.waitForFunction(()=>!document.querySelector('#loader'));
 const starter=await get(()=>STUDIO.projectData());const bobKeys=JSON.stringify(starter.objects.find(r=>r.type==='character').character.keys),camKeys=JSON.stringify(starter.camera.keys);
 check('updated editor exposes exact key time and From start controls',await page.locator('#key-time').isVisible()&&await page.locator('#preview-start').isVisible());
 await terrain();check('real scene click selects an editable block',await get(()=>STUDIO.selected.type==='block'));
 await time(3);await angle('y',90);await apply();
 check('first late block key automatically includes its original 0s transform',await get(()=>STUDIO.selected.keys.length===2&&STUDIO.selected.keys[0].time===0&&STUDIO.selected.keys[0].rotation[1]===0&&STUDIO.selected.keys[1].time===3));
 const samples=[];for(const t of[0,1.5,3]){await time(t);samples.push(await get(()=>STUDIO.selected.root.rotation.y*180/Math.PI));}
 check('block actually interpolates 0° → 45° → 90°, not one frozen pose',samples.every((v,i)=>close(v,[0,45,90][i])),JSON.stringify(samples));
 await page.locator('#undo').click();check('undo Apply removes both automatically created keys as one action',await get(()=>STUDIO.selected.keys.length===0&&!!STUDIO.selected.draft));await page.locator('#redo').click();check('redo Apply restores both keys and clears the pending edit',await get(()=>STUDIO.selected.keys.length===2&&!STUDIO.selected.draft));
 await reset(starter);await terrain();await apply();await angle('y',60);const beforeCamera=await get(()=>STUDIO.camera.position.toArray());
 // Deliberately do NOT blur the number field before this real timeline click.
 const area=await page.locator('#track-area').boundingBox();await page.mouse.click(area.x+area.width*3/8,area.y+8);
 check('choosing a moment after typing rotation does not wipe the unblurred edit',await get(()=>Math.abs(STUDIO.selected.root.rotation.y-Math.PI/3)<1e-6&&STUDIO.selected.draft.time===3));
 check('pending change is visible and has an explicit Revert action',await page.locator('#pending-edit').isVisible()&&await page.locator('#revert-edit').isVisible());
 check('choosing key time preserves the editing camera',await page.evaluate(a=>STUDIO.camera.position.distanceTo(new STUDIO.THREE.Vector3(...a))<1e-6,beforeCamera));
 await apply();await time(1.5);check('edit-first / time-second workflow writes a usable later key',close(await get(()=>STUDIO.selected.root.rotation.y*180/Math.PI),30));
 check('block editing leaves Bob’s eight demo keys and three camera keys unchanged',await page.evaluate(({bobKeys,camKeys})=>JSON.stringify(STUDIO.objects.find(r=>r.character).character.keys)===bobKeys&&JSON.stringify(STUDIO.camTrack.keys)===camKeys,{bobKeys,camKeys}));
 await time(3);await page.locator('#preview-start').click();await page.waitForFunction(()=>STUDIO.timeline.time>.2&&STUDIO.timeline.playing);
 const play=await get(()=>({t:STUDIO.timeline.time,rot:STUDIO.selected.root.rotation.y,head:STUDIO.objects.find(r=>r.character).character.displayPose.armR[0],camera:STUDIO.camera.position.distanceTo(STUDIO.camTrack.sample(STUDIO.timeline.time).position)}));
 check('From start rewinds and plays the new block animation',play.t<3&&play.rot>0&&play.rot<Math.PI/3,JSON.stringify(play));check('Bob’s demo and travelling camera still play alongside object keys',play.head<-1&&play.camera<1e-6);await page.locator('#play').click();
 check('pausing updates the inspector to the actual sampled transform',await get(()=>Math.abs(+document.querySelector('#rot-y').value-STUDIO.selected.root.rotation.y*180/Math.PI)<.051));
 await page.locator('#play').click();await angle('y',22);
 check('typing a transform during playback pauses without overwriting the typed value',await get(()=>!STUDIO.timeline.playing&&Math.abs(STUDIO.selected.root.rotation.y-22*Math.PI/180)<1e-6));await page.locator('#revert-edit').click();
 await reset(starter);await page.locator('[data-library="characters"]').click();await page.locator('.character-card').click();await time(2);await page.locator('#whole-player').click();await angle('y',120);await apply();await time(1);
 check('new whole-player transforms get the same automatic starting key',await get(()=>STUDIO.selected.character.keys.length===2&&Math.abs(STUDIO.selected.root.rotation.y-Math.PI/3)<1e-6));
 await time(0);await page.locator('#joint-select').selectOption('head');await angle('y',30);await time(3);
 check('pending head edit follows the chosen time without freezing animated root channels',await get(()=>Math.abs(STUDIO.selected.character.displayPose.head[1]-30)<1e-6&&Math.abs(STUDIO.selected.root.rotation.y-2*Math.PI/3)<1e-6));await apply();await time(2.5);
 check('custom body-part key interpolates while preserving whole-player movement',await get(()=>Math.abs(STUDIO.selected.character.displayPose.head[1]-15)<1e-6&&Math.abs(STUDIO.selected.root.rotation.y-2*Math.PI/3)<1e-6));
 await time(1);await page.locator('#scope-held').click();const heldStart=await get(()=>STUDIO.selected.character.mount.children[0].rotation.z);await angle('z',180);await page.locator('#obj-x').fill('.25');await time(4);await apply();await time(3.5);
 check('held tool rotation and position key correctly, without resetting the body pose',await page.evaluate(start=>{const r=STUDIO.selected,c=r.character,item=c.mount.children[0];return Math.abs(item.rotation.z-(start+Math.PI)/2)<1e-6&&Math.abs(item.position.x-.125)<1e-6&&Math.abs(c.displayPose.head[1]-30)<1e-6&&Math.abs(r.root.rotation.y-2*Math.PI/3)<1e-6;},heldStart));
 await reset(starter);
 for(const type of ['block','tool','tree','rock','lamp']){
  await time(0);await page.evaluate(type=>{const r=STUDIO.addProp(type,new STUDIO.THREE.Vector3(4,2,4),type==='tool'?{asset:'Diamond Pickaxe'}:type==='block'?{block:'stone'}:{});STUDIO.select(r);},type);
  await angle('z',90);await time(2);await apply();await time(1);
  check(type+': rotate first, pick time, Apply produces a real midpoint',await get(()=>STUDIO.selected.keys.length===2&&STUDIO.selected.keys[0].time===0&&Math.abs(STUDIO.selected.root.rotation.z-Math.PI/4)<1e-6));
 }
 const obj='v -1 -1 -1\nv 1 -1 -1\nv 1 1 -1\nv -1 1 -1\nv -1 -1 1\nv 1 -1 1\nv 1 1 1\nv -1 1 1\nf 1 2 3 4\nf 5 8 7 6\nf 1 5 6 2\nf 2 6 7 3\nf 3 7 8 4\nf 4 8 5 1\n';const fixture=path.join(out,'keyframe-cube.obj');fs.writeFileSync(fixture,obj);
 await page.setInputFiles('#file',fixture);await page.waitForFunction(()=>STUDIO.selected.type==='import');await time(0);await angle('x',90);await time(2);await apply();await time(1);check('imported models use the corrected transform-key path',await get(()=>STUDIO.selected.type==='import'&&Math.abs(STUDIO.selected.root.rotation.x-Math.PI/4)<1e-6));
 await page.setInputFiles('#file',fixture);await page.waitForFunction(()=>STUDIO.selected.type==='import'&&STUDIO.selected.keys.length===0);await page.locator('#voxelize').click();await page.waitForFunction(()=>STUDIO.selected.type==='voxel');await time(0);await angle('y',90);await time(2);await apply();await time(1);check('voxelized items use the corrected transform-key path',await get(()=>STUDIO.selected.type==='voxel'&&Math.abs(STUDIO.selected.root.rotation.y-Math.PI/4)<1e-6));
 // Real TransformControls drag, rather than setting a rotation in test code.
 await reset(starter);await get(()=>{const r=STUDIO.addProp('block',new STUDIO.THREE.Vector3(3.5,3.5,4.5),{block:'diamondore'});STUDIO.select(r);});await page.locator('#focus').click();await page.locator('#rotate-selected').click();
 const candidates=await get(()=>{const B=STUDIO;B.scene.updateMatrixWorld(true);B.gizmo.updateMatrixWorld(true);const r=document.querySelector('#scene').getBoundingClientRect(),result=[];for(const o of B.gizmo._gizmo.gizmo.rotate.children){if(o.name!=='Z'||!o.visible||!o.geometry)continue;const a=o.geometry.attributes.position;for(let i=0;i<a.count;i+=Math.max(1,Math.floor(a.count/30))){const v=new B.THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld).project(B.camera);result.push({x:r.x+(v.x+1)*r.width/2,y:r.y+(1-v.y)*r.height/2});}}return result;});
 let handle=null;for(const q of candidates){await page.mouse.move(q.x,q.y);if(await get(()=>STUDIO.gizmo.axis==='Z')){handle=q;break;}}check('block rotation ring is accessible to a real pointer',!!handle);
 if(handle){await page.mouse.down();await page.mouse.move(handle.x+28,handle.y+21,{steps:6});await page.mouse.up();const end=await get(()=>STUDIO.selected.root.rotation.z);await time(3);check('real dragged rotation survives choosing a later time',Math.abs(end)>.01&&close(await get(()=>STUDIO.selected.root.rotation.z),end));await apply();await time(1.5);check('real dragged rotation is animated, not only stored as a static edit',close(await get(()=>STUDIO.selected.root.rotation.z),end/2));}
 await page.locator('#object-name').fill('Spinner regression');await page.locator('#object-name').press('Tab');await angle('x',25);
 const savedPromise=page.waitForEvent('download');await page.locator('#save-project').click();const download=await savedPromise,savedFile=path.join(out,'keyframe-fixed-project.bloxd.json');await download.saveAs(savedFile);const saved=JSON.parse(fs.readFileSync(savedFile));
 check('Save project applies a pending transform at its chosen time',saved.objects.find(r=>r.name==='Spinner regression').keys.some(k=>k.time===1.5&&close(k.rotation[0],25*Math.PI/180))&&!(await get(()=>STUDIO.selected.draft)));
 await page.locator('#delete-object').click();await page.setInputFiles('#project-file',savedFile);await page.waitForFunction(()=>STUDIO.objects.some(r=>r.name==='Spinner regression'));await get(()=>STUDIO.select(STUDIO.objects.find(r=>r.name==='Spinner regression')));await time(1.5);check('saved block keyframes replay correctly after opening the project',close(await get(()=>STUDIO.selected.root.rotation.x),25*Math.PI/180));
 await angle('y',40);const draftProject=await get(()=>STUDIO.projectData());check('raw project data also retains an unapplied draft',!!draftProject.objects.find(r=>r.name==='Spinner regression').draft);
 await page.evaluate(d=>STUDIO.loadProject(d),draftProject);await get(()=>STUDIO.select(STUDIO.objects.find(r=>r.name==='Spinner regression')));await time(3.5);
 check('pending edit survives project round-trip and another time selection',await get(()=>!!STUDIO.selected.draft&&Math.abs(STUDIO.selected.root.rotation.y-40*Math.PI/180)<1e-6));
 const keysBefore=await get(()=>JSON.stringify(STUDIO.selected.keys));await page.locator('#revert-edit').click();check('Revert cancels only the pending edit, leaving animation keys intact',await page.evaluate(keys=>!STUDIO.selected.draft&&Math.abs(STUDIO.selected.root.rotation.y)<1e-6&&JSON.stringify(STUDIO.selected.keys)===keys,keysBefore));await page.locator('#undo').click();check('Revert itself can be undone',await get(()=>!!STUDIO.selected.draft&&Math.abs(STUDIO.selected.root.rotation.y-40*Math.PI/180)<1e-6));
 await page.locator('#preview-start').click();check('From start applies a pending key at its target time before rewinding',await get(()=>!STUDIO.selected.draft&&STUDIO.selected.keys.some(k=>k.time===3.5&&Math.abs(k.rotation[1]-40*Math.PI/180)<1e-6)&&STUDIO.timeline.playing));await page.locator('#play').click();
 // Fine time spacing should not merge adjacent 30 FPS frames as the old .035s tolerance did.
 await get(()=>{const r=STUDIO.addProp('block',new STUDIO.THREE.Vector3(1,4,1),{block:'bricks'});STUDIO.select(r);});await time(0);await apply();await time(.03);await angle('x',10);await apply();
 check('closely spaced keys are not wrongly merged',await get(()=>STUDIO.selected.keys.length===2&&STUDIO.selected.keys[0].time===0&&STUDIO.selected.keys[1].time===.03));
 await time(2);await angle('x',80);await apply();await time(3);await angle('x',100);await apply();
 // Retime the 3s key onto the existing 2s key. There must be one target key, not NaN interpolation.
 const key=page.locator('#pose-track .key-marker').last(),box=await key.boundingBox(),track=await page.locator('#track-area').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(track.x+track.width*2/8,box.y+box.height/2,{steps:5});await page.mouse.up();
 check('retiming onto an existing moment replaces the key without duplicate timestamps',await get(()=>STUDIO.selected.keys.filter(k=>k.time===2).length===1&&STUDIO.selected.keys.length===3));await time(1);check('interpolation remains finite after overlapping-key retime',await get(()=>STUDIO.selected.root.rotation.toArray().slice(0,3).every(Number.isFinite)));
 await reset(starter);await get(()=>{const r=STUDIO.addProp('block',new STUDIO.THREE.Vector3(2,3,4),{block:'stone'});r.keys=[{time:3,position:r.root.position.toArray(),rotation:[0,Math.PI/2,0],scale:[1,1,1]}];STUDIO.select(r);});await time(3);await angle('y',120);await apply();await time(1.5);
 check('editing an older late-only track adds a safe starting key, without guessing its lost original pose',await get(()=>STUDIO.selected.keys.length===2&&STUDIO.selected.keys[0].time===0&&Math.abs(STUDIO.selected.keys[0].rotation[1]-Math.PI/2)<1e-6&&Math.abs(STUDIO.selected.root.rotation.y-105*Math.PI/180)<1e-6));
 const oldKeys=await get(()=>STUDIO.selected.keys.map(k=>k.position[0]));await page.locator('#duplicate').click();await page.waitForFunction(()=>STUDIO.selected.name.endsWith('copy'));
 check('duplicated animation keeps its copied offset at every key',await page.evaluate(xs=>STUDIO.selected.keys.every((k,i)=>Math.abs(k.position[0]-xs[i]-1.4)<1e-6),oldKeys));
 await reset(starter);check('loading the starter still restores Bob’s untouched working demo',await page.evaluate(keys=>JSON.stringify(STUDIO.selected.character.keys)===keys,bobKeys));await page.screenshot({path:path.join(out,'keyframe-fixed-editor.png')});
 check('no unexpected browser errors during the keyframe workflows',errors.length===0,errors.join(' | '));
}catch(e){check('keyframe regression runner completed',false,e.stack);}
finally{await browser.close();fs.writeFileSync(path.join(out,'keyframe-fix-report.json'),JSON.stringify({date:'2026-10-22',version:'2.1.0',checks,errors},null,2));const bad=checks.filter(c=>!c.pass);console.log(`\n${checks.length-bad.length}/${checks.length} keyframe checks passed.`);process.exitCode=bad.length?1:0;}
