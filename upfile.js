define("upfile", ['express', 'connect-busboy', 'fs', 'node-uuid', 'path'], (express, busboy, fs, uuid, path) => {
    'use strict';
    
    const router = new express.Router();

    const filePerm = {};
    function regFile({name, onstream}) {
        const id = uuid.v4();
        filePerm[id] = {
            id, name, onstream,
            ext: path.extname(name)
        };
        return filePerm[id];
    }
    function unregFile({id}) {
        delete filePerm[id];
    }

    router.UploadHandler = class UploadHandler {
        constructor({timeoutSec=60*60}) {
            this.timeoutSec = timeoutSec;
        }
        prepare({name, timeoutSec, onstream}) {
            if ( timeoutSec === undefined ) {
                timeoutSec = this.timeoutSec;
            }
            const reg = regFile({name, onstream});
            timeoutSec && setTimeout(() => unregFile(reg), timeoutSec*1000);
            return reg;
        }
        rescind(reg) {
            return unregFile(reg);
        }
    }
        
    router.UploadFolder = class UploadFolder extends router.UploadHandler {
        constructor({timeoutSec, path, urlPath=''}) {
            super({timeoutSec});
            this.path = path; 
            this.urlPath = urlPath;
            this.received = null;
            this.rejected = null;
        }
        prepare({name, timeoutSec}) {
            const reg = super.prepare({
                name, timeoutSec,
                onstream: (res, stream) => this.onstream(reg, res, stream)
            });
            reg.path = this.path;
            reg.fullPath = path.join(this.path, reg.id+reg.ext);
            reg.url = this.urlPath + reg.id + reg.ext;
            return reg;
        }
        receive(reg) {
            if ( ! reg.id ) {
                reg = filePerm[reg];
            }
            try {
                reg && fs.statSync(reg.fullPath);
                return Promise.resolve();
            } catch (err) {}
            return new Promise((resolve, reject) => {
                reg.received = resolve;
                reg.rejected = reject;
            });
        }
        _received(err, reg, res) {
            const resolve = err ? reg.rejected : reg.received;
            reg.received = reg.rejected = null;
            delete filePerm[reg.id];
            resolve && resolve(err);
            res.json({received: true});
        }
        onstream(reg, res, stream) {
            const fstream = fs.createWriteStream(reg.fullPath);
            stream.pipe(fstream);
            fstream.on('close', () => this._received(null, reg, res));
        }
    };
    
    const fileHandler = busboy();
    router.use('/:id', fileHandler);
    router.post('/:id', (req, res) => {
        const id = req.params.id;
        if ( ! filePerm[id] ) {
            res.sendStatus(401);
        } else if ( req.busboy ) {
            req.pipe(req.busboy);
            req.busboy.on('file', (fieldname, file, filename) => filePerm[id].onstream(res, file));
        }
    });

    return router;
});
