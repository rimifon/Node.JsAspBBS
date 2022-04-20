<%
function ss(ns) {
	if(!ns) ns = "global.";
	var root = InitSession(site).data;
	root[ns + "root"] ??= { sessId: root.sessId };
	return root;
}

function cc(k, f, t) {
	cache.redis ??= new Object;
	var root = cache.redis[site.host.domain] ??= new Object;
	if(!k) return root;
	var rs = root[k];
	var timer = t * 1000;
	if(rs) {
		if(rs.time - site.sys.sTime + timer > 0) return rs.value;
		// 数据过期了，重新获取
		clearTimeout(rs.handler);
	}
	try { var value = f(); }
	catch(err) { throw err; }
	if(value instanceof Promise) value.then(v => {
		root[k].value = v;
	});
	// 没有初始化
	root[k] = { value, time: site.sys.sTime };
	root[k].handler = setTimeout(() => {
		// 定时清理缓存
		if(!root[k]) return;
		delete root[k];
	}, timer);
	return root[k].value;
}

function html(str) { return (str + "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function tojson(obj) { return JSON.stringify(obj); }
function fromjson(str) { return JSON.parse(str); }

function db(dbPath) {
	dbPath ??= sys.dbPath || "/App_Data/sqlite.db";
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
	try { var SQLite = cache.SQLiteModule ??= require("sqlite3").verbose(); }
	catch(e) { throw new Error("您可能需要运行一次：npm install sqlite3"); }
	dbPath = site.getPath(dbPath);
	var dbo = new SQLite.Database(dbPath);
	this.query = function(sql, args) {
		this.lastSql = { sql: sql, par: args };
		return new Promise((resolve, reject) => {
			dbo.all(sql, args, (err, rows) => {
				if (err) reject(err);
				else resolve(rows);
			});
		});
	};
	
	this.fetch = function(sql, args) {
		this.lastSql = { sql: sql, par: args };
		return new Promise((resolve, reject) => {
			dbo.get(sql, args, (err, row) => {
				if (err) reject(err);
				else resolve(row);
			});
		});
	};

	this.scalar = function(sql, args) {
		this.lastSql = { sql: sql, par: args };
		return new Promise((resolve, reject) => {
			dbo.get(sql, args, (err, row) => {
				if (err) reject(err);
				else resolve(row.value);
			});
		});
	};

	this.none = function(sql, args) {
		this.lastSql = { sql: sql, par: args };
		// 执行 SQL 并返回受影响行数
		return new Promise((resolve, reject) => {
			dbo.run(sql, args, function(err) {
				if (err) reject(err);
				else resolve(this.changes);
			});
		});
	};

	this.table = function(tablename) {
		var ins = new Object; this.pager = new Object;
		var tables = [ tablename ], where = orderby = limit = groupby = "", select = "*";

		ins.join = (tbl, dir = "left") => { tables.push(dir + " join " + tbl); return ins; };

		ins.where = cond => { where = " where " + cond; return ins; };

		ins.order = ins.orderby = col => { orderby = " order by " + col; return ins; };

		ins.limit = (start, count) => { limit = " limit " + start + "," + count; return ins; };

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

		ins.page = async (sort, size, page, args) => {
			var sql = ins.toString();
			var total = await this.scalar("select count(*) as value from (" + sql + ") as t", args);
			var pages = Math.ceil(total / size);
			var start = (page - 1) * size;
			this.pager = {
				rownum: total,
				pagenum: pages,
				pagesize: size,
				curpage: page,
				args: args
			};
			ins.orderby = sort;
			ins.limit = start + "," + size;
			return ins;
		};

		ins.query = args => this.query(ins.toString(), args || this.pager?.args);
		ins.fetch = args => this.fetch(ins.toString(), args || this.pager?.args);
		ins.scalar = args => this.scalar(ins.toString(), args || this.pager?.args);

		return ins;
	}

	this.close = () => {
		dbo.close();
		delete sys.db[dbPath];
	};
}
%>