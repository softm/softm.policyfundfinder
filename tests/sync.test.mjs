import {d1} from './helpers/d1.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {collectAll,normalizeNotice,parseFeed} from '../server/bizinfo.mjs';
import {handleApi,dataStatus,runSync} from '../server/api.mjs';
import {seal,unseal} from '../server/secrets.mjs';
import {filterPrograms} from '../public/core.js';
import {pageSlice} from '../public/data-client.js';
const notice=(i,total)=>({pblancId:'PBLN_TEST_'+i,pblancNm:`[충남] 테스트 공고 ${i}`,bsnsSumryCn:'<p>공식 API 응답 형식 검증용</p>',hashTags:'충남,금융',pldirSportRealmLclasCodeNm:'금융',reqstBeginEndDe:'20261012 ~ 20261030',creatPnttm:'2026-10-11',totCnt:total});
const response=(rows)=>new Response(JSON.stringify({jsonArray:rows}),{headers:{'Content-Type':'application/json'}});

test('entire feed imports more than 16 and preserves unknown qualifications',async()=>{
  const result=await collectAll('test-key','2026-10-12',async u=>{assert.equal(u.searchParams.get('searchCnt'),'0');assert.equal(u.searchParams.get('crtfcKey'),'test-key');return response(Array.from({length:417},(_,i)=>notice(i,417)));});
  assert.equal(result.programs.length,417);assert.equal(result.expected,417);const p=result.programs[0];assert.equal(p.type,'금융지원');assert.equal(p.amountMax,undefined);assert.deepEqual(p.businessKinds,[]);assert.equal(p.end,'2026-10-30');
});
test('truncated all-data response exhausts pages and checks total',async()=>{
  const calls=[];const rows=Array.from({length:417},(_,i)=>notice(i,417));
  const result=await collectAll('test-key','2026-10-12',async u=>{calls.push(u.href);if(u.searchParams.has('searchCnt'))return response(rows.slice(0,10));const page=Number(u.searchParams.get('pageIndex'));return response(rows.slice((page-1)*200,page*200));});
  assert.equal(result.programs.length,417);assert.equal(calls.length,4);
});
test('repeated pages and changing totals cannot publish incomplete data',async()=>{
  await assert.rejects(collectAll('key','2026-10-12',async()=>response([notice(1,400)])),/반복|누락/);
  await assert.rejects(collectAll('key','2026-10-12',async u=>response([notice(1,u.searchParams.has('searchCnt')?400:401)])),/변경/);
});
test('empty and unauthorized responses fail without revealing credentials',async()=>{
  await assert.rejects(collectAll('secret-value','2026-10-12',async()=>response([])),/0건/);
  await assert.rejects(collectAll('secret-value','2026-10-12',async()=>new Response('secret-value',{status:403})),e=>e.message.includes('HTTP 403')&&!e.message.includes('secret-value'));
  assert.throws(()=>parseFeed({error:'authentication failed'}),/공고 목록/);
});
test('normalization strips markup and excludes unsafe application links',()=>{
  const p=normalizeNotice({...notice(1,1),bsnsSumryCn:'<script>alert(1)</script><p>정보 &amp; 안내</p>',rceptEngnHmpgUrl:'javascript:alert(1)'},'2026-10-12');
  assert.equal(p.summary,'정보 & 안내');assert.equal(p.application,undefined);assert.match(p.sourceUrl,/www.bizinfo.go.kr/);
});
test('regional query uses API tags while qualification stays unknown',()=>{
  const p=normalizeNotice(notice(1,1),'2026-10-12');assert.equal(filterPrograms([p],{region:'서울',status:'all'},null).length,0);assert.equal(filterPrograms([p],{region:'충남',status:'all'},null).length,1);
});
test('key ciphertext round trip and wrong master rejection',async()=>{
  const master='12'.repeat(32),cipher=await seal('secret-key',master);assert.ok(!cipher.includes('secret-key'));assert.equal(await unseal(cipher,master),'secret-key');await assert.rejects(unseal(cipher,'34'.repeat(32)));
});
test('page boundaries use full result count',()=>{assert.deepEqual(pageSlice(Array.from({length:417},(_,i)=>i),35,12).programs,[408,409,410,411,412,413,414,415,416]);assert.equal(pageSlice([],99).page,1);});
test('D1 publication, archive, search pagination and failed refresh retain last successful generation',async()=>{
  const DB=d1(),env={DB,BIZINFO_API_KEY:'test-key'};const original=globalThis.fetch;
  try{
    globalThis.fetch=async()=>response(Array.from({length:417},(_,i)=>notice(i,417)));
    const r=await runSync(env);assert.equal(r.status,200);assert.equal(r.body.count,417);
    let status=await dataStatus(env);assert.equal(status.mode,'live');assert.equal(status.count,417);const success=status.lastSuccess;
    const q=await handleApi(new Request('https://test.invalid/api/programs',{method:'POST',body:JSON.stringify({filters:{region:'충남',status:'all'},page:35,pageSize:12})}),env);const result=await q.json();assert.equal(result.total,417);assert.equal(result.programs.length,9);assert.equal(result.pages,35);
    globalThis.fetch=async()=>new Response('unavailable',{status:503});const failed=await runSync(env);assert.equal(failed.status,502);
    status=await dataStatus(env);assert.equal(status.count,417);assert.equal(status.lastSuccess,success);assert.equal(status.lastRun.status,'failed');assert.equal(status.running,false);
    const archive=await handleApi(new Request('https://test.invalid/api/notices',{method:'POST',body:JSON.stringify({ids:['PBLN_TEST_400']})}),env);assert.equal((await archive.json()).programs.length,1);
  }finally{globalThis.fetch=original;DB.close();}
});
test('private writer reports missing key and rejects cross-origin mutation',async()=>{
  const DB=d1();try{const r=await runSync({DB});assert.equal(r.status,412);assert.equal(r.body.code,'KEY_REQUIRED');const denied=await handleApi(new Request('https://test.invalid/api/sync',{method:'POST',headers:{Origin:'https://unrelated.invalid'},body:'{}'}),{DB});assert.equal(denied.status,403);}finally{DB.close();}
});
