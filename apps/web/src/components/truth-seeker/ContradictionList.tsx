import { useState } from 'react';
import { Search, Filter, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { ContradictionCard } from './ContradictionCard';
import type { ContinuityEvent } from '../../types/continuity';

type ContradictionListProps = {
  contradictions: ContinuityEvent[];
  loading?: boolean;
  onContradictionClick?: (contradiction: ContinuityEvent) => void;
};

export const ContradictionList = ({
  contradictions,
  loading = false,
  onContradictionClick,
}: ContradictionListProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');

  const filteredContradictions = contradictions.filter((c) => {
    const matchesSearch = c.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSeverity =
      severityFilter === 'all' ||
      (severityFilter === 'high' && c.severity >= 8) ||
      (severityFilter === 'medium' && c.severity >= 5 && c.severity < 8) ||
      (severityFilter === 'low' && c.severity < 5);
    return matchesSearch && matchesSeverity;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-white/60">Loading contradictions...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search contradictions..."
            className="pl-10 bg-black/60 border-border/60 text-white"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setSeverityFilter('all')}
            className={`text-xs px-3 py-1 rounded ${
              severityFilter === 'all'
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'bg-black/40 text-white/60 border border-border/60'
            }`}
          >
            All ({contradictions.length})
          </button>
          <button
            onClick={() => setSeverityFilter('high')}
            className={`text-xs px-3 py-1 rounded ${
              severityFilter === 'high'
                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : 'bg-black/40 text-white/60 border border-border/60'
            }`}
          >
            High ({contradictions.filter(c => c.severity >= 8).length})
          </button>
          <button
            onClick={() => setSeverityFilter('medium')}
            className={`text-xs px-3 py-1 rounded ${
              severityFilter === 'medium'
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                : 'bg-black/40 text-white/60 border border-border/60'
            }`}
          >
            Medium ({contradictions.filter(c => c.severity >= 5 && c.severity < 8).length})
          </button>
          <button
            onClick={() => setSeverityFilter('low')}
            className={`text-xs px-3 py-1 rounded ${
              severityFilter === 'low'
                ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                : 'bg-black/40 text-white/60 border border-border/60'
            }`}
          >
            Low ({contradictions.filter(c => c.severity < 5).length})
          </button>
        </div>
      </div>

      {/* Contradictions List */}
      {filteredContradictions.length === 0 ? (
        <div className="text-center py-12 text-white/60">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 mb-4">
            {searchQuery || severityFilter !== 'all' ? (
              <AlertTriangle className="h-8 w-8 text-yellow-400" />
            ) : (
              <CheckCircle2 className="h-8 w-8 text-green-400" />
            )}
          </div>
          <p className="text-lg font-medium mb-2 text-white">
            {searchQuery || severityFilter !== 'all' ? 'No contradictions found' : 'No contradictions found'}
          </p>
          <p className="text-sm mb-4">
            {searchQuery || severityFilter !== 'all'
              ? 'Try adjusting your search or filters'
              : 'Your journal is consistent! All statements align across time.'}
          </p>
          {searchQuery || severityFilter !== 'all' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setSeverityFilter('all');
              }}
              className="mt-2"
            >
              Clear filters
            </Button>
          ) : (
            <div className="text-xs text-white/50 mt-4">
              <p>Truth Seeker runs automatically and will alert you when contradictions are detected.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredContradictions.map((contradiction) => (
            <ContradictionCard
              key={contradiction.id}
              id={contradiction.id}
              description={contradiction.description}
              severity={contradiction.severity}
              createdAt={contradiction.created_at || new Date().toISOString()}
              sourceComponents={contradiction.source_components}
              metadata={contradiction.metadata}
              isResolved={contradiction.metadata?.resolved === true}
              onClick={() => onContradictionClick?.(contradiction)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

