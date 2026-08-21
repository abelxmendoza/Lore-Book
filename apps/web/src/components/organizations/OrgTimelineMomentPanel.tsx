/**
 * Summary modal for a group timeline moment.
 * Primary: read what we know. Secondary: continue in main chat to ask / update.
 */

import { Calendar, MessageSquare, Users, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import type { OrgDerivedEvent } from '../../mocks/organizationTimeline';

type Props = {
  event: OrgDerivedEvent;
  organizationName: string;
  onClose: () => void;
  onContinueInChat: () => void;
  onPostAsEvent?: () => void;
};

function fmtDate(iso: string | null): string {
  if (!iso) return 'Unknown date';
  try {
    return format(parseISO(iso), 'MMM d, yyyy');
  } catch {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : format(d, 'MMM d, yyyy');
  }
}

export function OrgTimelineMomentPanel({
  event,
  organizationName,
  onClose,
  onContinueInChat,
  onPostAsEvent,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/55 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="org-timeline-moment-title"
      data-testid="org-timeline-moment-panel"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85dvh] overflow-y-auto rounded-2xl border border-white/12 bg-[#121018] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/8 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-[11px] font-mono text-primary/75 flex items-center gap-1.5">
              <Calendar className="h-3 w-3 shrink-0" />
              {fmtDate(event.date)}
            </p>
            <h2
              id="org-timeline-moment-title"
              className="text-base font-semibold text-white mt-0.5 leading-snug"
            >
              {event.title}
            </h2>
            <p className="text-[11px] text-white/40 mt-1 truncate">{organizationName}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {event.source === 'user_posted' ? (
                <Badge variant="outline" className="text-[10px] border-amber-400/35 text-amber-200">
                  Posted event
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] border-white/15 text-white/50">
                  Detected moment
                </Badge>
              )}
              {event.type && (
                <Badge variant="outline" className="text-[10px] border-white/15 text-white/45">
                  {event.type}
                </Badge>
              )}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-3.5 space-y-3">
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-white/40 mb-1.5">
              Summary
            </h3>
            {event.summary?.trim() ? (
              <p className="text-sm text-white/75 leading-relaxed whitespace-pre-wrap">
                {event.summary.trim()}
              </p>
            ) : (
              <p className="text-sm text-white/40 leading-relaxed">
                No written summary yet for this moment with {organizationName}. Continue in chat to
                pull together what LoreBook knows, or add what you remember.
              </p>
            )}
          </div>

          {event.involved.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
              <Users className="h-3.5 w-3.5 text-white/40 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-white/35 mb-0.5">People</p>
                <p className="text-xs text-white/60 leading-relaxed">
                  {event.involved.slice(0, 8).join(', ')}
                  {event.involved.length > 8 ? ` +${event.involved.length - 8}` : ''}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-white/8 px-4 py-3.5 bg-black/30">
          <Button
            className="w-full h-10 bg-violet-500/25 border border-violet-400/35 text-violet-50 hover:bg-violet-500/35"
            onClick={onContinueInChat}
            data-testid="org-moment-continue-chat"
          >
            <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
            Continue in chat
          </Button>
          <p className="text-[11px] text-white/40 text-center leading-relaxed">
            Ask questions, fill gaps, or correct details — focused on this moment with{' '}
            {organizationName}.
          </p>
          {onPostAsEvent && (
            <Button
              variant="outline"
              className="w-full h-9 border-white/12 text-white/70"
              onClick={onPostAsEvent}
              data-testid="org-moment-post-as-event"
            >
              <Calendar className="h-3.5 w-3.5 mr-1.5" />
              Post as Timeline moment
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
