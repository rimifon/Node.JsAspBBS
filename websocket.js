var WS = require("ws").Server;
var hosts = new Object, errors = new Array;
function bindServer(server) {
	new WS({ server }).on("connection", (skt, req) => {
		skt.on("message", res => user.onMsg(res));
		skt.on("close", res => user.exit(res));
		skt.on("error", res => console.log("error", res));
		var user = new ChatUser(skt, req);
	});
}

function ChatUser(socket, req) {
	var rooms = hosts[req.headers.host] ??= new Object;
	this.onMsg = function(msg) {
		var res; try { res = JSON.parse(msg); }
		catch(err) { res = { type: "notjson", data: msg } };
		if(res.type == "join") return this.doJoin(res);
		if(!this.room) this.send({ type: "error", data: "需要先加入房间" });
		if(res.type == "users") return this.getUsers();
		if(res.type == "noop") return this.send({ type: "noop", data: new Date });
		res.to ? this.sendTo(res.to, res) : this.sendAll(res);
	};
	this.getUsers = function() {
		if(!this.room) return;
		var users = new Object;
		for(var x in this.room.users) users[x] = this.room.users[x].info;
		this.send({ data: users, type: "users" });
	};
	this.doJoin = function(msg) {
		if(this.room) return this.send({ type: "error", data: "您已在聊天室【" + this.room.name + "】中" });
		msg = msg.data || new Object;
		this.info = msg;
		if(!msg.room) msg.room = "default";
		if(!rooms[msg.room]) rooms[msg.room] = { users: new Object, id: 0, count: 0, name: msg.room };
		this.room = rooms[msg.room];
		this.id = ++this.room.id; this.room.count++;
		this.room.users[this.id] = this;
		msg.id = this.id; msg.count = this.room.count;
		this.send({ type: "join", data: msg.id });
		this.sendAll({ type: "welcome", data: msg });
		delete msg.count; delete msg.room;
	};
	this.exit = function() {
		var room = this.room;
		if(!room) return;
		delete room.users[this.id];
		delete this.room;
		if(--room.count < 1) delete rooms[room.name];
		this.ensure(function() { socket.close(); }, "exit");
	};
	this.send = function(msg) { this.ensure(function() { socket.send(JSON.stringify(msg)); }, "send", msg); };
	this.sendTo = function(userid, msg) {
		var user = this.room.users[userid];
		if(!user) return this.send({ type: "nouser", data: userid });
		msg.from = this.id;
		user.send(msg);
	};
	this.sendAll = function(msg) {
		var room = this.room;
		if(!room) return;
		msg.from = this.id;
		var queue = new Array;
		for(var x in room.users) queue.push(room.users[x]);
		while(queue.length) queue.shift().send(msg);
	};
	this.ensure = function(func, type) {
		if(socket.readyState == 2 && type == "send") return this.exit(1006);
		if(socket.readyState != 1 && type == "send") console.log(socket.readyState);
		try { func(); } catch(err) { this.logError(err.message, type); }
	};
	this.logError = function(msg, type) {
		errors.unshift(JSON.stringify({
			time: new Date,
			type: type, err: msg, user: this.info.nick || this.id
		}));
		if(errors.length > 30) errors.length = 30;
	};
}

function roomInfo(host) {
	host ??= Object.keys(hosts)[0];
	var arr = new Array, cnt = 0;
	var rooms = hosts[host] ?? new Object;
	for(var x in rooms) { arr.push(x + "（共 " + rooms[x].count + " 人在线）"); cnt += rooms[x].count; }
	return arr.length + "个聊天室（共 " + cnt + " 人在线）<br />" + arr.join("<br />") + "<br />" 
		+ "意外信息：<br />" + errors.join("<br />");
}
module.exports = {
	bind: server => bindServer(server),
	all: () => {
		let all = new Object;
		for(let x in hosts) all[x] = roomInfo(x);
		return all;
	},
	info: host => roomInfo(host)
};