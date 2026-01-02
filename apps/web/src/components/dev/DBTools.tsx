import { useState } from 'react';
import { fetchJson } from '../../lib/api';

export const DBTools = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAction = async (action: 'seed' | 'clear') => {
    if (!confirm(`Are you sure you want to ${action === 'seed' ? 'seed' : 'clear'} the database?`)) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const endpoint = action === 'seed' ? '/api/dev/seed-db' : '/api/dev/clear-db';
      const data = await fetchJson(endpoint, { method: 'POST' });
      
      setResult(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setError(err.message || `Failed to ${action} database`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-orange-500/30 bg-black/40 p-4">
      <h2 className="text-xl font-semibold mb-4">Database Tools</h2>
      
      <div className="space-y-4">
        <div className="flex gap-4">
          <button
            onClick={() => handleAction('seed')}
            disabled={loading}
            className="rounded-lg border border-green-500/50 bg-green-500/20 px-6 py-2 hover:bg-green-500/30 disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Seed Database'}
          </button>
          <button
            onClick={() => handleAction('clear')}
            disabled={loading}
            className="rounded-lg border border-red-500/50 bg-red-500/20 px-6 py-2 hover:bg-red-500/30 disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Clear Test Data'}
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/50 bg-red-500/20 p-4 text-red-200">
            Error: {error}
          </div>
        )}

        {result && (
          <div>
            <label className="block text-sm text-white/70 mb-2">Result</label>
            <pre className="rounded-lg border border-orange-500/20 bg-black/60 p-4 text-xs text-white/80 overflow-x-auto">
              {result}
            </pre>
          </div>
        )}

        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-yellow-200 text-sm">
          ⚠️ Warning: These actions are destructive and should only be used in development environments.
        </div>
      </div>
    </div>
  );
};

