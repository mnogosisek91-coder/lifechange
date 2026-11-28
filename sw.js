// LifeChange service worker: офлайн-кэш и приём push-сообщений
// v5: главная страница открывается мгновенно из копии в телефоне, свежая версия скачивается в фоне;
//     если она новее — страница сама перезагружается (пока человек ничего не нажал) или показывает плашку «Обновить».
//     Все остальные страницы (игра, зелья, психолог, восстановление, uz-страницы) работают как раньше: сначала сеть.
const CACHE = 'lifechange-v4';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
const SCOPE = new URL(self.registration.scope).pathname;          // обычно '/'
const MAIN_KEY = new URL('index.html', self.registration.scope).href; // одна копия главной
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const isMain = req.mode === 'navigate' && (url.pathname === SCOPE || url.pathname === SCOPE + 'index.html');
  if (isMain) {
    // v5: копия открывается мгновенно; свежая версия качается в фоне мимо 10-минутного кэша GitHub.
    // Если она отличается от копии, кладём её в кэш и сообщаем странице (та перезагрузится сама или покажет «Обновить»).
    const netP = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
    e.respondWith(caches.match(MAIN_KEY).then(hit => hit || caches.match('./')).then(hit => hit || netP.then(r => r.clone()).catch(() => caches.match('index.html'))));
    e.waitUntil((async () => {
      let r; try { r = await netP; } catch (x) { return; }
      if (!(r && r.ok && r.type === 'basic' && !r.redirected)) return;
      const old = await caches.match(MAIN_KEY);
      let changed = false;
      if (old) {
        const ea = old.headers.get('etag'), eb = r.headers.get('etag');
        if (!(ea && eb && ea === eb)) { try { changed = (await old.text()) !== (await r.clone().text()); } catch (x) {} }
      }
      const c = await caches.open(CACHE); await c.put(MAIN_KEY, r);
      if (changed) { const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true }); list.forEach(cl => { try { cl.postMessage({ type: 'lc-update' }); } catch (x) {} }); }
    })().catch(() => {}));
    return;
  }
  const fresh = req.mode === 'navigate' || req.url.includes('notifications.json');
  if (fresh) {
    e.respondWith(fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return r; }).catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
  } else {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(n => { if (n.ok) { const copy = n.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return n; })));
  }
});
// Push с сервера (подключается позже): показываем уведомление
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) {}
  e.waitUntil(self.registration.showNotification(d.title || 'LifeChange', { body: d.body || '', icon: 'icon-192.png', data: { url: d.url || './' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(list => { for (const c of list) { if ('focus' in c) return c.focus(); } return clients.openWindow((e.notification.data && e.notification.data.url) || './'); }));
});
