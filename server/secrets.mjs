function bytes(hex){if(!/^[\da-f]{64}$/i.test(hex||''))throw Error('서버의 인증키 암호화 설정을 확인하세요.');return Uint8Array.from(hex.match(/../g),s=>parseInt(s,16));}
const enc=new TextEncoder(),dec=new TextDecoder();
export async function seal(value,master){
  const key=await crypto.subtle.importKey('raw',bytes(master),'AES-GCM',false,['encrypt']);const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(value)));
  return JSON.stringify({v:1,iv:Array.from(iv),data:Array.from(ciphertext)});
}
export async function unseal(value,master){
  const key=await crypto.subtle.importKey('raw',bytes(master),'AES-GCM',false,['decrypt']);const v=JSON.parse(value);
  return dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(v.iv)},key,new Uint8Array(v.data)));
}
