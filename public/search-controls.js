export const statusLabels={current:'마감 제외',open:'진행중·접수 기간 내',urgent:'7일 내 마감',upcoming:'접수 예정',unknown:'접수 기간 미확인',all:'전체·지난 공고',closed:'마감된 공고'};
export const metricLabels={all:'통합 공고 전체',urgent:'7일 내 마감 예정',financial:'금융 분야 지원'};
export function metricFilters(metric){
  if(!Object.hasOwn(metricLabels,metric))throw Error('알 수 없는 공고 바로가기입니다.');
  const filters={region:'전체',type:'전체',purpose:'전체',category:'전체',subcategory:'전체',query:'',tag:'',status:'current',sort:'latest',matched:false};
  if(metric==='all')filters.status='all';
  if(metric==='urgent'){filters.status='urgent';filters.sort='deadline';}
  if(metric==='financial')filters.category='금융';
  return filters;
}
export function filterChips(filters){
  const chips=[];
  for(const [key,label] of [['region','지역'],['type','지원 유형'],['category','지원분야'],['subcategory','세부 분야'],['purpose','지원 목적']]){
    if(filters[key]&&filters[key]!=='전체')chips.push({key,label,value:filters[key]});
  }
  chips.push({key:'status',label:'접수',value:statusLabels[filters.status]||statusLabels.current});
  if(filters.query?.trim())chips.push({key:'query',label:'검색어',value:filters.query.trim()});
  if(filters.tag)chips.push({key:'tag',label:'태그',value:'#'+String(filters.tag).replace(/^#+/,'')});
  if(filters.matched)chips.push({key:'matched',label:'맞춤 조건',value:'조건 불일치 제외'});
  return chips;
}
