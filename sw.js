'use strict';
/* Passjäger Service Worker — Offline-Shell, Tile-Cache, Share-Target. */

const VERSION = 'v18';
const SHELL_CACHE = 'pj-shell-' + VERSION;
const TILE_CACHE = 'pj-tiles';
const SHARE_CACHE = 'pj-share-in';
const POI_CACHE = 'pj-pois';
const POI_LIMIT = 200;
const TILE_LIMIT = 300;

const SHELL = [
  '/',
  '/index.html',
  '/app.js?v=18',
  '/passlib.js?v=18',
  '/styles.css?v=18',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/favicon.ico',
  '/vendor/leaflet/leaflet.js',
  '/vendor/leaflet/leaflet.css',
  '/vendor/phosphor/regular.css',
  '/vendor/phosphor/fill.css',
  '/vendor/phosphor/Phosphor.woff2',
  '/vendor/phosphor/Phosphor-Fill.woff2',
  '/vendor/inter/inter-var-latin.woff2',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => k.startsWith('pj-shell-') && k !== SHELL_CACHE)
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

async function trimTiles() { return trimCache(TILE_CACHE, TILE_LIMIT); }
async function trimCache(name, limit) {
  const c = await caches.open(name);
  const keys = await c.keys();
  if (keys.length > limit) {
    // älteste zuerst löschen (Insertion-Reihenfolge)
    await Promise.all(keys.slice(0, keys.length - limit).map((k) => c.delete(k)));
  }
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  /* Share-Target: GPX aus dem Android-Share-Sheet entgegennehmen */
  if (e.request.method === 'POST' && url.pathname === '/share-target') {
    e.respondWith((async () => {
      try {
        const form = await e.request.formData();
        const file = form.get('gpx') || [...form.values()].find((v) => v instanceof File);
        if (file) {
          const c = await caches.open(SHARE_CACHE);
          await c.put('/shared-gpx', new Response(file, {
            headers: { 'X-File-Name': encodeURIComponent(file.name || 'tour.gpx') },
          }));
        }
      } catch (err) { /* leer weiterleiten */ }
      return Response.redirect('/?shared=1', 303);
    })());
    return;
  }

  if (e.request.method !== 'GET') return; // Overpass-POST etc. durchreichen

  /* Nominatim/Overpass nie anfassen */
  if (/nominatim|overpass/.test(url.hostname)) return;

  /* CARTO-Tiles: stale-while-revalidate mit Limit */
  if (url.hostname.endsWith('cartocdn.com')) {
    e.respondWith((async () => {
      const c = await caches.open(TILE_CACHE);
      const hit = await c.match(e.request);
      const fresh = fetch(e.request).then((res) => {
        if (res.ok) { c.put(e.request, res.clone()); trimTiles(); }
        return res;
      }).catch(() => hit);
      return hit || fresh;
    })());
    return;
  }

  /* POI-Kacheln: stale-while-revalidate mit Limit (nicht precached) */
  if (url.origin === self.location.origin && url.pathname.startsWith('/pois/')) {
    e.respondWith((async () => {
      const c = await caches.open(POI_CACHE);
      const hit = await c.match(e.request);
      const fresh = fetch(e.request).then((res) => {
        if (res.ok) { c.put(e.request, res.clone()); trimCache(POI_CACHE, POI_LIMIT); }
        return res;
      }).catch(() => hit);
      return hit || fresh;
    })());
    return;
  }

  /* Navigationen: network-first, Fallback Shell */
  if (e.request.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(e.request);
        const c = await caches.open(SHELL_CACHE);
        c.put('/index.html', res.clone());
        return res;
      } catch (err) {
        const c = await caches.open(SHELL_CACHE);
        return (await c.match('/index.html')) || (await c.match('/'));
      }
    })());
    return;
  }

  /* Same-origin statische Assets: cache-first */
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(SHELL_CACHE);
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    })());
  }
});
