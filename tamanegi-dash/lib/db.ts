import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaInitialized?: boolean;
};

function makeClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaLibSql({ url });
  const client = new PrismaClient({ adapter });
  return client;
}

export const prisma = globalForPrisma.prisma ?? makeClient();

if (!globalForPrisma.prismaInitialized) {
  // Fire-and-forget PRAGMAs. Ignore errors to avoid blocking route init.
  void Promise.all([
    prisma.$executeRawUnsafe("PRAGMA journal_mode = WAL"),
    prisma.$executeRawUnsafe("PRAGMA synchronous = NORMAL"),
    prisma.$executeRawUnsafe("PRAGMA busy_timeout = 5000"),
  ]).catch((err) => console.error("[db] PRAGMA setup failed:", err));
  globalForPrisma.prismaInitialized = true;
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export type DeviceRow = {
  deviceId: string;
  displayName: string | null;
  lastSeenAt: number | null;
  lastPpm: number | null;
};

export type AggregatePoint = {
  t: number;
  ppm_avg: number;
  ppm_min: number;
  ppm_max: number;
};

export async function writeReading(
  deviceId: string,
  ppm: number,
  recordedAtMs: number,
  fw: string | null
): Promise<void> {
  const recordedAt = BigInt(recordedAtMs);
  await prisma.$transaction([
    prisma.reading.create({
      data: { deviceId, ppm, recordedAt, fw },
    }),
    prisma.device.upsert({
      where: { deviceId },
      create: { deviceId, lastSeenAt: recordedAt, lastPpm: ppm },
      update: { lastSeenAt: recordedAt, lastPpm: ppm },
    }),
  ]);
}

export async function listDevices(): Promise<DeviceRow[]> {
  const rows = await prisma.device.findMany({
    orderBy: { lastSeenAt: "desc" },
  });
  return rows.map((r) => ({
    deviceId: r.deviceId,
    displayName: r.displayName,
    lastSeenAt: r.lastSeenAt === null ? null : Number(r.lastSeenAt),
    lastPpm: r.lastPpm,
  }));
}

export async function aggregateReadings(
  deviceId: string,
  bucketMs: number,
  sinceMs: number
): Promise<AggregatePoint[]> {
  // Bind numeric params as BigInt so SQLite does integer math (not REAL).
  const bucket = BigInt(bucketMs);
  const since = BigInt(sinceMs);
  const rows = await prisma.$queryRaw<
    Array<{ t: bigint; ppm_avg: number; ppm_min: number; ppm_max: number }>
  >(Prisma.sql`
    SELECT (recorded_at - (recorded_at % ${bucket})) AS t,
           CAST(AVG(ppm) AS INTEGER) AS ppm_avg,
           MIN(ppm) AS ppm_min,
           MAX(ppm) AS ppm_max
    FROM readings
    WHERE device_id = ${deviceId} AND recorded_at >= ${since}
    GROUP BY t
    ORDER BY t ASC
    LIMIT 2000
  `);
  return rows.map((r) => ({
    t: Number(r.t),
    ppm_avg: Number(r.ppm_avg),
    ppm_min: Number(r.ppm_min),
    ppm_max: Number(r.ppm_max),
  }));
}

export async function getAlertState(
  deviceId: string
): Promise<{ inAlert: boolean; lastFiredAt: number } | null> {
  const row = await prisma.alertState.findUnique({ where: { deviceId } });
  if (!row) return null;
  return {
    inAlert: row.inAlert === 1,
    lastFiredAt: row.lastFiredAt === null ? 0 : Number(row.lastFiredAt),
  };
}

export async function upsertAlertState(
  deviceId: string,
  inAlert: boolean,
  lastFiredAtMs: number | null
): Promise<void> {
  const lastFiredAt = lastFiredAtMs === null ? null : BigInt(lastFiredAtMs);
  await prisma.alertState.upsert({
    where: { deviceId },
    create: {
      deviceId,
      inAlert: inAlert ? 1 : 0,
      lastFiredAt,
    },
    update: {
      inAlert: inAlert ? 1 : 0,
      ...(lastFiredAt !== null ? { lastFiredAt } : {}),
    },
  });
}
