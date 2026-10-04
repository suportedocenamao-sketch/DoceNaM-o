// Service worker: guarda a "casca" do app para abrir rápido e funcionar como app instalado.
// Ao mudar arquivos, troque a versão abaixo para os celulares pegarem a atualização.
const VERSAO = 'dnm-v1';
const ARQUIVOS = ['./', 'index.html', 'agenda.html', 'css/app.css', 'js/config.js', 'js/vendor/supabase.js', 'js/db.js', 'js/app.js', 'js/agenda.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Supabase e fontes vão direto para a rede
  // rede primeiro (dados sempre atuais); se cair a internet, usa o que está guardado
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(VERSAO).then(ca => ca.put(e.request, c)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
