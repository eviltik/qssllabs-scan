var net = require('net');
var dns = require('dns');
var async = require('async');

var getHost = function(host,cb) {

    if (!host) {
        return cb("Please specify at least a host using --host [ipv4|host], example:\nqsslscan www.test.com");
    }

    async.series([
        function(next) {
            dns.resolve4(host,next);
        }
    ],function(err,result) {
        if (err) {
            if (err.code=='ENOTFOUND') {
                return cb('Could not resolve '+host);
            }
            return cb(err);
        }

        if (host == '127.0.0.1') {
            return cb("Qualys API will not be able to reach your ... localhost !");
        }

        return cb(null,host);
    });
}


var defaultValues = function(argv) {
    if (!argv.apiLocation) {
        argv.apiLocation = "https://api.ssllabs.com/api/v2";
    }

    if (!argv.ignoreMismatch) {
        argv.ignoreMismatch = false;
    }

    if (argv.json) {
        argv.display = 'json';
    }

    if (argv.xml) {
        argv.display = 'xml';
    }

    if (argv.console) {
        argv.display = 'console';
    }

    if (!argv.display) {
        argv.display = 'console';
    }

    if (argv.display == 'console') {
        argv.console = true;
    }

    if (argv.display == 'json') {
        argv.json = true;
    }

    if (argv.display == 'xml') {
        argv.xml = true;
    }

    if (!argv.timeout) {
        argv.timeout = 2000;
    }
    return argv;
}

var help = function(optimist,argv) {
    if (argv.help) {
        optimist.showHelp();
        process.exit(0);
    }

    if (argv.version||argv.about) {
        var fs = require('fs');
        var package = JSON.parse(fs.readFileSync(findup('package.json')));
    }

    if (argv.version) {
        console.log(package.version);
        process.exit(0);
    }

    if (argv.about) {
        console.log(
            package.name,
            package.version,'\n',
            'Resume: '+package.description,'\n',
            'License: '+package.license,'\n',
            'Author: '+package.author,'\n',
            'Repository: '+package.repository.url.replace(/git/,'http')
        );
        process.exit(0);
    }
    return argv;
}

var parse = function(args,cb) {

    var isHostOrIpV4 = function(args) {
        return args['_']&&args['_'][0]&&args['_'][0].match(/^[0-9a-z\.]+$/i);
    };

    var checkOptions = function(args) {
        if (args.publish!='on' && args.publish!='off') return false;
        if (args.ignoreMismatch!='on' && args.ignoreMismatch!='off') return false;
        if (args.startNew!='on' && args.startNew!='off') return false;
        if (args.fromCache!='on' && args.fromCache!='off') return false;
        if (typeof args.maxAge!='number' && args.maxAge<=0) return false;
        return true;
    }

    var argv = require('yargs')
        .usage('Usage: $0 <host> [options]')
        .command('host', 'host to check')
        .demand(0)
        .check(isHostOrIpV4)
        .example('$0 host', 'launch Qualys SSL Server Test on host')
        //.describe('f', 'Load a file')
        .options({
            'publish':{
                'default':'off',
                'describe':'set to "on" if assessment results should be published on the public results boards; optional.',
                'type':'string'
            },
            'ignoreMismatch':{
                'default':'off',
                'describe':'set to "on" to proceed with assessments even when the server certificate doesn\'t match the assessment hostname. Set to off by default. Please note that this parameter is ignored if a cached report is returned.',
                'type':'string'
            },
            'startNew':{
                'default':'on',
                'describe':'if set to "on" then cached assessment results are ignored and a new assessment is started. However, if there\'s already an assessment in progress, its status is delivered instead. This parameter should be used only once to initiate a new assessment; further invocations should omit it to avoid causing an assessment loop.',
                'type':'string'
            },
            'fromCache':{
                'default':'off',
                'describe':'always deliver cached assessment reports if available; optional, defaults to "off". This parameter is intended for API consumers that don\'t want to wait for assessment results. Can\'t be used at the same time as the startNew parameter.',
                'type':'string'
            },
            'maxAge':{
                'default':0,
                'describe':'maximum report age, in hours, if retrieving from cache (fromCache parameter set).',
                'type':'number'
            },
            'debug':{
                'default':false,
                'describe':'debug logs enabled',
                'type':'boolean'
            }
        })
        .check(checkOptions)
        .argv;

    // merge options when used in a node module
    // because we are passing options without "--"
    // like when using qsslscan with the command line
    for (var attr in args) {
        argv[attr] = args[attr];
    }

    // we don't care about that
    delete argv['$0'];

    argv = defaultValues(argv);

    async.series([
        function(next) {
            getHost(argv._[0]||args.host,next);
        }
    ],function(err,result) {

        if (err) return cb(err);

        argv.host = result[0];

        cb(null,argv);
    });
}


module.exports = {
    parse:parse
}
