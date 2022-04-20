const port = process.argv[2] ?? 3000;
const indexPages = [ "index.html", "default.asp" ];
const sites = [
	{ domain: "default", root: "wwwroot/default" },
	{ domain: "127.34.56.78", root: "wwwroot/127.34.56.78" }
];
const cache = new Object;

const fs = require("fs");
const http = require("http");
const url = require("url");
const path = require("path");

http.createServer((req, res) => {
	const { pathname, query } = url.parse(req.url, true);
	const hostname = req.headers.host.replace(/\:\d+$/, "");
	var host = sites.find(s => s.domain == hostname);
	if(!host) host = sites[0];	// 默认为第一个站点
	var site = { host, out: new Array, req, res, query };
	var paths = pathname.split(/\.asp(?=\/)/);
	// 服务端环境变量定义
	site.env = {
		"REMOTE_ADDR": req.connection.remoteAddress,
		"REQUEST_METHOD": req.method,
		"HTTP_HOST": req.headers.host,
		"HTTP_USER_AGENT": req.headers["user-agent"],
		"HTTP_REFERER": req.headers.referer,
		"HTTP_X_FORWARDED_FOR": req.headers["x-forwarded-for"],
		"HTTP_X_FORWARDED_PROTO": req.headers["x-forwarded-proto"],
		"HTTP_ORIGIN": req.headers.origin,
		"HTTP_AUTHORIZATION": req.headers.authorization,
		"PATH_INFO": paths.slice(1).join(".asp"),
		"URL": paths[1] ? paths[0] + ".asp" : paths[0]
	};
	// 输出错误信息
	site.outerr = (msg, code = 500, more) => {
		var err = { err: msg };
		if(more) err.more = more;
		res.writeHead(code, { "Content-Type": "text/plain; charset=UTF-8" });
		res.end(JSON.stringify(err));
	};
	// 禁止访问 app_data 目录
	if(/app_data/i.test(site.env.URL)) return site.outerr("403 Forbidden", 403);
	// 获取目录相对位置（根目录还是请求目录）
	site.getPath = file => path.join(file[0] == "/" ? host.root : path.join(host.root, site.env.URL), file);

	// 判断是目录还是文件
	fs.stat(path.join(site.host.root, site.env.URL), (err, stats) => {
		if(err) return site.outerr(err.message, 500);
		return stats.isFile() ? IIS.file(site) : IIS.folder(site);
	});

	// 结束请求
	site.send = str => {
		site.out.push(str);
		res.writeHead(site.status ?? 200, { "Content-Type": "text/html; charset=UTF-8" });
		res.end(site.out.join(""));
		site.out.length = 0;
	};

}).listen(port);

console.log("Server running at " + port);

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
		var ext = path.extname(file);
		var mime = getMime(ext);
		site.res.writeHead(200, { "Content-Type": mime });
		fs.createReadStream(file).pipe(site.res);
	}
	// ASP 请求处理
	,asp(site) {
		var file = path.join(site.host.root, site.env.URL);
		site.body = "";
		site.req.on("data", chunk => { site.body += chunk; });
		site.req.on("end", () => {
			// 解析表单内容
			site.form = parseForm(site);
			fs.readFile(file, "utf-8", (err, code) => {
				if(err) return outerr(err.message, 500);
				// 执行 ASP 脚本
				aspParser(code, site);
			});
		});
	}
	// 重定向处理
	,redir(site, url) {
		site.res.writeHead(302, { "Location": url });
		site.res.end();
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
	if(site.req.headers["content-type"] == "multipart/form-data") return parseMultipart(site);
	// 判断 是否 application/x-www-form-urlencoded
	if(site.req.headers["content-type"] == "application/x-www-form-urlencoded") return parseUrlEncoded(site);
	// 输出 JSON
	try{ return JSON.parse(site.body || "{}"); }catch(e){ return e; }
}

// 上传内容处理
function parseMultipart(site) {
	var form = new Object;
	var boundary = site.req.headers["content-type"].split("=")[1];
	var body = site.body.split(boundary);
	body.forEach(item => {
		var [ key, value ] = item.split("\r\n\r\n");
		var [ type, name ] = key.split("; ");
		var [ , filename ] = type.split("=");
		var [ , filetype ] = type.split("=");
		var [ , filesize ] = type.split("=");
		var [ , filepath ] = type.split("=");
		var [ , file ] = value.split("\r\n");
		form[name] = { filename, filetype, filesize, filepath, file };
	});
	return form;
}

