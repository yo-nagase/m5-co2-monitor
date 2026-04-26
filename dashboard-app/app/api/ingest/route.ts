import { NextResponse } from "next/server";
import { checkApiKey } from "@/lib/auth";
import { writeReadings } from "@/lib/db";
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

  const { device_id, fw, samples } = parsed.data;
  const now = Date.now();
  const expanded = samples.map((s) => ({
    ppm: s.ppm,
    recordedAtMs: now - s.ms_ago,
  }));

  try {
    await writeReadings(device_id, expanded, fw ?? null);
    const tail = expanded.length > 1 ? ` (+${expanded.length - 1} more)` : "";
    const latest = expanded.reduce((acc, s) =>
      s.recordedAtMs > acc.recordedAtMs ? s : acc
    );
    console.log(
      `[ingest] ${device_id} n=${expanded.length} latest_ppm=${latest.ppm} latest_recorded=${new Date(latest.recordedAtMs).toISOString()}${tail}`
    );
  } catch (err) {
    console.error("[ingest] db write failed:", err);
    return NextResponse.json({ error: "db write failed" }, { status: 500 });
  }

  // Alert evaluation only on the freshest sample of the batch.
  const latestPpm = expanded.reduce((acc, s) =>
    s.recordedAtMs > acc.recordedAtMs ? s : acc
  ).ppm;
  evaluateAlert(device_id, latestPpm, now).catch((err) =>
    console.error("[ingest] alert eval failed:", err)
  );

  return new Response(null, { status: 204 });
}
