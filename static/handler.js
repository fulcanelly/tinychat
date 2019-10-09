var spec_ids = [];
let users = [];
let loadoldElm = $('loadold');
loadoldElm.style.display = 'none';
let queue = true;		//пока подключения к серверу нет сообщения хранятся в очереди
let queue_array = []; //очередь сообщений
let step_one = true; //одноразовая переменная для отправки запроса инициализации

let min_id;//id сообщения с которого будет идти загрузка старых сообщений
let edite_msgs = {};//редактируемые

let r = 0;
let g = 0;
let b = 0;

colors = [];

//generation set of nickname colors
for(let k = 0;k <= 162*4; k++){
    let i = k;
    if(i<162)r=162;
    if(i<162)g++;

    if(i>162&&i<162*2)r--;
    if(i>162&&i<162*2)g=162;

    if((i>162*2)&&i<162*3)r=0;
    if(i>162*2&&i<162*3)g=162;
    if(i>162*2&&i<162*3)b++;

    if(i>162*3&&i<162*4)r=0;
    if(i>162*3&&i<162*4)g--;
    if(i>162*3&&i<162*4)b=162;


    let tr=(r&255)<<16;
    let tg=(g&255)<<8;
    let tb=b&255;

    let c = (tr+tg+tb).toString(16);
    if(c.length<6){
        c = "0".repeat(6-c.length)+c
    }
    c='#'+c;

    if(i%10==0){
        //ctx.fillStyle = c;
        colors.push(c);
        //ctx.fillRect(k,0,5,100);
    }
}

//
function hashCode(s) {
    var h = 0, l = s.length, i = 0;
    if ( l > 0 )
        while (i < l)
            h = (h << 5) - h + s.charCodeAt(i++) | 0;
    return h;
};

//изменение цвета ников
function colorize(){
    users = document.getElementsByClassName('name');
    let user;
    let str;
    for (var i =0;i<users.length;i++) {
        user = users[i].classList.value;
        str = user.slice(5);

        let hash = hashCode(str)%65;
        let index = Math.abs(hash);

        users[i].style.color=colors[index];
    }
}

function $(name){
    return document.getElementById(name);
}

function getCookie(name) {
    var matches = document.cookie.match(new RegExp(
        "(?:^|; )" + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + "=([^;]*)"
    ));
    return matches ? decodeURIComponent(matches[1]) : undefined;
}

function setCookie(name, value, options) {
    options = options || {};

    var expires = options.expires;

    if (typeof expires == "number" && expires) {
        var d = new Date();
        d.setTime(d.getTime() + expires * 1000);
        expires = options.expires = d;
    }
    if (expires && expires.toUTCString) {
        options.expires = expires.toUTCString();
    }

    value = encodeURIComponent(value);

    var updatedCookie = name + "=" + value;

    for (var propName in options) {
        updatedCookie += "; " + propName;
        var propValue = options[propName];
        if (propValue !== true) {
            updatedCookie += "=" + propValue;
        }
    }
    document.cookie = updatedCookie;
}

let input = $("input");
//send msg hen user press enter
input.addEventListener("keyup", function(event) {
    if (event.keyCode === 13) {
        if(input.value.length==0){
            return
        }
        send();
    }
});


function randomStr() {
    return Math.random().toString(36).substring(2, 15);
}

//генерация ника
let username;
if(getCookie("username") === undefined) {
    username = randomStr();
    setCookie("username",username);
}else{
    username = getCookie("username");
}

let link = window.location.href;
function parseUrl(str){
    let domain = str.match(/(www|http:|https:)+[^\s]+[\w]/)
    if(domain)
        return 'http://'+domain[0].match(/(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]/)[0]
    return null
}

let server = parseUrl(link) || 'http://localhost'
var socket = io.connect(server);

//ответ на запрос сервера
socket.on('serv_request', function (data) {
    //console.log(data);
    let answer;
    switch (data.request) {
        case("get_username"):
            answer = {username: username};
            break;
        case("queue_off"):
            queue = false;
            answer = {};
            break;
        default:
            answer = "bad request";
            break;
    }
//	console.log(answer);
    socket.emit('serv_request', answer);
});

//отвечаеь за то чтобы нельзя было загружать пока не загружены запрашиваемые сообщения
let cli_request_lock = false;

