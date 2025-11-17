import { useEffect, useMemo, useState } from 'react';

import { fetchTimeline, type TimelineEvent, type TimelineResponse } from '../../api/timeline';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { TimelineArcRibbon } from './TimelineArcRibbon';
import { TimelineDriftTag } from './TimelineDriftTag';
import { TimelineEventCard } from './TimelineEventCard';
import { TimelineIdentityPulse } from './TimelineIdentityPulse';
import { TimelineLayerToggles } from './TimelineLayerToggles';
import { TimelineVoiceMemoMarker } from './TimelineVoiceMemoMarker';
import { useTimelineLayers } from '../../hooks/useTimelineLayers';

export const OmniTimelinePanel = () => {
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null);
  const { layers, toggleLayer, activeLayers } = useTimelineLayers();

  useEffect(() => {
    const load = async () => {
      const { timeline: data } = await fetchTimeline();
      setTimeline(data);
    };
    void load();
  }, []);

  const filteredEvents = useMemo(() => {
    if (!timeline) return [] as TimelineEvent[];
    return timeline.events.filter((evt) => activeLayers.includes(evt.layer));
  }, [activeLayers, timeline]);

  return (
    <Card className="neon-surface holo-border border-border text-foreground">
      <CardHeader className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-techno text-lg tracking-wide">Omni Timeline</CardTitle>
          <TimelineLayerToggles layers={layers} onToggle={toggleLayer} />
        </div>
        {timeline && <TimelineArcRibbon arcs={timeline.arcs} />}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredEvents.map((evt) => (
            <TimelineEventCard key={evt.id} event={evt} />
          ))}
        </div>
        {timeline?.driftAlerts?.length ? (
          <div className="flex flex-wrap gap-2">
            {timeline.driftAlerts.map((alert) => (
              <TimelineDriftTag key={alert.id} alert={alert} />
            ))}
          </div>
        ) : null}
        {activeLayers.includes('identity') && <TimelineIdentityPulse />}
        {activeLayers.includes('voiceMemos') && <TimelineVoiceMemoMarker count={filteredEvents.length} />}
      </CardContent>
    </Card>
  );
};
