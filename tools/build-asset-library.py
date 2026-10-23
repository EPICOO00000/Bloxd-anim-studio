from pathlib import Path
import json,struct,base64,hashlib,gzip,io,re,collections,math
import numpy as np
from PIL import Image
import DracoPy
ROOT=Path(__file__).resolve().parents[1];SRC=ROOT/'assets/catalog-sources';A=ROOT/'assets';PACK=A/'default-pack'
P=json.loads((SRC/'pack-manifest.json').read_text()); HUB=json.loads((SRC/'hub-block-registry.json').read_text()); GAME=json.loads((SRC/'game-asset-registry.json').read_text()); ITEMS=json.loads((SRC/'items-mapped.json').read_text())
T={};TM={};pixel_names={};embedded_dir=A/'model-textures';embedded_dir.mkdir(exist_ok=True)
def pixelhash(b):
 im=Image.open(io.BytesIO(b)).convert('RGBA');ar=np.array(im);ar[ar[:,:,3]==0,:3]=0
 return hashlib.sha256(struct.pack('<II',im.width,im.height)+ar.tobytes()).hexdigest(),im

def addtex(key,b,meta):
 if key in T:return key
 h,im=pixelhash(b);T[key]='data:image/png;base64,'+base64.b64encode(b).decode();TM[key]={**meta,'width':im.width,'height':im.height,'sha256':hashlib.sha256(b).hexdigest(),'hasAlpha':bool(np.any(np.array(im)[:,:,3]<255))};pixel_names.setdefault(h,key);return key
for f in sorted((PACK/'textures').glob('*.png')):addtex(f.stem,f.read_bytes(),{'name':f.name,'file':str(f.relative_to(A)),'kind':'original-pack','url':f'https://raw.githubusercontent.com/Bloxdy/texture-packs/{P["revision"]}/default/textures/'+f.name})
liveInfo={}
for f in ['live-assets-round1.json','live-assets-round2.json']:
 for r in json.loads((SRC/f).read_text())['got']:
  if r['kind']=='texture':liveInfo[r['name']]=r
liveInfo.update(json.loads((SRC/'live-texture-manifest.json').read_text()))
for f in sorted((A/'live-textures').glob('*.png')):addtex(f.stem,f.read_bytes(),{'name':f.name,'file':str(f.relative_to(A)),'kind':'live-png','url':liveInfo.get(f.stem,{}).get('url','https://bloxdhub.com/images/builder-studio/bloxd-live/item/'+f.name)})

def imagekey(b,model,index):
 h,im=pixelhash(b)
 if h in pixel_names:return pixel_names[h]
 key='model_'+h[:20];file=embedded_dir/(key+'.png');im.save(file)
 return addtex(key,file.read_bytes(),{'name':model+' · embedded image '+str(index),'file':str(file.relative_to(A)),'kind':'model-image','model':model,'image':index})

def attr(a,size,dtype='f32'):
 ar=np.asarray(a,dtype={'f32':'<f4','u16':'<u2','u32':'<u4'}[dtype]).reshape(-1)
 return {'size':size,'type':dtype,'data':base64.b64encode(ar.tobytes()).decode()}

def transform(node):
 if node.get('matrix'):return np.array(node['matrix'],dtype=float).reshape((4,4),order='F')
 x,y,z,w=(node.get('rotation') or[0,0,0,1]);m=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),0],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),0],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y),0],[0,0,0,1]],float)
 m[:3,:3]=m[:3,:3]@np.diag((node.get('scale') or[1,1,1]));m[:3,3]=(node.get('translation') or[0,0,0]);return m

