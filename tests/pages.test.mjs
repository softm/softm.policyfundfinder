import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createStaticClient} from '../public/static-client.js';
import {completeIndex,searchCatalog} from '../public/static-search.js';
import {exportCatalog,verifyCatalog} from '../scripts/static-catalog.mjs';
import {collectNpay} from '../scripts/collect-pages.mjs';
import {createDialogLayers} from '../public/dialog-layers.js';
import {metricFilters,filterChips} from '../public/search-controls.js';
const notice=(id,title,extra={})=>({id,title,fullTitle:title,category:'기술',subcategory:'장비지원',region:'충남',regions:['충남'],regionSoft:true,type:'지원사업',purpose:'기타',agency:'기관',summary:'스마트팜 장비',target:'농업인',published:'2026-10-01',start:null,end:'2026-10-20',sourceActive:true,sourceProvider:'npay',sourceUrl:'https://example.com/'+id,tags:[],industries:[],businessKinds:[],requirements:[],documents:[],attachments:[],checkedAt:'2026-10-12',imported:true,detailAvailable:true,...extra});
test('Pages entry point publishes search metadata and crawler discovery files',async()=>{
  const [html,redirect,robots,sitemap,google]=await Promise.all([
    readFile(new URL('../index.html',import.meta.url),'utf8'),
    readFile(new URL('../public/index.html',import.meta.url),'utf8'),
    readFile(new URL('../public/robots.txt',import.meta.url),'utf8'),
    readFile(new URL('../public/sitemap.xml',import.meta.url),'utf8'),
    readFile(new URL('../public/google3963d25075aa9810.html',import.meta.url),'utf8'),
  ]);
  for(const expected of ['지원한눈','name="description"','name="keywords"','name="robots"','name="google-site-verification"','name="naver-site-verification"','rel="canonical"','property="og:title"','name="twitter:card"'])assert.match(html,new RegExp(expected));
  const structured=html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);assert.ok(structured);
  const schema=JSON.parse(structured[1]);assert.equal(schema['@type'],'WebApplication');assert.equal(schema.name,'지원한눈');
  assert.match(redirect,/name="robots" content="noindex,follow"/);assert.match(redirect,/rel="canonical"/);
  assert.match(robots,/^User-agent: \*/m);assert.match(robots,/Sitemap: https:\/\/policyfundfinder\.designboard\.net\/sitemap\.xml/);
  assert.match(sitemap,/<loc>https:\/\/policyfundfinder\.designboard\.net\/<\/loc>/);assert.equal(google.trim(),'google-site-verification: google3963d25075aa9810.html');
});
test('static search preserves category facets, status, Korean region and profile filters',()=>{
  const rows=[notice('a','충남 장비'),notice('b','서울 장비',{region:'서울',regions:['서울']}),notice('c','지난 금융',{category:'금융',sourceActive:false})].map(completeIndex);
  const result=searchCatalog(rows,{filters:{region:'충남',category:'기술',status:'current',query:'스마트팜',matched:true},profile:{region:'충남'},page:999,pageSize:1},'2026-10-12');
  assert.equal(result.total,1);assert.equal(result.programs[0].id,'a');assert.equal(result.page,1);assert.equal(result.categoryCounts.기술,1);
  assert.equal(searchCatalog(rows,{status:'all'},'2026-10-12').total,3);
  assert.equal(searchCatalog(rows,{status:'closed'},'2026-10-12').total,1);
});
test('metric shortcuts query the same scope as the displayed counts and clear unrelated filters',()=>{
  const rows=[
    notice('today','오늘 마감',{end:'2026-10-12',category:'금융',type:'정책융자'}),
    notice('seven','7일 후 마감',{end:'2026-10-19',category:'금융',region:'서울'}),
    notice('eight','8일 후 마감',{end:'2026-10-20',category:'금융',type:'바우처'}),
    notice('old','지난 금융',{end:'2026-10-11',category:'금융'}),
    notice('future','접수 예정',{start:'2026-10-15',end:'2026-10-18',category:'기술'}),
    notice('loan','기술 사업 대출',{category:'기술',type:'정책융자'}),
  ].map(completeIndex);
  const stats=searchCatalog(rows,{filters:metricFilters('all')},'2026-10-12');
  assert.equal(stats.urgent,2);assert.equal(stats.financial,3);
  const previous={region:'충남',query:'다른 검색어',tag:'서울',category:'기술',subcategory:'장비지원',type:'지원금',purpose:'시설·장비',matched:true};
  for(const key of ['all','urgent','financial']){
    const filters={...previous,...metricFilters(key)},result=searchCatalog(rows,{filters},'2026-10-12');
    assert.equal(result.total,key==='all'?stats.sourceCount:stats[key]);
    assert.equal(filters.region,'전체');assert.equal(filters.query,'');assert.equal(filters.tag,'');assert.equal(filters.matched,false);
  }
  assert.equal(metricFilters('financial').category,'금융');assert.equal(metricFilters('financial').type,'전체');
  assert.equal(metricFilters('urgent').sort,'deadline');assert.throws(()=>metricFilters('invalid'));
});
test('applied condition summary identifies status, category, query, tag and profile conditions',()=>{
  const filters={...metricFilters('financial'),region:'충남',status:'urgent',query:'  스마트팜  ',tag:'#기술',matched:true};
  const chips=filterChips(filters);
  assert.deepEqual(chips.map(c=>[c.key,c.value]),[['region','충남'],['category','금융'],['status','7일 내 마감'],['query','스마트팜'],['tag','#기술'],['matched','조건 불일치 제외']]);
  assert.deepEqual(filterChips(metricFilters('all')).map(c=>c.value),['전체·지난 공고']);
});
test('complete snapshot serves search, canonical aliases, archive and PDF without server calls',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'pages-catalog-')),root=join(dir,'data');
  try{
    await mkdir(join(root,'pdf'),{recursive:true});await writeFile(join(root,'pdf','sample.pdf'),'%PDF-1.4 sample');
    const npay=[notice('NPAY_a','공통 공고'),notice('NPAY_b','충남 기술')];
    const bizinfo=[notice('PBLN_a','공통 공고',{sourceProvider:'bizinfo',attachments:[{name:'공고.pdf',url:'https://example.com/file.pdf',pdf:true,cachedUrl:'data/pdf/sample.pdf'}]})];
    const old=notice('NPAY_old','사라진 공고');
    const manifest=await exportCatalog(root,{npay,bizinfo,previous:[old],expected:2,expectedActive:2,completed:'2026-10-12T11:00:00Z',bizinfoLastSuccess:'2026-10-12T11:00:00Z'});
    assert.equal(manifest.status.count,2);assert.equal(manifest.aliases.NPAY_a,'PBLN_a');
    const requests=[],base=new URL('file://'+dir+'/');
    const client=createStaticClient({base,reader:async url=>{requests.push(url);const bytes=await readFile(fileURLToPath(url));return JSON.parse(url.endsWith('.gz')?gunzipSync(bytes):bytes);}});
    const search=await client.api('/api/programs',{filters:{status:'all'},page:1,pageSize:12});assert.equal(search.total,2);assert.ok(search.programs[0].detailPending===false);
    const saved=await client.api('/api/notices',{ids:['NPAY_a','NPAY_old','missing']});assert.equal(saved.programs.length,2);assert.equal(saved.programs[0].requestedId,'NPAY_a');assert.equal(saved.programs[1].archived,true);
    assert.equal(await client.preview('NPAY_a',0),new URL('data/pdf/sample.pdf',base).href);
    assert.equal(requests.some(x=>x.includes('/api/')),false);
    const before=await readFile(join(root,'manifest.json'),'utf8');
    await assert.rejects(exportCatalog(root,{npay:npay.slice(0,1),bizinfo,expected:2,expectedActive:2,completed:'2026-10-13T11:00:00Z'}));
    assert.equal(await readFile(join(root,'manifest.json'),'utf8'),before);
    await writeFile(join(root,manifest.version,'index.json.gz'),'corrupted');await assert.rejects(verifyCatalog(root,manifest));
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('collection rejects wrong page numbers, duplicate IDs and changing source counts',async()=>{
  const read=async path=>path.includes('/count')?2:{number:0,size:500,content:[{subventionId:'a'},{subventionId:'a'}]};
  await assert.rejects(collectNpay(read),/누락/);
  await assert.rejects(collectNpay(async path=>path.includes('/count')?1:{number:3,content:[{subventionId:'a'}]}),/번호/);
  let countCalls=0;await assert.rejects(collectNpay(async path=>path.includes('/count')?(++countCalls===3?2:1):{number:0,size:500,content:[{subventionId:'a'}]}),/원천 변경/);
});

class TestDialog extends EventTarget {
  open=false;innerHTML='';scrollTop=0;className='';
  showModal(){this.open=true;}
  close(){this.open=false;queueMicrotask(()=>this.dispatchEvent(new Event('close')));}
  getBoundingClientRect(){return {left:100,right:700,top:100,bottom:600};}
}
function dialogFixture(){
  const parent=new TestDialog(),viewer=new TestDialog(),controller=new AbortController();
  let parentCloses=0,viewerCloses=0,focusOptions;
  const trigger={isConnected:true,focus:options=>{focusOptions=options;}};
  const layers=createDialogLayers(parent,viewer,{onViewerClose:()=>{viewerCloses++;controller.abort();},onParentClose:()=>parentCloses++});
  parent.innerHTML='<article>Notice details and attachment buttons</article>';parent.scrollTop=720;parent.showModal();
  return {parent,viewer,layers,trigger,controller,state:()=>({parentCloses,viewerCloses,focusOptions})};
}
test('viewer close and Escape preserve the notice contents, scroll and focus',async()=>{
  for(const method of ['button','escape','native']){
    const {parent,viewer,layers,trigger,controller,state}=dialogFixture();
    const html=parent.innerHTML;layers.openViewer('<iframe></iframe>','document-dialog',trigger);
    assert.equal(parent.open,true);assert.equal(viewer.open,true);
    if(method==='button')layers.closeViewer();
    if(method==='escape'){const cancel=new Event('cancel',{cancelable:true});viewer.dispatchEvent(cancel);assert.equal(cancel.defaultPrevented,true);}
    if(method==='native')viewer.close();
    await Promise.resolve();
    assert.equal(viewer.open,false);assert.equal(viewer.innerHTML,'');assert.equal(parent.open,true);
    assert.equal(parent.innerHTML,html);assert.equal(parent.scrollTop,720);
    assert.equal(controller.signal.aborted,true);assert.deepEqual(state(),{parentCloses:0,viewerCloses:1,focusOptions:{preventScroll:true}});
  }
});
test('backdrop closes only the viewer, then the parent can close normally',async()=>{
  const {parent,viewer,layers,trigger,state}=dialogFixture();layers.openViewer('document','document-dialog',trigger);
  const inside=new Event('click');Object.assign(inside,{clientX:200,clientY:200});viewer.dispatchEvent(inside);assert.equal(viewer.open,true);
  const outside=new Event('click');Object.assign(outside,{clientX:20,clientY:20});viewer.dispatchEvent(outside);
  await Promise.resolve();assert.equal(viewer.open,false);assert.equal(parent.open,true);assert.equal(state().parentCloses,0);
  parent.dispatchEvent(new Event('cancel',{cancelable:true}));await Promise.resolve();assert.equal(parent.open,false);assert.equal(state().parentCloses,1);
});
test('navigation closes both layers and a delayed close cannot clear a new viewer',async()=>{
  const {parent,viewer,layers,trigger,state}=dialogFixture();layers.openViewer('first','document-dialog',trigger);
  layers.closeViewer(false);layers.openViewer('second','document-dialog',trigger);await Promise.resolve();
  assert.equal(viewer.open,true);assert.equal(viewer.innerHTML,'second');assert.equal(parent.scrollTop,720);
  layers.closeParent();await Promise.resolve();assert.equal(viewer.open,false);assert.equal(parent.open,false);
  assert.equal(state().parentCloses,1);assert.equal(state().viewerCloses,2);
  layers.openViewer('late','document-dialog',trigger);assert.equal(viewer.open,false);
});
