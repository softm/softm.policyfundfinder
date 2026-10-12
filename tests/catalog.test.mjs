import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeNotice} from '../server/bizinfo.mjs';
import {filterPrograms,categoryFacets} from '../public/core.js';
import {renderAttachments,renderNoticeLinks,renderClassification,renderOverview} from '../public/notice-view.js';
import {pdfPreview} from '../server/attachments.mjs';
import {normalizeAttachments,mergeAttachmentViews,officialViewer} from '../public/attachment-links.js';
import {parseOfficialAttachments} from '../scripts/official-attachments.mjs';
import {renderTagLinks,tagSearchUrl} from '../public/tag-links.js';
const make=(id,category,subcategory,region='울산')=>normalizeNotice({pblancId:id,pblancNm:`[${region}] 공고`,pldirSportRealmLclasCodeNm:category,pldirSportRealmMlsfcCodeNm:subcategory,hashtags:region,reqstBeginEndDe:'20261007 ~ 20261020'},'2026-10-12');
const today='2026-10-12';
test('기업마당 다중 첨부를 파일별 다운로드로 분리하고 공식 바로보기와 연결한다',()=>{
  const base='https://www.bizinfo.go.kr/cmm/fms/getImageFile.do?atchFileId=FILE_000000000776234&fileSn=';
  const p=normalizeNotice({pblancId:'PBLN_EXAMPLE',pblancNm:'추천 공고',fileNm:'공고.hwpx@[붙임] 추천서.zip',flpthNm:base+'0@'+base+'1'},today);
  assert.equal(p.attachments.length,2);assert.equal(p.attachments[0].name,'공고.hwpx');assert.equal(new URL(p.attachments[1].downloadUrl).searchParams.get('fileSn'),'1');assert.match(p.attachments[0].downloadUrl,/fileDown\.do/);
  const html=`<li><div class="file_name">공고.hwpx</div><a onclick="fileBlank('/webapp/upload/bizinfo/file/2026/10/' + '/' + '202610121434440036.hwpx', '공고.hwpx')">바로보기</a><a href="/cmm/fms/fileDown.do?atchFileId=FILE_000000000776234&fileSn=0">다운로드</a></li><li><div class="file_name">추천서.zip</div><a onclick="fileBlank('/webapp/upload/bizinfo/file/2026/10/' + '/' + 'form.zip', '추천서.zip')">바로보기</a><a href="/cmm/fms/fileDown.do?atchFileId=FILE_000000000776234&fileSn=1">다운로드</a></li>`;
  const views=parseOfficialAttachments(html),merged=mergeAttachmentViews(p.attachments,views);assert.equal(views.length,2);assert.ok(merged[0].viewerUrl);assert.equal(merged[1].viewerUrl,undefined);assert.equal(new URL(merged[0].viewerUrl).searchParams.get('filepath'),'/bizinfo/file/2026/10//202610121434440036.hwpx');
  const rendered=renderAttachments({...p,attachments:merged});assert.equal((rendered.match(/data-action="document-view"/g)||[]).length,1);assert.equal((rendered.match(/>다운로드 /g)||[]).length,2);assert.ok(!rendered.includes('0@https'));
  assert.equal(officialViewer('https://evil.example/DG_viewer/viewer/document/docviewer.do?filepath=/bizinfo/file/a.hwp'),null);
  assert.equal(officialViewer('https://www.bizinfo.go.kr/DG_viewer/viewer/document/docviewer.do?filepath=/bizinfo/file/../private.hwp'),null);
});
test('이미 저장된 합쳐진 첨부도 분리하며 PDF 캐시와 파일명 내부 @를 보존한다',()=>{
  const files=normalizeAttachments([{name:'contact@company.pdf',url:'https://files.example/file.pdf',pdf:true,cachedUrl:'data/pdf/file.pdf'}]);assert.equal(files.length,1);assert.equal(files[0].name,'contact@company.pdf');assert.equal(files[0].cachedUrl,'data/pdf/file.pdf');
});
test('태그 링크는 정확한 태그 조회와 URL·HTML 안전성을 보장한다',()=>{
  const p=make('T1','기술','장비지원');p.tags=['기술','서울','전남광주'];const q={...p,id:'T2',tags:['부산']};
  assert.deepEqual(filterPrograms([p,q],{tag:'#서울',status:'all'},null,[],today).map(x=>x.id),['T1']);assert.equal(categoryFacets([p,q],{tag:'서울',status:'all'},null,[],today).categoryCounts.전체,1);
  const url=new URL(tagSearchUrl('전남광주','https://policyfundfinder.designboard.net/?notice=old'));assert.equal(url.searchParams.get('tag'),'전남광주');assert.equal(url.searchParams.has('notice'),false);
  const links=renderTagLinks({...p,tags:['<img src=x>']},'https://policyfundfinder.designboard.net/');assert.ok(!links.includes('<img'));assert.match(links,/&lt;img/);assert.match(renderTagLinks(p,url.href),/data-action="tag"/);
});
test('분야·중분류·지역은 조합 검색되며 분야 건수는 현재 분야 선택 전 범위다',()=>{
  const notices=[make('T1','기술','장비지원'),make('T2','기술','R&D','충남'),make('T3','경영','컨설팅'),make('T4','기타',''),make('T5','','')];
  const filters={category:'기술',subcategory:'장비지원',region:'울산',status:'open'};
  assert.deepEqual(filterPrograms(notices,filters,null,[],today).map(p=>p.id),['T1']);
  const facets=categoryFacets(notices,filters,null,[],today);
  assert.equal(facets.categoryCounts.전체,4);assert.equal(facets.categoryCounts.기술,1);
  assert.equal(facets.categoryCounts.기타,1);assert.equal(facets.categoryCounts['분류 미제공'],1);
  assert.deepEqual(facets.subcategories,[{name:'장비지원',count:1}]);
  assert.deepEqual(filterPrograms(notices,{category:'분류 미제공',status:'all'},null,[],today).map(p=>p.id),['T5']);
});
test('기간 내·예정·미확인 공고를 진행중으로 섞지 않는다',()=>{
  const p=make('T1','기술','장비지원');const upcoming={...p,id:'T2',start:'2026-10-15'};const unknown={...p,id:'T3',end:null};const closed={...p,id:'T4',end:'2026-10-11'};
  const notices=[p,upcoming,unknown,closed];
  for(const [status,id] of [['open','T1'],['upcoming','T2'],['unknown','T3'],['closed','T4']])assert.deepEqual(filterPrograms(notices,{status},null,[],today).map(p=>p.id),[id]);
  assert.equal(filterPrograms(notices,{status:'current'},null,[],today).length,3);
});
test('실제 API 형태의 공고문과 신청서 링크, 중분류, 본문을 보존한다',()=>{
  const p=normalizeNotice({pblancId:'PBLN_EXAMPLE',pblancNm:'장비 바우처',pldirSportRealmLclasCodeNm:'기술',pldirSportRealmMlsfcCodeNm:'기술인력/장비지원',bsnsSumryCn:'<p>사업 안내</p><p>☞ 중소기업</p><p>☞ 기업당 최대 100만원 상당 바우처 지원</p>',printFileNm:'공고문.pdf',printFlpthNm:'https://www.bizinfo.go.kr/cmm/fms/getImageFile.do?atchFileId=FILE_A&fileSn=0',fileNm:'신청서.hwpx',flpthNm:'https://www.bizinfo.go.kr/cmm/fms/getImageFile.do?atchFileId=FILE_B&fileSn=0',rceptEngnHmpgUrl:'https://utp.or.kr/apply'},today);
  assert.equal(p.type,'바우처');assert.equal(p.amountMax,undefined);assert.equal(p.subcategory,'기술인력/장비지원');assert.equal(p.attachments.length,2);assert.equal(p.attachments[0].pdf,true);assert.equal(p.attachments[1].pdf,false);
  assert.equal(p.benefit,'기업당 최대 100만원 상당 바우처 지원');assert.match(p.overview,/\n\n/);
  assert.match(renderAttachments(p),/PDF 보기/);assert.match(renderAttachments(p),/신청서.hwpx/);assert.match(renderNoticeLinks(p),/https:\/\/utp.or.kr\/apply/);assert.match(renderClassification(p),/기술인력\/장비지원/);assert.match(renderOverview(p),/최대 100만원/);
});
test('첨부파일·신청기관 누락과 악성 URL, 파일명 HTML을 안전하게 처리한다',()=>{
  const p=make('T1','','');p.attachments=[{name:'<img src=x onerror=alert(1)>.pdf',url:'https://files.example/a.pdf',pdf:true},{name:'unsafe.pdf',url:'javascript:alert(1)',pdf:true}];p.application='data:text/html,<script>alert(1)</script>';
  const html=renderAttachments(p);assert.ok(!html.includes('javascript:'));assert.ok(!html.includes('<img'));assert.match(html,/&lt;img/);assert.ok(!renderNoticeLinks(p).includes('data:text'));assert.match(renderAttachments({...p,attachments:[]}),/제공되지/);
  const n=normalizeNotice({pblancId:'T2',pblancNm:'공고',flpthNm:'javascript:alert(1)',printFlpthNm:'https://user:pass@example.com/a.pdf'},today);assert.deepEqual(n.attachments,[]);
});
test('다운로드로 반환된 공식 PDF를 인라인으로 제공하고 임의 프록시 요청을 거부한다',async()=>{
  const file={name:'공고문.pdf',url:'https://www.bizinfo.go.kr/cmm/fms/getImageFile.do?atchFileId=FILE_X&fileSn=0',pdf:true};
  const result=await pdfPreview(file,async()=>new Response('%PDF-1.7\nfixture',{headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment'}}));
  assert.equal(result.headers.get('Content-Type'),'application/pdf');assert.match(result.headers.get('Content-Disposition'),/^inline;/);assert.match(await result.text(),/^%PDF/);
  let called=false;const rejected=await pdfPreview({...file,url:'http://127.0.0.1/admin'},async()=>{called=true;});assert.equal(rejected.status,400);assert.equal(called,false);
  const invalid=await pdfPreview(file,async()=>new Response('<html>Not PDF</html>'));assert.equal(invalid.status,422);
  const huge=await pdfPreview(file,async()=>new Response('x',{headers:{'Content-Length':String(21*1024*1024)}}));assert.equal(huge.status,413);
});
