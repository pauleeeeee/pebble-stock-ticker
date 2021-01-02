//require clay package for settings and instantiate it
var Clay = require('pebble-clay');
var clayConfig = require('./config.json');
var clay = new Clay(clayConfig, null, { autoHandleEvents: true });

//helper libraries
var _ = require('lodash');
var moment = require('moment-timezone');

//include MessageQueue system
// var MessageQueue = require('message-queue-pebble');

//declare global settings variable
var settings = {};
// var settings = {
//     APIKey: "",
//     DisplayMode: 0,
//     StockSymbol: "TSLA",
//     StockPriceHistoryHorizon: "1month",
//     DitherStyle: 2,
//     AssetType: "crypto",
//     CryptoSymbol: "btcusd-perpetual-future-inverse",
//     CryptoPriceHistoryHorizon: "1m",
//     RefreshInterval: "5"
// };


var lastCall = 0;

//on load function
Pebble.addEventListener("ready",
    function(e) {
      //on load, get settings from local storage if they have already been set by clay. If they have not been set, define settings as a blank object.
      settings = JSON.parse(localStorage.getItem('clay-settings')) || {};
      console.log(JSON.stringify(settings));

      lastCall = localStorage.getItem('lastCall') || 0;

      //if settings is a blank object, send a configuration notification to the user
      if (settings == {}){
        Pebble.sendAppMessage({
          "StockMarketStatus": "needs configuration"
        });
      } else {
        fetchLoop();
      }
    }
);

function fetchLoop(){
  var now = new Date().getTime();
  lastCall = localStorage.getItem('lastCall') || 0;
  var interval = settings.RefreshInterval * 60000;
  if ( now - lastCall > interval ) {
    console.log('updating');
    if (settings.AssetType == "stock") {
      getStockPriceHistory(settings.StockSymbol);
    } else if (settings.AssetType == "crypto") {
      getCryptoPriceHistory(settings.CryptoSymbol);
    }
  }
  setTimeout(function(){fetchLoop()},60000);
}

