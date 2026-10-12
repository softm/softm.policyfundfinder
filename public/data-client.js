export async function api(path,body,signal){
  let response;try{response=await fetch(path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal,cache:'no-store'});}catch(err){if(err.name==='AbortError')throw err;throw Error('서버에 연결하지 못했습니다. 인터넷 연결을 확인하세요.');}
  let value;try{value=await response.json();}catch{throw Error('앱 서버 응답을 확인하지 못했습니다. 로그인 상태를 확인하고 새로고침하세요.');}
  if(!response.ok)throw Error(value.error||'공고 데이터를 불러오지 못했습니다.');return value;
}
export function pageSlice(list,page=1,pageSize=12){const pages=Math.max(1,Math.ceil(list.length/pageSize));page=Math.max(1,Math.min(pages,page));return {programs:list.slice((page-1)*pageSize,page*pageSize),total:list.length,page,pages,pageSize};}
