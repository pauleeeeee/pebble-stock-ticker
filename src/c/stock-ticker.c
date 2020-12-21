#include <pebble.h>
#include <stdio.h>
#include <math.h>
#include <pebble-battery-bar/pebble-battery-bar.h>
#include <pebble-bluetooth-icon/pebble-bluetooth-icon.h>
#include "./stock-ticker.h"

static Window *s_window;
static BluetoothLayer *s_bluetooth_layer;
static BatteryBarLayer *s_battery_layer;
static TextLayer *s_time_layer, *s_full_date_layer, *s_market_status_text_layer;
static Stock s_stocks[5];
static GFont s_x_large_font, s_big_font, s_medium_font, s_small_font, s_tiny_font;
int stock_index = 0;
int display_mode = 0; //0 is single; 1 is multi
char market_status[128];
static uint8_t s_price_history[144];
static uint8_t s_volume_history[144];


static void update_time() {
  // Get a tm structure
  time_t temp = time(NULL);
  struct tm *tick_time = localtime(&temp);

  // Write the current hours and minutes into a buffer
  static char s_buffer[8];
  strftime(s_buffer, sizeof(s_buffer), "%l:%M", tick_time);

  // Display this time on the TextLayer
  text_layer_set_text(s_time_layer, s_buffer);
  //text_layer_set_text(s_time_layer, "12:00");

}


static void update_date() {
  // Get a tm structure
  time_t temp = time(NULL);
  struct tm *tick_time = localtime(&temp);
  
  static char full_date_text[] = "Xxx -----";
  
  strftime(full_date_text, sizeof(full_date_text), "%a %m/%d", tick_time);
  text_layer_set_text(s_full_date_layer, full_date_text);

}

static void tick_handler(struct tm *tick_time, TimeUnits units_changed) {
  update_time();
}

static Layer *s_single_view_layer;

static void s_single_view_layer_update_proc(Layer *layer, GContext *ctx){
  graphics_context_set_fill_color(ctx, GColorWhite);
  GRect box = layer_get_bounds(layer);
  graphics_fill_rect(ctx, box, 0, GCornersAll);

  graphics_context_set_text_color(ctx, GColorBlack);
  graphics_draw_text(ctx, s_stocks[0].symbol, s_x_large_font, box, GTextOverflowModeWordWrap, GTextAlignmentCenter, graphics_text_attributes_create());

}

static void draw_stock_data_single_view(){
  //get bounds of the pebble
  Layer *window_layer = window_get_root_layer(s_window);
  GRect window_bounds = layer_get_bounds(window_layer);

  //adjusted to give 2px of padding
  GRect bounds = GRect(2, 48, (window_bounds.size.w - 4), window_bounds.size.h-47-2);
  //APP_LOG(APP_LOG_LEVEL_DEBUG, "stock data view height is %d", bounds.size.h);
  //currently 118

  s_single_view_layer = layer_create(bounds);
  layer_set_update_proc(s_single_view_layer, s_single_view_layer_update_proc);
  layer_add_child(window_layer, s_single_view_layer);
}


static void in_received_handler(DictionaryIterator *iter, void *context) {

  Tuple *market_status_tuple = dict_find(iter, StockMarketStatus);
  if (market_status_tuple) {
    strncpy(market_status, market_status_tuple->value->cstring, sizeof(market_status));
    text_layer_set_text(s_market_status_text_layer, market_status);
    //APP_LOG(APP_LOG_LEVEL_DEBUG, "got tuple %d", StockMarketStatus);
    persist_write_string(StockMarketStatus, market_status);
  }

  Tuple *display_mode_tuple = dict_find (iter, DisplayMode);
  if (display_mode_tuple) {
    display_mode = display_mode_tuple->value->int32;
    APP_LOG(APP_LOG_LEVEL_DEBUG, "got tuple %d", DisplayMode);
    APP_LOG(APP_LOG_LEVEL_DEBUG, "value is %d", display_mode);
  }


  Tuple *stock_index_tuple = dict_find (iter, StockIndex);
  if (stock_index_tuple) {
    stock_index = stock_index_tuple->value->int32;
    APP_LOG(APP_LOG_LEVEL_DEBUG, "got tuple %d", StockIndex);
    APP_LOG(APP_LOG_LEVEL_DEBUG, "value is %d", stock_index);
  }

  Tuple *stock_symbol_tuple = dict_find (iter, StockSymbol);
  if (stock_symbol_tuple){
    strncpy(s_stocks[stock_index].symbol, stock_symbol_tuple->value->cstring, sizeof(s_stocks[stock_index].symbol));
    //persist_write_string(StockSymbol, s_stocks[stock_index].symbol);
  }

  Tuple *stock_price_tuple = dict_find (iter, StockPrice);
  if (stock_price_tuple){
    strncpy(s_stocks[stock_index].price, stock_price_tuple->value->cstring, sizeof(s_stocks[stock_index].price));
  }

  Tuple *stock_price_change_tuple = dict_find (iter, StockPriceChange);
  if (stock_price_change_tuple){
    strncpy(s_stocks[stock_index].price_change, stock_price_change_tuple->value->cstring, sizeof(s_stocks[stock_index].price_change));
  }

  Tuple *stock_volume_tuple = dict_find (iter, StockVolume);
  if (stock_volume_tuple){
    strncpy(s_stocks[stock_index].volume, stock_volume_tuple->value->cstring, sizeof(s_stocks[stock_index].volume));
  }

  Tuple *stock_price_history_tuple = dict_find (iter, StockPriceHistory);
  if (stock_price_history_tuple) {
      memcpy(s_price_history, stock_price_history_tuple->value->data, 144);
      persist_write_data(StockPriceHistory, s_price_history, 144);
  }

  Tuple *stock_volume_history_tuple = dict_find (iter, StockVolumeHistory);
  if (stock_volume_history_tuple) {
      memcpy(s_volume_history, stock_volume_history_tuple->value->data, 144);
      persist_write_data(StockVolumeHistory, s_volume_history, 144);
  }


  // if (counter > 4) {
  //   counter = 0;
  // } else if (counter == 4) {
  //   //draw_stock_data();
  // }


  draw_stock_data_single_view();

}

