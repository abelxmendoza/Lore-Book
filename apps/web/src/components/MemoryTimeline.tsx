import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ActivitySquare,
  Brain,
  Filter,
  Loader2,
  MessageCircle,
  ShieldAlert,
  Sparkles,
  Tag,
  Timer,
  Workflow
} from 'lucide-react';

import { useMemoryLadder, type MemoryLadderEntry } from '../hooks/useMemoryLadder';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';

const formatDate = (date: string) => new Date(date).toLocaleString();

const getMarkers = (entry: MemoryLadderEntry) => {
  const markers: { icon: string; label: string }[] = [];
  const tagString = entry.key_tags.join(' ').toLowerCase();

  if (/travel|place|city|park|location/.test(tagString)) {
    markers.push({ icon: '📍', label: 'Places' });
  }
  if (entry.source === 'chat' || /conversation|call|dialogue/.test(tagString)) {
    markers.push({ icon: '💬', label: 'Conversations' });
  }
  if (entry.echoes.length > 0) {
    markers.push({ icon: '🔁', label: 'Echoes' });
  }
  if (entry.traits_detected.length > 0 || entry.summary) {
    markers.push({ icon: '🧠', label: 'Reflections' });
  }
  if (/conflict|fight|argument|tension/.test(tagString) || (entry.emotion_summary ?? '').includes('conflict')) {
    markers.push({ icon: '⚔️', label: 'Conflicts' });
  }

  return markers;
};

