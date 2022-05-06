<!-- #include file="inc.asp" --><%
// API 文档模式，API 接口编写建议引用此文档
// sys.apiAuth = "User:Pass"; // 用户名密码验证
// sys.hideApiFunc = true;	// 文档中不显示源码
// sys.hideApi = true;		// 完全关闭文档显示

// apidoc(api对象，路由数组，禁止自动 json 格式化);
async function apidoc(root, route, noFmt) {
	// 跨域判断
	allowCORS(env("HTTP_ORIGIN"));
	if(env("REQUEST_METHOD") == "OPTIONS") return 1;
	if(!route) route = sys.route;
	if(!route) return tojson({ err: "缺少 route 参数" });
	try { var rs = execApi(root, 0); } catch(err) {
	if(sys.onerror) return sys.onerror(err);
	rs = { err: err.message, sql: db().lastSql };
	if(noFmt) throw err; }

	// 执行 Api 
	function execApi(model, dep) {
		var api = (route[dep] || "index").toLowerCase();
		if(!model[api]) return api == "index" ? showApi.call(model) : { err: "404 Object not found.", route: route };
		return "function" == typeof model[api] ? model[api]() : execApi(model[api], -~dep);
	}

	// 显示 Api 文档页
	function showApi() {
		if(sys.hideApi) return { err: "404 Object not found." };
		if(sys.apiAuth && !apiAuth()) return { err: "403 Forbidden" };
		var routeMode = !qstr("r");	// path_info : ?r=xxx
		var apipath = routeMode ? env("URL") : "?r=";
		apipath += routeMode ? env("PATH_INFO") : qstr("r");
		sys.apipath = apipath.replace(/\/+$/g, "") + "/";
		%><!-- #include file="views/apidoc.html" --><%
	}

	// Api 授权验证
	function apiAuth() {
		var auth = env("HTTP_AUTHORIZATION") || "Basic Og==";
		if(atob(auth.slice(6)) == sys.apiAuth) return true;
		site.status = 401; 
		site.res.setHeader("WWW-Authenticate", "Basic realm=\"API Doc Auth\"" );
		return false;
	}

	// 跨域处理
	function allowCORS(origin) {
		if(!origin) return;
		site.res.setHeader("Access-Control-Allow-Origin", origin);
		site.res.setHeader("Access-Control-Max-Age", "86400");
		site.res.setHeader("Access-Control-Expose-Headers", "*");
		site.res.setHeader("Access-Control-Allow-Headers", "*");
		site.res.setHeader("Access-Control-Allow-Credentials", "true");
		site.res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, HEAD, OPTIONS");
	}

	if(noFmt) return rs;
	if(rs instanceof Promise) rs = await rs;
	return rs instanceof Object ? tojson(rs) : rs;
}
%>