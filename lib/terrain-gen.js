// Procedural world generation: big, dramatic landscapes from seeded noise — mountains
// with snow caps, archipelagos, meandering canyon rivers, rolling hills, a lava-crater
// volcano, stepped mesas, wind-carved dunes, karst stone pillars and an impact-crater
// field — plus beaches, lakes, forests, exposed cliff faces and ivy vines hanging off them.
// Pure data: returns a Map("x,y,z" → block id) the studio drops straight into VoxelWorld.
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
  canyon:{label:'Canyon & river',amp:14,sea:2,freq:.020,ridged:0,mask0:.94,tree:.05,snow:99,canyon:true,base:12},
  volcano:{label:'Volcano',amp:30,sea:2,freq:.020,mask0:.90,tree:.09,snow:99,volcano:true,barren:true},
  mesas:{label:'Mesas & plateaus',amp:17,sea:2,freq:.017,mask0:.86,tree:.07,snow:99,quantize:4},
  dunes:{label:'Sand dunes',amp:9,sea:2,freq:.020,mask0:.85,tree:.02,snow:99,dunes:true},
  pillars:{label:'Stone pillars',amp:21,sea:2,freq:.021,mask0:.88,tree:.09,snow:99,pillars:true},
  craters:{label:'Crater field',amp:3,sea:2,freq:.020,mask0:.92,tree:.08,snow:99,craters:true}
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

