// Preview only official Bizinfo files already attached to a stored notice.
export async function attachmentKey(file){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(file.url));return 'notice-pdf/'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')+'.pdf';}
function pdfResponse(body,file){return new Response(body,{headers:{'Content-Type':'application/pdf','Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(file.name||'notice.pdf')}`,'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}});}
export async function storePdf(file,data,bucket){
  if(!bucket)return {error:'공고문 저장소를 준비하고 있습니다.',status:503};
  if(data.byteLength>20*1024*1024)return {error:'20MB 이하 PDF만 저장할 수 있습니다.',status:413};
  if(!new TextDecoder().decode(new Uint8Array(data).slice(0,1024)).includes('%PDF-'))return {error:'PDF 형식을 확인할 수 없습니다.',status:422};
  await bucket.put(await attachmentKey(file),data,{httpMetadata:{contentType:'application/pdf'},customMetadata:{sourceUrl:file.url,name:file.name||'notice.pdf'}});
  return {ok:true,bytes:data.byteLength};
}
export async function pdfPreview(file,fetcher=fetch,bucket){
  if(!file?.pdf)return {error:'PDF 첨부파일을 선택하세요.',status:400};
  let u;try{u=new URL(file.url);}catch{return {error:'첨부파일 주소를 확인할 수 없습니다.',status:400};}
  const allowed=(u.hostname==='www.bizinfo.go.kr'&&['/cmm/fms/getImageFile.do','/cmm/fms/fileDown.do'].includes(u.pathname))||(u.hostname==='www.smes.go.kr'&&u.pathname==='/main-batch/comm/getFile');
  if(u.protocol!=='https:'||!allowed||u.username||u.password)return {error:'이 파일은 공식 원본 링크에서 확인하세요.',status:400};
  if(bucket){const cached=await bucket.get(await attachmentKey(file));if(cached)return pdfResponse(cached.body,file);}
  let upstream;try{upstream=await fetcher(u,{redirect:'error',headers:{Accept:'application/pdf, application/octet-stream'},signal:AbortSignal.timeout(45000)});}catch{return {error:'공고문 제공처 연결이 지연됩니다. 공식 원본 링크를 이용하세요.',status:502};}
  if(!upstream.ok||!upstream.body)return {error:'공고문을 불러오지 못했습니다. 공식 원본 링크를 이용하세요.',status:502};
  const limit=20*1024*1024,reader=upstream.body.getReader(),chunks=[];let size=0;
  if(Number(upstream.headers.get('content-length')||0)>limit){await reader.cancel();return {error:'20MB를 넘는 파일은 공식 원본 링크에서 확인하세요.',status:413};}
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();return {error:'20MB를 넘는 파일은 공식 원본 링크에서 확인하세요.',status:413};}chunks.push(value);}}
  catch{return {error:'공고문 다운로드가 중단됐습니다. 공식 원본 링크를 이용하세요.',status:502};}
  const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
  if(!new TextDecoder().decode(data.slice(0,1024)).includes('%PDF-'))return {error:'PDF 형식을 확인할 수 없습니다. 공식 원본 링크를 이용하세요.',status:422};
  if(bucket){try{await storePdf(file,data,bucket);}catch{/* Valid upstream PDF remains viewable when cache storage fails. */}}
  return pdfResponse(data,file);
}
