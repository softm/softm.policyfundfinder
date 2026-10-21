import {appScrollPosition,scrollApp} from './adfit.js?v=20261022-2'; // SOFTM-ADFIT 날짜:20261022 : 공유창을 닫을 때 광고 위 본문 위치를 복원
import {api} from './data-client.js';
import {appShareData, noticeShareData, searchShareData, shareText, nativeShare, copyShareText} from './sharing.js';

// Isolated progressive enhancement: the existing app rerenders its list and dialogs.
// Observe only those roots and add idempotent controls without changing application state.
const glyph = '<svg class="i sm" viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4m-6.8 7 6.8 4"/></svg>';
const root = document.getElementById('app'), parent = document.getElementById('dialog');
const sheet = document.createElement('dialog');
sheet.id = 'share-dialog'; sheet.className = 'share-dialog';
sheet.setAttribute('aria-labelledby', 'share-title');
sheet.setAttribute('aria-describedby', 'share-description');
sheet.innerHTML = `<div class="share-header"><h2 id="share-title">공유하기</h2><button type="button" class="icon-btn" data-share-command="close" aria-label="공유창 닫기">✕</button></div>
  <div class="share-body"><p id="share-description"></p><div class="share-preview"><strong id="share-preview-title"></strong><p id="share-preview-text"></p></div>
  <label class="share-url-label" for="share-url">공유 링크</label><input id="share-url" type="url" readonly autocomplete="off" spellcheck="false">
  <div class="share-actions"><button type="button" class="btn primary" data-share-command="native">${glyph}앱으로 공유</button><button type="button" class="btn secondary" data-share-command="copy">링크 복사</button><button type="button" class="btn secondary" data-share-command="copy-text">내용 + 링크 복사</button></div>
  <p class="share-hint">앱으로 공유에서 사용할 수 있는 앱은 기기와 브라우저에 따라 다릅니다. 링크를 복사해 카카오톡·문자·메일에 붙여넣을 수도 있습니다.</p>
  <p id="share-feedback" role="status" aria-live="polite" aria-atomic="true"></p></div>`;
