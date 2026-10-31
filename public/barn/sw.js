/** Cache ONLY public app shell files. Never cache sessions, school APIs or private responses. */
const CACHE='skoleuka-child-shell-v1';
const FILES=['/barn/','/barn/index.html','/barn/child.css','/barn/child.mjs',
 '/barn/manifest.webmanifest','/barn/icon-192.png','/barn/icon-512.png',
 '/site-config.mjs','/shared/calendar.mjs','/shared/family-core.mjs',
 '/shared/selection.mjs','/shared/homework-view.mjs','/shared/family-activities.mjs'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))
 .then(()=>self.skipWaiting()).catch(()=>{}));});
self.addEventListener('activate',event=>{event.waitUntil(
 caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE&&key.startsWith('skoleuka-child-'))
  .map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 // Pairing credentials, all API responses and document requests must be network-only.
 if(url.search||url.pathname.startsWith('/api/')||url.pathname.startsWith('/.netlify/'))return;
 if(!FILES.includes(url.pathname))return;
 event.respondWith(fetch(event.request).then(async response=>{
  if(response.ok){const cache=await caches.open(CACHE);await cache.put(event.request,response.clone());}
  return response;
 }).catch(()=>caches.match(event.request)));
});
