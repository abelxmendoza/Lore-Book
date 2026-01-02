import { useState } from 'react';

import { useHQISearch } from '../../hooks/useHQISearch';
import { Card, CardContent } from '../ui/card';
import { HQIFilterSidebar } from './HQIFilterSidebar';
import { HQIResultCard } from './HQIResultCard';
import { HQISearchBar } from './HQISearchBar';

export const HQISearchOverlay = () => {
  const { query, setQuery, results, runSearch, filters, setFilters } = useHQISearch();
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        className="rounded-full border border-primary/50 bg-primary/10 px-4 py-2 text-sm"
        onClick={() => setOpen(true)}
      >
        Open HQI Search (⌘K)
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex bg-black/80 backdrop-blur">
          <div className="m-auto flex w-11/12 max-w-5xl gap-4">
            <HQIFilterSidebar filters={filters} onChange={setFilters} />
            <Card className="flex-1 border border-border/60 bg-background/80">
              <CardContent className="space-y-4 p-4">
                <div className="flex items-center justify-between">
                  <HQISearchBar
                    value={query}
                    onChange={(val) => {
                      setQuery(val);
                      void runSearch(val);
                    }}
                  />
                  <button className="text-xs text-white/60" onClick={() => setOpen(false)}>
                    Close
                  </button>
                </div>
                <div className="space-y-2 overflow-y-auto pr-2" style={{ maxHeight: '60vh' }}>
                  {results.map((result) => (
                    <HQIResultCard key={result.id} result={result} />
                  ))}
                  {!results.length && <p className="text-sm text-white/50">No results yet.</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};
