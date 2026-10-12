import {createStaticClient} from './static-client.js';
const client=createStaticClient({workerFactory:typeof Worker==='undefined'?undefined:()=>new Worker(new URL('./search-worker.js',import.meta.url),{type:'module'})});
export const STATIC_MODE=true;
export const api=(path,body,signal)=>client.api(path,body,signal);
export const refreshData=()=>client.refresh();
export const attachmentPreview=(id,index)=>client.preview(id,index);
export function pageSlice(list,page=1,pageSize=12){const pages=Math.max(1,Math.ceil(list.length/pageSize));page=Math.max(1,Math.min(pages,page));return {programs:list.slice((page-1)*pageSize,page*pageSize),total:list.length,page,pages,pageSize};}