export function generateTerrain({seed=42,size=128,style='mountains',biome='temperate',biome2=null,trees=true,vines=true}={}){
  const S=GEN_STYLES[style]||GEN_STYLES.mountains;
  const biomeN=BIOMES[biome]?biome:'temperate',P=BIOMES[biomeN];
  // Optional second biome: slow noise draws big regions of each, and the border
  // zone dithers column-by-column so the two palettes blend like natural edges.
  const mixN=(typeof biome2==='string'&&biome2!==biomeN&&BIOMES[biome2])?biome2:null;
  // Resolve the biomes' candidate-name lists to real catalog ids once per generation.
  const resolvePal=B=>{const p={};for(const k of['surface','subsurface','stone','water','beach','snow','log','leaves'])p[k]=pick(B[k])||pick(B.surface);return p;};
  const palA=resolvePal(P),palB=mixN?resolvePal(BIOMES[mixN]):null,blend=!!palB;
  const sd=hashSeed(seed);
  const n1=makeNoise2D(sd),n2=makeNoise2D(sd+1013),n3=makeNoise2D(sd+7919),n4=makeNoise2D(sd+31337),n5=makeNoise2D(sd+6271);
  const sizeC=Math.max(24,Math.min(500,Math.round(size)||128));
  const half=Math.floor(sizeC/2),w=half*2,sea=S.sea;
  const H=new Int16Array(w*w).fill(-999);
  const at=(x,z)=>(x>=-half&&x<half&&z>=-half&&z<half)?H[(z+half)*w+(x+half)]:-999;
  // Per-column biome choice: 0 = first biome, 1 = second. Region noise is scaled to
  // the world size so any footprint gets a few readable blobs of each biome.
  const SEL=blend?new Int8Array(w*w):null;
  const bFreq=Math.min(.024,Math.max(.004,1.6/sizeC));
  const palAt=(x,z)=>{if(!blend)return palA;return SEL[(z+half)*w+(x+half)]===1?palB:palA;};
  const biomeAt=(x,z)=>blend&&SEL[(z+half)*w+(x+half)]===1?mixN:biomeN;
  // Volcano geometry (needed by both the height pass and the crater-lake fill).
  const vcx=(hash2(1,2,sd+11)-.5)*sizeC*.10,vcz=(hash2(3,4,sd+29)-.5)*sizeC*.10;
  const craterR=sizeC*.10,coneR=half*.88,lavaLevel=sea+9;
  // Pass 1 — heightmap: one branch per landscape personality.
  for(let x=-half;x<half;x++)for(let z=-half;z<half;z++){
    const d=Math.hypot(x+.5,z+.5)/half;
    let mask=1-smoothstep(S.mask0,1,d);
    if(S.archipelago){const wobble=fbm(n4,x*.017,z*.017,3);mask=1-smoothstep(.30+wobble*.55,.70+wobble*.40,d);}
    else if(S.quantize){const wobble=fbm(n4,x*.011,z*.011,3);mask=1-smoothstep(S.mask0,1,d*(1+(wobble-.5)*.45));}
    if(mask<=.02)continue;
    let h;
    if(S.volcano){
      // Seed-jittered central cone with a rough flank, a crater bowl and a lava lake.
      const cd=Math.hypot(x+.5-vcx,z+.5-vcz);
      const rough=fbm(n3,x*.09,z*.09,3)*3.4;
      const cone=Math.pow(Math.max(0,1-cd/coneR),1.35)*S.amp;
      const base=fbm(n1,(x+.5)*S.freq,(z+.5)*S.freq,4)*6;
      h=sea-2+Math.round(mask*(base+2)+cone+rough*mask*.55);
      if(cd<craterR){const floor=sea+7;h=Math.round(floor+(h-floor)*smoothstep(.42,1,cd/craterR));}
    }else if(S.quantize){
      // Mesas: quantized noise gives flat plateau tops stepped by sheer cliffs;
      // the wobble mask above bends each mesa's outline into irregular shapes.
      const n=fbm(n1,(x+.5)*S.freq,(z+.5)*S.freq,4);
      const q=Math.floor(n*S.quantize)/S.quantize;
      h=sea-2+Math.round(mask*(q*(S.amp+8)+fbm(n2,x*.08,z*.08,2)*1.2));
    }else if(S.dunes){
      // Dunes: ridged noise stretched along one axis — long smooth crests, shallow
      // interdune hollows that occasionally dip below sea level into oasis pools.
      const ridge=1-Math.abs(2*fbm(n1,x*S.freq,z*S.freq*.42,4)-1);
      h=sea-1+Math.round(mask*(Math.pow(ridge,1.7)*S.amp+fbm(n2,x*.05,z*.05,2)*1.5));
    }else if(S.pillars){
      // Karst pillars: sharpened ridged noise on a slow cluster field — isolated
      // stone towers rising out of low, lake-dotted valleys.
      const p=1-Math.abs(2*fbm(n1,(x+.5)*S.freq,(z+.5)*S.freq,4)-1);
      const t=Math.max(0,p-.60)/.40;
      const cluster=fbm(n4,x*.008,z*.008,2);
      h=sea-2+Math.round(mask*(1.5+Math.pow(t,1.5)*S.amp*(.55+cluster*.75)));
    }else if(S.craters){
      // Crater field: a gentle plain pocked by impact bowls from a jittered grid of
      // centers, each with a raised rim; deep bowls flood into crater lakes.
      h=sea+Math.round(fbm(n1,x*S.freq,z*S.freq,3)*S.amp*mask);
      const cell=26,gx=Math.floor((x+.5)/cell),gz=Math.floor((z+.5)/cell);
      for(let ix=-1;ix<=1;ix++)for(let iz=-1;iz<=1;iz++){
        const sx=gx+ix,sz=gz+iz;
        const cx=(sx+(hash2(sx,sz,sd)-.5)*.7+.5)*cell,cz=(sz+(hash2(sx,sz,sd+77)-.5)*.7+.5)*cell;
        const rad=cell*(.24+.30*hash2(sx,sz,sd+13));
        const dd=Math.hypot(x+.5-cx,z+.5-cz);
        if(dd>=rad*1.7)continue;
        const dep=3+5*hash2(sx,sz,sd+91),rim=1.5+2*hash2(sx,sz,sd+55);
        const t=dd/rad;
        h+=Math.round(-dep*(1-smoothstep(.30,.95,t))+rim*Math.exp(-Math.pow((t-1.02)/.30,2))*mask);
      }
    }else if(S.canyon){
      h=sea-2+Math.round(mask*(S.base+fbm(n1,(x+.5)*S.freq,(z+.5)*S.freq,5)*S.amp));
      // Meandering river: domain-warped noise carves a channel through the plateau.
      const warp=fbm(n2,x*.006,z*.006,2)*2.4;
      const rv=Math.abs(fbm(n3,x*.014+warp,z*.014,3)-.5);
      if(rv<.05)h=Math.round(sea-2+(h-sea+2)*smoothstep(0,.05,rv));
      if(rv<.016)h=sea-3;
    }else{
      let n=fbm(n1,(x+.5)*S.freq,(z+.5)*S.freq,5);
      if(S.ridged>0){const r=1-Math.abs(2*fbm(n2,x*S.freq*.9,z*S.freq*.9,4)-1);n=n*(1-S.ridged)+r*r*S.ridged*1.3;}
      h=sea-2+Math.round(mask*(n*(S.amp+4)-.5));
    }
    const idx=(z+half)*w+(x+half);
    // 2×2 patch dither: the transition zone reads as a mosaic of both biomes
    // instead of TV static, and region borders stay soft but readable.
    if(blend)SEL[idx]=hash2(x>>1,z>>1,sd+555)<smoothstep(.38,.62,fbm(n5,x*bFreq,z*bFreq,3))?1:0;
    H[idx]=Math.max(-6,Math.min(38,h));
  }
  // Pass 2 — columns: surface caps (snow / rock faces / beaches), layered subsoil, water fill.
  const map=new Map(),stats={columns:0,trees:0,vines:0,water:0,peak:-999};
  const push=(x,y,z,t)=>{if(y<-8||y>40)return;if(t&&ok(t))map.set(x+','+y+','+z,t);};
  const huge=sizeC>=300,cliffSide=[];
  for(let x=-half;x<half;x++)for(let z=-half;z<half;z++){
    const h=at(x,z);if(h<=-999)continue;
    const cp=palAt(x,z);
    stats.columns++;if(h>stats.peak)stats.peak=h;
    let drop=0,vx=x,vz=z,vh=h;
    for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const hn=at(x+dx,z+dz);if(hn<=-999)continue;
      const dd=h-hn;if(dd>drop){drop=dd;vx=x+dx;vz=z+dz;vh=hn;}
    }
    const cliff=drop>=3,beach=h<=sea+1,snowCap=h>=S.snow,underwater=h<sea;
    if(drop>=2&&vh<h-1)cliffSide.push([x,z,h,vx,vz,vh]);
    // Gigantic worlds thin their subsoil so a 500×500 map stays inside memory limits.
    const depth=huge?(underwater?3:2):(underwater?4:3);
    for(let y=h;y>=Math.max(h-depth,-7);y--){
      let t;
      if(y===h)t=snowCap?cp.snow:(S.barren&&h>sea+4)||cliff||drop===2?cp.stone:beach?cp.beach:cp.surface;
      else t=y>h-2?cp.subsurface:cp.stone;
      push(x,y,z,t);
    }
    if(underwater)for(let y=h+1;y<=sea;y++){push(x,y,z,cp.water);stats.water++;}
    if(S.volcano&&h<lavaLevel&&Math.hypot(x+.5-vcx,z+.5-vcz)<craterR*.92)
      for(let y=h+1;y<=lavaLevel;y++){push(x,y,z,cp.water);stats.water++;}
  }
  // Pass 3 — cliff ivy: vines hang from the rim down the face, with tufts over the edge.
  if(vines)for(const[x,z,h,vx,vz,vh]of cliffSide){
    if(vh>=h-2||hash2(x,z,sd+4242)>=.5)continue;
    const len=Math.min(1+Math.floor(hash2(x,z,sd+91)*3),h-vh-1);
    const vpal=palAt(vx,vz);
    for(let k=1;k<=len;k++){const y=h-k;if(y<=vh)break;push(vx,y,vz,vpal.leaves);stats.vines++;}
    if(hash2(x,z,sd+7)<.4){push(x,h+1,z,palAt(x,z).leaves);stats.vines++;}
  }
  // Pass 4 — forests on gentle ground (cacti in arid biomes), kept clear of beaches and peaks.
  if(trees)for(let x=-half+2;x<half-2;x++)for(let z=-half+2;z<half-2;z++){
    const h=at(x,z);if(h<=-999||h<=sea+1||h>=S.snow-2)continue;
    if(S.volcano&&Math.hypot(x+.5-vcx,z+.5-vcz)<craterR*1.6)continue;
    let drop=0;
    for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]){const hn=at(x+dx,z+dz);if(hn>-999&&h-hn>drop)drop=h-hn;}
    if(drop>1)continue;
    // Each tree belongs to its own column's biome — blended worlds grow mixed forests.
    const cp=palAt(x,z),arid=biomeAt(x,z)==='arid';
    if(hash2(x,z,sd+171)>=S.tree*(arid?.45:1))continue;
    const th=arid?2+Math.floor(hash2(x,z,sd+33)*3):3+Math.floor(hash2(x,z,sd+33)*4);
    for(let y=1;y<=th;y++)push(x,h+y,z,cp.log);
    if(!arid)for(let dx=-2;dx<=2;dx++)for(let dy=-1;dy<=2;dy++)for(let dz=-2;dz<=2;dz++){
      if(dx*dx+dz*dz+dy*dy<5&&!(dx===0&&dz===0&&dy<1))push(x+dx,h+th+dy,z+dz,cp.leaves);
    }
    stats.trees++;
  }
  return {map,stats:{...stats,cells:map.size,size:w,style:GEN_STYLES[style]?style:'mountains',biome:blend?biomeN+' + '+mixN:biomeN}};
}
