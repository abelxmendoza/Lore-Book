import { useState } from 'react';
import { fetchJson } from '../../lib/api';

export const ComponentPreview = () => {
  const [componentName, setComponentName] = useState('');
  const [previewData, setPreviewData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handlePreview = async () => {
    if (!componentName.trim()) return;

    try {
      setLoading(true);
      const data = await fetchJson('/api/dev/preview-component', {
        method: 'POST',
        body: JSON.stringify({ componentName }),
      });
      setPreviewData(data);
    } catch (err: any) {
      setPreviewData({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-orange-500/30 bg-black/40 p-4">
      <h2 className="text-xl font-semibold mb-4">Component Preview</h2>
      
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={componentName}
          onChange={(e) => setComponentName(e.target.value)}
          placeholder="Component name (e.g., TimelineCard, CharacterCard)"
          className="flex-1 rounded-lg border border-orange-500/30 bg-black/60 px-4 py-2 text-white placeholder:text-white/50"
        />
        <button
          onClick={handlePreview}
          disabled={loading || !componentName.trim()}
          className="rounded-lg border border-orange-500/50 bg-orange-500/20 px-4 py-2 text-sm hover:bg-orange-500/30 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Preview'}
        </button>
      </div>

      {previewData && (
        <div className="rounded-lg border border-orange-500/20 bg-black/60 p-4">
          <pre className="text-xs text-white/80 overflow-x-auto">
            {JSON.stringify(previewData, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

