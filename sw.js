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

// Install
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .catch(err => console.log('Cache error:', err))
    );
    self.skipWaiting();
});

// Activate
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
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
                        if (event.request.headers.get('accept').includes('text/html')) {
                            return caches.match('/offline.html');
                        }
                    });
            })
    );
});