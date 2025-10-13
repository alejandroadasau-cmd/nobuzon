import * as React from "react";

interface DonutItem {
  label: string;
  value: number;
  color: string;
}

export default function DonutChart({ items, size = 160, stroke = 18 }: { items: DonutItem[]; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const total = items.reduce((s, it) => s + Math.max(0, it.value), 0);

  // Build segments with offsets
  let offset = 0;
  const segments = items.map((it) => {
    const value = Math.max(0, it.value);
    const percent = total === 0 ? 0 : value / total;
    const dash = percent * circumference;
    const seg = {
      ...it,
      dash,
      offset,
      percent,
    };
    offset += dash;
    return seg;
  });

  return (
    <div className="flex items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`translate(${size / 2}, ${size / 2})`}>
          {segments.map((s, i) => (
            <circle
              key={s.label}
              r={radius}
              fill="transparent"
              stroke={s.color}
              strokeWidth={stroke}
              strokeLinecap="butt"
              strokeDasharray={`${s.dash} ${circumference - s.dash}`}
              strokeDashoffset={-s.offset}
              transform={`rotate(-90)`}
            />
          ))}
          <circle r={radius} fill="transparent" stroke="rgba(0,0,0,0.04)" strokeWidth={1} />
          <text x="0" y="0" textAnchor="middle" dominantBaseline="central" className="text-sm font-semibold" fill="currentColor">
            {total}
          </text>
        </g>
      </svg>

      <div className="flex flex-col gap-2">
        {items.map((it) => {
          const pct = total === 0 ? 0 : Math.round((it.value / total) * 100);
          return (
            <div key={it.label} className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-3 h-3 rounded-sm" style={{ background: it.color }} />
              <div className="flex-1 text-sm">
                <div className="flex justify-between">
                  <div className="truncate">{it.label}</div>
                  <div className="text-xs text-muted-foreground">{it.value} ({pct}%)</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
