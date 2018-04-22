define("mandu", [], () => {
    'use strict';

    const exports = {};

    exports.DefaultDict = class DefaultDict {
        constructor(make) {
            this.make = make;
            this.d = new Map();
        }
        clear() {
            this.d.clear();
        }
        get(k) {
            let v = this.d.get(k);
            if ( typeof(v) === 'undefined' ) {
                v = this.make(k);
                this.d.set(k, v);
            }
            return v;
        }
        set(k, v) {
            this.d.set(k, v);
        }
        delete(k) {
            this.d.delete(k);
        }
        values() {
            return this.d.values();
        }
    };

    exports.batchDelayed = function BatchDelayed(action, msDelay, atEnd) {
        let handle = null;
        const timeout = () => {
            handle = null;
            actSoon.active = false;
            action();
        };
        const actSoon = () => {
            if ( atEnd && handle ) {
                clearTimeout(handle);
                handle = null;
            }
            if ( ! handle ) {
                handle = setTimeout(timeout, msDelay);
                actSoon.active = true;
            }
        };
        return actSoon;
    };

    exports.WSRoutes = class WSRoutes {
        constructor(ws, {routes, onbinary, onmissing, onsenderror, debug}={}) {
            this.ws = ws;
            this.DEBUG = !! debug;
            this.onbinary = onbinary;
            this.onbinarymissing = onmissing || ((msg, data, flags) => Promise.reject('No binary route handler'));
            this.onsenderror = onsenderror;
            this.routes = new exports.DefaultDict(t => (msg, data, flags) => (onmissing && onmissing(msg, data, flags) || Promise.reject('No route for t ===', msg.t)));
            for (const t of Object.keys(routes || {})) {
                this.routes.set(t, routes[t]);
            }
            this.DEBUG && console.log('setting up ws');
            ws.on('message', async (data, flags) => {
                this.DEBUG && console.log('receiving message');
                if ( data.size || data.byteLength ) {
                    return (this.onbinary || this.onbinarymissing)(null, data, flags);
                }
                var msg;
                try {
                    msg = JSON.parse(data);
                } catch (err) {
                    this.DEBUG && console.log('parse error',err);
                    return;
                }
                this.DEBUG && console.log('<',msg);
                try {
                    this.DEBUG && console.log('t',msg.t);
                    const result = await this.routes.get(msg.t || '')(msg, data, flags) || {};
                    if ( msg.tkt !== undefined ) {
                        result.tkt = msg.tkt;
                        this.sendJson(result);
                        this.DEBUG && console.log('>',result);
                    }
                } catch (err) {
                    this.DEBUG && console.log('e>',msg.tkt,err);
                    ws.send(JSON.stringify({
                        tkt: msg.tkt,
                        tktErr: err.stack || err.message || err
                    }));
                }
            });
        }
        route(t, handler) {
            this.routes.set(t, handler);
            return this;
        }
        sendJson(msg) {
            try {
                this.DEBUG && console.log('>',msg);
                this.ws.send(JSON.stringify(msg));
            } catch (err) {
                if ( this.onsenderror ) {
                    this.onsenderror(err, msg);
                } else {
                    throw err;
                }
            }
        }
    };
                
    return exports;
});
