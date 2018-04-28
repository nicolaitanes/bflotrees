"use strict";

define("server", ["fs", "express", "express-ws", "http", "compression", "morgan", "treeserv", "upfile"], (fs, express, expressWS, http, compression, morgan, treeserv, upfile) => {
    let exports = {};
    
    let HTTP_PORT = 9090;
    const STATIC_PATH = process.env.STATIC_PATH;
    const ORIGIN = process.env.ORIGIN || 'https://bflotrees.mandelics.com';
    const IMAGE_PATH = process.env.IMAGE_PATH || '/var/treepic/';
    const IMAGE_URL = process.env.IMAGE_URL || '/pic/';

    exports.app = express();
    exports.app.use(compression());

    exports.app.use(morgan(':req[x-forwarded-for] - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'));
    exports.run = function() {
	exports.app.use("/opendata", treeserv);
        exports.app.use('/up', upfile);

        IMAGE_PATH && IMAGE_URL && exports.app.use(IMAGE_URL.substring(0, IMAGE_URL.length-1), express.static(IMAGE_PATH));
        STATIC_PATH && exports.app.use("/trees", express.static(STATIC_PATH));
        STATIC_PATH && exports.app.use("/.well-known/", express.static('static/.well-known/', {dotfiles: 'allow'}));

	const httpServer = http.createServer(exports.app)
	    .listen(HTTP_PORT);
        expressWS(exports.app, httpServer);
        treeserv.setupWS();

        exports.app.all('*', (req, res) => res.redirect(ORIGIN+'/trees/'));
    };

    return exports;
});
