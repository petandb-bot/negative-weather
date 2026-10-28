const CACHE='incident-archive-v0298';
const CORE=['./','./index.html','./style.css?v=0298','./sketch.js?v=0298','./engines/chemical.js?v=0298','./engines/leak.js?v=0298','./manifest.webmanifest?v=0298','./icons/icon-180.png','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('incident-archive-') && key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET') return;
 const url=new URL(req.url);
 if(url.origin!==self.location.origin)return;
 const code=req.mode==='navigate'||/\/(index\.html|sketch\.js|style\.css|sw\.js|chemical\.js|leak\.js)$/.test(url.pathname);
 if(code){
  event.respondWith(fetch(req).then(res=>{
   if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{});}
   return res;
  }).catch(()=>caches.match(req).then(c=>c||caches.match('./index.html'))));
 }else{
  event.respondWith(caches.match(req).then(c=>c||fetch(req)));
 }
});