def compact_model(name,d,binary=None,live=False):
 imagekeys=[]
 for i,image in enumerate(d.get('images',[])):
  if live:b=(A/'live-model-images'/image).read_bytes()
  elif 'bufferView'in image:
   v=d['bufferViews'][image['bufferView']];b=binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
  elif image.get('uri','').startswith('data:'):b=base64.b64decode(image['uri'].split(',')[1])
  else:raise ValueError('Unexpected external model image '+name)
  imagekeys.append(imagekey(b,name,i))
 mats=[]
 for m in d.get('materials',[]):
  if live:mat={'texture':imagekeys[m['image']]if m.get('image')is not None else None,'color':m.get('colour',[1,1,1,1]),'alpha':m.get('alpha','OPAQUE'),'double':m.get('doubleSided',False)}
  else:
   pbr=m.get('pbrMetallicRoughness',{});slot=pbr.get('baseColorTexture',{});tex=d.get('textures',[])[slot['index']]if 'index'in slot else {};idx=tex.get('source');mat={'texture':imagekeys[idx]if idx is not None else None,'color':pbr.get('baseColorFactor',[1,1,1,1]),'alpha':m.get('alphaMode','OPAQUE'),'cutoff':m.get('alphaCutoff',.5),'double':m.get('doubleSided',False)}
   tr=slot.get('extensions',{}).get('KHR_texture_transform');
   if tr:mat['transform']=tr
  mats.append(mat)
 if not mats:mats=[{'color':[1,1,1,1],'texture':None}]
 def access(index):
  a=d['accessors'][index];v=d['bufferViews'][a['bufferView']];count=a['count'];size={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];dt={5126:'<f4',5125:'<u4',5123:'<u2',5122:'<i2',5121:'u1',5120:'i1'}[a['componentType']];sz=np.dtype(dt).itemsize;off=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',sz*size)
  arr=np.ndarray((count,size),dtype=dt,buffer=binary,offset=off,strides=(stride,sz)).copy()
  if a.get('normalized') and a['componentType']!=5126:
   info=np.iinfo(arr.dtype);arr=arr.astype(np.float32)/info.max
   if info.min<0:arr=np.maximum(arr,-1)
  return arr
 parts=[];mins=np.full(3,np.inf);maxs=np.full(3,-np.inf)
 children={i for n in d.get('nodes',[]) for i in n.get('children',[])};roots=d.get('scenes',[{}])[d.get('scene',0)].get('nodes',[i for i in range(len(d.get('nodes',[])))if i not in children]) if not live else [i for i in range(len(d.get('nodes',[])))if i not in children]
 def visit(i,parent):
  nonlocal mins,maxs
  n=d['nodes'][i];matrix=parent@transform(n)
  if 'mesh'in n:
   mesh=d['meshes'][n['mesh']];primitives=mesh if live else mesh['primitives']
   for prim in primitives:
    if live:
     pos=np.array(prim['position'],dtype=np.float32).reshape(-1,3);normal=np.array(prim['normal'],dtype=np.float32).reshape(-1,3)if prim.get('normal')else None;uv=np.array(prim['uv'],dtype=np.float32).reshape(-1,2)if prim.get('uv')else None;colors=None;indices=np.array(prim.get('indices',np.arange(len(pos)))).reshape(-1)
    else:
     if prim.get('mode',4)!=4:raise ValueError('Unsupported primitive mode '+name)
     attrs=prim['attributes'];draco=prim.get('extensions',{}).get('KHR_draco_mesh_compression');decoded=None
     if draco:
      v=d['bufferViews'][draco['bufferView']];decoded=DracoPy.decode(binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]);am=draco['attributes']
      get=lambda semantic:decoded.get_attribute_by_unique_id(am[semantic])['data'] if semantic in am else None
      pos=get('POSITION');normal=get('NORMAL');uv=get('TEXCOORD_0');colors=get('COLOR_0');indices=decoded.faces.reshape(-1)
     else:
      pos=access(attrs['POSITION']);normal=access(attrs['NORMAL'])if'NORMAL'in attrs else None;uv=access(attrs['TEXCOORD_0'])if'TEXCOORD_0'in attrs else None;colors=access(attrs['COLOR_0'])if'COLOR_0'in attrs else None;indices=access(prim['indices']).reshape(-1)if'indices'in prim else np.arange(len(pos))
    if colors is not None and np.issubdtype(np.asarray(colors).dtype,np.integer):colors=np.asarray(colors,dtype=np.float32)/np.iinfo(np.asarray(colors).dtype).max
    if np.linalg.det(matrix[:3,:3])<0:indices=np.asarray(indices).reshape(-1,3)[:,[0,2,1]].reshape(-1)
    pos=(np.c_[pos,np.ones(len(pos))]@matrix.T)[:,:3];mins=np.minimum(mins,pos.min(0));maxs=np.maximum(maxs,pos.max(0))
    if normal is not None:
     normal=np.asarray(normal)@np.linalg.pinv(matrix[:3,:3]);lengths=np.linalg.norm(normal,axis=1,keepdims=True);normal=normal/np.where(lengths>1e-12,lengths,1)
    part={'p':attr(pos,3),'i':attr(indices,1,'u16'if indices.max(initial=0)<65536 else'u32'),'m':prim.get('material',0)}
    if normal is not None:part['n']=attr(normal,3)
    if uv is not None:part['uv']=attr(uv,2)
    if colors is not None:part['c']=attr(colors,colors.shape[1])
    parts.append(part)
  for child in n.get('children',[]):visit(child,matrix)
 for i in roots:visit(i,np.eye(4))
 return{'parts':parts,'mats':mats,'min':mins.tolist(),'max':maxs.tolist()}
