import { z } from "zod";

const IngestSample = z.object({
  ppm: z.number().int().min(0).max(10000),
  ms_ago: z
    .number()
    .int()
    .min(0)
    .max(24 * 3600 * 1000),
});

export const IngestBody = z.object({
  device_id: z.string().regex(/^core2-[0-9a-f]{6}$/),
  fw: z.string().max(32).optional(),
  samples: z.array(IngestSample).min(1).max(100),
});

export type IngestBody = z.infer<typeof IngestBody>;

export const RANGES = ["1h", "6h", "24h", "7d", "30d"] as const;
export type Range = (typeof RANGES)[number];

export const RangeSchema = z.enum(RANGES);
