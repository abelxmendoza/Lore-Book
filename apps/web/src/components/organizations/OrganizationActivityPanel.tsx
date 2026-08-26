/**
 * Group Timeline tab: conversation-derived with-you / without-you swimlanes,
 * plus a compact hand-recorded milestones section (not a peer tab).
 */

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { OrganizationTimelinePanel } from './OrganizationTimelinePanel';
import type { OrgDerivedEvent } from '../../mocks/organizationTimeline';
import type { Organization, OrganizationEvent } from './OrganizationProfileCard';

type Props = {
  organization: Organization;
  mockMode?: boolean;
  active?: boolean;
  /** When set, skip GET /timelines and render this feed (tests / overview). */
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
  /** Opens the shared Life Log Event composer with this group prefilled. */
  onPostEvent?: () => void;
  /** Open Event detail or moment panel for a timeline row. */
  onEventSelect?: (event: OrgDerivedEvent) => void;
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
  onPostEvent,
  onEventSelect,
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
      {onPostEvent && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-400/20 bg-amber-500/[0.06] px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-50">Post an Event</p>
            <p className="text-[11px] text-white/45 mt-0.5">
              Flyer, date, and place — shows on this group’s timeline and in Life Log.
            </p>
          </div>
          <Button
            size="sm"
            className="h-9 w-full sm:w-auto sm:shrink-0 bg-amber-500/25 border border-amber-400/35 text-amber-50 hover:bg-amber-500/35"
            onClick={onPostEvent}
            data-testid="org-post-event"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Post event
          </Button>
        </div>
      )}

      <OrganizationTimelinePanel
        organization={organization}
        mockMode={mockMode}
        active={active}
        events={derivedEvents}
        loading={derivedLoading}
        onEventSelect={onEventSelect}
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
          <div className="rounded-xl border border-purple-400/20 bg-purple-500/[0.05] p-3.5 space-y-3">
            <Input
              placeholder="Milestone title *"
              value={draft.title}
              onChange={(e) => setDraft((v) => ({ ...v, title: e.target.value }))}
              className="h-10 bg-black/55 border-white/12 text-white rounded-xl"
            />
            <div className="flex gap-2">
              <Input
                type="date"
                value={draft.date}
                onChange={(e) => setDraft((v) => ({ ...v, date: e.target.value }))}
                className="flex-1 h-10 bg-black/55 border-white/12 text-white rounded-xl"
              />
              <select
                value={draft.type}
                onChange={(e) =>
                  setDraft((v) => ({ ...v, type: e.target.value as OrganizationEvent['type'] }))
                }
                aria-label="Event type"
                className="h-10 rounded-xl border border-white/12 bg-black/55 px-3 text-sm text-white focus:border-purple-400/50 focus:outline-none focus:ring-2 focus:ring-purple-400/20"
              >
                <option value="meeting">Meeting</option>
                <option value="game">Game</option>
                <option value="social">Social</option>
                <option value="work">Work</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => void handleSave()}
                disabled={eventSaving}
                className="flex-1 h-9 bg-purple-500/25 border border-purple-400/35 text-purple-100 hover:bg-purple-500/35"
              >
                {eventSaving ? 'Saving...' : 'Save'}
              </Button>
              <Button variant="outline" className="h-9" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
            </div>
          </div>
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
                className="flex items-center justify-between gap-2 rounded-lg border border-white/8 bg-black/20 px-2.5 py-2 transition hover:border-purple-400/25 hover:bg-purple-500/[0.05]"
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
