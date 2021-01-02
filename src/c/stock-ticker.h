#pragma once
#include <pebble.h>

typedef struct {
    char symbol[12];
    char price[12];
    char price_change[12];
    char volume[8];
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
#define DitherStyle 202
#define AssetType 203
#define ClearFace 300
