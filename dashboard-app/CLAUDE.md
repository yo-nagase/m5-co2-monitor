# tamanegi-dash (dashboard-app)

@AGENTS.md

CO2 受信ダッシュボード。`m5-co2-monitor` がPOSTする `/api/ingest` を受けてPostgreSQL に書き込み、`recharts` でグラフ表示する。**API送信プロトコル / device_id 形式 / DBスキーマ概要 / アラートパイプライン**は親ディレクトリの [../CLAUDE.md](../CLAUDE.md) を参照。

## DB セットアップ

PostgreSQL 固定。接続先は `DATABASE_URL` で切り替える（Next.js は `.env.local` > `.env` の優先で読むので、ローカルオーバライドは `.env.local` に書く）。選択肢：

- **ローカル Docker**: [docker-compose.yml](docker-compose.yml) で `m5postgres` コンテナ（Postgres 17、ホスト側ポート **5411**）を立てる。`docker compose up -d` → `npx prisma migrate dev`。`DATABASE_URL="postgresql://tamanegi:tamanegi@localhost:5411/tamanegi"`。
- **Prisma Postgres (managed)**: [console.prisma.io](https://console.prisma.io) で DB を作り、発行される `postgres://...@db.prisma.io:5432/postgres?sslmode=verify-full` を `.env` に貼る。`npx prisma migrate deploy` でスキーマ適用。
- **Supabase**: pooler 経由の `DATABASE_URL`（port 6543, `?pgbouncer=true`）と直接接続の `DIRECT_URL`（port 5432）を両方設定する。runtime は前者、migration は後者を使う（[prisma.config.ts](prisma.config.ts) が `DIRECT_URL` を優先、未設定なら `DATABASE_URL` にフォールバック）。

Prisma 7 では `schema.prisma` の `datasource` ブロックに `url` を書かない（Prisma 7 で仕様変更）。接続URLはランタイムで [lib/db.ts](lib/db.ts) が `process.env.DATABASE_URL` を読んで `PrismaPg({ connectionString })` に渡し、マイグレーションは [prisma.config.ts](prisma.config.ts) が読む。

Prisma client は `prisma-client` generator で `app/generated/prisma/` に生成される（Prisma 7 で `@prisma/client` への直接 import は不可、生成パスから import する）。`postinstall` で `prisma generate` が走る。

## 把握しておくべき "新しめ" の前提

- **Next.js 16** — 最上部の `@AGENTS.md` の警告どおり、ルーティング/データフェッチ/設定APIが訓練データと違う可能性がある。書く前に `node_modules/next/dist/docs/` を読むこと。
- **React 19 + React Compiler 有効** ([next.config.ts](next.config.ts) の `reactCompiler: true`)。再レンダ最適化はコンパイラが自動でやるので、`useMemo` / `useCallback` / `React.memo` を反射的に足さない。本当に必要な計測根拠があるときだけ。
- **Tailwind v4** — 設定ファイル無し。CSSは [app/globals.css](app/globals.css) で `@import "tailwindcss"` し、テーマは `@theme inline { ... }` で宣言。`tailwind.config.js` を作らない。
- **Server Components がデフォルト**。`"use client"` を明示しているのは現状 `components/*.tsx`（インタラクティブ／Recharts用）。データ取得は Server Component またはルートハンドラ側に置く（[app/page.tsx](app/page.tsx) は SC で `listDevices()` を直接呼んでいる）。
- **Server Actions**: 端末名編集は [app/actions/devices.ts](app/actions/devices.ts) のサーバアクション経由。`PATCH /api/devices/[deviceId]` は同じ更新ロジックの REST 版で、両方を変えるときは整合性を取る。

## ルート / API の規約

- 全ルートに `runtime = "nodejs"` と `dynamic = "force-dynamic"` を設定している。Edge ランタイムでは `pg` ドライバが動かないため、新規ルートでも `runtime` は外さない。
- `/api/ingest` は `X-API-Key` 必須・成功時 `204 No Content`。読み取り系（`/api/readings`, `/api/devices`）は現状キー無しで公開。

## アグリゲーション (グラフ用バケット)

[lib/aggregate.ts](lib/aggregate.ts) の `RANGE_CONFIG` でレンジごとに `bucketMs` を決め打ちしている（1h=10s / 6h=60s / 24h=5min / 7d=30min / 30d=2h、いずれも目安300〜360点）。レンジを増減するときは:

1. [lib/schemas.ts](lib/schemas.ts) の `RANGES` に追加
2. [lib/aggregate.ts](lib/aggregate.ts) の `RANGE_CONFIG` に対応するバケット幅
3. [components/RangeSelector.tsx](components/RangeSelector.tsx) のUIボタン

の3箇所を揃える。SQLは `aggregateReadings` ([lib/db.ts](lib/db.ts)) に1本化されているので、追加SQLは不要。

## タイムスタンプ

- **`Reading.recordedAt`**: `TIMESTAMPTZ`。Prisma 上は JS `Date`。書き込み時 `new Date(recordedAtMs)`、集計 SQL では `EXTRACT(EPOCH FROM recorded_at) * 1000` で ms-epoch に戻して bucket する（[lib/db.ts](lib/db.ts) の `aggregateReadings`）。
- **`Device.lastSeenAt`, `AlertState.lastFiredAt`**: `BIGINT` ms-epoch のまま（比較が安く、UI の `last seen Xm ago` 計算にそのまま使える）。

JSON レスポンス・UI で扱うときはすべて number に統一しており、`BigInt` のまま `JSON.stringify` するとランタイムエラーになるので [lib/db.ts](lib/db.ts) の各関数で `Number()` 変換を済ませている。`Reading.recordedAt` だけ型が違うことを忘れて `BigInt(...)` に渡さないよう注意。
