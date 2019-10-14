const BigNumber = require('bignumber.js');
const request = require('request');
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });


function noop() {}

function heartbeat() {
  this.isAlive = true;
}

wss.on('connection', function connection(ws, req) {
  ws.on('message', function incoming(message) {
      console.log("Received message from client: " + message);
  });
  ws.isAlive = true;
  ws.on('pong', heartbeat);
});


const broadcast = async(msg) => {
    wss.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(msg));
        }
    }); 
}
// Fetch gold price for external API
const getGoldPrice = async() => {
    request('https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/XAU/USD', function (error, response, body) {
        if (error) {
            console.log("Error Fetching Price Data: " + JSON.stringify(error));
        } else if (response && response.statusCode == 200) {
            let data = JSON.parse(body)
            let profile = data[0].spreadProfilePrices[0]
            let bid = profile.bid;
            let ask = profile.ask;
            let spot_per_ounce = BigNumber(bid).plus(ask).div(2);
            let spot_per_gram = spot_per_ounce.div(28.34952).toFixed(4);
            console.log("Sending price per gram " + spot_per_gram);
            broadcast({'usd_per_gram_aux': spot_per_gram});
        }
    });
}

// Ping to make sure connection is alive with all clients
const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping(noop);
  });
}, 30000);

// Want to update price every 5 seconds
setInterval(getGoldPrice, 5000);
