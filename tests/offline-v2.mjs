import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),results=path.join(root,'tests/results'),html=fs.readFileSync(path.join(root,'START-HERE.html'),'utf8');
const checks=[],errors=[],network=[];function check(name,pass,detail=''){checks.push({name,pass:!!pass,detail});console.log((pass?'PASS ':'FAIL ')+name+(detail?' — '+detail:''));}
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const context=await browser.newContext({viewport:{width:1440,height:900},offline:true,acceptDownloads:true});
function watch(page){page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});}
try{
 const page=await context.newPage();watch(page);await page.goto('file://'+path.join(root,'START-HERE.html'));await page.waitForFunction(()=>window.STUDIO?.ready,null,{timeout:60000});await page.waitForFunction(()=>!document.querySelector('#loader'));
 const starter=await page.evaluate(()=>STUDIO.projectData());check('standalone v2 opens with the network disabled',starter.version===2&&starter.objects.length===9);
 fs.writeFileSync(path.join(root,'Maple-clearing.bloxd.json'),JSON.stringify(starter,null,2));
 await page.screenshot({path:path.resolve(root,'../sources/final-editor.png')});
 await page.evaluate(()=>{const r=STUDIO.addProp('block',new STUDIO.THREE.Vector3(2,3,4),{block:'stone'});STUDIO.select(r);});
 await page.locator('#rot-y').fill('90');await page.locator('#key-time').fill('3');await page.locator('#key-time').press('Tab');
 check('standalone keeps a typed rotation while selecting the key time',await page.evaluate(()=>Math.abs(STUDIO.selected.root.rotation.y-Math.PI/2)<1e-6&&!!STUDIO.selected.draft));
 await page.locator('#key-pose').click();await page.evaluate(()=>STUDIO.seek(1.5));
 check('standalone fixes the first-late-key animation, not only the modular app',await page.evaluate(()=>STUDIO.selected.keys.length===2&&STUDIO.selected.keys[0].time===0&&Math.abs(STUDIO.selected.root.rotation.y-Math.PI/4)<1e-6));
 await page.locator('#open-export').click();const promise=page.waitForEvent('download',{timeout:60000});await page.locator('#export-mp3').click();const download=await promise;await download.saveAs(path.join(results,'offline-soundtrack.mp3'));
 const bytes=fs.readFileSync(path.join(results,'offline-soundtrack.mp3'));check('standalone can encode and download MP3 fully offline',bytes[0]===255&&bytes.length>100000,bytes.length+' bytes');await page.locator('#export-dialog .dialog-close').click();
 const legacy=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/v1-project.json')));await page.evaluate(d=>STUDIO.loadProject(d),legacy);
 check('version 1 projects migrate without losing tool stands',await page.evaluate(()=>STUDIO.objects.filter(r=>r.type==='tool').length===2&&STUDIO.objects.filter(r=>r.type==='block'&&r.options.block==='log').length===2&&STUDIO.world.count===956));
 await page.evaluate(d=>STUDIO.loadProject(d),starter);await page.locator('#scope-held').click();await page.waitForTimeout(200);
 check('scope buttons correctly identify the selected held item',await page.locator('#scope-held').evaluate(el=>el.classList.contains('active'))&&!(await page.locator('#whole-player').evaluate(el=>el.classList.contains('active'))));
 await page.evaluate(()=>STUDIO.focusObject(STUDIO.selected));await page.screenshot({path:path.resolve(root,'../sources/final-bob-closeup.png')});
 const videoFile=path.join(results,'Maple-clearing-demo.webm');if(fs.existsSync(videoFile)){
  const video=await page.evaluate(async bytes=>{const data=new Uint8Array(bytes),url=URL.createObjectURL(new Blob([data],{type:'video/webm'})),v=document.createElement('video');v.muted=true;const metadata=new Promise((resolve,reject)=>{v.onloadedmetadata=()=>resolve({duration:v.duration,width:v.videoWidth,height:v.videoHeight});v.onerror=()=>reject(new Error('WebM video did not decode'));});v.src=url;const info=await metadata;URL.revokeObjectURL(url);const audio=await STUDIO.soundtrack.context().decodeAudioData(data.buffer.slice(0)),s=audio.getChannelData(0);let sum=0;for(const n of s)sum+=n*n;return{...info,audioDuration:audio.duration,rms:Math.sqrt(sum/s.length)};},[...fs.readFileSync(videoFile)]);
  // The normal export is frame-based: verify clip timing, allowing codec padding.
  check('WebM export contains decodable moving-picture and audio tracks',video.width>500&&video.height>300&&Number.isFinite(video.duration)&&Math.abs(video.duration-8)<.05&&Math.abs(video.audioDuration-8)<.05&&video.rms>.003,JSON.stringify(video));
 }
 await page.locator('#open-ai').click();check('standalone Gemini panel starts without a saved key',await page.locator('#ai-key').inputValue()==='');await page.locator('#ai-example').click();
 check('standalone validates the local command example without networking',(await page.locator('#ai-status').textContent()).includes('Plan validated'));
 if(await page.locator('#ai-ack-row').isVisible())await page.locator('#ai-ack').check();await page.locator('#ai-play-after').uncheck();await page.locator('#ai-apply').click();await page.waitForFunction(()=>!document.querySelector('#ai-dialog').open);
 check('standalone command execution creates real editable animation',await page.evaluate(()=>STUDIO.objects.length===11&&STUDIO.timeline.duration===10&&STUDIO.objects.find(r=>r.name==='Bob the explorer').character.keys.length>70));await page.locator('#undo').click();
 check('standalone Undo restores the entire pre-command scene',await page.evaluate(()=>STUDIO.objects.length===9&&STUDIO.world.count===956&&STUDIO.timeline.duration===8));
 // Stop the first software-rendered context before opening the opaque iframe.
 await page.evaluate(()=>{window.requestAnimationFrame=()=>0;STUDIO.soundtrack.stopPreview();});const host=await context.newPage();watch(host);
 await host.setContent('<html><body style="margin:0"><iframe sandbox="allow-scripts" style="border:0;width:100vw;height:100vh"></iframe></body></html>');
 const locked=html.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data: blob:; connect-src data: blob:; media-src data: blob:;">');await host.locator('iframe').evaluate((el,text)=>el.srcdoc=text,locked);
 const handle=await host.locator('iframe').elementHandle(),frame=await handle.contentFrame();await frame.waitForFunction(()=>window.STUDIO?.ready,null,{timeout:90000});
 const opaque=await frame.evaluate(async()=>{const B=STUDIO,mp3=await B.soundtrack.mp3(2);B.setScope('held');B.setMode('rotate');B.cleanRender();return{blocks:B.world.count,tools:B.toolNames.length,png:document.querySelector('#scene').toDataURL().length,mp3:mp3.size,held:B.gizmo.object===B.selected.character.mount.children[0],downloadNote:!document.querySelector('#sandbox-note').hidden};});
 check('opaque sandbox preview renders all local assets',opaque.blocks===956&&opaque.tools>=2406&&opaque.png>30000,JSON.stringify(opaque));
 check('rotation and MP3 encoding work inside the restricted preview',opaque.held&&opaque.mp3>30000);
 check('embedded preview explains the download restriction',opaque.downloadNote);
 await frame.evaluate(()=>{const r=STUDIO.addProp('block',new STUDIO.THREE.Vector3(2,3,4),{block:'stone'});STUDIO.select(r);});await frame.locator('#rot-y').fill('90');await frame.locator('#key-time').fill('3');await frame.locator('#key-time').press('Tab');await frame.locator('#key-pose').click();await frame.evaluate(()=>STUDIO.seek(1.5));
 check('fixed edit-first / time-second workflow animates inside the opaque preview',await frame.evaluate(()=>STUDIO.selected.keys.length===2&&Math.abs(STUDIO.selected.root.rotation.y-Math.PI/4)<1e-6));
 await frame.locator('#open-ai').click();await frame.locator('#ai-example').click();if(await frame.locator('#ai-ack-row').isVisible())await frame.locator('#ai-ack').check();await frame.locator('#ai-play-after').uncheck();await frame.locator('#ai-apply').click();await frame.waitForFunction(()=>!document.querySelector('#ai-dialog').open);
 check('local AI command execution also works in the opaque file preview',await frame.evaluate(()=>STUDIO.timeline.duration===10&&STUDIO.objects.some(r=>r.name==='Bob the explorer'&&r.character.keys.length>70)));
 check('opaque preview does not fabricate Gemini API access',await frame.evaluate(()=>document.querySelector('#ai-key').value===''&&!document.querySelector('#ai-preview-note').hidden));
 await frame.locator('#duration').fill('2');await frame.locator('#duration').press('Tab');await frame.locator('#open-export').click();await frame.locator('#video-size').selectOption('640x360');await frame.locator('#video-format').selectOption('webm');await frame.locator('#record-audio').uncheck();await frame.locator('#rec').click();await frame.waitForFunction(()=>!STUDIO.video.busy,null,{timeout:120000});
 check('restricted preview can retain a locally rendered clip without an auto-download',await frame.evaluate(()=>!!STUDIO.video.result&&STUDIO.video.result.blob.size>1000&&!document.querySelector('#video-ready').hidden&&document.querySelector('#video-download').href.startsWith('blob:')));
 check('restricted preview still explains that its parent can block downloads',await frame.evaluate(()=>!document.querySelector('#sandbox-note').hidden&&document.querySelector('#sandbox-note').textContent.includes('block downloads')));
 check('no remote runtime requests',network.length===0,network.join(' | '));check('no offline or sandbox runtime errors',errors.length===0,errors.join(' | '));
}catch(e){check('offline runner completed',false,e.stack);}
finally{await browser.close();fs.writeFileSync(path.join(results,'offline-v2-report.json'),JSON.stringify({date:'2026-10-23',version:'4.0.0',checks,errors,network},null,2));const failures=checks.filter(c=>!c.pass);console.log(`\n${checks.length-failures.length}/${checks.length} offline checks passed.`);process.exitCode=failures.length?1:0;}
