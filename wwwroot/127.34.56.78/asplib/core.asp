<%
var sys = { sTime: new Date };

function ss(ns) {
	if(!ns) ns = "global.";
	var root = InitSession(site).data;
	root[ns + "root"] ??= { sessId: root.sessId };
	return root[ns + "root"];
}

function cc(k, f, t) {
	cache.redis ??= new Object;
	var root = cache.redis[site.host.domain] ??= new Object;
	if(!k) return root;
	var rs = root[k];
	var timer = t * 1000;
	if(rs) {
		if(rs.time - sys.sTime + timer > 0) return rs.value;
		// 数据过期了，重新获取
		clearTimeout(rs.handler);
	}
	try { var value = f(); }
	catch(err) { throw err; }
	var saveVal = value => {
		if(value === k.none) return;
		// 没有初始化
		root[k] = { value, time: sys.sTime };
		root[k].handler = setTimeout(() => {
			// 定时清理缓存
			if(!root[k]) return;
			delete root[k];
		}, timer);
		return value;
	};
	if(value instanceof Promise) return value.then(v => saveVal(v) ), value;
	return saveVal(value);
}

function echo(str) { Response.Write(str); }
function html(str) { return (str + "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function tojson(obj) { return JSON.stringify(obj); }
function fromjson(str) { return JSON.parse(str); }
function redir(url) { Response.Redirect(url); }
function mappath(path) { return Server.MapPath(path); }
function qstr(k) { return !k ? { ...site.query } : site.query[k]; }
function form(k) { return !k ? site.form : site.form[k]; }
function env(k) { return !k ? site.env : site.env[k]; }

function ajax(href, data, headers, ssl = new Object) {
	if("string" == typeof headers) headers = { "Content-Type": headers };
	headers ??= new Object;
	let parseArg = function() {
		if(!data) return "";
		if("string" == typeof data) return data;
		if(headers["Content-Type"] == "application/json") return tojson(data);
		let arr = new Array;
		for(let k in data) arr.push(encodeURIComponent(k) + "=" + encodeURIComponent(data[k]));
		if(arr.length) headers["Content-Type"] = "application/x-www-form-urlencoded";
		return arr.join("&");
	}
	let body = parseArg();
	headers["Content-Length"] = Buffer.byteLength(body);
	let { hostname, port, path, protocol } = url.parse(href);
	port ??= protocol.toLowerCase() == "https:" ? 443 : 80;
	let xhr = protocol.toLowerCase() == "https:" ? https : http;
	// 如果有对应的 PEM 证书，则使用证书
	if(ssl.key) ssl.key = fs.readFileSync(site.getPath(ssl.key));
	if(ssl.cert) ssl.cert = fs.readFileSync(site.getPath(ssl.cert));
	if(ssl.ca) ssl.ca = fs.readFileSync(site.getPath(ssl.ca));
	let req = xhr.request({ hostname, port, path, method: !data ? "GET" : "POST", headers, ...ssl });
	return new Promise(resolve => {
		req.on("error", err => resolve({ err }));
		req.on("response", res => {
			let buff = Buffer.alloc(0);
			res.on("data", chunk => buff = Buffer.concat([buff, chunk]) );
			res.on("end", () => resolve(buff.toString()));
		});
		req.end(body);
	});
}

function md5(str = "a", len = 32) {
	const crypto = cache.CryptoModule ??= require('crypto');
	const hash = crypto.createHash('md5'); hash.update(str);
	return hash.digest('hex').substr((32 - len) / 2, len || 32);
}

function ensureDir(dir) {
	dir = site.getPath(dir).replace(/\\/g, "/").replace(/\/$/, "");
	var recurse = dir => {
		if(fs.existsSync(dir)) return dir;
		recurse(dir.substr(0, dir.lastIndexOf("/")));
		fs.mkdirSync(dir, 0777);
		return dir;
	};
	return recurse(dir);
}

function db(dbPath) {
	dbPath ??= sys.dbPath || "app_data.db";
	sys.db ??= new Object;
	if(sys.db[dbPath]) return sys.db[dbPath];
	return sys.db[dbPath] = new SQLiteHelper(dbPath);
}

function closeAllDb() {
	if(!sys.db) return;
	for(var db in sys.db) {
		sys.db[db].close();
		delete sys.db[db];
	}
}

// SQLite DbHelper
function SQLiteHelper(dbPath) {
	try { var SQLite = cache.BetterSQLiteModule ??= require("better-sqlite3"); }
	catch(e) { throw new Error("您可能需要运行一次：npm install better-sqlite3"); }
	dbPath = site.getPath(dbPath);
	var dbo = new SQLite(dbPath);

	this.beginTrans = function() {
		if(this.inTrans) return;
		this.inTrans = true;
		dbo.exec("begin transaction");
	};

	this.commit = function() {
		if(!this.inTrans) return;
		this.inTrans = false;
		dbo.exec("commit transaction");
	};

	this.query = function(sql, args) {
		this.lastSql = { sql: sql, par: args };
		return dbo.prepare(sql).all(args || new Array);
	};
	
	this.fetch = function(sql, args) {
		this.lastSql = { sql: sql, par: args };
		return dbo.prepare(sql).get(args || new Array);
	};

	this.scalar = function(sql, args) {
		this.lastSql = { sql: sql, par: args };
		return dbo.prepare(sql).pluck().get(args || new Array);
	};

	this.none = function(sql, args) {
		this.lastSql = { sql: sql, par: args };
		this.beginTrans();
		// 执行 SQL 并返回受影响行数
		return dbo.prepare(sql).run(args || new Array).changes;
	};

	this.table = function(tablename) {
		var ins = new Object; this.pager = new Object;
		var tables = [ tablename ], where = orderby = limit = groupby = "", select = "*";

		ins.join = (tbl, dir = "left") => { tables.push(dir + " join " + tbl); return ins; };

		ins.where = cond => { where = " where " + cond; return ins; };

		ins.order = ins.orderby = col => { orderby = " order by " + col; return ins; };

		ins.limit = (start, count) => { limit = " limit " + start + ", " + count; return ins; };

		ins.group = ins.groupby = col => { groupby = " group by " + col; return ins; };

		ins.select = cols => { select = cols; return ins; };

		ins.toString = () => {
			var sql = "select " + select + " from " + tables.join(" ") + where + groupby + orderby + limit;
			return sql;
		};

		ins.astable = n => {
			tables = [ "(" + ins + ") as " + n ];
			where = orderby = limit = groupby = "", select = "*";
			return ins;
		};

		ins.page = (sort, size, page, args) => {
			page ??= 1; if(page < 1) page = 1;
			var sql = ins.toString();
			var total = this.scalar("select count(*) as value from (" + sql + ") as t", args);
			var pages = Math.ceil(total / size);
			var start = (page - 1) * size;
			this.pager = {
				rownum: total,
				pagenum: pages,
				pagesize: size,
				curpage: page,
				args: args
			};
			orderby = " order by " + sort;
			limit = " limit " + start + ", " + size;
			return ins;
		};

		ins.query = args => this.query(ins.toString(), args || this.pager?.args);
		ins.fetch = args => this.fetch(ins.toString(), args || this.pager?.args);
		ins.scalar = args => this.scalar(ins.toString(), args || this.pager?.args);

		return ins;
	}

	this.insert = function(tablename, rows) {
		if(!(rows instanceof Array)) rows = [ rows ];
		if(!rows[0]) return;
		var sql = "insert into `" + tablename + "` (";
		var keys = new Array, vals = new Array;
		for(var k in rows[0]) {
			keys.push("`" + k + "`");
			vals.push("@" + k);
		}
		sql += keys.join(",") + ") values (" + vals.join(",") + ")";
		this.lastSql = { sql: sql };
		this.beginTrans();
		var stmt = dbo.prepare(sql);
		rows.forEach(row => {
			var par = this.lastSql.par = new Object;
			for(var k in row) par[k] = row[k];
			stmt.run(par);
		});
	}

	this.update = function(tablename, row, parWhere) {
		if(!parWhere) return 0;
		var sql = "update `" + tablename + "` set ";
		var keys = new Array, vals = new Object;
		for(var k in row) {
			keys.push("`" + k + "`=@" + k);
			vals[k] = row[k];
		}
		sql += keys.join(",");
		var arrWhere = new Array;
		for(var k in parWhere) {
			arrWhere.push("`" + k + "`=@" + k);
			vals[k] = parWhere[k];
		}
		sql += " where " + arrWhere.join(" and ");
		this.lastSql = { sql, par: vals };
		return this.none(sql, vals);
	}

	this.create = function(tablename, cols) {
		var sql = "create table `" + tablename + "`(";
		cols.forEach((x, i) => {
			if("string" == typeof x) x = [ x ];
			let col = x[0];
			if(x[1] !== x.none) col += " not null default(" + x[1] + ")";
			if(x[2]) col += " not null primary key autoincrement";
			cols[i] = col;
		});
		sql += cols.join(", ") + ")";
		return this.none(sql);
	}

	this.close = () => {
		this.commit();
		dbo.close();
		delete sys.db[dbPath];
	};
}
%>