var net = require('net');
var dns = require('dns');
var async = require('async');

var getTargets = function(target,cb) {

    if (!target) {
        return cb("Please specify at least a host using --host [ipv4|host], example:\nqsslscan www.test.com");
    }

    async.series([
        function(next) {
            if (target.match(/[a-z]/i) && !target.match(/\//) && !net.isIPv6(target)) {
                dns.resolve4(target,next);
            } else {
                next(null,[[target]]);
            }
        }
    ],function(err,result) {
        if (err) {
            if (err.code=='ENOTFOUND') {
                return cb('Could not resolve '+target);
            }
            return cb(err);
        }

        if (net.isIPv6(target)) {
            return cb("IPv6 not supported");
        }

        if (target == '127.0.0.1') {
            return cb("Qualys API will not be able to reach localhost !");
        }

        if (!net.isIPv4(target)) {
            return cb("Target "+target+" is not a valid IPv4");
        } else {
            return cb(null,[target]);
        }

        return cb("Target: unknow error");
    });
}


var defaultValues = function(argv) {
    if (!argv.timeout) {
        argv.timeout = 2000;
    }

    if (!argv.status) {
        argv.status = 'O';
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

    var optimist = require('optimist')
        .usage('Usage: evilscan <fqdn|ipv4|cidr> [options]\n\nExample: evilscan 192.168.0.0/24 --port=21-23,80')
        .demand('_')

        .describe(
            'port',
            'port(s) you want to scan, examples:\n'+
            '--port=80\n'+
            '--port=21,22\n'+
            '--port=21,22,23,5900-5900\n'
        )
        .describe(
            'reverse',
            'display DNS reverse lookup'
        )
        .describe(
            'reversevalid',
            'only display results having a valid reverse dns, except if ports specified'
        )
        .describe(
            'geo',
            'display geoip (free maxmind)'
        )
        .describe(
            'banner',
            'display grabbed banner when available'
        )
        .describe(
            'bannerraw',
            'display raw banner (as a JSON Buffer)'
        )
        .describe(
            'bannerlen',
            'grabbed banner length in bytes\n'+
            'default 512'
        )
        .describe(
            'progress',
            'display progress indicator each seconds\n'
        )
        .describe(
            'status',
            'ports status wanted in results (example --status=OT)\n'+
            'T(timeout)\n'+
            'R(refused)\n'+
            'O(open, default)\n'+
            'U(unreachable)\n'
        )
        .describe(
            'scan',
            'scan method\n'+
            'tcpconnect (full connect, default)\n'+
            'tcpsyn (half opened, not yet implemented)\n'+
            'udp (not yet implemented)\n'
        )
        .describe(
            'concurrency',
            'max number of simultaneous socket opened\n'+
            'default 500\n'
        )
        .describe(
            'timeout',
            'maximum number of milliseconds before closing the connection\n'+
            'default 2000\n'
        )
        .describe(
            'hugescan',
            'allow number of ip/port combinaison greater than 16580355\n'+
            '(i.e a /24 network with port range 0-65535)'
        )
        .describe(
            'display',
            'display result format (json,xml,console)\n'+
            'default console\n'
        )
        .describe(
            'json',
            'shortcut for --display=json'
        )
        .describe(
            'xml',
            'shortcut for --display=xml'
        )
        .describe(
            'console',
            'shortcut for --display=console'
        )
        .describe(
            'help',
            'display help'
        )
        .describe(
            'about',
            'display about'
        )
        .describe(
            'version',
            'display version number'
        )
        .wrap(80)

    var argv = optimist.parse(args);

    // merge options when used in a node module
    // because we are passing options without "--"
    // like when using evilscan with the command line
    for (var attr in args) {
        argv[attr] = args[attr];
    }

    // we don't care about that
    delete argv['$0'];

    argv = help(optimist,argv);
    argv = defaultValues(argv);

    async.series([
        function(next) {
            getTargets(argv._[2]||args.target,next);
        },
        function(next) {
            getPorts(argv.port||args.port,next);
        }
    ],function(err,result) {

        if (err) return cb(err);

        argv.ips = result[0];
        argv.ports = result[1];

        cb(null,argv);
    });
}


module.exports = {
    parse:parse
}
