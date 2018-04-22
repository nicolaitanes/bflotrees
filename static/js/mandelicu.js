define("mandelicu", ["d3"], (d3) => {
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
                    ///exports.errOut.send(err, this.label||'Event');
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

    exports.LocalState = class LocalState {
        constructor(localName, defs) {
            this.localName = localName;
            this.defs = defs;
            this.privDefs = {};
            this.saveSoon = exports.batchDelayed(this.save.bind(this), 2000);
            this.changedSoon = exports.batchRepeats(this.changed.bind(this), 10);
            this.changedAnywaySoon = exports.batchRepeats(this.changedAnyway.bind(this), 10);
            const saved = localStorage.getItem(localName);
            this.state = Object.assign({}, defs, saved && JSON.parse(saved));
            const names = Object.keys(defs);
            this.ev = exports.makeEvents(['changed', 'applied'].concat(names));
            this.evAnyway = exports.makeEvents(['changed', 'applied'].concat(names));
            for (const name of names) {
                if ( typeof(this.state[name].v) !== 'undefined' ) {
                    this.state[name] = this.state[name].v;
                }
                const toType = {
                    'i': x => x|0,
                    'b': x => !!x,
                    's': x => ''+x
                }[this.defs[name].type] || (x => x);
                this[name] = (v, noEmit) => this._getset(name, toType, v, noEmit);
                if ( this.defs[name].priv ) { // not exposed, not subject to reset
                    this.privDefs[name] = this.defs[name];
                    delete this.defs[name];
                }
            }
            return this;
        }
        _getset(name, toType, v, noEmit) {
            const old = this.state[name];
            if ( typeof(v) === 'undefined' ) {
                return old;
            }
            const val = toType((typeof(v.v) !== 'undefined') ? v.v : v);
            if ( old !== val ) {
                this.state[name] = val;
                this.saveSoon();
                noEmit || this.ev[name].trigger(val, old);
                noEmit || this.changedSoon();
                this.evAnyway[name].trigger(val, old);
                this.changedAnywaySoon();
            }
            return this;
        }
        save() {
            localStorage.setItem(this.localName, JSON.stringify(this.state));
        }
        changed() {
            this.ev.changed.trigger();
        }
        changedAnyway() {
            this.evAnyway.changed.trigger();
        }
        apply(state, noEmit, isDefs) {
            for (const name of Object.keys(state)) {
                if ( name in this.defs ) {
                    let val = state[name];
                    if ( isDefs && (typeof(val.v) !== 'undefined') ) {
                        val = val.v;
                    }
                    this[name](val, noEmit);
                }
            }
            this.ev.applied.trigger();
            this.evAnyway.applied.trigger();
        }
        reset(noEmit) {
            this.apply(this.defs, noEmit, true);
        }
        resetOne(k, noEmit) {
            this.apply({[k]: this.defs[k]}, noEmit, true);
        }
    };

    exports.StateBacked = function StateBacked(state, key, {fromPlain=x=>x, toPlain=x=>x, writeDelay=3000, onchange=x=>undefined}={}) {
        const sb = {
            value: fromPlain(state[key]())
        };
        let locallyMod = false;
        const saveSoon = exports.batchDelayed(() => {
            locallyMod = true;
            if ( sb.value !== state[key]() ) {
                state[key](toPlain(sb.value));
            } else {
                state.ev[key].trigger(sb.value, sb.value);
            }
            locallyMod = false;
        }, writeDelay);
        sb.modify = operate => {
            const newValue = operate(sb.value);
            if ( newValue ) {
                sb.value = newValue;
                saveSoon();
            }
        };
        state.ev[key].sub(exports.batchDelayed(() => {
            if ( ! locallyMod ) {
                sb.value = fromPlain(state[key]());
                onchange(sb.value);
            }
        }, 100));
        return sb;
    }

    // onchange: external only
    exports.StateBackedSet = (state, key, {writeDelay, onchange, onadd=x=>undefined, ondelete=x=>undefined}={}) => Object.assign(exports.StateBacked(state, key, {
        writeDelay,
        onchange,
        fromPlain: lst => new Set(lst),
        toPlain: s => [...s]
    }), {
        add(x) {
            this.modify(v => {
                v.add(x);
                return v;
            });
            onadd(x);
        },
        delete(x) {
            this.modify(v => {
                v.delete(x);
                return v;
            });
            ondelete(x);
        }
    });

    exports.ws = function ws(url, config) {
        config = config || {};
        config.binaryType = config.binaryType || 'arraybuffer';
        config.newPromise = config.newPromise || (f => new Promise(f));
        // onmessage, onerror, onclose, onopen, onreopen
        // immediate: open/reopen before any messages sent
        const tix = new exports.PromiseTickets();
        let ws = null,
            wsOpen = false,
            pending = [],
            firstTime = true;
        var out;
        function send(msg) {
            if ( wsOpen ) {
                ws.send(msg);
            } else {
                pending.push(msg);
                ws || connect();
            }
        }
        function sendJson(msg) {
            send(JSON.stringify(msg));
        }
        function request(msg) {
            return config.newPromise((resolve, reject) => {
                msg.tkt = tix.register(resolve, reject);
                try {
                    send(JSON.stringify(msg));
                } catch(err) {
                    tix.reject(msg.tkt, err);
                }
            });
        }
        function connect() {
            ws = new WebSocket(url);
            ws.binaryType = config.binaryType;
            ws.addEventListener('error', event => {
                if ( config.onerror ) {
                    config.onerror(event);
                } else {
                    console.log('ws error',event,url);
                }
                ws = null;
                wsOpen = false;
                out.wsOpen = false;
                tix.rejectAll('Socket closed (error)');
                pending = [];
                config.immediate && setTimeout(connect, 5000);
            });
            ws.addEventListener('message', event => {
                if ( event.data.byteLength || event.data.size ) { // binary
                    config.onmessage && config.onmessage(event);
                    return;
                }
                let msg = null;
                try {
                    msg = JSON.parse(event.data);
                    if ( msg.tkt ) {
                        if ( msg.tktErr ) {
                            tix.reject(msg.tkt, msg.tktErr);
                        } else {
                            tix.resolve(msg.tkt, msg);
                        }
                        return;
                    }
                } catch (err) {
                    console.log(err);
                }
                config.onmessage && config.onmessage(event, msg);
            });
            ws.addEventListener('close', event => {
                ws = null;
                wsOpen = false;
                out.wsOpen = false;
                tix.rejectAll('Socket closed');
                pending = [];
                config.onclose && config.onclose(event);
                config.immediate && setTimeout(connect, 3000);
            });
            ws.addEventListener('open', event => {
                const cb = (firstTime ? config.onopen : (config.onreopen||config.onopen));
                firstTime = false;
                wsOpen = true;
                out.wsOpen = true;
                cb && cb();
                
                let sent = 0;
                if ( ws.readyState === 1 ) {
                    try {
                        for (let i=0; i<pending.length; ++i) {
                            ws.send(pending[i]);
                            ++sent;
                        }
                    } catch (err) {
                        ///exports.errOut.send(err, url);
                    }
                }
                if ( sent < pending.length ) {
                    console.log('failing send on open; dumping '+(pending.length-sent)+' messages');
                }
                pending = [];
            });
        }
        function close() {
            config.immediate = false;
            try {
                ws && ws.close();
            } catch (err)
            {}
        }
        out = {
            wsOpen: wsOpen,
            send: send,
            sendJson: sendJson,
            request: request,
            close: close
        };
        config.immediate && connect();
        return out;
    };

    exports.wsAuth = function wsAuth(url, config) {
        config = config || {};
        function deauth() {
            haveAuth = false;
            config.ondeauth && config.ondeauth();
        }
        const subConfig = Object.assign({}, config, {
            onclose: function(event) {
                deauth();
                config.onclose && config.onclose();
            }
        });
        const ws = exports.ws(url, subConfig);
        let haveAuth = false;
        return {
            ws: ws,
            send(msg, noAuth) {
                if ( haveAuth || noAuth ) {
                    return ws.send(msg);
                } else {
                    return config.requestAuth(ws)
                        .then(result => {
                            haveAuth = true;
                            config.onauth && config.onauth(result);
                            return ws.send(msg);
                        });
                }
            },
            sendJson(msg, noAuth) {
                return this.send(JSON.stringify(msg), noAuth);
            },
            request(msg, noAuth) {
                if ( haveAuth || noAuth ) {
                    return ws.request(msg);
                } else {
                    return config.requestAuth(ws)
                        .then(result => {
                            haveAuth = true;
                            config.onauth && config.onauth(result);
                            return ws.request(msg);
                        });
                }
            },
            close() {
                haveAuth = false;
                config.ondeauth && config.ondeauth();
                ws.close();
            },
            deauth: deauth // call when you have sent a sign-out message
        };
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

    exports.fuse = class fuse {
        constructor(expiryMS, onexpire, opts) {
            this.opts = Object.assign({}, {
                allowDoubleStart: false
            }, opts);
            this.exp = expiryMS || 10000;
            this.onexpire = onexpire;
            this.handle = null;
            this.active = false;
            this.fails = 0;
        }
        countDown(ms) {
            if ( this.active ) {
                if ( this.opts.allowDoubleStart ) {
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
            this.fails = 0;
        }
        _expire() {
            ++this.fails;
            this.handle = null;
            this.active = false;
            this.onexpire && this.onexpire(this.fails);
        }
    };
    
    exports.PromiseTickets = class PromiseTickets {
        constructor() {
            let nextNum = 1;
            const makeTicket = () => {
                const t = nextNum;
                ++nextNum;
                return t;
            };
            this.reuse = [];
            this.getTicket = () => this.reuse.length ? this.reuse.pop() : makeTicket();
            this.registry = [];
            // ticket is index into registry array; reusing tickets for compact storage
        }
        register(resolve, reject, onprogress) {
            const t = this.getTicket();
            this.registry[t] = {resolve, reject, onprogress};
            return t;
        }
        retrieve(ticket) {
            const promise = this.registry[ticket];
            this.registry[ticket] = null;
            this.reuse.push(ticket);
            return promise;
        }
        resolve(ticket, arg) {
            this.retrieve(ticket).resolve(arg);
        }
        reject(ticket, err) {
            this.retrieve(ticket).reject(err);
        }
        rejectAll(err) {
            this.registry.forEach((promise,ticket) => promise && this.reject(ticket, err));
        }
        progress(ticket, progress) {
            const promise = this.registry[ticket];
            promise.onprogress && promise.onprogress(progress);
        }
    };
            
    const ModalConfig = {
        title: "",
        canCancel: true,
        cancelLabel: 'Cancel',
        canOK: true,
        okLabel: 'OK',
        buttons: [] // in addition to OK, Cancel if enabled
        //             list of [label, f()]
        // content, onCancel, onOK, (onOK return True to keep it open)
        // 
    };
    exports.Modal = class Modal {
        constructor(config) {
            this.config = Object.assign({}, ModalConfig, config);
            this.running = false;
            this.dom = {
                root: document.createElement('div'),
                content: this.config.content || document.createElement('div')
            };
            this.dom.root.className = 'modal';
            const root = d3.select(this.dom.root);
            root.append('div').classed('modal_shield', true);
            const body = root.append('div');
            body.classed('modal_body', true);
            const title = body.append('div')
                  .text(this.config.title || this.dom.content.dataset.title || "");
            title.classed('modal_title', true);
            this.dom.title = title.node();
            const content = body.append('div');
            content.classed('modal_content', true);
            content.node().appendChild(this.dom.content);
            const buttons = body.append('div');
            buttons.classed('modal_buttons', true);
            this.dom.buttons = buttons.node();
            this.config.buttons.forEach(([lbl, act]) => {
                this.defBtn = buttons.append('button')
                    .text(lbl)
                    .on('click', act)
                this.defBtn.classed('modal_btn', true);
            });
            if ( this.config.canCancel ) {
                this.defBtn = buttons.append('button')
                    .text(this.config.cancelLabel)
                    .on('click', this._onClickCancel.bind(this));
                this.defBtn.classed('modal_btn modal_cancel', true);
            }
            if ( this.config.canOK ) {
                this.defBtn = buttons.append('button')
                    .text(this.config.okLabel)
                    .on('click', this._onClickOK.bind(this));
                this.defBtn.classed('modal_btn modal_ok', true);
            }
            document.body.appendChild(this.dom.root);
        }
        resolve(resolution) {
            return this.close(undefined, resolution);
        }
        close(err, resolution=true) {
            const sess = this.sess;
            this.sess = null;
            if ( err ) {
                this.config.onCancel && this.config.onCancel();
                this.dom.root.style.top = '';
                this.running = false;
                sess && sess.reject(err);
            } else {
                if ( (! this.config.onOK) || (! this.config.onOK()) ) {
                    this.dom.root.style.top = '';
                    this.running = false;
                    sess && sess.resolve(resolution);
                } else {
                    this.sess = sess;
                }
            }
        }
        _onClickCancel(event) {
            this.close('Canceled');
        }
        _onClickOK(event) {
            this.close();
        }
        run() {
            return new Promise((resolve, reject) => {
                this.sess = {
                    resolve: resolve,
                    reject: reject
                };
                this.dom.root.style.top = '0';
                this.running = true;
                this.defBtn && this.defBtn.node().focus();
            });
        }
        destroy() {
            document.body.removeChild(this.dom.root);
        }
    };

    exports.querydotdot = function querydotdot(container) {
        // inspired by dart's '..' operator, querydotdot returns a function which
        // queries container and calls action(result)
        // so you can bind the child node to a local name while initializing.
        // By default it returns the query result node, but it will pass along action's return value if truthy
        // (e.g. so you can wrap the node and keep the wrapped reference).
        container = (container && container.tagName) ? container : (container ? document.querySelector(container) : document.body);
        const dotdot = (selector, action) => {
            const child = container.querySelector(selector);
            return action && action(child) || child;
        };
        // shorthand to add a listener, e.g. dotdot.listen('#myBtn', 'click', function(ev) {})
        dotdot.listen = (selector, evType, handler, action) => dotdot(selector, node => {
            node.addEventListener(evType, handler);
            return action && action(node) || node;
        });
        // shorthand to add a makeEvents-style listener
        dotdot.sub = (selector, action, evType, handler) => dotdot(selector, node => {
            const wrapped = action(node) || node;
            evType && wrapped.ev[evType].sub(handler);
            return wrapped;
        });
        dotdot.detach = () => {
            container.parentNode && container.parentNode.removeChild(container);
            return dotdot;
        };
        dotdot.clone = () => exports.querydotdot(container.cloneNode(true));
        // dd.detach().attachedTo(parent) appends copy of container; but
        // dd.toFragment().attachedTo(parent) appends copy of each child of container
        dotdot.toFragment = () => {
            const frag = document.createDocumentFragment();
            for (const ch of [...container.childNodes]) {
                frag.appendChild(ch);
            }
            container.parentNode && container.parentNode.removeChild(container);
            dotdot.node = container = frag;
            return dotdot;
        };
        // returns new querydotdot on parent
        dotdot.attachedTo = parent => {
            parent.appendChild(container.cloneNode(true));
            return exports.querydotdot(parent);
        };
        dotdot.node = container;
        return dotdot;
    };

    // options '  ' is reserved
    exports.addInputOptions = function addInputOptions({input, div, options, onchoose}) {
        const menu = document.createElement('select');
        menu.style.width = '2em';
        (input || div).insertAdjacentElement('afterend', menu);
        d3.select(menu)
            .on('change', function() {
                if ( this.selectedIndex ) {
                    const chosen = options[this.selectedIndex-1];
                    if ( input ) {
                        input.value = chosen;
                    }
                    if ( div ) {
                        div.textContent = chosen;
                    }
                    this.selectedIndex = 0;
                    onchoose && onchoose(chosen);
                }
            }).selectAll('option')
            .data(['  '].concat(options))
            .enter().append('option')
            .text(d => d)
            .property('value', d => d)
            .property('selectedIndex', 0);
    };

    return exports;
});
