/** Public sharing only: never serialize profiles, saved items, notes or the full current URL. */
export const SHARE_BASE = 'https://policyfundfinder.designboard.net/';
const SEARCH_FIELDS = ['region', 'type', 'purpose', 'category', 'subcategory', 'q', 'tag', 'status'];
const STATUSES = new Set(['current', 'open', 'urgent', 'upcoming', 'unknown', 'all', 'closed']);
const LABELS = {region:'지역', type:'지원 유형', purpose:'목적', category:'분야', subcategory:'세부 분야', q:'검색어', tag:'태그', status:'접수 상태'};
const STATUS_LABELS = {current:'마감 제외', open:'접수중', urgent:'7일 내 마감', upcoming:'접수 예정', unknown:'기간 미확인', all:'전체', closed:'마감'};
export function noticeShareUrl(id, base = SHARE_BASE) {
  if (typeof id !== 'string' || !/^[\w-]{1,100}$/.test(id)) throw new TypeError('올바른 공고 번호가 아닙니다.');
  const url = cleanBase(base);
  url.searchParams.set('notice', id);
  return url.href;
}
function cleanBase(base) {
  const url = new URL(base);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new TypeError('올바른 공유 주소가 아닙니다.');
  url.search = ''; url.hash = '';
  return url;
}
export function publicSearchParams(source) {
  const input = source instanceof URLSearchParams ? source : new URLSearchParams(source);
  const result = new URLSearchParams();
  for (const key of SEARCH_FIELDS) {
    const value = input.get(key);
    if (!value || (key !== 'q' && key !== 'tag' && value === '전체')) continue;
    if (key === 'status' && (!STATUSES.has(value) || value === 'current')) continue;
    result.set(key, value);
  }
  return result;
}
export function searchShareData(source, base = SHARE_BASE) {
  const params = publicSearchParams(source), url = cleanBase(base);
  url.search = params.toString();
  const labels = [...params].map(([key, value]) => `${LABELS[key]}: ${key === 'status' ? STATUS_LABELS[value] : value}`);
  if (!params.has('status')) labels.push('접수 상태: 마감 제외');
  return {title:'지원한눈 · 지원사업 검색', text:labels.join('\n'), url:url.href, kind:'search'};
}
export function noticeShareData(program, base = SHARE_BASE) {
  return {
    title:String(program.title || '지원사업 공고'),
    text:['지원한눈 · 정책자금 찾기', program.agency && `기관: ${program.agency}`, program.benefit && `지원 내용: ${program.benefit}`, (program.periodText || program.end) && `접수 기간: ${program.periodText || program.end}`].filter(Boolean).join('\n'),
    url:noticeShareUrl(program.id, base), kind:'notice'
  };
}
export function appShareData(base = SHARE_BASE) {
  return {title:'지원한눈 — 정책자금 찾기', text:'정책자금·지원금을 검색하고 공고 비교부터 신청 준비까지 한눈에 확인하세요.', url:cleanBase(base).href, kind:'app'};
}
export function shareText(data) { return [data.title, data.text, data.url].filter(Boolean).join('\n\n'); }
export async function nativeShare(data, nav = globalThis.navigator) {
  if (typeof nav?.share !== 'function') return 'unsupported';
  // Invoke share synchronously in the user's click handler; do not fetch data first.
  try {
    const payload = {title:data.title, text:data.text, url:data.url};
    if (typeof nav.canShare === 'function' && !nav.canShare(payload)) return 'unsupported';
    await nav.share(payload);
    return 'shared';
  } catch (error) { return error?.name === 'AbortError' ? 'cancelled' : 'failed'; }
}
export async function copyShareText(text, {nav = globalThis.navigator, doc = globalThis.document, container} = {}) {
  try {
    if (typeof nav?.clipboard?.writeText === 'function') {
      await nav.clipboard.writeText(text);
      return true;
    }
  } catch { /* Clipboard permissions vary. Offer a local, user-triggered fallback. */ }
  if (!doc?.createElement || typeof doc.execCommand !== 'function') return false;
  const active = doc.activeElement, field = doc.createElement('textarea');
  const selection = doc.getSelection?.();
  const ranges = selection ? Array.from({length:selection.rangeCount}, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
  const inputSelection = active && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
  field.value = text; field.readOnly = true; field.tabIndex = -1;
  field.setAttribute('aria-label', '공유 내용 복사용 임시 입력');
  field.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;font-size:16px';
  (container || doc.body).appendChild(field);
  try { field.focus({preventScroll:true}); field.select(); return doc.execCommand('copy') === true; }
  catch { return false; }
  finally {
    field.remove();
    active?.focus?.({preventScroll:true});
    if (inputSelection) active.setSelectionRange?.(...inputSelection);
    else if (selection) { selection.removeAllRanges(); for (const range of ranges) selection.addRange(range); }
  }
}
