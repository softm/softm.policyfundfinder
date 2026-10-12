import {shardFor,completeIndex,searchCatalog} from './static-search.js';
export async function readCompressed(url,{signal,cache='default'}={}){
  const response=await fetch(url,{signal,cache});
  if(!response.ok)throw Error('공고 자료를 불러오지 못했습니다. 잠시 후 새로고침하세요.');
  if(!String(url).endsWith('.gz'))return response.json();
  if(typeof DecompressionStream==='undefined')throw Error('최신 브라우저에서 공고 검색을 이용해 주세요.');
  return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
}
export function createStaticClient({base=new URL('./',import.meta.url),reader=readCompressed,workerFactory}={}){
  let manifestPromise,indexPromise,worker,sequence=0;const pending=new Map(),shards=new Map();
  const read=(path,options)=>reader(new URL(path,base).href,options);
  const manifest=()=>manifestPromise||(manifestPromise=read('data/manifest.json',{cache:'no-store'}).catch(error=>{manifestPromise=null;throw error;}));
  const index=async()=>indexPromise||(indexPromise=(async()=>{const m=await manifest();const v=await read(`data/${m.version}/index.json.gz`);return {...v,programs:v.programs.map(completeIndex)};})().catch(error=>{indexPromise=null;throw error;}));
  async function notice(id){const m=await manifest();const canonical=m.aliases?.[id]||id;const shard=shardFor(canonical);if(!shards.has(shard))shards.set(shard,read(`data/${m.version}/details/${shard}.json.gz`).catch(error=>{shards.delete(shard);throw error;}));const p=(await shards.get(shard))[canonical];while(shards.size>8)shards.delete(shards.keys().next().value);return p?{...p,staticCatalog:true,detailPending:false,...(id!==canonical?{requestedId:id}:{})}:null;}
  function workerSearch(input,signal){
    if(!worker){worker=workerFactory();worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;pending.delete(data.id);p.cleanup();data.error?p.reject(Error(data.error)):p.resolve(data.result);};worker.onerror=()=>{for(const p of pending.values()){p.cleanup();p.reject(Error('검색을 불러오지 못했습니다. 새로고침하세요.'));}pending.clear();worker.terminate();worker=null;};}
    return new Promise((resolve,reject)=>{const id=++sequence;const abort=()=>{pending.delete(id);reject(new DOMException('검색 취소','AbortError'));};const cleanup=()=>signal?.removeEventListener('abort',abort);if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});pending.set(id,{resolve,reject,cleanup});manifest().then(m=>{if(pending.has(id))worker.postMessage({id,input,indexUrl:new URL(`data/${m.version}/index.json.gz`,base).href});}).catch(error=>{pending.delete(id);cleanup();reject(error);});});
  }
  return {
    async api(path,body,signal){
      if(path==='/api/data-status'){const m=await manifest();return {...m.status,static:true,stale:Date.now()-Date.parse(m.status.lastSuccess)>36*3600000};}
      if(path==='/api/programs'){const result=await (workerFactory?workerSearch(body,signal):searchCatalog((await index()).programs,body));const full=await Promise.all(result.programs.map(p=>notice(p.id)));if(signal?.aborted)throw new DOMException('검색 취소','AbortError');return {...result,programs:full.map((p,i)=>p||result.programs[i])};}
      if(path==='/api/notices')return {programs:(await Promise.all((body.ids||[]).map(notice))).filter(Boolean)};
      if(path==='/api/notice-detail'){const program=await notice(body.id);if(!program)throw Error('이 수집본에 공고가 없습니다. 공식 원문을 확인하세요.');return {program};}
      throw Error('공고 갱신은 GitHub Actions에서 실행합니다.');
    },
    async refresh(){manifestPromise=null;indexPromise=null;shards.clear();worker?.terminate();worker=null;for(const p of pending.values()){p.cleanup();p.reject(new DOMException('자료 갱신','AbortError'));}pending.clear();return this.api('/api/data-status');},
    async preview(id,fileIndex){const p=await notice(id),file=p?.attachments?.[fileIndex];return file?.cachedUrl?new URL(file.cachedUrl,base).href:null;}
  };
}
