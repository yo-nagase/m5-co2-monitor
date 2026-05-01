import { NextResponse } from "next/server";
import { aggregateReadings } from "@/lib/db";
import { RangeSchema } from "@/lib/schemas";
import { RANGE_CONFIG } from "@/lib/aggregate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const device = url.searchParams.get("device");
  const rangeParam = url.searchParams.get("range") ?? "6h";

  if (!device) {
    return NextResponse.json({ error: "missing device" }, { status: 400 });
  }

  const parsedRange = RangeSchema.safeParse(rangeParam);
  if (!parsedRange.success) {
    return NextResponse.json({ error: "invalid range" }, { status: 400 });
  }

  const { rangeMs, bucketMs } = RANGE_CONFIG[parsedRange.data];

  const endAtParam = url.searchParams.get("endAt");
  const now = Date.now();
  let endAt = now;
  if (endAtParam !== null) {
    const parsed = Number(endAtParam);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return NextResponse.json({ error: "invalid endAt" }, { status: 400 });
    }
    endAt = Math.min(parsed, now);
  }

  // Optional extra past-time appended before `since` so the client can
  // pre-fetch a wider buffer and pan smoothly without re-fetching on
  // every release. Clamped so a single response can't exceed ~5x the range.
  const extendMsParam = url.searchParams.get("extendMs");
  let extendMs = 0;
  if (extendMsParam !== null) {
    const parsed = Number(extendMsParam);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return NextResponse.json({ error: "invalid extendMs" }, { status: 400 });
    }
    extendMs = Math.min(parsed, rangeMs * 4);
  }
  const since = endAt - rangeMs - extendMs;

  const points = await aggregateReadings(device, bucketMs, since, endAt);
  return NextResponse.json({
    device,
    range: parsedRange.data,
    bucketMs,
    points,
  });
}
