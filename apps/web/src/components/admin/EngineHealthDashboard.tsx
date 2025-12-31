/**
 * Engine Health Dashboard
 * Internal-only tooling for monitoring engine performance
 */

import { useState, useEffect } from 'react';
import { fetchJson } from '../../lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Activity, CheckCircle, XCircle, AlertTriangle, Clock, TrendingUp } from 'lucide-react';

interface EngineHealth {
  engineName: string;
  lastRunTime: Date | null;
  lastRunDuration: number | null;
  successRate: number;
  errorCount: number;
  outputVolume: number;
  confidenceDistribution: {
    high: number;
    medium: number;
    low: number;
  };
  isHealthy: boolean;
}

interface EngineHealthData {
  engines: EngineHealth[];
  summary: {
    total: number;
    healthy: number;
    unhealthy: number;
    stale: number;
  };
  unhealthy: EngineHealth[];
  stale: EngineHealth[];
  redundancy: Array<{ engines: string[]; overlap: string }>;
}

export const EngineHealthDashboard = () => {
  const [data, setData] = useState<EngineHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadHealthData();
  }, []);

  const loadHealthData = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchJson<EngineHealthData>('/api/internal/engine/health');
      setData(result);
    } catch (err: any) {
      setError(err.message || 'Failed to load engine health data');
      console.error('Engine health load error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="text-white/60">Loading engine health data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-500/50 bg-red-500/10">
        <CardContent className="pt-6">
          <div className="text-red-200">{error}</div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  const formatDuration = (ms: number | null) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatDate = (date: Date | null) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-green-900/20 to-green-800/20 border-green-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-white/80">Total Engines</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{data.summary.total}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-900/20 to-green-800/20 border-green-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-white/80">Healthy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-400">{data.summary.healthy}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-900/20 to-red-800/20 border-red-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-white/80">Unhealthy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-400">{data.summary.unhealthy}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-900/20 to-yellow-800/20 border-yellow-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-white/80">Stale</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-400">{data.summary.stale}</div>
          </CardContent>
        </Card>
      </div>

      {/* Unhealthy Engines */}
      {data.unhealthy.length > 0 && (
        <Card className="border-red-500/50 bg-red-500/10">
          <CardHeader>
            <CardTitle className="text-red-200 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Unhealthy Engines
            </CardTitle>
            <CardDescription className="text-red-200/70">
              Engines with low success rates or frequent errors
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.unhealthy.map((engine) => (
                <div key={engine.engineName} className="p-3 bg-red-500/20 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-white">{engine.engineName}</div>
                    <div className="text-sm text-red-200">
                      {Math.round(engine.successRate * 100)}% success rate
                    </div>
                  </div>
                  {engine.errorCount > 0 && (
                    <div className="text-xs text-red-300 mt-1">
                      {engine.errorCount} errors in last 20 runs
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Engines Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            All Engines
          </CardTitle>
          <CardDescription>Health status and performance metrics for all engines</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-4 text-sm font-medium text-white/80">Engine</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-white/80">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-white/80">Last Run</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-white/80">Duration</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-white/80">Success Rate</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-white/80">Outputs</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-white/80">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {data.engines.map((engine) => (
                  <tr key={engine.engineName} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-3 px-4 text-white font-medium">{engine.engineName}</td>
                    <td className="py-3 px-4">
                      {engine.isHealthy ? (
                        <span className="flex items-center gap-1 text-green-400">
                          <CheckCircle className="h-4 w-4" />
                          Healthy
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-400">
                          <XCircle className="h-4 w-4" />
                          Unhealthy
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-white/70 text-sm">
                      {formatDate(engine.lastRunTime)}
                    </td>
                    <td className="py-3 px-4 text-white/70 text-sm">
                      {formatDuration(engine.lastRunDuration)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-white/10 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              engine.successRate > 0.8 ? 'bg-green-400' :
                              engine.successRate > 0.5 ? 'bg-yellow-400' : 'bg-red-400'
                            }`}
                            style={{ width: `${engine.successRate * 100}%` }}
                          />
                        </div>
                        <span className="text-white/70 text-sm">
                          {Math.round(engine.successRate * 100)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-white/70 text-sm">
                      {engine.outputVolume.toFixed(1)} avg
                    </td>
                    <td className="py-3 px-4 text-white/70 text-sm">
                      <div className="flex items-center gap-1">
                        <span className="text-green-400">{engine.confidenceDistribution.high}H</span>
                        <span className="text-yellow-400">{engine.confidenceDistribution.medium}M</span>
                        <span className="text-red-400">{engine.confidenceDistribution.low}L</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Redundancy Report */}
      {data.redundancy.length > 0 && (
        <Card className="border-yellow-500/50 bg-yellow-500/10">
          <CardHeader>
            <CardTitle className="text-yellow-200 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Redundancy Report
            </CardTitle>
            <CardDescription className="text-yellow-200/70">
              Engines that may have overlapping functionality
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.redundancy.map((item, idx) => (
                <div key={idx} className="p-3 bg-yellow-500/20 rounded-lg">
                  <div className="font-medium text-white mb-1">
                    {item.engines.join(' ↔ ')}
                  </div>
                  <div className="text-sm text-yellow-200/80">{item.overlap}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Refresh Button */}
      <div className="flex justify-end">
        <button
          onClick={loadHealthData}
          className="px-4 py-2 bg-primary/20 hover:bg-primary/30 border border-primary/50 rounded-lg text-white transition-colors"
        >
          Refresh Data
        </button>
      </div>
    </div>
  );
};