//for clay to show the config page...
Pebble.addEventListener('showConfiguration', function(e) {
    Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener("webviewclosed", function(e){
    console.log('from web view closed:');
    //// settings = clay.getSettings(e.response, true);
    //// localStorage.setItem("settings", JSON.stringify(settings));
    settings = JSON.parse(localStorage.getItem('clay-settings'));
    console.log(JSON.stringify(settings));
    Pebble.sendAppMessage({
        StockMarketStatus: "loading...",
        DitherStyle: Number(settings.DitherStyle),
        ClearFace: 1
    });

    if (settings.AssetType == "stock") {
      getStockPriceHistory(settings.StockSymbol);
    } else if (settings.AssetType == "crypto") {
      getCryptoPriceHistory(settings.CryptoSymbol)
    }

});

function getCryptoPriceHistory(symbol){
  var url = "https://api.cryptowat.ch/markets/binance/" + symbol + "/ohlc";
  if (symbol == "btcusd-perpetual-future-inverse") {
    url = "https://api.cryptowat.ch/markets/bitmex/btcusd-perpetual-future-inverse/ohlc";
  } else if (symbol == "xrpusd-perpetual-future-inverse"){
    url = "https://api.cryptowat.ch/markets/bitmex/xrpusd-perpetual-future-quanto/ohlc";
  }

  var time = 0;
  var period = 0;

  switch(settings.CryptoPriceHistoryHorizon) {
    case "2.5h": time = moment().subtract(2.5, "hours").unix(); period = 60; break;
    case "12h": time = moment().subtract(12, "hours").unix(); period = 300; break;
    case "1d": time = moment().subtract(1, "days").unix(); period = 300; break;
    case "1w": time = moment().subtract(7, "days").unix(); period = 3600; break;
    case "1m": time = moment().subtract(1, "months").unix(); period = 14400; break;
    case "1y": time = moment().subtract(1, "years").unix(); period = 86400; break;
    case "5y": time = moment().subtract(5, "years").unix(); period = 604800; break;
  }

  url += "?after=" + time + "&periods=" + period;

  var req = new XMLHttpRequest();

  req.open('GET', url, true);

  req.onload = function(e) {
    if (req.readyState == 4) {
      // 200 - HTTP OK
      if(req.status == 200) {
        var response = JSON.parse(req.responseText);
        console.log(JSON.stringify(response));

        var history = response.result[period+""];
        console.log(history.length);

        var priceHistory = [];
        var volumeHistory = [];

        if (history.length < 144) {
          var backfill = 144 - history.length;
          var temp = [];
          
          for (var i = 0; i < history.length; i++){
            temp.push(history[i][4]).toFixed(1);
          }

          var min = temp.reduce(function(a, b) {
            return Math.min(a, b);
          });

          for (var i = 0; i < backfill; i++){
            priceHistory.push(min - (min/2));
            volumeHistory.push(0);
          }
        }


        for (var i = 0; i < history.length; i++){
            priceHistory.push(history[i][4]).toFixed(1);
            volumeHistory.push(Math.round(history[i][5]));
        }


        var price = formatStockPrice(priceHistory[priceHistory.length-1]);
        var changePercent = "( " + Number(((priceHistory[priceHistory.length-1] - priceHistory[0]) / priceHistory[0])*100).toFixed(2) + "% )";

        var graphHeight = 100;
        

        // **********
        // **** VOL
        // **********

        var volumeMax = volumeHistory.reduce(function(a, b) {
            return Math.max(a, b);
        });
        var volumeMin = volumeHistory.reduce(function(a, b) {
            return Math.min(a, b);
        });
        var volumeRange = volumeMax - volumeMin;

        volHis = [];
        for (var i = 0; i < volumeHistory.length; i++){
            volHis.push({
                x: i,
                volume: volumeHistory[i] = Math.round( (volumeHistory[i] - volumeMin) / volumeRange * 20 )
            })
        }
        volHis = largestTriangleThreeBuckets(volHis, 140, "x", "volume" );
        volumeHistory = [];
        for (var i = 0; i < volHis.length; i++) {
            volumeHistory.push(volHis[i].volume);
        }
        console.log(volumeHistory);

        // **********
        // **** PRICE
        // **********

        var priceMax = priceHistory.reduce(function(a, b) {
            return Math.max(a, b);
        });
        var priceMin = priceHistory.reduce(function(a, b) {
            return Math.min(a, b);
        });
        var priceRange = priceMax - priceMin;

        priceHis = [];
        for (var i = 0; i < priceHistory.length; i++){
            priceHis.push({
                x: i,
                price: Math.round( (priceHistory[i] - priceMin) / priceRange * 100 )
            })
        }
        priceHis = largestTriangleThreeBuckets(priceHis, 140, "x", "price" );
        priceHistory = [];
        for (var i = 0; i < priceHis.length; i++) {
            priceHistory.push(110-priceHis[i].price);
        }
        //console.log(priceHistory);

        // **********
        // **** SEND
        // **********
        var message = {
          StockSymbol: translateCryptoSymbol(symbol),
          StockPrice: price+"",
          StockPriceChange: changePercent,
          StockVolumeHistory: volumeHistory,
          StockPriceHistory: priceHistory,
          StockMarketStatus: settings.CryptoPriceHistoryHorizon + " price history"
        }

        console.log(JSON.stringify(message));
        Pebble.sendAppMessage(message, localStorage.setItem("lastCall", JSON.stringify(new Date().getTime())));


      }
    }
  }
  
  req.send();
}

function translateCryptoSymbol(symbol){
  var translated = '';
  switch(symbol){
    case "btcusd-perpetual-future-inverse":
    case "btceur":
      translated = "BTC";
      break;
    case "ethusd-perpetual-future-inverse":
    case "etheur":
      translated = "ETH";
      break;
    case "bnbusd-perpetual-future-inverse":
    case "bnbeur":
      translated = "BNB";
      break;
    case "xrpusd-perpetual-future-inverse":
    case "xrpeur":
      translated = "XRP";
      break;
    case "ltcusd-perpetual-future-inverse":
    case "ltceur":
      translated = "LTC";
      break;
    case "linkusd-perpetual-future-inverse":
    case "linkeur":
      translated = "LINK";
      break;
    case "ltcusd-perpetual-future-inverse":
    case "ltceur":
      translated = "LTC";
      break;
    case "dotusd-perpetual-future-inverse":
    case "doteur":
      translated = "DOT";
      break;  
}

  return translated;
}


function getStockPriceHistory(symbol){
    var req = new XMLHttpRequest();
    if (settings.StockPriceHistoryHorizon == '1week' ){
        req.open('GET', 'https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&outputsize=full&interval=5min&symbol=' + symbol + '&apikey=' + settings.APIKey, true);
        req.onload = function(e) {
            if (req.readyState == 4) {
              // 200 - HTTP OK
                if(req.status == 200) {
                    var response = JSON.parse(req.responseText);
                    //console.log(JSON.stringify(response));
                    //console.log(_.values(response["Time Series (5min)"]).length);
                    var price = Number(_.values(response["Time Series (5min)"])[0]["4. close"]);
                    var changePercent = "1.00%";
                    var volume = _.values(response["Time Series (5min)"])[0]["5. volume"];
                    var stockData = {
                        "StockSymbol": symbol,
                        "StockPrice": formatStockPrice(price),
                        "StockPriceChange": formatChangePercent(changePercent),
                        "StockVolume": filterNumber(volume),
                        "StockMarketStatus": getMarketStatus()
                    }
                    console.log(JSON.stringify(stockData));
                    Pebble.sendAppMessage(stockData);
                }
            }
        }
        req.send();
    } else if (settings.StockPriceHistoryHorizon == '1month'){
        req.open('GET', 'https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&outputsize=full&interval=30min&symbol=' + symbol + '&apikey=' + settings.APIKey, true);
        req.onload = function(e) {
            if (req.readyState == 4) {
              // 200 - HTTP OK
              if(req.status == 200) {
                var response = JSON.parse(req.responseText);
                //console.log(JSON.stringify(response));

                
                var his = _.values(response["Time Series (30min)"]);
                var dates = _.keys(response["Time Series (30min)"]);
                var history = [];

                //return only entries in the normal trading window ('market open')
                for (var i = 0; i < dates.length; i++) {
                  if (checkMarketStatus(dates[i]) == "market is open") {
                    console.log(dates[i]);
                    history.push(his[i]);
                  }
                }

                console.log(JSON.stringify(history[history.length-1]))
                
                //console.log(history.length);

                var priceHistory = [];
                var volumeHistory = [];

                if (history.length < 260){
                    Pebble.sendAppMessage({
                        StockMarketStatus: "price history failed"
                    })
                }


                for (var i = 0; i <= 260; i++){
                    priceHistory.push(Number(history[i]["4. close"]).toFixed(2));
                    volumeHistory.push(history[i]["5. volume"]);
                }

                var price = formatStockPrice(Number(priceHistory[0]));

                var changePercent = "( " + Number(((priceHistory[0] - priceHistory[priceHistory.length-1]) / priceHistory[priceHistory.length-1])*100).toFixed(2) + "% )";

                console.log('pricehistory.length-1')
                console.log(priceHistory[priceHistory.length-1]);

                priceHistory.reverse();
                volumeHistory.reverse();

                // **********
                // **** VOL
                // **********

                var volumeMax = volumeHistory.reduce(function(a, b) {
                    return Math.max(a, b);
                });
                var volumeMin = volumeHistory.reduce(function(a, b) {
                    return Math.min(a, b);
                });
                var volumeRange = volumeMax - volumeMin;

                volHis = [];
                for (var i = 0; i < volumeHistory.length; i++){
                    volHis.push({
                        x: i,
                        volume: volumeHistory[i] = Math.round( (volumeHistory[i] - volumeMin) / volumeRange * 20 )
                    })
                }
                volHis = largestTriangleThreeBuckets(volHis, 140, "x", "volume" );
                volumeHistory = [];
                for (var i = 0; i < volHis.length; i++) {
                    volumeHistory.push(volHis[i].volume);
                }
                console.log(volumeHistory);

                // **********
                // **** PRICE
                // **********

                var priceMax = priceHistory.reduce(function(a, b) {
                    return Math.max(a, b);
                });
                var priceMin = priceHistory.reduce(function(a, b) {
                    return Math.min(a, b);
                });
                var priceRange = priceMax - priceMin;

                priceHis = [];
                for (var i = 0; i < priceHistory.length; i++){
                    priceHis.push({
                        x: i,
                        price: priceHistory[i] = Math.round( (priceHistory[i] - priceMin) / priceRange * 100 )
                    })
                }
                priceHis = largestTriangleThreeBuckets(priceHis, 140, "x", "price" );
                priceHistory = [];
                for (var i = 0; i < priceHis.length; i++) {
                    priceHistory.push(110-priceHis[i].price);
                }
                console.log(priceHistory);

                // **********
                // **** SEND
                // **********
                var message = {
                  StockSymbol: symbol,
                  StockPrice: price,
                  StockPriceChange: changePercent,
                  StockVolumeHistory: volumeHistory,
                  StockPriceHistory: priceHistory,
                  StockMarketStatus: getMarketStatus()
                }
                console.log(JSON.stringify(message));
                Pebble.sendAppMessage(message);
                
              }
            }
        }
        req.send();
    } else if (settings.StockPriceHistoryHorizon == '1year'){
        req.open('GET', 'https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&outputsize=full&symbol=' + symbol + '&apikey=' + settings.APIKey, true);
        req.onload = function(e) {
            if (req.readyState == 4) {
              // 200 - HTTP OK
              if(req.status == 200) {
                var response = JSON.parse(req.responseText);
                //console.log(JSON.stringify(response));

                
                var history = _.values(response["Time Series (Daily)"]);
                //console.log(history.length);

                var priceHistory = [];
                var volumeHistory = [];

                if (history.length < 252){
                    Pebble.sendAppMessage({
                        StockMarketStatus: "price history failed"
                    })
                }


                for (var i = 0; i <= 252; i++){
                    priceHistory.push(Number(history[i]["5. adjusted close"]).toFixed(2));
                    volumeHistory.push(history[i]["6. volume"]);
                }

                var price = formatStockPrice(Number(priceHistory[0]));

                var changePercent = "( " + Number(((priceHistory[0] - priceHistory[priceHistory.length-1]) / priceHistory[priceHistory.length-1])*100).toFixed(2) + "% )";
                
                console.log('oldest date')
                console.log(JSON.stringify(_.keys(response["Time Series (Daily)"])[priceHistory.length-1]));
                console.log(JSON.stringify(history[priceHistory.length-1]));

                priceHistory.reverse();
                volumeHistory.reverse();

                // **********
                // **** VOL
                // **********

                var volumeMax = volumeHistory.reduce(function(a, b) {
                    return Math.max(a, b);
                });
                var volumeMin = volumeHistory.reduce(function(a, b) {
                    return Math.min(a, b);
                });
                var volumeRange = volumeMax - volumeMin;

                volHis = [];
                for (var i = 0; i < volumeHistory.length; i++){
                    volHis.push({
                        x: i,
                        volume: volumeHistory[i] = Math.round( (volumeHistory[i] - volumeMin) / volumeRange * 20 )
                    })
                }
                volHis = largestTriangleThreeBuckets(volHis, 140, "x", "volume" );
                volumeHistory = [];
                for (var i = 0; i < volHis.length; i++) {
                    volumeHistory.push(volHis[i].volume);
                }
                console.log(volumeHistory);

                // **********
                // **** PRICE
                // **********

                var priceMax = priceHistory.reduce(function(a, b) {
                    return Math.max(a, b);
                });
                var priceMin = priceHistory.reduce(function(a, b) {
                    return Math.min(a, b);
                });
                var priceRange = priceMax - priceMin;

                priceHis = [];
                for (var i = 0; i < priceHistory.length; i++){
                    priceHis.push({
                        x: i,
                        price: priceHistory[i] = Math.round( (priceHistory[i] - priceMin) / priceRange * 100 )
                    })
                }
                priceHis = largestTriangleThreeBuckets(priceHis, 140, "x", "price" );
                priceHistory = [];
                for (var i = 0; i < priceHis.length; i++) {
                    priceHistory.push(110-priceHis[i].price);
                }
                console.log(priceHistory);

                // **********
                // **** SEND
                // **********
                var message = {
                  StockSymbol: symbol,
                  StockPrice: price,
                  StockPriceChange: changePercent,
                  StockVolumeHistory: volumeHistory,
                  StockPriceHistory: priceHistory,
                  StockMarketStatus: getMarketStatus()
                }
                console.log(JSON.stringify(message));
                Pebble.sendAppMessage(message);
              }
            }
        }
        req.send();
    } else if (settings.StockPriceHistoryHorizon == '5years'){
        req.open('GET', 'https://www.alphavantage.co/query?function=TIME_SERIES_WEEKLY_ADJUSTED&symbol=' + symbol + '&apikey=' + settings.APIKey, true);
        req.onload = function(e) {
            if (req.readyState == 4) {
              // 200 - HTTP OK
                if(req.status == 200) {
                    var response = JSON.parse(req.responseText);
                    //console.log(JSON.stringify(response));
                }
            }
        }
        req.send();
    }
}


function getSimpleStockQuote(symbol){
  var req = new XMLHttpRequest();
  req.open('GET', 'https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=' + symbol + '&apikey=' + settings.APIKey, true);
  req.onload = function(e) {
      if (req.readyState == 4) {
        // 200 - HTTP OK
          if(req.status == 200) {
            var response = JSON.parse(req.responseText);
            console.log(JSON.stringify(response));

            //make some more reasonable convenience variables
            var price = Number(response["Global Quote"]["05. price"]);
            price = formatStockPrice((price));

            var changePercent = String(response["Global Quote"]["10. change percent"]);
            changePercent = formatChangePercent(changePercent);
            // changePercent = Number(changePercent.slice(0, changePercent.length-1));
            // changePercent = changePercent.toFixed(2);
            var volume = filterNumber(response["Global Quote"]["06. volume"]);

            var stockData = {
                StockSymbol: symbol,
                StockPrice: price,
                StockPriceChange: changePercent,
                StockVolume: volume,
                StockMarketStatus: getMarketStatus()
            }

            console.log(JSON.stringify(stockData));

            Pebble.sendAppMessage(stockData);

          }
      }
  }
  req.send();

}


// function requestMultiStockData(){
//     for (i = 1; i < 6; i++){
//         if (settings["StockSymbol"+i] && settings["StockSymbol"+i] != "") {
//             queryAPI(i-1, settings["StockSymbol"+i]);
//         }
//     }
// }


//check the market's status for any given day and time
function getMarketStatus(){
    var nycTime = moment().tz("America/New_York");
    if(check_holiday(new Date())){
        return "market is closed (holiday)";
    } else if (nycTime.day() == 0 || nycTime.day() == 6){
        return "market is closed"
    } else {
        if (nycTime.hours() < 7 || nycTime.hours() > 19) {
            return "market is closed"
        } else if (nycTime.hours() == 8 || ( nycTime.hours() == 9 && nycTime.minutes() < 30)) {
            return "pre-market trading"
        } else if (nycTime.hours() >= 16 && nycTime.hours() <= 19) {
            return "after-market trading"
        } else {
            return "market is open"
        }
    }
}

function checkMarketStatus(date){
  var nycTime = moment(date);
  if(check_holiday(new Date(date))){
      return "market is closed (holiday)";
  } else if (nycTime.day() == 0 || nycTime.day() == 6){
      return "market is closed"
  } else {
      if (nycTime.hours() < 7 || nycTime.hours() > 19) {
          return "market is closed"
      } else if (nycTime.hours() == 8 || ( nycTime.hours() == 9 && nycTime.minutes() < 30)) {
          return "pre-market trading"
      } else if (nycTime.hours() > 16 && nycTime.hours() <= 19) {
          return "after-market trading"
      } else if (nycTime.hours() == 16 && nycTime.minutes() > 0) {
        return "after-market trading"
      } else {
          return "market is open"
      }
  }
}

//helper function to format change percent
function formatChangePercent(changePercent){
    changePercent = Number(changePercent.slice(0, changePercent.length-1));
    changePercent = changePercent.toFixed(2);
    return "( " + changePercent + "% )";
}

//helper function to format the stock price
function formatStockPrice(price){
    if (price < 100){
        price = price.toFixed(2);
    } else if (price >= 100 && price < 1000) {
        price = price.toFixed(1);
    } else if (price >= 1000){
        price = Math.round(price);
    }
    return price+"";
}

//function to reduce the size of the stock's volume
function filterNumber(number){
    var num = Math.abs(number);
    if (num < 1){
      return num.toString().slice(1,4)
    } else if ((num >= 1) && (num < 10)){
      return num.toString().slice(0,4)
    } else if ((num >= 10) && (num < 100)){
      return num.toString().slice(0,4)
    } else if ((num >= 100) && (num < 1000)){
      return num.toString().slice(0,3)
    } else if ((num >= 1000) && (num < 10000)){
      return num.toString().slice(0,1)+"."+num.toString().slice(1,2)+"k"
    } else if ((num >= 10000) && (num < 100000)){
      return num.toString().slice(0,2)+"k"
    } else if ((num >= 100000) && (num < 1000000)){
      return num.toString().slice(0,3)+"k"
    } else if ((num >= 1000000) && (num < 10000000)){
      return num.toString().slice(0,1)+"."+num.toString().slice(1,2)+"m"
    } else if ((num >= 10000000) && (num < 100000000)){
      return num.toString().slice(0,2)+"m"
    } else if ((num >= 100000000) && (num < 1000000000)){
      return num.toString().slice(0,3)+"m"
    } else {
      return "--";
    }

}

//source for these check_holiday and GoodFriday functions: https://mresoftware.com/holiday_script.htm
function check_holiday (dt_date) {  // check for market holidays
    // dt_date = new Date("2017-04-14T12:01:00Z"); // for testing purposes
    // check simple dates (month/date - no leading zeroes)
    var n_date = dt_date.getDate();
    var n_month = dt_date.getMonth() + 1;
    var s_date1 = n_month + '/' + n_date;
    var s_year = dt_date.getFullYear();
    var s_day = dt_date.getDay(); // day of the week 0-6
    switch(s_date1){
        case '1/1':
        return "New Year's";
        case '7/4':
        return "Independence Day";
        case '12/25':
        return "Christmas";
        case GoodFriday(s_year):
        return "Good Friday";
        }
    // special cases - friday before or monday after weekend holiday
    if (s_day == 5){  // Friday before
        switch(s_date1){
            case '12/31':
            return "New Year's";
            case '7/3':
            return "Independence Day";
            case '12/24':
            return "Christmas";
            }
        }
    if (s_day == 1){  // Monday after
        switch(s_date1){
            case '1/2':
            return "New Year's";
            case '7/5':
            return "Independence Day";
            case '12/26':
            return "Christmas";
            }
        }
    // weekday from beginning of the month (month/num/day)
    var n_wday = dt_date.getDay();
    var n_wnum = Math.floor((n_date - 1) / 7) + 1;
    var s_date2 = n_month + '/' + n_wnum + '/' + n_wday;
    switch(s_date2){
        case '1/3/1':
        return "ML King Birthday";
        case '2/3/1':
        return "President's Day";
        case '9/1/1':
        return "Labor Day";
        case '11/4/4':
        return "Thanksgiving";
        }
    // weekday number from end of the month (month/num/day)
    var dt_temp = new Date (dt_date);
    dt_temp.setDate(1);
    dt_temp.setMonth(dt_temp.getMonth() + 1);
    dt_temp.setDate(dt_temp.getDate() - 1);
    n_wnum = Math.floor((dt_temp.getDate() - n_date) / 7) + 1;
    var s_date3 = n_month + '/' + n_wnum + '/' + n_wday;
    if (   s_date3 == '5/1/1'  // Memorial Day, last Monday in May
    ) return 'Memorial Day';
    // misc complex dates
    //	if (s_date1 == '1/20' && (((dt_date.getFullYear() - 1937) % 4) == 0) 
        // Inauguration Day, January 20th every four years, starting in 1937. 
    //	) return 'Inauguration Day';
    //	if (n_month == 11 && n_date >= 2 && n_date < 9 && n_wday == 2
        // Election Day, Tuesday on or after November 2. 
    //	) return 'Election Day';
    return false;
} 

function GoodFriday(Y) {  // calculates Easter Sunday and subtracts 2 days
    var C = Math.floor(Y/100);
    var N = Y - 19*Math.floor(Y/19);
    var K = Math.floor((C - 17)/25);
    var I = C - Math.floor(C/4) - Math.floor((C - K)/3) + 19*N + 15;
    I = I - 30*Math.floor((I/30));
    I = I - Math.floor(I/28)*(1 - Math.floor(I/28)*Math.floor(29/(I + 1))*Math.floor((21 - N)/11));
    var J = Y + Math.floor(Y/4) + I + 2 - C + Math.floor(C/4);
    J = J - 7*Math.floor(J/7);
    var L = I - J;
    var M = 3 + Math.floor((L + 40)/44);
    var D = L + 28 - 31*Math.floor(M/4);
    //
    D = D-2;  // subtract 2 days for Good Friday
    if (D <= 0){
        D = D + 31;	// correct day if we went back to March
        M = 3;			// correct month
        }
    return parseInt(M, 10) + '/' + parseInt(D, 10);  // return without any leading zeros
}


// // polyfill for ancient iOS JS environment
// // Production steps of ECMA-262, Edition 6, 22.1.2.1
// if (!Array.from) {
//     Array.from = (function () {
//       var toStr = Object.prototype.toString;
//       var isCallable = function (fn) {
//         return typeof fn === 'function' || toStr.call(fn) === '[object Function]';
//       };
//       var toInteger = function (value) {
//         var number = Number(value);
//         if (isNaN(number)) { return 0; }
//         if (number === 0 || !isFinite(number)) { return number; }
//         return (number > 0 ? 1 : -1) * Math.floor(Math.abs(number));
//       };
//       var maxSafeInteger = Math.pow(2, 53) - 1;
//       var toLength = function (value) {
//         var len = toInteger(value);
//         return Math.min(Math.max(len, 0), maxSafeInteger);
//       };
  
//       // The length property of the from method is 1.
//       return function from(arrayLike/*, mapFn, thisArg */) {
//         // 1. Let C be the this value.
//         var C = this;
  
//         // 2. Let items be ToObject(arrayLike).
//         var items = Object(arrayLike);
  
//         // 3. ReturnIfAbrupt(items).
//         if (arrayLike == null) {
//           throw new TypeError('Array.from requires an array-like object - not null or undefined');
//         }
  
//         // 4. If mapfn is undefined, then let mapping be false.
//         var mapFn = arguments.length > 1 ? arguments[1] : void undefined;
//         var T;
//         if (typeof mapFn !== 'undefined') {
//           // 5. else
//           // 5. a If IsCallable(mapfn) is false, throw a TypeError exception.
//           if (!isCallable(mapFn)) {
//             throw new TypeError('Array.from: when provided, the second argument must be a function');
//           }
  
//           // 5. b. If thisArg was supplied, let T be thisArg; else let T be undefined.
//           if (arguments.length > 2) {
//             T = arguments[2];
//           }
//         }
  
//         // 10. Let lenValue be Get(items, "length").
//         // 11. Let len be ToLength(lenValue).
//         var len = toLength(items.length);
  
//         // 13. If IsConstructor(C) is true, then
//         // 13. a. Let A be the result of calling the [[Construct]] internal method 
//         // of C with an argument list containing the single item len.
//         // 14. a. Else, Let A be ArrayCreate(len).
//         var A = isCallable(C) ? Object(new C(len)) : new Array(len);
  
//         // 16. Let k be 0.
//         var k = 0;
//         // 17. Repeat, while k < len… (also steps a - h)
//         var kValue;
//         while (k < len) {
//           kValue = items[k];
//           if (mapFn) {
//             A[k] = typeof T === 'undefined' ? mapFn(kValue, k) : mapFn.call(T, kValue, k);
//           } else {
//             A[k] = kValue;
//           }
//           k += 1;
//         }
//         // 18. Let putStatus be Put(A, "length", len, true).
//         A.length = len;
//         // 20. Return A.
//         return A;
//       };
//     }());
//   }


//incredible function that samples timeseries charts; developed by https://skemman.is/handle/1946/15343
  function largestTriangleThreeBuckets(data, threshold, xAccessor, yAccessor) {

    var floor = Math.floor,
      abs = Math.abs;

    var daraLength = data.length;
    if (threshold >= daraLength || threshold === 0) {
      return data; // Nothing to do
    }

    var sampled = [],
      sampledIndex = 0;

    // Bucket size. Leave room for start and end data points
    var every = (daraLength - 2) / (threshold - 2);

    var a = 0,  // Initially a is the first point in the triangle
      maxAreaPoint,
      maxArea,
      area,
      nextA;

    sampled[ sampledIndex++ ] = data[ a ]; // Always add the first point

    for (var i = 0; i < threshold - 2; i++) {

      // Calculate point average for next bucket (containing c)
      var avgX = 0,
        avgY = 0,
        avgRangeStart  = floor( ( i + 1 ) * every ) + 1,
        avgRangeEnd    = floor( ( i + 2 ) * every ) + 1;
      avgRangeEnd = avgRangeEnd < daraLength ? avgRangeEnd : daraLength;

      var avgRangeLength = avgRangeEnd - avgRangeStart;

      for ( ; avgRangeStart<avgRangeEnd; avgRangeStart++ ) {
        avgX += data[ avgRangeStart ][ xAccessor ] * 1; // * 1 enforces Number (value may be Date)
        avgY += data[ avgRangeStart ][ yAccessor ] * 1;
      }
      avgX /= avgRangeLength;
      avgY /= avgRangeLength;

      // Get the range for this bucket
      var rangeOffs = floor( (i + 0) * every ) + 1,
        rangeTo   = floor( (i + 1) * every ) + 1;

      // Point a
      var pointAX = data[ a ][ xAccessor ] * 1, // enforce Number (value may be Date)
        pointAY = data[ a ][ yAccessor ] * 1;

      maxArea = area = -1;

      for ( ; rangeOffs < rangeTo; rangeOffs++ ) {
        // Calculate triangle area over three buckets
        area = abs( ( pointAX - avgX ) * ( data[ rangeOffs ][ yAccessor ] - pointAY ) -
              ( pointAX - data[ rangeOffs ][ xAccessor ] ) * ( avgY - pointAY )
              ) * 0.5;
        if ( area > maxArea ) {
          maxArea = area;
          maxAreaPoint = data[ rangeOffs ];
          nextA = rangeOffs; // Next a is this b
        }
      }

      sampled[ sampledIndex++ ] = maxAreaPoint; // Pick this point from the bucket
      a = nextA; // This a is the next a (chosen b)
    }

    sampled[ sampledIndex++ ] = data[ daraLength - 1 ]; // Always add last

    return sampled;
  }



//storage for config.json

// {
//     "type": "select",
//     "messageKey": "QueryInterval",
//     "defaultValue": "5",
//     "label": "Update interval",
//     "description": "How often you want the watchface to update with new stock price data",
//     "options": [
//       { 
//         "label": "5 minutes", 
//         "value": "5"
//       },
//       { 
//         "label": "10 minutes",
//         "value": "10"
//       },
//       {
//         "label": "15 minutes",
//         "value": "15"
//       },
//       { 
//         "label": "20 minutes",
//         "value": "20"
//       },
//       { 
//         "label": "30 minutes",
//         "value": "30"
//       },
//       {
//         "label": "1 hour",
//         "value": "60"
//       }
//     ]
// }



// {
//     "type":"input",
//     "messageKey":"StockSymbol2",
//     "label":"Stock Symbol #2",
//     "defaultValue":""
// },
// {
//     "type":"input",
//     "messageKey":"StockSymbol3",
//     "label":"Stock Symbol #3",
//     "defaultValue":""
// },
// {
//     "type":"input",
//     "messageKey":"StockSymbol4",
//     "label":"Stock Symbol #4",
//     "defaultValue":""
// },
// {
//     "type":"input",
//     "messageKey":"StockSymbol5",
//     "label":"Stock Symbol #5",
//     "defaultValue":""
// },
// {
//     "type": "select",
//     "messageKey": "DisplayMode",
//     "defaultValue": "1",
//     "label": "Display Mode",
//     "description": "Selecting single stock mode will show just one stock ticker on the Pebble (Stock Symbol #1) with a rich layout. Selecting multi mode will show you all five stock tickers in a minimalist list.",
//     "options": [
//         { 
//             "label": "Single", 
//             "value": 0
//         },
//         { 
//             "label": "Multi",
//             "value": 1
//         }
//     ]
// },