import {filterPrograms,categoryFacets,deadline,koreanDate} from './core.js';
export function searchCatalog(programs,input={},today=koreanDate()){
  const filters=input.filters||input,profile=input.profile||null;
  const list=filterPrograms(programs,{...filters,view:'browse'},profile,[],today);
  const pageSize=Math.min(200,Math.max(1,Math.trunc(Number(input.pageSize)||12)));
  const pages=Math.max(1,Math.ceil(list.length/pageSize)),page=Math.min(pages,Math.max(1,Math.trunc(Number(input.page)||1)));
  let withinPeriod=0,unknownPeriod=0,financial=0,urgent=0;
  for(const p of programs){const d=deadline(p,today);if(['open','urgent'].includes(d.state))withinPeriod++;if(d.state==='unknown')unknownPeriod++;if(d.state==='urgent')urgent++;if(p.category==='금융'&&d.state!=='closed')financial++;}
  return {programs:list.slice((page-1)*pageSize,page*pageSize),total:list.length,page,pages,pageSize,sourceCount:programs.length,withinPeriod,unknownPeriod,financial,urgent,...categoryFacets(programs,filters,profile,[],today)};
}
export function completeIndex(p){return {...p,industries:p.industries||[],businessKinds:p.businessKinds||[],documents:[],requirements:p.requirements||['공식 원문에서 신청 자격과 제외 조건을 확인하세요.'],attachments:[],target:p.target||'신청 자격 원문 확인',periodText:p.periodText||'접수 기간 원문 확인',benefit:p.benefit||'지원 내용 상세 확인',summary:p.summary||'사업개요·신청방법은 상세 안내와 공식 원문을 확인하세요.',checkedAt:p.checkedAt||'',published:p.published||'',tags:p.tags||[],staticCatalog:true,detailPending:true};}
export function shardFor(id){let hash=2166136261;for(const c of id){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619);}return (hash>>>0)%32;}
