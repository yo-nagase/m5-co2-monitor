"use client";

import { useEffect, useState } from "react";
import { Co2Chart } from "./Co2Chart";
import { DeviceNameEditor } from "./DeviceNameEditor";
import type { DeviceRow } from "@/lib/db";

function statusColor(ppm: number | null): string {
  if (ppm === null) return "text-zinc-400";
  if (ppm >= 1500) return "text-red-500";
  if (ppm >= 1000) return "text-yellow-500";
  return "text-emerald-500";
}

function formatRelative(ms: number | null): string {
  if (ms === null) return "no data";
  const diff = Date.now() - ms;
  if (diff < 10_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function DeviceCard({ device }: { device: DeviceRow }) {
  const [lastPpm, setLastPpm] = useState(device.lastPpm);
  const [lastSeenAt, setLastSeenAt] = useState(device.lastSeenAt);
  const [, setTick] = useState(0); // force re-render for relative time

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/devices`, { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        const d = (json.devices as DeviceRow[]).find(
          (x) => x.deviceId === device.deviceId
        );
        if (d && !cancelled) {
          setLastPpm(d.lastPpm);
          setLastSeenAt(d.lastSeenAt);
        }
      } catch {
        // ignore
      }
    }

    const dataInterval = setInterval(poll, 10_000);
    const tickInterval = setInterval(() => setTick((n) => n + 1), 5_000);

    return () => {
      cancelled = true;
      clearInterval(dataInterval);
      clearInterval(tickInterval);
    };
  }, [device.deviceId]);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <header className="flex items-baseline justify-between mb-4 gap-4">
        <div className="min-w-0">
          <DeviceNameEditor
            deviceId={device.deviceId}
            initial={device.displayName}
          />
          <p className="text-xs text-zinc-500 mt-0.5 font-mono">
            {device.deviceId} · last seen {formatRelative(lastSeenAt)}
          </p>
        </div>
        <div className={`text-3xl font-bold tabular-nums ${statusColor(lastPpm)}`}>
          {lastPpm ?? "—"}
          <span className="text-sm font-normal ml-1 text-zinc-500">ppm</span>
        </div>
      </header>
      <Co2Chart deviceId={device.deviceId} />
    </section>
  );
}
