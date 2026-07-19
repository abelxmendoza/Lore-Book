import type { RosterEntry } from '../api/threadRoster';

const ROLE_LABEL: Record<RosterEntry['role'], string> = {
  main: 'Main actors',
  supporting: 'Supporting',
  mentioned: 'Mentioned',
};

/** Dramatis personae for one conversation — pure markdown, provenance included. */
export function exportCastAsMarkdown(
  threadTitle: string,
  threadNumber: number | null,
  entries: RosterEntry[],
): string {
  const date = new Date().toISOString().split('T')[0];
  const active = entries.filter((e) => e.status === 'active');
  const excluded = entries.filter((e) => e.status === 'excluded');

  let md = `# Actors — ${threadTitle}\n\n`;
  md += `**Thread:** ${threadNumber != null ? `#${threadNumber}` : threadTitle}\n`;
  md += `**Exported:** ${date}\n`;
  md += `**Actors:** ${active.length}\n\n`;

  for (const role of ['main', 'supporting', 'mentioned'] as const) {
    const group = active.filter((e) => e.role === role);
    if (group.length === 0) continue;
    md += `## ${ROLE_LABEL[role]}\n\n`;
    for (const e of group) {
      const bits = [
        e.actorType ?? (e.kind !== 'character' ? e.kind : null),
        `${e.mentions} mention${e.mentions === 1 ? '' : 's'}`,
        e.firstSeenRef ? `first seen #${e.firstSeenRef}` : null,
        e.lastSeenRef && e.lastSeenRef !== e.firstSeenRef ? `last seen #${e.lastSeenRef}` : null,
        e.pinned ? 'pinned' : null,
      ].filter(Boolean);
      md += `- **${e.name}** — ${bits.join(' · ')}\n`;
    }
    md += '\n';
  }

  if (excluded.length > 0) {
    md += `## Excluded by you\n\n`;
    for (const e of excluded) md += `- ~~${e.name}~~\n`;
    md += '\n';
  }

  return md;
}
