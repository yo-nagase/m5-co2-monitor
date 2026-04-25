"use client";

import { RANGES, type Range } from "@/lib/schemas";

type Props = {
  value: Range;
  onChange: (r: Range) => void;
};

export function RangeSelector({ value, onChange }: Props) {
  return (
    <div className="inline-flex rounded-md bg-zinc-100 p-1 text-sm dark:bg-zinc-800">
      {RANGES.map((r) => {
        const active = r === value;
        return (
          <button
            key={r}
            type="button"
            onClick={() => onChange(r)}
            className={[
              "px-3 py-1 rounded transition-colors",
              active
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-50"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
            ].join(" ")}
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}
