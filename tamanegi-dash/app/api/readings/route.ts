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
  const since = Date.now() - rangeMs;

  const points = await aggregateReadings(device, bucketMs, since);
  return NextResponse.json({
    device,
    range: parsedRange.data,
    bucketMs,
    points,
  });
}
