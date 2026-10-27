// Procedural world generation: big, dramatic landscapes from seeded noise — mountains
// with snow caps, archipelagos, meandering canyon rivers, rolling hills — plus beaches,
// lakes, forests, exposed cliff faces and ivy vines hanging off them.
// Pure data: returns cell entries [[x,y,z,type]] the studio feeds into VoxelWorld.
// Deterministic — the same seed and options always rebuild the identical world — and
// biome-aware: it reuses the terrain-brush BIOMES palettes, so volcanic worlds get
// lava seas and alien worlds get glass water.
import { makeNoise2D, fbm, smoothstep } from './noise.js';
import { BIOMES, pick } from './terrain-brush.js';
import { blockDefs } from './assets.js';

export const GEN_STYLES={
  hills:{label:'Rolling hills',amp:7,sea:2,freq:.030,ridged:0,mask0:.80,tree:.10,snow:99},
  mountains:{label:'Mountains',amp:26,sea:2,freq:.015,ridged:.6,mask0:.78,tree:.11,snow:19},
  islands:{label:'Islands',amp:11,sea:3,freq:.026,ridged:.15,mask0:.52,tree:.15,snow:99,archipelago:true},
  canyon:{label:'Canyon & river',amp:14,sea:2,freq:.020,ridged:0,mask0:.94,tree:.05,snow:99,canyon:true,base:12}
};
// Accepts numbers or strings ('arena-7') so the seed field can stay free text.
export function hashSeed(seed){
  if(typeof seed==='number'&&Number.isFinite(seed))return seed|0;
  let h=7;for(const ch of String(seed))h=(Math.imul(h,31)+ch.charCodeAt(0))|0;
  return h;
}
function hash2(x,z,seed){
  let h=Math.imul(x|0,374761393)^Math.imul(z|0,668265263)^Math.imul(seed|0,144665);
  h=Math.imul(h^(h>>>13),1274126177);
  return((h^(h>>>16))>>>0)/4294967295;
}
const ok=t=>!!blockDefs[t]?.available;

