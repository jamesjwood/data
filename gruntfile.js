var getWatchers = require('getwatchers');

module.exports = function(grunt) {
  "use strict";
  // Project configuration.
  grunt.initConfig({
   watch: {
      js: {
        options: {
          debounceDelay: 5000,
          interrupt: true
        },
        files: getWatchers(),
        tasks: ['default']
      }
    },
    jshint: {
      options: {
        browser: true,
        node: true
      },
      all: ['index.js', 'test.js', './src/*.js', './test/*.js']
    },
    simplemocha: {
      options: {
        ui: 'bdd',
        reporter: 'tap'
      },
      all: { src: ['test.js'] }
    },
shell: {
      makeStage: {
        command: 'rm -rf stage; mkdir stage',
        stdout: true,
        stderr: true,
        failOnError: true
      },
      makeLib: {
        command: 'rm -rf lib; mkdir lib',
        stdout: true,
        stderr: true,
        failOnError: true
      },
      browserify:{
        command: 'node ./node_modules/browserify/bin/cmd.js  --debug -o ./stage/test.js -i domain -e ./test.js;',
        stdout: true,
        stderr: true,
        failOnError: true
      },
      buildPouchDBClient:{
        command: 'cd node_modules/pouchdb; npm install; grunt;',
        stdout: true,
        stderr: true,
        failOnError: true
      },
      copyPouch:{
        command: 'cp -av node_modules/pouchdb/dist/pouchdb-nightly.min.js lib/pouch.min.js; cp -av node_modules/pouchdb/dist/pouchdb-nightly.js lib/pouch.js;',
        stdout: true,
        stderr: true,
        failOnError: true
      }
    },
    karma: {
      local: {
        configFile: 'karma.conf.js',
        singleRun: true,
        browsers: ['Chrome'] //, 'Firefox', 'Safari', 'Opera'
      }
    },
    bump: {
        options: {},
        files: [ 'package.json']
    }
  });


require('matchdep').filterDev('grunt-*').forEach(grunt.loadNpmTasks);

grunt.registerTask('installold', ['shell:makeLib', 'shell:buildPouchDBClient', 'shell:copyPouch']);
grunt.registerTask('default', ['jshint', 'bump']);
grunt.registerTask('test', ['default', 'shell:makeStage', 'simplemocha','shell:browserify', 'karma']);

};