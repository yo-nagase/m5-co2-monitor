#pragma once
#include <stdint.h>

enum ApiStatus {
  API_STATUS_IDLE,
  API_STATUS_OK,
  API_STATUS_FAIL,
  API_STATUS_OFFLINE,
};

void apiClientInit();
void apiClientPushSample(int ppm, uint32_t sampleMs);
void apiClientUpdate();
const char* apiClientDeviceId();
int  apiClientQueueSize();
ApiStatus apiClientStatus();
