var getWatchers = require('getWatchers');
var pkg = require('./package.json');

module.exports = function(grunt) {
  "use strict";
  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    bumpup: {
      options: {
        updateProps: {
          pkg: 'package.json'
        }
      },
      file: 'package.json'
    },
    watch: {
      dependencies: {
        options: {
          debounceDelay: 5000,
          interrupt: true
        },
        files: getWatchers(pkg),
        tasks: ['test']
      },  
      local: {
        options: {
          debounceDelay: 5000,
          interrupt: true
        },
        files: ['*.js','src/**/*.js', 'test/**/*.js'],
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
        reporter: 'min'
      },
      all: { src: ['test.js'] }
    },
shell: {
      makeStage: {
        command: 'rm -rf stage; mkdir stage',
        options:{
          stdout: true,
          stderr: true,
          failOnError: true
        }
      },
      makeLib: {
        command: 'rm -rf lib; mkdir lib',
        options:{
          stdout: true,
          stderr: true,
          failOnError: true
        }
      },
      browserify:{
        command: 'node ./node_modules/browserify/bin/cmd.js  --debug -o ./stage/test.js -i domain -e ./test.js;',
        options:{
          stdout: true,
          stderr: true,
          failOnError: true
        }
      },
      buildPouchDBClient:{
        command: 'cd node_modules/pouchdb; npm install; grunt;',
        options:{
          stdout: true,
          stderr: true,
          failOnError: true
        }
      },
      copyPouch:{
        command: 'cp -av node_modules/pouchdb/dist/pouchdb-nightly.min.js lib/pouch.min.js; cp -av node_modules/pouchdb/dist/pouchdb-nightly.js lib/pouch.js;',
        options:{
          stdout: true,
          stderr: true,
          failOnError: true
        }
      }
    },
    karma: {
      local: {
        configFile: 'karma.conf.js',
        singleRun: true,
        browsers: ['Safari'] //, 'Firefox', 'Safari', 'Opera'
      }
    },
    bump: {
        options: {},
        files: [ 'package.json']
    }
  });


require('matchdep').filterDev('grunt-*').forEach(grunt.loadNpmTasks);

grunt.registerTask('installold', ['shell:makeLib', 'shell:buildPouchDBClient', 'shell:copyPouch']);
grunt.registerTask('test', ['jshint', 'shell:makeStage', 'simplemocha','shell:browserify', 'karma']);
grunt.registerTask('development', ['bumpup:prerelease']);
grunt.registerTask('production', ['bumpup:patch']);
};