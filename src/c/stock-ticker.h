#pragma once
#include <pebble.h>

typedef struct {
    char symbol[6];
    char price[6];
    char price_change[8];
    char price_volume[8];
} Stock;

#define StockIndex 100
#define StockSymbol 101
#define StockPrice 102
#define StockPriceChange 103
#define StockVolume 104
#define StockPriceHistory 105
#define StockVolumeHistory 106
#define DisplayMode 200
#define StockMarketStatus 201
