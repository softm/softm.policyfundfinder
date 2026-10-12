import {plain} from './bizinfo.mjs';
import {koreanDate,deadline,categoryLabel} from '../public/core.js';
import {regions} from '../public/data.js';
const ROOT='https://ica.pay.naver.com/partner/api/subvention';
const url=value=>{try{const u=new URL(plain(value));return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:undefined;}catch{return undefined;}};
function day(value){const m=String(value||'').match(/(?:(20)?(\d{2}))[.\-/](\d{2})[.\-/](\d{2})/);if(!m)return null;const d=`20${m[2]}-${m[3]}-${m[4]}`;return Number.isFinite(Date.parse(d))?d:null;}
export function titleKey(p){return (p.fullTitle||p.title).normalize('NFKC').replace(/\s+/g,'').toLowerCase()+'|'+(p.end||'');}
export function normalizeNpay(row,checkedAt=koreanDate()){
  if(!/^[\w-]{1,90}$/.test(row.subventionId||'')||!row.subventionTitleName)throw Error('공개 공고 식별자 또는 제목 누락');
  const title=plain(row.subventionTitleName),tags=(row.hashCodeList||[]).map(t=>plain(t.hashName)).filter(Boolean);
  const area=(row.subventionAreaList||[]).map(a=>plain(a.areaName));
  const titleRegions=regions.filter(r=>title.startsWith('['+r)||title.startsWith('['+r+'ㆍ'));
  const selectedRegions=titleRegions.length?titleRegions:regions.filter(r=>area.some(a=>a.startsWith(r)));
  const category=plain(row.subventionCompanyTypeCodeList?.[0]?.description)||'분류 미제공';
  const end=day(row.receptionEndYmd),summary=plain(row.businessOverviewContent||row.businessOverviewHtmlContent);
  const attachments=(row.subventionFileList||[]).map(f=>({name:plain(f.linkFileName)||'첨부파일',url:url(f.linkFileUrlAddress),kind:'첨부파일',pdf:/\.pdf$/i.test(f.linkFileName||'')})).filter(f=>f.url);
  const sourceUrl=url(row.pblancDetailUrl)||`https://mybiz.pay.naver.com/subvention/detail/${encodeURIComponent(row.subventionId)}`;
  const support=plain(row.supportContent||row.supportHtmlContent),application=url(row.subventionUrlAddress||row.subventionHomepageUrl);
  return {id:'NPAY_'+row.subventionId,externalId:row.subventionId,sourceProvider:'npay',sourceActive:row.isActive===true,title,fullTitle:title,
    category,subcategory:'',region:selectedRegions.length===1?selectedRegions[0]:selectedRegions.length?'복수지역':area.includes('전국')?'전국':'지역 확인',regions:selectedRegions,regionSoft:true,
    type:'지원사업',purpose:{금융:'사업자금',기술:'ESG·기술',수출:'판로·홍보',내수:'판로·홍보',창업:'창업'}[category]||'기타',agency:plain(row.receptionInstitutionName)||'기관 원문 확인',published:'',start:null,end,
    periodText:plain(row.receptionTermContent)||'접수 기간 원문 확인',benefit:support.slice(0,160)||'지원 내용 상세 확인',summary:summary||'공고 상세에서 사업개요·신청방법·첨부파일을 확인하세요.',overview:summary,
    target:plain(row.supportQualificationContent||row.supportQualificationHtmlContent)||'신청 자격 원문 확인',industries:[],businessKinds:[],requirements:['공개 목록의 지역·분야는 검색 분류입니다. 신청 자격과 제외 조건은 공식 원문에서 확인하세요.'],
    method:plain(row.applicationWayContent||row.applicationWayHtmlContent)||'신청 방법 상세 확인',application,sourceUrl,attachments,documents:[],contact:plain(row.responsibleDivisionName)||'공식 원문의 문의처 확인',phone:plain(row.telNumber)||undefined,
    tags,cost:'자부담·지원 한도 원문 확인',repayment:'지원 성격·상환 조건 원문 확인',checkedAt,imported:true,detailPending:!row.businessOverviewHtmlContent&&!row.businessOverviewContent};
}
export async function publicRead(path,fetcher=fetch){
  const r=await fetcher(ROOT+path,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(45000)});
  if(!r.ok)throw Error('네이버 공개 공고 연결 실패 (HTTP '+r.status+')');const v=await r.json();if(!v.success)throw Error('네이버 공개 공고 응답 오류');return v.data;
}
export async function catalogState(env){
  const s=await env.DB.prepare("SELECT value FROM settings WHERE key='catalog_generation'").first();
  if(!s)return null;const r=await env.DB.prepare('SELECT * FROM catalog_runs WHERE id=?').bind(s.value).first();
  if(!r)return null;return {...r,generation:s.value};
}
export async function startCatalog(env,expected,expectedActive){
  if(!Number.isInteger(expected)||expected<1||expected>150000||!Number.isInteger(expectedActive)||expectedActive<0||expectedActive>expected)throw Error('원천 공고 건수를 확인하세요.');
  const id=crypto.randomUUID();await env.DB.prepare("INSERT INTO catalog_runs (id,status,expected,expected_active,started,count) VALUES (?,'running',?,?,?,0)").bind(id,expected,expectedActive,new Date().toISOString()).run();return {id,expected,expectedActive};
}
async function insertPrograms(env,generation,programs,provider){
  for(let i=0;i<programs.length;i+=25){const statements=[];for(const p of programs.slice(i,i+25)){
    const key=titleKey(p),priority=provider==='bizinfo'?0:1,active=provider==='npay'?(p.sourceActive?1:0):deadline(p).state==='closed'?0:deadline(p).state==='unknown'?2:1;
    statements.push(env.DB.prepare(`INSERT INTO catalog_entries (generation,id,dedup_key,data,title,search_text,category,region,source,is_active,published,end_date,priority) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(generation,dedup_key) DO UPDATE SET id=excluded.id,data=excluded.data,category=excluded.category,region=excluded.region,source=excluded.source,is_active=excluded.is_active,published=excluded.published,end_date=excluded.end_date,priority=excluded.priority WHERE excluded.priority<catalog_entries.priority`).bind(generation,p.id,key,JSON.stringify(p),p.title,[p.title,p.summary,p.agency,p.region,...p.tags].join(' ').toLowerCase(),categoryLabel(p),p.region,provider,active,p.published||'',p.end||null,priority));
    statements.push(env.DB.prepare('INSERT OR IGNORE INTO catalog_source_ids (generation,provider,external_id,dedup_key) VALUES (?,?,?,?)').bind(generation,provider,p.externalId||p.id,key));
  }await env.DB.batch(statements);}
}
export async function importCatalogPage(env,id,rows){
  const run=await env.DB.prepare('SELECT * FROM catalog_runs WHERE id=?').bind(id).first();if(!run||run.status!=='running')throw Error('진행 중인 통합 수집이 없습니다.');
  if(!Array.isArray(rows)||!rows.length||rows.length>500)throw Error('공고 페이지 크기를 확인하세요.');
  await insertPrograms(env,id,rows.map(r=>normalizeNpay(r)), 'npay');
  const n=await env.DB.prepare("SELECT COUNT(*) AS n FROM catalog_source_ids WHERE generation=? AND provider='npay'").bind(id).first();
  await env.DB.prepare('UPDATE catalog_runs SET count=? WHERE id=?').bind(n.n,id).run();return {id,collected:n.n,expected:run.expected};
}
export async function finishCatalog(env,id,bizinfoPrograms){
  const previous=await catalogState(env);
  const run=await env.DB.prepare('SELECT * FROM catalog_runs WHERE id=?').bind(id).first();
  if(!run||run.status!=='running'||run.count!==run.expected)throw Error('원천 전체 건수와 수집 건수가 다릅니다. 이전 자료를 유지합니다.');
  await insertPrograms(env,id,bizinfoPrograms.map(p=>({...p,sourceProvider:'bizinfo'})),'bizinfo');
  const n=await env.DB.prepare('SELECT COUNT(*) AS n FROM catalog_entries WHERE generation=?').bind(id).first();
  const completed=new Date().toISOString();
  await env.DB.batch([env.DB.prepare("UPDATE catalog_runs SET status='success',completed=?,count=? WHERE id=?").bind(completed,n.n,id),env.DB.prepare("INSERT INTO settings (key,value) VALUES ('catalog_generation',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(id)]);
  // Keep the previous complete generation; discard older completed staging data.
  try{for(const table of ['catalog_entries','catalog_source_ids'])await env.DB.prepare(`DELETE FROM ${table} WHERE generation NOT IN (?,?) AND generation IN (SELECT id FROM catalog_runs WHERE status IN ('success','failed'))`).bind(id,previous?.generation||id).run();}catch{/* Cleanup must not reverse a complete published generation. */}
  return {id,count:n.n,npaySourceCount:run.expected,npayActiveCount:run.expected_active,bizinfoSourceCount:bizinfoPrograms.length,completed};
}
export async function findCatalogNotice(env,id){
  const state=await catalogState(env);if(!state)return null;
  const external=id.startsWith('NPAY_')?id.slice(5):id;
  const row=await env.DB.prepare('SELECT data FROM catalog_entries WHERE generation=? AND (id=? OR dedup_key IN (SELECT dedup_key FROM catalog_source_ids WHERE generation=? AND external_id=?)) LIMIT 1').bind(state.generation,id,state.generation,external).first();return row?JSON.parse(row.data):null;
}
export async function catalogSearch(env,input,state){
  const f=input.filters||input,args=[state.generation],clauses=['generation=?'];
  if(f.region&&f.region!=='전체'){clauses.push("(region IN (?, '전국','지역 확인') OR EXISTS (SELECT 1 FROM json_each(json_extract(data,'$.regions')) WHERE value=?))");args.push(f.region,f.region);}
  if(f.type&&f.type!=='전체'){clauses.push("json_extract(data,'$.type')=?");args.push(f.type);}
  if(f.purpose&&f.purpose!=='전체'){clauses.push("json_extract(data,'$.purpose')=?");args.push(f.purpose);}
  if(f.status==='closed')clauses.push('is_active=0');else if(f.status!=='all')clauses.push('is_active<>0');
  if(f.status==='open')clauses.push('is_active=1');
  if(f.status==='unknown')clauses.push('is_active=2');
  if(f.status==='upcoming'){clauses.push("json_extract(data,'$.start')>?");args.push(koreanDate());}
  if(f.status==='urgent'){clauses.push('is_active=1 AND end_date BETWEEN ? AND ?');args.push(koreanDate(),koreanDate(new Date(Date.now()+7*86400000)));}
  for(const token of String(f.query||'').toLowerCase().trim().split(/\s+/).filter(Boolean)){clauses.push("search_text LIKE ? ESCAPE '\\'");args.push('%'+token.replace(/[\\%_]/g,'\\$&')+'%');}
  const base=clauses.join(' AND '),baseArgs=[...args];
  if(f.category&&f.category!=='전체'){clauses.push('category=?');args.push(f.category);}
  const subClause=f.subcategory&&f.subcategory!=='전체'?" AND COALESCE(NULLIF(json_extract(data,'$.subcategory'),''),'중분류 미제공')=?":'';
  if(subClause)args.push(f.subcategory);const where=clauses.join(' AND ')+subClause;
  const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM catalog_entries WHERE '+where).bind(...args).first();
  const pageSize=Math.min(200,Math.max(1,Math.trunc(Number(input.pageSize)||12))),pages=Math.max(1,Math.ceil(count.n/pageSize)),page=Math.min(pages,Math.max(1,Math.trunc(Number(input.page)||1)));
  const sort=f.sort==='deadline'?"COALESCE(end_date,'9999') ASC":f.sort==='amount'?"COALESCE(json_extract(data,'$.amountMax'),-1) DESC":"published DESC,is_active DESC,title ASC";
  const list=await env.DB.prepare('SELECT data FROM catalog_entries WHERE '+where+' ORDER BY '+sort+' LIMIT ? OFFSET ?').bind(...args,pageSize,(page-1)*pageSize).all();
  const facets=await env.DB.prepare('SELECT category,COUNT(*) AS n FROM catalog_entries WHERE '+base+' GROUP BY category').bind(...baseArgs).all();
  const categoryCounts={전체:facets.results.reduce((n,r)=>n+r.n,0)};for(const r of facets.results)categoryCounts[r.category]=r.n;
  const subArgs=[...baseArgs],subWhere=base+(f.category&&f.category!=='전체'?' AND category=?':'');if(f.category&&f.category!=='전체')subArgs.push(f.category);
  const sub=await env.DB.prepare("SELECT COALESCE(NULLIF(json_extract(data,'$.subcategory'),''),'중분류 미제공') AS name,COUNT(*) AS count FROM catalog_entries WHERE "+subWhere+' GROUP BY name ORDER BY name').bind(...subArgs).all();
  const metrics=await env.DB.prepare("SELECT SUM(is_active=1) AS withinPeriod,SUM(is_active=2) AS unknownPeriod,SUM(is_active<>0 AND category='금융') AS financial,SUM(is_active=1 AND end_date BETWEEN ? AND ?) AS urgent FROM catalog_entries WHERE generation=?").bind(koreanDate(),koreanDate(new Date(Date.now()+7*86400000)),state.generation).first();
  return {programs:list.results.map(r=>JSON.parse(r.data)),total:count.n,page,pages,pageSize,sourceCount:state.count,categoryCounts,subcategories:sub.results,...metrics};
}