MODELS={};modelmeta={};failures=[]
allmodels=[(f.stem,f,False)for f in sorted((PACK/'models').glob('*.glb'))]
for m in json.loads((SRC/'live-item-models-manifest.json').read_text()):
 if m.get('file'):allmodels.append((m['name'],A/m['file'],False))
allmodels +=[(f.stem,f,True)for f in sorted((A/'live-models').glob('*.json'))]
for name,f,is_live in allmodels:
 if name in MODELS:continue
 try:
  if is_live:d=json.loads(f.read_text());binary=None
  else:
   b=f.read_bytes();length=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+length]);off=20+length;n=struct.unpack_from('<I',b,off)[0];binary=b[off+8:off+8+n]
  MODELS[name]=compact_model(name,d,binary,is_live);modelmeta[name]={'file':str(f.relative_to(A)),'kind':'live-block-model'if is_live else'original-glb','triangles':sum(len(base64.b64decode(part['i']['data']))/(2 if part['i']['type']=='u16' else 4)/3 for part in MODELS[name]['parts'])}
 except Exception as e:failures.append([name,str(e)])
 if len(MODELS)%250==0:print('Decoded',len(MODELS),'models',flush=True)
print('Models',len(MODELS),'decode failures',failures,flush=True)
# Official color palette for grayscale equipment, as exposed by the live client.
COLORS={'Black':[29,29,33],'Red':[176,46,38],'Green':[94,124,22],'Brown':[131,84,50],'Blue':[60,68,170],'Purple':[137,50,184],'Cyan':[22,156,156],'Light Gray':[157,157,151],'Gray':[71,79,82],'Pink':[243,139,170],'Lime':[128,199,31],'Yellow':[254,216,61],'Light Blue':[58,179,218],'Magenta':[199,78,189],'Orange':[249,128,29],'White':[249,255,254],'Wood':[163,120,69]}
def tint(key,color,label):
 b=base64.b64decode(T[key].split(',')[1]);im=Image.open(io.BytesIO(b)).convert('RGBA');ar=np.array(im);ar[:,:,:3]=np.rint(ar[:,:,:3].astype(float)*np.array(COLORS[color])[None,None,:]/255).astype('uint8');out=Image.fromarray(ar);bio=io.BytesIO();out.save(bio,format='PNG');k='tint_'+hashlib.sha256((key+color).encode()).hexdigest()[:16];folder=A/'generated-textures';folder.mkdir(exist_ok=True);f=folder/(k+'.png');f.write_bytes(bio.getvalue());return addtex(k,bio.getvalue(),{'name':label+' · tinted sprite','file':str(f.relative_to(A)),'kind':'palette-tint','base':key,'color':color,'rgb':COLORS[color]})
