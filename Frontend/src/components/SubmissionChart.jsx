import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/**
 * Distribution of accepted submissions for one question, with the student's own
 * result highlighted — the chart shown after a submission.
 *
 * Interactive: hovering a bar highlights it and shows the range it covers, how
 * many submissions fall in it, and whether it is the student's own bucket.
 *
 * Data is aggregated and anonymous: bucket counts only.
 */
export default function SubmissionChart({ summary, unit, format, accent = '#28c244' }) {
  const [hovered, setHovered] = useState(null);
  // Memoised so the derived useMemos below get a stable dependency.
  const buckets = useMemo(() => summary?.buckets || [], [summary]);

  // Bucket width, so the tooltip can show the range each bar covers.
  const step = useMemo(() => {
    if (buckets.length < 2) return 0;
    return buckets[1].value - buckets[0].value;
  }, [buckets]);

  // Which bucket the student's own result falls into.
  const myBucket = useMemo(() => {
    if (!summary || summary.mine === null || summary.mine === undefined || buckets.length === 0) return -1;
    let chosen = 0;
    buckets.forEach((bucket, index) => {
      if (summary.mine >= bucket.value) chosen = index;
    });
    return chosen;
  }, [summary, buckets]);

  const data = useMemo(
    () => buckets.map((bucket, index) => ({ ...bucket, index, isMine: index === myBucket })),
    [buckets, myBucket]
  );

  // Headroom above the tallest bar so the "You" label has room. Computed here
  // rather than with a domain function, which recharts renders as an empty
  // range (bars come out with no shape at all).
  const yMax = useMemo(() => {
    const tallest = Math.max(0, ...buckets.map((bucket) => bucket.percent || 0));
    return tallest > 0 ? tallest * 1.3 : 1;
  }, [buckets]);

  if (!summary || buckets.length === 0) {
    return (
      <div className="h-[180px] flex flex-col items-center justify-center gap-1 text-center">
        <div className="text-[13px] text-white/50">Not enough data yet</div>
        <div className="text-[12px] text-white/30">
          This chart appears once other accepted submissions exist to compare against.
        </div>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const point = payload[0].payload;
    const from = format(point.value);
    const to = format(point.value + step);
    return (
      <div className="rounded-lg border border-white/10 bg-[#3c3c3c] px-3 py-2 shadow-xl">
        <div className="text-[12px] text-white/60 mb-0.5">
          {step > 0 ? `${from} – ${to}` : from} {unit}
        </div>
        <div className="text-[13px] text-white/90">
          {point.count} submission{point.count === 1 ? '' : 's'}
          <span className="text-white/50"> · {point.percent}%</span>
        </div>
        {point.isMine && (
          <div className="text-[12px] mt-1" style={{ color: accent }}>Your solution is here</div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div style={{ width: '100%', height: 180 }}>
        <ResponsiveContainer>
          <BarChart
            data={data}
            margin={{ top: 20, right: 8, bottom: 4, left: 8 }}
            barCategoryGap={3}
            onMouseMove={(state) => setHovered(state?.isTooltipActive ? state.activeTooltipIndex : null)}
            onMouseLeave={() => setHovered(null)}
          >
            <defs>
              <linearGradient id="lc-bar-mine" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity={1} />
                <stop offset="100%" stopColor={accent} stopOpacity={0.45} />
              </linearGradient>
              <linearGradient id="lc-bar-rest" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,0.30)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0.10)" />
              </linearGradient>
              <linearGradient id="lc-bar-hover" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0.22)" />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="value"
              tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
              tickFormatter={(value) => format(value)}
              axisLine={{ stroke: 'rgba(255,255,255,0.12)' }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis hide domain={[0, yMax]} />

            <Tooltip content={<CustomTooltip />} cursor={false} />

            {myBucket >= 0 && (
              <ReferenceLine
                x={buckets[myBucket].value}
                stroke={accent}
                strokeDasharray="3 3"
                strokeOpacity={0.8}
                label={{
                  value: 'You',
                  position: 'top',
                  fill: accent,
                  fontSize: 11,
                  offset: 8,
                }}
              />
            )}

            {/* recharts 3.7 renders nothing while its entry animation is active. */}
            <Bar dataKey="percent" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {data.map((point, index) => (
                <Cell
                  key={index}
                  fill={
                    point.isMine
                      ? 'url(#lc-bar-mine)'
                      : hovered === index
                        ? 'url(#lc-bar-hover)'
                        : 'url(#lc-bar-rest)'
                  }
                  style={{ transition: 'fill 120ms ease' }}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-between text-[12px] text-white/40 mt-1 px-1">
        <span>{unit}</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm" style={{ background: accent }} />
          Your solution
          <span className="text-white/25 mx-1">·</span>
          {summary.sampleSize} accepted
        </span>
      </div>
    </div>
  );
}
