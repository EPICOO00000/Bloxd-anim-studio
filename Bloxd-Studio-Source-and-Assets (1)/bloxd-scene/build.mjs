import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const result=await build({entryPoints:[path.join(root,'app.js')],bundle:true,write:false,format:'iife',minify:true,target:'es2020',legalComments:'inline',alias:{three:path.join(root,'vendor/three.module.js')}});
const js=result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
let html=await readFile(path.join(root,'index.html'),'utf8');
const css=await readFile(path.join(root,'style.css'),'utf8');
const notices=await Promise.all(['LICENSE-three.txt','LICENSE-fix-webm-duration.txt','LICENSE-lamejs.txt','LGPL-3.0.txt','GPL-3.0.txt','COPYING-LAME-legacy.txt','LICENSE-mediabunny.txt','LICENSE-fflate.txt'].map(n=>readFile(path.join(root,'vendor',n),'utf8')));
// Function replacements are essential: minified JS can contain literal $& / $` / $'.
// A replacement string would expand them into the matched HTML and corrupt the bundle.
html=html.replace('</head>',()=>'<!-- Third-party notices\n'+notices.join('\n\n')+'\n-->\n</head>');
html=html.replace('<link rel="stylesheet" href="style.css">',()=>`<style>${css}</style>`)
 .replace(/<script type="importmap">[\s\S]*?<\/script>/,'')
 .replace('<script type="module" src="app.js"></script>',()=>`<script>${js}</script>`);
await writeFile(path.join(root,'START-HERE.html'),html);
await writeFile(path.join(root,'../Bloxd-Studio.html'),html);
const version=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version.split('.').slice(0,2).join('.');
await writeFile(path.join(root,`../Bloxd-Studio-${version}.html`),html);
console.log(`Built a fully self-contained editor: ${(Buffer.byteLength(html)/1024/1024).toFixed(2)} MB. Manual editing is offline; optional Gemini generation needs your key and internet.`);
