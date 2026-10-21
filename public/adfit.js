import {adfitConfig} from './adfit-config.js';

/** SOFTM-ADFIT START 날짜:20261022 : 발급된 지원한눈 광고만 요청하고 검색·입력 공간과 광고 수명을 분리한다. */
const STORAGE_KEY = 'jiwonhannun-adfit-collapsed-v1';
const SDK_ID = 'jiwonhannun-adfit-sdk';
const SUPPORTED_SIZES = new Set(['320x50', '320x100', '728x90']);
let sdkPromise;

export function isAllowedAdHost(hostname, allowedHosts = []) {
  return allowedHosts.some(host => String(host).toLowerCase() === String(hostname).toLowerCase());
}

export function isValidAdSlot(slot, preview = false) {
  return Boolean(slot && SUPPORTED_SIZES.has(`${slot.width}x${slot.height}`)
    && (preview || /^DAN-[A-Za-z0-9]{8,64}$/.test(slot.unit || '')));
}

export function chooseAnchorSlot(anchor, width, preview = false) {
  for (const name of ['desktop', 'mobile']) {
    const slot = anchor?.[name];
    if (isValidAdSlot(slot, preview) && Number.isFinite(width) && width >= slot.width) return {name, ...slot};
  }
  return null;
}

export function listInsertionIndex(count, placement = {}) {
  const after = Math.max(1, Math.floor(Number(placement.after) || 6));
  const minimum = Math.max(after + 1, Math.floor(Number(placement.minItems) || 7));
  return Number.isInteger(count) && count >= minimum ? after : -1;
}

export function appScrollPosition() {
  const app = document.getElementById('app');
  return document.body.classList.contains('adfit-workspace') && app
    ? {x:app.scrollLeft, y:app.scrollTop} : {x:window.scrollX, y:window.scrollY};
}

export function scrollApp(options) {
  const app = document.getElementById('app');
  if (document.body.classList.contains('adfit-workspace') && app) app.scrollTo(options);
  else window.scrollTo(options);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

// The initial SDK scan sees no ins. Only a newly attached ins is passed to render.
// Calling adfit() again would refresh already mounted units in SDK 4.41.4.
function loadSdk(url) {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    if (typeof window.adfit?.render === 'function') { resolve(window.adfit); return; }
    if (!/^https:\/\/t1\.(?:daumcdn\.net|kakaocdn\.net)\/kas\/static\/ba\.min\.js$/.test(url || '')) {
      reject(new Error('Invalid AdFit SDK URL')); return;
    }
    const script = element('script');
    script.id = SDK_ID; script.async = true; script.charset = 'utf-8'; script.src = url;
    const timeout = window.setTimeout(() => reject(new Error('AdFit SDK unavailable')), 20000);
    script.onload = () => {
      window.clearTimeout(timeout);
      if (typeof window.adfit?.render === 'function') resolve(window.adfit);
      else reject(new Error('AdFit render unavailable'));
    };
    script.onerror = () => { window.clearTimeout(timeout); reject(new Error('AdFit SDK unavailable')); };
    document.head.append(script);
  });
  return sdkPromise;
}

// Keep the list and all of its ancestors connected during a full application
// render. Moving a live iframe into a new parent can reload the ad itself.
function preserveShell(app, markup) {
  const template = document.createElement('template'); template.innerHTML = markup;
  const oldSite = app.querySelector(':scope > .site-main');
  const nextSite = template.content.querySelector('.site-main');
  const oldMain = oldSite?.querySelector(':scope > #main');
  const nextMain = nextSite?.querySelector(':scope > #main');
  if (!oldMain || !nextMain) { app.replaceChildren(template.content); return; }
  const oldList = oldMain.querySelector(':scope > #list');
  const nextList = nextMain.querySelector(':scope > #list');
  for (const child of [...oldMain.childNodes]) if (child !== oldList) child.remove();
  let beforeList = Boolean(oldList);
  for (const child of [...nextMain.childNodes]) {
    if (oldList && child === nextList) { oldList.hidden = false; beforeList = false; continue; }
    oldMain.insertBefore(child, beforeList ? oldList : null);
  }
  if (oldList && !nextList) oldList.hidden = true;
  for (const child of [...oldSite.childNodes]) if (child !== oldMain) child.remove();
  let beforeMain = true;
  for (const child of [...nextSite.childNodes]) {
    if (child === nextMain) { beforeMain = false; continue; }
    oldSite.insertBefore(child, beforeMain ? oldMain : null);
  }
  for (const child of [...app.childNodes]) if (child !== oldSite) child.remove();
  let beforeSite = true;
  for (const child of [...template.content.childNodes]) {
    if (child === nextSite) { beforeSite = false; continue; }
    app.insertBefore(child, beforeSite ? oldSite : null);
  }
}

