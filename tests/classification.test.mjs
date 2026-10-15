import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyProgram} from '../public/notice-classification.js';
import {filterPrograms} from '../public/core.js';
const base={id:'NPAY_1',sourceProvider:'npay',title:'지원사업 모집 공고',category:'경영',type:'지원사업',purpose:'기타',tags:[],benefit:'지원 내용 상세 확인',summary:'상세 미확인',subcategory:'',region:'전국',sourceActive:true,imported:true};
const c=fields=>classifyProgram({...base,...fields});
test('Npay grant tags identify support funding without inventing eligibility',()=>{
  const p=c({title:'탄소중립 실천기업 재정지원 사업 모집 공고',category:'경영',tags:['보조금','기술지원','장비설비지원'],supportText:'설치비의 10%(업체당 최대 500만원)'});
  assert.equal(p.type,'지원금'); assert.equal(p.purpose,'시설·장비'); assert.equal(p.subcategory,'보조금'); assert.equal(p.category,'경영'); assert.equal(p.classificationInferred,true);
  assert.equal(p.target,undefined);
});
test('Npay list-only financing tags permit filtering loans and grants',()=>{
  const p=c({title:'중소기업 경영안정자금 융자지원 공고',category:'금융',tags:['대출']});
  assert.equal(p.type,'정책융자');assert.equal(p.purpose,'운영비');
  const g=c({title:'시설개선사업 모집 공고',tags:['보조금','장비설비지원']});
  assert.equal(g.type,'지원금');
  const filtered=filterPrograms([p,g],{type:'지원금',status:'all'},null,[],'2026-10-16');
  assert.deepEqual(filtered.map(x=>x.id),[g.id]);
});
test('multiple funding sources stay visibly multi-method',()=>{
  const m=c({tags:['보조금','대출'],title:'2026년 창업 지원사업'});
  assert.equal(m.type,'복합지원');assert.match(m.classificationBasis,/복수/);
  const i=c({title:'중소기업 육성자금 융자 이차보전 사업 공고',category:'금융'});
  assert.equal(i.type,'금융지원');
});
test('subsidized courses and events are not misrepresented as cash grants',()=>{
  assert.equal(c({title:'2026년 창업기업 교육 설명회',tags:['보조금','행사']}).type,'서비스·현물');
  assert.equal(c({title:'2026년 해외진출 박람회 참가업체 모집',tags:['해외진출','행사']}).type,'서비스·현물');
  assert.equal(c({title:'중소기업 이차보전 지원 사업',tags:['대출','보조금']}).type,'이자지원');
});
test('Bizinfo original subdivisions are never overwritten',()=>{
  const p=c({sourceProvider:'bizinfo',title:'기술사업화 지원 공고',category:'기술',subcategory:'기술사업화/이전/지도',tags:[]});
  assert.equal(p.subcategory,'기술사업화/이전/지도');
  assert.equal(p.type,'지원사업');
});
test('fallback leaves uncertain support method as generic instead of inferring cash',()=>{
  const p=c({title:'2026년 기업 인증기업 모집 공고',tags:[],benefit:'지원 내용 상세 확인'});
  assert.equal(p.type,'지원사업');assert.equal(p.classificationBasis,'방식 확인 필요');
});
test('classifying a published record twice is stable',()=>{
  const first=c({title:'2026년 제조업 설비개선 지원금 공고',tags:['보조금','장비설비지원']});
  const second=classifyProgram(first);
  assert.deepEqual(second,first);
});
test('source category can be small-business without being forced into finance',()=>{
  const p=c({category:'소상공인',tags:['소상공인'],title:'소상공인 상담센터 운영 공고'});
  assert.equal(p.category,'소상공인');assert.equal(p.type,'지원사업');
});
