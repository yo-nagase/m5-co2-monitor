"use client";

import { useEffect, useRef, useState } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Brush,
} from "recharts";
import { RangeSelector } from "./RangeSelector";
import type { Range } from "@/lib/schemas";
import { RANGE_CONFIG } from "@/lib/aggregate";

type Point = {
  t: number;
  ppm_avg: number;
  ppm_min: number;
  ppm_max: number;
};

type ApiResponse = {
  device: string;
  range: Range;
  bucketMs: number;
  points: Point[];
};

type BrushRange = { startIndex: number; endIndex: number };

function formatTick(ms: number, range: Range): string {
  const d = new Date(ms);
  if (range === "1h" || range === "6h") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (range === "24h") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function shouldAutoRefresh(range: Range): boolean {
  return range === "1h" || range === "6h";
}

export function Co2Chart({ deviceId }: { deviceId: string }) {
  const [range, setRange] = useState<Range>("6h");
  const [data, setData] = useState<Point[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [brushRange, setBrushRange] = useState<BrushRange | null>(null);
  // null = "live" (window ends at now); a number anchors the window's right edge.
  const [endAt, setEndAt] = useState<number | null>(null);
  const sessionKey = `${deviceId}-${range}-${endAt ?? "live"}`;
  const [prevSessionKey, setPrevSessionKey] = useState(sessionKey);
  if (prevSessionKey !== sessionKey) {
    setPrevSessionKey(sessionKey);
    setBrushRange(null);
  }
  // Reset endAt when the device or range changes (separate from the brush reset).
  const navKey = `${deviceId}-${range}`;
  const [prevNavKey, setPrevNavKey] = useState(navKey);
  if (prevNavKey !== navKey) {
    setPrevNavKey(navKey);
    setEndAt(null);
  }

  const points = data ?? [];
  const lastIdx = Math.max(points.length - 1, 0);
  const startIdx = brushRange ? Math.min(brushRange.startIndex, lastIdx) : 0;
  const endIdx = brushRange ? Math.min(brushRange.endIndex, lastIdx) : lastIdx;
  const focused = points.slice(startIdx, endIdx + 1);
  const showNavigator = points.length > 1;
  // Recharts resets the brush whenever the chart's `data` prop changes
  // (chartDataSlice.setChartData clamps dataEndIndex to length-1). Pause
  // polling while zoomed so the user's selection isn't clobbered.
  const isZoomedIn =
    brushRange !== null &&
    points.length > 1 &&
    (brushRange.startIndex > 0 || brushRange.endIndex < lastIdx);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const params = new URLSearchParams({ device: deviceId, range });
        if (endAt !== null) params.set("endAt", String(endAt));
        const res = await fetch(`/api/readings?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          setError(`HTTP ${res.status}`);
          return;
        }
        const json: ApiResponse = await res.json();
        if (!cancelled) {
          setData(json.points);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    }

    fetchData();
    // Auto-refresh only in live mode and when not zoomed in.
    if (!shouldAutoRefresh(range) || isZoomedIn || endAt !== null) {
      return () => {
        cancelled = true;
      };
    }

    const interval = setInterval(fetchData, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [deviceId, range, isZoomedIn, endAt]);

  function jumpToLive() {
    setEndAt(null);
  }

  // Drag-to-pan on the focused chart. The transform is driven by direct DOM
  // writes (not React state) during the drag — re-rendering Recharts on every
  // pointermove causes the chart to freeze. State only updates on release.
  const focusedRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number;
    baselineEndAt: number;
    width: number;
    rafId: number | null;
    pendingDx: number;
  } | null>(null);
  const endAtRef = useRef(endAt);
  useEffect(() => {
    endAtRef.current = endAt;
  }, [endAt]);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const el = focusedRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    dragRef.current = {
      startX: e.clientX,
      baselineEndAt: endAtRef.current ?? Date.now(),
      width: rect.width,
      rafId: null,
      pendingDx: 0,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (focusedRef.current) focusedRef.current.style.cursor = "grabbing";
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    drag.pendingDx = e.clientX - drag.startX;
    if (drag.rafId !== null) return;
    drag.rafId = requestAnimationFrame(() => {
      if (!dragRef.current) return;
      dragRef.current.rafId = null;
      if (transformRef.current) {
        transformRef.current.style.transform = `translateX(${dragRef.current.pendingDx}px)`;
      }
    });
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.rafId !== null && drag?.rafId !== undefined) {
      cancelAnimationFrame(drag.rafId);
    }
    if (transformRef.current) {
      transformRef.current.style.transform = "";
    }
    if (focusedRef.current) focusedRef.current.style.cursor = "grab";
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    if (Math.abs(dx) <= 3) return; // treat as click, not pan
    const rangeMs = RANGE_CONFIG[range].rangeMs;
    // Drag right (positive dx) reveals older data → endAt decreases.
    const deltaMs = -(dx / drag.width) * rangeMs;
    const next = drag.baselineEndAt + deltaMs;
    const now = Date.now();
    setEndAt(next >= now ? null : next);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <span className="text-sm text-zinc-500">
          {data ? `${data.length} points` : "…"}
          {error ? ` (${error})` : ""}
          {endAt !== null && (
            <span className="ml-2 rounded bg-amber-500/15 px-2 py-0.5 text-amber-500 font-mono text-xs">
              ~{new Date(endAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {endAt !== null && (
            <button
              type="button"
              onClick={jumpToLive}
              className="rounded-md bg-emerald-500/15 px-3 py-1 text-sm text-emerald-500 hover:bg-emerald-500/25"
            >
              Now
            </button>
          )}
          <RangeSelector value={range} onChange={setRange} />
        </div>
      </div>
      <div
        ref={focusedRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="w-full select-none overflow-hidden"
        style={{ cursor: "grab", touchAction: "pan-y" }}
      >
        <div ref={transformRef} style={{ willChange: "transform" }}>
        <ResponsiveContainer width="100%" aspect={2.5}>
          <ComposedChart data={focused} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="currentColor" strokeOpacity={0.08} />
            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v: number) => formatTick(v, range)}
              stroke="currentColor"
              strokeOpacity={0.4}
              fontSize={11}
            />
            <YAxis
              domain={[400, 2000]}
              allowDataOverflow
              stroke="currentColor"
              strokeOpacity={0.4}
              fontSize={11}
              width={40}
            />
            <Tooltip
              labelFormatter={(v) =>
                new Date(Number(v)).toLocaleString([], {
                  dateStyle: "short",
                  timeStyle: "medium",
                })
              }
              formatter={(value, name) => [`${value} ppm`, String(name)]}
              contentStyle={{
                background: "rgba(24,24,27,0.92)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 6,
                color: "#fafafa",
              }}
            />
            <ReferenceLine y={1000} stroke="#eab308" strokeDasharray="3 3" />
            <ReferenceLine y={1500} stroke="#ef4444" strokeDasharray="3 3" />
            <Area
              type="monotone"
              dataKey="ppm_max"
              stroke="none"
              fill="#10b981"
              fillOpacity={0.08}
              isAnimationActive={false}
              name="max"
            />
            <Area
              type="monotone"
              dataKey="ppm_min"
              stroke="none"
              fill="#10b981"
              fillOpacity={0}
              isAnimationActive={false}
              name="min"
            />
            <Line
              type="monotone"
              dataKey="ppm_avg"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ r: 2, fill: "#10b981", stroke: "none" }}
              activeDot={{ r: 4, fill: "#10b981", stroke: "#fafafa", strokeWidth: 1 }}
              isAnimationActive={false}
              name="avg"
            />
          </ComposedChart>
        </ResponsiveContainer>
        </div>
      </div>
      {showNavigator && (
        <div className="w-full mt-1">
          <ResponsiveContainer width="100%" aspect={10}>
            <ComposedChart
              data={points}
              margin={{ top: 4, right: 20, bottom: 0, left: 40 }}
            >
              <YAxis hide domain={[400, 2000]} />
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} hide />
              <Line
                type="monotone"
                dataKey="ppm_avg"
                stroke="#10b981"
                strokeOpacity={0.6}
                strokeWidth={1}
                dot={false}
                isAnimationActive={false}
              />
              <Brush
                key={`${deviceId}-${range}`}
                dataKey="t"
                height={28}
                travellerWidth={8}
                stroke="#10b981"
                fill="rgba(24,24,27,0.4)"
                alwaysShowText
                tickFormatter={(v) => formatTick(Number(v), range)}
                onChange={(r) => {
                  setBrushRange({ startIndex: r.startIndex, endIndex: r.endIndex });
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
