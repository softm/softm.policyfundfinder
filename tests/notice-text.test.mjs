import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeNoticeText,renderNoticeText,noticeBenefitTeaser} from '../public/notice-text.js';

const support = 'ㅇ 지원내용 : 친환경·에너지 부분 설비(제품, 재료) 개선 지원 - 에너지 효율 장치 구매 : 한국에너지공단 인증 에너지 고효율 장치 - 에너지 전환(석유 → 전기) : 석유 설비를 전기로 교체 - 대기오염물질(온실가스 포함) 배출 저감 장치 - 재생에너지 도입 : 태양광 설치 * 광명시 재생에너지 사업과 중복지원 불가 - 친환경(저탄소) 인증 > 기후에너지환경부 등 공공기관이 인증한 재료·부품을 이용한 제품 생산 * 단, 제조공정 내 사용되는 재료·부품에 한함 ㅇ 지원금액 : 설치비의 10%(업체당 최대 500만원) 지원 - 탄소중립 설비 1개 이상(복수 선택 가능) 가능하며, 합계 금액으로 지원함 - 신청 합계 금액이 최대 지원금액을 초과할 수 없음';
const target = 'ㅇ 지원대상 - 광명시 내 사업자등록을 한 제조업자';
const method = 'ㅇ 신청방법 - 신청기간 내에 신청서 및 제출 서류를 작성하여 접수처에 직접 제출(대리접수 가능) 또는 등기우편 - 방문접수의 경우 근무시간인 09:00~18:00(점심시간 12:00~13:00 제외) 접수 가능 ㅇ 접수 및 문의처 : 광명시 탄소중립과';

test('flattened Npay subsidy content reconstructs headings and separate line items', () => {
  const txt = normalizeNoticeText(support);
  assert.match(txt,/^ㅇ 지원내용.*\n- 에너지 효율 장치 구매/m);
  assert.match(txt,/\nㅇ 지원금액 : 설치비의 10%/);
  assert.match(txt,/\n\* 광명시 재생에너지 사업과 중복지원 불가/);
  const markup = renderNoticeText(support);
  assert.equal((markup.match(/<li>/g)||[]).length,7);
  assert.match(markup,/notice-text-heading">지원내용/);
  assert.match(markup,/notice-text-heading">지원금액/);
  assert.match(markup,/태양광 설치/);
  assert.match(markup,/500만원/);
  assert.match(markup,/notice-text-note/);
});
test('target and method sections become readable paragraphs and bullets',()=>{
  assert.match(renderNoticeText(target),/<li>광명시 내 사업자등록을 한 제조업자<\/li>/);
  const html=renderNoticeText(method);
  assert.match(html,/notice-text-heading">신청방법/);
  assert.match(html,/notice-text-heading">접수 및 문의처/);
  assert.equal((html.match(/<li>/g)||[]).length,2);
  assert.match(renderNoticeText(target,{compact:true}),/notice-text-compact/);
  assert.doesNotMatch(renderNoticeText(target,{compact:true}),/<h4/);
});
test('legacy saved fields without line feeds render exactly the same as new formatted fields',()=>{
  assert.equal(renderNoticeText(support),renderNoticeText(normalizeNoticeText(support)));
  assert.equal(renderNoticeText(method),renderNoticeText(normalizeNoticeText(method)));
});
test('Npay benefit banner is a single accurate amount line rather than a clipped list',()=>{
  const summary=noticeBenefitTeaser({sourceProvider:'npay',supportText:support,benefit:support.slice(0,160)});
  assert.equal(summary,'설치비의 10%(업체당 최대 500만원) 지원');
  assert.doesNotMatch(summary,/에너지 효율 장치/);
  assert.equal(noticeBenefitTeaser({sourceProvider:'bizinfo',benefit:'최대 500만원'}),'최대 500만원');
});
test('HTML breaks and encoded entities are normalized without losing explicit line feeds',()=>{
  const s='지원 내용<br>첫째<br/>둘째<p>세 번째 &amp; 네 번째</p><ul><li>항목 A</li><li>항목 B</li></ul>';
  const html=renderNoticeText(s);
  assert.match(html,/첫째/);assert.match(html,/둘째/);
  assert.match(html,/세 번째 &amp; 네 번째/);
  assert.equal((html.match(/<li>/g)||[]).length,2);
});
test('HTML and JavaScript strings remain escaped and no raw markup is executed',()=>{
  const payload='<script>alert(1)</script>ㅇ 지원내용 : <img src=x onerror=alert(1)> 안전 &lt;script&gt; 실행금지';
  const html=renderNoticeText(payload);
  assert.doesNotMatch(html,/<script>|<img|onerror=|alert\(/);
  assert.match(html,/&lt;script&gt; 실행금지/);
});
test('do not misinterpret numeric ranges, minus amounts, hyphenated words or raw URLs as bullet markers',()=>{
  const source='접수기간 2026 - 2027 / 최대 - 100만원 / R&D-지원 https://example.com/x-y';
  const normalized=normalizeNoticeText(source);
  assert.doesNotMatch(normalized,/\n/);
  assert.match(normalized,/R&D-지원/);
});
test('empty and text-only notices have safe, stable output',()=>{
  assert.equal(renderNoticeText(''),'<div class="notice-text"></div>');
  assert.match(renderNoticeText('일반 안내 문장입니다.'),/<p class="notice-text-paragraph">일반 안내 문장입니다.<\/p>/);
});
