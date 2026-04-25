"use client";

import { useState } from "react";
import type { DeviceRow } from "@/lib/db";
import { DeviceCard } from "@/components/DeviceCard";
import { DeviceSelector } from "@/components/DeviceSelector";

export function Dashboard({ devices }: { devices: DeviceRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(devices.map((d) => d.deviceId))
  );

  const visible = devices.filter((d) => selected.has(d.deviceId));

  return (
    <>
      <div className="mb-6">
        <DeviceSelector
          devices={devices}
          selected={selected}
          onChange={setSelected}
        />
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-10 text-center text-zinc-500 dark:border-zinc-700">
          デバイスを選択してください
        </div>
      ) : (
        <div className="grid gap-6">
          {visible.map((d) => (
            <DeviceCard key={d.deviceId} device={d} />
          ))}
        </div>
      )}
    </>
  );
}
