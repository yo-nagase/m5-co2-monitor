"use client";

import { useEffect, useState } from "react";
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
  const sessionKey = `${deviceId}-${range}`;
  const [prevSessionKey, setPrevSessionKey] = useState(sessionKey);
  if (prevSessionKey !== sessionKey) {
    setPrevSessionKey(sessionKey);
    setBrushRange(null);
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
        const res = await fetch(
          `/api/readings?device=${encodeURIComponent(deviceId)}&range=${range}`,
          { cache: "no-store" }
        );
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
    if (!shouldAutoRefresh(range) || isZoomedIn) {
      return () => {
        cancelled = true;
      };
    }

    const interval = setInterval(fetchData, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [deviceId, range, isZoomedIn]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-zinc-500">
          {data ? `${data.length} points` : "…"}
          {error ? ` (${error})` : ""}
        </span>
        <RangeSelector value={range} onChange={setRange} />
      </div>
      <div className="w-full">
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
