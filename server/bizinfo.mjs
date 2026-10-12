import {regions} from '../public/data.js';
import {normalizeAttachments} from '../public/attachment-links.js';
export const API_URL='https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do';
export function plain(value){
  return String(value??'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
}
function date(value){
  const m=String(value??'').match(/(20\d{2})[.\-/년\s]?(\d{2})[.\-/월\s]?(\d{2})/);
  if(!m)return null;const s=`${m[1]}-${m[2]}-${m[3]}`;const d=new Date(s+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().startsWith(s)?s:null;
}
function safeUrl(value){try{const u=new URL(String(value));return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:undefined;}catch{return undefined;}}
export function noticeAttachments(row){
  const files=[];
  for(const [path,name,kind] of [['printFlpthNm','printFileNm','공고문'],['flpthNm','fileNm','첨부서류']]){
    const url=safeUrl(row[path]);
    if(!url||files.some(f=>f.url===url))continue;
    const filename=plain(row[name])||kind;
    files.push({name:filename,url,kind,pdf:/\.pdf$/i.test(filename)});
  }
  return normalizeAttachments(files);
}
function paragraphs(value){return String(value??'').replace(/<\/(?:p|div|li)>|<br\s*\/?\s*>/gi,'\n').split(/\r?\n/).map(plain).filter(Boolean).join('\n\n');}
export function normalizeNotice(row,checkedAt){
  const id=plain(row.pblancId||row.seq);
  const title=plain(row.pblancNm||row.title);
  if(!/^[\w-]{1,100}$/.test(id)||!title)throw Error('공고 식별자 또는 제목이 없는 자료를 받았습니다. 기존 자료를 유지합니다.');
  const tags=plain(row.hashTags||row.hashtags).split(/[,#|]/).map(s=>s.trim()).filter(Boolean);
  const category=plain(row.pldirSportRealmLclasCodeNm||row.lcategory);
  const regionTags=regions.filter(r=>tags.some(t=>t===r||t.startsWith(r+'특별')||t.startsWith(r+'광역'))||title.startsWith('['+r));
  const period=plain(row.reqstBeginEndDe||row.reqstDt);
  const dates=period.match(/20\d{2}[.\-/년\s]?\d{2}[.\-/월\s]?\d{2}/g)||[];
  const start=date(dates[0]);const end=dates.length>1?date(dates[1]):null;
  const purpose={금융:'사업자금',기술:'ESG·기술',수출:'판로·홍보',내수:'판로·홍보',창업:'창업'}[category]||'기타';
  const summary=plain(row.bsnsSumryCn||row.description)||'지원 내용은 공식 공고와 첨부파일에서 확인하세요.';
  const overview=paragraphs(row.bsnsSumryCn||row.description)||summary;
  const bullets=summary.split('☞').map(s=>s.trim());
  const supportText=bullets.length>=3?bullets.slice(2).join(' / '):'';
  const attachments=noticeAttachments(row);
  const subcategory=plain(row.pldirSportRealmMlsfcCodeNm);
  return {id,title,fullTitle:title,region:regionTags.length===1?regionTags[0]:regionTags.length?'복수지역':tags.includes('전국')?'전국':'지역 확인',regions:regionTags,regionSoft:true,
    type:category==='금융'?'금융지원':/바우처/.test(supportText)?'바우처':'지원사업',purpose,agency:[plain(row.jrsdInsttNm||row.author),plain(row.excInsttNm)].filter(Boolean).join(' · ')||'원문 확인',
    supervisingAgency:plain(row.jrsdInsttNm||row.author),executingAgency:plain(row.excInsttNm),
    published:date(row.creatPnttm||row.pubDate)||'',start,end,periodText:period||'접수 기간 원문 확인',budgetLimited:/예산.*소진/.test(period),
    benefit:supportText.slice(0,160)||(category?category+' 분야 지원':'지원 내용 원문 확인'),summary:summary.slice(0,24000),overview:overview.slice(0,24000),supportText,target:plain(row.trgetNm)||'지원 대상 원문 확인',
    industries:[],businessKinds:[],requirements:['API의 지역·분야는 검색 분류입니다. 실제 소재지·업종·기업 규모·지원 한도·제외 조건은 원문에서 확인하세요.'],
    method:plain(row.reqstMthPapersCn)||'공식 원문의 신청 방법 및 첨부 서류 확인',contact:plain(row.refrncNm)||'공식 원문의 문의처 확인',
    application:safeUrl(row.rceptEngnHmpgUrl),documents:[],attachments,cost:'자부담·지원 한도는 원문 확인',repayment:/바우처/.test(supportText)?'바우처 지원 · 사용 범위와 정산 조건은 공고문 확인':'융자·보조금·현물 여부와 상환 조건은 원문 확인',
    tags:tags.slice(0,12),sourceUrl:'https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?pblancId='+encodeURIComponent(id),checkedAt,imported:true,category,subcategory};
}
export function parseFeed(payload){
  if(!payload||typeof payload!=='object')throw Error('기업마당 응답 형식을 확인할 수 없습니다.');
  let root=payload.jsonArray??payload;
  if(root.item!==undefined)root=root.item;
  else if(root.items!==undefined)root=root.items.item??root.items;
  if(!Array.isArray(root)){
    if(root?.pblancId||root?.seq)root=[root];
    else throw Error('기업마당이 공고 목록을 반환하지 않았습니다. 인증키·사용승인·기관 장애 여부를 확인하세요.');
  }
  const candidates=[payload.totCnt,payload.totalCount,payload.jsonArray?.totCnt,payload.jsonArray?.totalCount,root[0]?.totCnt];
  const count=candidates.find(v=>v!==undefined&&v!==null&&v!==''&&Number.isInteger(Number(v))&&Number(v)>=0);
  return {rows:root,total:count===undefined?null:Number(count)};
}
export async function fetchFeed(key,params={},fetcher=fetch){
  const u=new URL(API_URL);u.searchParams.set('crtfcKey',key);u.searchParams.set('dataType','json');
  for(const [k,v]of Object.entries(params))u.searchParams.set(k,String(v));
  let res;
  try{res=await fetcher(u,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(45000)});}catch{throw Error('기업마당 연결이 지연되거나 실패했습니다. 잠시 후 다시 수집하세요.');}
  if(!res.ok)throw Error(`기업마당 연결 실패 (HTTP ${res.status}). 인증키·사용승인·기관 장애 여부를 확인하세요.`);
  let body;try{body=await res.text();if(body.length>30000000)throw Error();return parseFeed(JSON.parse(body));}catch(err){if(err.message.startsWith('기업마당'))throw err;throw Error('기업마당 응답을 읽지 못했습니다. 인증키 또는 기관 응답 상태를 확인하세요.');}
}
export async function collectAll(key,checkedAt,fetcher=fetch,progress=async()=>{}){
  // Official API: searchCnt=0 requests the entire provided feed; no category or region restriction.
  const all=await fetchFeed(key,{searchCnt:0},fetcher);const byId=new Map();let expected=all.total;
  const add=rows=>{let added=0;for(const row of rows){const p=normalizeNotice(row,checkedAt);if(!byId.has(p.id))added++;byId.set(p.id,p);}return added;};
  add(all.rows);await progress(byId.size,expected);
  if(expected!==null&&byId.size<expected){
    // Some upstream deployments cap the all-data response. Exhaust documented pagination.
    byId.clear();
    for(let page=1;page<=500;page++){
      const feed=await fetchFeed(key,{pageIndex:page,pageUnit:200},fetcher);
      if(feed.total!==null&&feed.total!==expected)throw Error('수집 도중 전체 공고 수가 변경되었습니다. 기존 자료를 유지하고 재수집하세요.');
      const added=add(feed.rows);await progress(byId.size,expected);
      if(byId.size===expected)break;
      if(!added||!feed.rows.length||byId.size>expected)throw Error('공고 페이지가 반복되거나 누락되었습니다. 기존 자료를 유지합니다.');
    }
  }
  if(expected!==null&&byId.size!==expected)throw Error('수집 건수와 기업마당 전체 건수가 다릅니다. 기존 자료를 유지합니다.');
  if(!byId.size)throw Error('공고가 0건으로 반환되어 기존 자료를 유지합니다.');
  return {programs:[...byId.values()],expected};
}
