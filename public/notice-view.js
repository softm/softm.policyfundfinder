import {safeText as e,categoryLabel} from './core.js';
import {normalizeAttachments,officialViewer} from './attachment-links.js';
import {renderNoticeText} from './notice-text.js';

export function publicUrl(value){
  try{const u=new URL(String(value));return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}
}
export function renderNoticeLinks(p){
  const application=publicUrl(p.application),source=publicUrl(p.sourceUrl);
  return `<div class="notice-links">${application?`<a class="btn primary" href="${e(application)}" target="_blank" rel="noopener noreferrer">신청기관 바로가기 ↗</a>`:''}${source?`<a class="btn secondary" href="${e(source)}" target="_blank" rel="noopener noreferrer">${p.sourceProvider==='npay'?'공고 원문 보기':'기업마당 공고 보기'} ↗</a>`:''}<button class="btn soft" data-action="save" data-id="${e(p.id)}">관심 저장 / 해제</button></div>${!application?'<p class="muted tiny">별도 신청 URL이 제공되지 않았습니다. 공고 원문의 접수 방법을 확인하세요.</p>':''}`;
}
export function renderAttachments(p){
  const files=normalizeAttachments(p.attachments).map((f,index)=>({...f,index,url:publicUrl(f.url),viewerUrl:officialViewer(f.viewerUrl)})).filter(f=>f.url);
  return `<section class="notice-attachments"><h3>첨부파일 · 공고문</h3>${files.length?`<div class="attachment-list">${files.map(f=>`<div class="attachment-item"><div><small>${e(f.kind||'첨부파일')}</small><strong>${e(f.name||'첨부파일')}</strong></div><div class="attachment-actions">${f.pdf&&(!p.staticCatalog||f.cachedUrl)?`<button class="btn soft small" data-action="attachment" data-id="${e(p.id)}" data-index="${f.index}">PDF 보기</button>`:f.viewerUrl?`<button class="btn soft small" data-action="document-view" data-id="${e(p.id)}" data-index="${f.index}">바로보기</button>`:''}<a class="btn secondary small" href="${e(f.downloadUrl||f.url)}" target="_blank" rel="noopener noreferrer" download="${e(f.name)}">다운로드 ${e(f.name.split('.').pop()?.toUpperCase()||'')} ↗</a></div></div>`).join('')}</div><p class="muted tiny spaced">바로보기는 공식 문서 뷰어를 사용합니다. ZIP은 다운로드 후 압축을 해제하세요. 뷰어가 없는 파일은 공고 원문에서 확인할 수 있습니다.</p>`:'<p>첨부파일 링크가 제공되지 않았습니다. 공고 원문에서 파일 목록을 확인하세요.</p>'}</section>`;
}
export function renderOverview(p){
  if(p.sourceProvider==='npay'&&!p.detailAvailable)return `<section class="notice-overview"><h3>사업개요 · 지원 내용</h3><div class="info-notice" role="status"><strong>상세 내용 미수집</strong><span>현재 제공처의 공고 목록 정보만 확보했습니다. 지원대상·지원금액·신청방법 등은 위의 공고 원문에서 확인해 주세요. 목록에 표시된 분류와 마감일만으로 신청 자격을 판단하지 마세요.</span></div></section>`;
  const overview=renderNoticeText(p.overview||p.summary||'사업개요 원문 확인');
  const support=p.sourceProvider==='npay'&&p.supportText
    ?`<h3>지원 내용 및 금액</h3>${renderNoticeText(p.supportText)}`:'';
  return `<section class="notice-overview"><h3>사업개요</h3>${overview}${support}</section>`;
}
export function renderClassification(p){
  return `<div class="notice-classification"><span class="badge category">${e(categoryLabel(p))}</span><span class="classification-sub">${e(p.subcategory||'중분류 미제공')}</span><span class="badge">${e(p.type)}</span></div>${p.classificationInferred?`<p class="muted tiny" style="margin:5px 0 12px">지원 유형·목적·세부 분야: 자동 분류(${e(p.classificationBasis||'정보 확인 필요')}) · 실제 신청조건과 지원방식은 공고 원문을 확인하세요.</p>`:''}`;
}
