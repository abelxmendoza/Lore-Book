import { useState } from 'react';
import { CheckCircle2, XCircle, Calendar, TrendingUp, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';

type Evidence = {
  id: string;
  component_id: string;
  text: string;
  date: string;
  confidence_score?: number;
  similarity_score?: number;
  type: 'supporting' | 'contradicting';
};

type EvidencePanelProps = {
  supportingEvidence?: Evidence[];
  contradictingEvidence?: Evidence[];
  loading?: boolean;
  onEvidenceClick?: (evidenceId: string) => void;
};

export const EvidencePanel = ({
  supportingEvidence = [],
  contradictingEvidence = [],
  loading = false,
  onEvidenceClick,
}: EvidencePanelProps) => {
  const [selectedType, setSelectedType] = useState<'supporting' | 'contradicting' | 'all'>('all');

  const getConfidenceColor = (score?: number) => {
    if (!score) return 'bg-gray-500/20 text-gray-400';
    if (score >= 0.8) return 'bg-green-500/20 text-green-400';
    if (score >= 0.6) return 'bg-yellow-500/20 text-yellow-400';
    return 'bg-red-500/20 text-red-400';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const filteredSupporting = selectedType === 'all' || selectedType === 'supporting' ? supportingEvidence : [];
  const filteredContradicting = selectedType === 'all' || selectedType === 'contradicting' ? contradictingEvidence : [];

  if (loading) {
    return (
      <Card className="bg-black/40 border-border/60">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-black/40 border-border/60">
      <CardHeader>
        <CardTitle className="text-lg text-white flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Evidence
        </CardTitle>
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => setSelectedType('all')}
            className={`text-xs px-2 py-1 rounded ${
              selectedType === 'all'
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'bg-black/40 text-white/60 border border-border/60'
            }`}
          >
            All ({supportingEvidence.length + contradictingEvidence.length})
          </button>
          <button
            onClick={() => setSelectedType('supporting')}
            className={`text-xs px-2 py-1 rounded ${
              selectedType === 'supporting'
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-black/40 text-white/60 border border-border/60'
            }`}
          >
            Supporting ({supportingEvidence.length})
          </button>
          <button
            onClick={() => setSelectedType('contradicting')}
            className={`text-xs px-2 py-1 rounded ${
              selectedType === 'contradicting'
                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : 'bg-black/40 text-white/60 border border-border/60'
            }`}
          >
            Contradicting ({contradictingEvidence.length})
          </button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px] max-h-[400px]">
          <div className="space-y-4 p-4">
            {/* Supporting Evidence */}
            {filteredSupporting.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-green-400 mb-2 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Supporting Evidence ({filteredSupporting.length})
                </h4>
                <div className="space-y-2">
                  {filteredSupporting.map((evidence) => (
                    <Card
                      key={evidence.id}
                      onClick={() => onEvidenceClick?.(evidence.id)}
                      className="border-green-500/30 bg-green-500/5 hover:bg-green-500/10 cursor-pointer transition-colors"
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
                            <Calendar className="h-3 w-3 text-white/60" />
                            <span className="text-xs text-white/60">{formatDate(evidence.date)}</span>
                          </div>
                          {evidence.confidence_score !== undefined && (
                            <Badge variant="outline" className={getConfidenceColor(evidence.confidence_score)}>
                              {(evidence.confidence_score * 100).toFixed(0)}%
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-white/90">{evidence.text}</p>
                        {evidence.similarity_score !== undefined && (
                          <div className="mt-2 text-xs text-white/50">
                            Similarity: {(evidence.similarity_score * 100).toFixed(0)}%
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Contradicting Evidence */}
            {filteredContradicting.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  Contradicting Evidence ({filteredContradicting.length})
                </h4>
                <div className="space-y-2">
                  {filteredContradicting.map((evidence) => (
                    <Card
                      key={evidence.id}
                      onClick={() => onEvidenceClick?.(evidence.id)}
                      className="border-red-500/30 bg-red-500/5 hover:bg-red-500/10 cursor-pointer transition-colors"
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
                            <Calendar className="h-3 w-3 text-white/60" />
                            <span className="text-xs text-white/60">{formatDate(evidence.date)}</span>
                          </div>
                          {evidence.confidence_score !== undefined && (
                            <Badge variant="outline" className={getConfidenceColor(evidence.confidence_score)}>
                              {(evidence.confidence_score * 100).toFixed(0)}%
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-white/90">{evidence.text}</p>
                        {evidence.similarity_score !== undefined && (
                          <div className="mt-2 text-xs text-white/50">
                            Similarity: {(evidence.similarity_score * 100).toFixed(0)}%
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {filteredSupporting.length === 0 && filteredContradicting.length === 0 && (
              <div className="text-center py-8 text-white/60 text-sm">
                No evidence available
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

