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
	(ip BLOB)`,err => console.log(err));

class chdb {
	static addMsg(msg){
		let username = msg.username
		let text = msg.text
		let time = msg.time

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

  	//ожидание получения сообщения
	socket.on('send', async (data) => {
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

