import {mkdir,readFile,writeFile,cp,stat,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {normalizeNpay,publicRead,titleKey} from '../server/catalog.mjs';
import {collectAll} from '../server/bizinfo.mjs';
import {koreanDate,deadline} from '../public/core.js';
import {readSnapshot,readJsonGzip,writeJsonGzip,exportCatalog,digest} from './static-catalog.mjs';

export async function retry(operation,attempts=3){let error;for(let n=0;n<attempts;n++){try{return await operation();}catch(e){error=e;if(n+1<attempts)await new Promise(resolve=>setTimeout(resolve,1000*(n+1)));}}throw error;}
async function concurrent(items,limit,fn){let next=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(next<items.length){const index=next++;await fn(items[index],index);}}));}
export async function collectNpay(read=publicRead){
  const expected=await retry(()=>read('/list/count?isActive=N&searchType=all'));
  const expectedActive=await retry(()=>read('/list/count?isActive=Y&searchType=all'));
  if(!Number.isInteger(expected)||expected<1||expected>150000||!Number.isInteger(expectedActive)||expectedActive<0||expectedActive>expected)throw Error('공개 원천 건수 응답 오류');
  const pages=Array.from({length:Math.ceil(expected/500)},(_,i)=>i),dataPages=[];let received=0;
  await concurrent(pages,3,async page=>{const data=await retry(()=>read(`/list?page=${page}&pageSize=500&isActive=N&searchType=all`));if(data.number!==page||data.size!==500||!Array.isArray(data.content)||data.content.length!==Math.min(500,expected-page*500))throw Error('공고 페이지 번호·건수 불일치');dataPages[page]=data.content;received+=data.content.length;if(page%10===0)console.log('공개 목록 수집',received,'/',expected);});
  const rows=dataPages.flat();
  const final=await retry(()=>read('/list/count?isActive=N&searchType=all'));
  if(final!==expected||rows.length!==expected||new Set(rows.map(r=>r.subventionId)).size!==expected)throw Error('수집 중 원천 변경 또는 공고 누락. 기존 배포를 유지합니다.');
  return {rows,expected,expectedActive};
}
export async function collectPages({key=process.env.BIZINFO_API_KEY,root='.work/data',cacheRoot='.catalog-cache',detailLimit=Number(process.env.DETAIL_LIMIT||500),pdfLimit=Number(process.env.PDF_LIMIT||40)}={}){
  let previous;try{previous=await readSnapshot(join(cacheRoot,'data'));}catch{previous=await readSnapshot('public/data');}
  const previousRoot=await stat(join(cacheRoot,'data',previous.manifest.version)).then(()=>join(cacheRoot,'data')).catch(()=>join('public','data'));
  await rm(root,{recursive:true,force:true});
  await mkdir(root,{recursive:true});await cp(join('public','data','pdf'),join(root,'pdf'),{recursive:true,force:true}).catch(()=>{});
  await cp(join(previousRoot,previous.manifest.version),join(root,previous.manifest.version),{recursive:true});
  await cp(join(cacheRoot,'data','pdf'),join(root,'pdf'),{recursive:true,force:true}).catch(()=>{});
  const previousNpay=new Map(previous.programs.filter(p=>p.sourceProvider==='npay').map(p=>[p.externalId,p]));
  let bizinfo=previous.programs.filter(p=>p.sourceProvider==='bizinfo'),bizinfoLastSuccess=previous.manifest.status.bizinfoLastSuccess,bizinfoError=null;
  if(key){try{const result=await retry(()=>collectAll(key,koreanDate()),2);bizinfo=result.programs.map(p=>({...p,sourceProvider:'bizinfo',detailAvailable:true}));bizinfoLastSuccess=new Date().toISOString();console.log('기업마당 수집 완료',bizinfo.length);}catch{bizinfoError='기업마당 갱신 실패: 이전 성공 자료를 유지합니다.';console.warn(bizinfoError);}}
  else {bizinfoError='기업마당 자동 갱신용 인증키가 아직 설정되지 않아 이전 성공 자료를 사용합니다.';console.warn(bizinfoError);}
  const {rows,expected,expectedActive}=await retry(()=>collectNpay(),2);
  await writeJsonGzip(join(cacheRoot,'npay-list.json.gz'),{rows,expected,expectedActive,completed:new Date().toISOString()});
  const npay=rows.map(row=>{const base=normalizeNpay(row),prior=previousNpay.get(base.externalId);return prior?.detailAvailable?{...prior,...base,summary:prior.summary,overview:prior.overview,target:prior.target,benefit:prior.benefit,method:prior.method,application:prior.application,attachments:prior.attachments,sourceUrl:prior.sourceUrl,contact:prior.contact,phone:prior.phone,detailAvailable:true,detailCheckedAt:prior.detailCheckedAt}:base;});
  const bizinfoKeys=new Set(bizinfo.map(titleKey));
  const active=npay.filter(p=>p.sourceActive&&!bizinfoKeys.has(titleKey(p))).sort((a,b)=>(a.detailCheckedAt||'').localeCompare(b.detailCheckedAt||''));
  const selected=active.slice(0,detailLimit),byId=new Map(rows.map(r=>[r.subventionId,r]));let detailSuccess=0,detailDone=0;
  await concurrent(selected,4,async p=>{try{const row=byId.get(p.externalId);const detail=await retry(()=>publicRead('/detail/'+encodeURIComponent(p.externalId)),2);Object.assign(p,normalizeNpay({...row,...detail,isActive:p.sourceActive}),{detailAvailable:true,detailCheckedAt:new Date().toISOString()});detailSuccess++;}catch{p.detailAvailable=!!p.detailAvailable;}detailDone++;if(detailDone%25===0)console.log('공고 상세 확인',detailDone,'/',selected.length,'성공',detailSuccess);});
  // PDFs use only registered official attachment URLs. Size, signature, redirects and total budget are checked.
  const all=[...bizinfo,...npay],pdfs=all.filter(p=>deadline(p).state!=='closed').flatMap(p=>(p.attachments||[]).filter(f=>f.pdf).map(f=>({p,f}))),pdfRoot=join(root,'pdf');await mkdir(pdfRoot,{recursive:true});
  let downloaded=0,attempted=0,totalBytes=0;const seen=new Set();
  for(const name of await readdir(pdfRoot))totalBytes+=(await stat(join(pdfRoot,name))).size;
  for(const {f} of pdfs){const hash=digest(f.url),name=hash+'.pdf',path=join(pdfRoot,name);if(seen.has(hash))continue;seen.add(hash);
    try{const bytes=await readFile(path);if(bytes.subarray(0,1024).includes(Buffer.from('%PDF-'))){f.cachedUrl='data/pdf/'+name;continue;}}catch{}
    if(attempted>=pdfLimit||totalBytes>120*1024*1024)continue;
    attempted++;
    try{const u=new URL(f.url);if(u.protocol!=='https:'||!['www.bizinfo.go.kr','www.smes.go.kr'].includes(u.hostname)||u.username||u.password)continue;const r=await fetch(u,{signal:AbortSignal.timeout(20000),redirect:'error'});if(!r.ok||Number(r.headers.get('content-length')||0)>10*1024*1024)continue;const reader=r.body.getReader(),parts=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>10*1024*1024){await reader.cancel();throw Error('PDF too large');}parts.push(Buffer.from(value));}const bytes=Buffer.concat(parts);if(!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))continue;await writeFile(path,bytes);f.cachedUrl='data/pdf/'+name;downloaded++;totalBytes+=size;}catch{}
  }
  for(const p of all)for(const f of p.attachments||[]){const name=digest(f.url)+'.pdf';try{await stat(join(pdfRoot,name));f.cachedUrl='data/pdf/'+name;}catch{delete f.cachedUrl;}}
  const completed=new Date().toISOString();
  const manifest=await exportCatalog(root,{npay,bizinfo,previous:previous.programs,expected,expectedActive,completed,bizinfoLastSuccess,bizinfoError,pdfCount:(await readdir(pdfRoot)).filter(x=>x.endsWith('.pdf')).length});
  await mkdir(cacheRoot,{recursive:true});await rm(join(cacheRoot,'data'),{recursive:true,force:true});await cp(root,join(cacheRoot,'data'),{recursive:true,force:true});
  console.log('정적 공고 생성 완료',JSON.stringify({count:manifest.status.count,npaySourceCount:expected,npayActiveCount:expectedActive,detailCount:manifest.status.detailCount,pdfDownloaded:downloaded,completed}));return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  let key=process.env.BIZINFO_API_KEY;
  if(process.argv.includes('--key-stdin')){process.stdin.setRawMode?.(true);console.log('Ready for API key JSON on stdin (input hidden).');let raw='';key=await new Promise((resolve,reject)=>{process.stdin.on('data',data=>{raw+=data.toString();if(raw.includes('\n')){process.stdin.pause();try{resolve(JSON.parse(raw.trim()).key);}catch(e){reject(e);}}});});}
  try{await collectPages({key});}catch(error){console.error('전체 수집 실패. 기존 Pages 배포는 유지됩니다.',error.message);process.exitCode=1;}
}
