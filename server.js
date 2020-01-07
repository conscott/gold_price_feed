require('dotenv').config()
const BigNumber = require('bignumber.js');
const request = require('request');
const winston = require('winston');
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: process.env.PORT });


// Setup logging config
let logger = winston.createLogger({
  level: (process.env.LOG_LEVEL || 'info'),
  format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: 'combined.log',
      colorize:  false
    }),
    new winston.transports.Console({
      colorize: winston.format.colorize(),
      format: winston.format.simple(),
    })
  ]
});

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

// Get USD Price from SilverBullion.sg
const getGoldPriceSB = async() => {
  return new Promise((resolve, reject) => {
      request('https://api.silverbullion.com.sg/api/SpotPrices/GetSpotPrices', function (error, response, body) {
          if (error) {
              console.log("Error Fetching Price Data: " + JSON.stringify(error));
              reject(error);
          } else if (response && response.statusCode == 200) {
              let data = JSON.parse(body)
              for (metal of data) {
                if (metal['metalCode'] === 'au') {
                  let bid = metal.bidUsd;
                  let ask = metal.askUsd;
                  let spot_per_ounce = BigNumber(bid).plus(ask).div(2);
                  let spot_per_gram = spot_per_ounce.div(28.34952).toFixed(4);
                  logger.info("Bid " + bid + " ask " + ask + " midpoint " + spot_per_ounce);
                  resolve(spot_per_gram);
                  return;
                }
              }
          }
      });
  });
}

// Get USD price from SwissQuote
const getGoldPriceUSD = async() => {
    return new Promise((resolve, reject) => {
        request('https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/XAU/USD', function (error, response, body) {
            if (error) {
                console.log("Error Fetching Price Data: " + JSON.stringify(error));
                reject(error);
            } else if (response && response.statusCode == 200) {
                let data = JSON.parse(body)
                let profile = data[0].spreadProfilePrices[0]
                let bid = profile.bid;
                let ask = profile.ask;
                let spot_per_ounce = BigNumber(bid).plus(ask).div(2);
                let spot_per_gram = spot_per_ounce.div(28.34952).toFixed(4);
                logger.info("Bid " + bid + " ask " + ask + " midpoint " + spot_per_ounce);
                resolve(spot_per_gram);
            }
        });
    });
}

// Get EUR price from SwissQuote
const getGoldPriceEUR = async() => {
   return new Promise((resolve, reject) => {
       request('https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/XAU/EUR', function (error, response, body) {
           if (error) {
               console.log("Error Fetching Price Data: " + JSON.stringify(error));
               reject(error);
           } else if (response && response.statusCode == 200) {
                let data = JSON.parse(body)
                let profile = data[0].spreadProfilePrices[0]
                let bid = profile.bid;
                let ask = profile.ask;
                let spot_per_ounce = BigNumber(bid).plus(ask).div(2);
                let spot_per_gram = spot_per_ounce.div(28.34952).toFixed(4);
                resolve(spot_per_gram);
            }
        });
    });
}


let price_cache_usd = 0.0;
let price_cache_eur = 0.0;

const getGoldPrice = async() => {
    let data = {}

    // Market is closed from
    // Sat 23:00 UTC to Sun 23:00 UTC
    let open_market = true;
    let now = new Date();
    if (now.getUTCDay() == 6 && now.getUTCHours() >= 23 ||
        now.getUTCDay() == 0 && now.getUTCHours() <= 23) {
        let open_market = false;
    }

    // SwissQuote gives bad order book an hour before market open
    // on Sunday night for whatever reason
    let swiss_quote_bad = false;
    if (now.getUTCDay() == 0 &&
        now.getUTCHours() >= 22 &&
        now.getUTCHours() <= 23) {
        swiss_quote_bad = true;
    }

    if (process.env.SOURCE === 'SwissQuote') {

        // Fix bad pricing before market open
        let spot_per_gram_usd = 0.0;
        let spot_per_gram_eur = 0.0;
        if (swiss_quote_bad) {
            spot_per_gram_usd = price_cache_usd;
            spot_per_gram_eur = price_cache_eur;
        } else {
            spot_per_gram_usd = await getGoldPriceUSD();
            spot_per_gram_eur = await getGoldPriceEUR();
        }

        // Cache the closed market price to use later when SwissQuote
        // screws it up
        if (!open_market &&
            now.getUTCHours() > 0 &&
            now.getUTCHours() < 1) {
            price_cache_usd = spot_per_gram_usd;
            price_cache_eur = spot_per_gram_eur;
        }

        data = {
            'usd_per_gram_aux': spot_per_gram_usd,
            'eur_per_gram_aux': spot_per_gram_eur,
            'source': 'SwissQuote',
            'market_open': open_market
        }
    } else {
        let spot_per_gram_usd = await getGoldPriceSB();
        data = {
            'usd_per_gram_aux':spot_per_gram_usd,
            'source': 'SilverBullion',
            'market_open': open_market
        };
    }
    logger.info("Sending data " + JSON.stringify(data, null, 4));
    broadcast(data);
}

// Ping to make sure connection is alive with all clients
const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 30000);

// Want to update price every 5 seconds
setInterval(getGoldPrice, process.env.POLL_INTERVAL_MS);