legacy={'Grass Block':'grass','Dirt':'dirt','Stone':'stone','Maple Log':'log','Maple Leaves':'maple','Autumn Maple Leaves':'autumn','Maple Wood Planks':'planks','Diamond Ore':'diamondore','Iron Ore':'ironore','Sand':'sand','Water':'water','Cherry Leaves':'blossom','Snow':'snow','Messy Stone':'cobble','Stone Bricks':'bricks'}
rootnames={re.sub(r' \[[^\]]+\]$','',l.strip())for l in(SRC/'BLOCK_NAMES.txt').read_text().splitlines()if l and not l.startswith('#')}
def resolve(d):return{**(resolve(HUB[str(d['r'])])if'r'in d else{}),**d}
def texrefs(v):
 if isinstance(v,str):return[v]
 if isinstance(v,list):return [x if isinstance(x,str)else (x.get('animTextures')or[''])[0] if isinstance(x,dict)else '' for x in v]
 if isinstance(v,dict):return [(v.get('animTextures')or[''])[0]]
 return[]
def plaintex(k):return re.sub(r'\[rot\[\d$','',k or'')
def bgroup(n,m):
 l=n.lower()
 if any(x in l for x in ['unused','placeholder','invisible','temp','internal'])or n.startswith('_'):return'System / parts'
 if m=='Slab':return'Slabs'
 if m=='Stairs':return'Stairs'
 if any(x in l for x in ['door','ladder','fence','glass','pane','bed','bookshelf','chest','table','bench','painting','sign','lantern']):return'Building / furniture'
 if any(x in l for x in ['flower','leaves','sapling','grass','wheat','seeds','plant','vine','mushroom','cactus','melon','rice','cotton','pumpkin']):return'Plants / crops'
 if any(x in l for x in ['ore','block of','marble','stone','granite','diorite','andesite','sand','dirt','snow','clay','ice','bedrock']):return'Stone / terrain'
 if any(x in l for x in ['log','plank','wood']):return'Wood'
 if any(x in l for x in ['portal','neon','lucky','explosive','spawner','generator','miner','crafter','harvester','pipe','wire','rocket']):return'Special / machines'
 return'Other blocks'
BLOCKS={};ALIASES={};BENT=[]
for gid,raw in HUB.items():
 d=resolve(raw);n=d['n'];key=legacy.get(n,n);ts=texrefs(d.get('t'));face=(d.get('p') or[0]*6);face=[ts[i]if i<len(ts)else(ts[0]if ts else'')for i in face];model=d.get('b');icon=d.get('i');model= model if model in MODELS else None
 if not icon or icon not in T:icon=next((plaintex(t)for t in face if plaintex(t)in T),None)or(MODELS[model]['mats'][0].get('texture')if model else None)
 isroot='|'not in n;internal=n.startswith('_')or bool(re.search('unused|placeholder|^temp$|unloaded|invisible',n,re.I));variant='|'in n
 solidcolor=d.get('t') if isinstance(d.get('t'),list) and all(isinstance(x,(int,float)) for x in d['t']) else None
 invisible=bool(solidcolor and len(solidcolor)>3 and solidcolor[3]==0) or(any(x in n.lower()for x in['invisible','air'])and not icon)
 available=bool((model and MODELS[model]['parts'])or(any(plaintex(t)in T for t in face)))
 if solidcolor:available=True
 if n=='temp':available=False
 missing=[t for t in face if t and plaintex(t)not in T]
 if missing and not model:available=False
 info={'id':key,'gameId':int(gid),'name':n,'label':n,'root':isroot,'documented':n in rootnames,'variant':variant,'internal':internal,'group':bgroup(n,d.get('m','cube')),'faces':face,'icon':icon,'side':icon,'top':plaintex(face[2])if face else icon,'shape':d.get('m','cube'),'model':model,'modelScale':d.get('ms',1),'custom':d.get('c',{}),'boxes':d.get('bx'),'rotation':d.get('rot',1),'open':bool(d.get('open')),'state':d.get('k',''),'solid':d.get('s',1)!=0,'transparent':bool(d.get('x')),'available':available,'invisible':invisible,'missingTextures':missing,'color':solidcolor}
 if isinstance(d.get('t'),dict):info['animation']=d['t'].get('animTextures',[])
 if isinstance(d.get('t'),list):info['faceAnimations']=[x.get('animTextures')if isinstance(x,dict)else None for x in d['t']];info['faceIndices']=d.get('p')or[0]*6
 BLOCKS[key]=info;BENT.append(key);ALIASES[n]=key
 if d.get('k','').startswith('meta') and '|meta|'not in n:ALIASES[n+'|'+d['k'].replace('meta','meta|rot'+str(d.get('rot',1)),1)]=key
