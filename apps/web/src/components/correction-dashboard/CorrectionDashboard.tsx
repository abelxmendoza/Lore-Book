// =====================================================
// CORRECTION & PRUNING DASHBOARD
// Purpose: Make corrections, contradictions, and deprecated
// knowledge visible, auditable, and user-controllable
// =====================================================

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { AlertCircle, History, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { CorrectionHistoryPanel } from './CorrectionHistoryPanel';
import { DeprecatedUnitsPanel } from './DeprecatedUnitsPanel';
import { ContradictionReviewPanel } from './ContradictionReviewPanel';
import { fetchJson } from '../../lib/api';

interface CorrectionRecord {
  id: string;
  target_type: 'CLAIM' | 'UNIT' | 'EVENT' | 'ENTITY';
  target_id: string;
  correction_type: string;
  before_snapshot: Record<string, any>;
  after_snapshot: Record<string, any>;
  reason: string | null;
  initiated_by: 'SYSTEM' | 'USER';
  reversible: boolean;
  created_at: string;
}

interface DeprecatedUnit {
  unit_id: string;
  unit_type: string;
  content: string;
  deprecated_reason: string;
  deprecated_at: string;
  linked_events: string[];
  source_message_ids: string[];
  confidence: number;
}

interface ContradictionReview {
  id: string;
  unit_a_id: string;
  unit_b_id: string;
  contradiction_type: 'TEMPORAL' | 'FACTUAL' | 'PERSPECTIVE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'OPEN' | 'DISMISSED' | 'RESOLVED';
  detected_at: string;
}

interface DashboardData {
  corrections: CorrectionRecord[];
  deprecated_units: DeprecatedUnit[];
  open_contradictions: ContradictionReview[];
}

export const CorrectionDashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('history');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJson<{ success: boolean; data: DashboardData }>(
        '/api/correction-dashboard/dashboard'
      );
      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error || 'Failed to load dashboard data');
      }
    } catch (err: any) {
      console.error('Failed to load correction dashboard:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Card className="border-border/60 bg-black/40">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-500/50 bg-red-500/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="w-5 h-5" />
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const totalCorrections = data.corrections.length;
  const totalDeprecated = data.deprecated_units.length;
  const totalContradictions = data.open_contradictions.length;

  return (
    <div className="p-6 space-y-6">
      <Card className="border-border/60 bg-black/40">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Correction & Pruning Dashboard</CardTitle>
          <CardDescription>
            View and manage corrections, deprecated knowledge, and contradictions. Everything is
            transparent, reversible, and traceable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 border border-border/40 rounded-lg bg-black/20">
              <div className="flex items-center gap-2 mb-2">
                <History className="w-5 h-5 text-blue-400" />
                <span className="text-sm font-semibold">Corrections</span>
              </div>
              <div className="text-2xl font-bold">{totalCorrections}</div>
            </div>
            <div className="p-4 border border-border/40 rounded-lg bg-black/20">
              <div className="flex items-center gap-2 mb-2">
                <Trash2 className="w-5 h-5 text-yellow-400" />
                <span className="text-sm font-semibold">Deprecated Units</span>
              </div>
              <div className="text-2xl font-bold">{totalDeprecated}</div>
            </div>
            <div className="p-4 border border-border/40 rounded-lg bg-black/20">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                <span className="text-sm font-semibold">Open Contradictions</span>
              </div>
              <div className="text-2xl font-bold">{totalContradictions}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-black/40">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="history">
              <History className="w-4 h-4 mr-2" />
              Correction History
            </TabsTrigger>
            <TabsTrigger value="deprecated">
              <Trash2 className="w-4 h-4 mr-2" />
              Deprecated Knowledge
            </TabsTrigger>
            <TabsTrigger value="contradictions">
              <AlertTriangle className="w-4 h-4 mr-2" />
              Open Contradictions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="history" className="mt-6">
            <CorrectionHistoryPanel
              corrections={data.corrections}
              onRefresh={loadDashboardData}
            />
          </TabsContent>

          <TabsContent value="deprecated" className="mt-6">
            <DeprecatedUnitsPanel
              units={data.deprecated_units}
              onRefresh={loadDashboardData}
            />
          </TabsContent>

          <TabsContent value="contradictions" className="mt-6">
            <ContradictionReviewPanel
              contradictions={data.open_contradictions}
              onRefresh={loadDashboardData}
            />
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
};

