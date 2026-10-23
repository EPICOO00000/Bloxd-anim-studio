import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'tests/results');fs.mkdirSync(out,{recursive:true});
const checks=[],errors=[],requests=[],unexpected=[];const KEY='test-only-not-a-real-gemini-key';
function check(name,pass,detail=''){checks.push({name,pass:!!pass,detail});console.log((pass?'PASS ':'FAIL ')+name+(detail?' — '+detail:''));}
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await browser.newPage({viewport:{width:1440,height:980},acceptDownloads:true});
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith('http://127.0.0.1:8000')&&r.status()>=400)errors.push('HTTP '+r.status()+' '+r.url());});page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith('http://127.0.0.1:8000')&&!r.url().startsWith('https://generativelanguage.googleapis.com/'))unexpected.push(r.url());});
const get=fn=>page.evaluate(fn),headers={'access-control-allow-origin':'*','access-control-allow-headers':'x-goog-api-key,content-type','access-control-allow-methods':'GET,POST,OPTIONS'};
let responseMode='good',modelPlan,heldResponses=[];
await page.route('https://generativelanguage.googleapis.com/**',async route=>{
 const req=route.request();if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
 requests.push({url:req.url(),method:req.method(),headers:req.headers(),body:req.postDataJSON()});
 const send=async(status,data)=>{try{await route.fulfill({status,contentType:'application/json',headers,body:JSON.stringify(data)});}catch{}};
 if(responseMode==='auth'){await send(403,{error:{message:'API key '+KEY+' is restricted.'}});return;}
 if(req.method()==='GET'){await send(200,{models:[{name:'models/gemini-3.8-flash',displayName:'Gemini Flash',supportedGenerationMethods:['generateContent'],outputTokenLimit:32768},{name:'models/gemini-2.5-flash',supportedGenerationMethods:['generateContent'],outputTokenLimit:32768},{name:'models/gemini-3.8-flash-tts',supportedGenerationMethods:['generateContent']},{name:'models/text-embedding-004',supportedGenerationMethods:['embedContent']} ]});return;}
 if(responseMode==='quota'){await send(429,{error:{message:'Test quota exceeded.'}});return;}
 if(responseMode==='hold'){heldResponses.push(()=>send(200,{candidates:[{content:{parts:[{text:JSON.stringify(modelPlan)}]},finishReason:'STOP'}]}));return;}
 if(responseMode==='truncated'){await send(200,{candidates:[{content:{parts:[{text:'{"commands":['}]},finishReason:'MAX_TOKENS'}]});return;}
 if(responseMode==='blocked'){await send(200,{promptFeedback:{blockReason:'SAFETY'}});return;}
 const plan=responseMode==='unsafe'?{title:'Untrusted output',summary:'',commands:[{op:'execute_code',code:'window.__AI_EXECUTED=true'}]}:modelPlan;
 await send(200,{candidates:[{content:{parts:[{thought:true,text:'Internal model notes, not scene commands.'},{text:responseMode==='bad-json'?'not a JSON plan':JSON.stringify(plan)}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:1000,candidatesTokenCount:500,totalTokenCount:1500}});
});
async function open(){if(!await page.locator('#ai-dialog').evaluate(el=>el.open))await page.locator('#open-ai').click();}
async function closeDialog(){if(await page.locator('#ai-dialog').evaluate(el=>el.open))await page.locator('#ai-dialog .dialog-close').click();}
async function setJSON(plan){await open();const details=page.locator('.ai-json-details');if(!await details.evaluate(el=>el.open))await details.locator('summary').click();await page.locator('#ai-json').fill(JSON.stringify(plan,null,2));await page.locator('#ai-validate').click();}
async function confirm(){if(await page.locator('#ai-ack-row').isVisible())await page.locator('#ai-ack').check();}
async function generate(){await page.locator('#ai-generate').click();await page.waitForFunction(()=>!STUDIO.ai.busy,null,{timeout:30000});}
const core=()=>{const d=STUDIO.projectData();return JSON.stringify({world:d.world,objects:d.objects,light:d.light,cameraKeys:d.camera.keys,sceneName:d.sceneName,duration:d.timeline.duration,loop:d.timeline.loop});};
try{
 await page.goto(process.env.APP_URL||'http://127.0.0.1:8000/');await page.waitForFunction(()=>window.STUDIO?.ready&&STUDIO.ai,null,{timeout:60000});await page.waitForFunction(()=>!document.querySelector('#loader'));
 const starter=await get(()=>STUDIO.projectData()),beforeCore=await get(core),ids=await get(()=>({bob:STUDIO.objects.find(r=>r.character).id,tree:STUDIO.objects.find(r=>r.type==='tree').id,lamp:STUDIO.objects.find(r=>r.type==='lamp').id}));
 modelPlan={title:'Bridge expedition',summary:'Editable terrain, two styles of actor animation, spinning items, camera travel and golden light.',commands:[
  {op:'duration',seconds:12,loop:false},{op:'terrain_fill',from:[-5,0,-2],to:[5,0,2],block:'planks'},
  {op:'terrain_height',center:[-8,-7],size:[5,5],baseY:-3,height:0,variation:2,seed:11,block:'grass'},
  {op:'terrain_fill',from:[6,0,-3],to:[8,0,0],block:'water'},
  {op:'extract_block',id:'floating_ore',position:[-1,2,2],name:'Levitating ore'},
  {op:'animate',id:'floating_ore',rotationMode:'spins',keys:[{time:0,rotation:[0,0,0]},{time:6,position:[-.5,4,2.5],rotation:[0,180,0]},{time:12,position:[-.5,2.5,2.5],rotation:[0,360,0]}]},
  {op:'add',id:'hero',kind:'character',name:'Gemini walker',position:[-4,8,0],tool:'Diamond Pickaxe',grounded:true},
  {op:'clear_animation',id:'hero'},
  {op:'motion',id:'hero',preset:'walk',start:0,end:6,from:[-4,1,0],to:[-.5,1,1.2],grounded:true},
  {op:'motion',id:'hero',preset:'mine',start:6,end:9,rotation:[0,0,0]},
  {op:'motion',id:'hero',preset:'wave',start:9,end:12,rotation:[0,0,0]},
  {op:'equip',id:'hero',asset:'Gold Pickaxe'},{op:'pose',id:'hero',joints:[{joint:'head',rotation:[0,15,0]}]},
  {op:'add',id:'spinning_item',kind:'tool',asset:'Diamond Sword',name:'Spinning sword',position:[4,2.5,0]},
  {op:'animate',id:'spinning_item',rotationMode:'spins',keys:[{time:0,rotation:[0,0,0]},{time:12,rotation:[0,720,0]}]},
  {op:'add',id:'new_lamp',kind:'lamp',name:'Bridge lantern',position:[-4,1,-2],grounded:true},
  {op:'add',id:'new_tree',kind:'tree',name:'Autumn accent',position:[6,1,-5],autumn:true,scale:[.6,.6,.6],grounded:true},
  {op:'transform',id:ids.tree,position:[-5,1,-5],rotation:[0,20,0]},
  {op:'rename',id:ids.tree,name:'Maple backdrop'},{op:'remove',id:ids.lamp},
  {op:'camera',smooth:true,keys:[{time:0,position:[13,10,16],target:[0,2,0],fov:45},{time:6,position:[7,6,12],target:[0,2,1],fov:43},{time:12,position:[-8,7,13],target:[0,2,1],fov:45}]},
  {op:'lighting',preset:'golden',azimuth:80,elevation:30,intensity:2.5,ambient:1.2,shadows:true,fog:false}
 ]};
 check('Gemini entry point is available without changing manual editing',await page.locator('#open-ai').isVisible()&&starter.editorVersion==='4.0.0');
 check('opening the editor makes no Gemini requests automatically',requests.length===0);
 await open();check('password field and explicit Generate / review / Apply controls are visible',await page.locator('#ai-key').getAttribute('type')==='password'&&await page.locator('#ai-generate').isVisible()&&await page.locator('#ai-apply').isDisabled());
 check('privacy, quota and no-auto-retry notices are visible',(await page.locator('.ai-privacy').textContent()).includes('Google')&&(await page.locator('.ai-privacy').textContent()).includes('No automatic retries'));
 await page.locator('#ai-key').fill(KEY);await page.locator('#ai-models').click();await page.waitForFunction(()=>!STUDIO.ai.busy);
 check('key check fetches Google models with an authentication header',requests.length===1&&requests[0].method==='GET'&&requests[0].headers['x-goog-api-key']===KEY&&!requests[0].url.includes(KEY));
 check('model picker excludes speech and embedding-only models',await page.locator('#ai-model option').count()===4);
 await page.locator('#ai-prompt').fill('Make a twelve-second bridge adventure with walking, mining, spinning items, a travelling camera and warm sunlight.');
 const historyCount=await get(()=>STUDIO.history.length);await generate();const generation=requests.find(r=>r.method==='POST');
 check('Generate uses the real Gemini generateContent request shape',generation?.url.endsWith('/models/gemini-3.8-flash:generateContent')&&generation.body.contents[0].role==='user'&&generation.body.systemInstruction.parts[0].text.includes('scene planner'));
 const schemas=generation.body.generationConfig.responseJsonSchema.properties.commands.items.anyOf;
 check('Gemini receives a strict command union and structured JSON mode',generation.body.generationConfig.responseMimeType==='application/json'&&schemas.length>=16&&schemas.find(s=>s.properties.op.enum[0]==='motion').required.includes('start'));
 check('schema includes terrain-aware grounding and explicit camera targets',schemas.find(s=>s.properties.op.enum[0]==='add').properties.grounded.type==='boolean'&&schemas.find(s=>s.properties.op.enum[0]==='camera').properties.keys.items.required.includes('target'));
 check('API key is not in request URLs, instructions or scene data',requests.every(r=>!r.url.includes(KEY))&&!JSON.stringify(generation.body).includes(KEY));
 const sent=JSON.parse(generation.body.contents[0].parts[0].text);
 check('Gemini sees scene refs, limited keys, terrain surfaces, lights and asset names',sent.scene.objects.some(r=>r.ref===ids.bob)&&sent.scene.terrain.surfaceColumns.length>100&&sent.scene.availableItems.includes('Diamond Pickaxe')&&sent.scene.camera.keys.length===3);
 check('scene context omits image/model/audio file payloads',!JSON.stringify(sent).includes('data:image')&&!JSON.stringify(sent).includes('data:audio')&&!JSON.stringify(sent).includes('geometries')&&!('audio' in sent.scene));
 check('generation is review-only, with no live mutation or history changes',await get(core)===beforeCore&&await get(()=>STUDIO.history.length)===historyCount);
 check('generated operations are shown for review',await page.locator('#ai-command-list li').count()===modelPlan.commands.length&&(await page.locator('#ai-source').textContent()).includes('Gemini · gemini-3.8-flash'));
 check('destructive changes require acknowledgement before Apply',await page.locator('#ai-ack-row').isVisible()&&await page.locator('#ai-apply').isDisabled());
 await page.screenshot({path:path.join(out,'gemini-plan-review.png')});await confirm();await page.locator('#ai-apply').click();await page.waitForFunction(()=>!document.querySelector('#ai-dialog').open&&STUDIO.timeline.playing);
 check('Apply executes the plan and previews the animation',await get(()=>STUDIO.timeline.duration===12&&STUDIO.objects.some(r=>r.name==='Gemini walker')&&STUDIO.timeline.playing));await page.locator('#play').click();
 check('the whole command batch is one Undo entry',await get(()=>STUDIO.history.length)===historyCount+1);
 check('terrain fill, water and terrain extraction affect the real voxel map',await get(()=>STUDIO.world.get(0,0,0)==='planks'&&STUDIO.world.get(7,0,-2)==='water'&&!STUDIO.world.get(-1,2,2)));
 check('height terrain contains varying surface heights',await get(()=>new Set([-10,-9,-8,-7,-6].map(x=>STUDIO.world.heightAt(x,-7))).size>1));
 check('characters, original-textured equipment and props are actually added',await get(()=>{const h=STUDIO.objects.find(r=>r.name==='Gemini walker');let texture;h.character.mount.traverse(m=>{if(m.isMesh)texture=m.userData.toolTexture;});return h.character.tool==='Gold Pickaxe'&&texture==='golden_pickaxe'&&STUDIO.objects.some(r=>r.name==='Bridge lantern')&&STUDIO.objects.some(r=>r.name==='Autumn accent');}));
 check('object deletion and static transforms/rename execute correctly',await page.evaluate(ids=>!STUDIO.objects.some(r=>r.id===ids.lamp)&&STUDIO.objects.find(r=>r.id===ids.tree).name==='Maple backdrop'&&STUDIO.objects.find(r=>r.id===ids.tree).root.position.x===-5,ids));
 await get(()=>STUDIO.seek(0,true));check('grounded characters are placed on terrain, not at the requested floating Y',await get(()=>Math.abs(STUDIO.objects.find(r=>r.name==='Gemini walker').root.position.y-1)<1e-6));
 await get(()=>STUDIO.seek(3,true));const hero=await get(()=>{const r=STUDIO.objects.find(r=>r.name==='Gemini walker');return{position:r.root.position.toArray(),keys:r.character.keys.length,poses:new Set(r.character.keys.map(k=>k.pose.legR[0].toFixed(2))).size,head:r.character.displayPose.head[1]};});
 check('walk / mine / wave are baked as real pose keys with changing limbs',hero.keys>80&&hero.poses>10&&Math.abs(hero.position[0]+2.25)<1e-5,JSON.stringify(hero));check('partial head pose edits preserve the baked body motion',Math.abs(hero.head-15)<1e-5);
 await get(()=>STUDIO.seek(6,true));check('object keys really spin and lift the extracted block/item',await get(()=>Math.abs(STUDIO.objects.find(r=>r.name==='Spinning sword').root.rotation.y-2*Math.PI)<1e-5&&Math.abs(STUDIO.objects.find(r=>r.name==='Levitating ore').root.position.y-4)<1e-5));
 check('camera travel samples the generated path',await get(()=>STUDIO.camera.position.distanceTo(STUDIO.camTrack.sample(6).position)<1e-6&&STUDIO.camTrack.keys.length===3));
 check('lighting commands affect actual editor lighting',await get(()=>STUDIO.light.az===80&&STUDIO.light.el===30&&STUDIO.light.power===2.5&&STUDIO.scene.fog===null));
 check('unmentioned original Bob demo keys remain intact',await page.evaluate(keys=>JSON.stringify(STUDIO.objects.find(r=>r.name==='Bob').character.keys)===keys,JSON.stringify(starter.objects.find(r=>r.type==='character').character.keys)));
 const afterCore=await get(core);await page.locator('#undo').click();check('one Undo restores the old terrain, objects, keys, lighting and duration',await get(core)===beforeCore);await page.locator('#redo').click();await get(()=>STUDIO.seek(6,true));check('Redo restores the generated scene without another API call',await get(core)===afterCore&&requests.filter(r=>r.method==='POST').length===1);
 // Save generated content normally; neither credentials nor AI client state should be serialized.
 const promise=page.waitForEvent('download');await page.locator('#save-project').click();const d=await promise,file=path.join(out,'gemini-generated-scene.bloxd.json');await d.saveAs(file);const savedText=fs.readFileSync(file,'utf8'),saved=JSON.parse(savedText);
 check('saved projects contain generated animation, not the API key',!savedText.includes(KEY)&&saved.objects.some(r=>r.name==='Gemini walker'&&r.character.keys.length>80));
 check('API key is not written to browser storage',await get(()=>!localStorage.length&&!sessionStorage.length));
 await page.evaluate(data=>STUDIO.loadProject(data),starter);await page.setInputFiles('#project-file',file);await page.waitForFunction(()=>STUDIO.objects.some(r=>r.name==='Gemini walker'));await get(()=>STUDIO.seek(6,true));check('generated scenes reload with working object and camera animation',await get(()=>STUDIO.timeline.duration===12&&Math.abs(STUDIO.objects.find(r=>r.name==='Spinning sword').root.rotation.y-2*Math.PI)<1e-6));
 await page.evaluate(data=>STUDIO.loadProject(data),starter);await open();await page.locator('#ai-mode').selectOption('new');
 const fresh={title:'Night hill walk',summary:'A fresh small scene.',commands:[{op:'duration',seconds:8},{op:'terrain_height',center:[0,0],size:[12,12],baseY:-3,height:0,variation:2,seed:3,block:'grass'},{op:'terrain_fill',from:[-4,2,0],to:[4,2,1],block:'planks'},{op:'add',id:'solo',kind:'character',name:'Solo',position:[-3,0,0],grounded:true},{op:'motion',id:'solo',preset:'walk',start:0,end:8,from:[-3,0,0],to:[3,0,0],grounded:true},{op:'camera',keys:[{time:0,position:[12,9,14],target:[0,2,0]},{time:8,position:[-10,8,13],target:[0,2,0]}]},{op:'lighting',preset:'night'}]};
 await setJSON(fresh);check('new-scene replacement is explicit and gated by review',await page.locator('#ai-ack-row').isVisible()&&await page.locator('#ai-apply').isDisabled());await confirm();await page.locator('#ai-play-after').uncheck();await page.locator('#ai-apply').click();await page.waitForFunction(()=>!document.querySelector('#ai-dialog').open);
 check('new mode replaces the scene and persists its new title',await get(()=>STUDIO.objects.length===1&&STUDIO.selected.name==='Solo'&&STUDIO.projectData().sceneName==='Night hill walk'&&document.querySelector('#scene-title').textContent.includes('Night hill walk')));
 check('ground-following motion uses the newly built bridge height',await get(()=>STUDIO.objects[0].character.keys.every(k=>Math.abs(k.position[1]-3)<1e-6)));
 await open();await page.locator('#ai-undo').click();check('Undo last AI change restores a whole replaced scene',await get(core)===beforeCore);
 // The compiler must reject invalid plans without any partial edits.
 await page.locator('#ai-mode').selectOption('edit');const invalid=[
 ['arbitrary code',{op:'execute_code',code:'window.__AI_EXECUTED=true'}],['unknown item',{op:'add',id:'bad',kind:'tool',asset:'Imaginary texture',position:[0,2,0]}],
 ['oversized terrain',{op:'terrain_fill',from:[-50,-50,-50],to:[50,50,50],block:'grass'}],['unknown target',{op:'transform',id:'missing',position:[0,0,0]}],
 ['wrong numeric type',{op:'duration',seconds:'8'}],['invalid light',{op:'lighting',intensity:999}],['reserved alias',{op:'add',id:'object-999',kind:'block',block:'stone',position:[0,3,0]}],
 ['unsafe property',{op:'lighting',url:'https://evil.example/steal'}],['camera on target',{op:'camera',keys:[{time:0,position:[0,2,0],target:[0,2,0]}]}]
 ];
 for(const[name,command]of invalid){const result=await page.evaluate(command=>{const before=JSON.stringify(STUDIO.projectData());try{STUDIO.ai.compile({title:'Bad',summary:'',commands:[{op:'terrain_fill',from:[0,4,0],to:[0,4,0],block:'stone'},command]});return{blocked:false,unchanged:false};}catch(e){return{blocked:true,message:e.message,unchanged:before===JSON.stringify(STUDIO.projectData())};}},command);check('rejects '+name+' atomically',result.blocked&&result.unchanged);}
 check('generated code has never been executed',await get(()=>window.__AI_EXECUTED===undefined));
 await setJSON({title:'Clear terrain only',summary:'Local command test.',commands:[{op:'clear_terrain'}]});await confirm();await page.locator('#ai-apply').click();await page.waitForFunction(()=>!document.querySelector('#ai-dialog').open);check('clear_terrain clears terrain but preserves independent objects',await get(()=>STUDIO.world.count===0&&STUDIO.objects.length===9));await page.locator('#undo').click();
 // Privacy filtering of private option/skin/audio payloads.
 const privacy=await get(()=>{const r=STUDIO.objects.find(o=>o.character);r.options={privatePayload:'PRIVATE_MODEL_BYTES'};r.character.skinData='PRIVATE_SKIN_BYTES';STUDIO.soundtrack.state.dataURL='PRIVATE_AUDIO_BYTES';const json=JSON.stringify(STUDIO.ai.context());delete r.options.privatePayload;r.character.skinData=null;STUDIO.soundtrack.state.dataURL=null;return json;});
 check('custom skins/audio/private option payloads stay out of AI context',!privacy.includes('PRIVATE_')&&!privacy.includes('dataURL')&&!privacy.includes('skinData'));
 await page.evaluate(data=>STUDIO.loadProject(data),starter);await open();await page.locator('#ai-key').fill(KEY);await page.locator('#ai-prompt').fill('Add a brief animation, using current scene refs.');responseMode='unsafe';await generate();
 check('unsafe model output is blocked at the UI, not executed',await page.locator('#ai-apply').isDisabled()&&(await page.locator('#ai-status').textContent()).includes('Unknown command')&&await get(()=>window.__AI_EXECUTED===undefined));
 for(const mode of ['quota','bad-json','truncated','blocked']){responseMode=mode;const count=requests.length,prior=await get(core);await generate();await page.waitForTimeout(150);check(mode+' response is handled without mutation or automatic retry',await get(core)===prior&&await page.locator('#ai-apply').isDisabled()&&requests.length===count+1,await page.locator('#ai-status').textContent());}
 responseMode='auth';await page.locator('#ai-models').click();await page.waitForFunction(()=>!STUDIO.ai.busy);check('API errors redact the key',!(await page.locator('#ai-status').textContent()).includes(KEY)&&(await page.locator('#ai-status').textContent()).includes('[redacted]'));
 responseMode='unsafe';await page.locator('.ai-api-options summary').click();await page.locator('#ai-json-only').check();await generate();
 check('JSON compatibility mode omits only the remote schema, not local validation',!requests.at(-1).body.generationConfig.responseJsonSchema&&await page.locator('#ai-apply').isDisabled()&&await get(()=>window.__AI_EXECUTED===undefined));await page.locator('#ai-json-only').uncheck();
 await page.locator('#ai-model').selectOption('custom');await page.locator('#ai-custom-model').fill('https://evil.example/collect');const modelRequests=requests.length;await generate();
 check('custom model field cannot redirect a key to another endpoint',requests.length===modelRequests&&(await page.locator('#ai-status').textContent()).includes('not a URL'));await page.locator('#ai-model').selectOption('auto');
 responseMode='good';modelPlan={title:'A safe small change',summary:'Change only the light.',commands:[{op:'lighting',preset:'night'}]};await generate();await get(()=>{STUDIO.world.set(10,0,0,'stone');STUDIO.world.rebuild();});await page.locator('#ai-apply').click();
 check('a plan cannot overwrite changes made after its review snapshot',await get(()=>STUDIO.world.get(10,0,0)==='stone'&&STUDIO.light.preset==='golden')&&(await page.locator('#ai-status').textContent()).includes('changed'));
 await page.locator('.ai-json-details').evaluate(el=>el.open=true);await page.locator('#ai-validate').click();await page.locator('#ai-apply').click();await page.waitForFunction(()=>!document.querySelector('#ai-dialog').open);check('explicit revalidation safely uses the current scene',await get(()=>STUDIO.light.preset==='night'&&STUDIO.world.get(10,0,0)==='stone'));
 await open();responseMode='hold';await page.locator('#ai-generate').click();await page.waitForFunction(()=>STUDIO.ai.busy);await page.locator('#ai-cancel').click();check('Cancel aborts generation and keeps Apply disabled',await get(()=>!STUDIO.ai.busy)&&await page.locator('#ai-apply').isDisabled());for(const release of heldResponses.splice(0))await release();await page.waitForTimeout(100);check('late responses after cancellation cannot mutate the scene',await get(()=>STUDIO.light.preset==='night')&&await page.locator('#ai-apply').isDisabled());
 await page.evaluate(()=>{window.__originalTimeout=window.setTimeout;window.setTimeout=(fn,ms,...args)=>window.__originalTimeout(fn,ms===90000?60:ms,...args);});await page.locator('#ai-generate').click();await page.waitForFunction(()=>!STUDIO.ai.busy);check('network timeout is reported without applying anything',(await page.locator('#ai-status').textContent()).includes('too long')&&await page.locator('#ai-apply').isDisabled());await page.evaluate(()=>{window.setTimeout=window.__originalTimeout;delete window.__originalTimeout;});for(const release of heldResponses.splice(0))await release();
 responseMode='good';await page.locator('#ai-forget-key').click();check('Forget clears the session key and disables generation',(await page.locator('#ai-key').inputValue())===''&&await page.locator('#ai-generate').isDisabled());
 const networkBefore=requests.length;await page.locator('#ai-example').click();check('offline command example works without a key or API request',requests.length===networkBefore&&(await page.locator('#ai-source').textContent()).includes('NOT generated by Gemini'));
 await page.screenshot({path:path.join(out,'gemini-offline-example.png')});await closeDialog();await page.evaluate(data=>STUDIO.loadProject(data),starter);
 // An AI batch folds pending manual changes into the result, then Undo restores the draft.
 await get(()=>STUDIO.select(STUDIO.objects.find(r=>r.type==='block')));await page.locator('#rot-y').fill('45');await page.locator('#key-time').fill('2');await page.locator('#key-time').press('Tab');const pendingId=await get(()=>STUDIO.selected.id);
 await setJSON({title:'Keep manual edits',summary:'Only change lighting, keeping the pending block edit.',commands:[{op:'lighting',preset:'day'}]});await page.locator('#ai-play-after').uncheck();await page.locator('#ai-apply').click();await page.waitForFunction(()=>!document.querySelector('#ai-dialog').open);
 check('applying a plan preserves pending manual keyframe edits',await page.evaluate(id=>{const r=STUDIO.objects.find(r=>r.id===id);return !r.draft&&r.keys.some(k=>k.time===2&&Math.abs(k.rotation[1]-Math.PI/4)<1e-6);},pendingId));await page.locator('#undo').click();
 check('Undo AI restores pending manual edits, not just the keyed scene',await page.evaluate(id=>{const r=STUDIO.objects.find(r=>r.id===id);return !!r.draft&&r.keys.length===0&&Math.abs(r.root.rotation.y-Math.PI/4)<1e-6;},pendingId));
 await page.evaluate(data=>STUDIO.loadProject(data),starter);
 const fixture=path.join(out,'ai-import.obj');fs.writeFileSync(fixture,'v -1 0 -1\nv 1 0 -1\nv 0 2 0\nf 1 2 3\n');await page.setInputFiles('#file',fixture);await page.waitForFunction(()=>STUDIO.selected.type==='import');const imported=await get(()=>({id:STUDIO.selected.id,uuid:STUDIO.selected.root.uuid}));
 await setJSON({title:'Animate my imported mesh',summary:'Spin an existing import, without uploading its geometry.',commands:[{op:'animate',id:imported.id,rotationMode:'spins',keys:[{time:0,rotation:[0,0,0]},{time:8,rotation:[0,360,0]}]}]});await page.locator('#ai-apply').click();await page.waitForFunction(()=>!document.querySelector('#ai-dialog').open);await get(()=>STUDIO.seek(4));
 check('AI commands animate an existing imported model without replacing its geometry',await page.evaluate(x=>{const r=STUDIO.objects.find(r=>r.id===x.id);return r.root.uuid===x.uuid&&Math.abs(r.root.rotation.y-Math.PI)<1e-6;},imported));await page.locator('#undo').click();
 check('Undo retains the exact imported object rather than reparsing it',await page.evaluate(x=>{const r=STUDIO.objects.find(r=>r.id===x.id);return r.root.uuid===x.uuid&&r.keys.length===0;},imported));await page.evaluate(data=>STUDIO.loadProject(data),starter);
 check('no unexpected JavaScript or local-asset errors',errors.length===0,errors.join(' | '));check('no request was sent to an unexpected external service',unexpected.length===0,unexpected.join(' | '));
}catch(e){check('Gemini regression runner completed',false,e.stack);}
finally{await browser.close();fs.writeFileSync(path.join(out,'gemini-report.json'),JSON.stringify({date:'2026-10-23',version:'4.0.0',appURL:process.env.APP_URL||'http://127.0.0.1:8000/',apiTesting:'Mocked Google responses only; no real API key, paid request or live model-quality claim.',checks,errors,unexpected},null,2));const failures=checks.filter(c=>!c.pass);console.log(`\n${checks.length-failures.length}/${checks.length} Gemini checks passed.`);process.exitCode=failures.length?1:0;}
