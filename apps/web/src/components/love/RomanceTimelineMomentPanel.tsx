/**
 * Summary modal for a Dating & Romance intimacy milestone.
 * Primary: read what we know + related lore. Secondary: continue in main chat.
 *
 * Portaled to document.body so it isn't clipped by the parent relationship
 * DialogContent (`overflow-hidden`).
 */

import { createPortal } from 'react-dom';
import { Calendar, Heart, Link2, MapPin, MessageSquare, Sparkles, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import type { RomanceTimelineMoment, RomanceTimelineRelatedLink } from '../../mocks/romanceTimelineMoment';

type Props = {
  moment: RomanceTimelineMoment;
  personName: string;
  onClose: () => void;
  onContinueInChat: (prompt?: string) => void;
  onOpenRelated?: (link: RomanceTimelineRelatedLink) => void;
  onSelectRelatedMoment?: (momentId: string) => void;
};

function fmtDate(iso: string): string {
  try {
    return format(parseISO(iso), 'MMM d, yyyy');
  } catch {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : format(d, 'MMM d, yyyy');
  }
}

function impactClass(impact: string): string {
  if (impact === 'Peak intimacy' || impact === 'Deepening' || impact === 'Connection growth') {
    return 'bg-pink-500/15 text-pink-200 border-pink-500/30';
  }
  if (impact === 'Strain' || impact === 'Tension' || impact === 'Rupture') {
    return 'bg-red-500/15 text-red-300 border-red-500/30';
  }
  return 'bg-violet-500/15 text-violet-200 border-violet-500/30';
}

export function RomanceTimelineMomentPanel({
  moment,
  personName,
  onClose,
  onContinueInChat,
  onOpenRelated,
  onSelectRelatedMoment,
}: Props) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/65 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="romance-timeline-moment-title"
      data-testid="romance-timeline-moment-panel"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="w-full max-w-lg max-h-[85dvh] overflow-y-auto rounded-2xl border border-pink-500/25 bg-[#140f16] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-pink-500/15 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-[11px] font-mono text-pink-300/80 flex items-center gap-1.5">
              <Calendar className="h-3 w-3 shrink-0" />
              {fmtDate(moment.date)}
            </p>
            <h2
              id="romance-timeline-moment-title"
              className="text-base font-semibold text-white mt-0.5 leading-snug"
            >
              {moment.title}
            </h2>
            <p className="text-[11px] text-white/40 mt-1 truncate">with {personName}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge variant="outline" className={`text-[10px] ${impactClass(moment.impact)}`}>
                {moment.impact}
              </Badge>
              {moment.location && (
                <Badge variant="outline" className="text-[10px] border-white/15 text-white/50">
                  <MapPin className="h-2.5 w-2.5 mr-1 inline" />
                  {moment.location}
                </Badge>
              )}
              {moment.sentiment != null && (
                <Badge variant="outline" className="text-[10px] border-white/15 text-white/45">
                  Warmth {Math.round(Math.abs(moment.sentiment) * 100)}%
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

        <div className="px-4 py-3.5 space-y-4">
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-white/40 mb-1.5 flex items-center gap-1.5">
              <Heart className="h-3 w-3 text-pink-400" />
              Summary
            </h3>
            <p className="text-sm text-white/75 leading-relaxed whitespace-pre-wrap">
              {moment.summary}
            </p>
          </div>

          {moment.related.length > 0 && (
            <div>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-white/40 mb-2 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-pink-400" />
                Connected lore
              </h3>
              <ul className="space-y-2">
                {moment.related.map((link) => {
                  const canOpenPerson = link.kind === 'person' && Boolean(link.characterId) && onOpenRelated;
                  const canJumpMoment = link.kind === 'moment' && onSelectRelatedMoment;
                  const clickable = canOpenPerson || canJumpMoment || (link.kind !== 'moment' && onOpenRelated);
                  return (
                    <li key={`${link.kind}-${link.id}`}>
                      <button
                        type="button"
                        disabled={!clickable}
                        onClick={() => {
                          if (link.kind === 'moment' && onSelectRelatedMoment) {
                            onSelectRelatedMoment(link.id);
                            return;
                          }
                          onOpenRelated?.(link);
                        }}
                        data-testid={`romance-moment-related-${link.kind}-${link.id}`}
                        className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${
                          clickable
                            ? 'border-pink-500/20 bg-pink-950/20 hover:bg-pink-950/35 cursor-pointer'
                            : 'border-white/8 bg-white/[0.03] cursor-default'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <Link2 className="h-3.5 w-3.5 text-pink-300/70 mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-white truncate">{link.label}</p>
                            {link.detail && (
                              <p className="text-[11px] text-white/45 mt-0.5 leading-snug">{link.detail}</p>
                            )}
                            <p className="text-[10px] uppercase tracking-wide text-white/30 mt-1">
                              {link.kind}
                              {canOpenPerson ? ' · open card' : ''}
                              {canJumpMoment ? ' · view moment' : ''}
                            </p>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-white/40 mb-2">
              Ask more in chat
            </h3>
            <div className="flex flex-col gap-1.5">
              {moment.followUpPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onContinueInChat(prompt)}
                  data-testid="romance-moment-followup"
                  className="text-left text-xs text-pink-100/80 rounded-lg border border-pink-500/15 bg-black/30 px-3 py-2 hover:bg-pink-950/30 hover:border-pink-500/30 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-pink-500/15 px-4 py-3.5 bg-black/35">
          <Button
            className="w-full h-10 bg-pink-500/25 border border-pink-400/35 text-pink-50 hover:bg-pink-500/35"
            onClick={() => onContinueInChat()}
            data-testid="romance-moment-continue-chat"
          >
            <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
            Continue in main chat
          </Button>
          <p className="text-[11px] text-white/40 text-center leading-relaxed">
            LoreBook will recount this moment, connect related people and milestones, and keep answering as you build on it.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
