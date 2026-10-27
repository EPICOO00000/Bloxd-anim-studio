// Smoke tests for the clip-montage math: trim sanitizing, the assembled
// timeline (order, windows, zero-skip), output-time → source-frame lookup and
// the contain/cover/stretch drawImage rectangles. Pure functions only.
import assert from 'node:assert/strict';
import { sanitizeTrim, buildTimeline, timelineAt, fitRect, MAX_ASSEMBLY_SECONDS } from '../lib/video-editor.js';

let n=0;const ok=(c,m)=>{assert.ok(c,m);n++;};
const near=(a,b,m)=>{assert.ok(Math.abs(a-b)<1e-6,m+' (got '+a+', want '+b+')');n++;};

// ── sanitizeTrim ──
ok(MAX_ASSEMBLY_SECONDS===600,'assembly cap is 600 s');
{
  const t=sanitizeTrim({duration:10,inPoint:2,outPoint:7});
  ok(t.inPoint===2&&t.outPoint===7&&t.duration===10,'sane trim passes through');
}
{
  const t=sanitizeTrim({duration:10,inPoint:-3,outPoint:99});
  ok(t.inPoint===0&&t.outPoint===10,'trim clamps into [0, duration]');
}
{
  const t=sanitizeTrim({duration:10,inPoint:0,outPoint:0});
  ok(t.outPoint===10,'outPoint 0 defaults to the full duration');
}
{
  const t=sanitizeTrim({duration:10,inPoint:8,outPoint:4});
  ok(t.inPoint===8&&t.outPoint===8,'outPoint never lands before inPoint');
}
{
  const t=sanitizeTrim({duration:10,inPoint:NaN,outPoint:undefined});
  ok(t.inPoint===0&&t.outPoint===10,'junk values fall back to the whole clip');
}
{
  const t=sanitizeTrim({duration:0});
  ok(t.inPoint===0&&t.outPoint===0&&t.duration===0,'zero/negative durations sanitize to 0');
  const t2=sanitizeTrim({duration:-5,inPoint:1,outPoint:2});
  ok(t2.duration===0&&t2.inPoint===0&&t2.outPoint===0,'negative duration collapses');
}

// ── buildTimeline ──
{
  const clips=[
    {name:'a',duration:10,inPoint:1,outPoint:4},   // 3 s kept
    {name:'b',duration:8,inPoint:0,outPoint:0},    // whole 8 s
    {name:'c',duration:5,inPoint:2,outPoint:2.0002}// trimmed away (< 0.0005 s)
  ];
  const tl=buildTimeline(clips);
  ok(tl.entries.length===2,'fully trimmed clips are skipped');
  near(tl.duration,11,'timeline duration is the sum of kept lengths');
  ok(tl.entries[0].index===0&&tl.entries[1].index===1,'entries keep their source index');
  near(tl.entries[0].start,0,'first entry starts at 0');
  near(tl.entries[0].end,3,'first entry ends at its kept length');
  near(tl.entries[1].start,3,'second entry starts where the first ends');
  near(tl.entries[1].end,11,'second entry ends at the timeline end');
  ok(tl.entries[0].clip===clips[0],'entries carry the clip object');
  near(tl.entries[0].inPoint,1,'entries keep the trim in-point');
  near(tl.entries[1].outPoint,8,'entries keep the trim out-point');
  near(tl.entries[0].sourceDuration,10,'entries keep the source duration');
}
{
  const tl=buildTimeline([]);
  ok(tl.entries.length===0&&tl.duration===0,'no clips → empty timeline');
  const tl2=buildTimeline(null);
  ok(tl2.entries.length===0&&tl2.duration===0,'null input is tolerated');
}

// ── timelineAt ──
{
  const clips=[{duration:10,inPoint:2,outPoint:6},{duration:5,inPoint:0,outPoint:3}];
  const tl=buildTimeline(clips); // 4 s + 3 s = 7 s
  let hit=timelineAt(tl,0);
  ok(hit.entry===tl.entries[0],'t=0 lands in the first entry');
  near(hit.local,2,'t=0 maps to the first entry in-point');
  hit=timelineAt(tl,1.5);
  near(hit.local,3.5,'mid-entry time maps to inPoint + elapsed');
  hit=timelineAt(tl,4);
  ok(hit.entry===tl.entries[1],'exact boundary belongs to the next entry');
  near(hit.local,0,'boundary maps to the next entry in-point');
  hit=timelineAt(tl,6.9999999999);
  ok(hit.entry===tl.entries[1],'t just under the end stays in the last entry');
  hit=timelineAt(tl,99);
  ok(hit.entry===tl.entries[1],'t past the end clamps to the last entry');
  near(hit.local,3,'clamped t maps to the last entry out-point');
  hit=timelineAt(tl,-5);
  ok(hit.entry===tl.entries[0],'negative t clamps to the start');
  ok(timelineAt(buildTimeline([]),1)===null,'empty timeline → null');
  ok(timelineAt(null,1)===null,'null timeline → null');
}

// ── fitRect ──
{
  const r=fitRect(1920,1080,960,540,'contain');
  ok(r.sx===0&&r.sy===0&&r.sw===1920&&r.sh===1080,'contain uses the whole source');
  near(r.dx,0,'16:9 into 16:9 fills exactly (x)');
  near(r.dw,960,'16:9 into 16:9 fills exactly (w)');
}
{
  const r=fitRect(1080,1920,960,540,'contain'); // portrait into landscape
  near(r.dw,303.75,'portrait contain width = 540 * 1080/1920');
  near(r.dh,540,'portrait contain fills the height');
  near(r.dx,(960-303.75)/2,'contain centers horizontally (bars)');
  near(r.dy,0,'contain has no vertical offset when height-bound');
}
{
  const r=fitRect(1080,1920,960,540,'cover'); // portrait into landscape, cropped
  ok(r.dw===960&&r.dh===540,'cover fills the frame exactly');
  near(r.sw,1080,'cover keeps the full source width');
  near(r.sh,540/(960/1080),'cover crops the source height to the frame ratio');
  near(r.sx,0,'cover crop is centered (x)');
  near(r.sy,(1920-r.sh)/2,'cover crop is centered (y)');
}
{
  const r=fitRect(1920,1080,960,540,'stretch');
  ok(r.sx===0&&r.sy===0&&r.sw===1920&&r.sh===1080&&r.dx===0&&r.dy===0&&r.dw===960&&r.dh===540,'stretch maps source → frame exactly');
}
{
  const r=fitRect(0,0,960,540,'contain');
  ok(r.sw===960&&r.sh===540&&r.dw===960&&r.dh===540,'degenerate video dims fall back to the target');
}
{
  const r=fitRect(640,480,960,540,'cover'); // 4:3 into 16:9 → crop the height
  near(r.sw,640,'height-bound cover keeps the full source width');
  near(r.sh,360,'cover crops the source height to the frame ratio (540/1.5)');
  near(r.sx,0,'no horizontal crop when width-bound');
  near(r.sy,(480-360)/2,'height crop is centered');
}

console.log('video-editor smoke: '+n+' assertions passed');
