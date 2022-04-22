<!-- #include virtual="/asplib/api.asp" --><%
function boot(route) {
	// sys.apiAuth = "Admin:******";
	sys.name = "Node.js ASP";
	sys.title = "默认网站";
	cc().pv = -~cc().pv;	// 站点计数器
	ss().pv = -~ss().pv;	// 点击计数
	return apidoc({
		Memo: [ "点击进入首页".link("?r=home") ]
		,home: async function() {
			var nick = "Guest";
			var counter = cc("tempCounter", () => { return { pv: 0 }; }, 15);
			counter.pv++;		// 有效期 15 秒的缓存计数
			var sql = await db().table("(select 1 as userid, @nick as nick, datetime('now', 'localtime') as now) a").
				page("userid desc", 10, 1, [ nick ]);
			var rs = await sql.query();
			var pager = db().pager;
			%><!-- #include file="views/default.html" --><%
		}

		,HelloDoc: [ "你好，第一个 API", "nick", "nick: string, 您的昵称" ]
		,hello() { return { msg: "你好，" + form("nick") }; }

		,DbTestDoc: [ "数据库操作测试" ]
		,async dbtest() {
			dbg().trace("dbtest", "开始");
			return await db().fetch("select datetime('now', 'localtime') as now");
		}
	}, route);
}
%>