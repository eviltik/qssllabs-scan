var util = require('util');
var events = require('events').EventEmitter;
var options = require('./libs/options');
var async = require('async');
var request = require('request');
var fs = require('fs');
var findup = require('findup-sync');
var multimeter = require('multimeter');
var multi = multimeter(process);
var EOL = require('os').EOL;

var package = JSON.parse(fs.readFileSync(findup('package.json')));

var sslscan = function(opts,cb) {
    if (false === (this instanceof sslscan)) {
        return new sslscan(opts,cb);
    }

    var self = this;

    this.lastMessage = '';
    this.paused = false;
    this.progress = 0;
    this.progressTimer = null;
    this.activeAssessments = 0
    this.maxAssessments = -1
    this.retryCount = 0;
    this.command = '';
    this.analyseUrl = '';
    this.bars = {};
    this.cmdLine = true;
    this.options = opts;
    this.currentEndPointId = -1;
    this.previousProgress;

    if (!opts.ips) {
        // Called from a js script, reparse options
        options.parse(opts,function(err,opts) {
            self.cmdLine = false;
            self.options = opts;
            self.init();
            events.call(self);
            if (cb) cb(self);
        });
    } else {
        this.init();
        events.call(this);
    }
};

util.inherits(sslscan, events);

sslscan.prototype.shellOutput = function(msg) {
    process.stdout.write(msg);
};

sslscan.prototype.getOptions = function() {
    return this.options;
};

sslscan.prototype.init = function() {

    this.command = "analyze?host=" + this.options.host + "&all=done"

    if (this.options.fromCache == 'on') {
        this.command+="&fromCache=on"
        if (this.options.globalMaxAge != 0) {
            this.command+="&maxAge=" + this.options.globalMaxAge;
        }
    } else if (this.options.startNew == 'on') {
        this.command+="&startNew=on"
    }

    if (this.options.globalIgnoreMismatch == 'on') {
        this.command+="&ignoreMismatch=on"
    }

    this.analyseUrl = this.options.apiLocation+'/'+this.command;

    var logLevel = null;
    if (this.options.debug) logLevel = 'debug';
    this.log = require('./libs/logger').log(logLevel);

};

sslscan.prototype.loopAnalyse = function(cb) {
    
    var self = this;
    this.retryCount++;

    var reqId = this.retryCount;

    if (reqId>1) {
        // startNew only for the first call
        this.analyseUrl = this.analyseUrl.replace(/&startNew=on/,'');
    } else {
        self.emit('start');
    }

    this.log.debug('#'+reqId,"Request ",this.analyseUrl);

    var options = {
        url: this.analyseUrl,
        headers: {
            'User-Agent': package.name+' v'+package.version
        }
    };

    request(options,function(err, response, body) {

        if (err) {
            if (self.retryCount > 5) {
                self.lastMessage = "Too many HTTP requests failed";
            } else {
                self.lastMessage = "HTTP request failed: "+err;
                self.retryCount++;
            }
            self.emit('error',self.lastMessage);
            return cb(err);
        }

        self.log.debug('#'+this.reqId,'Response status: ',response.statusCode);

        var message = response.headers['x-message'];
        if (message) {
            self.log.debug('x-message',response.headers['x-message']);
        }

        // Adjust maximum concurrent requests.

        var headerValue = parseInt(response.headers['x-max-assessments']);
        
        if (headerValue <= 0) {
            // https://github.com/ssllabs/ssllabs-scan/issues/56
            self.lastMessage = 'Your IP has been blacklisted !';
            self.emit('error',self.lastMessage);
            return cb(msg);
        }

        if (headerValue > 1) {
            if (self.maxAssessments != headerValue) {
                self.maxAssessments = headerValue;
                self.log.debug("Server set max concurrent assessments to", headerValue);
            }
        }

        var status = response.statusCode;

        if (status == 429) {

            //429 - client request rate too high

            self.lastMessage = 'Sleeping for 30 seconds after a ',status,' response status';
            self.emit('sleep',self.lastMessage);

            return setTimeout(function() {
                self.loopAnalyse(cb);
            },30*1000);

        } else if (status == 503) {

            // 503 - the service is not available (e.g., down for maintenance)
            self.lastMessage = 'SSLLabs service is not available';
            self.emit('error',self.lastMessage);
            return cb(self.lastMessage);

        } else if (status == 529) {

            // 529 - the service is overloaded
            self.lastMessage = 'SSLLabs service overloaded';
            self.emit('error',self.lastMessage);
            return cb(self.lastMessage);


        } else if (status != 200 && status != 400) {

            self.lastMessage = 'Unexpected response status code '+status;
            self.emit('error',self.lastMessage);
            return cb(self.lastMessage);
        }

        // Everything fine, let's see if job is done

        try {
            var result = JSON.parse(response.body);
            if (result.status === "READY") {
                // assessments are available(s) = job done
                return cb(null,result);
            }

            self.log.debug(JSON.stringify(result,null,4));

            if (result.endpoints && result.endpoints.length) {
                if (self.currentEndPointId == -1) {
                    var endpoints = [];
                    for (var i = 0; i<result.endpoints.length;i++) {
                        endpoints.push(result.endpoints[i].serverName);
                    }
                    self.emit('endpoints',endpoints);
                    self.currentEndPointId = 0;
                } else {
                    for (var i = 0; i<result.endpoints.length;i++) {
                        var endpoint = result.endpoints[i];
                        if (i == self.currentEndPointId && endpoint.statusMessage == 'Ready') {
                            self.emit('progress',{
                                message:endpoint.serverName+': 100% done',
                                endpointId:self.currentEndPointId,
                                endpoint:endpoint
                            })
                            self.currentEndPointId++;
                        }
                    }

                    var currentEndPoint = result.endpoints[self.currentEndPointId];
                    if (currentEndPoint) {
                        var p = currentEndPoint.progress;
                        if (p == -1) p = 0;
                        self.emit('progress',{
                            message:currentEndPoint.serverName+': '+p+"% "+currentEndPoint.statusDetailsMessage,
                            endpointId:self.currentEndPointId,
                            endpoint:result.endpoints[currentEndPoint]
                        });
                    }
                }
            }

        } catch(e) {
            // json badly formated
            return cb(e);
        }

        // In progress ...

        return setTimeout(function() {
            self.loopAnalyse(cb);
        },5*1000);

    }.bind({reqId:reqId}));

};

sslscan.prototype.run = function() {

    this.shellOutput("SSLLabs assessments of "+this.options.host+EOL);

    var self = this;

    this.init();

    this.loopAnalyse(function(err,result) {
        if (err) {
            self.shellOutput('Error',err);
            return;
        }
        self.emit('end',result);
        return;
    });
};

module.exports = sslscan;
 