export const MemoryTimeline = () => {
  const [interval, setInterval] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [persona, setPersona] = useState('');
  const [tag, setTag] = useState('');
  const [emotion, setEmotion] = useState('');
  const [mode, setMode] = useState<'raw' | 'insight'>('raw');

  const { ladder, loading, error, load } = useMemoryLadder(interval);
  const [selectedEntry, setSelectedEntry] = useState<MemoryLadderEntry | null>(null);

  useEffect(() => {
    load({ interval, persona: persona || undefined, tag: tag || undefined, emotion: emotion || undefined });
  }, [interval, persona, tag, emotion, load]);

  useEffect(() => {
    if (!selectedEntry && ladder.groups[0]?.entries[0]) {
      setSelectedEntry(ladder.groups[0].entries[0]);
    }
  }, [ladder.groups, selectedEntry]);

  const rows = useMemo(() => {
    return ladder.groups.flatMap((group) => [
      { type: 'header' as const, label: group.label, key: `${group.start}-${group.label}` },
      ...group.entries.map((entry) => ({ type: 'entry' as const, entry, key: `${group.start}-${entry.id}` }))
    ]);
  }, [ladder.groups]);

  const parentRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (rows[index]?.type === 'header' ? 48 : 160),
    overscan: 6
  });

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Workflow className="h-5 w-5 text-primary" /> Memory Timeline
          </CardTitle>
          <p className="text-xs text-white/60">Grouped by ladder rungs powered by the Memory Ladder renderer.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Button size="sm" variant={interval === 'daily' ? 'default' : 'outline'} onClick={() => setInterval('daily')}>
            Daily
          </Button>
          <Button size="sm" variant={interval === 'weekly' ? 'default' : 'outline'} onClick={() => setInterval('weekly')}>
            Weekly
          </Button>
          <Button size="sm" variant={interval === 'monthly' ? 'default' : 'outline'} onClick={() => setInterval('monthly')}>
            Monthly
          </Button>
          <Button
            size="sm"
            variant={mode === 'raw' ? 'default' : 'ghost'}
            onClick={() => setMode(mode === 'raw' ? 'insight' : 'raw')}
            leftIcon={mode === 'raw' ? <ActivitySquare className="h-4 w-4" /> : <Brain className="h-4 w-4" />}
          >
            {mode === 'raw' ? '📜 Raw Entry Mode' : '📊 Insight Mode'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-3">
            <div className="rounded-xl border border-border/60 bg-black/30 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
                <Filter className="h-4 w-4 text-primary" />
                <span className="uppercase tracking-[0.3em] text-white/50">Filters</span>
                <Input
                  placeholder="Persona"
                  value={persona}
                  onChange={(event) => setPersona(event.target.value)}
                  className="h-9 w-32 bg-black/40"
                />
                <Input
                  placeholder="Tag"
                  value={tag}
                  onChange={(event) => setTag(event.target.value)}
                  className="h-9 w-28 bg-black/40"
                />
                <Input
                  placeholder="Emotion"
                  value={emotion}
                  onChange={(event) => setEmotion(event.target.value)}
                  className="h-9 w-32 bg-black/40"
                />
              </div>
            </div>

            <div ref={parentRef} className="relative h-[720px] overflow-auto rounded-xl border border-border/50 bg-black/30">
              {loading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              )}
              {error && <p className="p-4 text-sm text-red-300">{error}</p>}
              {!loading && rows.length === 0 && <p className="p-4 text-sm text-white/60">No memories found for this view.</p>}
              <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  if (!row) return null;
                  const style: CSSProperties = {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`
                  };

                  if (row.type === 'header') {
                    return (
                      <div key={row.key} style={style} className="sticky top-0 z-10 border-b border-border/50 bg-black/60 px-4 py-2">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/60">
                          <Timer className="h-3 w-3 text-primary" /> {row.label}
                        </div>
                      </div>
                    );
                  }

                  const markers = getMarkers(row.entry);
                  return (
                    <div
                      key={row.key}
                      style={style}
                      className="group cursor-pointer border-b border-border/40 px-4 py-3 transition hover:bg-primary/5"
                      onClick={() => setSelectedEntry(row.entry)}
                    >
                      <div className="flex items-center justify-between text-xs text-white/50">
                        <span>{formatDate(row.entry.date)}</span>
                        <div className="flex flex-wrap gap-1">
                          {markers.map((marker) => (
                            <Badge key={`${row.entry.id}-${marker.label}`} variant="secondary" className="bg-white/5 text-xs text-white">
                              {marker.icon} {marker.label}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <p className="text-base font-semibold text-white">{row.entry.title}</p>
                      </div>
                      {row.entry.key_tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-white/60">
                          <Tag className="h-3 w-3 text-primary" />
                          {row.entry.key_tags.map((t) => (
                            <span key={`${row.entry.id}-${t}`} className="rounded bg-white/5 px-2 py-0.5">
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                      {mode === 'raw' ? (
                        <p className="mt-2 line-clamp-3 text-sm text-white/80">{row.entry.corrected_content ?? row.entry.content_preview}</p>
                      ) : (
                        <div className="mt-2 space-y-1 text-sm text-white/80">
                          <div className="flex items-center gap-2 text-xs text-white/60">
                            <Brain className="h-4 w-4 text-primary" />
                            {row.entry.emotion_summary ?? 'No emotion captured'}
                          </div>
                          {row.entry.echoes.length > 0 && (
                            <p className="text-xs text-white/70">🔁 Echoes: {row.entry.echoes.join(', ')}</p>
                          )}
                          {row.entry.traits_detected.length > 0 && (
                            <p className="text-xs text-white/70">🧠 Traits: {row.entry.traits_detected.join(', ')}</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Card className="h-full bg-black/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-white">
                  <MessageCircle className="h-5 w-5 text-primary" /> Memory Preview
                </CardTitle>
                <p className="text-xs text-white/60">Hover or click items to inspect corrections and evolution notes.</p>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-white/80">
                {!selectedEntry && <p className="text-white/50">Select a memory to preview details.</p>}
                {selectedEntry && (
                  <>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-white/50">
                        <span>{formatDate(selectedEntry.date)}</span>
                        <Badge variant="secondary" className="bg-white/10 text-white">
                          {selectedEntry.source === 'chat' ? 'Conversation' : 'Journal'}
                        </Badge>
                      </div>
                      <h4 className="text-lg font-semibold text-white">{selectedEntry.title}</h4>
                      {selectedEntry.key_tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 text-[11px] text-white/60">
                          {selectedEntry.key_tags.map((t) => (
                            <span key={`${selectedEntry.id}-${t}`} className="rounded bg-white/5 px-2 py-0.5">
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <p className="whitespace-pre-line text-white/80">
                      {mode === 'raw'
                        ? selectedEntry.corrected_content ?? selectedEntry.content_preview
                        : selectedEntry.summary ?? selectedEntry.corrected_content ?? selectedEntry.content_preview}
                    </p>

                    {selectedEntry.emotion_summary && (
                      <div className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-xs">
                        <div className="flex items-center gap-2 text-primary">
                          <Brain className="h-4 w-4" /> Emotion Summary
                        </div>
                        <p className="mt-1 text-white/80">{selectedEntry.emotion_summary}</p>
                      </div>
                    )}

                    {selectedEntry.echoes.length > 0 && (
                      <div className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 p-3 text-xs text-white/80">
                        <p className="font-semibold text-cyan-200">Echoes detected</p>
                        <ul className="mt-1 list-disc space-y-1 pl-4">
                          {selectedEntry.echoes.map((echo) => (
                            <li key={`${selectedEntry.id}-${echo}`}>{echo}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {selectedEntry.traits_detected.length > 0 && (
                      <div className="rounded-lg border border-amber-300/40 bg-amber-500/10 p-3 text-xs text-white/80">
                        <p className="font-semibold text-amber-200">Traits detected</p>
                        <p className="mt-1">{selectedEntry.traits_detected.join(', ')}</p>
                      </div>
                    )}

                    {selectedEntry.corrections && selectedEntry.corrections.length > 0 && (
                      <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 text-xs text-white/80">
                        <div className="flex items-center gap-2 text-rose-200">
                          <ShieldAlert className="h-4 w-4" /> Corrections
                        </div>
                        <ul className="mt-2 space-y-2">
                          {selectedEntry.corrections.map((correction) => (
                            <li key={correction.id} className="rounded bg-black/40 p-2">
                              <p className="text-[11px] text-white/50">{formatDate(correction.created_at)}</p>
                              <p className="font-medium">{correction.corrected_text}</p>
                              {correction.note && <p className="text-white/60">Note: {correction.note}</p>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {selectedEntry.resolution_notes && (
                      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-white/80">
                        <p className="font-semibold text-primary">Evolution Notes</p>
                        <p className="mt-1 whitespace-pre-line">{selectedEntry.resolution_notes}</p>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