document.body.appendChild(sheet);
const $ = selector => sheet.querySelector(selector);
let current = null, opener = null, session = 0, busy = false, position = null, scheduled = false;
const feedback = message => { $('#share-feedback').textContent = message; };
function setBusy(value) {
  busy = value; sheet.setAttribute('aria-busy', String(value));
  for (const button of sheet.querySelectorAll('.share-actions button')) button.disabled = value;
}
function preview(data) {
  current = data;
  $('#share-preview-title').textContent = data.title;
  $('#share-preview-text').textContent = data.text;
  $('#share-url').value = data.url;
}
function openShare(data, trigger) {
  session++; opener = trigger; setBusy(false); preview(data);
  position = {...appScrollPosition(), parentScroll:parent?.scrollTop};
  $('#share-title').textContent = data.kind === 'notice' ? '공고 공유' : data.kind === 'search' ? '검색조건 공유' : '앱 공유';
  $('#share-description').textContent = data.kind === 'search'
    ? '지역·분야·접수 상태·검색어·태그 등 검색조건을 공유합니다. 개인 맞춤 조건·정렬·개인 기록은 제외하며, 받는 사람에게는 최근 공고순으로 표시됩니다.'
    : data.kind === 'notice' ? '받는 사람이 링크를 열면 이 공고의 상세 안내가 열립니다. 내 사업 정보와 준비 메모는 포함하지 않습니다.'
    : '지원한눈의 첫 화면을 공유합니다. 검색조건과 개인 기록은 포함하지 않습니다.';
  $('[data-share-command="native"]').hidden = typeof navigator.share !== 'function';
  feedback('');
  if (!sheet.open) sheet.showModal();
  sheet.scrollTop = 0;
  scrollApp({left:position.x, top:position.y, behavior:'instant'});
}
function closeShare() { if (sheet.open) sheet.close(); }
sheet.addEventListener('cancel', event => { event.preventDefault(); event.stopPropagation(); closeShare(); });
sheet.addEventListener('close', () => {
  session++; current = null; setBusy(false);
  if (position) {
    if (parent?.open) parent.scrollTop = position.parentScroll;
    scrollApp({left:position.x, top:position.y, behavior:'instant'});
  }
  if (opener?.isConnected) opener.focus({preventScroll:true});
  opener = null; position = null;
});
sheet.addEventListener('click', event => {
  if (event.target !== sheet) return;
  const r = sheet.getBoundingClientRect();
  if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeShare();
});
$('#share-url').addEventListener('click', event => event.target.select());
sheet.addEventListener('click', async event => {
  const button = event.target.closest('[data-share-command]');
  if (!button) return;
  event.preventDefault(); event.stopPropagation();
  const command = button.dataset.shareCommand;
  if (command === 'close') { closeShare(); return; }
  if (!current || busy) return;
  const token = session, data = current;
  setBusy(true); feedback('');
  if (command === 'native') {
    const result = await nativeShare(data);
    if (token !== session) return;
    feedback({shared:'공유 대상으로 전달했습니다.', cancelled:'공유를 취소했습니다.', unsupported:'앱 공유를 지원하지 않는 환경입니다. 링크 복사를 이용해 주세요.', failed:'앱 공유를 열지 못했습니다. 링크 복사를 이용해 주세요.'}[result]);
  } else {
    const copied = await copyShareText(command === 'copy-text' ? shareText(data) : data.url, {container:sheet});
    if (token !== session) return;
    if (copied) feedback(command === 'copy-text' ? '공유 내용과 링크를 복사했습니다.' : '공유 링크를 복사했습니다.');
    else { $('#share-url').focus({preventScroll:true}); $('#share-url').select(); feedback('자동 복사가 차단되었습니다. 위 링크를 길게 누르거나 Ctrl+C / ⌘C로 복사해 주세요.'); }
  }
  if (token === session) setBusy(false);
});
function button(kind, label, className, id) {
  const node = document.createElement('button'); node.type = 'button'; node.className = className;
  node.dataset.shareKind = kind; if (id) node.dataset.shareId = id;
  node.setAttribute('aria-label', label); node.setAttribute('aria-haspopup', 'dialog'); node.title = label;
  node.innerHTML = glyph;
  if (kind !== 'notice') { const text = document.createElement('span'); text.textContent = label; node.append(text); }
  return node;
}
function enhance() {
  scheduled = false;
  for (const host of document.querySelectorAll('.topbar > .flex, .mobile-header')) {
    if (!host.querySelector('[data-share-kind="app"]')) host.append(button('app', '앱 공유', 'text-btn share-app-button'));
  }
  const filters = document.querySelector('.filter-panel-head');
  const savedView = document.querySelector('.nav [data-view="saved"].active');
  if (filters && !savedView && !filters.querySelector('[data-share-kind="search"]')) filters.insertBefore(button('search', '검색조건 공유', 'btn secondary small share-search-button'), filters.lastElementChild);
  for (const card of document.querySelectorAll('.program-card, .prep-card')) {
    const title = card.querySelector('[data-action="detail"]');
    const actions = card.querySelector('.card-actions') || card.querySelector('.between.spaced');
    if (title?.dataset.id && actions && !actions.querySelector('[data-share-kind="notice"]')) {
      const name = card.querySelector('h3')?.textContent || '공고';
      actions.prepend(button('notice', `${name} 공유`, 'icon-btn share-notice-button', title.dataset.id));
    }
  }
  for (const old of document.querySelectorAll('[data-action="share"]:not([data-share-enhanced])')) {
    old.dataset.shareEnhanced = 'true'; old.setAttribute('aria-haspopup', 'dialog'); old.innerHTML = glyph + '공유';
  }
}
function scheduleEnhance() { if (!scheduled) { scheduled = true; queueMicrotask(enhance); } }
const observer = new MutationObserver(scheduleEnhance);
if (root) observer.observe(root, {childList:true, subtree:true});
if (parent) observer.observe(parent, {childList:true, subtree:true});
enhance();
// Capture the legacy detail share action before the app's bubbling handler. This
// avoids its single-dialog fallback replacing the notice, including on old pages.
document.addEventListener('click', event => {
  const trigger = event.target.closest?.('[data-share-kind], [data-action="share"]');
  if (!trigger) return;
  event.preventDefault(); event.stopImmediatePropagation();
  const kind = trigger.dataset.shareKind || 'notice';
  if (kind === 'app') { openShare(appShareData(), trigger); return; }
  if (kind === 'search') { openShare(searchShareData(location.search), trigger); return; }
  const id = trigger.dataset.shareId || trigger.dataset.id;
  const card = trigger.closest('.program-card, .prep-card');
  const fallback = {id, title:card?.querySelector('h3')?.textContent || document.getElementById('dialog-title')?.textContent || '지원사업 공고'};
  try { openShare(noticeShareData(fallback), trigger); }
  catch { return; }
  const token = session;
  api('/api/notice-detail', {id}).then(({program}) => {
    if (token === session && sheet.open && program) preview(noticeShareData(program));
  }).catch(() => { if (token === session && sheet.open) feedback('상세 내용을 불러오지 못했지만 공고 링크는 복사할 수 있습니다.'); });
}, true);
window.addEventListener('popstate', closeShare);
