// LifeChange service worker: офлайн-кэш и приём push-сообщений
// v4: главная страница открывается мгновенно из копии в телефоне, свежая версия скачивается в фоне (видна со следующего запуска).
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
    // свежая версия: качаем в фоне и кладём в копию на следующий запуск
    const net = fetch(req).then(r => {
      if (r && r.ok && r.type === 'basic' && !r.redirected) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(MAIN_KEY, copy)); }
      return r;
    });
    e.waitUntil(net.then(() => {}, () => {}));
    e.respondWith(caches.match(MAIN_KEY).then(hit => hit || caches.match('./')).then(hit => hit || net.catch(() => caches.match('index.html'))));
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
