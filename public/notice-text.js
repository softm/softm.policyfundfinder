/**
 * Normalize public notice text. The Npay partner detail feed often has neither
 * <br> nor newline characters: only NBSP-separated ㅇ headings and dash, asterisk, greater-than items.
 * Interpret those *structural* markers for display; never infer a different
 * eligibility rule or funding amount.
 */
import {safeText} from './core.js';

const headingNames = '지원대상|지원자격|지원내용|지원금액|지원규모|지원한도|지원비율|지원조건|신청방법|신청기간|신청대상|신청서류|제출서류|접수(?:\\s*및\\s*문의처)?|문의처|유의사항|사업개요|선정기준';
const headingPattern = new RegExp('^(?:ㅇ|○|◦)\\s*('+headingNames+')\\s*[:：]?\\s*(.*)$');

function stripTagsAndDecode(value) {
  return String(value ?? '')
    .replace(/<(?:script|style|iframe|object)\b[^>]*>[\s\S]*?<\/\s*(?:script|style|iframe|object)\s*>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(?:p|div|li|h[1-6]|section|ul|ol)\s*>/gi, '\n')
    .replace(/<\s*(?:p|div|h[1-6]|section)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|#160|#xA0);/gi, ' ')
    .replace(/&(?:lt|gt|amp|quot|apos|#39);/gi, key => ({'&lt;':'<','&gt;':'>','&amp;':'&','&quot;':'"','&apos;':"'",'&#39;':"'" }[key.toLowerCase()] ?? key))
    .replace(/&#(\d+);|&#x([\da-f]+);/gi, (_, decimal, hex) => {
      const n = Number.parseInt(decimal || hex, decimal ? 10 : 16);
      return n > 0 && n <= 0x10FFFF ? String.fromCodePoint(n) : '';
    })
    .replace(/\u00a0/g, ' ');
}

export function normalizeNoticeText(value) {
  let text = stripTagsAndDecode(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\v\f ]+/g, ' ')
    .replace(/ *\n */g, '\n');
  // Split major section headings even in already flattened, cached JSON fields.
  text = text.replace(/ +(?=[ㅇ○◦]\s*(?:지원대상|지원자격|지원내용|지원금액|지원규모|지원한도|지원비율|지원조건|신청방법|신청기간|신청대상|신청서류|제출서류|접수|문의처|유의사항|사업개요|선정기준)(?:\s|[:：]|$))/g, '\n');
  // A hyphen between dates (2026 - 2027) is not a bullet. Only a following
  // word or '(' counts; do not split hyphenated words or numeric ranges.
  text = text.replace(/ +(?=-\s+(?=[가-힣A-Za-z(]))/g, '\n');
  text = text.replace(/ +(?=[•●▪▸*＞>]\s+(?=[가-힣A-Za-z(]))/g, '\n');
  text = text.replace(/ +(?=※\s*)/g, '\n');
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

/** Render escaped, semantic paragraphs and bullet lists from stored public text. */
export function renderNoticeText(value, {compact = false} = {}) {
  const lines = normalizeNoticeText(value).split('\n');
  let html = '', items = [];
  const flush = () => { if (items.length) { html += '<ul class="notice-text-list">' + items.join('') + '</ul>'; items=[]; }};
  const paragraph = (value, cls = 'notice-text-paragraph') => { if (value) html += `<p class="${cls}">${safeText(value)}</p>`; };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const heading = line.match(headingPattern);
    if (heading) {
      flush();
      if (!compact) html += `<h4 class="notice-text-heading">${safeText(heading[1].replace(/\s+/g, ' ').trim())}</h4>`;
      const rest = heading[2]?.trim();
      if (!rest) continue;
      if (/^[-•●▪▸]\s*/.test(rest)) { items.push(`<li>${safeText(rest.replace(/^[-•●▪▸]\s*/,''))}</li>`); }
      else paragraph(rest);
      continue;
    }
    const bullet = line.match(/^[-•●▪▸]\s+(.+)$/);
    if (bullet) {items.push(`<li>${safeText(bullet[1])}</li>`);continue;}
    flush();
    if (/^(?:[*>＞]|※)\s*/.test(line)) paragraph(line, 'notice-text-note');
    else if (/^[ㅇ○◦]\s+/.test(line)) items.push(`<li>${safeText(line.replace(/^[ㅇ○◦]\s+/,''))}</li>`);
    else paragraph(line);
  }
  flush();
  return `<div class="notice-text${compact?' notice-text-compact':''}">${html}</div>`;
}

/** Short header text only. Never print a full support list as a 25px banner. */
export function noticeBenefitTeaser(p) {
  if(p?.sourceProvider !== 'npay') return String(p?.benefit ?? '').replace(/\s+/g,' ').trim();
  const fallback = String(p?.benefit ?? '지원 내용 원문 확인');
  const normalized = normalizeNoticeText(p.supportText || fallback);
  const lines = normalized.split('\n').map(s=>s.trim()).filter(Boolean);
  const amountLine = lines.find(s => /^(?:ㅇ\s*)?(?:지원금액|지원규모|지원한도|지원비율)\s*[:：]/.test(s));
  const first = amountLine || lines.find(s => /^(?:ㅇ\s*)?지원내용\s*[:：]/.test(s)) || lines[0] || fallback;
  const result = first
    .replace(/^(?:ㅇ\s*)?(?:지원금액|지원규모|지원한도|지원비율|지원내용)\s*[:：]\s*/, '')
    .replace(/\s+/g,' ').trim();
  if (!result) return fallback;
  const chars = Array.from(result);
  return chars.length>92?chars.slice(0,91).join('').trimEnd()+'…':result;
}
