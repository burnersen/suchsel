/* Suchsel – Service Worker: hält beim ersten Besuch die ganze App vor (Seite, CSS, JavaScript, Symbole, Wortschatz aller
   Sprachen). Danach startet Suchsel aus dem Vorrat, auch ohne Netz. Eine neue Version erkennt der Browser an dieser Datei,
   holt alles einmal frisch und räumt den alten Vorrat weg. SU_V und SU_FILES setzt index.php davor.
   Die Fragen an den Server (wie viele Rätsel noch frei sind) gehen nie über den Vorrat. */
const CACHE = 'suchsel-' + SU_V;
const SCOPE = new URL(self.registration.scope);

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => Promise.all(SU_FILES.map(u =>
        fetch(u, { cache: 'no-cache', credentials: 'same-origin' }).then(r => { if (r.ok) return c.put(u === './' ? './' : u, r); }).catch(() => {})
    ))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
    e.waitUntil(caches.keys()
        .then(keys => Promise.all(keys.filter(k => k.startsWith('suchsel-') && k !== CACHE).map(k => caches.delete(k))))
        .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== location.origin) return;
    const action = url.searchParams.get('action');
    // Nur die Seite von Suchsel selbst, nicht etwa einen Installer, der im selben Ordner liegt
    const isPage = req.mode === 'navigate' && !action && (url.pathname === SCOPE.pathname || url.pathname === SCOPE.pathname + 'index.php');
    const isFile = action === 'asset' || action === 'words' || action === 'manifest';
    if (!isPage && !isFile) return;
    if (isPage) {
        // Aus dem Vorrat starten, im Hintergrund die Seite auffrischen
        e.respondWith(caches.open(CACHE).then(c => c.match('./').then(hit => {
            const net = fetch(req).then(r => { if (r.ok) c.put('./', r.clone()); return r; });
            if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
            return net.catch(() => Response.error());
        })));
        return;
    }
    e.respondWith(caches.open(CACHE).then(c => c.match(req).then(hit => hit || fetch(req).then(r => {
        if (r.ok && url.searchParams.has('v')) c.put(req, r.clone());
        return r;
    }))));
});
