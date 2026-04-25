"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";

const Input = z.object({
  deviceId: z.string().min(1),
  displayName: z.string().trim().max(40).nullable(),
});

export async function renameDevice(
  deviceId: string,
  displayName: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = Input.safeParse({ deviceId, displayName });
  if (!parsed.success) {
    return { ok: false, error: "invalid input" };
  }

  const name =
    parsed.data.displayName && parsed.data.displayName.length > 0
      ? parsed.data.displayName
      : null;

  try {
    await prisma.device.update({
      where: { deviceId: parsed.data.deviceId },
      data: { displayName: name },
    });
  } catch {
    return { ok: false, error: "device not found" };
  }

  revalidatePath("/");
  return { ok: true };
}
