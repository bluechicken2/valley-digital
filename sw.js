// TradingAI Service Worker v2.0.0 - Phase 10 Security & Performance

const CACHE_NAME = 'tradingai-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/theme.css',
    '/js/app.js',
    'https://cdn.jsdelivr.net/npm/chart.js'
];
const API_CACHE_TTL = 30000; // 30 seconds for API

// Install event - cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME && name !== 'api-cache')
                        .map((name) => caches.delete(name))
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch event - stale-while-revalidate for API, cache-first for static
self.addEventListener('fetch', (event) => {
    var url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    // API requests - stale-while-revalidate (Phase 10)
    if (url.pathname.startsWith('/api/') || url.hostname.includes('workers.dev')) {
        event.respondWith(
            caches.open('api-cache').then((cache) => {
                return cache.match(event.request).then((cached) => {
                    var fetchPromise = fetch(event.request).then((response) => {
                        if (response.ok) {
                            cache.put(event.request, response.clone());
                        }
                        return response;
                    }).catch(() => cached);

                    return cached || fetchPromise;
                });
            })
        );
        return;
    }

    // Static assets - cache first, network fallback
    event.respondWith(
        caches.match(event.request).then((cached) => {
            return cached || fetch(event.request).then((response) => {
                if (response.ok && event.request.method === 'GET') {
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, response.clone());
                    });
                }
                return response;
            });
        })
    );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-prices') {
        event.waitUntil(syncPrices());
    }
});

async function syncPrices() {
    try {
        const response = await fetch('https://tradingapi-proxy.cloudflare-5m9f2.workers.dev/prices');
        const data = await response.json();

        // Notify all clients
        const clients = await self.clients.matchAll();
        clients.forEach((client) => {
            client.postMessage({
                type: 'PRICES_UPDATED',
                data: data
            });
        });
    } catch (error) {
        console.error('Sync failed:', error);
    }
}

// Push notifications
self.addEventListener('push', (event) => {
    const options = {
        body: event.data ? event.data.text() : 'New update available',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        }
    };

    event.waitUntil(
        self.registration.showNotification('TradingAI', options)
    );
});

// Notification click
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/')
    );
});
