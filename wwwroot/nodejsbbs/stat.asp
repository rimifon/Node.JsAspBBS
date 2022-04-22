<!-- #include file="asplib/inc.asp" --><%
function boot(route) {
	if(route[0] == "ClearLogs") return clearLogs();
	sys.debug = false;
	sys.name = "网站访问监控";
	return web(cc().debug || new Object);
}

function clearLogs() {
	var cache = cc().debug;
	if(!cache) return "毋须清空";
	cache.slow.length = cache.logs.length = cache.minTime = 0;
	sys.sTime = new Date;
	return "清空成功";
}

function web(data) {
	var last = data.last || new Array, slow = data.slow || new Array, logs = data.logs || new Array;
	var qps = last.length > 1 ? (last.length * 1000 / (last[0][4] - last[ last.length - 1 ][4])).toFixed(1) - 0 : 1;
%><!doctype html><html><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, user-scalable=no" />
<title><%= sys.name %></title>
<style type="text/css">
table{ border-collapse: collapse; font: 9pt/9pt simsun }
table caption p{ margin: 0mm; font: 4mm/1cm 微软雅黑 }
table caption p tt{ color: blue; cursor: pointer }
table th{ background-color: #eee }
table td p{ white-space: nowrap; margin: 0mm }
.menu tt{ display: inline-block; font: 4mm/7mm simsun; cursor: pointer; padding: 0mm 4mm; border-bottom: 1mm solid #eee }
.menu tt.act{ border-bottom-color: #abcdef }
</style></head><body>
<table border="1" cellpadding="6">
	<caption><p>服务器状态</p></caption>
	<tr><th>实时并发</th><th>今日访问</th><th>昨日访问</th></tr>
	<tr align="center">
		<td><%= qps %>个/秒</td>
		<td><%= data.today %></td>
		<td><%= data.yesterday %></td>
	</tr>
</table><p class="menu">
	<tt class="act">最新请求</tt><tt>慢日志</tt><tt>调试信息</tt>
</p>
<div class="tab">
	<!-- 最新请求 -->
	<div class="page">
		<table border="1" cellpadding="6">
			<caption><p>最新请求</p></caption>
			<tr>
				<th>方式</th><th>请求路径</th><th>路由</th><th>耗时</th><th>请求IP</th><th>访问时间</th>
			</tr><% last.forEach(function(x) { %>
			<tr>
				<td><%= x[0] %></td>
				<td><%= x[1] %></td>
				<td><%= x[2] %></td>
				<td><%= x[5] %>ms</td>
				<td><%= x[3] %></td>
				<td><p><%= x[4] %></p></td>
			</tr><% }); %>
		</table>
	</div>
	<!-- 慢日志 -->
	<div class="page" hidden="true">
		<table border="1" cellpadding="6">
			<caption><p>慢日志 [<tt>清空</tt>]</p></caption>
			<tr>
				<th>路由</th><th>耗时</th><th>方式</th><th>路径</th><th>请求IP</th><th>发生时间</th>
			</tr><% slow.forEach(function(x) { %>
			<tr>
				<td><%= x[2] %></td>
				<td><%= x[5] %>ms</td>
				<td><%= x[0] %></td>
				<td><%= x[1] %></td>
				<td><%= x[3] %></td>
				<td><p><%= x[4] %></p></td>
			</tr><% }); %>
		</table>
	</div>
	<!-- 调试信息 -->
	<div class="page" hidden="true">
		<table border="1" cellpadding="6">
			<caption><p>调试信息</p></caption>
			<tr>
				<th>路由</th><th>耗时</th><th>方式</th><th>路径</th><th>发生时间</th>
			</tr><% logs.forEach(function(x) { %>
			<tr>
				<td><%= x.info[2] %></td>
				<td><%= x.info[4] %>ms</td>
				<td><%= x.info[0] %></td>
				<td>
					<%= x.info[1] %><% x.rows.forEach(function(y) { %>
					<br /><%= y[0] %>[<%= y[1] %>ms]<% }); %>
				</td>
				<td><p><%= x.info[3] %></p></td>
			</tr><% }); %>
		</table>
	</div>
</div><script type="text/javascript">
var sTime = new Date;
function addLog(str){ console.log([str, ": ", new Date - sTime, "ms." ].join("")); }
self.onload = function(){ addLog("onload"); };
document.onreadystatechange = function(){ addLog(document.readyState); };
document.addEventListener('DOMContentLoaded', function(){ addLog('DOMContentLoaded'); });
(function() {
	var actId = 0;
	var btn = document.querySelectorAll(".menu tt");
	var pge = document.querySelectorAll(".tab .page");
	for(var i = 0; i < btn.length; (function(x) {
		btn[x].onclick = function() {
			if(x == actId) return;
			btn[actId].className = "";
			pge[actId].hidden = true;
			btn[x].className = "act";
			pge[x].hidden = false;
			actId = x;
		};
	})(i++));
	
	document.querySelector("table caption p tt").onclick = function() {
		var xhr = new XMLHttpRequest;
		xhr.open("POST", "?r=ClearLogs", true);
		xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
		xhr.onload = function() { alert(xhr.responseText); };
		xhr.send("v=" + (new Date - 0));
	};
})();
</script></body></html><% } %>