import React from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

import type { Insight } from './InsightCard';

export const CorrelationGraph = ({ correlations }: { correlations?: Insight[] }) => {
  const data = (correlations ?? []).map((item, index) => ({
    x: (item.confidence || 0) * 100,
    y: (item.variables?.length ?? 1) * 10 + index,
    name: item.variables?.join(' × ') ?? 'correlation'
  }));

  if (!data.length) {
    return <p className="text-sm text-white/50">No correlations detected yet.</p>;
  }

  return (
    <div className="rounded-xl border border-border/60 bg-black/40 p-4">
      <p className="mb-2 text-sm font-semibold text-white">Correlation graph</p>
      <ResponsiveContainer width="100%" height={240}>
        <ScatterChart>
          <XAxis type="number" dataKey="x" name="Confidence" unit="%" stroke="rgba(255,255,255,0.4)" tick={{ fill: 'rgba(255,255,255,0.6)' }} domain={[0, 100]} />
          <YAxis type="number" dataKey="y" name="Strength" stroke="rgba(255,255,255,0.4)" tick={{ fill: 'rgba(255,255,255,0.6)' }} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', color: 'white' }} />
          <Scatter data={data} fill="#10b981" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
};
