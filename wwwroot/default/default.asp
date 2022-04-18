<%
function boot(route) {
	sys.name = "Node.js ASP";
	sys.title = "默认网站";
	cc().pv = -~cc().pv;	// 站点计数器
	ss().pv = -~ss().pv;	// 点击计数
	return apidoc({
		index: function() {
			var nick = "Guest";
			var counter = cc("tempCounter", () => { return { pv: 0 }; }, 15);
			counter.pv++;		// 有效期 15 秒的缓存计数
			%><!-- #include file="views/default.html" --><%
		}
	}, route);
}
%>