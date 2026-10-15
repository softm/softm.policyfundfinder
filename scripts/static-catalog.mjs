import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {titleKey} from '../server/catalog.mjs';
import {classifyProgram} from '../public/notice-classification.js';
import {shardFor} from '../public/static-search.js';

export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function readJsonGzip(path){return JSON.parse(gunzipSync(await readFile(path)));}
export async function writeJsonGzip(path,value){await mkdir(join(path,'..'),{recursive:true});await writeFile(path,gzipSync(JSON.stringify(value),{level:9}));}
export async function readSnapshot(root){
  const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
  const programs=[];for(let shard=0;shard<32;shard++)programs.push(...Object.values(await readJsonGzip(join(root,manifest.version,'details',`${shard}.json.gz`))));
  return {manifest,programs};
}
export function combinePrograms(npay,bizinfo,previous=[]){
  const canonical=new Map();for(const p of [...bizinfo,...npay]){const key=titleKey(p);if(!canonical.has(key))canonical.set(key,p);}
  const programs=[...canonical.values()],aliases={};
  for(const p of [...npay,...bizinfo,...previous]){const current=canonical.get(titleKey(p));if(current&&p.id!==current.id)aliases[p.id]=current.id;}
  const ids=new Set(programs.map(p=>p.id)),archive=previous.filter(p=>!ids.has(p.id)&&!aliases[p.id]).map(p=>({...p,sourceActive:false,archived:true}));
  return {programs,aliases,archive};
}
function indexEntry(p){
  const keys=['id','title','fullTitle','region','regions','regionSoft','city','cities','category','subcategory','type','purpose','agency','published','start','end','sourceActive','sourceProvider','sourceUrl','amountMax','periodText','benefit','tags','industries','businessKinds','requirements','employeeMin','employeeMax','ageMin','ageMax','yearsMax','residence','budgetLimited','checkedAt','imported'];
  const row=Object.fromEntries(keys.filter(k=>p[k]!==undefined).map(k=>[k,p[k]]));
  row.summary=(p.summary||'').slice(0,240);row.target=(p.target||'').slice(0,600);row.search=[p.summary,p.overview,p.target].filter(Boolean).join(' ').slice(0,6000);return row;
}
export async function exportCatalog(root,{npay,bizinfo,previous=[],expected,expectedActive,completed,bizinfoLastSuccess,bizinfoError=null,pdfCount=0}){
  if(npay.length!==expected||new Set(npay.map(p=>p.id)).size!==expected)throw Error('원천 전체 건수 또는 고유 ID 건수가 다릅니다.');
  // Also reclassify cached, previously collected notices without requiring fresh detail calls.
  const {programs,aliases,archive}=combinePrograms(npay.map(classifyProgram),bizinfo.map(classifyProgram),previous);
  const signature=digest(JSON.stringify(programs));const version='v-'+completed.replace(/\D/g,'')+'-'+signature.slice(0,10),dir=join(root,version);
  await mkdir(join(dir,'details'),{recursive:true});
  const files={};
  async function output(path,data){await writeJsonGzip(join(dir,path),data);const bytes=await readFile(join(dir,path));files[path]={sha256:digest(bytes),bytes:bytes.length};}
  await output('index.json.gz',{programs:programs.map(indexEntry)});
  const shards=Array.from({length:32},()=>({}));
  for(const p of [...programs,...archive])shards[shardFor(p.id)][p.id]={...p,staticCatalog:true,detailPending:false};
  for(let i=0;i<32;i++)await output(`details/${i}.json.gz`,shards[i]);
  const detailCount=programs.filter(p=>p.sourceProvider==='bizinfo'||p.detailAvailable).length;
  const npayNotDetailed=programs.filter(p=>p.sourceProvider==='npay'&&!p.detailAvailable);
  const npayActiveNotDetailed=npayNotDetailed.filter(p=>p.sourceActive).length;
  const typeCounts={};for(const p of programs)typeCounts[p.type]=(typeCounts[p.type]||0)+1;
  const status={connected:true,mode:'live',count:programs.length,lastSuccess:completed,running:false,lastRun:{status:'success',count:programs.length,completed},bizinfoLastSuccess,bizinfoError,detailCount,npayMissingDetailCount:npayNotDetailed.length,npayActiveMissingDetailCount:npayActiveNotDetailed,typeCounts,pdfCount,schedule:{state:'enabled',time:'매일 06:17',timezone:'Asia/Seoul'},catalog:{npaySourceCount:expected,npayActiveCount:expectedActive,uniqueCount:programs.length,lastSuccess:completed}};
  const manifest={schema:1,version,files,aliases,status};
  // Publish the manifest only after every shard has been written and verified.
  await verifyCatalog(root,manifest);
  await writeFile(join(root,'manifest.json'),JSON.stringify(manifest));return manifest;
}
export async function verifyCatalog(root,manifest){
  for(const [path,meta] of Object.entries(manifest.files)){const bytes=await readFile(join(root,manifest.version,path));if(bytes.length!==meta.bytes||digest(bytes)!==meta.sha256)throw Error('공고 파일 검증 실패: '+path);}
  const index=await readJsonGzip(join(root,manifest.version,'index.json.gz'));
  if(index.programs.length!==manifest.status.count||new Set(index.programs.map(p=>p.id)).size!==index.programs.length)throw Error('검색 목록 건수 검증 실패');
  const ids=new Set();for(let i=0;i<32;i++){const records=await readJsonGzip(join(root,manifest.version,'details',`${i}.json.gz`));for(const [id,p] of Object.entries(records)){if(id!==p.id||shardFor(id)!==i)throw Error('상세 식별자 검증 실패');ids.add(id);for(const f of p.attachments||[])if(f.cachedUrl){const bytes=await readFile(join(root,'..',f.cachedUrl));if(!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))throw Error('PDF 형식 검증 실패');}}}
  if(index.programs.some(p=>!ids.has(p.id))||Object.values(manifest.aliases).some(id=>!ids.has(id)))throw Error('상세 또는 관심사업 연결 누락');return {count:index.programs.length,details:ids.size};
}