let loadButton = $("loadold").outerHTML;
let loaderInner = $("loader").innerHTML;
let outerClone = $("loader").cloneNode();

outerClone.id ='loadold';
outerClone.style.display = '';
let tempLoader = outerClone.outerHTML.replace('><',`>${loaderInner}<`)

//загружает старые сообщения
function loadold() {
    if(!cli_request_lock){
        //заменяем кнопку на псевдо индикатор загрузки
        let oldLoad = $("loadold");
        oldLoad.outerHTML = tempLoader;
        cli_request_lock = true

        socket.emit('cli_request',{request:'load',from:min_id});
    }
}

//формирует шаблон сообщения
function msgTemplate(msg){
    let msg_body = document.createElement('div');
    msg_body.classList.value = "msg";
    if(msg.spec_id){
        msg_body.id = msg.spec_id;
    }
    let name = document.createElement('div');
    name.classList.value = `name ${msg.username}`;
    name.innerText = msg.username;
    let time = document.createElement('div');
    time.classList.value = 'timestamp';
    time.innerText = msg.time;
    name.innerHTML += time.outerHTML;
    let text = document.createElement('div');
    text.classList.value = 'text';
    text.innerText = msg.text;
    text.innerHTML = text.innerHTML.replace(/(((http)s?:\/)[^\s]+)/g,'<a href=\'$1\'>$1</a>');
    msg_body.innerHTML = name.outerHTML+text.outerHTML;
    return msg_body.outerHTML;
}

function addMsg(data,element){
    for(let i =0;i<data.length;i++){
        let msg = data[i];
        let template = msgTemplate(msg);
        $(element).outerHTML += template;
        if(msg.spec_id){
            edite_msgs[msg.spec_id]=msg
        }
    }
    colorize()
}

function editMsg(id,data){
    for(let i in data.msg[0]){
        let item = data.msg[0][i];
        edite_msgs[id][i]=item
    }
    let thismsg = $(id);
    thismsg.outerHTML = msgTemplate(edite_msgs[id]);
    colorize()
}

let loader = $("loader");
//вызывается при получении сообщения
socket.on('new_msg', function (data) {
    console.log(data)

    let type = data.type;
    loader.style.display = 'none';

    //проверка: если id совпадает хотя бы с одним из spec_ids тогда изменяем его
    let index = spec_ids.indexOf(data.spec_id);
    if(index!=-1){
        editMsg(data.spec_id,data);
        return;
    }

    //а вот это хз чо за дичь
    if(data.reverse)
        data.msg = data.msg.reverse()
    data = data.msg;
    //конец дичи

    if(type=='old'){
        
        let ids=[];
        for(let i in data){
            ids.push(data[i].id)
        }

        min_id = Math.min(...ids);
        console.log(min_id)
        
        //если сообщений меньше 10(на это будет указыывать то что min id == 1) тогда прячем кнопку загрузки
        if(data.length===0 || min_id<=1){
            $("loadold").style.display = 'none';
        }else{
            let tempold = $("loadold");
            $("loadold").outerHTML = loadButton;
            $("loadold").style.display = '';
        }
    }

    let element;
    if(type === 'new')
        element = 'adder';
    else{
        cli_request_lock = false;
        element = 'loadold';
    }
    addMsg(data, element);
    
});

const onlineElm = $("online");
socket.on('actions',function (online) {
    //console.log(online);
    if(online.notice){
        console.log(online.notice);
    }else if(online.count){
        onlineElm.innerText = onlineElm.innerText.replace(/\d+/,online.count);
    }
});

function send(){
    //добавить сообщение
    let spec_id = randomStr();//генерация id
    //добавление шаблона сообщения
    let template = {
        text: input.value,
        spec_id:spec_id,
        time:"Sending...",
        username:username
    };
    //добавление id в список
    spec_ids.push(spec_id);
    //добавление
    addMsg([template],"adder");
    console.log(template)
    if(queue){
        queue_array.push(template)
    }else {
        socket.emit('send', template);
    }
    input.value = '';
}

setInterval(function () {
    if(queue_array.length>0 && !queue){
        for(let i in queue_array){
            socket.emit('send',queue_array[i]);
        }
        queue_array = [];
    }
    if(!queue && step_one){
        socket.emit('cli_request',{request:'load'});
        step_one = false;
    }
},10);

socket.on('disconnect', function () {
    queue = true;
});


