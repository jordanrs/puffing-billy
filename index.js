var events = require('events'),
    fs = require('fs'),
    http = require('http'),
    https = require('https'),
    net = require('net'),
    url = require('url'),
    util = require('util'),
    request = require('request'),
    async = require('async');

function Proxy() {
  events.EventEmitter.call(this);

  this.http_proxy = http.createServer(this.bind(this.proxy_http_request));
  this.http_proxy.listen(0, '127.0.0.1');
  this.http_proxy.on('connect', this.bind(this.proxy_connect));

  this.https_proxy = https.createServer({
    key: fs.readFileSync(__dirname + '/mitm.key'),
    cert: fs.readFileSync(__dirname + '/mitm.crt')
  }, this.bind(this.proxy_https_request));
  this.https_proxy.listen(0, '127.0.0.1');

  var self = this;
  async.forEach(
    [this.http_proxy, this.https_proxy],
    function (proxy, cb) { proxy.on('listening', cb) },
    function () { self.emit('listening') }
  );
}
util.inherits(Proxy, events.EventEmitter);

Proxy.prototype.bind = function (fn) {
  var self = this;
  return function () {
    fn.apply(self, arguments);
  }
};

Proxy.prototype.proxy_http_request = function (req, res) {
  this.proxy_request(req.url, req, res);
};

Proxy.prototype.proxy_https_request = function (req, res) {
  var url = 'https://'+req.headers.host+req.url;
  this.proxy_request(url, req, res);
};

Proxy.prototype.proxy_request = function (url, req, res) {
  var proxy_req = request({
    url: url,
    method: req.method,
    headers: req.headers,
    followRedirect: false
  }, function (error, response, body) {
    // TODO caching
  });

  req.pipe(proxy_req).pipe(res);
};

Proxy.prototype.proxy_connect = function (req, socket, head) {
  var parts = req.url.split(':');
  socket.pause();
  var proxy_sock = net.connect(this.https_proxy.address().port, '127.0.0.1', function () {
    socket.write( "HTTP/1.0 200 Connection established\r\nProxy-agent: Puffing-Billy/0.0.0\r\n\r\n");
    proxy_sock.write(head);
    socket.pipe(proxy_sock).pipe(socket);
    socket.resume();
  });
};

Proxy.prototype.port = function () {
  return this.http_proxy.address().port;
};

Proxy.prototype.close = function () {
  this.http_proxy.close();
  this.https_proxy.close();
};

module.exports.Proxy = Proxy;

