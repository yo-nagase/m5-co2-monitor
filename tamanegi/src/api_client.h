#pragma once
#include <stdint.h>

void apiClientInit();
void apiClientPushSample(int ppm, uint32_t sampleMs);
void apiClientUpdate();
const char* apiClientDeviceId();
int  apiClientQueueSize();
