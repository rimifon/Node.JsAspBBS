const portHttp = process.argv[2] ?? 3000;
const portHttps = process.argv[3] ?? 0;		// 0 表示不启用 HTTPS
const sites = [
	{ domain: "default", root: "wwwroot/default", key: "ssl/localhost/key.pem", cert: "ssl/localhost/server.crt" },		// 同步版 BBS（默认站点）
	{ domain: "127.34.56.77", root: "wwwroot/bbs-async" },	// 异步版 BBS（http://127.34.56.77:3000）
	{ domain: "127.34.56.78", root: "wwwroot/127.34.56.78" }	// 测试站点（http://127.34.56.78:3000）
];
const rewrite = {
	"default": [
		[ /^\/bbs\/(?!res|upload|weibo|default)/i, "/default.asp/" ]
	]
};
const proxy = {
	"localhost": { host: "fengyun.org", hostname: "bbs.fengyun.org", port: 80, protocol : "http" }
};
const indexPages = [ "index.html", "default.asp" ];

const cache = new Object;
const fs = require("fs");
const tls = require("tls");
const http = require("http");
const https = require("https");
const url = require("url");
const path = require("path");

process.chdir(__dirname);
const app = (req, res) => {
	const { pathname, query } = url.parse(req.url, true);
	const hostname = req.headers.host?.replace(/\:\d+$/, "") || "default";
	if(hostname in proxy) return IIS.proxy(req, res, proxy[hostname]);	// 反向代理处理
	const host = sites.find(s => s.domain == hostname) || sites[0];	// 默认为第一个站点
	const site = { host, out: new Array, req, res, query };
	var paths = IIS.rewrite(host, pathname).split(/\.asp(?=\/)/);
	// 服务端环境变量定义
	site.env = {
		...process.env,
		"REMOTE_ADDR": req.connection.remoteAddress.replace(/^\:\:ffff\:/, ""),
		"REQUEST_METHOD": req.method,
		"REQUEST_URI": req.url,
		"PATH_INFO": paths.slice(1).join(".asp"),
		"URL": decodeURIComponent(paths[1] ? paths[0] + ".asp" : paths[0])
	};
	for(var x in req.headers) site.env["HTTP_" + x.toUpperCase().replace(/\-/g, "_")] = req.headers[x];
	if(req.connection.encrypted) site.env["HTTPS"] = "on";
	// 输出错误信息
	site.outerr = (msg, code = 500, more) => {
		var err = { err: msg };
		if(more) err.more = more;
		res.writeHead(code, { "Content-Type": "text/plain; charset=UTF-8" });
		res.end(JSON.stringify(err));
	};
	// 禁止访问 app_data 目录
	if(/app_data/i.test(site.env.URL)) return site.outerr("403 Forbidden", 403);
	// 禁止访问 .. 路径
	if(/[\\\/]\.+[\\\/]/.test(site.env.URL)) return site.outerr("403 Forbidden", 403);
	// 获取目录相对位置（根目录还是请求目录）
	site.getPath = file => path.join(file[0] == "/" ? host.root : path.dirname(path.join(host.root, site.env.URL)), file);

	// 判断是目录还是文件
	fs.stat(path.join(site.host.root, site.env.URL), (err, stats) => {
		if(err) return site.outerr(err.message, 404);
		return stats.isFile() ? IIS.file(site) : IIS.folder(site);
	});

	// 结束请求
	site.send = str => {
		if(res.finished) return;
		site.out.push(str);
		res.writeHead(site.status || 200, { "Content-Type": site.contentType || "text/html; charset=UTF-8" });
		res.end(site.out.join(""));
		site.out.length = 0;
	};

};

// 启用 WebSocket 需要：npm install ws 模块
// const socket = require("./websocket");
var svrHttp = http.createServer(app);
svrHttp.listen(portHttp);
// socket.bind(svrHttp);
console.log("HTTP server running at " + portHttp);

if(portHttps > 0) fs.stat("ssl/default/key.pem", err => {
	if(err) return;	// 没有默认 SSL 证书，不启用 HTTPS 服务
	let pemKey = fs.readFileSync("ssl/default/key.pem", "utf-8");
	let pemCrt = fs.readFileSync("ssl/default/server.crt", "utf-8");
	var ssl = {
		SNICallback: (domain, cb) => {
			// 域名访问时才会触发 SNI
			var host = sites.find(s => s.domain == domain) || sites[0];
			var key = !host.key ? pemKey : host.pemKey ??= fs.readFileSync(host.key, "utf-8");
			var cert = !host.cert ? pemCrt : host.pemCrt ??= fs.readFileSync(host.cert, "utf-8");
			return cb(null, tls.createSecureContext({ key, cert }));
		}, key: pemKey, cert: pemCrt
	};
	var svrHttps = https.createServer(ssl, app);
	// socket.bind(svrHttps);
	svrHttps.listen(portHttps);
	console.log("HTTPS server running at " + portHttps);
});

