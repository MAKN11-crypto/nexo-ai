const CACHE = 'bit-by-orbit-shell-v12';
const SHELL = [
  '/',
  '/style.css?v=12',
  '/app.js?v=12',
  '/manifest.webmanifest?v=12',
  '/icon.png',
  '/ai-brain.svg',
  '/agents/researcher.svg',
  '/agents/builder.svg',
  '/agents/strategist.svg',
  '/agents/creative.svg',
];
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL))));
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('bit-by-orbit-shell-') && key !== CACHE).map((key) => caches.delete(key))))));
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok && url.origin === self.location.origin) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  })));
});
