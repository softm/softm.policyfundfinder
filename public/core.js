export function koreanDate(date = new Date()) { return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(date); }
const dayNumber = value => Date.parse(value+'T00:00:00Z')/86400000;
export function deadline(p, today = koreanDate()) {
  if(p.sourceActive===false)return {label:'마감 · 제공처 기준',state:'closed',days:-1};
  if (p.end && dayNumber(p.end) < dayNumber(today)) return {label:'마감',state:'closed',days:-1};
  if (p.start && dayNumber(p.start) > dayNumber(today)) return {label:'접수 예정',state:'upcoming',days:dayNumber(p.start)-dayNumber(today)};
  if (!p.end) return p.sourceActive===true?{label:'진행중 · 제공처 기준',state:'open',days:null}:{label:p.budgetLimited?'예산 잔여 확인':'접수 기간 확인',state:'unknown',days:null};
  const days = dayNumber(p.end)-dayNumber(today);
  return {label:days===0?'오늘 마감':`D-${days}`,state:days<=7?'urgent':'open',days};
}
export function match(p, profile, today = koreanDate()) {
  if (!profile) return {state:'none',label:'내 조건 확인하기',pass:[],fail:[],unknown:['사업 정보를 입력해 주세요'],score:0};
  const pass=[], fail=[], unknown=[];
  const check=(value,yes,good,bad,missing)=> {if (value===undefined || value===null || value==='') unknown.push(missing); else (yes?pass:fail).push(yes?good:bad);};
  if (p.regionSoft) unknown.push('소재지 제한은 원문 확인');
  else if (p.region==='전국') pass.push('전국 대상 사업');
  else check(profile.region,(p.regions||[p.region]).includes(profile.region),'사업장 지역 일치','사업장 지역 불일치','사업장 지역 입력 필요');
  if (p.city || p.cities) check(profile.city,(p.cities||[p.city]).some(c=>profile.city?.replace(/\s/g,'')===c),'시·군·구 조건 일치','시·군·구 조건 불일치','시·군·구 소재지 확인 필요');
  if (p.industries.length) check(profile.industry,p.industries.includes(profile.industry),'입력 업종과 관련된 사업','입력 업종과 대상 업종 불일치','업종 확인 필요');
  if (p.businessKinds.length) check(profile.kind,p.businessKinds.includes(profile.kind),'사업자 유형 일치','사업자 유형 불일치','사업자 유형 확인 필요');
  if (p.employeeMax!==undefined || p.employeeMin!==undefined) check(profile.employees,Number(profile.employees)>=(p.employeeMin??0)&&Number(profile.employees)<=(p.employeeMax??Infinity),'고용 인원 조건 일치','고용 인원 조건 불일치','고용 인원 확인 필요');
  if (p.ageMin!==undefined) check(profile.age,Number(profile.age)>=p.ageMin&&Number(profile.age)<=p.ageMax,'대표자 연령 조건 일치','대표자 연령 조건 불일치','대표자 연령 확인 필요');
  if (p.yearsMax!==undefined) {
    if (!profile.opened) unknown.push('개업일 확인 필요');
    else {const years=(dayNumber(today)-dayNumber(profile.opened))/365.2425;(years>=0&&years<=p.yearsMax?pass:fail).push(years>=0&&years<=p.yearsMax?'업력 조건 일치':'업력 조건 불일치');}
  }
  if (p.residence) check(profile.residence,profile.residence===p.residence,'거주 지역 일치','거주 지역 불일치','주민등록상 거주 지역 확인 필요');
  if (!p.imported && profile.kind==='예비창업자') fail.push('사업장 운영 중인 사업자 대상');
  unknown.push(...p.requirements);
  return {state:fail.length?'mismatch':'check',label:fail.length?'입력 조건 불일치':pass.length?'관련 조건 일치 · 추가 확인':'신청 자격 원문 확인',pass,fail,unknown,score:fail.length?-fail.length:pass.length};
}
export function filterPrograms(programs, filters, profile, saved=[], today=koreanDate()) {
  let list=programs.filter(p=> {
    const d=deadline(p,today);
    if(filters.tag&&!(p.tags||[]).some(tag=>normalizeTag(tag)===normalizeTag(filters.tag)))return false;
    if (filters.region && filters.region!=='전체' && p.region!=='전국' && !(p.regions||[p.region]).includes(filters.region) && (p.imported?p.region!=='지역 확인':!p.regionSoft)) return false;
    if (filters.type && filters.type!=='전체' && p.type!==filters.type) return false;
    if (filters.category && filters.category!=='전체' && categoryLabel(p)!==filters.category) return false;
    if (filters.subcategory && filters.subcategory!=='전체' && (p.subcategory||'중분류 미제공')!==filters.subcategory) return false;
    if (filters.purpose && filters.purpose!=='전체' && p.purpose!==filters.purpose) return false;
    if (filters.status==='urgent' && d.state!=='urgent') return false;
    if (filters.status==='closed' && d.state!=='closed') return false;
    if (filters.status==='open' && !['open','urgent'].includes(d.state)) return false;
    if (filters.status==='upcoming' && d.state!=='upcoming') return false;
    if (filters.status==='unknown' && d.state!=='unknown') return false;
    if (filters.status!=='closed' && filters.status!=='all' && d.state==='closed') return false;
    if (filters.view==='saved' && !saved.includes(p.id)) return false;
    if (filters.matched && profile && match(p,profile,today).fail.length) return false;
    const tokens=(filters.query||'').trim().toLocaleLowerCase('ko').split(/\s+/).filter(Boolean);
    const hay=[p.title,p.fullTitle,p.summary,p.search,p.agency,p.region,p.city,p.category,p.subcategory,...p.tags,p.target].join(' ').toLocaleLowerCase('ko');
    return tokens.every(t=>hay.includes(t));
  });
  return list.sort((a,b)=> {
    if (filters.sort==='deadline') return (deadline(a,today).days??1e6)-(deadline(b,today).days??1e6);
    if (filters.sort==='amount') return (b.amountMax??-1)-(a.amountMax??-1);
    if (filters.sort==='match' && profile) return match(b,profile,today).score-match(a,profile,today).score || (b.published.localeCompare(a.published));
    return b.published.localeCompare(a.published);
  });
}
export function categoryLabel(p){return p.category?.trim()||'분류 미제공';}
export function normalizeTag(value){return String(value||'').normalize('NFKC').replace(/^#+/,'').trim().toLocaleLowerCase('ko').slice(0,100);}
export function categoryFacets(programs,filters,profile,saved=[],today=koreanDate()){
  const candidates=filterPrograms(programs,{...filters,category:'전체',subcategory:'전체'},profile,saved,today);
  const counts={전체:candidates.length},subcounts={};
  for(const p of candidates){const category=categoryLabel(p);counts[category]=(counts[category]||0)+1;
    if(!filters.category||filters.category==='전체'||category===filters.category){const sub=p.subcategory||'중분류 미제공';subcounts[sub]=(subcounts[sub]||0)+1;}}
  return {categoryCounts:counts,subcategories:Object.entries(subcounts).map(([name,count])=>({name,count})).sort((a,b)=>a.name.localeCompare(b.name,'ko'))};
}
export function loanEstimate(amount,rate,months,method='equalPayment') {
  amount=Number(amount);rate=Number(rate);months=Number(months);
  if (!Number.isFinite(amount)||!Number.isFinite(rate)||!Number.isInteger(months)||amount<=0||rate<0||months<1||months>600) throw new Error('금액, 금리, 기간을 확인해 주세요');
  const r=rate/1200;
  if (method==='equalPrincipal') {
    const principal=amount/months,interest=amount*r*(months+1)/2;
    return {first:principal+amount*r,last:principal+principal*r,total:amount+interest,interest};
  }
  const payment=r===0?amount/months:amount*r/(1-Math.pow(1+r,-months));
  return {first:payment,last:payment,total:payment*months,interest:payment*months-amount};
}
export function subsidyEstimate(cost,ratio,cap) { const support=Math.min(Number(cost)*ratio,cap);return {support,own:Number(cost)-support}; }
export function buildCalendar(p) {
  if (!p.end) throw new Error('확정 마감일이 없는 사업입니다');
  const next = new Date(p.end+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);
  const esc = s=>s.replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Jiwonhannun//KO','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:${p.id}@jiwonhannun`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}`,`DTSTART;VALUE=DATE:${p.end.replace(/-/g,'')}`,`DTEND;VALUE=DATE:${next.toISOString().slice(0,10).replace(/-/g,'')}`,`SUMMARY:${esc(p.title+' 신청 마감')}`,`DESCRIPTION:${esc('공고상 마감일입니다. 조기 마감과 접수 마감 시각을 공식 공고에서 확인하세요. '+p.sourceUrl)}`,`URL:${p.sourceUrl}`,'BEGIN:VALARM','TRIGGER:-P3D','ACTION:DISPLAY','DESCRIPTION:지원사업 마감 3일 전','END:VALARM','END:VEVENT','END:VCALENDAR',''].join('\r\n');
}
export function safeText(value) {return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