# Sort the actual game catalog with the old starter materials at the front.
BENT.sort(key=lambda k:(0 if k in legacy.values()else 1,next((i for i,v in enumerate(legacy.values())if v==k),9999),BLOCKS[k]['name'].casefold()))
def igroup(n,typ):
 l=n.lower()
 if n.startswith('INTERNAL_')or'|'in n:return'States / internal'
 if n.startswith('Caught Mob'):return'Caught creatures'
 if 'spawn orb'in l:return'Spawn items'
 if any(x in l for x in['helmet','chestplate','gauntlet','leggings','boots','armour','armor']):return'Armor'
 if any(x in l for x in['sword','bow','gun','rpg','pistol','rifle','grenade','bomb','paintball','mace','spear','dagger','whip','club','arrow','rocket','explosive'] )or typ=='Gun':return'Weapons'
 if any(x in l for x in['pickaxe','spade','axe','hoe','shears','bucket','rod','net','compass','clock','flashlight']):return'Tools'
 if 'potion'in l:return'Potions'
 if any(x in l for x in['carp','fish','trout','cod','salmon','tuna','shark','eel','bream','goby','perch','snapper','pike']):return'Fish'
 if any(x in l for x in['apple','bread','bowl','soup','melon','potato','carrot','beef','pork','steak','chicken','banana','rice','corn','cherry','plum','pie','mushroom','coconut','pear','cranberr','date','chili','beans','egg']):return'Food / crops'
 if any(x in l for x in['boat','glider','kart','car','roader','hovercraft','saddle','balloon']):return'Vehicles / riding'
 return'Materials / misc'
IENT=[];IDEFS={};unavailable=[]
for n,initial in ITEMS.items():
 d=dict(initial);model=d.get('model') or d['base'];base=d['base'];
 if model.startswith('INTERNAL_MESH_'):model=model.removeprefix('INTERNAL_MESH_')
 if d.get('sharedAppearance'):model=re.sub(r' [^ ]+$',' Default',n)
 if d.get('tint'):model='Wood '+n.split()[-1]
 model=model if model in MODELS else None;texture=d.get('texture')
 if texture not in T: texture=MODELS[model]['mats'][0].get('texture')if model else None
 if d.get('tint') and texture in T:texture=tint(texture,d['tint'],n)
 sourceTexture=initial.get('texture');available=bool(texture in T or model)
 internal=n.startswith('INTERNAL_');variant='|'in n
 # Preserve the corrected thin-sprite look for inventory artwork. Complex raw
 # models remain available for vehicles/3D items and in the complete Models tab.
 sprite=texture in T and (d.get('tint') or not model or n in ['Diamond Pickaxe','Diamond Sword','Diamond Axe','Diamond Spade','Diamond Hoe'] or re.search(r'(Pickaxe|Sword|Axe|Spade|Hoe|Bow|Shears|Spear|Dagger|Club|Mace|Whip|Boomerang)(\||$)',n) or d.get('type')in ['GrayscaleArmour','Armour'] or '|meta|'in n)
 info={'name':n,'kind':'item','texture':texture,'sourceTexture':sourceTexture if sourceTexture in T else texture,'model':model,'sprite':bool(sprite),'available':available,'internal':internal,'variant':variant,'group':igroup(n,d.get('type')),'source':d.get('source'),'documented':not d.get('liveExtra',False),'sharedAppearance':d.get('sharedAppearance',False)}
 IDEFS[n]=info;IENT.append(n)
 if not available:unavailable.append(n)