// Internet Information Server
const IIS = {
	// 文件夹处理
	folder(site) {
		if(site.env.URL.slice(-1) != "/") return this.redir(site, site.env.URL + "/");
		// 判断是否存在默认页
		var hasIndex = false;
		indexPages.some(p => {
			let file = path.join(site.host.root, site.env.URL, p);
			if(!fs.existsSync(file)) return false;
			site.env.URL += p;
			return hasIndex = true;
		});
		if(!hasIndex) return site.outerr("403 Forbidden", 403);
		return this.file(site);
	}
	// 静态文件处理
	,file(site) {
		// 判断是否 ASP
		if(/\.asp$/i.test(site.env.URL)) return this.asp(site);
		var file = path.join(site.host.root, site.env.URL);
		stat = fs.statSync(file);
		var headers = { "Content-Type": getMime(path.extname(file)) };
		var output = (code, arg) => {
			headers["Last-Modified"] = stat.mtime.toUTCString();
			site.res.writeHead(code, headers);
			if(site.req.method == "HEAD") return site.res.end();
			fs.createReadStream(file, arg || {}).pipe(site.res)
		};
		var rangeHeader = site.req.headers.range;
		// 没有 Range 头时
		if(!rangeHeader) {
			headers["Content-Length"] = stat.size;
			headers["Cache-Control"] = "max-age=2592000";
			return output(200);
		}
		// 存在 Range 头时
		var [ start, end ] = rangeHeader.match(/(\d+)/g) || [];
		if(!start) start = 0;
		if(!end) end = stat.size - 1;
		var contentLength = end - start + 1;
		headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
		headers["Accept-Ranges"] = "bytes";
		headers["Content-Length"] = contentLength;
		output(206, { start: start - 0, end: end - 0 });
	}
	// ASP 请求处理
	,asp(site) {
		var file = path.join(site.host.root, site.env.URL);
		site.buffer = Buffer.alloc(0);
		site.req.on("data", chunk => { site.buffer = Buffer.concat([site.buffer, chunk]); });
		site.req.on("end", () => {
			site.body = site.buffer.toString();
			// 解析表单内容
			site.form = parseForm(site);
			aspParser(takeAspCode(site, file), site);
		});
	}
	// 重定向处理
	,redir(site, url) {
		site.res.writeHead(302, { "Location": url });
		site.res.end();
	}
	// 反向代理
	,proxy(req, res, target) {
		if(target?.hostname) req.headers.host = target.hostname;	// 重写 Host 头
		req.headers['x-real-ip'] = req.connection.remoteAddress.replace(/^::ffff:/, "");
		var forward = req.headers["x-forwarded-for"] || "";
		if(forward) forward += ", ";
		req.headers["x-forwarded-for"] = forward + req.headers['x-real-ip'];
		var options = {
			hostname: target?.host || "127.34.56.78",
			port: target?.port || 80,
			path: req.url,
			method: req.method,
			headers: req.headers
		};
		var proxy = (target?.protocol == "https" ? https: http).request(options);
		req.on("data", chunk => proxy.write(chunk));
		req.on("end", () => proxy.end() );
		proxy.on("response", pxy => {
			res.writeHead(pxy.statusCode, pxy.headers);
			pxy.on("data", chunk => res.write(chunk));
			pxy.on("end", () => res.end());
		});
		proxy.on("error", err => {
			res.writeHead(502, { "Content-Type": "text/plain" });
			res.end(err.message);
		});
	}
	// 重写模块
	,rewrite(host, path) {
		var domain = host.domain;
		if(!rewrite[domain]) return path;
		rewrite[domain].forEach(x => { path = path.replace(x[0], x[1]); });
		return path;
	}
};

// 文件 mime 类型
function getMime(ext) {
	var mime = {
		".html": "text/html; charset=UTF-8",
		".js": "text/javascript",
		".css": "text/css",
		".json": "application/json",
		".png": "image/png",
		".jpg": "image/jpeg",
		".jpeg": "image/jpeg",
		".gif": "image/gif",
		".svg": "image/svg+xml",
		".ico": "image/x-icon",
		".txt": "text/plain; charset=UTF-8",
		".pdf": "application/pdf",
		".woff": "application/font-woff",
		".woff2": "application/font-woff2",
		".ttf": "application/font-ttf",
		".eot": "application/vnd.ms-fontobject",
		".otf": "application/font-otf",
		".mp4": "video/mp4",
		".webm": "video/webm",
		".wav": "audio/wav",
		".mp3": "audio/mpeg",
		".ogg": "audio/ogg",
		".xml": "application/xml"
	};
	return mime[ext] || "application/octet-stream";
}

