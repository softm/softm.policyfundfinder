import {readFile,writeFile} from 'node:fs/promises';
import {readSnapshot,writeJsonGzip} from './static-catalog.mjs';
import {fetchOfficialAttachments,parseOfficialAttachments} from './official-attachments.mjs';
import {mergeAttachmentViews,normalizeAttachments} from '../public/attachment-links.js';
import {koreanDate,deadline} from '../public/core.js';
import {pathToFileURL} from 'node:url';
export async function enrichAttachmentViews(programs,{previous={},limit=150,priorityId,fetcher=fetch,onProgress=async()=>{}}={}){
  const views={...previous},eligible=programs.filter(p=>p.sourceProvider==='bizinfo'&&normalizeAttachments(p.attachments).some(f=>/\.(hwp|hwpx|pdf|docx?|xlsx?|pptx?)$/i.test(f.name)));
  eligible.sort((a,b)=>(a.id===priorityId?-1:b.id===priorityId?1:0)||Number(deadline(a).state==='closed')-Number(deadline(b).state==='closed')||Number(!!views[a.id])-Number(!!views[b.id])||b.published.localeCompare(a.published));
  const selected=eligible.slice(0,limit);let next=0,done=0;
  await Promise.all(Array.from({length:4},async()=>{while(next<selected.length){const p=selected[next++];try{const files=await fetchOfficialAttachments(p,fetcher);if(files.length)views[p.id]=mergeAttachmentViews(p.attachments,files);}catch{}if(++done%20===0){console.log('공식 첨부 뷰어 확인',done,'/',selected.length);await onProgress(views);}}}));
  return views;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const root='public/data',s=await readSnapshot(root);let previous={};if(s.manifest.attachmentViews)try{previous=await import('./static-catalog.mjs').then(m=>m.readJsonGzip('public/'+s.manifest.attachmentViews));}catch{}
  try{const progress=await import('./static-catalog.mjs').then(m=>m.readJsonGzip('.work/attachment-views-progress.json.gz'));previous={...previous,...progress};}catch{}
  const sample=s.programs.find(p=>p.id==='PBLN_000000000127130');const local=process.argv.find(x=>x.startsWith('--sample-html='));if(sample&&local)previous[sample.id]=mergeAttachmentViews(sample.attachments,parseOfficialAttachments(await readFile(local.slice(14),'utf8')));
  const views=await enrichAttachmentViews(s.programs,{previous,limit:Number(process.env.ATTACHMENT_LIMIT||60),priorityId:sample?.id,onProgress:views=>writeJsonGzip('.work/attachment-views-progress.json.gz',views)});
  const filename='attachment-views-'+Date.now()+'.json.gz';await writeJsonGzip(root+'/'+filename,views);s.manifest.attachmentViews='data/'+filename;s.manifest.status.attachmentViewerCount=Object.values(views).flat().filter(f=>f.viewerUrl).length;await writeFile(root+'/manifest.json',JSON.stringify(s.manifest));console.log('공식 뷰어 연결 완료',JSON.stringify({notices:Object.keys(views).length,viewerFiles:s.manifest.status.attachmentViewerCount,attachmentViews:s.manifest.attachmentViews}));
}
