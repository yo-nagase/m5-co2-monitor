-- CreateTable
CREATE TABLE "readings" (
    "id" SERIAL NOT NULL,
    "device_id" TEXT NOT NULL,
    "ppm" INTEGER NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL,
    "fw" TEXT,

    CONSTRAINT "readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "device_id" TEXT NOT NULL,
    "display_name" TEXT,
    "last_seen_at" BIGINT,
    "last_ppm" INTEGER,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("device_id")
);

-- CreateTable
CREATE TABLE "alert_state" (
    "device_id" TEXT NOT NULL,
    "in_alert" INTEGER NOT NULL DEFAULT 0,
    "last_fired_at" BIGINT,

    CONSTRAINT "alert_state_pkey" PRIMARY KEY ("device_id")
);

-- CreateIndex
CREATE INDEX "idx_readings_device_time" ON "readings"("device_id", "recorded_at" DESC);