// 解析表单内容
function parseForm(site) {
	// 判断 是否 Multipart/form-data
	if(/multipart\/form-data/i.test(site.req.headers["content-type"])) return parseMultipart(site);
	// 判断 是否 application/x-www-form-urlencoded
	if(site.req.headers["content-type"] == "application/x-www-form-urlencoded") return parseUrlEncoded(site);
	// 输出 JSON
	try { return JSON.parse(site.body || "{}"); } catch(e) { return e; }
}

// 上传内容处理
function parseMultipart(site) {
	var form = new Object, start = 0;
	var boundary = site.req.headers["content-type"].split("boundary=")[1];
	if(!boundary) return form;
	while(true) {
		let ost = site.buffer.indexOf(boundary, start);
		if(ost < 0) break;
		let item = site.buffer.slice(start, ost);
		start = ost + boundary.length;
		var sperator = item.indexOf("\r\n\r\n");
		if(sperator < 0) continue;
		let header = item.slice(0, sperator).toString();
		let data = item.slice(item.indexOf("\r\n\r\n") + 4, -4);
		let [ , field, , name ] = header.split('"');
		form[field] = !name ? data.toString() : { name, data, size: data.length };
	}
	return form;
}

// 标准表单处理
function parseUrlEncoded(site) {
	var form = new Object;
	var body = site.body.split("&");
	var utf = str => {
		try { return decodeURIComponent(str?.replace(/\+/g, "%20")); }
		catch(err) { return str; }
	};
	body.forEach(item => {
		if(!item) return;
		var [ key, value ] = item.split("=");
		form[utf(key)] = utf(value);
	});
	return form;
}

// ASP 解析器
function aspParser(code, site, notRun = false, args = new Object) {
	const compileAsp = (site, code, notRun, args) => {
		if(!notRun && site.asp.func) return site.asp.func;
		// inlude 方法加载时需要重新解析 #include 指令
		if(notRun) code = includeFile(code, site);
		let regAsp = /<%[\s\S]+?%>/g;
		// 先将参数定义写入组合代码
		const output = { loadArg: k => args[k] };
		// 纯html代码，纯asp代码，组合代码
		output.html = code.split(regAsp);
		output.asp = code.match(regAsp) || new Array;
		output.code = new Array;
		for(var k in args) output.code.push(`var ${k} = output.loadArg("${k}");`);
		output.blockWrite = (i, Response) => Response.Write(output.html[i]);	// 写入缓冲
		output.html.forEach((v, i) => {
			if(v) output.code.push("output.blockWrite(" + i + ", Response);");
			var js = output.asp[i]?.slice(2, -2).replace(/(^\s+|\s+$)/g, "");
			if(!js) return;
			if(js.charAt(0) == "=") js = "Response.Write(" + js.slice(1) + ");";
			output.code.push(js);
		});
		try { eval("var func = async (site, include, Server, Request, Response) => { " + output.code.join("\r\n") + " };"); }
		catch(err) { site.outerr(JSON.stringify({
			name: err.name, err: err.message, stack: err.stack
		})); return new Function; }
		let compiledFunc = async function(site, notRun) {
			const { include, Server, Request, Response } = aspHelper(site);
			await func(site, include, Server, Request, Response);
			if(!notRun) site.send();
		};
		if(!notRun) site.asp.func = compiledFunc;
		return compiledFunc;
	};
	(async func => {
		try { await func(site, notRun); }
		catch(err) {
			site.outerr(JSON.stringify({
				name: err.name, file: site.env.URL, err: err.message, stack: err.stack
			}), 500);
		}
	})(compileAsp(site, code, notRun, args));
}

// 加载 ASP 代码，减少重复读取
function takeAspCode(site, file) {
	IIS.ASP ??= new Object;
	site.asp = IIS.ASP[file];
	if(site.asp) {
		// 3 秒内不重复检测文件更新
		if(site.asp.checkTime > new Date - 3e3) return site.asp.code;
		site.asp.checkTime = new Date - 0;
		let files = site.asp.files, notModify = true;
		// 判断每个文件是否有更新
		for(var x in files) {
			// 实际文件更新时间，如果文件已被删除，则认为已更新
			var mtime = fs.existsSync(x) ? fs.statSync(x).mtime : 1;
			if(files[x] == mtime - 0) continue;
			console.log("[" + new Date + "]", x, `被修改，重新编译${site.env.URL}。`);
			notModify = false; break;
		}
		// 没有更新，直接返回 code
		if(notModify) return site.asp.code;
	}
	site.asp = IIS.ASP[file] = { files: new Object, checkTime: new Date - 0 };
	site.asp.files[file] = fs.statSync(file).mtime - 0;
	// 读取文件
	return site.asp.code = includeFile(fs.readFileSync(file, "utf-8"), site, site.asp.files);
}