static void in_dropped_handler(AppMessageResult reason, void *context){
  //handle failed message
}


static void prv_window_load(Window *window) {
  Layer *window_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(window_layer);

  window_set_background_color(window, GColorBlack);

  //declare fonts
  //s_big_font = fonts_get_system_font(FONT_KEY_BITHAM_42_LIGHT);
  s_x_large_font = fonts_get_system_font(FONT_KEY_BITHAM_30_BLACK);
  s_big_font = fonts_get_system_font(FONT_KEY_LECO_28_LIGHT_NUMBERS);
  s_medium_font = fonts_get_system_font(FONT_KEY_GOTHIC_18);
  s_small_font = fonts_get_system_font(FONT_KEY_GOTHIC_14);
  s_tiny_font = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_TYPE_WRITER_8));

  //create battery bar
  s_battery_layer = battery_bar_layer_create();
  battery_bar_set_position(GPoint(0, 5));
  battery_bar_set_colors(GColorWhite, GColorDarkGray, GColorDarkGray, GColorWhite);
  battery_bar_set_percent_hidden(true);
  layer_add_child(window_layer, s_battery_layer);

  //create bluetooth indicator
  s_bluetooth_layer = bluetooth_layer_create();
  bluetooth_set_position(GPoint(6, 4));
  bluetooth_vibe_disconnect(false);
  bluetooth_vibe_connect(false);
  //void bluetooth_set_colors(GColor connected_circle, GColor connected_icon, GColor disconnected_circle, GColor disconnected_icon);
  bluetooth_set_colors(GColorBlack, GColorWhite, GColorDarkGray, GColorClear);
  layer_add_child(window_layer, s_bluetooth_layer);

  // create time text layer
  //s_time_layer = text_layer_create(GRect(-2, -8, bounds.size.w-2, bounds.size.h));
  s_time_layer = text_layer_create(GRect(-4, 1, bounds.size.w-2, bounds.size.h));
  text_layer_set_background_color(s_time_layer, GColorClear);
  text_layer_set_text(s_time_layer, "00:00");
  text_layer_set_text_color(s_time_layer, GColorWhite);
  text_layer_set_font(s_time_layer, s_big_font);
  text_layer_set_text_alignment(s_time_layer, GTextAlignmentRight);
  layer_add_child(window_layer, text_layer_get_layer(s_time_layer));

  //create date layer
  s_full_date_layer = text_layer_create(GRect(5, 15, bounds.size.w-4, 24));
  text_layer_set_background_color(s_full_date_layer, GColorClear);
  // text_layer_set_text(s_full_date_layer, "--");
  text_layer_set_text_color(s_full_date_layer, GColorWhite);
  text_layer_set_font(s_full_date_layer, s_small_font);
  text_layer_set_text_alignment(s_full_date_layer, GTextAlignmentLeft);
  layer_add_child(window_layer, text_layer_get_layer(s_full_date_layer));

  //create market status layer
  s_market_status_text_layer = text_layer_create(GRect(5, 30, bounds.size.w-4, 24));
  text_layer_set_background_color(s_market_status_text_layer, GColorClear);
  // text_layer_set_text(s_full_date_layer, "--");
  text_layer_set_text_color(s_market_status_text_layer, GColorWhite);
  text_layer_set_font(s_market_status_text_layer, s_small_font);
  text_layer_set_text_alignment(s_market_status_text_layer, GTextAlignmentLeft);
  layer_add_child(window_layer, text_layer_get_layer(s_market_status_text_layer));
  text_layer_set_text(s_market_status_text_layer, "unknown");
  if(persist_exists(StockMarketStatus)){
    persist_read_string(StockMarketStatus, market_status, sizeof(market_status));
  } 

  //draw_stock_data();
  draw_stock_data_single_view();

}

static void prv_window_unload(Window *window) {
  battery_bar_layer_destroy(s_battery_layer);
  bluetooth_layer_destroy(s_bluetooth_layer);
  text_layer_destroy(s_time_layer);
  text_layer_destroy(s_full_date_layer);
}

static void prv_init(void) {
  s_window = window_create();
  window_set_window_handlers(s_window, (WindowHandlers) {
    .load = prv_window_load,
    .unload = prv_window_unload,
  });

  //instantiate appmessages
  app_message_register_inbox_received(in_received_handler);
  app_message_register_inbox_dropped(in_dropped_handler);

  app_message_open(1024, 128);

  const bool animated = true;
  window_stack_push(s_window, animated);

  // Register with TickTimerService
  tick_timer_service_subscribe(MINUTE_UNIT, tick_handler);
  update_time();
  update_date();
  
}

static void prv_deinit(void) {
  window_destroy(s_window);
}

int main(void) {
  prv_init();
  app_event_loop();
  prv_deinit();
}
