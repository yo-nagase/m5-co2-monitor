import { NextResponse } from "next/server";
import { listDevices } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const devices = await listDevices();
  return NextResponse.json({ devices });
}
