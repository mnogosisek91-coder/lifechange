/* Кэш картинок игры. Имена файлов в assets/ содержат хэш содержимого, поэтому кэшируем навсегда. */
var C='ldd-assets-v1';
self.addEventListener('install',function(){self.skipWaiting()});
self.addEventListener('activate',function(e){e.waitUntil(clients.claim())});
self.addEventListener('fetch',function(e){
  var r=e.request,u=new URL(r.url);
  if(r.method!=='GET'||u.origin!==location.origin||u.pathname.indexOf('/assets/')<0)return;
  e.respondWith(caches.open(C).then(function(c){return c.match(r).then(function(h){
    return h||fetch(r).then(function(x){if(x.ok)c.put(r,x.clone());return x})})}))});
