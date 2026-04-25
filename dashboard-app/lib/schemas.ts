import { z } from "zod";

export const IngestBody = z.object({
  device_id: z.string().regex(/^core2-[0-9a-f]{6}$/),
  ppm: z.number().int().min(0).max(10000),
  ms_ago: z
    .number()
    .int()
    .min(0)
    .max(24 * 3600 * 1000),
  fw: z.string().max(32).optional(),
});

export type IngestBody = z.infer<typeof IngestBody>;

export const RANGES = ["1h", "6h", "24h", "7d", "30d"] as const;
export type Range = (typeof RANGES)[number];

export const RangeSchema = z.enum(RANGES);
