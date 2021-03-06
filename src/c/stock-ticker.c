#include <pebble.h>
#include <stdio.h>
#include <math.h>
#include <pebble-battery-bar/pebble-battery-bar.h>
#include <pebble-bluetooth-icon/pebble-bluetooth-icon.h>
#include "./stock-ticker.h"
#include "./dither.h"


static Window *s_window;
static BluetoothLayer *s_bluetooth_layer;
static BatteryBarLayer *s_battery_layer;
static TextLayer *s_time_layer, *s_full_date_layer, *s_market_status_text_layer;
static Stock s_stock;
static GFont s_symbol_font, s_x_large_font, s_big_font, s_medium_font, s_small_font, s_tiny_font;
int display_mode = 0;
int dither_style = 0;
char market_status[128];
static uint8_t s_price_history[140];
static uint8_t s_volume_history[140];
static GTextAttributes *s_text_attributes;


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
  // graphics_context_set_fill_color(ctx, GColorWhite);
  // graphics_context_set_fill_color(ctx, GColorWhite);

  GRect box = layer_get_bounds(layer);
  //APP_LOG(APP_LOG_LEVEL_DEBUG, "stock data view height is %d", box.size.h);
  //APP_LOG(APP_LOG_LEVEL_DEBUG, "and width is is %d", box.size.w);

  graphics_context_set_stroke_width(ctx, 1);

  // graphics_fill_rect(ctx, box, 0, GCornersAll);
  if ((s_price_history[0] + s_price_history[1] + s_price_history[2] )!= 0) {

    //draw dithering

    if (dither_style == 0) {
      draw_gradient_rect(ctx, box, GColorBlack, GColorWhite, BOTTOM_TO_TOP);
    } else if (dither_style == 1) {
      draw_gradient_rect(ctx, box, GColorBlack, GColorWhite, TOP_TO_BOTTOM);
    }

    //mask dithering with black line draws
    if (dither_style != 2) {
      graphics_context_set_stroke_color(ctx, GColorBlack);
      for (int i = 0; i <= 139; i++){
        graphics_draw_line(ctx, GPoint(box.origin.x + i, box.origin.y), GPoint(box.origin.x + i, s_price_history[i]-10));
      }
    }

  }

  

  //draw volume and price history
  int offset = 1;

  if (dither_style == 1){
    graphics_context_set_stroke_color(ctx, GColorBlack);
    graphics_draw_line(ctx, GPoint(box.origin.x, box.size.h - offset), GPoint(box.size.w, box.size.h - offset));
    for (int i = 0; i < 139; i++){
      graphics_context_set_stroke_color(ctx, GColorBlack);
      graphics_draw_line(ctx, GPoint(box.origin.x + i, box.size.h - offset), GPoint(box.origin.x + i, box.size.h - offset - s_volume_history[i]));
      graphics_context_set_stroke_color(ctx, GColorWhite);
      graphics_draw_line(ctx, GPoint(box.origin.x + i, s_price_history[i]-10), GPoint(box.origin.x + i + 1, s_price_history[i + 1]-10));
    }
  } else {
    graphics_context_set_stroke_color(ctx, GColorWhite);
    graphics_draw_line(ctx, GPoint(box.origin.x, box.size.h - offset), GPoint(box.size.w, box.size.h - offset));
    for (int i = 0; i < 139; i++){
      graphics_draw_line(ctx, GPoint(box.origin.x + i, box.size.h - offset), GPoint(box.origin.x + i, box.size.h - offset - s_volume_history[i]));
      graphics_draw_line(ctx, GPoint(box.origin.x + i, s_price_history[i]-10), GPoint(box.origin.x + i + 1, s_price_history[i + 1]-10));
    }
    graphics_draw_line(ctx, GPoint(138, box.size.h - offset), GPoint(138, box.size.h - offset - s_volume_history[139]));
  }

  //black oval behind small price change text
  graphics_context_set_fill_color(ctx, GColorBlack);
  graphics_fill_rect(ctx, GRect((box.size.w/2)-30,box.origin.y+64, 60, 15), 4, GCornersAll);

  graphics_context_set_text_color(ctx, GColorBlack);
  //graphics_fill_rect(ctx, GRect((box.size.w/2)-30,box.origin.y+50, 60, 20), 4, GCornersAll);
  graphics_draw_text(ctx, s_stock.price, s_medium_font, GRect(box.origin.x+2, box.origin.y+36, box.size.w, box.size.h-34), GTextOverflowModeWordWrap, GTextAlignmentCenter, s_text_attributes);



  //draw symbol text
  graphics_context_set_text_color(ctx, GColorWhite);
  graphics_draw_text(ctx, s_stock.symbol, s_symbol_font, GRect(box.origin.x, box.origin.y+10, box.size.w, box.size.h-10), GTextOverflowModeWordWrap, GTextAlignmentCenter, s_text_attributes);
  

  //draw price and price change
  graphics_context_set_text_color(ctx, GColorWhite);
  graphics_draw_text(ctx, s_stock.price, s_medium_font, GRect(box.origin.x, box.origin.y+34, box.size.w, box.size.h-34), GTextOverflowModeWordWrap, GTextAlignmentCenter, s_text_attributes);
  graphics_draw_text(ctx, s_stock.price_change, s_small_font, GRect(box.origin.x, box.origin.y+62, box.size.w, box.size.h-62), GTextOverflowModeWordWrap, GTextAlignmentCenter, s_text_attributes);

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

static void clear_face() {
  layer_remove_from_parent(s_single_view_layer);
  layer_destroy(s_single_view_layer);
}

