'use strict';

const CACHE_VERSION = "v5";
const CACHE_PREFIX = 'trees_';
const staticPaths = [ // make the first one small
    '/trees/trees-300px.png'
];
const staticOptions = [
    '/trees/trees-600px.png'
];
const dynPaths = [
    '/trees/',
    '/trees/api.html',
    '/trees/index.html',
    '/trees/manifest.json',
    '/trees/service-worker.js',
    '/trees/js/d3.js',
    '/trees/js/domReady.js',
    '/trees/js/element-resize-detector.js',
    '/trees/js/jquery-3.3.1.min.js',
    '/trees/js/leaflet.js',
    '/trees/js/main.js',
    '/trees/js/mandelicu.js',
    '/trees/js/require.js',
    '/trees/js/showdown.js',
    '/trees/js/images/marker-open.png',
    '/trees/js/images/marker-shadow.png',
    '/trees/js/images/marker-icon.png',
    '/trees/js/images/marker-icon-2x.png',
    '/trees/js/images/layers.png',
    '/trees/js/images/layers-2x.png',
    '/trees/css/leaflet.css',
    '/trees/css/mandelicu.css',
    '/trees/css/trees.css'
];

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_PREFIX+'static').then(function(cache) {
            return Promise.all(staticPaths.map(function(path) {
                return cache.match(path)
                    .then(function(response) {
                        return response ? Promise.resolve(true) : cache.add(path);
                    });
            }));
        }).then(function() {
            return caches.open(CACHE_PREFIX+CACHE_VERSION).then(function(cache) {
                return cache.addAll(dynPaths);
            });
        })
    );
});

self.addEventListener('activate', function(event) {
    var cacheWhitelist = [CACHE_PREFIX+'static', CACHE_PREFIX+CACHE_VERSION];
    
    event.waitUntil(
        caches.keys().then(function(keyList) {
            return Promise.all(keyList.map(function(key, i) {
                if ( key.startsWith('v') || (key.startsWith(CACHE_PREFIX) && (cacheWhitelist.indexOf(key) === -1)) ) {
                    return caches.delete(keyList[i]);
                }
            }));
        })
    );
});

function rqPath(request) {
    return /^.*:\/\/[^\/]+(\/.*)/.exec(request.url)[1];
}

self.addEventListener('fetch', function(event) {
    //console.log('seeking',event.request);
    const path = rqPath(event.request);
    //console.log('photo sw seeking ',path);
    event.respondWith(
        // respond from the cache if available
        caches.match(event.request)
            .then(function(r) {
                //console.log('photo sw seeking ',path,(!!r) ? 'found' : 'not found');
                if ( r && (dynPaths.indexOf(path) >= 0) ) {
                    //console.log('photo sw seeking ',path,'checking dyn update');
                    // update dynamic cached content for next time
                    var newRq = (event.request.mode === 'navigate') ? event.request
                        : new Request(event.request, {
                            cache: 'no-cache'
                        });
                    fetch(newRq).then(function(r2) {
                        if ( r2 && (r2.status !== 304) ) {
                            return caches.open(CACHE_PREFIX+CACHE_VERSION).then(function(cache) {
                                //console.log('photo sw seeking ',path,'putting dyn update');
                                return cache.put(event.request, r2);
                            });
                        }
                    });
                }
                if ( ! r ) {
                    //console.log('photo sw seeking ',path,'re-fetching');
                    // load missing content
                    r = fetch(event.request)
                        .then(function(r) {
                            let step1 = Promise.resolve(true);
                            if ( staticOptions.indexOf(path) >= 0 ) {
                                //console.log('photo sw seeking ',path,'cache static option');
                                // cache optional static content e.g. font variants
                                step1 = caches.open(CACHE_PREFIX+'static').then(function(cache) {
                                    //console.log('photo sw seeking ',path, 'cached static');
                                    return cache.put(event.request, r.clone());
                                });
                            }
                            return step1.then(function() { return r; });
                        });
                }
                return r;
            })
    );
});

