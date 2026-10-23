import { PLAN_SCHEMA, COMMAND_HELP, OFFLINE_PLAN, compilePlan, makeSceneContext, systemInstruction } from './ai-commands.js';
import { generateGeminiPlan, listGeminiModels, validateApiKey } from './gemini-client.js';

export function initGeminiPanel(bridge){
 const $=s=>document.querySelector(s),dialog=$('#ai-dialog');let busy=false,applying=false,controller=null,sequence=0,compiled=null,origin=null,models=[],lastUndo=null,sourceLabel='',lastError='';
 const signature=s=>JSON.stringify(s);
 function status(message,error=false){$('#ai-status').textContent=message;$('#ai-status').classList.toggle('error',error);lastError=error?message:'';}
 function buttons(){
  $('#ai-generate').disabled=busy||!$('#ai-key').value.trim()||!$('#ai-prompt').value.trim();$('#ai-models').disabled=busy||!$('#ai-key').value.trim();
  $('#ai-cancel').hidden=!busy||applying;$('#ai-apply').disabled=busy||!compiled||!compiled.stats.commands||(!$('#ai-ack-row').hidden&&!$('#ai-ack').checked);
  $('#ai-validate').disabled=busy||!$('#ai-json').value.trim();$('#ai-example').disabled=busy;$('#ai-undo').disabled=!lastUndo||!bridge.canUndo(lastUndo)||busy;
  $('#ai-mode').disabled=busy;$('#ai-model').disabled=busy;$('#ai-custom-model').disabled=busy;$('#ai-json-only').disabled=busy;$('#ai-prompt').disabled=busy;$('#ai-json').disabled=busy;
  $('#ai-apply').innerHTML='<svg><use href="#i-play"/></svg>'+($('#ai-play-after').checked?'Apply &amp; play':'Apply scene');dialog.querySelector('.dialog-close').disabled=applying;$('#ai-busy').hidden=!busy;
 }
 function cancel(){sequence++;controller?.abort();controller=null;if(busy&&!applying){busy=false;status('Request cancelled. No scene changes were made. Google may still count a submitted request against your quota.');buttons();}}
 function invalidate(message){compiled=null;origin=null;$('#ai-apply').disabled=true;if(message)status(message);}
 function populateModels(){const select=$('#ai-model'),current=select.value;select.replaceChildren();for(const[value,label]of[['auto','Auto · available Flash text model'],...models.map(m=>[m.id,m.id]),['custom','Custom model ID…']]){const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o);}select.value=[...select.options].some(o=>o.value===current)?current:'auto';$('#ai-custom-row').hidden=select.value!=='custom';}
 function renderPreview(result){
  $('#ai-result').hidden=false;$('#ai-plan-title').textContent=result.title;$('#ai-plan-summary').textContent=result.summary;$('#ai-source').textContent=sourceLabel;
  const stats=$('#ai-stats');stats.replaceChildren();for(const[label,value]of[['new objects',result.stats.created],['changed cells',result.stats.changedCells],['animated objects',result.stats.animatedObjects],['camera keys',result.stats.cameraKeys]]){const box=document.createElement('div'),n=document.createElement('b'),s=document.createElement('span');n.textContent=value;s.textContent=label;box.append(n,s);stats.append(box);}
  const commands=$('#ai-command-list');commands.replaceChildren();result.log.forEach((line,i)=>{const li=document.createElement('li');const n=document.createElement('span');n.textContent=String(i+1).padStart(2,'0');li.append(n,document.createTextNode(line));commands.append(li);});
  $('#ai-warnings').replaceChildren();result.warnings.forEach(w=>{const p=document.createElement('p');p.textContent=w;$('#ai-warnings').append(p);});$('#ai-warnings').hidden=!result.warnings.length;
  const destructive=result.warnings.some(w=>/replaces|removes|clears/i.test(w));$('#ai-ack-row').hidden=!destructive;$('#ai-ack').checked=false;
  status(result.stats.commands?'Plan validated. Review the changes, then Apply & play. Nothing has changed yet.':'No changes proposed. Read the summary or refine your request.');buttons();
 }
 function validate(useCaptured=false,captured=null){
  compiled=null;try{
   const raw=$('#ai-json').value;if(raw.length>200000)throw new Error('The command plan is too large.');const plan=JSON.parse(raw),snapshot=useCaptured?captured:bridge.snapshot();
   const result=compilePlan(plan,snapshot,bridge.catalog,$('#ai-mode').value);compiled=result;origin=signature(snapshot);renderPreview(result);return result;
  }catch(e){$('#ai-result').hidden=false;$('#ai-ack-row').hidden=true;$('#ai-warnings').hidden=true;$('#ai-plan-title').textContent='Plan needs a correction';$('#ai-plan-summary').textContent='No commands were executed. Edit the JSON below and Validate, or generate another plan.';$('#ai-command-list').replaceChildren();$('#ai-stats').replaceChildren();status(e.message,true);buttons();return null;}
 }
 function contextPreview(){const snapshot=bridge.snapshot(),context=makeSceneContext(snapshot,bridge.catalog,$('#ai-prompt').value);$('#ai-context').textContent=JSON.stringify(context,null,2);$('#ai-context-note').textContent=context.objects.length+' object summaries · '+context.terrain.surfaceColumns.length+' terrain columns · '+context.duration+' s clip'+(context.omittedObjects?' · '+context.omittedObjects+' objects omitted':'');return{snapshot,context};}
 function open(){if(!bridge.prepare())return;dialog.showModal();contextPreview();$('#ai-preview-note').hidden=window.self===window.top;buttons();}
 $('#open-ai').onclick=open;
 $('#ai-key').addEventListener('input',()=>{models=[];populateModels();buttons();});$('#ai-prompt').addEventListener('input',buttons);
 $('#ai-show-key').onclick=()=>{const show=$('#ai-key').type==='password';$('#ai-key').type=show?'text':'password';$('#ai-show-key').textContent=show?'Hide':'Show';$('#ai-show-key').setAttribute('aria-pressed',String(show));};
 $('#ai-forget-key').onclick=()=>{cancel();$('#ai-key').value='';$('#ai-key').type='password';$('#ai-show-key').textContent='Show';$('#ai-show-key').setAttribute('aria-pressed','false');models=[];populateModels();status('Key forgotten. It was never saved to browser storage or project files.');buttons();};
 $('#ai-model').onchange=()=>$('#ai-custom-row').hidden=$('#ai-model').value!=='custom';
 $('#ai-models').onclick=async()=>{
  let key;try{key=validateApiKey($('#ai-key').value);}catch(e){status(e.message,true);return;}
  const token=++sequence;controller=new AbortController();busy=true;buttons();status('Checking models available to this key…');
  try{const found=await listGeminiModels(key,controller.signal);if(token!==sequence)return;models=found;populateModels();status(found.length?'Found '+found.length+' Gemini text models. Choose Auto or pick one.':'No suitable text models were listed. Check access or enter a custom model ID.',!found.length);}
  catch(e){if(token===sequence)status(e.name==='AbortError'?'Request cancelled.':e.message,true);}finally{if(token===sequence){busy=false;controller=null;buttons();}}
 };
 $('#ai-generate').onclick=async()=>{
  let key;try{key=validateApiKey($('#ai-key').value);}catch(e){status(e.message,true);return;}
  const {snapshot,context}=contextPreview(),mode=$('#ai-mode').value,token=++sequence;controller=new AbortController();busy=true;invalidate();$('#ai-result').hidden=true;buttons();
  try{
   const result=await generateGeminiPlan({apiKey:key,model:$('#ai-model').value==='custom'?$('#ai-custom-model').value:$('#ai-model').value,prompt:$('#ai-prompt').value.trim(),context,mode,system:systemInstruction(bridge.catalog),schema:PLAN_SCHEMA,signal:controller.signal,knownModels:models,jsonOnly:$('#ai-json-only').checked,onPhase:message=>{if(token===sequence)status(message);}});
   if(token!==sequence)return;models=result.models;populateModels();sourceLabel='Gemini · '+result.model+(result.usage?' · '+result.usage.total.toLocaleString()+' tokens reported':'');$('#ai-json').value=JSON.stringify(result.plan,null,2);
   validate(true,snapshot);if(compiled&&origin!==signature(bridge.snapshot()))invalidate('The scene changed during generation. Validate against the current scene before applying.');
  }catch(e){if(token===sequence)status(e.name==='AbortError'?'Request cancelled. No scene changes were made.':e.message,true);}
  finally{if(token===sequence){busy=false;controller=null;buttons();}}
 };
 $('#ai-cancel').onclick=cancel;
 $('#ai-example').onclick=()=>{sourceLabel='Offline example · NOT generated by Gemini';$('#ai-mode').value='edit';$('#ai-json').value=JSON.stringify(OFFLINE_PLAN,null,2);validate();};
 $('#ai-validate').onclick=()=>{sourceLabel=sourceLabel||'Locally supplied command plan';validate();};
 $('#ai-json').oninput=()=>{sourceLabel='Locally edited command plan';$('#ai-source').textContent=sourceLabel;invalidate('Commands edited. Validate the plan before applying.');buttons();};
 $('#ai-mode').onchange=()=>{invalidate('Scene mode changed. Generate a new plan, or Validate these commands for the new mode.');buttons();};
 $('#ai-ack').onchange=buttons;$('#ai-play-after').onchange=buttons;
 $('#ai-apply').onclick=async()=>{
  if(!compiled||busy||(!$('#ai-ack-row').hidden&&!$('#ai-ack').checked))return;
  const result=compiled,expected=origin;if(signature(bridge.snapshot())!==expected){invalidate('The scene has changed since this preview. Validate again or generate a new plan.');buttons();return;}
  busy=applying=true;buttons();status('Applying validated scene commands…');
  try{await new Promise(resolve=>requestAnimationFrame(resolve));lastUndo=bridge.apply(result,expected,sourceLabel.startsWith('Gemini')?'Gemini':'Command plan');compiled=null;origin=null;status('Applied. One Undo restores the complete previous scene.');busy=applying=false;buttons();dialog.close();if($('#ai-play-after').checked)bridge.play();}
  catch(e){status(e.message,true);}finally{busy=applying=false;buttons();}
 };
 $('#ai-undo').onclick=()=>{if(lastUndo&&bridge.canUndo(lastUndo)){bridge.undo();lastUndo=null;invalidate('AI change undone. Your previous scene is restored.');contextPreview();buttons();}};
 dialog.addEventListener('cancel',e=>{if(applying)e.preventDefault();});dialog.addEventListener('close',()=>{if(!applying)cancel();});
 const help=$('#ai-command-help');for(const[name,description]of COMMAND_HELP){const row=document.createElement('div'),code=document.createElement('code'),p=document.createElement('span');code.textContent=name;p.textContent=description;row.append(code,p);help.append(row);}
 document.querySelectorAll('[data-ai-prompt]').forEach(button=>button.onclick=()=>{$('#ai-prompt').value=button.dataset.aiPrompt;buttons();});
 populateModels();buttons();
 return{open,compile:(plan,mode='edit')=>compilePlan(plan,bridge.snapshot(),bridge.catalog,mode),context:()=>makeSceneContext(bridge.snapshot(),bridge.catalog),get busy(){return busy;},get lastError(){return lastError;}};
}
