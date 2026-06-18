// Service Worker for Nepal Sky
const CACHE_NAME = 'nepalsky-v2';

const ASSETS = [
    '/',
    '/index.html',
    '/dashboard.html',
    '/api-docs.html',
    '/privacy.html',
    '/terms.html',
    '/about.html',
    '/landing.css',
    '/dashboard.css',
    '/landing.js',
    '/dashboard.js',
    '/manifest.json',
    '/offline.html',
    '/favicon/favicon.ico',
    '/favicon/favicon-16x16.png',
    '/favicon/favicon-32x32.png',
    '/favicon/favicon-48x48.png',
    '/favicon/android-chrome-192x192.png',
    '/favicon/android-chrome-512x512.png',
    '/favicon/apple-touch-icon.png',
    '/favicon/favicon.svg',
    '/favicon/site.webmanifest'
];

// Install - Cache all assets
self.addEventListener('install', event => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Caching assets');
                // Use individual add calls to avoid failing all if one fails
                return Promise.allSettled(
                    ASSETS.map(url =>
                        cache.add(url).catch(err => {
                            console.warn('[SW] Failed to cache:', url, err);
                        })
                    )
                );
            })
    );
    self.skipWaiting();
});

// Activate - Clean old caches
self.addEventListener('activate', event => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => {
                        console.log('[SW] Deleting old cache:', key);
                        return caches.delete(key);
                    })
            );
        })
    );
    self.clients.claim();
});

// Fetch - Network first, fallback to cache
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    
    // Skip API calls and external resources
    if (event.request.url.includes('api.open-meteo.com') || 
        event.request.url.includes('dhm.gov.np') || 
        event.request.url.includes('nominatim.openstreetmap.org') ||
        event.request.url.includes('fonts.googleapis.com') ||
        event.request.url.includes('fonts.gstatic.com')) {
        return;
    }
    
    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME)
                        .then(cache => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => {
                return caches.match(event.request)
                    .then(cached => {
                        if (cached) return cached;
                        // If HTML request fails, show offline page
                        if (event.request.headers.get('accept')?.includes('text/html')) {
                            return caches.match('/offline.html');
                        }
                    });
            })
    );
});
