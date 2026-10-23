// Bring-your-own-key client. Credentials travel only in Google's HTTPS header,
// never in URLs, prompts, logs, localStorage or project files. No automatic retries.
const API='https://generativelanguage.googleapis.com/v1beta/';
export function validateApiKey(value){const key=String(value||'').trim();if(key.length<16||key.length>4096||/[^\x21-\x7e]/.test(key))throw new Error('Paste only your Gemini API key into the key field (no spaces or command text).');return key;}
export function validateModel(value){const id=String(value||'').replace(/^models\//,'');if(!/^gemini-[A-Za-z0-9][A-Za-z0-9._-]{1,100}$/.test(id))throw new Error('Choose a Gemini text model, or enter its model ID, not a URL.');return id;}
function scrub(message,key){return String(message).split(key).join('[redacted]').replace(/AIza[\w-]{20,}/g,'[redacted]').slice(0,500);}
async function request(path,key,{method='GET',body,signal,timeout=90000}={}){
 const controller=new AbortController();let expired=false;const abort=()=>controller.abort();if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>{expired=true;controller.abort();},timeout);
 try{
  const response=await fetch(API+path,{method,headers:{'x-goog-api-key':key,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'strict-origin-when-cross-origin',mode:'cors'});
  const text=await response.text();if(text.length>2000000)throw new Error('Google returned an oversized response. Try a smaller scene.');let data;try{data=JSON.parse(text);}catch{throw new Error('Google returned a non-JSON response. Check your network and model selection.');}
  if(!response.ok){const detail=scrub(data?.error?.message||'',key);const labels={400:'Google rejected the request or model configuration. If it mentions the schema, try JSON compatibility mode.',401:'The API key was not accepted.',403:'Access was denied. Check the key, its restrictions, project permissions and supported region.',404:'That model is not available. Refresh the model list or choose another.',429:'Your Google quota or rate limit was reached. Check usage/billing or try again later.',500:'Google reported a server error. Try again later.',503:'The model is temporarily unavailable. Try again later.'};throw new Error((labels[response.status]||'Gemini request failed (HTTP '+response.status+').')+(detail?' '+detail:''));}
  return data;
 }catch(error){
  if(expired)throw new Error('Gemini took too long to respond. No scene changes were made. You can retry with a smaller request.');
  if(controller.signal.aborted)throw new DOMException('Request cancelled. No scene changes were made.','AbortError');
  if(error instanceof TypeError)throw new Error('Could not reach Google. Check internet access and key restrictions. The embedded file preview blocks network requests: use the live app or open the downloaded HTML in your browser.');
  throw new Error(scrub(error.message,key));
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export async function listGeminiModels(apiKey,signal){
 const key=validateApiKey(apiKey),models=[];let token='';
 for(let page=0;page<5;page++){
  const result=await request('models?pageSize=1000'+(token?'&pageToken='+encodeURIComponent(token):''),key,{signal,timeout:30000});
  for(const m of result.models||[]){const name=String(m.name||'').replace(/^models\//,'');if(!/^gemini-[\w.-]+$/.test(name)||!m.supportedGenerationMethods?.includes('generateContent')||/embedding|\btts\b|image|audio|live|robotics|computer-use/i.test(name))continue;models.push({id:name,label:String(m.displayName||name).slice(0,120),outputTokenLimit:Number.isFinite(m.outputTokenLimit)?m.outputTokenLimit:16384});}
  token=result.nextPageToken||'';if(!token)break;
 }
 return [...new Map(models.map(m=>[m.id,m])).values()];
}
export function chooseGeminiModel(models){
 for(const id of ['gemini-3.8-flash','gemini-3.6-flash','gemini-3.5-flash','gemini-2.5-flash','gemini-2.5-flash-lite'])if(models.some(m=>m.id===id))return models.find(m=>m.id===id);
 const ordered=models.slice().sort((a,b)=>b.id.localeCompare(a.id,undefined,{numeric:true}));return ordered.find(m=>/flash/.test(m.id)&&!/preview|experimental|exp-/.test(m.id))||ordered.find(m=>/flash/.test(m.id))||ordered[0];
}
export async function generateGeminiPlan({apiKey,model='auto',prompt,context,mode,system,schema,signal,onPhase=()=>{},knownModels=[],jsonOnly=false}){
 const key=validateApiKey(apiKey);if(typeof prompt!=='string'||!prompt.trim()||prompt.length>6000)throw new Error('Describe your animation in 1–6000 characters.');if(prompt.includes(key))throw new Error('Remove your API key from the prompt. Put it only in the password-style key field.');
 let models=knownModels,chosen;
 if(model==='auto'){if(!models.length){onPhase('Checking available Gemini text models…');models=await listGeminiModels(key,signal);}chosen=chooseGeminiModel(models);if(!chosen)throw new Error('No Gemini text models were returned for this key. Check access, or choose a custom supported model ID.');}
 else{const id=validateModel(model);chosen=models.find(m=>m.id===id)||{id,outputTokenLimit:16384};}
 const content=JSON.stringify({request:prompt,mode,scene:context}).split(key).join('[redacted]');if(content.length>180000)throw new Error('The scene summary is too large for this request. Use a smaller scene.');
 onPhase('Planning with '+chosen.id+'…');
 const response=await request('models/'+encodeURIComponent(chosen.id)+':generateContent',key,{signal,method:'POST',body:{
  systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:content}]}],
  generationConfig:{maxOutputTokens:Math.min(16384,chosen.outputTokenLimit||16384),responseMimeType:'application/json',...(jsonOnly?{}:{responseJsonSchema:schema})}
 }});
 if(response.promptFeedback?.blockReason)throw new Error('Google did not process this request ('+String(response.promptFeedback.blockReason).slice(0,80)+'). No scene changes were made.');
 const candidate=response.candidates?.[0];if(candidate?.finishReason==='MAX_TOKENS')throw new Error('The response was cut off at the token limit. Ask for a smaller scene or fewer actions. Nothing was applied.');
 if(candidate?.finishReason&&candidate.finishReason!=='STOP')throw new Error('Gemini did not finish a usable plan ('+String(candidate.finishReason).slice(0,80)+'). No scene changes were made.');
 let raw=(candidate?.content?.parts||[]).filter(p=>typeof p.text==='string'&&!p.thought).map(p=>p.text).join('').trim().replace(/^\uFEFF/,'');
 if(!raw)throw new Error('Gemini returned no command plan. Try a more specific animation request.');if(raw.length>200000)throw new Error('The generated plan is too large. Request a smaller scene.');
 raw=raw.split(key).join('[redacted]');raw=raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');let plan;try{plan=JSON.parse(raw);}catch{throw new Error('Gemini returned invalid JSON. Nothing was executed. Try a shorter, more specific request.');}
 return{plan,model:chosen.id,models,usage:response.usageMetadata?{input:response.usageMetadata.promptTokenCount||0,output:response.usageMetadata.candidatesTokenCount||0,total:response.usageMetadata.totalTokenCount||0}:null};
}
