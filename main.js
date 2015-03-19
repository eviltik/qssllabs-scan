var util = require('util');
var events = require('events').EventEmitter;
var options = require('./libs/options');

var async = require('async');


var sslscan = function(opts,cb) {
    if (false === (this instanceof sslscan)) {
        return new sslscan(opts,cb);
    }

    var self = this;

    this.lastMessage = 'Starting';
    this.paused = false;
    this.progress = 0;
    this.progressTimer = null;
    this.info = {
        nbIpToScan:0,
        nbPortToScan:0
    };
    this.cacheGeo = {};
    this.cacheDns = {};

    this.options = opts;

    if (!opts.ips) {
        // Called from a js script, reparse options
        options.parse(opts,function(err,opts) {
            self.options = opts;
            self.init();
            events.call(self);
            if (cb) cb(self);
        });
    } else {
        this.init();
        events.call(this);
    }
}

util.inherits(sslscan, events);

sslscan.prototype.getOptions = function() {
    return this.options;
}

module.exports = sslscan;
 
