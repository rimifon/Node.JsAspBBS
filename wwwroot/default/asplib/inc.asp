<%
function db(dbPath) {
	dbPath ??= sys.dbPath || "/App_Data/sqlite.db";
	sys.db ??= new Object;
	if(sys.db[dbPath]) return sys.db[dbPath];
	return sys.db[dbPath] = new SQLiteHelper(dbPath);
}

// SQLite DbHelper
function SQLiteHelper(dbPath) {
	try { var SQLite = cache.SQLiteModule ??= require("sqlite3").verbose(); }
	catch(e) { throw new Error("您可能需要运行一次：npm install sqlite3"); }
	dbPath = site.getPath(dbPath);
	var dbo = new SQLite.Database(dbPath);
	this.query = function(sql, args) {
		return new Promise((resolve, reject) => {
			dbo.all(sql, args, (err, rows) => {
				if (err) reject(err);
				else resolve(rows);
			});
		});
	};
	
	this.fetch = function(sql, args) {
		return new Promise((resolve, reject) => {
			dbo.get(sql, args, (err, row) => {
				if (err) reject(err);
				else resolve(row);
			});
		});
	};

	this.scalar = function(sql, args) {
		return new Promise((resolve, reject) => {
			dbo.get(sql, args, (err, row) => {
				if (err) reject(err);
				else resolve(row.value);
			});
		});
	};

	this.none = function(sql, args) {
		// 执行 SQL 并返回受影响行数
		return new Promise((resolve, reject) => {
			dbo.run(sql, args, function(err) {
				if (err) reject(err);
				else resolve(this.changes);
			});
		});
	};

	this.table = function(tablename) {
		var ins = new Object;
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
}
%>