export function createAdManager({app, config = adfitConfig, startPaused = false} = {}) {
  const preview = new URLSearchParams(location.search).get('adPreview') === '1';
  const allowed = isAllowedAdHost(location.hostname, config.allowedHosts);
  const enabled = preview || (config.enabled === true && allowed
    && [config.anchor?.mobile, config.anchor?.desktop, config.list].some(slot => isValidAdSlot(slot)));
  if (!enabled || !app) return {
    preview,
    renderShell(markup) { app.innerHTML = markup; },
    renderList(host, cards, emptyMarkup) { host.innerHTML = cards.length ? cards.join('') : emptyMarkup; },
    setLoading() {}, setReady() {}, sync() {}
  };

  let view = 'browse', count = 0, loading = false, frame = 0, listParts = null, selected = null;
  let hadDialog = false, dialogPosition = null, ready = !startPaused;
  let collapsed = false;
  try { collapsed = sessionStorage.getItem(STORAGE_KEY) === '1'; } catch {}
  const records = new Map(), mountedUnits = new Set();
  const dock = element('aside', 'adfit-anchor'); dock.id = 'adfit-anchor'; dock.hidden = true;
  dock.setAttribute('aria-label', '하단 광고');
  const bar = element('div', 'adfit-anchor-bar');
  bar.append(element('span', 'adfit-label', preview ? '광고 미리보기' : '광고'));
  const toggle = element('button', 'adfit-toggle', '광고 접기'); toggle.type = 'button';
  toggle.setAttribute('aria-controls', 'adfit-anchor-panel');
  bar.append(toggle);
  const panel = element('div', 'adfit-anchor-panel'); panel.id = 'adfit-anchor-panel';
  dock.append(bar, panel); document.body.append(dock);
  // Keep focus/scrollIntoView from scrolling a second root viewport behind #app.
  document.documentElement.classList.add('adfit-workspace-root');
  document.body.classList.add('adfit-workspace');
  window.scrollTo({left:0, top:0, behavior:'instant'});
  document.body.dataset.adfitMode = preview ? 'preview' : 'live';

  function schedule() { if (!frame) frame = requestAnimationFrame(() => { frame = 0; sync(); }); }
  function setSpace(name, value) {
    const next = `${Math.ceil(value)}px`;
    if (document.body.style.getPropertyValue(name) !== next) document.body.style.setProperty(name, next);
  }
  function suspended() {
    return Boolean(document.querySelector('dialog[open]') || document.hidden
      || document.activeElement?.matches('input:not([type="checkbox"]):not([type="radio"]),textarea,[contenteditable="true"]'));
  }
  function makeRecord(key, slot, parent) {
    let record = records.get(key);
    if (record) return record;
    const mount = element('div', 'adfit-mount'); mount.hidden = true;
    mount.style.width = `${slot.width}px`; mount.style.height = `${slot.height}px`;
    mount.dataset.adfitSlot = key; mount.dataset.state = 'idle'; parent.append(mount);
    record = {key, slot, mount, status:'idle', ins:null, recoveryCount:0, hiddenForInteraction:false}; records.set(key, record);
    return record;
  }
  function fail(record) {
    if (!record || ['failed', 'retryable'].includes(record.status)) return;
    // An initial request may fail its SDK size check after the user hides it.
    // Only that pending, hidden anchor can be retried, once, by an explicit click.
    const retryable = record.key.startsWith('anchor-') && record.status === 'requested'
      && record.hiddenForInteraction && record.recoveryCount === 0;
    record.status = retryable ? 'retryable' : 'failed';
    record.mount.dataset.state = retryable ? 'retryable' : 'empty';
    if (record.ins && typeof window.adfit?.destroy === 'function') {
      try { window.adfit.destroy(record.ins); } catch {}
    }
    if (retryable) collapsed = true;
    record.mount.hidden = true; schedule();
  }
  window.jiwonAdFitLoaded = ins => {
    const record = [...records.values()].find(item => item.ins === ins);
    if (!record || ['failed', 'retryable'].includes(record.status)) return;
    record.status = 'filled'; record.mount.dataset.state = 'filled';
  };
  window.jiwonAdFitFailed = ins => fail([...records.values()].find(item => item.ins === ins));

  function request(record, canRequest) {
    if (!ready || !record || record.status !== 'idle' || !canRequest()) return;
    if (preview) {
      const placeholder = element('div', 'adfit-preview');
      placeholder.append(element('strong', '', '광고 미리보기'), element('span', '', `${record.slot.width} × ${record.slot.height}`));
      record.mount.append(placeholder); record.status = 'preview'; record.mount.dataset.state = 'preview'; return;
    }
    record.status = 'loading-sdk'; record.mount.dataset.state = 'loading';
    loadSdk(config.scriptUrl).then(sdk => {
      if (!ready || !canRequest()) { record.status = 'idle'; record.mount.dataset.state = 'idle'; return; }
      if (mountedUnits.has(record.slot.unit)) { fail(record); return; }
      const ins = element('ins', 'kakao_ad_area');
      ins.style.display = 'none'; ins.dataset.adUnit = record.slot.unit;
      ins.dataset.adWidth = String(record.slot.width); ins.dataset.adHeight = String(record.slot.height);
      ins.dataset.adOnload = 'jiwonAdFitLoaded'; ins.dataset.adOnfail = 'jiwonAdFitFailed';
      record.ins = ins; record.status = 'requested'; mountedUnits.add(record.slot.unit);
      record.mount.append(ins); sdk.render(ins);
    }).catch(() => fail(record));
  }

  function sync() {
    const dialogOpen = Boolean(document.querySelector('dialog[open]'));
    if (dialogOpen && !hadDialog) dialogPosition = appScrollPosition();
    const restorePosition = hadDialog && !dialogOpen ? dialogPosition : null;
    hadDialog = dialogOpen;
    const nav = app.querySelector('.bottom-nav');
    const navHeight = nav && getComputedStyle(nav).display !== 'none' ? nav.getBoundingClientRect().height : 0;
    setSpace('--adfit-nav-height', navHeight);
    const active = ready && ['browse', 'saved', 'guide'].includes(view) && !suspended();
    // Empty/error lists never leave an advertisement standing in for content.
    const hasContent = view === 'guide' || (count > 0 && !loading);
    const sidebar = app.querySelector('.sidebar');
    const sideWidth = sidebar && getComputedStyle(sidebar).display !== 'none' ? sidebar.getBoundingClientRect().width : 0;
    setSpace('--adfit-sidebar-width', sideWidth);
    const width = document.documentElement.clientWidth - sideWidth - 24;
    selected = chooseAnchorSlot(config.anchor, width, preview);
    const anchorRecord = selected ? makeRecord(`anchor-${selected.name}`, selected, panel) : null;
    if (anchorRecord?.status === 'retryable') collapsed = true;
    dock.hidden = !active || !hasContent || !anchorRecord || anchorRecord.status === 'failed';
    dock.dataset.expanded = String(!collapsed);
    panel.hidden = collapsed;
    toggle.textContent = collapsed ? '광고 펼치기' : '광고 접기';
    toggle.setAttribute('aria-label', `하단 ${toggle.textContent}`);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    for (const record of records.values()) if (record.key.startsWith('anchor-')) {
      record.hiddenForInteraction = record === anchorRecord && (collapsed || suspended());
      record.mount.hidden = record !== anchorRecord || dock.hidden || collapsed;
    }
    setSpace('--adfit-anchor-height', dock.hidden ? 0 : dock.getBoundingClientRect().height);
    request(anchorRecord, () => !dock.hidden && !collapsed && !suspended() && selected?.name === anchorRecord.slot.name);
    if (listParts) {
      const record = listParts.record;
      const style = getComputedStyle(listParts.ad);
      const horizontalSpace = ['marginLeft', 'marginRight', 'paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth']
        .reduce((total, property) => total + (Number.parseFloat(style[property]) || 0), 0);
      const availableWidth = listParts.host.clientWidth - horizontalSpace;
      const eligible = ready && view === 'browse' && !loading && !suspended()
        && listInsertionIndex(count, config.list) >= 0 && isValidAdSlot(config.list, preview)
        && availableWidth >= config.list.width && record.status !== 'failed';
      listParts.ad.hidden = !eligible; record.mount.hidden = !eligible;
      request(record, () => !listParts.ad.hidden && !listParts.host.hidden && !suspended());
    }
    if (restorePosition) {
      scrollApp({left:restorePosition.x, top:restorePosition.y, behavior:'instant'});
      dialogPosition = null;
    }
  }

  toggle.addEventListener('click', () => {
    const record = selected && records.get(`anchor-${selected.name}`);
    if (collapsed && record?.status === 'retryable' && record.recoveryCount === 0) {
      // Retire the previous node before releasing its unit. No duplicate ins exists.
      if (record.ins && typeof window.adfit?.destroy === 'function') {
        try { window.adfit.destroy(record.ins); } catch {}
      }
      record.ins?.remove(); record.ins = null; mountedUnits.delete(record.slot.unit);
      record.recoveryCount = 1; record.status = 'idle'; record.mount.dataset.state = 'idle';
      record.hiddenForInteraction = false;
    }
    collapsed = !collapsed;
    try { sessionStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); } catch {}
    sync();
  });
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);
  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('resize', schedule, {passive:true});
  window.visualViewport?.addEventListener('resize', schedule, {passive:true});
  new MutationObserver(changes => {
    if (changes.some(change => change.type === 'attributes' && change.target.matches('dialog'))) schedule();
  }).observe(document.body, {subtree:true, attributes:true, attributeFilter:['open']});
  if (typeof ResizeObserver === 'function') new ResizeObserver(schedule).observe(dock);

  return {
    preview,
    renderShell(markup, nextView) {
      view = nextView; loading = false; count = 0;
      preserveShell(app, markup); sync();
    },
    renderList(host, cards, emptyMarkup, nextView) {
      view = nextView; count = cards.length; loading = false;
      if (!listParts || listParts.host !== host) {
        host.replaceChildren();
        const head = element('div', 'adfit-list-group'), tail = element('div', 'adfit-list-group');
        const ad = element('aside', 'adfit-list'); ad.hidden = true; ad.setAttribute('aria-label', '목록 광고');
        ad.append(element('span', 'adfit-label', preview ? '광고 미리보기' : '광고'));
        const record = makeRecord('list', config.list || {width:320, height:100, unit:''}, ad);
        host.append(head, ad, tail); listParts = {host, head, tail, ad, record};
      }
      const index = listInsertionIndex(cards.length, config.list);
      listParts.head.innerHTML = cards.length ? cards.slice(0, index < 0 ? cards.length : index).join('') : emptyMarkup;
      listParts.tail.innerHTML = index < 0 ? '' : cards.slice(index).join('');
      sync();
    },
    setLoading(value) { loading = value; sync(); },
    setReady(value = true) { ready = Boolean(value); sync(); },
    sync
  };
}
/** SOFTM-ADFIT END */
