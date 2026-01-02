import { useState, useEffect, useCallback } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Select } from '../ui/select';
import { InsightsPanel, type InsightPayload } from '../InsightsPanel';
import { fetchJson } from '../../lib/api';

type TimePeriod = 'monthly' | 'yearly';

export const MonthlyYearlyInsights = () => {
  const [period, setPeriod] = useState<TimePeriod>('monthly');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [insights, setInsights] = useState<InsightPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate list of years (current year and 5 years back)
  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);
  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' }
  ];

  const loadInsights = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      let url: string;
      
      if (period === 'monthly') {
        url = `/api/insights/monthly/${selectedYear}/${selectedMonth}`;
      } else {
        url = `/api/insights/yearly/${selectedYear}`;
      }

      // Mock data for development
      const mockInsights: InsightPayload = {
        patterns: [
          {
            description: `Sample pattern for ${period === 'monthly' ? `${months[selectedMonth - 1].label} ${selectedYear}` : selectedYear}`,
            confidence: 0.85,
            evidence: ['Evidence 1', 'Evidence 2']
          }
        ],
        correlations: [],
        cycles: [],
        motifs: [],
        identity_shifts: [],
        predictions: []
      };

      const data = await fetchJson<{ insights: InsightPayload }>(url, undefined, {
        useMockData: true,
        mockData: { insights: mockInsights }
      });

      setInsights(data.insights);
    } catch (err: any) {
      console.error('Failed to load insights:', err);
      setError(err.message || 'Failed to load insights');
      setInsights(null);
    } finally {
      setLoading(false);
    }
  }, [period, selectedYear, selectedMonth]);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  const handlePrevious = () => {
    if (period === 'monthly') {
      if (selectedMonth === 1) {
        setSelectedMonth(12);
        setSelectedYear(selectedYear - 1);
      } else {
        setSelectedMonth(selectedMonth - 1);
      }
    } else {
      setSelectedYear(selectedYear - 1);
    }
  };

  const handleNext = () => {
    if (period === 'monthly') {
      if (selectedMonth === 12) {
        setSelectedMonth(1);
        setSelectedYear(selectedYear + 1);
      } else {
        setSelectedMonth(selectedMonth + 1);
      }
    } else {
      setSelectedYear(selectedYear + 1);
    }
  };

  const canGoNext = () => {
    if (period === 'monthly') {
      const now = new Date();
      return selectedYear < now.getFullYear() || 
             (selectedYear === now.getFullYear() && selectedMonth < now.getMonth() + 1);
    } else {
      return selectedYear < new Date().getFullYear();
    }
  };

  return (
    <Card className="bg-black/40 border-border/60">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <CardTitle className="text-white">Time-based Insights</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadInsights}
            disabled={loading}
            leftIcon={loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          >
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Period Selector */}
        <div className="flex items-center gap-4">
          <Select
            value={period}
            onChange={(e) => setPeriod(e.target.value as TimePeriod)}
            className="w-32 bg-black/60 border-border/50 text-white"
          >
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </Select>

          {/* Date Navigation */}
          <div className="flex items-center gap-2 flex-1">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevious}
              disabled={loading}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="flex items-center gap-2 flex-1 justify-center">
              {period === 'monthly' ? (
                <>
                  <Select
                    value={selectedMonth.toString()}
                    onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                    className="w-40 bg-black/60 border-border/50 text-white"
                  >
                    {months.map((month) => (
                      <option key={month.value} value={month.value.toString()}>
                        {month.label}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={selectedYear.toString()}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    className="w-24 bg-black/60 border-border/50 text-white"
                  >
                    {years.map((year) => (
                      <option key={year} value={year.toString()}>
                        {year}
                      </option>
                    ))}
                  </Select>
                </>
              ) : (
                <Select
                  value={selectedYear.toString()}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className="w-32 bg-black/60 border-border/50 text-white"
                >
                  {years.map((year) => (
                    <option key={year} value={year.toString()}>
                      {year}
                    </option>
                  ))}
                </Select>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleNext}
              disabled={loading || !canGoNext()}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Insights Display */}
        {insights && !loading && (
          <div className="mt-6">
            <InsightsPanel insights={insights} loading={loading} onRefresh={loadInsights} />
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-white/60 text-sm">
                Analyzing {period === 'monthly' ? `${months[selectedMonth - 1].label} ${selectedYear}` : selectedYear}...
              </p>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !insights && !error && (
          <div className="flex flex-col items-center justify-center py-12 text-white/60">
            <Calendar className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-sm">No insights available for this period.</p>
            <p className="text-xs mt-2 text-white/40">
              Try selecting a different month or year.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