static void in_received_handler(DictionaryIterator *iter, void *context) {

  Tuple *market_status_tuple = dict_find(iter, StockMarketStatus);
  if (market_status_tuple) {
    strncpy(market_status, market_status_tuple->value->cstring, sizeof(market_status));
    text_layer_set_text(s_market_status_text_layer, market_status);
    //APP_LOG(APP_LOG_LEVEL_DEBUG, "got tuple %d", StockMarketStatus);
    persist_write_string(StockMarketStatus, market_status);
  }

  Tuple *clear_face_tuple = dict_find (iter, ClearFace);
  if (clear_face_tuple) {
    clear_face();
  }

  Tuple *display_mode_tuple = dict_find (iter, DisplayMode);
  if (display_mode_tuple) {
    display_mode = display_mode_tuple->value->int32;
  }

  Tuple *dither_style_tuple = dict_find (iter, DitherStyle);
  if (dither_style_tuple) {
    dither_style = dither_style_tuple->value->int32;
    persist_write_int(DitherStyle, dither_style);
  }

  Tuple *stock_symbol_tuple = dict_find (iter, StockSymbol);
  if (stock_symbol_tuple){
    strncpy(s_stock.symbol, stock_symbol_tuple->value->cstring, sizeof(s_stock.symbol));
    persist_write_string(StockSymbol, s_stock.symbol);
  }

  Tuple *stock_price_tuple = dict_find (iter, StockPrice);
  if (stock_price_tuple){
    strncpy(s_stock.price, stock_price_tuple->value->cstring, sizeof(s_stock.price));
    persist_write_string(StockPrice, s_stock.price);
  }

  Tuple *stock_price_change_tuple = dict_find (iter, StockPriceChange);
  if (stock_price_change_tuple){
    strncpy(s_stock.price_change, stock_price_change_tuple->value->cstring, sizeof(s_stock.price_change));
    persist_write_string(StockPriceChange, s_stock.price_change);
  }

  Tuple *stock_volume_tuple = dict_find (iter, StockVolume);
  if (stock_volume_tuple){
    strncpy(s_stock.volume, stock_volume_tuple->value->cstring, sizeof(s_stock.volume));
    persist_write_string(StockVolume, s_stock.volume);
  }

  Tuple *stock_price_history_tuple = dict_find (iter, StockPriceHistory);
  if (stock_price_history_tuple) {
      memcpy(s_price_history, stock_price_history_tuple->value->data, 140);
      persist_write_data(StockPriceHistory, s_price_history, 140);
  }

  Tuple *stock_volume_history_tuple = dict_find (iter, StockVolumeHistory);
  if (stock_volume_history_tuple) {
      memcpy(s_volume_history, stock_volume_history_tuple->value->data, 140);
      persist_write_data(StockVolumeHistory, s_volume_history, 140);
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

  s_text_attributes = graphics_text_attributes_create();

  //declare fonts
  //s_big_font = fonts_get_system_font(FONT_KEY_BITHAM_42_LIGHT);
  s_x_large_font = fonts_get_system_font(FONT_KEY_BITHAM_30_BLACK);
  s_big_font = fonts_get_system_font(FONT_KEY_LECO_28_LIGHT_NUMBERS);
  s_medium_font = fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD);
  s_small_font = fonts_get_system_font(FONT_KEY_GOTHIC_14);
  s_tiny_font = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_TYPE_WRITER_8));
  s_symbol_font = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_DOT_DIGITAL_26));

  //dots font source https://www.dafont.com/advanced-dot-digital-7.font


  //create battery bar
  s_battery_layer = battery_bar_layer_create();
  battery_bar_set_position(GPoint(0, 5));
  battery_bar_set_colors(GColorWhite, GColorDarkGray, GColorDarkGray, GColorWhite);
  battery_bar_set_percent_hidden(true);
  layer_add_child(window_layer, s_battery_layer);

  //create bluetooth indicator
  s_bluetooth_layer = bluetooth_layer_create();
  bluetooth_set_position(GPoint(6, 4));
  //bluetooth_set_position(GPoint(45, 4));
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
  text_layer_set_text(s_market_status_text_layer, market_status);

  //read persisted data
  if(persist_exists(StockMarketStatus)){
    persist_read_string(StockMarketStatus, market_status, sizeof(market_status));
  } 

  if(persist_exists(DitherStyle)) {
    dither_style = persist_read_int(DitherStyle);
  }

  if(persist_exists(StockPrice)){
    persist_read_string(StockPrice, s_stock.price, sizeof(s_stock.price));
  }

  if(persist_exists(StockPriceChange)){
    persist_read_string(StockPriceChange, s_stock.price_change, sizeof(s_stock.price_change));
  }

  if(persist_exists(StockSymbol)){
    persist_read_string(StockSymbol, s_stock.symbol, sizeof(s_stock.symbol));
  }

  if(persist_exists(StockVolumeHistory)){
    persist_read_data(StockVolumeHistory, s_volume_history, sizeof(s_volume_history));
  }
  
  if(persist_exists(StockPriceHistory)){
    persist_read_data(StockPriceHistory, s_price_history, sizeof(s_price_history));
  }

  //draw_stock_data();
  draw_stock_data_single_view();

}

static void prv_window_unload(Window *window) {
  battery_bar_layer_destroy(s_battery_layer);
  bluetooth_layer_destroy(s_bluetooth_layer);
  text_layer_destroy(s_time_layer);
  text_layer_destroy(s_full_date_layer);
  layer_destroy(s_single_view_layer);
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

  app_message_open(512, 512);

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
