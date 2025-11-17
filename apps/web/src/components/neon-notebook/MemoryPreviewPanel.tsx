import type { FC } from 'react';

export type MemoryPreview = {
  id: string;
  title: string;
  date: string;
  summary?: string;
};

export const MemoryPreviewPanel: FC<{ previews: MemoryPreview[] }> = ({ previews }) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-white/60">
        <span>Memory Preview</span>
        <span className="text-white/40">HQI powered</span>
      </div>
      <div className="space-y-2">
        {previews.map((preview) => (
          <div key={preview.id} className="rounded-lg border border-white/10 bg-white/5 p-3 shadow-sm">
            <div className="flex items-center justify-between text-xs text-white/70">
              <span className="font-semibold text-white">{preview.title}</span>
              <span className="text-white/40">{new Date(preview.date).toLocaleDateString()}</span>
            </div>
            {preview.summary && <p className="mt-1 text-sm text-white/60">{preview.summary}</p>}
          </div>
        ))}
        {previews.length === 0 && <p className="text-sm text-white/40">Context suggestions appear here.</p>}
      </div>
    </div>
  );
};