for key in BENT:
 d=BLOCKS[key]
 if d['root'] and d['name']not in IDEFS:
  n=d['name'];IDEFS[n]={'name':n,'kind':'block-item','block':key,'texture':d['icon'],'sourceTexture':d['icon'],'sprite':bool(d.get('model') and d.get('icon')),'available':d['available'],'internal':d['internal'],'variant':False,'group':'Blocks (held)','documented':True};IENT.append(n)
IENT.sort(key=lambda n:(0 if n in ['Diamond Pickaxe','Diamond Sword','Diamond Axe','Diamond Spade','Diamond Hoe'] else 1,IDEFS[n]['group']=='Blocks (held)',n.casefold()))
modelentries=[{'name':n,'asset':'Model: '+n,'kind':'model','texture':next((m.get('texture')for m in MODELS[n]['mats']if m.get('texture')),None),'available':True,'internal':False,'variant':False,'group':'Source models'}for n in sorted(MODELS)]
for row in modelentries:IDEFS[row['asset']]={**row,'name':row['asset'],'model':row['name'],'sprite':False};
counts={'officialPng':2074,'officialModels':1382,'officialSkyFaces':30,'documentedBlockRoots':len(rootnames),'liveBlockRoots':sum(d['root']for d in BLOCKS.values()),'blockStates':len(BLOCKS),'documentedItems':1044,'liveItemEntries':len(ITEMS),'missingItemVisuals':len(unavailable),'availableInventoryEntries':sum(IDEFS[n]['available']for n in IENT),'modelChoices':len(MODELS),'texturesTotal':len(T),'rawSourceFiles':len(P['files'])}
CAT={'counts':counts,'blocks':BLOCKS,'blockOrder':BENT,'blockAliases':ALIASES,'items':IDEFS,'itemOrder':IENT,'sourceModels':modelentries,'textureMeta':TM,'modelMeta':modelmeta,'unavailableItems':unavailable,'unavailableBlocks':[d['name']for d in BLOCKS.values()if not d['available']],'provenance':{'texturePack':P['source'],'texturePackRevision':P['revision'],'codeApiRevision':json.loads((SRC/'api-tree.json').read_text())['sha'],'blockMappingUrl':'https://bloxdhub.com/build/assets/blocks-DzukVGOz.js','gameMappingUrl':'https://bloxd.io/static/js/9s8fb.main.a0c909b6.js','retrieved':'2026-10-23','blockMappingSHA256':json.loads((SRC/'source-hashes.json').read_text())['blockMappingSHA256'],'gameMappingSHA256':json.loads((SRC/'source-hashes.json').read_text())['gameMappingSHA256']}}
DATA={'textures':T,'models':MODELS,'skin':'data:image/png;base64,'+base64.b64encode((A/'bob-classic-skin.png').read_bytes()).decode(),'revision':P['revision'],'catalog':CAT}
raw=json.dumps(DATA,separators=(',',':'),ensure_ascii=False).encode();packed=gzip.compress(raw,compresslevel=9,mtime=0);encoded=base64.b64encode(packed).decode();(ROOT/'lib/asset-data.js').write_text('// Complete public asset collection; decompressed locally. See assets/catalog.json and CREDITS.md.\nexport default '+json.dumps({'format':'gzip-base64','payload':encoded,'counts':counts},separators=(',',':'))+';\n')
(A/'catalog.json').write_text(json.dumps(CAT,ensure_ascii=False,indent=2)+'\n');(A/'default-pack-manifest.json').write_text(json.dumps(P,indent=2)+'\n')
(ROOT/'ASSET-COVERAGE.json').write_text(json.dumps({'counts':counts,'unavailableItems':unavailable,'unavailableBlocks':CAT['unavailableBlocks'],'modelDecodeFailures':failures,'provenance':CAT['provenance'],'note':'Complete public default pack; complete published block/item name lists plus mapped live extras. Some internal metadata-only entries have no published visual. Shapes/state simulation are editor renderings, not the game engine.'},indent=2)+'\n')
print('COUNTS',json.dumps(counts));print('Missing item visuals',unavailable);print('Missing blocks',CAT['unavailableBlocks']);print('Packed',len(raw),'->',len(packed),'bytes; JS',len(encoded),flush=True)
