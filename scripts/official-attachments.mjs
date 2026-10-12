import {plain} from '../server/bizinfo.mjs';
import {normalizeAttachments,fileKey,officialViewer} from '../public/attachment-links.js';
const supported=new Set(['hwp','hwpx','pdf','doc','docx','xls','xlsx','ppt','pptx','txt','rtf','odt','ods','odp','png','jpg','jpeg','gif','tif','tiff']);
export function parseOfficialAttachments(html){
  const files=[];
  for(const match of String(html).matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)){
    const block=match[1],href=block.match(/href=["']([^"']*\/cmm\/fms\/fileDown\.do\?[^"']+)["']/i)?.[1];if(!href)continue;
    const url=new URL(href.replaceAll('&amp;','&'),'https://www.bizinfo.go.kr').href;if(!fileKey(url))continue;
    const label=plain(block.match(/class=["']file_name["'][^>]*>([\s\S]*?)<\/div>/i)?.[1])||'첨부파일';
    const call=block.match(/fileBlank\(\s*((?:'[^']*'\s*(?:\+\s*)?)+)\s*,\s*'([^']*)'\s*\)/);
    let viewerUrl;
    if(call){const physical=[...call[1].matchAll(/'([^']*)'/g)].map(m=>m[1]).join('');const ext=label.split('.').pop().toLowerCase();
      if(physical.startsWith('/webapp/upload/bizinfo/file/')&&!physical.includes('..')&&supported.has(ext)){const u=new URL('https://www.bizinfo.go.kr/DG_viewer/viewer/document/docviewer.do');u.searchParams.set('filepath',physical.replace('/webapp/upload',''));u.searchParams.set('viewerSelect','image');u.searchParams.set('fileext',ext);u.searchParams.set('filename',label);viewerUrl=officialViewer(u.href);}
    }
    files.push({name:label,url,downloadUrl:url,pdf:/\.pdf$/i.test(label),...(viewerUrl?{viewerUrl}:{})});
  }return normalizeAttachments(files);
}
export async function fetchOfficialAttachments(program,fetcher=fetch){
  const u=new URL(program.sourceUrl);if(u.origin!=='https://www.bizinfo.go.kr'||u.pathname!=='/sii/siia/selectSIIA200Detail.do')return [];
  const r=await fetcher(u,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('공식 첨부 목록 연결 실패');return parseOfficialAttachments(await r.text());
}
