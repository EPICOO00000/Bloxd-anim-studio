import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'tests/results');fs.mkdirSync(out,{recursive:true});
const checks=[],errors=[];function check(name,pass,detail=''){checks.push({name,pass:!!pass,detail});console.log((pass?'PASS ':'FAIL ')+name+(detail?' — '+detail:''));}
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
const get=fn=>page.evaluate(fn);
async function input(id,v){await page.locator(id).evaluate((el,v)=>{el.focus();el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},v);}
async function save(selector,name){const promise=page.waitForEvent('download',{timeout:90000});await page.locator(selector).click();const d=await promise,p=path.join(out,name);await d.saveAs(p);return p;}
async function screen(p){return page.evaluate(p=>{STUDIO.scene.updateMatrixWorld(true);STUDIO.camera.updateMatrixWorld();const v=new STUDIO.THREE.Vector3(...p).project(STUDIO.camera),r=document.querySelector('#scene').getBoundingClientRect();return{x:r.x+(v.x+1)*r.width/2,y:r.y+(1-v.y)*r.height/2};},p);}
async function clickWorld(p){const q=await screen(p);await page.mouse.click(q.x,q.y);}
async function reset(starter){await page.evaluate(d=>STUDIO.loadProject(d),starter);await get(()=>STUDIO.frameScene());}
try{
 await page.goto('http://127.0.0.1:8000/');await page.waitForFunction(()=>window.STUDIO?.ready,null,{timeout:60000});await page.waitForFunction(()=>!document.querySelector('#loader'));
 const starter=await get(()=>STUDIO.projectData());
 check('v2 starter boots and stores v2 project data',starter.version===2&&starter.objects.length===9);
 check('Place and Remove are visible, separate buttons',await page.locator('#place-blocks').isVisible()&&await page.locator('#erase-blocks').isVisible());
 check('original pickaxe texture is visible in the inspector',(await page.locator('#texture-filename').textContent())==='diamond_pickaxe.png');
 const assets=await get(()=>{const B=STUDIO;const names=['Wood','Stone','Iron','Gold','Diamond'].flatMap(m=>['Pickaxe','Sword','Axe','Spade','Hoe'].map(t=>m+' '+t)).concat(['Moonstone Pickaxe','Moonstone Axe','Shears','Artisan Shears','Wood Bow','Diamond Spear','Diamond Dagger']);return names.map(name=>{let mesh;const item=B.makeTool(name);item.traverse(o=>{if(o.isMesh)mesh=o;});return{name,mapped:!!mesh.material.map,nearest:mesh.material.map.magFilter===B.THREE.NearestFilter,unlit:mesh.material.isMeshBasicMaterial&&!mesh.material.toneMapped,thin:mesh.geometry.userData.thickness<.5,pixels:mesh.geometry.userData.opaquePixels,file:mesh.userData.toolTexture};});});
 check('all 32 original equipment choices still have their own PNG map',assets.length===32&&assets.every(a=>a.mapped&&a.pixels>0));
 check('the original equipment set keeps thin pixel-extruded geometry',assets.every(a=>a.thin));
 check('the original equipment set keeps crisp original-color textures',assets.every(a=>a.nearest&&a.unlit));
 check('gold tools use golden PNGs, not iron fallback textures',assets.filter(a=>a.name.startsWith('Gold')).every(a=>a.file.startsWith('golden_')));
 const palette=await get(()=>{
  const B=STUDIO,T=B.THREE,r=B.renderer,target=new T.WebGLRenderTarget(100,100);target.texture.colorSpace=T.SRGBColorSpace;
  const cam=new T.OrthographicCamera(-5,5,5,-5,.1,100);cam.position.z=20;cam.lookAt(0,0,0);const scene=new T.Scene();scene.background=new T.Color(0x445566);let comparisons=0,maxError=0;
  for(const name of ['Diamond Pickaxe','Diamond Sword','Gold Axe','Moonstone Pickaxe','Artisan Shears','Wood Bow']){
   let source;B.makeTool(name).traverse(o=>{if(o.isMesh)source=o;});const mesh=new T.Mesh(source.geometry,source.material);scene.add(mesh);
   r.setRenderTarget(target);r.render(scene,cam);const pixels=new Uint8Array(100*100*4);r.readRenderTargetPixels(target,0,0,100,100,pixels);
   const img=source.material.map.image,c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const rgba=ctx.getImageData(0,0,c.width,c.height).data;
   for(let y=0;y<img.height;y++)for(let x=0;x<img.width;x++){const a=(y*img.width+x)*4;if(rgba[a+3]<128)continue;const b=((99-(y*10+5))*100+x*10+5)*4;for(let ch=0;ch<3;ch++)maxError=Math.max(maxError,Math.abs(rgba[a+ch]-pixels[b+ch]));comparisons++;}
   scene.remove(mesh);
  }r.setRenderTarget(null);target.dispose();return{comparisons,maxError};
 });
 check('rendered front-face pixel colors match the source PNGs',palette.comparisons>100&&palette.maxError<=2,JSON.stringify(palette));
 await page.locator('[data-library="tools"]').click();await page.locator('#asset-search').fill('Gold Pickaxe');await page.locator('#asset-grid button[title="Gold Pickaxe"]').click();
 check('Place item creates an independently selectable tool',await get(()=>STUDIO.selected.type==='tool'&&STUDIO.selected.options.asset==='Gold Pickaxe'));
 check('placing a tool does not group it with a pedestal',await get(()=>STUDIO.selected.root.children.length===1&&STUDIO.selected.root.children[0].children.length===1));
 check('item pivot is centered for rotation',await get(()=>{const t=STUDIO.selected.root,b=new STUDIO.THREE.Box3().setFromObject(t);return b.getCenter(new STUDIO.THREE.Vector3()).distanceTo(t.position)<.001;}));
 check('placing an item automatically shows its rotation rings',await get(()=>STUDIO.gizmo.object===STUDIO.selected.root&&STUDIO.gizmo.mode==='rotate'));
 await input('#rot-y',30);await page.locator('[data-turn="y"]').click();check('XYZ numeric angles and +90 degree button rotate a tool',Math.abs(await get(()=>STUDIO.selected.root.rotation.y)-120*Math.PI/180)<.001);
 await page.locator('#undo').click();check('undo restores item rotation',Math.abs(await get(()=>STUDIO.selected.root.rotation.y)-Math.PI/6)<.001);
 await page.locator('#redo').click();check('redo reapplies item rotation',Math.abs(await get(()=>STUDIO.selected.root.rotation.y)-120*Math.PI/180)<.001);
 await page.locator('#rotation-path').selectOption('spins');await get(()=>STUDIO.seek(0));await input('#rot-y',0);await page.locator('#key-pose').click();await get(()=>STUDIO.seek(2));await input('#rot-y',720);await page.locator('#key-pose').click();await get(()=>STUDIO.seek(1));
 check('opt-in Full spins mode preserves explicitly authored turn counts',Math.abs(await get(()=>STUDIO.selected.root.rotation.y)-2*Math.PI)<.001);
 check('tool transform keys appear on its timeline',await page.locator('#pose-track .key-marker').count()===2&&(await page.locator('#key-pose').textContent()).includes('transform'));
 const spin=await get(()=>STUDIO.projectData());await page.evaluate(d=>STUDIO.loadProject(d),spin);await get(()=>{STUDIO.select(STUDIO.objects.find(r=>r.options?.asset==='Gold Pickaxe'));STUDIO.seek(1);});
 check('item animation survives project round-trip',await get(()=>STUDIO.selected.keys.length===2&&Math.abs(STUDIO.selected.root.rotation.y-2*Math.PI)<.001));
 await get(()=>STUDIO.focusObject(STUDIO.selected));await page.locator('[data-mode="select"]').click();
 const itemPoint=await get(()=>{let m;STUDIO.selected.root.traverse(o=>{if(o.isMesh)m=o;});STUDIO.scene.updateMatrixWorld(true);const a=m.geometry.attributes.position;return new STUDIO.THREE.Vector3().fromBufferAttribute(a,0).add(new STUDIO.THREE.Vector3(.5,.5,.005)).applyMatrix4(m.matrixWorld).toArray();});await clickWorld(itemPoint);
 check('real canvas click picks a visible tool, not terrain behind it',await get(()=>STUDIO.selected?.type==='tool'&&STUDIO.selected.options.asset==='Gold Pickaxe'));
 await reset(starter);await page.locator('[data-library="blocks"]').click();await page.locator('#asset-grid button[title="Grass Block"]').click();const count=await get(()=>STUDIO.world.count);await clickWorld([5.5,1.001,4.5]);
 check('Place mode adds a block on the clicked face',await get(()=>STUDIO.world.get(5,1,4)==='grass'&&STUDIO.world.count===957));
 await page.locator('#erase-blocks').click();await clickWorld([5.5,2.001,4.5]);check('Remove mode erases with ordinary left click',await get(()=>!STUDIO.world.get(5,1,4)&&STUDIO.world.count===956));
 await page.locator('#undo').click();check('undo restores a block erased in Remove mode',await get(()=>STUDIO.world.get(5,1,4)==='grass'));
 await page.locator('[data-mode="select"]').click();const objectsBefore=await get(()=>STUDIO.objects.length);await clickWorld([5.5,2.001,4.5]);
 check('click selects an individual terrain block',await get(()=>STUDIO.selected?.type==='block'&&STUDIO.selected.options.block==='grass'));
 check('selection promotes exactly one cell without duplicating it',await page.evaluate(n=>STUDIO.objects.length===n+1&&!STUDIO.world.get(5,1,4)&&STUDIO.world.count===956,objectsBefore));
 check('editable block has a centered pivot and correct face maps',await get(()=>STUDIO.selected.root.position.equals(new STUDIO.THREE.Vector3(5.5,1.5,4.5))&&STUDIO.selected.root.children[0].material.every(m=>!!m.map)));
 await page.locator('#undo').click();check('undo conversion restores the instanced terrain cell',await get(()=>STUDIO.world.get(5,1,4)==='grass'));
 await page.locator('#redo').click();check('redo conversion selects the editable block again',await get(()=>STUDIO.selected.type==='block'&&!STUDIO.world.get(5,1,4)));
 await page.locator('#rotate-selected').click();await input('#rot-y',45);await page.locator('#snap-rotation').check();check('block rotation rings and optional 15 degree snapping work',await get(()=>STUDIO.gizmo.object===STUDIO.selected.root&&Math.abs(STUDIO.gizmo.rotationSnap-Math.PI/12)<.001));await page.locator('#snap-rotation').uncheck();
 await get(()=>STUDIO.seek(0));await page.locator('#key-pose').click();await get(()=>STUDIO.seek(2));await input('#rot-y',225);await page.locator('#key-pose').click();await get(()=>STUDIO.seek(1));
 check('individual blocks have animated transform tracks',await get(()=>STUDIO.selected.root.quaternion.angleTo(new STUDIO.THREE.Quaternion().setFromEuler(new STUDIO.THREE.Euler(0,-Math.PI/4,0)))<.001&&STUDIO.selected.keys.length===2));
 const blockProject=await get(()=>STUDIO.projectData());await page.locator('#delete-object').click();check('Delete object removes the selected block, not neighboring terrain',await get(()=>!STUDIO.objects.some(r=>r.options?.terrainCell?.join(',')==='5,1,4')&&STUDIO.world.get(5,0,4)==='grass'));
 await page.locator('#undo').click();check('undo deleted block restores its rotation and keys',await get(()=>STUDIO.selected.type==='block'&&STUDIO.selected.keys.length===2&&STUDIO.selected.root.quaternion.angleTo(new STUDIO.THREE.Quaternion().setFromEuler(new STUDIO.THREE.Euler(0,-Math.PI/4,0)))<.001));
 await page.evaluate(d=>STUDIO.loadProject(d),blockProject);await get(()=>{STUDIO.select(STUDIO.objects.find(r=>r.options?.terrainCell));STUDIO.seek(1);});check('block selection, textures and animation persist through save/load',await get(()=>STUDIO.selected.type==='block'&&STUDIO.selected.keys.length===2&&!STUDIO.world.get(5,1,4)&&STUDIO.selected.root.quaternion.angleTo(new STUDIO.THREE.Quaternion().setFromEuler(new STUDIO.THREE.Euler(0,-Math.PI/4,0)))<.001));
 await reset(starter);await get(()=>{STUDIO.focusObject(STUDIO.selected);STUDIO.setMode('select');});
 const headPoint=await get(()=>{STUDIO.scene.updateMatrixWorld(true);return STUDIO.selected.character.joints.head.children[0].getWorldPosition(new STUDIO.THREE.Vector3()).toArray();});await clickWorld(headPoint);
 check('clicking Bob’s head selects the head rather than hidden terrain',await get(()=>STUDIO.selected.character&&STUDIO.state.scope==='part'&&STUDIO.state.joint==='head'));
 check('rotation gizmo attaches to the actual joint, not the player root',await get(()=>STUDIO.gizmo.object===STUDIO.selected.character.joints.head&&STUDIO.gizmo.mode==='rotate'));
 await input('#rot-y',35);await page.locator('#show-joints').check();await page.waitForTimeout(200);
 check('body-part numeric edits persist with joint overlays enabled',await get(()=>Math.abs(STUDIO.selected.character.joints.head.rotation.y-35*Math.PI/180)<.001&&Math.abs(STUDIO.selected.character.displayPose.head[1]-35)<.001));
 await page.locator('#whole-player').click();await input('#rot-y',70);check('Whole player rotates the root without resetting the head pose',await get(()=>Math.abs(STUDIO.selected.root.rotation.y-70*Math.PI/180)<.001&&STUDIO.selected.character.displayPose.head[1]===35));
 await page.locator('#joint-select').selectOption('head');await input('#rot-z',0);await input('#rot-y',0);await page.locator('#whole-player').click();await input('#rot-y',0);await page.locator('#pose-part').click();
 const candidates=await get(()=>{const B=STUDIO;B.scene.updateMatrixWorld(true);B.gizmo.updateMatrixWorld(true);const el=document.querySelector('#scene').getBoundingClientRect(),pts=[];for(const o of B.gizmo._gizmo.gizmo.rotate.children){if(o.name!=='Z'||!o.visible||!o.geometry)continue;const a=o.geometry.attributes.position;for(let i=0;i<a.count;i+=Math.max(1,Math.floor(a.count/30))){const v=new B.THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld).project(B.camera);pts.push({x:el.x+(v.x+1)*el.width/2,y:el.y+(1-v.y)*el.height/2});}}return pts;});
 let hit=null;for(const p of candidates){await page.mouse.move(p.x,p.y);if(await get(()=>STUDIO.gizmo.axis==='Z')){hit=p;break;}}
 check('a visible joint rotation ring is pointer-pickable',!!hit);
 if(hit){const old=await get(()=>STUDIO.selected.character.displayPose.head[2]);await page.mouse.down();await page.mouse.move(hit.x+30,hit.y+22,{steps:6});await page.mouse.up();await page.waitForTimeout(200);const after=await get(()=>STUDIO.selected.character.displayPose.head[2]);check('real mouse drag rotates a joint and stores its pose',Math.abs(after-old)>1,old.toFixed(1)+' → '+after.toFixed(1));await page.locator('#undo').click();check('undo restores a dragged joint pose',Math.abs(await get(()=>STUDIO.selected.character.displayPose.head[2])-old)<.01);await page.locator('#redo').click();check('redo restores a dragged joint pose',Math.abs(await get(()=>STUDIO.selected.character.displayPose.head[2])-after)<.01);}
 await page.locator('#scope-held').click();const before=await get(()=>({root:STUDIO.selected.root.rotation.toArray(),head:STUDIO.selected.character.displayPose.head}));await input('#rot-z',123);
 check('held pickaxe can be selected and rotated independently',await page.evaluate(before=>STUDIO.state.scope==='held'&&STUDIO.gizmo.object===STUDIO.selected.character.mount.children[0]&&Math.abs(STUDIO.gizmo.object.rotation.z-123*Math.PI/180)<.001&&JSON.stringify(STUDIO.selected.root.rotation.toArray())===JSON.stringify(before.root)&&JSON.stringify(STUDIO.selected.character.displayPose.head)===JSON.stringify(before.head),before));
 await page.locator('#undo').click();await page.locator('#redo').click();check('held-item offsets survive undo and redo',await get(()=>Math.abs(STUDIO.selected.character.mount.children[0].rotation.z-123*Math.PI/180)<.001));
 await page.locator('#clear-pose-track').click();await get(()=>STUDIO.seek(0));await input('#rot-z',0);await page.locator('#key-pose').click();await get(()=>STUDIO.seek(2));await input('#rot-z',180);await page.locator('#key-pose').click();await get(()=>STUDIO.seek(1));
 check('held-item rotation follows a shortest arc within character keys',await get(()=>{const T=STUDIO.THREE,q=STUDIO.selected.character.mount.children[0].quaternion,a=new T.Quaternion().setFromEuler(new T.Euler(0,-.18,0)),b=new T.Quaternion().setFromEuler(new T.Euler(0,-.18,Math.PI));return Math.abs(q.angleTo(a)-Math.PI/2)<.001&&Math.abs(q.angleTo(b)-Math.PI/2)<.001;}));
 const heldMidRotation=await get(()=>STUDIO.selected.character.mount.children[0].rotation.z);
 const heldProject=await get(()=>STUDIO.projectData());await page.evaluate(d=>STUDIO.loadProject(d),heldProject);await get(()=>{STUDIO.setScope('held');STUDIO.seek(1);});check('held-item animation survives project round-trip',await page.evaluate(z=>STUDIO.selected.character.keys.every(k=>k.held)&&Math.abs(STUDIO.selected.character.mount.children[0].rotation.z-z)<.001,heldMidRotation));
 await page.locator('[data-library="tools"]').click();await page.locator('#equip-tools').click();await page.locator('#asset-search').fill('Gold Axe');await page.locator('#asset-grid button[title="Gold Axe"]').click();
 check('explicit Equip player applies the chosen original-textured tool',await get(()=>STUDIO.selected.character.tool==='Gold Axe'&&STUDIO.state.scope==='held'&&document.querySelector('#texture-filename').textContent==='golden_axe.png'));
 await page.locator('#undo').click();check('undo equip restores the previous tool and its offset',await page.evaluate(z=>STUDIO.selected.character.tool==='Diamond Pickaxe'&&Math.abs(STUDIO.selected.character.mount.children[0].rotation.z-z)<.001,heldMidRotation));
 await page.locator('#delete-object').click();check('deleting a selected held item does not delete its player',await get(()=>STUDIO.objects.filter(r=>r.character).length===1&&STUDIO.selected.character.mount.children.length===0));await page.locator('#undo').click();
 await reset(starter);await page.locator('#open-export').click();check('MP3 and video have separate, clearly labeled export buttons',await page.locator('#export-mp3').isVisible()&&(await page.locator('#export-mp3').textContent()).includes('Audio only')&&await page.locator('#rec').isVisible());
 const mp3file=await save('#export-mp3','v2-soundtrack.mp3'),mp3=fs.readFileSync(mp3file);
 check('MP3 download has actual MPEG frame headers, not renamed video',mp3[0]===255&&(mp3[1]&224)===224&&mp3.length>100000,mp3.length+' bytes');
 const decoded=await page.evaluate(async bytes=>{const c=STUDIO.soundtrack.context(),b=await c.decodeAudioData(new Uint8Array(bytes).buffer),s=b.getChannelData(0);let sum=0,peak=0;for(const n of s){sum+=n*n;peak=Math.max(peak,Math.abs(n));}return{duration:b.duration,rate:b.sampleRate,rms:Math.sqrt(sum/s.length),peak};},[...mp3]);
 check('downloaded MP3 decodes to the clip’s duration',Math.abs(decoded.duration-8)<.12,JSON.stringify(decoded));
 check('MP3 contains audible synthesized effects, not silence',decoded.rms>.003&&decoded.peak>.04);
 fs.copyFileSync(mp3file,path.resolve(root,'../Maple-Clearing-Soundtrack.mp3'));
 await page.locator('#preview-sound').click();check('sound preview creates a local Web Audio source',await get(()=>!!STUDIO.soundtrack.source));await page.locator('#stop-sound').click();check('Stop sound disconnects audio preview',await get(()=>!STUDIO.soundtrack.source));
 // Two-channel, 48 kHz local WAV exercises decode, mono mixing, resampling, offset and looping.
 const rate=48000,n=rate*2,wav=Buffer.alloc(44+n*4);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*4,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(n*4,40);for(let i=0;i<n;i++){wav.writeInt16LE(Math.round(Math.sin(i/rate*440*Math.PI*2)*9000),44+i*4);wav.writeInt16LE(Math.round(Math.sin(i/rate*660*Math.PI*2)*9000),46+i*4);}const wavfile=path.join(out,'import-test.wav');fs.writeFileSync(wavfile,wav);
 await page.setInputFiles('#audio-file',wavfile);await page.waitForFunction(()=>STUDIO.soundtrack.state.source==='import');check('local audio import is decoded and embedded for saving',await get(()=>STUDIO.soundtrack.decoded.numberOfChannels===2&&STUDIO.soundtrack.state.dataURL.startsWith('data:audio/')));
 await input('#audio-offset',1);await input('#sound-volume',.4);const offset=await get(()=>{const p=STUDIO.soundtrack.pcm(8),rms=(a,b)=>{const s=p.samples.slice(a*44100,b*44100);return Math.sqrt(s.reduce((n,v)=>n+v*v,0)/s.length);};return{first:rms(0,.8),middle:rms(1.1,2.8),end:rms(4,7)};});
 check('imported sound is resampled, volume-adjusted and positioned in time',offset.first===0&&offset.middle>.01&&offset.end===0,JSON.stringify(offset));await page.locator('#audio-loop').check();
 check('imported audio can loop to fill a longer animation',await get(()=>STUDIO.soundtrack.pcm(8).samples.slice(6*44100,7*44100).some(n=>Math.abs(n)>.01)));
 const audioData=await get(()=>STUDIO.projectData());await page.locator('#export-dialog .dialog-close').click();await page.evaluate(d=>STUDIO.loadProject(d),audioData);
 check('project reload preserves imported audio, timing, volume and loop',await get(()=>STUDIO.soundtrack.state.source==='import'&&STUDIO.soundtrack.state.offset===1&&STUDIO.soundtrack.state.volume===.4&&STUDIO.soundtrack.state.loop&&Math.abs(STUDIO.soundtrack.decoded.duration-2)<.0001));
 await page.locator('#open-export').click();const importedMp3=await save('#export-mp3','v2-imported-audio.mp3');check('imported audio also exports as actual MP3',fs.statSync(importedMp3).size>100000);
 await page.locator('#audio-source').selectOption('silent');check('Silence is an explicit source option',await get(()=>STUDIO.soundtrack.pcm(8).samples.every(n=>n===0)));
 await page.locator('#export-dialog .dialog-close').click();await reset(starter);await page.screenshot({path:path.join(out,'v2-editor.png')});
 await page.locator('#scope-held').click();await get(()=>STUDIO.focusObject(STUDIO.selected));await page.screenshot({path:path.join(out,'v2-held-item.png')});await page.locator('#open-export').click();await page.screenshot({path:path.join(out,'v2-export.png')});
 check('no unexpected browser or asset-loading errors',errors.length===0,errors.join(' | '));
}catch(e){check('refinement runner completed',false,e.stack);}
finally{await browser.close();fs.writeFileSync(path.join(out,'refinement-report.json'),JSON.stringify({date:'2026-10-22',version:2,checks,errors},null,2));const failures=checks.filter(c=>!c.pass);console.log(`\n${checks.length-failures.length}/${checks.length} refinement checks passed.`);process.exitCode=failures.length?1:0;}
