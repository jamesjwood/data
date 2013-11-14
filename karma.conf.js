/*global module */
/*global LOG_INFO */

module.exports = function(config) {
	'use strict';
    config.set({
		browsers : ['Safari'],
		frameworks: ['mocha'],
		basePath : '',
		files: [
			'node_modules/jsonCrypto/lib/forge.min.js',
			'stage/test.js'
		],
    port: 9873
	});
};
