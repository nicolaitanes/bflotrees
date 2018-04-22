// server main

var requirejs = require('requirejs');

requirejs.config({
    //Pass the top-level main.js/index.js require
    //function to requirejs so that node modules
    //are loaded relative to the top-level JS file.
    nodeRequire: require
});

requirejs(['commander', 'server'], function(commander, server) {
    commander
	.version('0.0.1')
	.parse(process.argv);

    server.run();
});
