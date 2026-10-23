import lamejs from '../vendor/lamejs.js';

// An original synthesized effects track, or a user-supplied local audio file.
// Encoding is entirely in-browser; MP3 is audio only, never a renamed video.
export class Soundtrack {
 constructor(){this.state={source:'builtin',volume:.7,offset:0,loop:false,name:'',dataURL:null};this.decoded=null;this.ctx=null;this.source=null;this.token=0;this.cache=null;this.revision=0;}
 context(){if(!this.ctx){const C=window.AudioContext||window.webkitAudioContext;if(!C)throw new Error('Web Audio is not available in this browser.');this.ctx=new C();}return this.ctx;}
 invalidate(){this.cache=null;this.revision++;}
 async loadFile(file){if(file.size>15*1024*1024)throw new Error('Choose an audio file under 15 MB.');const data=await file.arrayBuffer();const buffer=await this.context().decodeAudioData(data.slice(0));
  const dataURL=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
  this.stopPreview();this.decoded=buffer;Object.assign(this.state,{source:'import',name:file.name,dataURL});this.invalidate();return buffer.duration;
 }
 async loadState(data){this.stopPreview();this.state={source:'builtin',volume:.7,offset:0,loop:false,name:'',dataURL:null,...data};this.state.volume=Math.max(0,Math.min(1,+this.state.volume||0));this.state.offset=Math.max(0,Math.min(60,+this.state.offset||0));
  if(this.state.dataURL){if(!/^data:/.test(this.state.dataURL)||this.state.dataURL.length>24e6)throw new Error('Audio must be embedded in the project.');const raw=atob(this.state.dataURL.split(',')[1]),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);this.decoded=await this.context().decodeAudioData(bytes.buffer);}
  else this.decoded=null;
  if(this.state.source==='import'&&!this.decoded)this.state.source='builtin';this.invalidate();
 }
 pcm(duration){
  const sr=44100,n=Math.max(1,Math.round(duration*sr)),key=JSON.stringify([duration,this.revision,this.state.source,this.state.volume,this.state.offset,this.state.loop]);if(this.cache?.key===key)return this.cache.pcm;
  const samples=new Float32Array(n),state=this.state;
  if(state.source==='import'&&this.decoded){
   const b=this.decoded,channels=Array.from({length:b.numberOfChannels},(_,i)=>b.getChannelData(i));
   for(let i=0;i<n;i++){
    let p=(i/sr-state.offset)*b.sampleRate;if(p<0)continue;if(state.loop)p%=b.length;if(p>=b.length)continue;
    const a=Math.floor(p),f=p-a;let v=0;for(const c of channels)v+=(c[a]||0)*(1-f)+(c[Math.min(b.length-1,a+1)]||0)*f;samples[i]=v/channels.length;
   }
  }else if(state.source==='builtin'){
   let seed=20261022,low=0;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296*2-1;};
   for(let i=0;i<n;i++){low=low*.985+rand()*.015;samples[i]=low*.025;}
   const hit=(at,metal)=>{const start=Math.round(at*sr),len=Math.round((metal?.22:.13)*sr);for(let j=0;j<len&&start+j<n;j++){
    const t=j/sr,attack=Math.min(1,t/.003),env=Math.exp(-t*(metal?24:40));
    const tone=metal?(Math.sin(2*Math.PI*1750*t)*.15+Math.sin(2*Math.PI*2760*t)*.065):Math.sin(2*Math.PI*150*t)*.14;
    samples[start+j]+=attack*env*(tone+rand()*(metal?.14:.19));
   }};
   for(let base=0;base<duration;base+=8){for(const time of[.35,.7,1.05,2.65,2.98])hit(base+time,false);for(const time of[4.65,5.95])hit(base+time,true);}
  }
  for(let i=0;i<n;i++)samples[i]=Math.max(-1,Math.min(1,samples[i]*state.volume));
  const pcm={samples,sampleRate:sr,duration:n/sr};this.cache={key,pcm};return pcm;
 }
 audioBuffer(duration){const pcm=this.pcm(duration),buf=this.context().createBuffer(1,pcm.samples.length,pcm.sampleRate);buf.copyToChannel(pcm.samples,0);return buf;}
 stopPreview(){this.token++;if(this.source){try{this.source.stop();}catch{}this.source.disconnect();this.source=null;}}
 async preview(time,duration){this.stopPreview();if(this.state.source==='silent'||time>=duration)return;const token=this.token,ctx=this.context();await ctx.resume();if(token!==this.token)return;const source=ctx.createBufferSource();source.buffer=this.audioBuffer(duration);source.connect(ctx.destination);source.start(0,Math.max(0,time));this.source=source;}
 async recordingStream(duration,monitor=false){
  this.stopPreview();const ctx=this.context();await ctx.resume();const dest=ctx.createMediaStreamDestination(),source=ctx.createBufferSource();source.buffer=this.audioBuffer(duration);source.connect(dest);if(monitor)source.connect(ctx.destination);
  return{stream:dest.stream,start(offset=0){source.start(0,Math.max(0,Math.min(duration-.001,offset)));},stop(){try{source.stop();}catch{}source.disconnect();dest.disconnect();dest.stream.getTracks().forEach(t=>t.stop());}};
 }
 async mp3(duration,progress=()=>{}){
  const {samples,sampleRate}=this.pcm(duration),encoder=new lamejs.Mp3Encoder(1,sampleRate,128),chunks=[];
  for(let start=0,i=0;start<samples.length;start+=1152,i++){
   const block=new Int16Array(Math.min(1152,samples.length-start));for(let j=0;j<block.length;j++){const v=samples[start+j];block[j]=Math.round(v*(v<0?32768:32767));}
   const bytes=encoder.encodeBuffer(block);if(bytes.length)chunks.push(new Uint8Array(bytes));
   if(i%28===0){progress(start/samples.length);await new Promise(r=>setTimeout(r,0));}
  }
  const last=encoder.flush();if(last.length)chunks.push(new Uint8Array(last));progress(1);return new Blob(chunks,{type:'audio/mpeg'});
 }
}
