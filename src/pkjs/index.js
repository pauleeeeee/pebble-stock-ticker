//require clay package for settings and instantiate it
var Clay = require('pebble-clay');
var clayConfig = require('./config.json');
var clay = new Clay(clayConfig, null, { autoHandleEvents: true });

//include MessageQueue system
var MessageQueue = require('message-queue-pebble');

//declare global settings variable
var settings = {};

var lastCall = 0;

var tickerArray = [{},{},{},{},{}];


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

Pebble.addEventListener("webviewclosed", function(e){
    tickerArray = [{},{},{},{},{}];
    requestStockData();    
})

// UNFINISHED
function queryLoop(){
    // if the last call was more than the specified interval, do a new call
    // do not make a new call if today is a bank holiday
    if( ((new Date().getTime() - lastCall) > settings["QueryInterval"]) && isBankHoliday == "" && marketPresumedOpen() ){
        requestStockData();
        lastcall = new Date().getTime();
        localStorage.setItem('lastCall', lastcall);
    }
}


function queryAPI(i, symbol){
    //get the data
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
                if ( price < 100){
                    price = price.toFixed(2);
                } else if (price >= 100 && price < 1000) {
                    price = price.toFixed(1);
                } else if (price >= 1000){
                    price = Math.round(price);
                }
                var changePercent = String(response["Global Quote"]["10. change percent"]);
                changePercent = Number(changePercent.slice(0, changePercent.length-1));
                changePercent = changePercent.toFixed(2);
                var volume = response["Global Quote"]["06. volume"];

                var stockData = {
                    "StockDataLineOne":symbol + " " + price + " ( " + changePercent + "% )",
                    "StockDataLineTwo":"vol " + volume
                };

                //this is a gutsy way to do assignment - there are no safeguards for failed or delayed requests 
                tickerArray[i] = stockData;
            }
        }
    }
    req.send();

}

function requestStockData(){
    for (var i = 1; i < 6; i++){
        if (settings["StockSymbol"+i] && settings["StockSymbol"+i] != "") {
            queryAPI(i-1, settings["StockSymbol"+i]);
        }
    }
    console.log(JSON.stringify(tickerArray));

    //blind faith that all HTTP GETs will resolve without issue in five seconds then send to Pebble
    setTimeout(()=>{sendMessages(tickerArray);},5000);
    
}

function sendMessages(tickerArray){
    //could implement a sorting function here; biggest gainer on top, etc.
    //would have to parse string - maybe this should go elsewhere
    for (var i = 0; i < 5; i++){
        MessageQueue.sendAppMessage(tickerArray[i]);
    }
}


//source for this function at https://stackoverflow.com/questions/32342753/calculate-holidays-in-javascript
function isBankHoliday(date) {
    // static holidays
    const isDate = (d, month, date) => {
        return d.getMonth() == (month - 1) && d.getDate() == date;
    };
    if (isDate(date, 1, 1)) { return "New Year"; }
    else if (isDate(date, 7, 4)) { return "Independence Day"; }
    else if (isDate(date, 11, 11)) { return "Veterans Day"; }
    else if (isDate(date, 12, 25)) { return "Christmas Day"; }

    // dynamic holidays
    const isDay = (d, month, day, occurance) => {
        if (d.getMonth() == (month - 1) && d.getDay() == day) {
            if (occurance > 0) {
                return occurance == Math.ceil(d.getDate() / 7);
            } else {
                // check last occurance
                let _d = new Date(d);
                _d.setDate(d.getDate() + 7);
                return _d.getMonth() > d.getMonth();
            }
        }
        return false;
    };
    if (isDay(date, 1, 1, 3)) { return "MLK Day"; }
    else if (isDay(date, 2, 1, 3)) { return "Presidents Day"; }
    else if (isDay(date, 5, 1, -1)) { return "Memorial Day"; }
    else if (isDay(date, 9, 1, 1)) { return "Labor Day"; }
    else if (isDay(date, 10, 1, 2)) { return "Columbus Day"; }
    else if (isDay(date, 11, 4, 4)) { return "Thanksgiving Day"; }

    // Non Business days
    if (date.getDay() == 0) { return "Sunday"; }
    else if (date.getDay() == 6) { return "Saturday" }

    // not a holiday
    return "";
}

//modification of below source function
//returns one of: pre-market, open, after hours, closed
// UNFINISHED
function marketStatus() {
    
    // create Date object for current location
    var d = new Date();
   
    // convert to msec
    // add local time zone offset
    // get UTC time in msec
    var utc = d.getTime() + (d.getTimezoneOffset() * 60000);
   
    // create new Date object for different city
    // using NYC UTC offset of -4
    var nycTime = new Date(utc + (3600000 * -4));
   
    nycTime.getTime()

}



// source: https://www.techrepublic.com/article/convert-the-local-time-to-another-time-zone-with-this-javascript/
// function to calculate local time
// in a different city
// given the city's UTC offset
// function calcTime(city, offset) {

//     // create Date object for current location
//     d = new Date();
   
//     // convert to msec
//     // add local time zone offset
//     // get UTC time in msec
//     utc = d.getTime() + (d.getTimezoneOffset() * 60000);
   
//     // create new Date object for different city
//     // using supplied offset
//     nd = new Date(utc + (3600000*offset));
   
//     // return time as a string
//     return "The local time in " + city + " is " + nd.toLocaleString();

// }

// // get Bombay time
// alert(calcTime('Bombay', '+5.5'));

// // get Singapore time
// alert(calcTime('Singapore', '+8'));

// // get London time
// alert(calcTime('London', '+1'));















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
