# 17 — PWA & Offline Capabilities

## Purpose

Specify the Progressive Web App (PWA) architecture, Service Worker caching strategies, web app manifest configuration, and offline capabilities. As a frontend-only application tailored for government regional operators, offline reliability ensures operators can work in low-connectivity environment without internet dependency.

---

## 1. Web App Manifest Specification

`public/manifest.json`:
```json
{
  "short_name": "PetaJabatan",
  "name": "Peta Jabatan Builder",
  "description": "Alat penyusun struktur organisasi dan kebutuhan jabatan OPD",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "type": "image/png",
      "sizes": "192x192"
    },
    {
      "src": "/icons/icon-512.png",
      "type": "image/png",
      "sizes": "512x512",
      "purpose": "any maskable"
    }
  ],
  "start_url": "/",
  "background_color": "#f8fafc",
  "theme_color": "#1e293b",
  "display": "standalone",
  "orientation": "any"
}
```

---

## 2. Service Worker Strategy

Powered by Vite PWA plugin / Workbox with a **Cache First** strategy for core app shell assets and **Stale While Revalidate** for static reference data (`taxonomy.json`, `daftar-opd.json`).

```ts
// Service Worker Caching Policy
registerRoute(
  ({ request }) => request.destination === 'document' || request.destination === 'script' || request.destination === 'style',
  new CacheFirst({ cacheName: 'app-shell-v1' })
);

registerRoute(
  ({ url }) => url.pathname.endsWith('taxonomy.json') || url.pathname.endsWith('daftar-opd.json'),
  new StaleWhileRevalidate({ cacheName: 'reference-data-v1' })
);
```

---

## 3. SW Lifecycle & Update Notification

1. When a new SW version is detected: show a non-intrusive toast banner ("Versi baru aplikasi tersedia. [Perbarui Sekarang]").
2. User clicking "Perbarui Sekarang" triggers `postMessage({ type: 'SKIP_WAITING' })` and reloads the window.
3. No automatic forced reload while active edits are pending to prevent input interruption.

---

## 4. Offline Indicator & Storage Resilience

- **Offline Indicator**: UI topbar displays a small offline status badge when `navigator.onLine === false`.
- **Zero Remote Dependencies**: App does not fetch external fonts or third-party JS scripts at runtime. All assets (fonts, icons) are bundled locally.

---

## 5. Exit Criteria

- [ ] Web App Manifest valid and installable as standalone desktop app
- [ ] Service worker caches app shell for full offline execution
- [ ] App operates 100% offline without remote network requests
- [ ] Update notification banner allows controlled application update
