/*var WebSocketServer = require('ws').Server
 var wss = new WebSocketServer({ port: 3000 });
 wss.on('connection', function connection(ws) 
{
   ws.on('message', function incoming(message) 
   {
      console.log('received: %s', message);
   });
 
   ws.send('something');
}); */

	var PORT = 3000 
	var VERSION = 5.0
	var app = require('express')();
	var http = require('http').Server(app);
	var io = require('socket.io')(http);

	app.get('/', function(req, res){
	 res.send("Makertron server version "+ VERSION + "\n"); 
	});

	io.set('heartbeat timeout', 1100000);

	io.on('connection', function(socket){
		socket.on('OPENSCAD',function(data){
			console.log( socket ) 
		});
	});

	
	http.listen(PORT,function(){
		console.log('listening on *:',PORT);
	});


