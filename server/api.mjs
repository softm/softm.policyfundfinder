import {programs as fallback,DATA_DATE} from '../public/data.js';
import {filterPrograms,categoryFacets,koreanDate,deadline,safeText} from '../public/core.js';
import {collectAll,fetchFeed,normalizeNotice} from './bizinfo.mjs';
import {seal,unseal} from './secrets.mjs';
import {pdfPreview,storePdf} from './attachments.mjs';
import {catalogState,catalogSearch,startCatalog,importCatalogPage,finishCatalog,findCatalogNotice,normalizeNpay,publicRead} from './catalog.mjs';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
let cachedGeneration=null,cachedPrograms=[];
async function init(db){await db.prepare('INSERT OR IGNORE INTO sync_state (id,count,lock_until) VALUES (1,0,0)').run();}
async function keyFrom(env){if(env.BIZINFO_API_KEY)return env.BIZINFO_API_KEY;const s=await env.DB.prepare("SELECT value FROM settings WHERE key='bizinfo_key'").first();return s?unseal(s.value,env.BIZINFO_KEY_ENCRYPTION_SECRET):null;}
async function configured(env){if(env.BIZINFO_API_KEY)return true;return !!await env.DB.prepare("SELECT key FROM settings WHERE key='bizinfo_key'").first();}
export async function dataStatus(env){
  const s=await env.DB.prepare('SELECT * FROM sync_state WHERE id=1').first();
  const last=await env.DB.prepare('SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 1').first();
  const connected=await configured(env);const isRunning=!!(s?.lock_run&&s.lock_until>Date.now());
  const expired=last?.status==='running'&&!isRunning;
  const scheduleSetting=await env.DB.prepare("SELECT value FROM settings WHERE key='refresh_schedule'").first();
  const catalog=await catalogState(env);
  const catalogRun=await env.DB.prepare('SELECT * FROM catalog_runs ORDER BY started DESC LIMIT 1').first();
  const catalogRunning=catalogRun?.status==='running'&&Date.now()-Date.parse(catalogRun.started)<3*3600000;
  return {connected,source:catalog?'기업마당 API + Npay 공개 공고':'기업마당 지원사업 API',coverage:catalog?'네이버 공개 전체 공고와 기업마당 공고를 제목·마감일 기준으로 통합합니다. 원천 건수와 중복 제거 건수는 다릅니다.':'기업마당 API의 현재 제공 공고입니다. 타 기관 공고 및 전체 과거 공고는 포함하지 않습니다.',
    catalog:catalog?{generation:catalog.generation,npaySourceCount:catalog.expected,npayActiveCount:catalog.expected_active,uniqueCount:catalog.count,lastSuccess:catalog.completed}:null,
    bizinfoLastSuccess:s?.last_success||null,bizinfoError:last?.status==='failed'?last.error:null,
    mode:catalog||s?.active_generation?'live':'curated',count:catalog?.count||(s?.active_generation?s.count:fallback.length),lastSuccess:catalog?.completed||s?.last_success||null,curatedDate:DATA_DATE,
    stale:!!s?.last_success&&Date.now()-Date.parse(s.last_success)>36*3600000,running:isRunning||catalogRunning,schedule:scheduleSetting?JSON.parse(scheduleSetting.value):{state:'pending'},
    lastRun:catalogRun?{id:catalogRun.id,status:catalogRun.status,startedAt:catalogRun.started,completedAt:catalogRun.completed,count:catalogRun.count,expected:catalogRun.expected,error:catalogRun.error}:last?{id:last.id,status:expired?'failed':last.status,startedAt:last.started_at,completedAt:last.completed_at,count:last.count,expected:last.expected,error:expired?'수집 연결이 종료되었습니다. 기존 자료를 유지하고 다시 수집하세요.':last.error}:null};
}
async function activePrograms(env){
  const s=await env.DB.prepare('SELECT active_generation FROM sync_state WHERE id=1').first();
  if(!s?.active_generation)return fallback;
  if(cachedGeneration!==s.active_generation){const r=await env.DB.prepare('SELECT data FROM notices WHERE generation=?').bind(s.active_generation).all();cachedPrograms=r.results.map(row=>JSON.parse(row.data));cachedGeneration=s.active_generation;}
  return cachedPrograms;
}
export async function runSync(env){
  const key=await keyFrom(env);if(!key)return {status:412,body:{error:'기업마당 인증키를 먼저 연결하세요.',code:'KEY_REQUIRED'}};
  await init(env.DB);const run=crypto.randomUUID(),started=new Date().toISOString();
  const lock=await env.DB.prepare('UPDATE sync_state SET lock_run=?,lock_until=? WHERE id=1 AND lock_until<?').bind(run,Date.now()+20*60000,Date.now()).run();
  if(!lock.meta.changes)return {status:409,body:{error:'다른 수집 작업이 진행 중입니다. 갱신 상태에서 진행을 확인하세요.',code:'SYNC_BUSY'}};
  try{
    await env.DB.prepare("INSERT INTO sync_runs (id,status,started_at,count) VALUES (?,'running',?,0)").bind(run,started).run();
    const result=await collectAll(key,koreanDate(),fetch,async(count,expected)=>{
      await env.DB.prepare('UPDATE sync_runs SET count=?,expected=? WHERE id=?').bind(count,expected,run).run();
      await env.DB.prepare('UPDATE sync_state SET lock_until=? WHERE id=1 AND lock_run=?').bind(Date.now()+20*60000,run).run();
    });
    // Stage a complete generation first; readers continue using the previous one.
    for(let i=0;i<result.programs.length;i+=50){
      await env.DB.batch(result.programs.slice(i,i+50).map(p=>env.DB.prepare('INSERT INTO notices (generation,id,data) VALUES (?,?,?)').bind(run,p.id,JSON.stringify(p))));
    }
    const completed=new Date().toISOString();
    const final=await env.DB.batch([
      env.DB.prepare('INSERT INTO notice_archive (id,data,last_seen) SELECT id,data,? FROM notices WHERE generation=? ON CONFLICT(id) DO UPDATE SET data=excluded.data,last_seen=excluded.last_seen').bind(completed,run),
      env.DB.prepare("UPDATE sync_runs SET status='success',completed_at=?,count=?,expected=? WHERE id=?").bind(completed,result.programs.length,result.expected,run),
      env.DB.prepare('UPDATE sync_state SET active_generation=?,last_success=?,count=?,lock_run=NULL,lock_until=0 WHERE id=1 AND lock_run=?').bind(run,completed,result.programs.length,run)
    ]);
    if(!final[2].meta.changes)throw Error('수집 잠금이 만료되었습니다. 기존 자료와 갱신 상태를 확인하세요.');
    cachedGeneration=null;
    // Archive retains old notices for favorites; staging generations are disposable.
    try{await env.DB.prepare('DELETE FROM notices WHERE generation<>?').bind(run).run();}catch{/* A cleanup error must not reverse a committed successful import. */}
    return {status:200,body:{ok:true,count:result.programs.length,expected:result.expected,completedAt:completed,runId:run}};
  }catch(err){
    const message=err.message?.startsWith('기업마당')||/공고|수집|인증키/.test(err.message||'')?err.message:'공고 저장 중 오류가 발생했습니다. 기존 자료를 유지합니다.';
    await env.DB.batch([
      env.DB.prepare("UPDATE sync_runs SET status='failed',completed_at=?,error=? WHERE id=?").bind(new Date().toISOString(),message,run),
      env.DB.prepare('UPDATE sync_state SET lock_run=NULL,lock_until=0 WHERE id=1 AND lock_run=?').bind(run),
      env.DB.prepare('DELETE FROM notices WHERE generation=? AND generation<>COALESCE((SELECT active_generation FROM sync_state WHERE id=1),\'\')').bind(run)
    ]);
    return {status:502,body:{error:message,code:'SYNC_FAILED',runId:run}};
  }
}
async function readBody(request){if(Number(request.headers.get('content-length')||0)>12000)throw Error('입력 내용이 너무 큽니다.');const text=await request.text();if(text.length>12000)throw Error('입력 내용이 너무 큽니다.');return JSON.parse(text||'{}');}
export async function handleApi(request,env){
  const u=new URL(request.url),path=u.pathname;
  if(!env.DB)return json({error:'공고 저장소를 준비하고 있습니다. 잠시 후 다시 확인하세요.'},503);
  // This shared service is deployed owner-private. Sites dispatch authenticates both
  // visitors and unattended service calls. Keep the audience private; see OPERATIONS.md.
  if(request.method==='POST'){
    const origin=request.headers.get('Origin');if(origin&&origin!==u.origin)return json({error:'앱에서 요청해 주세요.'},403);
  }
  try{
    if(path==='/api/data-status'&&request.method==='GET')return json(await dataStatus(env));
    if(path==='/api/attachment-preview'&&request.method==='GET'){
      const id=u.searchParams.get('id'),index=Number(u.searchParams.get('index'));
      if(!id||!/^[\w-]{1,100}$/.test(id)||!u.searchParams.has('index')||!Number.isInteger(index)||index<0||index>100)return json({error:'첨부파일 식별자를 확인하세요.'},400);
      const row=await env.DB.prepare('SELECT data FROM notice_archive WHERE id=?').bind(id).first();
      const program=await findCatalogNotice(env,id)||(row?JSON.parse(row.data):null);const file=program?.attachments?.[index];
      if(!file)return json({error:'첨부파일이 없습니다. 기업마당 원문에서 확인하세요.'},404);
      const result=await pdfPreview(file,fetch,env.BUCKET);if(result instanceof Response)return result;
      return new Response(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>공고문 원본 안내</title><body style="font-family:system-ui;padding:24px;line-height:1.8;color:#245141"><h2>공식 원본에서 확인하세요</h2><p>${safeText(result.error)}</p><a href="${safeText(file.url)}" target="_blank" rel="noopener noreferrer">${safeText(file.name||'공고문')} 원본 열기 ↗</a></body></html>`,{status:result.status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }
    if(path==='/api/attachment-cache'&&request.method==='POST'){
      const id=u.searchParams.get('id'),index=Number(u.searchParams.get('index'));
      if(!id||!/^[\w-]{1,100}$/.test(id)||!Number.isInteger(index)||index<0||index>100)return json({error:'첨부파일 식별자를 확인하세요.'},400);
      const row=await env.DB.prepare('SELECT data FROM notice_archive WHERE id=?').bind(id).first();
      const program=await findCatalogNotice(env,id)||(row?JSON.parse(row.data):null);const file=program?.attachments?.[index];
      if(!file?.pdf)return json({error:'저장된 공고의 PDF 첨부파일만 등록할 수 있습니다.'},400);
      if(Number(request.headers.get('content-length')||0)>20*1024*1024)return json({error:'20MB 이하 PDF만 등록할 수 있습니다.'},413);
      const data=await request.arrayBuffer();const result=await storePdf(file,data,env.BUCKET);
      return result.ok?json(result):json({error:result.error},result.status);
    }
    if(path==='/api/catalog-import/start'&&request.method==='POST'){
      const body=await readBody(request);return json(await startCatalog(env,body.expected,body.expectedActive));
    }
    if(path==='/api/catalog-import/page'&&request.method==='POST'){
      if(Number(request.headers.get('content-length')||0)>2000000)return json({error:'공고 페이지가 너무 큽니다.'},413);
      const text=await request.text();if(text.length>2000000)return json({error:'공고 페이지가 너무 큽니다.'},413);const body=JSON.parse(text);
      return json(await importCatalogPage(env,body.runId,body.rows));
    }
    if(path==='/api/catalog-import/finish'&&request.method==='POST'){
      const body=await readBody(request);return json(await finishCatalog(env,body.runId,await activePrograms(env)));
    }
    if(path==='/api/catalog-import/snapshot'&&request.method==='POST'){
      const runId=u.searchParams.get('runId'),run=await env.DB.prepare('SELECT id FROM catalog_runs WHERE id=?').bind(runId).first();
      if(!run||!env.BUCKET||Number(request.headers.get('content-length')||0)>20000000)return json({error:'수집 원본 저장 요청을 확인하세요.'},400);
      const data=await request.arrayBuffer();if(data.byteLength>20000000)return json({error:'수집 원본이 너무 큽니다.'},413);
      await env.BUCKET.put('catalog-snapshots/'+runId+'.json.gz',data,{httpMetadata:{contentType:'application/gzip'}});return json({ok:true,bytes:data.byteLength});
    }
    if(path==='/api/catalog-sync/start'&&request.method==='POST'){
      const [total,active]=await Promise.all([publicRead('/list/count?isActive=N&searchType=all'),publicRead('/list/count?isActive=Y&searchType=all')]);return json(await startCatalog(env,total,active));
    }
    if(path==='/api/catalog-sync/step'&&request.method==='POST'){
      const body=await readBody(request),run=await env.DB.prepare('SELECT * FROM catalog_runs WHERE id=?').bind(body.runId).first();
      if(!run||run.status!=='running')return json({error:'진행 중인 통합 수집이 없습니다.'},400);
      const n=await env.DB.prepare("SELECT COUNT(*) AS n FROM catalog_source_ids WHERE generation=? AND provider='npay'").bind(body.runId).first();
      if(n.n===run.expected)return json({done:true,...await finishCatalog(env,body.runId,await activePrograms(env))});
      try{const page=Math.floor(n.n/500),data=await publicRead('/list?page='+page+'&pageSize=500&isActive=N&searchType=all');
        if(data.number!==page||data.size!==500||!data.content?.length)throw Error('공개 공고 페이지가 반복되거나 누락됐습니다.');
        const result=await importCatalogPage(env,body.runId,data.content);return json({...result,done:false});
      }catch(error){await env.DB.prepare("UPDATE catalog_runs SET status='failed',error=?,completed=? WHERE id=?").bind('공개 공고 연결이 실패했습니다. 이전 통합 자료를 유지합니다.',new Date().toISOString(),body.runId).run();throw error;}
    }
    if(path==='/api/notice-detail'&&request.method==='POST'){
      const {id}=await readBody(request);if(typeof id!=='string'||!/^[\w-]{1,100}$/.test(id))return json({error:'공고 식별자를 확인하세요.'},400);
      const p=await findCatalogNotice(env,id);if(!p)return json({error:'공고가 없습니다.'},404);
      if(p.sourceProvider!=='npay'||!p.detailPending)return json({program:p});
      const detail=await publicRead('/detail/'+encodeURIComponent(p.externalId)),full={...normalizeNpay(detail),id:p.id};
      const state=await catalogState(env);await env.DB.prepare('UPDATE catalog_entries SET data=? WHERE generation=? AND id=?').bind(JSON.stringify(full),state.generation,p.id).run();
      return json({program:full});
    }
    if(path==='/api/schedule-status'&&request.method==='POST'){
      const body=await readBody(request);
      if(!['pending','enabled','paused'].includes(body.state))return json({error:'예약 상태를 확인하세요.'},400);
      const value=JSON.stringify({state:body.state,title:String(body.title||'').slice(0,100),time:String(body.time||'').slice(0,30),timezone:String(body.timezone||'Asia/Seoul').slice(0,50),taskId:String(body.taskId||'').slice(0,150)});
      await env.DB.prepare("INSERT INTO settings (key,value) VALUES ('refresh_schedule',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(value).run();
      return json({ok:true});
    }
    if(path==='/api/connect'&&request.method==='POST'){
      const {key}=await readBody(request);
      if(typeof key!=='string'||key.trim().length<5||key.trim().length>256||/[\s\x00-\x1f]/.test(key.trim()))return json({error:'발급받은 인증키를 확인하세요.'},400);
      if(!env.BIZINFO_KEY_ENCRYPTION_SECRET)return json({error:'서버의 인증키 저장 설정을 확인하세요.'},503);
      const probe=await fetchFeed(key.trim(),{pageIndex:1,pageUnit:1});
      if(!probe.rows.length)return json({error:'기업마당이 공고를 반환하지 않았습니다. 인증키 사용승인을 확인하세요.'},422);
      normalizeNotice(probe.rows[0],koreanDate());
      const encrypted=await seal(key.trim(),env.BIZINFO_KEY_ENCRYPTION_SECRET);
      await env.DB.prepare("INSERT INTO settings (key,value) VALUES ('bizinfo_key',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(encrypted).run();
      return json({ok:true,connected:true,message:'인증키를 연결했습니다. 전체 수집을 시작할 수 있습니다.'});
    }
    if(path==='/api/sync'&&request.method==='POST'){const r=await runSync(env);return json(r.body,r.status);}
    if(path==='/api/programs'&&(request.method==='POST'||request.method==='GET')){
      const input=request.method==='POST'?await readBody(request):Object.fromEntries(u.searchParams);
      const catalog=await catalogState(env);if(catalog)return json(await catalogSearch(env,input,catalog));
      const f=input.filters||input;const all=await activePrograms(env);
      // Profile criteria are processed for this request and never saved or logged.
      const list=filterPrograms(all,f,input.profile||null,[],koreanDate());
      const pageSize=Math.min(200,Math.max(1,Math.trunc(Number(input.pageSize)||12)));
      const pages=Math.max(1,Math.ceil(list.length/pageSize)),page=Math.min(pages,Math.max(1,Math.trunc(Number(input.page)||1)));
      const open=all.filter(p=>deadline(p).state!=='closed');
      return json({programs:list.slice((page-1)*pageSize,page*pageSize),total:list.length,page,pages,pageSize,sourceCount:all.length,
        ...categoryFacets(all,f,input.profile||null,[],koreanDate()),
        withinPeriod:all.filter(p=>['open','urgent'].includes(deadline(p).state)).length,unknownPeriod:all.filter(p=>deadline(p).state==='unknown').length,
        urgent:open.filter(p=>deadline(p).state==='urgent').length,financial:open.filter(p=>['정책융자','이자지원','금융지원'].includes(p.type)).length});
    }
    if(path==='/api/notices'&&request.method==='POST'){
      const {ids}=await readBody(request);if(!Array.isArray(ids)||ids.length>300)return json({error:'공고 목록을 확인하세요.'},400);
      const programs=[];for(const id of [...new Set(ids)]){if(typeof id!=='string'||!/^[\w-]{1,100}$/.test(id))continue;
        const catalog=await findCatalogNotice(env,id);if(catalog){programs.push({...catalog,requestedId:id});continue;}
        const r=await env.DB.prepare('SELECT data,last_seen FROM notice_archive WHERE id=?').bind(id).first();
        if(r)programs.push({...JSON.parse(r.data),archiveLastSeen:r.last_seen});else{const p=fallback.find(p=>p.id===id);if(p)programs.push(p);}
      }
      return json({programs});
    }
    return json({error:'지원하지 않는 요청입니다.'},404);
  }catch(err){return json({error:/기업마당|공고|입력|인증키/.test(err.message||'')?err.message:'요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.'},502);}
}
