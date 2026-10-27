// Clip-assembly math for the montage editor: trim sanitizing, the concatenated
// timeline (which clip owns which output second, and where in its source file
// that frame lives) and drawImage fit rectangles for contain/cover/stretch.
// Pure functions — no DOM, no media elements — so the whole editor is testable.
export const MAX_ASSEMBLY_SECONDS=600;

// Clamps a clip's trim to sane values inside its own duration.
export function sanitizeTrim(clip={}){
  const raw=+clip.duration;
  const duration=Number.isFinite(raw)&&raw>0?raw:0;
  let inPoint=+clip.inPoint;
  if(!Number.isFinite(inPoint))inPoint=0;
  inPoint=Math.max(0,Math.min(inPoint,duration));
  let outPoint=+clip.outPoint;
  if(!Number.isFinite(outPoint)||outPoint<=0)outPoint=duration;
  outPoint=Math.max(inPoint,Math.min(outPoint,duration));
  return {inPoint,outPoint,duration};
}
// Lays the kept clips end to end. Returns {entries,duration}; entries carry the
// clip index (into the source array) plus their output window and trim.
export function buildTimeline(clips){
  const entries=[];let start=0;
  if(Array.isArray(clips))clips.forEach((clip,index)=>{
    const {inPoint,outPoint,duration}=sanitizeTrim(clip);
    const length=outPoint-inPoint;
    if(!(length>0.0005))return; // fully trimmed away — skipped, never zero-length
    entries.push({index,clip,start,end:start+length,duration:length,inPoint,outPoint,sourceDuration:duration});
    start+=length;
  });
  return {entries,duration:start};
}
// Where does output time t live? Binary search → {entry, local source second}.
export function timelineAt(timeline,t){
  const entries=timeline?.entries||[];
  if(!entries.length||!Number.isFinite(timeline.duration)||timeline.duration<=0)return null;
  const time=Math.max(0,Math.min(+t||0,timeline.duration-1e-9));
  let lo=0,hi=entries.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(entries[mid].end<=time)lo=mid+1;else hi=mid;}
  const entry=entries[lo];
  return {entry,local:entry.inPoint+(time-entry.start)};
}
// drawImage arguments that fit a vw×vh source into a w×h frame.
export function fitRect(vw,vh,w,h,mode='contain'){
  w=Math.max(1,Math.round(+w)||1);h=Math.max(1,Math.round(+h)||1);
  vw=+vw>0?+vw:w;vh=+vh>0?+vh:h;
  if(mode==='stretch')return {sx:0,sy:0,sw:vw,sh:vh,dx:0,dy:0,dw:w,dh:h};
  if(mode==='cover'){
    const s=Math.max(w/vw,h/vh),sw=w/s,sh=h/s;
    return {sx:(vw-sw)/2,sy:(vh-sh)/2,sw,sh,dx:0,dy:0,dw:w,dh:h};
  }
  const s=Math.min(w/vw,h/vh),dw=vw*s,dh=vh*s;
  return {sx:0,sy:0,sw:vw,sh:vh,dx:(w-dw)/2,dy:(h-dh)/2,dw,dh};
}
