// =====================================================
// ENTITY RESOLUTION DASHBOARD
// Purpose: Give users explicit control over people, places,
// orgs, and concepts the system has inferred
// =====================================================

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Users, AlertTriangle, History, Loader2, AlertCircle } from 'lucide-react';
import { EntityListPanel } from './EntityListPanel';
import { EntityConflictsPanel } from './EntityConflictsPanel';
import { MergeHistoryPanel } from './MergeHistoryPanel';
import { fetchJson } from '../../lib/api';

interface EntityCandidate {
  entity_id: string;
  primary_name: string;
  aliases: string[];
  entity_type: 'CHARACTER' | 'LOCATION' | 'ENTITY' | 'ORG' | 'CONCEPT';
  confidence: number;
  usage_count: number;
  last_seen: string;
  table_name: string;
}

interface EntityConflict {
  id: string;
  entity_a_id: string;
  entity_b_id: string;
  entity_a_type: string;
  entity_b_type: string;
  similarity_score: number;
  conflict_reason: string;
  status: string;
  detected_at: string;
}

interface EntityMergeRecord {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  source_entity_type: string;
  target_entity_type: string;
  merged_by: 'SYSTEM' | 'USER';
  reason: string | null;
  created_at: string;
  reversible: boolean;
  reverted_at: string | null;
}

interface DashboardData {
  entities: EntityCandidate[];
  conflicts: EntityConflict[];
  merge_history: EntityMergeRecord[];
}

export const EntityResolutionDashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('entities');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJson<{ success: boolean; data: DashboardData }>(
        '/api/entity-resolution/dashboard'
      );
      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error || 'Failed to load dashboard data');
      }
    } catch (err: any) {
      console.error('Failed to load entity resolution dashboard:', err);
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

  const totalEntities = data.entities.length;
  const totalConflicts = data.conflicts.length;
  const totalMerges = data.merge_history.length;

  return (
    <div className="p-6 space-y-6">
      <Card className="border-border/60 bg-black/40">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Entity Resolution Dashboard</CardTitle>
          <CardDescription>
            View and manage people, places, organizations, and concepts the system has inferred.
            No silent merges or splits—you have full control.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 border border-border/40 rounded-lg bg-black/20">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-blue-400" />
                <span className="text-sm font-semibold">Total Entities</span>
              </div>
              <div className="text-2xl font-bold">{totalEntities}</div>
            </div>
            <div className="p-4 border border-border/40 rounded-lg bg-black/20">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                <span className="text-sm font-semibold">Possible Duplicates</span>
              </div>
              <div className="text-2xl font-bold">{totalConflicts}</div>
            </div>
            <div className="p-4 border border-border/40 rounded-lg bg-black/20">
              <div className="flex items-center gap-2 mb-2">
                <History className="w-5 h-5 text-purple-400" />
                <span className="text-sm font-semibold">Merges</span>
              </div>
              <div className="text-2xl font-bold">{totalMerges}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-black/40">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="entities">
              <Users className="w-4 h-4 mr-2" />
              All Entities
            </TabsTrigger>
            <TabsTrigger value="conflicts">
              <AlertTriangle className="w-4 h-4 mr-2" />
              Possible Duplicates
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="w-4 h-4 mr-2" />
              Merge History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="entities" className="mt-6">
            <EntityListPanel entities={data.entities} onRefresh={loadDashboardData} />
          </TabsContent>

          <TabsContent value="conflicts" className="mt-6">
            <EntityConflictsPanel
              conflicts={data.conflicts}
              onRefresh={loadDashboardData}
            />
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <MergeHistoryPanel history={data.merge_history} onRefresh={loadDashboardData} />
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
};

