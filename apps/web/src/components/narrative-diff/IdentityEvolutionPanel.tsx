import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, XCircle, RefreshCw, Heart, Lightbulb, Target, Archive } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { fetchJson } from '../../lib/api';
import { format, parseISO } from 'date-fns';
import { BeliefResolutionBadge } from '../belief-resolution/BeliefResolutionBadge';
import { KnowledgeTypeBadge } from '../knowledge-type/KnowledgeTypeBadge';

export type DiffType = 
  | 'BELIEF_STRENGTHENED'
  | 'BELIEF_WEAKENED'
  | 'BELIEF_ABANDONED'
  | 'INTERPRETATION_SHIFT'
  | 'EMOTIONAL_CHANGE'
  | 'VALUE_REPRIORITIZATION';

export type SubjectType = 'SELF' | 'ENTITY' | 'THEME';

export interface NarrativeDiff {
  id: string;
  user_id: string;
  subject_type: SubjectType;
  subject_id: string;
  diff_type: DiffType;
  from_content: string;
  from_knowledge_type: string;
  from_confidence: number;
  from_timestamp: string;
  to_content: string;
  to_knowledge_type: string;
  to_confidence: number;
  to_timestamp: string;
  evidence_entry_ids: string[];
  contract_type: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

const getDiffConfig = (diffType: DiffType) => {
  switch (diffType) {
    case 'BELIEF_STRENGTHENED':
      return {
        icon: TrendingUp,
        color: 'text-green-400',
        bgColor: 'bg-green-500/10 border-green-500/30',
        label: 'Belief Strengthened',
        description: 'This belief gained confidence over time',
      };
    case 'BELIEF_WEAKENED':
      return {
        icon: TrendingDown,
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-500/10 border-yellow-500/30',
        label: 'Belief Weakened',
        description: 'This belief lost confidence over time',
      };
    case 'BELIEF_ABANDONED':
      return {
        icon: XCircle,
        color: 'text-gray-400',
        bgColor: 'bg-gray-500/10 border-gray-500/30',
        label: 'Belief Abandoned',
        description: 'You moved away from this belief',
      };
    case 'INTERPRETATION_SHIFT':
      return {
        icon: Lightbulb,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/10 border-blue-500/30',
        label: 'Interpretation Shift',
        description: 'How you frame experiences changed',
      };
    case 'EMOTIONAL_CHANGE':
      return {
        icon: Heart,
        color: 'text-pink-400',
        bgColor: 'bg-pink-500/10 border-pink-500/30',
        label: 'Emotional Change',
        description: 'Your feelings about this shifted',
      };
    case 'VALUE_REPRIORITIZATION':
      return {
        icon: Target,
        color: 'text-purple-400',
        bgColor: 'bg-purple-500/10 border-purple-500/30',
        label: 'Value Reprioritization',
        description: 'Your priorities changed',
      };
    default:
      return {
        icon: Archive,
        color: 'text-gray-400',
        bgColor: 'bg-gray-500/10 border-gray-500/30',
        label: 'Unknown',
        description: 'Unknown change type',
      };
  }
};

export const IdentityEvolutionPanel: React.FC = () => {
  const [diffs, setDiffs] = useState<NarrativeDiff[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'all' | 'self' | 'entities' | 'themes'>('all');
  const [contract, setContract] = useState<'ARCHIVIST' | 'ANALYST' | 'REFLECTOR'>('REFLECTOR');

  useEffect(() => {
    loadDiffs();
  }, [contract]);

  const loadDiffs = async () => {
    setLoading(true);
    try {
      const response = await fetchJson(`/api/narrative-diff/diffs?contract_type=${contract}&limit=50`);
      if (response.success) {
        setDiffs(response.diffs || []);
      }
    } catch (error) {
      console.error('Failed to load narrative diffs:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateDiffs = async () => {
    setLoading(true);
    try {
      const response = await fetchJson('/api/narrative-diff/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract }),
      });
      if (response.success) {
        await loadDiffs();
      }
    } catch (error) {
      console.error('Failed to generate diffs:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredDiffs = diffs.filter(diff => {
    if (selectedTab === 'all') return true;
    if (selectedTab === 'self') return diff.subject_type === 'SELF';
    if (selectedTab === 'entities') return diff.subject_type === 'ENTITY';
    if (selectedTab === 'themes') return diff.subject_type === 'THEME';
    return true;
  });

  if (loading && diffs.length === 0) {
    return (
      <Card className="bg-black/40 border-border/50">
        <CardContent className="p-8 text-center text-white/60">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading identity evolution...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Identity Evolution</h2>
          <p className="text-white/60 text-sm">
            How your beliefs, interpretations, and values have changed over time
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={contract}
            onChange={(e) => setContract(e.target.value as any)}
            className="px-3 py-1.5 bg-black/40 border border-border/50 rounded text-white text-sm"
          >
            <option value="ARCHIVIST">Archivist</option>
            <option value="ANALYST">Analyst</option>
            <option value="REFLECTOR">Reflector</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={generateDiffs}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Generate Diffs
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as any)}>
        <TabsList className="bg-black/40 border-border/50">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="self">Self</TabsTrigger>
          <TabsTrigger value="entities">Entities</TabsTrigger>
          <TabsTrigger value="themes">Themes</TabsTrigger>
        </TabsList>

        <TabsContent value={selectedTab} className="mt-4">
          {filteredDiffs.length === 0 ? (
            <Card className="bg-black/40 border-border/50">
              <CardContent className="p-8 text-center text-white/60">
                <p>No evolution detected yet.</p>
                <p className="text-sm mt-2">Generate diffs to see how your beliefs and interpretations have changed.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredDiffs.map((diff) => {
                const config = getDiffConfig(diff.diff_type);
                const Icon = config.icon;

                return (
                  <Card key={diff.id} className={`bg-black/40 border-border/50 ${config.bgColor}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className={`h-5 w-5 ${config.color}`} />
                          <h3 className="text-lg font-semibold text-white">{config.label}</h3>
                          {diff.contract_type && (
                            <Badge variant="outline" className="text-xs">
                              {diff.contract_type}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-white/50">
                          {format(parseISO(diff.to_timestamp), 'MMM d, yyyy')}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* From */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs text-white/50">
                          <span>Before:</span>
                          <KnowledgeTypeBadge 
                            type={diff.from_knowledge_type as any} 
                            showLabel={true} 
                            size="sm" 
                          />
                          <span className="text-white/40">
                            ({Math.round(diff.from_confidence * 100)}% confidence)
                          </span>
                        </div>
                        <p className="text-sm text-white/80 italic pl-4 border-l-2 border-white/20">
                          "{diff.from_content}"
                        </p>
                        <div className="text-xs text-white/40">
                          {format(parseISO(diff.from_timestamp), 'MMM d, yyyy')}
                        </div>
                      </div>

                      {/* Arrow */}
                      <div className="flex items-center justify-center py-2">
                        <div className="h-px bg-white/20 flex-1" />
                        <Icon className={`h-4 w-4 ${config.color} mx-2`} />
                        <div className="h-px bg-white/20 flex-1" />
                      </div>

                      {/* To */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs text-white/50">
                          <span>After:</span>
                          <KnowledgeTypeBadge 
                            type={diff.to_knowledge_type as any} 
                            showLabel={true} 
                            size="sm" 
                          />
                          <span className="text-white/40">
                            ({Math.round(diff.to_confidence * 100)}% confidence)
                          </span>
                        </div>
                        <p className="text-sm text-white/80 italic pl-4 border-l-2 border-white/20">
                          "{diff.to_content}"
                        </p>
                        <div className="text-xs text-white/40">
                          {format(parseISO(diff.to_timestamp), 'MMM d, yyyy')}
                        </div>
                      </div>

                      {/* Subject */}
                      <div className="pt-2 border-t border-white/10">
                        <div className="text-xs text-white/50">
                          Subject: <span className="text-white/70">{diff.subject_type}</span>
                          {diff.subject_type !== 'SELF' && (
                            <span className="text-white/50"> ({diff.subject_id})</span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

