var winston = require('winston');
var cluster = require('cluster');
winston.cli();

var log = function(level) {
	return new (winston.Logger)({
		level:level||'info',
	    transports: [
			new (winston.transports.Console)({
	            colorize:true,
	            level:level||'info',
				timestamp:function() {
					var d = new Date();
					var h = (d.getHours()<10 ? "0" : "")+d.getHours();
					var m = (d.getMinutes()<10 ? "0" : "")+d.getMinutes();
					var s = (d.getSeconds()<10 ? "0" : "")+d.getSeconds();
					var mm = d.getMilliseconds();
					if (mm<10) mm='0'+mm;
					if (mm<100) mm='0'+mm;
					var str = h+':'+m+':'+s+'.'+mm;
					var ms = '|MM';
					if (cluster && cluster.worker && cluster.worker.id) ms = '|S'+cluster.worker.id;
					str+=ms;
					return str;
				}
			})
		]
	});
}

module.exports = {
    log:log
}
