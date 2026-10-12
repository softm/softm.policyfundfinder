import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SHARE_BASE, noticeShareUrl, publicSearchParams, searchShareData, noticeShareData, appShareData, shareText, nativeShare, copyShareText} from '../public/sharing.js';

test('notice links use only the stable public notice ID', () => {
  const url = new URL(noticeShareUrl('bizinfo-PBLN_123', SHARE_BASE + '?view=saved&notes=private#secret'));
  assert.equal(url.search, '?notice=bizinfo-PBLN_123'); assert.equal(url.hash, '');
});
test('notice identifiers reject HTML, query injection and missing IDs', () => {
  for (const id of ['', null, undefined, 'a&notes=secret', '<script>', 'x'.repeat(101)]) assert.throws(() => noticeShareUrl(id));
});
test('public URL builder rejects non-web protocols and embedded credentials', () => {
  for (const base of ['javascript:alert(1)', 'file:///tmp/app', 'https://user:secret@example.test/']) assert.throws(() => noticeShareUrl('abc', base));
});
test('search links retain all supported public filters and Korean text', () => {
  const input = new URLSearchParams({region:'충남', type:'정책융자', purpose:'창업', category:'금융', subcategory:'운전자금', q:'농업 & 스마트팜 #1', tag:'농업', status:'urgent'});
  const result = new URL(searchShareData(input).url);
  for (const [key, value] of input) assert.equal(result.searchParams.get(key), value);
});
test('search links exclude personal records, profile IDs, matching, notice, view, sort and tracking parameters', () => {
  const input = new URLSearchParams({q:'스마트팜', view:'prepare', notice:'123', matched:'true', sort:'match', profile:'secret', name:'private', revenue:'private', notes:'private', saved:'private', utm_source:'track', token:'private'});
  const result = new URL(searchShareData(input).url);
  assert.deepEqual([...result.searchParams], [['q','스마트팜']]); assert.ok(!result.href.includes('private'));
});
test('default values and invalid statuses are excluded without removing literal search text', () => {
  assert.equal(publicSearchParams('?region=전체&type=전체&status=current&q=전체').toString(), 'q=%EC%A0%84%EC%B2%B4');
  assert.equal(publicSearchParams('?status=invalid').toString(), '');
  assert.equal(publicSearchParams('?status=all').get('status'), 'all');
});
test('search descriptions identify status and never serialize unapproved fields', () => {
  assert.match(searchShareData('?status=urgent&notes=secret').text, /7일 내 마감/);
  assert.match(searchShareData('').text, /마감 제외/);
  assert.ok(!searchShareData('?notes=secret').text.includes('secret'));
});
test('app sharing clears query and hash and keeps the public landing page', () => {
  assert.equal(appShareData(SHARE_BASE + '?notice=123#secret').url, SHARE_BASE);
});
test('notice messages include official metadata but no notes or profiles', () => {
  const data = noticeShareData({id:'npay-123', title:'지원사업', agency:'기관', benefit:'지원내용', periodText:'2026.10.01 ~ 2026.10.31', notes:'secret', profile:{name:'private'}});
  assert.match(shareText(data), /지원사업/); assert.match(shareText(data), /2026.10.31/);
  assert.ok(!shareText(data).includes('secret')); assert.ok(!shareText(data).includes('private'));
  assert.equal(shareText(data).split(data.url).length, 2);
});
test('native share is invoked before the first await and sends only ShareData fields', async () => {
  let payload;
  const result = nativeShare({...appShareData(), extra:'secret'}, {share(data) {payload=data; return Promise.resolve();}});
  assert.ok(payload); assert.deepEqual(Object.keys(payload), ['title','text','url']); assert.equal(await result, 'shared');
});
test('native cancellation does not copy anything or report an error', async () => {
  let copied = false;
  const result = await nativeShare(appShareData(), {share:async()=>{throw new DOMException('cancelled','AbortError');}, clipboard:{writeText:()=>{copied=true;}}});
  assert.equal(result, 'cancelled'); assert.equal(copied, false);
});
test('native support checks and errors safely offer the copy alternative', async () => {
  assert.equal(await nativeShare(appShareData(), {}), 'unsupported');
  assert.equal(await nativeShare(appShareData(), {canShare:()=>false, share:()=>assert.fail()}), 'unsupported');
  assert.equal(await nativeShare(appShareData(), {canShare:()=>{throw Error();}, share:()=>assert.fail()}), 'failed');
  assert.equal(await nativeShare(appShareData(), {share:async()=>{throw new DOMException('blocked','NotAllowedError');}}), 'failed');
});
test('successful clipboard writes return true only after actual completion', async () => {
  let copied;
  assert.equal(await copyShareText('링크', {nav:{clipboard:{writeText:async text=>{copied=text;}}}, doc:null}), true);
  assert.equal(copied, '링크');
});
test('denied clipboard access without a working fallback never reports success', async () => {
  assert.equal(await copyShareText('link', {nav:{clipboard:{writeText:async()=>{throw Error('denied');}}}, doc:null}), false);
  assert.equal(await copyShareText('link', {nav:{}, doc:null}), false);
});
function fakeDocument(outcome) {
  const calls = [], active = {focus:()=>calls.push('restore')};
  const field = {setAttribute(){}, style:{}, focus:()=>calls.push('focus'), select:()=>calls.push('select'), remove:()=>calls.push('remove')};
  const doc = {activeElement:active, createElement:()=>field, body:{appendChild:()=>calls.push('append')}, execCommand:()=>{if (outcome instanceof Error) throw outcome; return outcome;}};
  return {doc, calls, field};
}
test('fallback copies inside the active share dialog and restores focus', async () => {
  const {doc,calls,field}=fakeDocument(true), container={appendChild:()=>calls.push('dialog')};
  assert.equal(await copyShareText('한글 URL', {nav:{},doc,container}), true);
  assert.equal(field.value, '한글 URL'); assert.deepEqual(calls, ['dialog','focus','select','remove','restore']);
});
test('failed and throwing legacy copy operations are cleaned up and return false', async () => {
  for (const outcome of [false, new Error('blocked')]) {
    const {doc,calls}=fakeDocument(outcome);
    assert.equal(await copyShareText('link', {nav:{},doc}), false);
    assert.deepEqual(calls.slice(-2), ['remove','restore']);
  }
});
test('entry point and offline asset list load the isolated sharing feature', async () => {
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const sw=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');
  assert.match(html, /\.\/public\/sharing-ui\.js\?v=/); assert.match(html, /\.\/public\/sharing\.css\?v=/);
  for (const asset of ['sharing.js','sharing-ui.js','sharing.css']) assert.ok(sw.includes(asset));
  assert.match(sw, /pages-v6-share/);
});
test('share dialog remains separate from detail and viewer dialogs', async () => {
  const ui=await readFile(new URL('../public/sharing-ui.js',import.meta.url),'utf8');
  assert.match(ui, /sheet\.id = 'share-dialog'/); assert.match(ui, /event\.stopImmediatePropagation\(\)/);
  assert.ok(!ui.includes('localStorage')); assert.ok(!ui.includes('parent.innerHTML'));
  assert.match(ui, /token === session/); assert.match(ui, /preventScroll:true/);
});
