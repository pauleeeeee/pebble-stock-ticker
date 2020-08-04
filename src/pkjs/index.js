//require clay package for settings and instantiate it
var Clay = require('pebble-clay');
var clayConfig = require('./config.json');
var clay = new Clay(clayConfig, null, { autoHandleEvents: true });

//include MessageQueue system
var MessageQueue = require('message-queue-pebble');

//declare global settings variable
var settings = {};

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
            Pebble.showSimpleNotificationOnPebble("Heads up!", "Add stocks in the watchface configuration page inside the Pebble phone app.");
        } else {
            queryLoop();
        }
    }
);

function queryLoop(){
    // if the last call was more than the specified interval, do a new call
    if((new Date().getTime() - lastCall) > settings["QueryInterval"]){
        requestStockData();
    }
}

function queryAPI(i){
    //get the data
    var dummy = {
        "StockDataLineOne":"stock n" + i,
        "StockDataLineTwo":"more data " + i,
    }
    return dummy
}

function requestStockData(){
    var tickerArray = [];
    for (var i = 0; i < 5; i++){
        tickerArray.push(queryAPI(i));
    }
    console.log(JSON.stringify(tickerArray));
    sendMessages(tickerArray);
}

//example of using messagequeue to send a chain of messages
function sendMessages(tickerArray){
    for (var i = 0; i < 5; i++){
        MessageQueue.sendAppMessage(tickerArray[i]);
    }
    // for (var i = 0; i < 5; i++){
    //     console.log('sending appmessage');
    //     MessageQueue.sendAppMessage({
    //         "StockDataLineOne":"stock n" + i,
    //         "StockDataLineTwo":"more data " + i,
    //     });
    // }
}



















//maybe for a more advanced app
// (this goes in package.json)
//
// "messageKeys": {
//     "StockSymbol": 100,
//     "StockPriceCurrent": 101,
//     "StockPriceOpen": 102,
//     "StockPriceHigh": 103,
//     "StockPriceLow": 104,
//     "StockPriceChangeAsPercentage": 105,
//     "StockPriceChangeAsDollar": 106,
//     "StockTradingVolume": 107,
//     "StockPriceTimeSeries": 108
//   },
