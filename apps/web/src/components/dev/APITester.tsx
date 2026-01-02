import { useState } from 'react';
import { fetchJson } from '../../lib/api';

export const APITester = () => {
  const [method, setMethod] = useState('GET');
  const [endpoint, setEndpoint] = useState('/api/entries');
  const [body, setBody] = useState('{}');
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRequest = async () => {
    try {
      setLoading(true);
      setError(null);
      setResponse(null);

      let parsedBody = null;
      if (method !== 'GET' && body.trim()) {
        parsedBody = JSON.parse(body);
      }

      const result = await fetchJson(endpoint, {
        method,
        body: parsedBody ? JSON.stringify(parsedBody) : undefined,
      });

      setResponse(result);
    } catch (err: any) {
      setError(err.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-orange-500/30 bg-black/40 p-4">
      <h2 className="text-xl font-semibold mb-4">API Testing Playground</h2>
      
      <div className="space-y-4">
        <div className="flex gap-2">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="rounded-lg border border-orange-500/30 bg-black/60 px-3 py-2 text-white"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
          </select>
          <input
            type="text"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="/api/endpoint"
            className="flex-1 rounded-lg border border-orange-500/30 bg-black/60 px-4 py-2 text-white placeholder:text-white/50"
          />
          <button
            onClick={handleRequest}
            disabled={loading}
            className="rounded-lg border border-orange-500/50 bg-orange-500/20 px-6 py-2 hover:bg-orange-500/30 disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send'}
          </button>
        </div>

        {method !== 'GET' && (
          <div>
            <label className="block text-sm text-white/70 mb-2">Request Body (JSON)</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full rounded-lg border border-orange-500/30 bg-black/60 px-4 py-2 font-mono text-sm text-white"
              rows={6}
            />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/50 bg-red-500/20 p-4 text-red-200">
            Error: {error}
          </div>
        )}

        {response && (
          <div>
            <label className="block text-sm text-white/70 mb-2">Response</label>
            <pre className="rounded-lg border border-orange-500/20 bg-black/60 p-4 text-xs text-white/80 overflow-x-auto max-h-96">
              {JSON.stringify(response, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

