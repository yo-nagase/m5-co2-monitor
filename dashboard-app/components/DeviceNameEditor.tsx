"use client";

import { useEffect, useRef, useState } from "react";
import { renameDevice } from "@/app/actions/devices";

type Props = {
  deviceId: string;
  initial: string | null;
};

export function DeviceNameEditor({ deviceId, initial }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(initial ?? "");
  }, [initial]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await renameDevice(deviceId, value.trim() || null);
      if (!result.ok) {
        throw new Error(result.error);
      }
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setValue(initial ?? "");
    setEditing(false);
    setError(null);
  }

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex items-center gap-2"
      >
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancel();
          }}
          maxLength={40}
          placeholder={deviceId}
          disabled={saving}
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-lg font-semibold tracking-tight outline-none focus:border-emerald-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950"
        />
        <button
          type="submit"
          disabled={saving}
          className="text-sm text-emerald-600 hover:text-emerald-500 disabled:opacity-60"
        >
          save
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={saving}
          className="text-sm text-zinc-500 hover:text-zinc-700 disabled:opacity-60"
        >
          cancel
        </button>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="click to rename"
      className="group inline-flex items-center gap-2 text-lg font-semibold tracking-tight hover:text-emerald-500 transition-colors"
    >
      <span className={initial ? "" : "italic text-zinc-500"}>
        {initial ?? "rename…"}
      </span>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-60"
        aria-hidden
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
      </svg>
    </button>
  );
}
