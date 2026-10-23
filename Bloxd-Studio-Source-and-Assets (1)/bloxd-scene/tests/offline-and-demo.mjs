import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(root,'../sources/render-frames');fs.mkdirSync(output,{recursive:true});
const html=fs.readFileSync(path.resolve(root,'../Bloxd-Studio.html'),'utf8');
const browser=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,offline:true});
const page=await context.newPage();const errors=[],network=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
await page.goto('file://'+path.resolve(root,'../Bloxd-Studio.html'));
await page.waitForFunction(()=>window.STUDIO?.ready,null,{timeout:60000});
await page.waitForFunction(()=>!document.querySelector('#loader'));
console.log('PASS standalone loads with network disabled');
const starter=await page.evaluate(()=>STUDIO.projectData());
fs.writeFileSync(path.join(root,'Maple-clearing.bloxd.json'),JSON.stringify(starter,null,2));
await page.screenshot({path:path.resolve(root,'../sources/final-editor.png')});
await page.evaluate(()=>STUDIO.focusObject(STUDIO.selected));
await page.screenshot({path:path.resolve(root,'../sources/final-bob-closeup.png')});

// Suspend the first viewport before starting another software-rendered WebGL context.
await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
// Confirm the single file renders inside an opaque sandbox with no remote resources.
const host=await context.newPage();host.on('pageerror',e=>errors.push('iframe: '+e.message));host.on('console',m=>{if(m.type()==='error')errors.push('iframe: '+m.text());});
await host.setContent('<html><body style="margin:0"><iframe sandbox="allow-scripts" style="border:0;width:100vw;height:100vh"></iframe></body></html>');
const locked=html.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data: blob:; connect-src data: blob:;">');
await host.locator('iframe').evaluate((el,text)=>el.srcdoc=text,locked);
let frame;for(let i=0;i<10&&!frame;i++){frame=host.frames().find(f=>f.parentFrame());if(!frame)await host.waitForTimeout(100);}
await frame.waitForFunction(()=>window.STUDIO?.ready,null,{timeout:60000});
const iframeInfo=await frame.evaluate(()=>({blocks:STUDIO.world.count,tools:STUDIO.toolNames.length,png:document.querySelector('#scene').toDataURL().length}));
if(iframeInfo.blocks<800||iframeInfo.png<30000)throw new Error('Sandbox render missing scene pixels');
console.log('PASS opaque sandbox preview renders '+iframeInfo.blocks+' blocks and '+iframeInfo.tools+' tools');
await host.close();

// Deterministic rendered example: 192 frames, exactly eight seconds at 24 fps.
// The live app still uses real-time MediaRecorder; this fixture uses no wall-clock timing.
await page.evaluate(data=>STUDIO.loadProject(data),starter);
await page.evaluate(()=>{window.requestAnimationFrame=()=>0;document.body.classList.add('clean');});
await page.setViewportSize({width:960,height:540});await page.waitForTimeout(500);
await page.evaluate(()=>{STUDIO.renderer.setPixelRatio(1);STUDIO.renderer.setSize(960,540,false);STUDIO.camera.aspect=960/540;STUDIO.camera.updateProjectionMatrix();});
for(let i=0;i<192;i++){
  const data=await page.evaluate(t=>{STUDIO.seek(t,true);STUDIO.cleanRender();return document.querySelector('#scene').toDataURL('image/png').split(',')[1];},i/24);
  fs.writeFileSync(path.join(output,`frame_${String(i).padStart(4,'0')}.png`),Buffer.from(data,'base64'));
  if(i%48===0)console.log('Rendered '+i+'/192 frames');
}
console.log('Rendered 192/192 frames');
console.log('Remote requests:',network.length,'Errors:',errors.length);
fs.writeFileSync(path.join(root,'tests/results/offline-report.json'),JSON.stringify({offline:true,sandbox:iframeInfo,network,errors,renderedFrames:192,fps:24},null,2));
await browser.close();if(errors.length||network.length)throw new Error(errors.join('\n')||'Unexpected remote requests');
