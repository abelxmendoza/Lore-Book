import type { TimelineEvent } from '../../api/timeline';
import { Card, CardContent } from '../ui/card';

export const TimelineEventCard = ({ event }: { event: TimelineEvent }) => (
  <Card className="border-border/60 bg-accent/60 text-sm shadow-neon">
    <CardContent className="space-y-1 p-4">
      <div className="flex items-center justify-between text-xs uppercase text-cyan-200/70">
        <span>{event.layer}</span>
        <span>{new Date(event.timestamp).toLocaleString()}</span>
      </div>
      <div className="text-lg font-semibold text-foreground">{event.title}</div>
      {event.summary && <p className="text-white/70">{event.summary}</p>}
      {event.tags && event.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 text-[11px] text-white/60">
          {event.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-primary/60 px-2 py-0.5">
              #{tag}
            </span>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
);
