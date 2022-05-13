<!-- #include file="core.asp" --><%
sys.debug = true;	// 默认启用调式跟踪

await (async route => {
	sys.ns = path.dirname(env("URL"));
	if("function" != typeof boot) return;
	try {
		let rs = await boot(route);
		echo(rs instanceof Object ? tojson(rs) : rs);
	} catch(err) {
		// site.out.length = 0;
		dbg().trace({ err: err.message, sql : db().lastSql });
		echo(tojson({ err: err.message }));
	}
	finally{ closeAllDb(); dbg().appendLog(); }
})(qstr("r") ? qstr("r").split("/") : env("PATH_INFO").slice(1).split("/"));

function me() {
	if(sys.me) return sys.me;
	var ins = sys.me = ss(sys.ns).me ??= new Object;
	ins.bind = function(user) { user.isLogin = true; ss(sys.ns).me = user; delete sys.me; };
	ins.lose = function() { delete ss(sys.ns).me; delete sys.me; };
	return ins;
}

// 访问监控
function dbg() {
	return sys.dbg || new function() {
		// 已关闭调试功能
		if(!sys.debug) return sys.dbg = { appendLog: function() {}, trace: function() {} };
		// 得到缓存数据
		if(!cc().debug) cc().debug = { last: new Array, slow: new Array, logs: new Array };
		let cache = cc().debug, logs = { rows : new Array };
		this.appendLog = function() {
			var today = sys.sTime.getDate();
			// 访问计数递增
			if(today != cache.date) {
				cache.date = today;
				cache.yesterday = ~~cache.today;
				cache.today = 0;
			}
			cache.today = -~cache.today;
			let route = qstr("r") || env("PATH_INFO")?.slice(1), url = env("URL"), method = env("REQUEST_METHOD"), ip = env("REMOTE_ADDR");
			let time = sys.sTime, exec = new Date - sys.sTime;
			// 方法，路径，路由，IP，访问时间，执行时间
			let row = [ method, url, route, ip, time, exec ];
			// 记录最新日志
			cache.last.unshift(row);
			if(cache.last.length > 100) cache.last.length = 100;
			// 记录调试信息
			if(logs.rows.length) {
				// 方法，路径，路由，时间，时长
				logs.info = [ env("REQUEST_METHOD"), env("URL"), route, sys.sTime, new Date - sys.sTime ];
				cache.logs.unshift(logs);
			}
			if(cache.logs.length > 100) cache.logs.length = 100;
			// 记录慢日志
			let minTime = cache.minTime || 0;
			if(exec < minTime) return;
			cache.slow.push(row);
			cache.slow.sort(function(a, b) { return b[5] - a[5]; });
			if(cache.slow.length > 100) cache.slow.length = 100;
			cache.minTime = cache.slow[ cache.slow.length - 1 ][5];
		};
		this.trace = function(...args) {
			for(var i = 0; i < args.length; i++) {
				var data = args[i];
				logs.rows.push([ data instanceof Object ? tojson(data) : data, new Date - sys.sTime ]);
			}
		};
		sys.dbg = this;
	};
}
%>