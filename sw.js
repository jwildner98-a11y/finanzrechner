// Offline-first: alle App-Dateien werden beim Installieren zwischengespeichert.
const CACHE = 'finanzrechner-v3';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'cloud.js', 'receipt.js', 'vendor/pdfjs/pdf.min.js', 'vendor/pdfjs/pdf.worker.min.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

const OPTIONAL = ['vendor/tesseract/tesseract.min.js', 'vendor/tesseract/worker.min.js', 'vendor/tesseract/tesseract-core-lstm.wasm.js', 'vendor/tesseract/tesseract-core-simd-lstm.wasm.js', 'vendor/tesseract/lang/deu.traineddata.gz'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(FILES);
    /* Texterkennung (ca. 9 MB): bestmöglich vorab laden, Fehler ignorieren – wird sonst beim ersten Gebrauch gecacht */
    await Promise.allSettled(OPTIONAL.map(u => c.add(u)));
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(req, copy));
    return res;
  }).catch(() => caches.match('index.html'))));
});
