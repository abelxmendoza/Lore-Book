import type { TimelineResponse } from '../../api/timeline';

export const TimelineDriftTag = ({ alert }: { alert: TimelineResponse['driftAlerts'][number] }) => (
  <span
    className="rounded-full border border-secondary/60 px-3 py-1 text-xs uppercase tracking-wide text-secondary"
    title={alert.message}
  >
    Drift: {alert.severity}
  </span>
);
