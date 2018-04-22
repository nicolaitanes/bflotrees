"use strict";

define("server", ["fs", "express", "express-ws", "http", "spdy", "compression", "morgan", "treeserv"], (fs, express, expressWS, http, spdy, compression, morgan, treeserv) => {
    let exports = {};
    
    let HTTP_PORT = 9090;
    const STATIC_PATH = process.env.STATIC_PATH;
    const ORIGIN = process.env.ORIGIN || 'https://bflotrees.mandelics.com';

    exports.app = express();
    exports.app.use(compression());

    exports.app.use(morgan(':req[x-forwarded-for] - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'));
    exports.run = function() {
	exports.app.use("/opendata", treeserv);

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
