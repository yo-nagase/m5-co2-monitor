"use client";

import type { DeviceRow } from "@/lib/db";

type Props = {
  devices: DeviceRow[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
};

export function DeviceSelector({ devices, selected, onChange }: Props) {
  const allSelected = selected.size === devices.length;

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange(next);
  }

  function toggleAll() {
    if (allSelected) {
      onChange(new Set());
    } else {
      onChange(new Set(devices.map((d) => d.deviceId)));
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={toggleAll}
        className={`rounded-full px-3 py-1 text-sm border transition-colors ${
          allSelected
            ? "bg-zinc-100 border-zinc-300 dark:bg-zinc-800 dark:border-zinc-600"
            : "border-zinc-200 dark:border-zinc-700 text-zinc-500"
        }`}
      >
        All
      </button>
      {devices.map((d) => {
        const active = selected.has(d.deviceId);
        return (
          <button
            key={d.deviceId}
            onClick={() => toggle(d.deviceId)}
            className={`rounded-full px-3 py-1 text-sm border transition-colors ${
              active
                ? "bg-emerald-600 border-emerald-600 text-white"
                : "border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-zinc-400"
            }`}
          >
            {d.displayName ?? d.deviceId}
          </button>
        );
      })}
    </div>
  );
}
