import {readCompressed} from './static-client.js';
import {completeIndex,searchCatalog} from './static-search.js';
let indexPromise,indexUrl;
self.onmessage=async({data})=>{
  try{if(indexUrl!==data.indexUrl){indexUrl=data.indexUrl;indexPromise=readCompressed(indexUrl).then(x=>x.programs.map(completeIndex)).catch(error=>{indexPromise=null;indexUrl=null;throw error;});}self.postMessage({id:data.id,result:searchCatalog(await indexPromise,data.input)});}
  catch(error){self.postMessage({id:data.id,error:error.message});}
};
