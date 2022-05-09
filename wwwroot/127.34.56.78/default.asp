<!-- #include file="asplib/api.asp" --><%
function boot(route) {
	cc().pv = -~cc().pv;
	return apidoc({
		index() {
			sys.title = "网站首页";
			var hasSocket = "object" == typeof socket;
			return master(function() { %><!-- #include file="views/default.html" --><% });
		}
		,sub: {
			TestDoc: [ "测试API" ]
			,test() {
				return { msg: "你好", now: sys.sTime };
			}
			,AsyncDoc: [ "测试异步API" ]
			,async() {
				return new Promise(ok => {
					setTimeout(() => {
						ok({ msg: "执行时间", time: new Date - sys.sTime });
					}, 1000);
				});
			}
		}
		,async test() {
			// 卡 1 秒钟
			sys.title = "一个比较卡的页面";
			var rs = await this.sub.async();
			return master(function() { %><!-- #include file="views/test.html" --><% });
		}
		,include() {
			include("views/test.html", { rs : { msg: "你好，其实并不卡", now: sys.sTime }, tojson });
		}
	}, route);

	function master(func) {
		%><!-- #include file="views/master.html" --><%
	}
}
%>