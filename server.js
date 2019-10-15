var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var sqlite3 = require('sqlite3').verbose()
var fs = require('fs')

//choice port
let port = process.env.PORT | 80;
server.listen(port);
console.log("start listening : "+port)

//prepeare and start database
let dbFile = "db.sqlite"
let dbExists = fs.existsSync(dbFile)
if (!dbExists) 
	fs.openSync(dbFile, 'w')

let db = new sqlite3.Database(dbFile)

//creating tables if they not exists yet
db.run(
	`CREATE TABLE 
	IF NOT EXISTS messages 
	(id INTEGER PRIMARY KEY AUTOINCREMENT,
	username BLOB,
	text BLOB,
	time BLOB)`, err => console.log(err));
	
db.run(
	`CREATE TABLE 
	IF NOT EXISTS blist 
	(ip BLOB, 
	banrate INTEGER,
	ftime BLOB,
	count INTEGER,
	state BLOB
	)`,err => console.log(err));

class banlist {

	static addUser(ip) {
		return new Promise((res) => {
			let claim = `INSERT INTO blist(ip, banrate, ftime, count) VALUES(?, ?, ?, ?)`;
			db.run(claim, ip, 1, Date.now(), 0, (_) => res(true))
		})
	}

	static interval = 60 * 1000;
	//in mc
	static allowedLimit = 30;
	//count of messages per interval
	
	static ban(ip)
	{
		return new Promise((res) => {
			db.all('SELECT * from blist where ip = ?', ip, async(err, row) => {
				let user = row[0]
				if(user.state == "baned")
				{
					res(true);
					return;
				}
				else {
					user.state = "baned"
					user.banrate++
				}
				db.all(`UPDATE blist SET state=?, banrate=? WHERE ip =?`, user.state, user.banrate, ip)
			})
		})
	}

	static userCanSend(ip){
		return new Promise(async(res) => {
			db.all('SELECT * from blist where ip = ?', ip, async(err, row) => {
				let user = row[0]
				//if user not exist yet then add him
				if(!user)
				{
					await this.addUser(ip)
					let canSend = await this.userCanSend(ip)
					res(canSend);
				}

				if(this.interval*user.banrate + user.ftime < Date.now())
				{
					//user.ftime = Date.now()
					user.count = 0;
				} 

				let canSend = true
				if(user.count >= this.allowedLimit)
				{
					canSend = false
					this.ban(ip);
				}	
				
				res(canSend)
			}) 
		})
	}

	//static update(ip){
	static add(ip) {
		return new Promise((res) => {
		 	db.all('SELECT * from blist where ip=?', ip, (err, row) => {
				let user = row[0]

				if(this.interval*user.banrate/2 + user.ftime < Date.now())
				{
					user.ftime = Date.now()
					user.count = 0;
				} 

				user.count++;
				db.run('UPDATE blist SET count=?, ftime=?, state="normal" WHERE ip =?', user.count, user.ftime, ip)
			})
		})
	}

	static clearInterval = 60 * 60 * 24 * 1000;
	//clearer handler
	static clearer()
	{
		return new Promise((res) => setInterval(() => {
			db.run('DELETE FROM blist where (ftime + ?) < ?', this.clearInterval, Date.now())
		}, 3000))
	} 
}

banlist.clearer();

class chdb {
	static addMsg(msg){
		let username = msg.username.slice(0, 40);
		let text = msg.text.slice(0, 4000);
		let time = msg.time.slice(0, 40);

		db.run(`
		INSERT INTO messages(username, text, time)
		values(?, ?, ?)`, username, text, time)
	}
	
	static getLastMsg(count = 10) {
		return new Promise((res) => {
			db.all(`SELECT * FROM messages ORDER BY id DESC LIMIT ?`, count, (err, rows) => {
				if(err)
					throw err;
				else
					res(rows)
			})
		})
	}

	static sliceMsg(from, count = 10) {
		return new Promise((res) => {
			//it's hard to explain but it no matter because it works fine...
			let recoveryFrom = from
			from = from - count -1;
			from = (from < 0) ? 0 : from
			count = (from == 0) ? recoveryFrom - 1 : count;

			db.all(`SELECT * FROM messages LIMIT ?, ?`, from, count,(err, rows) => {
				if(err)
					throw err;
				rows = rows.reverse();
				res(rows)
			});
		})
	}
}


//////
//открывает доступ с браузера к папке static 
//и монтирует в корень сайта
app.use("/",express.static('./static'))
//шлет файл /static/index.html при GET запросе в корне
app.get('/', function (req, res) {
  res.sendFile(__dirname + '/static/index.html');
});
//шлет 404 если такого файла или обработчика нету
app.use(function(req, res){
   res.send('<strong>ERR 404</strong>');
});
///////


let users = {};

let postOnlineCount = 0;
let onlineCount = 0;
let tmpArray;
//actions
setInterval(() => {
	//online count
	tmpArray = Object.values(users);
	onlineCount = tmpArray.length;
	//if online changed send for all this
	if(onlineCount != postOnlineCount){
		io.sockets.emit('actions', { count:onlineCount });
	}
	postOnlineCount = onlineCount;
},50);


//when connect with client create new async thread
//end setup handlers
io.sockets.on('connection', function (socket) {
	let id = socket['id'];
	console.log("new connection:"+id);

	// запрос на получение ника
	socket.emit('serv_request', { request:"get_username" });

	//ожидает ответ на запрос получения ника
	socket.on('serv_request', function (data) {
		if (data.username) {
			//сохраняем ник в переменной
			users[id] = data.username;
			//отвечаем
			socket.emit('serv_request', { request:"queue_off" });
		}
	});

  	//обработка запросов пользователя
	socket.on('cli_request', async (data) => {
		switch(data.request) {
			case('load'):
				if(data.from) {
					//data.from -- номер сообщения с какого загружать
					let out = await chdb.sliceMsg(data.from)
					socket.emit('new_msg', {msg: out, type:"old"});		
				} else {
					//первичная отправка недавних сообщений
					let out = await chdb.getLastMsg();
					socket.emit('new_msg', {msg: out, type:"old"});		
        		}
        	break;
		}
  	});
	  //console.log("ip: " + socket.request.connection.remoteAddress);
	  console.log();
  	//ожидание получения сообщения
	socket.on('send', async (data) => {
		let ip = socket.handshake.address
		if(! await banlist.userCanSend(ip))
			return;
		banlist.add(ip)
		//проверка и подготовка к сохранению в бд
		if(data.text.length == 0)
			return;
		
		console.log(data);

		let text = data.text.substring(0, 4095)      
		let username = users[id];

		//формировка сообщения
		message_array = {
			"username": username,
			"text": text,
			"time": Date.now()
		};
		
		//сохранение в бд
		await chdb.addMsg(message_array)
		//отправка отправителю результата
		socket.emit('new_msg', 
		{
			msg:[{"time":message_array.time}],
			type:"new",
			spec_id:data.spec_id
		})

		//отправить всем остальным новое сообщение
		socket.broadcast.emit("new_msg", 
		{
			msg:[message_array], 
			type:"new"
		})
  	});

	socket.on('disconnect', function () {
    //если такого юезра не было то и нет зачем выполнять функцию по очистке памяти от него
    	if(!users[id])
        return

    	delete users[id];
    	console.log('user disconnected');
	});
});