// 处理包含指令
function includeFile(code, site, files = new Object) {
	var reg = /<\!\-\- #include (file|virtual)\="(.+?)" \-\->/i;
	if(!reg.test(code)) return code;
	var pwd = path.dirname(path.join(site.host.root, site.env.URL));
	var cwd = site.cwd || pwd;		// 当前目录
	var getFilePath = () => {
		// 优先尝试 cwd 路径
		let file = path.join(cwd, RegExp.$2);
		return fs.existsSync(file) ? file : path.join(pwd, RegExp.$2);
	};
	var file = RegExp.$1.toLocaleLowerCase() == "file" ? getFilePath() : path.join(site.host.root, RegExp.$2);
	var fileExists = fs.existsSync(file);
	if(fileExists) files[file] = fs.statSync(file).mtime - 0;
	var text = fileExists ? fs.readFileSync(file, "utf-8") : "";
	site.cwd = path.dirname(file);	//	更新当前目录
	// 再次包含
	return includeFile(code.replace(reg, text), site, files);
}

// ASP 辅助方法
function aspHelper(site) {
	var helper = {
		include(file, args) {
			var fpath = path.dirname(path.join(site.host.root, site.env.URL));
			var fname = path.join(fpath, file);
			if(!fs.existsSync(fname)) return "";
			var code = fs.readFileSync(fname, "utf8");
			return aspParser(code, site, true, args);
		},
		Server: {
			MapPath: str => site.getPath(str),
			CreateObject: progid => {
				const func = () => func;
				func.toString = () => `[${progid}]暂未实现`;
				return new Proxy(func, { get: o => o });
			 },
			Transfer(url, args) { return this.Execute(url, args); },
			Execute(file, args = new Object) { return helper.include(file, args); }
		},
		Request: {
			Form(key) { return site.form[key]; },
			QueryString(key) { return site.query[key]; },
			ServerVariables(key) { return site.env[key]; }
		},
		Response: {
			Write(str) { site.out.push(str); },
			Redirect(url) { IIS.redir(site, url); }
		}
	};
	return helper;
}

// 初始化 Session
function InitSession(site) {
	var sessKey = site.sessKey ??= site.req.headers.cookie?.match(/ASPSESSIONID\=(\w+)/)?.[1] || site.env.HTTP_ASPSESSIONID;
	if(!sessKey) {
		sessKey = site.sessKey = new Date().valueOf().toString(36).toUpperCase() + Math.random().toString(36).slice(2).toUpperCase();
		site.res.setHeader("Set-Cookie", `ASPSESSIONID=${sessKey}; path=/; SameSite=${ site.env.HTTPS ? "None; Secure" : "Lax" }`);
		site.res.setHeader("AspSessionID", sessKey);
	}
	cache.Session ??= new Object;
	var session = cache.Session[site.host.domain] ??= new Object;
	var rs = session[sessKey] ??= new Object;
	if(rs.time) { rs.time = new Date; return rs; }
	rs.time = new Date; rs.sessKey = sessKey; rs.data = new Object;
	rs.data.sessId = site.host.SessionSeed = -~site.host.SessionSeed;
	// 20 分钟自动掉线
	function autoLogout() {
		if(!session[sessKey]) return;
		// 离过期还有多少时间
		var time = new Date - rs.time - 1000 * 60 * 20;
		if(time >= 0) return delete session[sessKey];
		setTimeout(autoLogout, -time);	// 重新计时
	}
	setTimeout(autoLogout, 1000 * 60 * 20);
	return rs;
}

// 日期格式化
Date.prototype.toString = function(fmt = "yyyy-MM-dd hh:mm:ss") {
	var o = {
		"M+": this.getMonth() + 1,
		"d+": this.getDate(),
		"h+": this.getHours(),
		"m+": this.getMinutes(),
		"s+": this.getSeconds(),
		"q+": Math.floor((this.getMonth() + 3) / 3),
		"S": this.getMilliseconds()
	};
	if(/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
	for(var k in o) if(new RegExp("(" + k + ")").test(fmt)) fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
	return fmt;
};
Date.prototype.toJSON = function() { return this.toString(); };
