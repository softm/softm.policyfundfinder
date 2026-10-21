import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {adfitConfig} from '../public/adfit-config.js';
import {isAllowedAdHost,isValidAdSlot,chooseAnchorSlot,listInsertionIndex} from '../public/adfit.js';

test('AdFit live requests are restricted to the exact registered production host',()=>{
  const hosts=adfitConfig.allowedHosts;
  assert.equal(isAllowedAdHost('policyfundfinder.designboard.net',hosts),true);
  assert.equal(isAllowedAdHost('POLICYFUNDFINDER.DESIGNBOARD.NET',hosts),true);
  for(const host of ['localhost','127.0.0.1','softm.github.io','homecare.designboard.net','policyfundfinder.designboard.net.example.com','preview.policyfundfinder.designboard.net','']) {
    assert.equal(isAllowedAdHost(host,hosts),false,host);
  }
});

test('unissued and malformed units never become live placements',()=>{
  for(const unit of ['',undefined,'DAN-','example','DAN-placeholder_123','<script>']) {
    assert.equal(isValidAdSlot({unit,width:320,height:50}),false);
  }
  assert.equal(isValidAdSlot({unit:'',width:320,height:50},true),true);
  assert.equal(isValidAdSlot({unit:adfitConfig.list.unit,width:319,height:50}),false);
  assert.equal(isValidAdSlot(null),false);
});

test('anchor selection never scales or crops a fixed size banner',()=>{
  const anchor=adfitConfig.anchor;
  for(const width of [0,280,319,NaN,Infinity]) assert.equal(chooseAnchorSlot(anchor,width),null);
  for(const width of [320,336,366,727]) {
    const selected=chooseAnchorSlot(anchor,width);
    assert.equal(selected.name,'mobile');assert.equal(selected.width,320);assert.equal(selected.height,50);
  }
  for(const width of [728,900,1300]) assert.equal(chooseAnchorSlot(anchor,width).name,'desktop');
  const onlyMobile={...anchor,desktop:{...anchor.desktop,unit:''}};
  assert.equal(chooseAnchorSlot(onlyMobile,1200).name,'mobile');
});

test('an inline placement always has real notices before and after it',()=>{
  for(const count of [0,1,5,6,-1,NaN,6.5]) assert.equal(listInsertionIndex(count,adfitConfig.list),-1);
  for(const count of [7,12,24,50]) assert.equal(listInsertionIndex(count,adfitConfig.list),6);
  assert.equal(listInsertionIndex(6,{after:6,minItems:2}),-1);
  assert.equal(listInsertionIndex(8,{after:8,minItems:2}),-1);
  assert.equal(listInsertionIndex(9,{after:8,minItems:2}),8);
});

test('issued units are unique and use the sizes confirmed in AdFit management',()=>{
  const slots=[adfitConfig.anchor.mobile,adfitConfig.anchor.desktop,adfitConfig.list];
  assert.equal(new Set(slots.map(slot=>slot.unit)).size,3);
  slots.forEach(slot=>assert.equal(isValidAdSlot(slot),true));
  assert.deepEqual(slots.map(({width,height})=>[width,height]),[[320,50],[728,90],[320,100]]);
  assert.equal(adfitConfig.scriptUrl,'https://t1.kakaocdn.net/kas/static/ba.min.js');
});

test('both Pages entry points include ad styles and offline support includes local modules only',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const sw=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');
  assert.match(html,/\.\/public\/adfit\.css/);
  assert.match(html.replaceAll('./public/','./'),/\.\/adfit\.css/);
  for(const file of ['adfit.js','adfit-config.js','adfit.css']) assert.ok(sw.includes(`'./${file}'`));
  assert.equal(sw.includes('ba.min.js'),false);
});
