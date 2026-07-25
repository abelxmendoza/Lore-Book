/**
 * Group Timeline tab: conversation-derived with-you / without-you swimlanes,
 * plus a compact hand-recorded milestones section (not a peer tab).
 */

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { OrganizationTimelinePanel } from './OrganizationTimelinePanel';
import type { OrgDerivedEvent } from '../../mocks/organizationTimeline';
import type { Organization, OrganizationEvent } from './OrganizationProfileCard';

type Props = {
  organization: Organization;
  mockMode?: boolean;
  active?: boolean;
  /** Prefetched derived events from the parent modal (avoids a second fetch). */
  derivedEvents?: OrgDerivedEvent[];
  derivedLoading?: boolean;
  recordedEvents: OrganizationEvent[];
  onAddEvent: (event: {
    title: string;
    date: string;
    type: OrganizationEvent['type'];
  }) => Promise<void> | void;
  onRemoveEvent: (eventId: string) => Promise<void> | void;
  formatDate: (dateString?: string) => string;
  eventSaving?: boolean;
};

export function OrganizationActivityPanel({
  organization,
  mockMode = false,
  active = true,
  derivedEvents,
  derivedLoading,
  recordedEvents,
  onAddEvent,
  onRemoveEvent,
  formatDate,
  eventSaving = false,
}: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({
    title: '',
    date: new Date().toISOString().split('T')[0],
    type: 'other' as OrganizationEvent['type'],
  });

  const handleSave = async () => {
    if (!draft.title.trim() || !draft.date) return;
    await onAddEvent({
      title: draft.title.trim(),
      date: draft.date,
      type: draft.type,
    });
    setDraft({
      title: '',
      date: new Date().toISOString().split('T')[0],
      type: 'other',
    });
    setShowAdd(false);
  };

  return (
    <div className="space-y-6" data-testid="org-timeline-panel">
      <OrganizationTimelinePanel
        organization={organization}
        mockMode={mockMode}
        active={active}
        events={derivedEvents}
        loading={derivedLoading}
      />

      <section
        className="space-y-2 border-t border-white/8 pt-4"
        data-testid="org-timeline-recorded"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h4 className="text-xs font-medium text-white/55">Recorded milestones</h4>
            <p className="text-[10px] text-white/35 mt-0.5">
              Optional hand-added notes on this group card.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAdd((v) => !v)}
            className="text-white/55 hover:text-white shrink-0"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
        </div>

        {showAdd && (
          <Card className="bg-black/30 border-white/10">
            <CardContent className="pt-4 space-y-3">
              <Input
                placeholder="Milestone title *"
                value={draft.title}
                onChange={(e) => setDraft((v) => ({ ...v, title: e.target.value }))}
                className="bg-black/60 border-border/50 text-white"
              />
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={draft.date}
                  onChange={(e) => setDraft((v) => ({ ...v, date: e.target.value }))}
                  className="flex-1 bg-black/60 border-border/50 text-white"
                />
                <select
                  value={draft.type}
                  onChange={(e) =>
                    setDraft((v) => ({ ...v, type: e.target.value as OrganizationEvent['type'] }))
                  }
                  aria-label="Event type"
                  className="px-3 py-2 bg-black/60 border border-border/50 rounded-lg text-white text-sm"
                >
                  <option value="meeting">Meeting</option>
                  <option value="game">Game</option>
                  <option value="social">Social</option>
                  <option value="work">Work</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => void handleSave()} disabled={eventSaving} className="flex-1">
                  {eventSaving ? 'Saving...' : 'Save'}
                </Button>
                <Button variant="outline" onClick={() => setShowAdd(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {recordedEvents.length === 0 && !showAdd ? (
          <p className="text-[11px] text-white/30 py-0.5">
            No hand-added milestones yet.
          </p>
        ) : (
          <div className="space-y-1.5">
            {recordedEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/8 bg-black/20 px-2.5 py-2"
              >
                <div className="min-w-0">
                  <div className="font-medium text-white/85 text-sm truncate">{event.title}</div>
                  <div className="text-[11px] text-white/40 mt-0.5">{formatDate(event.date)}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Badge variant="outline" className="text-[10px] text-white/45 border-white/15">
                    {event.type}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${event.title}`}
                    onClick={() => void onRemoveEvent(event.id)}
                    className="h-8 w-8 p-0"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-400/80" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
