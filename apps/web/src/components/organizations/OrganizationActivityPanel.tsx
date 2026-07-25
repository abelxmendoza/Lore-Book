/**
 * Unified group Activity: conversation-derived timeline + manually recorded events.
 * Replaces the former separate Events and Timeline tabs.
 */

import { useState } from 'react';
import { Calendar, Plus, Trash2 } from 'lucide-react';
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
    <div className="space-y-6" data-testid="org-activity-panel">
      <div>
        <h3 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
          <Calendar className="h-5 w-5 text-purple-400" />
          Activity
        </h3>
        <p className="text-xs text-white/45 mt-1">
          What happened with {organization.name} — from your conversations, plus anything you record by hand.
        </p>
      </div>

      <OrganizationTimelinePanel
        organization={organization}
        mockMode={mockMode}
        active={active}
        events={derivedEvents}
        loading={derivedLoading}
        title="From your conversations"
        description={`Events involving ${organization.name}'s members, split by your involvement.`}
      />

      <section className="space-y-3 border-t border-white/8 pt-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-white/85">Recorded</h4>
            <p className="text-[11px] text-white/40 mt-0.5">
              Hand-added milestones that stay on this group card.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowAdd((v) => !v)}>
            <Plus className="h-4 w-4 mr-2" />
            Add event
          </Button>
        </div>

        {showAdd && (
          <Card className="bg-black/40 border-border/50">
            <CardContent className="pt-6 space-y-3">
              <Input
                placeholder="Event title *"
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
                  {eventSaving ? 'Saving...' : 'Save event'}
                </Button>
                <Button variant="outline" onClick={() => setShowAdd(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {recordedEvents.length === 0 && !showAdd ? (
          <p className="text-xs text-white/40 py-1">
            No recorded events yet. Add a milestone above, or wait for conversation activity to appear.
          </p>
        ) : (
          <div className="space-y-2">
            {recordedEvents.map((event) => (
              <Card key={event.id} className="bg-black/40 border-border/50">
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-white text-sm truncate">{event.title}</div>
                      <div className="text-xs text-white/50 mt-0.5">{formatDate(event.date)}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="outline">{event.type}</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove ${event.title}`}
                        onClick={() => void onRemoveEvent(event.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
