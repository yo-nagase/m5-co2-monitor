#pragma once
#include <M5Unified.h>
#include <MHZ19.h>
#include <FastLED.h>

#define LED_PIN    25
#define LED_COUNT  10

extern CRGB leds[];
extern M5Canvas canvas;
extern int screenW;
extern int screenH;
extern MHZ19 mhz19;
extern int co2Value;
extern unsigned long lastCO2Read;
extern const unsigned long CO2_INTERVAL;
extern int currentPage;

// CO2グラフ用
extern const int GRAPH_MAX_POINTS;
extern int co2History[];
extern int historyCount;
