const CACHE='policyfundfinder-root-v1';
const ASSETS=['./','./index.html','./public/styles.css','./public/app.js','./public/core.js','./public/data.js','./public/data-client.js','./public/notice-view.js','./public/static-client.js','./public/static-search.js','./public/search-worker.js','./public/icon.svg','./public/icon-192.png','./public/icon-512.png','./public/manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==self.location.origin||!ASSETS.some(p=>new URL(p,self.registration.scope).pathname===u.pathname))return;
  event.respondWith(fetch(event.request).then(response=>{if(response.ok&&!response.redirected&&!/login|auth/i.test(response.url)&&(!/\.js$/.test(u.pathname)||(response.headers.get('content-type')||'').includes('javascript'))){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(u.pathname,copy)));}return response;}).catch(async()=>await caches.match(u.pathname)||await caches.match('./index.html')));
});
