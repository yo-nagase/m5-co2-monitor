import { NextResponse } from "next/server";
import { checkApiKey } from "@/lib/auth";
import { writeReading } from "@/lib/db";
import { evaluateAlert } from "@/lib/alerts";
import { IngestBody } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!checkApiKey(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = IngestBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { device_id, ppm, ms_ago, fw } = parsed.data;
  const now = Date.now();
  const recordedAt = now - ms_ago;

  try {
    await writeReading(device_id, ppm, recordedAt, fw ?? null);
  } catch (err) {
    console.error("[ingest] db write failed:", err);
    return NextResponse.json({ error: "db write failed" }, { status: 500 });
  }

  evaluateAlert(device_id, ppm, now).catch((err) =>
    console.error("[ingest] alert eval failed:", err)
  );

  return new Response(null, { status: 204 });
}
