import { Output, BufferTarget, Mp4OutputFormat, WebMOutputFormat, CanvasSource, AudioBufferSource, Quality, canEncodeVideo, canEncodeAudio, Input, BlobSource, WebMInputFormat, Mp4InputFormat, Conversion } from '../vendor/mediabunny.mjs';

const cancelError=()=>new DOMException('Video export cancelled.','AbortError');
const checkAbort=signal=>{if(signal?.aborted)throw cancelError();};
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
function waitFor(promise,signal,timeout=45000){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){Promise.resolve(promise).catch(()=>{});reject(cancelError());return;}
  let timer;const clear=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
  const abort=()=>{clear();reject(cancelError());};signal?.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>{clear();reject(new Error('The video encoder stopped responding. Try WebM or a lower resolution.'));},timeout);
  Promise.resolve(promise).then(value=>{clear();resolve(value);},error=>{clear();reject(error);});
 });
}
export async function chooseVideoConfig({format='auto',width=960,height=540,fps=24,withAudio=false,signal}={}){
 if(!['auto','mp4','webm'].includes(format))throw new Error('Choose Auto, MP4 or WebM.');
 const bitrate=Math.max(1400000,Math.min(10000000,Math.round(width*height*fps*.22))),quality=new Quality({bitrate});
 const audioSupport=async codec=>!withAudio||typeof AudioEncoder==='function'&&await waitFor(canEncodeAudio(codec,{numberOfChannels:1,sampleRate:48000,quality:new Quality({bitrate:128000})}),signal);
 if(typeof VideoEncoder==='function'){
  if(format!=='webm'&&await waitFor(canEncodeVideo('avc',{width,height,frameRate:fps,quality}),signal)&&await audioSupport('aac'))return{method:'frames',format:'mp4',videoCodec:'avc',audioCodec:withAudio?'aac':null,width,height,fps,bitrate};
  if(format!=='mp4'&&await audioSupport('opus'))for(const videoCodec of['vp9','vp8'])if(await waitFor(canEncodeVideo(videoCodec,{width,height,frameRate:fps,quality}),signal))return{method:'frames',format:'webm',videoCodec,audioCodec:withAudio?'opus':null,width,height,fps,bitrate,notice:format==='auto'?'Using WebM because compatible MP4 encoders are not available for these settings.':''};
 }
 checkAbort(signal);
 if(typeof MediaRecorder==='function'){
  const mp4=withAudio?['video/mp4;codecs=avc1.42001f,mp4a.40.2']:['video/mp4;codecs=avc1.42001f'];
  const webm=withAudio?['video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus']:['video/webm;codecs=vp8','video/webm;codecs=vp9'];
  const candidates=format==='mp4'?mp4:format==='webm'?webm:[...mp4,...webm],mime=candidates.find(value=>MediaRecorder.isTypeSupported(value));
  if(mime)return{method:'realtime',format:mime.startsWith('video/mp4')?'mp4':'webm',mime,withAudio,width,height,fps,bitrate,notice:'This browser needs real-time capture. Keep this tab visible; timing and smoothness depend on your device.'};
 }
 if(format==='mp4')throw new Error('MP4'+(withAudio?' with AAC sound':'')+' is not supported by this browser. Choose Auto / WebM, or turn off sound for a silent MP4.');
 throw new Error('No supported video encoder is available. Open the downloaded editor in a current Chrome or Edge browser (HTTPS or a local file).');
}
export async function renderVideoFrames({canvas,duration,config,drawFrame,audioBuffer=null,signal,onProgress=()=>{},title='Bloxd animation'}){
 const format=config.format==='mp4'?new Mp4OutputFormat({fastStart:'in-memory'}):new WebMOutputFormat(),target=new BufferTarget(),output=new Output({format,target});
 const video=new CanvasSource(canvas,{codec:config.videoCodec,quality:new Quality({bitrate:config.bitrate}),latencyMode:'quality',keyFrameInterval:2});
 output.addVideoTrack(video,{frameRate:config.fps});let audio=null,audioFailure=null,audioTask=Promise.resolve();
 if(audioBuffer&&config.audioCodec){audio=new AudioBufferSource({codec:config.audioCodec,quality:new Quality({bitrate:128000}),transform:{numberOfChannels:1,sampleRate:48000}});output.addAudioTrack(audio);}
 output.setMetadataTags({title});const abort=()=>{output.cancel().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
 try{
  checkAbort(signal);await waitFor(output.start(),signal);
  // Feed tracks concurrently: neither muxer nor encoder can wait forever for
  // another track whose data hasn't been submitted yet.
  if(audio)audioTask=audio.add(audioBuffer).then(()=>audio.close()).catch(error=>{audioFailure=error;});
  const frames=Math.max(1,Math.ceil(duration*config.fps));
  for(let i=0;i<frames;i++){
   checkAbort(signal);if(audioFailure)throw audioFailure;
   const t=i/config.fps,span=Math.min(1/config.fps,duration-t);await drawFrame(t);
   await waitFor(video.add(t,span),signal);onProgress({phase:'render',frame:i+1,total:frames,time:t,duration,method:'frames',format:config.format});
   await pause();
  }
  video.close();onProgress({phase:'finalize',frame:frames,total:frames,time:duration,duration,method:'frames',format:config.format});
  await waitFor(audioTask,signal);if(audioFailure)throw audioFailure;await waitFor(output.finalize(),signal,60000);checkAbort(signal);
  const blob=new Blob([target.buffer],{type:format.mimeType});if(blob.size<1000)throw new Error('The encoder returned an empty video. Try another format.');
  return{blob,format:config.format,width:config.width,height:config.height,fps:config.fps,frames,duration,hasAudio:!!audio,method:'frames',videoCodec:config.videoCodec,audioCodec:config.audioCodec};
 }catch(e){await output.cancel().catch(()=>{});throw signal?.aborted?cancelError():e;}
 finally{signal?.removeEventListener('abort',abort);}
}
export async function renderRealtimeVideo({canvas,duration,config,drawFrame,audioFactory=null,signal,onProgress=()=>{}}){
 if(!canvas.captureStream)throw new Error('This browser cannot capture canvas video. Use current Chrome or Edge.');
 checkAbort(signal);let audio=null,stream=null,recorder=null,raf=0,deadline=0,start=0,stopTime=0,error=null;
 let requestFrame=null,lastFrame=0,finishing=false;const chunks=[];const end=()=>{if(recorder?.state==='recording'){stopTime=performance.now();recorder.stop();}};
 const cleanup=()=>{clearTimeout(deadline);cancelAnimationFrame(raf);audio?.stop();stream?.getTracks().forEach(t=>t.stop());signal?.removeEventListener('abort',end);};
 try{
  if(config.withAudio&&audioFactory)audio=await waitFor(audioFactory(),signal,15000);
  checkAbort(signal);drawFrame(0);stream=canvas.captureStream(0);const track=stream.getVideoTracks()[0];if(typeof track.requestFrame==='function')requestFrame=()=>track.requestFrame();else{stream.getTracks().forEach(t=>t.stop());stream=canvas.captureStream(config.fps);}if(audio)audio.stream.getAudioTracks().forEach(track=>stream.addTrack(track));
  recorder=new MediaRecorder(stream,{mimeType:config.mime,videoBitsPerSecond:config.bitrate,audioBitsPerSecond:128000});
  const stopped=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onerror=e=>{error=e.error||new Error('Real-time video recording failed.');end();};recorder.onstop=()=>error?reject(error):resolve();});
  signal?.addEventListener('abort',end,{once:true});checkAbort(signal);start=performance.now();recorder.start(250);audio?.start(0);requestFrame?.();
  const finish=()=>{if(finishing||recorder.state!=='recording')return;finishing=true;cancelAnimationFrame(raf);clearTimeout(deadline);drawFrame(duration);requestFrame?.();onProgress({phase:'render',time:duration,duration,method:'realtime',format:config.format});deadline=setTimeout(end,Math.max(120,2000/config.fps));};
  const frame=()=>{if(recorder.state!=='recording'||finishing)return;const t=Math.min(duration,(performance.now()-start)/1000);if(t>=duration){finish();return;}if(t-lastFrame>=1/config.fps-.001){drawFrame(t);requestFrame?.();lastFrame=t;}onProgress({phase:'render',time:t,duration,method:'realtime',format:config.format});raf=requestAnimationFrame(frame);};
  deadline=setTimeout(finish,duration*1000);raf=requestAnimationFrame(frame);
  await waitFor(stopped,signal,(duration+45)*1000);checkAbort(signal);cleanup();
  const raw=new Blob(chunks,{type:config.format==='mp4'?'video/mp4':'video/webm'});if(raw.size<1000)throw new Error('The recorder returned no usable video. Keep the tab visible and try again.');
  // MediaRecorder emits streaming containers. Re-mux their existing packets
  // into a seekable file; do NOT rewrite EBML parent sizes around unknown-sized
  // clusters (the old duration patch produced invalid-container warnings).
  onProgress({phase:'finalize',time:duration,duration,method:'realtime',format:config.format});
  const input=new Input({source:new BlobSource(raw),formats:[new WebMInputFormat(),new Mp4InputFormat()]}),target=new BufferTarget(),output=new Output({format:config.format==='mp4'?new Mp4OutputFormat({fastStart:'in-memory'}):new WebMOutputFormat(),target});
  const cancel=()=>{output.cancel().catch(()=>{});};signal?.addEventListener('abort',cancel,{once:true});
  try{
   const conversion=await waitFor(Conversion.init({input,output,copy:{mode:'forced',shiftTolerance:.5},showWarnings:false}),signal);
   if(!conversion.isValid||conversion.discardedTracks.length)throw new Error('The recording could not be finalized without losing a media track. Try another format or browser.');
   await waitFor(conversion.execute(),signal);checkAbort(signal);
   const actualDuration=await waitFor(input.computeDuration(),signal),blob=new Blob([target.buffer],{type:output.format.mimeType});
   return{blob,format:config.format,width:config.width,height:config.height,fps:config.fps,duration:Number.isFinite(actualDuration)?actualDuration:(stopTime-start)/1000,hasAudio:!!audio,method:'realtime',frames:null};
  }finally{signal?.removeEventListener('abort',cancel);input.dispose();if(output.state!=='finalized')await output.cancel().catch(()=>{});} 
 }finally{end();cleanup();}
}
