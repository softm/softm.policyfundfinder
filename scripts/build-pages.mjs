import {cp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {verifyCatalog} from './static-catalog.mjs';
const out='_site';await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});await cp('public',out,{recursive:true});
try{await cp('.work/data',join(out,'data'),{recursive:true,force:true});}catch(error){if(error.code!=='ENOENT')throw error;}
const rootHtml=await readFile('index.html','utf8');await writeFile(join(out,'index.html'),rootHtml.replaceAll('./public/','./'));
await cp('CNAME',join(out,'CNAME'));await writeFile(join(out,'.nojekyll'),'');
// Preserve links opened while the repository used branch-based /public/ hosting.
await mkdir(join(out,'public'),{recursive:true});await writeFile(join(out,'public','index.html'),'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="robots" content="noindex,follow"><link rel="canonical" href="https://policyfundfinder.designboard.net/"><title>지원한눈</title><script>const u=new URL("../",location.href);u.search=location.search;u.hash=location.hash;location.replace(u.href);</script><a href="../">지원한눈 열기</a></html>');
const manifest=JSON.parse(await readFile(join(out,'data/manifest.json'),'utf8'));
if(!manifest.attachmentViews){const seed=JSON.parse(await readFile('public/data/manifest.json','utf8'));if(seed.attachmentViews){manifest.attachmentViews=seed.attachmentViews;manifest.status.attachmentViewerCount=seed.status.attachmentViewerCount;await writeFile(join(out,'data/manifest.json'),JSON.stringify(manifest));}}
if(manifest.attachmentViews)await readFile(join(out,manifest.attachmentViews));
const result=await verifyCatalog(join(out,'data'),manifest);
const html=await readFile(join(out,'index.html'),'utf8');if(!html.includes('./app.js'))throw Error('Pages entry point missing');
for(const file of ['robots.txt','sitemap.xml','google3963d25075aa9810.html'])await readFile(join(out,file),'utf8');
console.log('GitHub Pages build verified',JSON.stringify({...result,version:manifest.version}));
