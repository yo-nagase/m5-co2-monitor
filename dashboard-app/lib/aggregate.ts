import type { Range } from "./schemas";

type RangeConfig = { rangeMs: number; bucketMs: number };

const HOUR = 3600_000;
const DAY = 24 * HOUR;

export const RANGE_CONFIG: Record<Range, RangeConfig> = {
  "1h":  { rangeMs: 1 * HOUR,  bucketMs: 10_000 },       // ~360 pts
  "6h":  { rangeMs: 6 * HOUR,  bucketMs: 60_000 },       // ~360 pts
  "24h": { rangeMs: 1 * DAY,   bucketMs: 5 * 60_000 },   // ~288 pts
  "7d":  { rangeMs: 7 * DAY,   bucketMs: 30 * 60_000 },  // ~336 pts
  "30d": { rangeMs: 30 * DAY,  bucketMs: 2 * 3600_000 }, // ~360 pts
};
