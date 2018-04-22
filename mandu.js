define("mandu", ['child_process'], (child_process) => {
    'use strict';

    const exports = {};

    exports.Event = class Event {
        constructor(label) {
            this.label = label;
            this.subs = [];
            Object.freeze(this);
        }
        sub(f) {
            if ( ! f ) {
                throw new Error('null event callback');
            }
            this.subs.push(f);
            return f;
        }
        unsub(f) {
            const i = this.subs.indexOf(f);
            if ( i >= 0 ) {
                this.subs.splice(i, 1);
            } else {
                console.log('not subscribed',f);
            }
        }
        trigger() {
            for (const s of this.subs) {
                try {
                    s.apply(null, arguments);
                } catch (err) {
                    console.log('in event '+this.label+':', err);
                }
            }
        }
        subscribed() {
            return !! this.subs.length;
        }
    };
    exports.makeEvents = (names, unfrozen) => {
        const ev = {};
        names.forEach(nm => {
            ev[nm] = new exports.Event();
        });
        unfrozen || Object.freeze(ev);
        return ev;
    };

    exports.shell_pipe = function shell_pipe(cmd, stream, streamDest) {
	return new Promise(function(resolve, reject) {
	    const child = child_process.spawn("sh", ["-c", cmd]);
            let output = '';
	    child.on('close', code => code && reject(new Error(`child process "${cmd}" exited with code ${code}`)) || resolve(output));
	    child.on('error', err => {
                console.log('shell err:',err, output);
		reject(err);
	    });
            child.stdin.on('error', err => console.log('shell stdin err:', err, output));
            child.stdout.on('error', err => console.log('shell stdout err:', err, output));
            child.stderr.on('error', err => console.log('shell stderr err:', err, output));
            if ( streamDest ) {
                child.stdout.pipe(streamDest);
            } else {
	        child.stdout.on('data', t => {
		    output += t;
	        });
            }
	    stream && stream.pipe(child.stdin);
	});
    };

    const NOQUOTE = /['"]*/;
    exports.noquote = s => s.replace(NOQUOTE, '');

    exports.repeat = function repeat(s, n) {
        let out = '';
        for (let i=0; i<n; ++i) {
            out += s;
        }
        return out;
    };

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

    exports.fuse = class fuse {
        constructor(expiryMS, onexpire, allowDoubleStart) {
            this.exp = expiryMS || 10000;
            this.onexpire = onexpire;
            this.allowDoubleStart = !! allowDoubleStart;
            this.handle = null;
            this.active = false;
        }
        countDown(ms) {
            if ( this.active ) {
                if ( this.allowDoubleStart ) {
                    this.reset();
                } else {
                    throw new Error('Already counting');
                }
            }
            ms = ms || this.exp;
            this.handle = setTimeout(this._expire.bind(this), ms);
            this.active = true;
        }
        reset() {
            this.handle && clearTimeout(this.handle);
            this.handle = null;
            this.active = false;
        }
        _expire() {
            this.handle = null;
            this.onexpire && this.onexpire();
            this.active = false;
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

    exports.batchRepeats = function BatchRepeats(action, msBetween) {
        let lastTime = 0,
            pending = false;
        const doAction = () => {
            action();
            lastTime = new Date();
            pending = false;
        }
        return () => {
            if ( ! pending ) {
                const dt = (new Date()) - lastTime,
                      msRemain = msBetween - dt;
                if ( msRemain <= 0 ) {
                    doAction();
                } else {
                    pending = true;
                    setTimeout(doAction, msRemain);
                }
            }
        };
    };

    exports.RTCSignals = class RTCSignals {
        constructor(config) {
            this.config = {
                keyName: 'key',
                iceUser: 'user',
                onclosed: (from, to) => undefined,
                onexpired: (from, to) => undefined,
                ...config
            };
            this.k = this.config.keyName;
            this.byKey = new Map();
            this.offerClocks = new exports.DefaultDict(k => new exports.fuse(10000, () => this._offerExpired(k), true));
        }
        getIceConfig() {
            return {
                iceServers: [this.config.getIceServers(this.config.iceUser)]
            };
        }
        keyName(n) {
            if ( typeof(n) === 'undefined' ) {
                return this.k;
            } else if ( n !== this.k ) {
                if ( this.byKey.size ) {
                    throw new Error('Change keyName on empty RTCSignals only');
                }
                this.k = this.config.keyName = n;
            }
            return this;
        }
        peer(k) {
            return this.byKey.get(k);
        }
        addPeer(p) {
            this.byKey.set(p[this.k], p);
            p.rtcFail = new Set();
        }
        removePeer(p) {
            this.byKey.delete(p[this.k]);
            delete p.rtcFail;
        }
        requestOffer(pFrom, pTo) {
            pFrom.sendJson({
                t: 'rtcInit',
                to: pTo[this.k],
                rtcName: this.config.iceUser,
                config: this.getIceConfig()
            });
            console.log('count',''+[pFrom[this.k], pTo[this.k]]);
            this.offerClocks.get(''+[pFrom[this.k], pTo[this.k]]).countDown();
        }
        _offerExpired(k) {
            const [kFrom, kTo] = JSON.parse(`[${k}]`);
            this.offerClocks.delete(k);
            this.config.onexpired(kFrom, kTo);
        }
        offer(msg, pFrom) {
            const pTo = this.byKey.get(msg.to);
            if ( ! pTo ) {
                console.log('missing offeree:',msg.to,this.config.iceUser);
                return;
            }
            pTo.sendJson({
                t: 'rtcOffer',
                rtcName: this.config.iceUser,
                config: this.getIceConfig(),
                from: pFrom[this.k],
                to: msg.to,
                sdp: msg.sdp
            });
        }
        answer(msg, source) {
            const offerer = this.byKey.get(msg.to);
            offerer && offerer.sendJson({
                t: 'rtcAnswer',
                rtcName: this.config.iceUser,
                from: source[this.k],
                sdp: msg.sdp
            });
            const k = ''+[msg.to, source[this.k]];
            console.log('expire',k);
            this.offerClocks.get(k).reset();
            this.offerClocks.delete(k);
        }
        ice(msg, source, answering) {
            const dest = this.byKey.get(msg.to);
            dest && dest.sendJson({
                t: answering ? 'iceAnswer' : 'iceOffer',
                rtcName: this.config.iceUser,
                from: source[this.k],
                candidate: msg.candidate
            });
        }
        rtcFailed(source, to) {
            source.rtcFail && source.rtcFail.add(to);
        }
        closed(from, to) {
            this.config.onclosed(from, to);
        }
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
                
    exports.digits4 = function digits4(x) {
        let s = ''+x;
        while ( s.length < 4 ) {
            s = '0'+s;
        }
       return s;
    };
    
    return exports;
});