export function generateTerrain({seed=42,size=128,style='mountains',biome='temperate',trees=true,vines=true}={}){
  const S=GEN_STYLES[style]||GEN_STYLES.mountains,P=BIOMES[biome]||BIOMES.temperate;
  // Resolve the biome's candidate-name lists to real catalog ids once per generation.
  const pal={};for(const k of['surface','subsurface','stone','water','beach','snow','log','leaves'])pal[k]=pick(P[k])||pick(P.surface);
  const sd=hashSeed(seed);
  const n1=makeNoise2D(sd),n2=makeNoise2D(sd+1013),n3=makeNoise2D(sd+7919),n4=makeNoise2D(sd+31337);
  const half=Math.max(12,Math.floor(size/2)),w=half*2,sea=S.sea;
  const H=new Int16Array(w*w).fill(-999);
  const at=(x,z)=>(x>=-half&&x<half&&z>=-half&&z<half)?H[(z+half)*w+(x+half)]:-999;
  // Pass 1 — heightmap: continental mask, fbm relief, ridged peaks, canyon carving.
  for(let x=-half;x<half;x++)for(let z=-half;z<half;z++){
    const d=Math.hypot(x+.5,z+.5)/half;
    let mask=1-smoothstep(S.mask0,1,d);
    if(S.archipelago){const wobble=fbm(n4,x*.017,z*.017,3);mask=1-smoothstep(.30+wobble*.55,.70+wobble*.40,d);}
    if(mask<=.02)continue;
    let n=fbm(n1,(x+.5)*S.freq,(z+.5)*S.freq,5);
    if(S.ridged>0){const r=1-Math.abs(2*fbm(n2,x*S.freq*.9,z*S.freq*.9,4)-1);n=n*(1-S.ridged)+r*r*S.ridged*1.3;}
    let h;
    if(S.canyon){
      h=sea-2+Math.round(mask*(S.base+n*S.amp));
      // Meandering river: domain-warped noise carves a channel through the plateau.
      const warp=fbm(n2,x*.006,z*.006,2)*2.4;
      const rv=Math.abs(fbm(n3,x*.014+warp,z*.014,3)-.5);
      if(rv<.05)h=Math.round(sea-2+(h-sea+2)*smoothstep(0,.05,rv));
      if(rv<.016)h=sea-3;
    }else{
      h=sea-2+Math.round(mask*(n*(S.amp+4)-.5));
    }
    H[(z+half)*w+(x+half)]=Math.max(-6,Math.min(38,h));
  }
  // Pass 2 — columns: surface caps (snow / rock faces / beaches), layered subsoil, water fill.
  const cells=[],stats={columns:0,trees:0,vines:0,water:0,peak:-999};
  const push=(x,y,z,t)=>{if(y<-8||y>40)return;if(t&&ok(t))cells.push([x,y,z,t]);};
  const cliffSide=[];
  for(let x=-half;x<half;x++)for(let z=-half;z<half;z++){
    const h=at(x,z);if(h<=-999)continue;
    stats.columns++;if(h>stats.peak)stats.peak=h;
    let drop=0,vx=x,vz=z,vh=h;
    for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const hn=at(x+dx,z+dz);if(hn<=-999)continue;
      const dd=h-hn;if(dd>drop){drop=dd;vx=x+dx;vz=z+dz;vh=hn;}
    }
    const cliff=drop>=3,beach=h<=sea+1,snowCap=h>=S.snow,underwater=h<sea;
    if(drop>=2&&vh<h-1)cliffSide.push([x,z,h,vx,vz,vh]);
    const depth=underwater?4:3;
    for(let y=h;y>=Math.max(h-depth,-7);y--){
      let t;
      if(y===h)t=snowCap?pal.snow:(cliff||drop===2)?pal.stone:beach?pal.beach:pal.surface;
      else t=y>h-2?pal.subsurface:pal.stone;
      push(x,y,z,t);
    }
    if(underwater)for(let y=h+1;y<=sea;y++){push(x,y,z,pal.water);stats.water++;}
  }
  // Pass 3 — cliff ivy: vines hang from the rim down the face, with tufts over the edge.
  if(vines)for(const[x,z,h,vx,vz,vh]of cliffSide){
    if(vh>=h-2||hash2(x,z,sd+4242)>=.5)continue;
    const len=Math.min(1+Math.floor(hash2(x,z,sd+91)*3),h-vh-1);
    for(let k=1;k<=len;k++){const y=h-k;if(y<=vh)break;push(vx,y,vz,pal.leaves);stats.vines++;}
    if(hash2(x,z,sd+7)<.4){push(x,h+1,z,pal.leaves);stats.vines++;}
  }
  // Pass 4 — forests on gentle ground (cacti in arid biomes), kept clear of beaches and peaks.
  if(trees)for(let x=-half+2;x<half-2;x++)for(let z=-half+2;z<half-2;z++){
    const h=at(x,z);if(h<=-999||h<=sea+1||h>=S.snow-2)continue;
    let drop=0;
    for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]){const hn=at(x+dx,z+dz);if(hn>-999&&h-hn>drop)drop=h-hn;}
    if(drop>1)continue;
    const arid=biome==='arid';
    if(hash2(x,z,sd+171)>=S.tree*(arid?.45:1))continue;
    const th=arid?2+Math.floor(hash2(x,z,sd+33)*3):3+Math.floor(hash2(x,z,sd+33)*4);
    for(let y=1;y<=th;y++)push(x,h+y,z,pal.log);
    if(!arid)for(let dx=-2;dx<=2;dx++)for(let dy=-1;dy<=2;dy++)for(let dz=-2;dz<=2;dz++){
      if(dx*dx+dz*dz+dy*dy<5&&!(dx===0&&dz===0&&dy<1))push(x+dx,h+th+dy,z+dz,pal.leaves);
    }
    stats.trees++;
  }
  return {cells,stats:{...stats,cells:cells.length,size:w,style:S===GEN_STYLES[style]?style:'mountains',biome}};
}
