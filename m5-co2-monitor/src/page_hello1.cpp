#include "page_hello1.h"

void pageHello1Draw() {
  canvas.setFont(&fonts::FreeSansBold24pt7b);
  canvas.setTextSize(1);
  canvas.setTextColor(TFT_WHITE);
  const char* msg = "Hello World 1";
  int textW = canvas.textWidth(msg);
  int textH = canvas.fontHeight();
  canvas.setCursor((screenW - textW) / 2, (screenH - textH) / 2);
  canvas.print(msg);
  canvas.setFont(&fonts::Font0);
}
