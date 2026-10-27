/* バージョン付きシェルキャッシュ。更新が即座に伝わるよう古い世代を削除する。 */
const CACHE='negative-weather-shell-0.5.0';
const ASSETS=['./','./index.html','./style.css?v=0.5','./app.js?v=0.5','./audio-engine.js?v=0.5','./visual-engine.js?v=0.5','./manifest.webmanifest','./assets/icon-192.png','./assets/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('negative-weather-')&&k!==CACHE).map(k=>caches.delete(k)))),
  self.clients.claim()
])));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const clone=response.clone();caches.open(CACHE).then(c=>c.put(event.request,clone));}
    return response;
  }).catch(()=>caches.match(event.request)));
});
