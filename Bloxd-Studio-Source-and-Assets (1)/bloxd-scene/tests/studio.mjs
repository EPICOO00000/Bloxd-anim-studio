import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const results=path.join(root,'tests/results');fs.mkdirSync(results,{recursive:true});
const checks=[],errors=[],requests=[];
function check(name,pass,detail=''){checks.push({name,pass:!!pass,detail});console.log((pass?'PASS ':'FAIL ')+name+(detail?' — '+detail:''));}
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1280,height:820},deviceScaleFactor:1,acceptDownloads:true});
const page=await context.newPage();
page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR:',e.message);});
page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.log('CONSOLE ERROR:',m.text());}});
page.on('response',r=>{if(r.status()>=400)errors.push('HTTP '+r.status()+' '+r.url());});
page.on('request',r=>requests.push(r.url()));
const get=fn=>page.evaluate(fn);
async function input(id,value){await page.locator(id).evaluate((el,v)=>{el.focus();el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);}
async function downloadClick(selector,name){const promise=page.waitForEvent('download',{timeout:90000});await page.locator(selector).click();const d=await promise;const f=path.join(results,name);await d.saveAs(f);return f;}
try{
  await page.goto(process.env.APP_URL||'http://127.0.0.1:8000/',{waitUntil:'load'});
  await page.waitForFunction(()=>window.STUDIO?.ready,null,{timeout:60000});
  await page.waitForFunction(()=>!document.querySelector('#loader'));
  const starter=await get(()=>STUDIO.projectData());
  const info=await get(()=>({blocks:STUDIO.world.count,choices:Object.keys(STUDIO.blockDefs).length,tools:STUDIO.toolNames.length,parts:Object.keys(STUDIO.selected.character.joints),tex:STUDIO.blockDefs.stone.mats[0].map.image.width,grass:STUDIO.blockDefs.grass.mats.map(m=>!!m.map),shadow:STUDIO.renderer.shadowMap.enabled,feet:new STUDIO.THREE.Box3().setFromObject(STUDIO.selected.character.joints.shinR.children[0]).min.y}));
  check('scene boots with instanced terrain',info.blocks>800,info.blocks+' blocks');
  check('all block faces have texture maps',info.grass.every(Boolean)&&info.tex===8,'official 8px stone texture');
  check('expanded block/state and item/source-model catalogs',info.choices===4032&&info.tools>=2406);
  check('ten editable joints including knees and elbows',info.parts.length===10&&info.parts.includes('shinL')&&info.parts.includes('forearmR'));
  check('Bob stands at the terrain surface',Math.abs(info.feet-1)<.001,'foot y='+info.feet);
  check('real shadows enabled',info.shadow);
  await page.screenshot({path:path.join(results,'editor-initial.png')});

  await page.locator('#joint-select').selectOption('head');await input('#joint-y',43);
  const rotation=await get(()=>STUDIO.selected.character.joints.head.rotation.y);
  check('head slider drives the rig',Math.abs(rotation-43*Math.PI/180)<.001);
  await page.waitForTimeout(150);
  check('manual pose is not overwritten by animation loop',Math.abs(await get(()=>STUDIO.selected.character.joints.head.rotation.y)-rotation)<.001);
  await page.locator('#whole-player').click();await input('#obj-x',3.25);
  check('position input moves the character and persists',Math.abs(await get(()=>STUDIO.selected.root.position.x)-3.25)<.001);
  await page.locator('#undo').click();check('undo restores position',Math.abs(await get(()=>STUDIO.selected.root.position.x)-1)<.001);
  await page.locator('#redo').click();check('redo reapplies position',Math.abs(await get(()=>STUDIO.selected.root.position.x)-3.25)<.001);
  await input('#obj-x',1);
  await page.locator('[data-pose="tpose"]').click();
  check('T-pose is applied to both shoulders',await get(()=>Math.abs(STUDIO.selected.character.joints.armL.rotation.z-Math.PI/2)<.001&&Math.abs(STUDIO.selected.character.joints.armR.rotation.z+Math.PI/2)<.001));
  await page.locator('#joint-select').selectOption('forearmR');await input('#joint-x',-65);
  check('elbow is independently poseable',Math.abs(await get(()=>STUDIO.selected.character.joints.forearmR.rotation.x)+65*Math.PI/180)<.001);
  for(const name of ['Diamond Pickaxe','Diamond Sword','Diamond Axe','Diamond Spade','Diamond Hoe','Wood Bow','Shears'])await page.locator('#held-tool').selectOption(name);
  check('equipment selector attaches real models to the hand',await get(()=>STUDIO.selected.character.tool==='Shears'&&STUDIO.selected.character.mount.children.length===1));
  await page.locator('#held-tool').selectOption('none');check('empty hand removes equipment',await get(()=>STUDIO.selected.character.mount.children.length===0));
  await page.locator('#held-tool').selectOption('Diamond Pickaxe');
  await page.locator('[data-library="tools"]').click();await page.locator('#asset-search').fill('diamond');
  check('asset search filters the tool library',await page.locator('#asset-grid .asset-card').count()>7&&await page.locator('#asset-grid .asset-card').evaluateAll(cards=>cards.every(c=>c.title.toLowerCase().includes('diamond'))));
  await page.locator('[data-library="characters"]').click();await page.locator('.character-card').click();
  check('spawn adds a separate character rig',await get(()=>STUDIO.objects.filter(o=>o.character).length===2));
  await page.locator('#undo').click();check('undo removes spawned character',await get(()=>STUDIO.objects.filter(o=>o.character).length===1));

  await page.locator('[data-inspector="light"]').click();
  await input('#sun-az',100);await input('#sun-el',22);
  check('sun direction controls update the actual light',await get(()=>STUDIO.light.az===100&&Math.abs(STUDIO.scene.children.find(o=>o.isDirectionalLight).position.y-Math.sin(22*Math.PI/180)*36)<.001));
  await page.locator('#show-fog').uncheck();await input('#sun-power',2.1);
  check('fog can be disabled while editing lighting without a crash',await get(()=>STUDIO.scene.fog===null&&STUDIO.light.power===2.1));
  await page.locator('#show-fog').check();await page.locator('#shadows').uncheck();
  check('shadow toggle works',await get(()=>!STUDIO.renderer.shadowMap.enabled));
  await page.locator('#shadows').check();await page.locator('[data-light="night"]').click();
  check('moonlight preset actually has a dark sky',await get(()=>STUDIO.scene.background.getHexString()==='263947'&&STUDIO.light.fill<.5));
  await page.locator('#sun-pad').scrollIntoViewIfNeeded();
  const pad=await page.locator('#sun-pad').boundingBox();await page.mouse.move(pad.x+pad.width*.2,pad.y+30);await page.mouse.down();await page.mouse.move(pad.x+pad.width*.7,pad.y+65,{steps:3});await page.mouse.up();
  check('dragging sun pad changes direction',Math.abs(await get(()=>STUDIO.light.az)-72)<4,'azimuth '+await get(()=>STUDIO.light.az));
  await page.locator('[data-light="golden"]').click();

  await page.locator('[data-inspector="camera"]').click();
  const curve=await get(()=>{
    const B=STUDIO,k=B.camTrack.keys;let exact=true;for(const key of k)exact&&=B.camTrack.sample(key.time).position.distanceTo(new B.THREE.Vector3(...key.position))<1e-6;
    const d=[];let prev=B.camTrack.sample(0).position;for(let i=1;i<=20;i++){const next=B.camTrack.sample(k[1].time*i/20).position;d.push(next.distanceTo(prev));prev=next;}
    const spline=B.camTrack.sample(2).position;B.camTrack.smooth=false;const linear=B.camTrack.sample(2).position;B.camTrack.smooth=true;
    return{exact,ratio:Math.max(...d)/Math.min(...d),difference:spline.distanceTo(linear)};
  });
  check('camera spline hits exact positions at key times',curve.exact);
  check('camera travel uses near-uniform segment speed',curve.ratio<1.08,'max/min speed '+curve.ratio.toFixed(3));
  check('linear and smooth camera modes differ',curve.difference>.01);
  await get(()=>STUDIO.seek(2));
  check('timeline scrubbing previews the camera at the correct location',await get(()=>STUDIO.camera.position.distanceTo(STUDIO.camTrack.sample(2).position)<.001));
  await get(()=>{STUDIO.timeline.time=7.9;STUDIO.timeline.loop=false;STUDIO.setPlaying(true);});
  await page.waitForFunction(()=>!STUDIO.timeline.playing,null,{timeout:10000});
  check('non-looping playback stops at the final frame',await get(()=>STUDIO.timeline.time===8));
  await get(()=>{STUDIO.timeline.time=7.95;STUDIO.timeline.loop=true;STUDIO.setPlaying(true);});
  await page.waitForFunction(()=>STUDIO.timeline.time<2,null,{timeout:10000});
  check('looping playback wraps and continues',await get(()=>STUDIO.timeline.playing));
  await get(()=>{STUDIO.setPlaying(false);STUDIO.timeline.loop=false;STUDIO.seek(0);});

  await page.locator('[data-inspector="object"]').click();await page.locator('#clear-pose-track').click();await page.locator('#reset-pose').click();await page.locator('#key-pose').click();
  await get(()=>STUDIO.seek(2));await page.locator('[data-pose="wave"]').click();await page.locator('#key-pose').click();
  await get(()=>STUDIO.seek(1));
  check('pose timeline really interpolates, not just the latest pose',await get(()=>Math.abs(STUDIO.selected.character.displayPose.armR[0]+77.5)<.001));
  const marker=page.locator('#pose-track .key-marker').nth(1),mb=await marker.boundingBox(),area=await page.locator('#track-area').boundingBox();
  await page.mouse.move(mb.x+mb.width/2,mb.y+mb.height/2);await page.mouse.down();await page.mouse.move(area.x+area.width*3/8,mb.y+mb.height/2,{steps:4});await page.mouse.up();
  check('real pointer drag retimes a pose key',await get(()=>Math.abs(STUDIO.selected.character.keys[1].time-3)<.06));
  await page.locator('#delete-key').click();check('delete key affects the selected timeline key',await get(()=>STUDIO.selected.character.keys.length===1));
  await page.locator('#undo').click();check('undo restores a deleted pose key',await get(()=>STUDIO.selected.character.keys.length===2));

  await page.evaluate(data=>STUDIO.loadProject(data),starter);await get(()=>STUDIO.frameScene());
  await page.locator('[data-library="blocks"]').click();await page.locator('#asset-grid .asset-card[title="Grass Block"]').click();
  const screenPoint=async p=>page.evaluate(p=>{const B=STUDIO;B.camera.updateMatrixWorld();const v=new B.THREE.Vector3(...p).project(B.camera),r=document.querySelector('#scene').getBoundingClientRect();return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};},p);
  const before=await get(()=>STUDIO.world.count),pt=await screenPoint([5.5,1.001,4.5]);await page.mouse.click(pt.x,pt.y);
  check('real canvas click places the adjacent block',await get(()=>STUDIO.world.get(5,1,4)==='grass'));
  check('placing adds exactly one block',await get(()=>STUDIO.world.count)===before+1);
  const pt2=await screenPoint([5.5,2.001,4.5]);await page.mouse.click(pt2.x,pt2.y,{button:'right'});
  check('right-click erases the hit block, not the neighbouring cell',await get(()=>!STUDIO.world.get(5,1,4)&&STUDIO.world.get(5,0,4)==='grass'));
  await page.locator('#undo').click();check('undo restores a dug block',await get(()=>STUDIO.world.get(5,1,4)==='grass'));
  await page.locator('[data-mode="translate"]').click();
  check('transform handles attach to the selected root',await get(()=>STUDIO.gizmo.object===STUDIO.selected.root&&STUDIO.gizmo.mode==='translate'));
  await page.locator('[data-mode="select"]').click();

  const cube=`v -1 -1 -1\nv 1 -1 -1\nv 1 1 -1\nv -1 1 -1\nv -1 -1 1\nv 1 -1 1\nv 1 1 1\nv -1 1 1\nf 1 2 3 4\nf -4 -1 -2 -3\nf 1 5 6 2\nf 2 6 7 3\nf 3 7 8 4\nf 4 8 5 1\n`;
  const objFile=path.join(results,'test-cube.obj');fs.writeFileSync(objFile,cube);
  await page.setInputFiles('#file',objFile);await page.waitForFunction(()=>STUDIO.selected?.type==='import',null,{timeout:10000});
  check('OBJ file input imports a real mesh, including negative indices',await get(()=>STUDIO.selected.root.children.length>0&&STUDIO.selected.name==='test-cube'));
  const parsers=await get(async()=>{
    const B=STUDIO,stl=new ArrayBuffer(134),dv=new DataView(stl);dv.setUint32(80,1,true);dv.setFloat32(84+24,1,true);dv.setFloat32(84+40,1,true);
    const a=await B.parseModel('test.stl',stl);
    const text=`ply\nformat ascii 1.0\nelement vertex 4\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nelement face 2\nproperty list uchar int vertex_indices\nend_header\n0 0 0 255 0 0\n1 0 0 0 255 0\n1 1 0 0 0 255\n0 1 0 255 255 0\n3 0 1 2\n3 0 2 3\n`;
    const b=await B.parseModel('test.ply',new TextEncoder().encode(text).buffer);let ply=false,normals=true;
    b.root.traverse(o=>{if(o.isMesh){ply=!!o.geometry.attributes.color&&o.geometry.index.count===6;normals&&=[...o.geometry.attributes.normal.array].every(Number.isFinite);}});
    return{stl:!!a.root,ply,normals};
  });
  check('binary STL parser reads a triangle',parsers.stl);check('PLY parser retains colors and triangle indices',parsers.ply);check('PLY normals are finite (indexed geometry)',parsers.normals);
  await page.locator('[data-inspector="object"]').click();await page.locator('#voxelize').click();await page.waitForFunction(()=>STUDIO.selected.type==='voxel',null,{timeout:20000});
  const vox=await get(()=>{const im=STUDIO.selected.root.children[0],bb=im.geometry.boundingBox||(im.geometry.computeBoundingBox(),im.geometry.boundingBox),s=bb.getSize(new STUDIO.THREE.Vector3());return{n:im.count,x:s.x,y:s.y,z:s.z};});
  check('voxel conversion fills a closed cube',vox.n===4096,vox.n+' cells');check('voxel cells are uniformly cubic',Math.abs(vox.x-vox.y)<1e-8&&Math.abs(vox.y-vox.z)<1e-8);
  await page.locator('#undo').click();check('undo voxelisation restores the original mesh',await get(()=>STUDIO.selected.type==='import'));
  await page.setInputFiles('#file',path.join(root,'assets/models/Diamond Sword.glb'));await page.waitForFunction(()=>STUDIO.selected.name==='Diamond Sword'&&STUDIO.selected.type==='import');
  check('self-contained textured GLB imports correctly',await get(()=>{let textured=false;STUDIO.selected.root.traverse(o=>{if(o.isMesh&&o.material.map)textured=true;});return textured;}));
  const save=await downloadClick('#save-project','project.bloxd.json');
  check('save project produces JSON with scene and key data',JSON.parse(fs.readFileSync(save)).format==='bloxd-studio');
  const snapshot=await get(()=>({n:STUDIO.objects.length,b:STUDIO.world.count,k:STUDIO.camTrack.keys.length}));
  await page.locator('#delete-object').click();await page.setInputFiles('#project-file',save);await page.waitForFunction(n=>STUDIO.objects.length===n,snapshot.n,{timeout:30000});
  check('project round-trip preserves imports, terrain and camera keys',await page.evaluate(s=>STUDIO.objects.length===s.n&&STUDIO.world.count===s.b&&STUDIO.camTrack.keys.length===s.k,snapshot));

  await page.evaluate(data=>STUDIO.loadProject(data),starter);
  await page.locator('[data-inspector="object"]').click();await page.locator('#held-tool').selectOption('none');await page.locator('#reset-pose').click();
  await get(()=>{const r=STUDIO.selected;r.root.position.set(0,0,0);r.root.rotation.set(0,0,0);});
  const glb=await downloadClick('#export-model','Bob-classic-rig.glb');
  const glbData=fs.readFileSync(glb);check('model export produces a binary GLB',glbData.toString('ascii',0,4)==='glTF');
  const gltf=JSON.parse(glbData.toString('utf8',20,20+glbData.readUInt32LE(12)));
  check('exported Bob retains named joint hierarchy and embedded skin',gltf.nodes.some(n=>n.name==='Right_elbow'||n.name==='Right elbow')&&gltf.images?.length>0);
  await page.setInputFiles('#file',glb);await page.waitForFunction(()=>STUDIO.selected.type==='import');
  check('exported character GLB can be reimported',await get(()=>STUDIO.selected.name==='Bob-classic-rig'));
  await page.evaluate(data=>STUDIO.loadProject(data),starter);
  await page.locator('#open-export').click();const png=await downloadClick('#shot','frame.png');
  const pngData=fs.readFileSync(png);check('PNG export is a real non-empty image',pngData.toString('hex',0,8)==='89504e470d0a1a0a'&&pngData.length>20000,Math.round(pngData.length/1024)+' KB');
  await page.locator('#clean-view').click();check('clean-view return control remains accessible',await page.locator('#clean-return').isVisible());await page.locator('#clean-return').click();
  await page.locator('#help-btn').click();check('quick guide and provenance are available',await page.locator('#help-dialog').isVisible()&&(await page.locator('#help-dialog').textContent()).includes('recreation'));await page.locator('#help-dialog .dialog-close').click();

  // Render the full starter clip, then explicitly download the retained video.
  await page.setViewportSize({width:960,height:720});
  await page.locator('#clean-view').click();await get(()=>STUDIO.seek(0));
  await page.evaluate(()=>document.querySelector('#export-dialog').showModal());
  await page.locator('#video-size').selectOption('640x360');await page.locator('#video-format').selectOption('webm');await page.locator('#rec').click();await page.waitForFunction(()=>!STUDIO.video.busy&&STUDIO.video.result,null,{timeout:180000});
  const video=await downloadClick('#video-download','Maple-clearing-demo.webm');
  const videoData=fs.readFileSync(video);check('WebM recording downloads a playable container',videoData.toString('hex',0,4)==='1a45dfa3'&&videoData.length>10000,Math.round(videoData.length/1024)+' KB');
  check('frame export finishes the whole clip and restores the editing time',await get(()=>!STUDIO.recording&&!STUDIO.timeline.playing&&STUDIO.timeline.time===0&&STUDIO.video.result.frames===192));
  await page.locator('#export-dialog .dialog-close').click();
  await page.locator('#clean-return').click();await page.setViewportSize({width:1280,height:820});await get(()=>{STUDIO.seek(0);STUDIO.frameScene();});
  await page.screenshot({path:path.join(results,'editor-final.png')});
  check('no unexpected runtime or loading errors',errors.length===0,errors.join(' | '));
  check('the modular app uses no remote runtime resources',requests.every(u=>u.startsWith('http://127.0.0.1:8000')||u.startsWith('data:')||u.startsWith('blob:')));
}catch(e){check('test runner completed',false,e.stack);}
finally{
  await browser.close();fs.writeFileSync(path.join(results,'report.json'),JSON.stringify({date:'2026-10-22',checks,errors},null,2));
  const failures=checks.filter(c=>!c.pass);console.log(`\n${checks.length-failures.length}/${checks.length} checks passed.`);process.exitCode=failures.length?1:0;
}
