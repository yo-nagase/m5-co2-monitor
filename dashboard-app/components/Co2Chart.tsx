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

// The fetched buffer covers BUFFER_FACTOR × rangeMs ending at the anchor.
// Visible window is rangeMs wide, so the user can scroll up to
// (BUFFER_FACTOR - 1) ranges into the past before we need to re-fetch.
const BUFFER_FACTOR = 3;

// Trigger a re-anchor (re-fetch with a new past anchor) once the visible
// window's left edge approaches within REANCHOR_MARGIN of the buffer's left
// edge. Half a range gives a visible cushion before another fetch is needed.
const REANCHOR_MARGIN_RATIO = 0.5;

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

// Binary search: first index where pts[i].t >= target. Returns pts.length
// when target is past the last point.
function lowerBound(pts: Point[], target: number): number {
  let lo = 0;
  let hi = pts.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (pts[mid].t < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function Co2Chart({ deviceId }: { deviceId: string }) {
  const [range, setRange] = useState<Range>("6h");
  const [data, setData] = useState<Point[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Buffer anchor: the right edge of the fetched buffer.
  // null = live (anchor follows now via 10s polling).
  const [anchorEndAt, setAnchorEndAt] = useState<number | null>(null);
  // Visible window's right edge. Decoupled from the anchor so scrolling within
  // the buffer doesn't refetch. null = live (window ends at the latest point).
  const [windowEndAt, setWindowEndAt] = useState<number | null>(null);

  const rangeMs = RANGE_CONFIG[range].rangeMs;

  // Reset the visible window and the buffer anchor whenever the user changes
  // device or range — the previous selection no longer makes sense.
  const navKey = `${deviceId}-${range}`;
  const [prevNavKey, setPrevNavKey] = useState(navKey);
  if (prevNavKey !== navKey) {
    setPrevNavKey(navKey);
    setAnchorEndAt(null);
    setWindowEndAt(null);
  }

  const points = data ?? [];
  const lastIdx = Math.max(points.length - 1, 0);
  const lastPointT = points.length > 0 ? points[lastIdx].t : null;
  const showNavigator = points.length > 1;

  // The visible window — this is what the top chart shows. In live mode
  // (windowEndAt === null) it tracks the most recent data point, which keeps
  // this pure (no `Date.now()` during render) and on a live chart the latest
  // point is essentially "now" anyway.
  const effectiveWindowEnd = windowEndAt ?? lastPointT;
  const visibleDomain: [number, number] | undefined =
    effectiveWindowEnd === null
      ? undefined
      : [effectiveWindowEnd - rangeMs, effectiveWindowEnd];

  // Brush indices that mirror the visible window in the buffer. The Brush is
  // controlled (driven by these props) so the navigator always reflects what
  // the top chart is showing — drag the brush body and the top scrolls;
  // scroll the top chart and the brush slides to match.
  let brushStart: number | undefined;
  let brushEnd: number | undefined;
  if (effectiveWindowEnd !== null && points.length > 1) {
    const startTime = effectiveWindowEnd - rangeMs;
    const sIdx = lowerBound(points, startTime);
    // Last index where points[i].t <= effectiveWindowEnd.
    const eIdx = Math.max(0, lowerBound(points, effectiveWindowEnd + 1) - 1);
    brushStart = Math.max(0, Math.min(sIdx, lastIdx));
    brushEnd = Math.max(brushStart, Math.min(eIdx, lastIdx));
  }

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const params = new URLSearchParams({ device: deviceId, range });
        if (anchorEndAt !== null) params.set("endAt", String(anchorEndAt));
        params.set("extendMs", String((BUFFER_FACTOR - 1) * rangeMs));
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
    // Auto-refresh only when in live mode (no past anchor pinned).
    if (!shouldAutoRefresh(range) || anchorEndAt !== null) {
      return () => {
        cancelled = true;
      };
    }

    const interval = setInterval(fetchData, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [deviceId, range, anchorEndAt, rangeMs]);

  function jumpToLive() {
    setAnchorEndAt(null);
    setWindowEndAt(null);
  }

  // Drag-to-pan. We update the chart's XAxis domain via state (RAF-throttled)
  // so panning slides only the data — gridlines, Y axis, and horizontal
  // reference lines stay put as the user expects. The previous CSS-transform
  // approach moved the entire chart, including the grid, which felt wrong.
  // Re-rendering Recharts at 60 fps was the original concern, but the data
  // prop is now stable (the buffer doesn't change during the drag), so only
  // the domain mapping recomputes per frame — that's cheap.
  const focusedRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number;
    baselineWindowEnd: number;
    width: number;
    rafId: number | null;
    pendingDx: number;
  } | null>(null);
  const windowEndRef = useRef(windowEndAt);
  useEffect(() => {
    windowEndRef.current = windowEndAt;
  }, [windowEndAt]);
  const anchorEndRef = useRef(anchorEndAt);
  useEffect(() => {
    anchorEndRef.current = anchorEndAt;
  }, [anchorEndAt]);
  const rangeMsRef = useRef(rangeMs);
  useEffect(() => {
    rangeMsRef.current = rangeMs;
  }, [rangeMs]);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const el = focusedRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    dragRef.current = {
      startX: e.clientX,
      baselineWindowEnd: windowEndRef.current ?? Date.now(),
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
      const d = dragRef.current;
      if (!d) return;
      d.rafId = null;
      // Drag right (positive dx) reveals older data → window end decreases.
      const deltaMs = -(d.pendingDx / d.width) * rangeMsRef.current;
      setWindowEndAt(d.baselineWindowEnd + deltaMs);
    });
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.rafId !== null && drag?.rafId !== undefined) {
      cancelAnimationFrame(drag.rafId);
    }
    if (focusedRef.current) focusedRef.current.style.cursor = "grab";
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    if (Math.abs(dx) <= 3) return; // treat as click, not pan
    const deltaMs = -(dx / drag.width) * rangeMs;
    const candidate = drag.baselineWindowEnd + deltaMs;
    commitWindowEnd(candidate);
    // windowEndAt is already at `candidate` from the last RAF in pointermove.
  }

  // Resolve a freshly chosen window-end into the right (anchor, window) pair.
  // Used by both drag-release and brush onChange so the two stay consistent.
  function commitWindowEnd(candidate: number) {
    const now = Date.now();
    if (candidate >= now) {
      // Back at or past "now" — drop the anchor so polling resumes.
      setAnchorEndAt(null);
      setWindowEndAt(null);
      return;
    }
    setWindowEndAt(candidate);
    // Re-anchor (refetch a wider buffer centered on the new position) only
    // when the visible window has run within REANCHOR_MARGIN of the buffer's
    // left edge. Buffer covers [anchor - BUFFER_FACTOR*rangeMs, anchor].
    const currentAnchor = anchorEndRef.current ?? now;
    const bufferStart = currentAnchor - BUFFER_FACTOR * rangeMs;
    const visibleStart = candidate - rangeMs;
    const margin = REANCHOR_MARGIN_RATIO * rangeMs;
    if (visibleStart < bufferStart + margin) setAnchorEndAt(candidate);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <span className="text-sm text-zinc-500">
          {data ? `${data.length} points` : "…"}
          {error ? ` (${error})` : ""}
          {windowEndAt !== null && (
            <span className="ml-2 rounded bg-amber-500/15 px-2 py-0.5 text-amber-500 font-mono text-xs">
              ~{new Date(windowEndAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {windowEndAt !== null && (
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
        <ResponsiveContainer width="100%" aspect={2.5}>
          <ComposedChart data={points} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="currentColor" strokeOpacity={0.08} />
            <XAxis
              dataKey="t"
              type="number"
              domain={visibleDomain ?? ["dataMin", "dataMax"]}
              allowDataOverflow
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
                // Re-keying when the buffer is re-fetched lets Recharts pick
                // up the new startIndex/endIndex props (Recharts otherwise
                // memoizes the brush handles past the first mount).
                key={`${deviceId}-${range}-${anchorEndAt ?? "live"}-${points.length}`}
                dataKey="t"
                height={28}
                travellerWidth={8}
                stroke="#10b981"
                fill="rgba(24,24,27,0.4)"
                alwaysShowText
                tickFormatter={(v) => formatTick(Number(v), range)}
                startIndex={brushStart}
                endIndex={brushEnd}
                onChange={(r) => {
                  if (
                    r.startIndex === undefined ||
                    r.endIndex === undefined ||
                    points.length === 0
                  ) {
                    return;
                  }
                  // The right-most index of the selection drives the visible
                  // window. We always show rangeMs of data ending there;
                  // resizing the brush therefore acts like a scroll, not a
                  // zoom — matching the user's mental model.
                  const idx = Math.max(0, Math.min(r.endIndex, lastIdx));
                  commitWindowEnd(points[idx].t);
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
