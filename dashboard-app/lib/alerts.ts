import { getAlertState, upsertAlertState } from "./db";
import { sendDiscord } from "./discord";

function num(env: string | undefined, fallback: number): number {
  const n = Number(env);
  return Number.isFinite(n) ? n : fallback;
}

export async function evaluateAlert(
  deviceId: string,
  ppm: number,
  now: number
): Promise<void> {
  const high = num(process.env.ALERT_HIGH_PPM, 1200);
  const clear = num(process.env.ALERT_CLEAR_PPM, 900);
  const cooldown = num(process.env.ALERT_COOLDOWN_MS, 600_000);

  const st = await getAlertState(deviceId);
  const inAlert = st?.inAlert ?? false;
  const lastFired = st?.lastFiredAt ?? 0;

  if (!inAlert && ppm >= high && now - lastFired > cooldown) {
    await upsertAlertState(deviceId, true, now);
    await sendDiscord(`⚠️ High CO2: **${ppm} ppm** on \`${deviceId}\``);
    return;
  }

  if (inAlert && ppm <= clear) {
    await upsertAlertState(deviceId, false, null);
    await sendDiscord(`✅ CO2 recovered: **${ppm} ppm** on \`${deviceId}\``);
  }
}
