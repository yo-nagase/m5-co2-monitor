# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This directory is a two-project workspace ("tamanegi"): an ESP32 firmware that produces CO2 readings, and a Next.js dashboard that ingests and visualizes them.

```
Projects/
├── m5-co2-monitor/   ESP32 firmware (PlatformIO / Arduino) — sender
└── dashboard-app/    Next.js 16 dashboard (Prisma + PostgreSQL) — receiver
```

Each subproject has its own CLAUDE.md with project-specific conventions. Read them when working inside that subtree.

## The contract between the two projects

Both sides must agree on **(a)** the URL/key, **(b)** the wire shape, **(c)** the device_id format. Most cross-project bugs come from drift in one of these.

- **Endpoint**: firmware POSTs to `${API_BASE_URL}/api/ingest` ([m5-co2-monitor/src/api_client.cpp:79](m5-co2-monitor/src/api_client.cpp#L79)) handled by [dashboard-app/app/api/ingest/route.ts](dashboard-app/app/api/ingest/route.ts).
- **Auth**: shared secret in HTTP header `X-API-Key`. Firmware reads `API_KEY` from `m5-co2-monitor/include/secrets.h` (gitignored, see `secrets.h.example`). Dashboard reads `API_KEY` from `dashboard-app/.env`. They must be byte-equal — the dashboard uses `timingSafeEqual` ([dashboard-app/lib/auth.ts](dashboard-app/lib/auth.ts)).
- **Wire shape** (Zod-validated server-side, see [dashboard-app/lib/schemas.ts](dashboard-app/lib/schemas.ts)):
  ```json
  {"device_id": "core2-XXXXXX", "ppm": 0..10000, "ms_ago": 0..86400000, "fw": "..."}
  ```
  `ms_ago` is the age of the sample at send time (firmware buffers samples while offline; the server reconstructs `recordedAt = now - ms_ago`).
- **device_id**: derived on the firmware from the bottom 24 bits of the ESP32 efuse MAC, formatted `core2-%06llx`. The Zod regex `^core2-[0-9a-f]{6}$` enforces this — changing the firmware format will break ingest.

When changing fields here, update **both** sides in the same change.

## Common commands

### Firmware (run inside `m5-co2-monitor/`)
```bash
pio run                  # build only
pio run -t upload        # build + flash over USB
pio device monitor       # serial log @ 115200
```

### Dashboard (run inside `dashboard-app/`)
```bash
docker compose up -d     # start local Postgres (port 5432)
npm run dev              # next dev (default :3000)
npm run build            # next build
npm run lint             # eslint
npx prisma migrate dev   # apply schema changes to the configured DB
npx prisma studio        # browse the DB
```

The dev DB is a Postgres 17 container (`m5postgres`, host port 5411) defined in [dashboard-app/docker-compose.yml](dashboard-app/docker-compose.yml); data persists in the `pgdata` volume. Prod expects `DATABASE_URL` to point at a managed Postgres (see `.env.example`).

The dashboard is a single Next.js process — there is no separate worker. Alerts and DB writes happen inside the `/api/ingest` request handler.

## Dashboard architecture

- **DB**: PostgreSQL via `@prisma/adapter-pg` + `pg`. `DATABASE_URL` is read at runtime in [dashboard-app/lib/db.ts](dashboard-app/lib/db.ts) and passed to `PrismaPg({ connectionString })`. For dev, `docker compose up -d` starts a Postgres 17 container (`m5postgres`) on host port **5411** matching the default `postgresql://tamanegi:tamanegi@localhost:5411/tamanegi`.
- **Schema** ([dashboard-app/prisma/schema.prisma](dashboard-app/prisma/schema.prisma)): three tables — `readings` (time-series), `devices` (last-seen cache), `alert_state` (hysteresis). Timestamps are stored as `BigInt` ms-epoch.
- **Aggregation**: the chart query reads bucketed averages, not raw rows. Bucket width depends on the selected range and is centralized in [dashboard-app/lib/aggregate.ts](dashboard-app/lib/aggregate.ts) (`RANGE_CONFIG`); the server-side aggregation SQL is in `aggregateReadings` in `lib/db.ts`. Add new ranges in both places plus `RANGES` in `lib/schemas.ts`.
- **Alert pipeline**: `evaluateAlert` ([dashboard-app/lib/alerts.ts](dashboard-app/lib/alerts.ts)) is fired-and-forgotten from the ingest handler. It implements hysteresis (`ALERT_HIGH_PPM` to fire, `ALERT_CLEAR_PPM` to recover) and a per-device cooldown (`ALERT_COOLDOWN_MS`). Notifications go to a Discord webhook if `DISCORD_WEBHOOK_URL` is set; otherwise it silently no-ops.
- **API surface**: `POST /api/ingest` (device → server, key-protected), `GET /api/readings?device=&range=` (UI → server, public-read), `GET/PATCH /api/devices[/:id]` (display name editing). Server actions in `app/actions/devices.ts` mirror the PATCH for UI use.
- **Next.js 16**: per [dashboard-app/AGENTS.md](dashboard-app/AGENTS.md), this version has breaking changes from the Next.js most LLMs were trained on. Before writing routing/layout/data-fetching code, consult `node_modules/next/dist/docs/` rather than relying on memory.

## Firmware architecture

- **Page model**: `currentPage` + `switch` in `loop()` selects which page draws; per-page `*_Update()` runs every loop (so background work like CO2 polling and API send keep going regardless of the visible page) but `*_Draw()` only runs for the active page. See [m5-co2-monitor/src/main.cpp](m5-co2-monitor/src/main.cpp).
- **Globals**: shared state (`co2Value`, `co2History`, `currentPage`, etc.) is `extern`-declared in `src/globals.h` and defined once in `src/main.cpp`. Add new shared state by declaring in both files.
- **Send pipeline** ([m5-co2-monitor/src/api_client.cpp](m5-co2-monitor/src/api_client.cpp)): samples are pushed onto a 900-slot ring buffer (`apiClientPushSample`). `apiClientUpdate()` drains one sample per call when Wi-Fi is up, with exponential-ish backoff after `FAILURE_THRESHOLD` consecutive failures. The buffer drops oldest on overflow, so prolonged offline runs lose the front of the queue rather than blocking new samples.
- **Wi-Fi**: SmartConfig flow lives in `page_wifi.cpp`. Credentials persist in NVS so reboots auto-reconnect.
- **Secrets**: `include/secrets.h` (gitignored) supplies `API_BASE_URL` and `API_KEY` as preprocessor macros. `secrets.h.example` is the template.
