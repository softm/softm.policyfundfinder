export function safeAttachmentUrl(value){try{const u=new URL(String(value));return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
export function downloadUrl(value){const url=safeAttachmentUrl(value);if(!url)return null;const u=new URL(url);if(u.protocol==='https:'&&u.hostname==='www.bizinfo.go.kr'&&u.pathname==='/cmm/fms/getImageFile.do')u.pathname='/cmm/fms/fileDown.do';return u.href;}
export function fileKey(value){const url=safeAttachmentUrl(value);if(!url)return null;const u=new URL(url),id=u.searchParams.get('atchFileId'),sn=u.searchParams.get('fileSn');return u.hostname==='www.bizinfo.go.kr'&&/^FILE_[\w-]+$/.test(id||'')&&/^\d+$/.test(sn||'')?id+'|'+sn:null;}
export function officialViewer(value){const url=safeAttachmentUrl(value);if(!url)return null;const u=new URL(url),path=u.searchParams.get('filepath')||'';return u.origin==='https://www.bizinfo.go.kr'&&u.pathname==='/DG_viewer/viewer/document/docviewer.do'&&path.startsWith('/bizinfo/file/')&&!path.includes('..')?u.href:null;}
export function normalizeAttachments(files=[]){
  const result=[],seen=new Set();
  for(const file of files){const urls=String(file.url||'').split(/@(?=https?:\/\/)/),names=urls.length>1?String(file.name||'').split('@'):[file.name];
    for(let i=0;i<urls.length;i++){const url=safeAttachmentUrl(urls[i]);if(!url||seen.has(url))continue;seen.add(url);const name=String(names.length===urls.length?names[i]:file.kind||'첨부파일').trim()||'첨부파일';const f={...file,name,url,pdf:/\.pdf$/i.test(name),downloadUrl:downloadUrl(url)};if(urls.length>1){delete f.cachedUrl;delete f.viewerUrl;}if(f.viewerUrl)f.viewerUrl=officialViewer(f.viewerUrl);result.push(f);}
  }return result;
}
export function mergeAttachmentViews(files,views=[]){const normalized=normalizeAttachments(files);const byKey=new Map(views.map(f=>[fileKey(f.url),f]).filter(([key])=>key));return normalized.map(f=>{const view=byKey.get(fileKey(f.url));return view?{...f,...view,url:f.url,downloadUrl:downloadUrl(view.url||f.url),cachedUrl:f.cachedUrl}:f;});}
