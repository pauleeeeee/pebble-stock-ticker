//require clay package for settings and instantiate it
var Clay = require('pebble-clay');
var clayConfig = require('./config.json');
var clay = new Clay(clayConfig, null, { autoHandleEvents: false });
var moment = require('moment-timezone');

//include MessageQueue system
// var MessageQueue = require('message-queue-pebble');

//declare global settings variable
//var settings = {};
var settings = {
    APIKey: "",
    NumberOfStocks: 1,
    StockSymbol1: "TSLA",
    PriceHistoryHorizon: "daily"
};


var lastCall = 0;

//on load function
Pebble.addEventListener("ready",
    function(e) {

        //on load, get settings from local storage if they have already been set by clay. If they have not been set, define settings as a blank object.
        settings = JSON.parse(localStorage.getItem('clay-settings')) || {};
        console.log(JSON.stringify(settings));

        //lastCall = localStorage.getItem('lastCall') || 0;

        // //if settings is a blank object, send a configuration notification to the user
        // if (settings == {}){
        //     Pebble.showSimpleNotificationOnPebble("Heads up!", "Add stocks in the watchface configuration page inside the Pebble phone app.");
        // } else {
        //     queryLoop();
        // }

        //queryAPI(0, 'TSLA', 0);
        
        //when the watchface loads, check market status; if the status is the same as last check, do nothing; if the status is new, send appmessage
        //console.log(getMarketStatus());
        var marketStatus = getMarketStatus();
        if (localStorage.getItem('lastMarketStatus') != marketStatus) {
            Pebble.sendAppMessage({
                StockMarketStatus: marketStatus
            }, function(){
                localStorage.setItem('lastMarketStatus', marketStatus)
            });
        }
        

    }
);


//for clay to show the config page...
Pebble.addEventListener('showConfiguration', function(e) {
    Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener("webviewclosed", function(e){
    console.log('from web view closed:')
    settings = JSON.parse(localStorage.getItem('clay-settings'));
    console.log(JSON.stringify(settings))
})

// // UNFINISHED
// function queryLoop(){
//     // if the last call was more than the specified interval, do a new call
//     // do not make a new call if today is a bank holiday
//     if( ((new Date().getTime() - lastCall) > settings["QueryInterval"]) && isBankHoliday == "" && marketPresumedOpen() ){
//         requestStockData();
//         lastcall = new Date().getTime();
//         localStorage.setItem('lastCall', lastcall);
//     }
// }


function queryAPI(i, symbol, n){

    //get the data
    var req = new XMLHttpRequest();

    if ( n > 1 ) {
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

                    var stockData = {
                        "StockIndex": i,
                        "StockSymbol": symbol,
                        "StockPrice": price,
                        "StockPriceChange": changePercent,
                        "StockVolume": volume
                    }

                    
    
                    console.log(JSON.stringify(stockData));

                    Pebble.sendAppMessage(stockData);
    
                    //don't forget to appmessage it!
                }
            }
        }
        req.send();
    } else {
        req.open('GET', 'https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&interval=1min&symbol=' + symbol + '&apikey=' + settings.APIKey, true);
        req.onload = function(e) {
            if (req.readyState == 4) {
              // 200 - HTTP OK
                if(req.status == 200) {
                    var response = JSON.parse(req.responseText);
                    console.log(JSON.stringify(response));
                }
            }
        }
        req.send();
    }

}

function requestMultiStockData(){
    for (i = 1; i < 6; i++){
        if (settings["StockSymbol"+i] && settings["StockSymbol"+i] != "") {
            queryAPI(i-1, settings["StockSymbol"+i]);
        }
    }
}


function getMarketStatus(){
    var nycTime = moment().tz("America/New_York");
    if(check_holiday(new Date())){
        return "market is closed (holiday)";
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

//source for these two functions: https://mresoftware.com/holiday_script.htm
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
