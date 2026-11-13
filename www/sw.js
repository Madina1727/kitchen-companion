// Offline cache for the app shell. Network first for HTML/JS so updates show up, cache as fallback.
const CACHE = "kc-v11";
const SHELL = ["./", "index.html", "css/app.css", "css/design.css", "css/fresh.css", "js/app.js", "js/core.js", "js/db.js", "js/i18n.js", "js/catalog.js", "js/nutri.js", "js/engine.js", "js/parser.js", "js/ai.js",
  "js/views/home.js", "js/views/recipes.js", "js/views/importer.js", "js/views/kitchen.js", "js/views/cook.js", "js/views/plan.js", "js/views/profile.js", "js/views/books.js", "js/sync.js",
  "vendor/lucide.min.js", "icons/icon.svg", "manifest.webmanifest"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // Always ask the server for the newest file; the cache is only a fallback when offline.
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match("index.html"))));
});
