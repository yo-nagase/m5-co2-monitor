import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { checkApiKey } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z.object({
  display_name: z.string().trim().max(40).nullable(),
});

type RouteContext = {
  params: Promise<{ deviceId: string }>;
};

export async function PATCH(req: Request, ctx: RouteContext) {
  if (!checkApiKey(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { deviceId } = await ctx.params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = PatchBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const name = parsed.data.display_name;
  const displayName = name && name.length > 0 ? name : null;

  try {
    const device = await prisma.device.update({
      where: { deviceId },
      data: { displayName },
    });
    return NextResponse.json({
      device: {
        deviceId: device.deviceId,
        displayName: device.displayName,
      },
    });
  } catch {
    return NextResponse.json({ error: "device not found" }, { status: 404 });
  }
}
