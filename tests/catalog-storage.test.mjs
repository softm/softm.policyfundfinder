import test from 'node:test';
import assert from 'node:assert/strict';
import {d1} from './helpers/d1.mjs';
import {startCatalog,importCatalogPage,finishCatalog,catalogState,catalogSearch,findCatalogNotice,normalizeNpay} from '../server/catalog.mjs';
import {pdfPreview,storePdf} from '../server/attachments.mjs';
const rows=[
 {subventionId:'R1',subventionTitleName:'[울산] 2026년 장비지원',receptionEndYmd:'26.10.20',isActive:true,subventionCompanyTypeCodeList:[{description:'기술'}]},
 {subventionId:'R2',subventionTitleName:'[울산] 2026년 장비지원',receptionEndYmd:'26.10.20',isActive:true,subventionCompanyTypeCodeList:[{description:'기술'}]},
 {subventionId:'R3',subventionTitleName:'2023년 지난 지원',receptionEndYmd:'23.05.01',isActive:false,subventionCompanyTypeCodeList:[{description:'창업'}]}
];
test('전체 원천 건수를 검증하고 중복 통합·지난 공고·별칭 저장·부분 실패 보존을 처리한다',async()=>{
 const DB=d1(),env={DB};try{
  const run=await startCatalog(env,3,2);await importCatalogPage(env,run.id,rows);
  const original={...normalizeNpay(rows[0]),id:'PBLN_ORIGINAL',sourceProvider:'bizinfo',subcategory:'장비지원',published:'2026-10-08',sourceActive:undefined,attachments:[{name:'공고문.pdf',url:'https://www.bizinfo.go.kr/cmm/fms/getImageFile.do?atchFileId=F',pdf:true}]};
  const finished=await finishCatalog(env,run.id,[original]);assert.equal(finished.count,2);assert.equal(finished.npaySourceCount,3);
  const state=await catalogState(env);const all=await catalogSearch(env,{filters:{status:'all'},page:999,pageSize:1},state);assert.equal(all.total,2);assert.equal(all.pages,2);assert.equal(all.programs.length,1);
  assert.equal((await catalogSearch(env,{filters:{status:'closed'}},state)).total,1);
  assert.equal((await catalogSearch(env,{filters:{category:'기술',subcategory:'장비지원',region:'울산'}},state)).total,1);
  const alias=await findCatalogNotice(env,'NPAY_R2');assert.equal(alias.id,'PBLN_ORIGINAL');assert.equal(alias.attachments.length,1);
  const incomplete=await startCatalog(env,10,3);await importCatalogPage(env,incomplete.id,[rows[0]]);await assert.rejects(finishCatalog(env,incomplete.id,[]),/건수/);assert.equal((await catalogState(env)).generation,run.id);
  assert.equal((await catalogSearch(env,{filters:{query:"' OR 1=1 --",status:'all'}},state)).total,0);
 }finally{DB.close();}
});
test('검증한 PDF 캐시는 제공처 연결 없이 실제 PDF로 표시된다',async()=>{
 const files=new Map(),bucket={async put(key,data){files.set(key,data)},async get(key){return files.has(key)?{body:files.get(key)}:null}};
 const file={name:'공고문.pdf',url:'https://www.bizinfo.go.kr/cmm/fms/getImageFile.do?atchFileId=F',pdf:true};
 const data=new TextEncoder().encode('%PDF-1.4\nvalid');assert.equal((await storePdf(file,data,bucket)).ok,true);
 let called=false;const result=await pdfPreview(file,async()=>{called=true;throw Error('offline')},bucket);assert.equal(called,false);assert.equal(result.headers.get('content-type'),'application/pdf');assert.match(await result.text(),/^%PDF/);
 assert.equal((await storePdf(file,new TextEncoder().encode('not a PDF'),bucket)).status,422);
});
