import {safeText as e,categoryLabel} from './core.js';

export function publicUrl(value){
  try{const u=new URL(String(value));return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}
}
export function renderNoticeLinks(p){
  const application=publicUrl(p.application),source=publicUrl(p.sourceUrl);
  return `<div class="notice-links">${application?`<a class="btn primary" href="${e(application)}" target="_blank" rel="noopener noreferrer">신청기관 바로가기 ↗</a>`:''}${source?`<a class="btn secondary" href="${e(source)}" target="_blank" rel="noopener noreferrer">${p.sourceProvider==='npay'?'공고 원문 보기':'기업마당 공고 보기'} ↗</a>`:''}<button class="btn soft" data-action="save" data-id="${e(p.id)}">관심 저장 / 해제</button></div>${!application?'<p class="muted tiny">별도 신청 URL이 제공되지 않았습니다. 기업마당 공고의 접수 방법을 확인하세요.</p>':''}`;
}
export function renderAttachments(p){
  const files=(p.attachments||[]).map((f,index)=>({...f,index,url:publicUrl(f.url)})).filter(f=>f.url);
  return `<section class="notice-attachments"><h3>첨부파일 · 공고문</h3>${files.length?`<div class="attachment-list">${files.map(f=>`<div class="attachment-item"><div><small>${e(f.kind||'첨부파일')}</small><strong>${e(f.name||'첨부파일')}</strong></div><div class="attachment-actions">${f.pdf?`<button class="btn soft small" data-action="attachment" data-id="${e(p.id)}" data-index="${f.index}">PDF 보기</button>`:''}<a class="btn secondary small" href="${e(f.url)}" target="_blank" rel="noopener noreferrer">원본 열기 ↗</a></div></div>`).join('')}</div><p class="muted tiny spaced">파일은 공식 제공처에서 열립니다. HWP·HWPX는 다운로드 후 한컴오피스 등 지원 앱에서 확인하세요. 추가 파일은 기업마당 원문에 있을 수 있습니다.</p>`:'<p>API에 첨부파일 링크가 제공되지 않았습니다. 기업마당 공고에서 파일 목록을 확인하세요.</p>'}</section>`;
}
export function renderOverview(p){
  return `<section class="notice-overview"><h3>사업개요 · 지원 내용</h3>${String(p.overview||p.summary||'사업개요 원문 확인').split(/\n\s*\n/).map(t=>`<p>${e(t)}</p>`).join('')}</section>`;
}
export function renderClassification(p){
  return `<div class="notice-classification"><span class="badge category">${e(categoryLabel(p))}</span><span class="classification-sub">${e(p.subcategory||'중분류 미제공')}</span><span class="badge">${e(p.type)}</span></div>`;
}
