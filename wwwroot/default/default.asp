<!-- #include virtual="/asplib/inc.asp" --><%
function boot(route) {
	sys.name = "Node.js ASP";
	sys.title = "默认网站";
	cc().pv = -~cc().pv;	// 站点计数器
	ss().pv = -~ss().pv;	// 点击计数
	return apidoc({
		index: async function() {
			var nick = "Guest";
			var counter = cc("tempCounter", () => { return { pv: 0 }; }, 15);
			counter.pv++;		// 有效期 15 秒的缓存计数
			var sql = await db().table("(select 1 as userid, :nick as nick) a").
				page("userid desc", 10, 1, [ nick ]);
			var rs = await sql.query();
			var pager = db().pager;
			%><!-- #include file="views/default.html" --><%
		}
	}, route);
}
%>