// 标准表单处理
function parseUrlEncoded(site) {
	var form = new Object;
	var body = site.body.split("&");
	body.forEach(item => {
		if(!item) return;
		var [ key, value ] = item.split("=");
		form[decodeURIComponent(key)] = decodeURIComponent(value);
	});
	return form;
}

// ASP 解析器
function aspParser(code, site, notRun = false, args = new Object) {
	site.sys ??= { sTime: new Date };
	var sys = site.sys;
	sys.domain = site.host.domain;
	sys.ns = sys.domain + "|" + path.dirname(site.env.URL) + "|";
	code = includeFile(code, site);
	var reg = /<%[\s\S]+?%>/g;
	// 纯html代码，纯asp代码，组合代码，输出缓冲
	var arr1 = code.split(reg), arr2 = code.match(reg) || new Array, arr3 = new Array, arr4 = site.out;
	// 先将参数定义写入组合代码
	var loadArg = k => args[k];
	for(var k in args) arr3.push(`var ${k} = loadArg("${k}");`);
	var blockWrite = i => arr4.push(arr1[i]);	// 写入缓冲
	arr1.forEach((v, i) => {
		arr3.push("blockWrite(" + i + ");");
		var js = arr2[i]?.slice(2, -2).replace(/(^\s+|\s+$)/g, "");
		if(!js) return;
		if(js.charAt(0) == "=") js = "arr4.push(" + js.slice(1) + ");";
		arr3.push(js);
	});
	const { qstr, form, env, include } = aspHelper(site);
	var echo = str => arr4.push(str);
	var runAsp = async function() {
		if("function" != typeof boot) return site.send();
		// 同时支持 r 路由和 path_info 路由
		var route = qstr("r") ? ("/" + qstr("r")).split("/") : site.env.PATH_INFO.split("/");
		route.shift(); try { var rs = await boot(route);
		if(rs instanceof Object) rs = JSON.stringify(rs);
		site.send(rs); } catch(e){ site.outerr(e.message); }
		finally{ closeAllDb(); dbg().appendLog(); }
	}; try {
		if(!notRun) arr3.push("runAsp();");
		eval(arr3.join("\r\n"));
	} catch(err) {
		return site.outerr(JSON.stringify({
			name: err.name,
			file: site.env.URL,
			err: err.message,
			stack: err.stack
		}), 500);
	}
}

// 处理包含指令
function includeFile(code, site) {
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
	var text = fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";
	site.cwd = path.dirname(file);	//	更新当前目录
	// 再次包含
	return includeFile(code.replace(reg, text), site);
}

// ASP 辅助方法
function aspHelper(site) {
	var helper = {
		// apidoc(api, route, dep = 0) {
		// 	var ctrl = route[dep]?.toLowerCase() || "index";
		// 	if(!api[ctrl]) return { err: "Controller not found." };
		// 	if("function" == typeof api[ctrl]) return api[ctrl]();
		// 	return helper.apidoc(api[ctrl], route, dep + 1);
		// },
		// include 方法
		include(file, args) {
			var fpath = path.dirname(path.join(site.host.root, site.env.URL));
			var fname = path.join(fpath, file);
			if(!fs.existsSync(fname)) return "";
			var code = fs.readFileSync(fname, "utf8");
			return aspParser(code, site, true, args);
		},
		redir(url) { return IIS.redir(site, url); },
		qstr(k) { return !k ? site.query : site.query[k]; },
		form(k) { return !k ? site.form : site.form[k]; },
		env(k) { return !k ? site.env : site.env[k]; }
	};
	return helper;
}

// 初始化 Session
function InitSession(site) {
	var sessKey = site.req.headers.cookie?.match(/ASPSESSIONID\=(\w+)/)?.[1];
	if(!sessKey) {
		sessKey = new Date().valueOf().toString(36).toUpperCase() + Math.random().toString(36).slice(2).toUpperCase();
		site.res.setHeader("Set-Cookie", `ASPSESSIONID=${sessKey}; path=/; SameSite=Lax`);
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
		if(time < 0) return delete session[sessKey];
		setTimeout(autoLogout, time);	// 重新计时
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