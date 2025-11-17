import { ExternalEvent, ExternalSummary } from './types';

function buildSummary(event: ExternalEvent): string {
  const parts = [event.source.toUpperCase(), event.type];
  if (event.text) {
    parts.push(`- ${event.text}`);
  }
  return parts.join(' ');
}

export async function summarizeMilestonesBridge(milestones: ExternalEvent[]): Promise<ExternalSummary[]> {
  return milestones.map((milestone) => ({
    ...milestone,
    summary: buildSummary(milestone),
  }));
}
