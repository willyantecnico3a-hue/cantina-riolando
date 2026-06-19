const CACHE_VERSION = "cantina-riolando-v2";

const ARQUIVOS_ESTATICOS = [
  "/",
  "/index.html",
  "/app.html",
  "/totem.html",
  "/style.css",
  "/app_mobile.css",
  "/totem_ui.css",
  "/app.js",
  "/config.js",
  "/supabaseClient.js",
  "/manifest-app.json",
  "/manifest-totem.json",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(function (cache) {
        return cache.addAll(ARQUIVOS_ESTATICOS);
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (nomesCaches) {
        return Promise.all(
          nomesCaches
            .filter(function (nome) { return nome !== CACHE_VERSION; })
            .map(function (nome) { return caches.delete(nome); })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener("fetch", function (event) {
  const url = new URL(event.request.url);

  if (event.request.method !== "GET") return;
  if (url.hostname.includes("supabase.co")) return;
  if (url.pathname.startsWith("/.netlify/functions/")) return;
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(function (respostaRede) {
        const copia = respostaRede.clone();
        caches.open(CACHE_VERSION).then(function (cache) {
          cache.put(event.request, copia);
        });
        return respostaRede;
      })
      .catch(function () {
        return caches.match(event.request)
          .then(function (respostaCache) {
            if (respostaCache) return respostaCache;
            if (event.request.mode === "navigate") return caches.match("/index.html");
            return Response.error();
          });
      })
  );
});
