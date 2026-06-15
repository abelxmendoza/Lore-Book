/**
 * Sprint AK-2 — Memory evidence requirement
 *
 * Every memory answer must show Known / Unknown / Evidence counts.
 */

export type EvidenceCounts = {
  thread: number;
  memory: number;
  event: number;
  character: number;
};

export function formatEvidenceResponse(options: {
  known: string[];
  unknown: string[];
  evidence: EvidenceCounts;
  preamble?: string;
}): string {
  const lines: string[] = [];

  if (options.preamble?.trim()) {
    lines.push(options.preamble.trim(), '');
  }

  lines.push('**Known:**');
  if (options.known.length) {
    for (const item of options.known.slice(0, 10)) {
      lines.push(`• ${item}`);
    }
  } else {
    lines.push('• Nothing verified on record yet.');
  }

  lines.push('', '**Unknown:**');
  if (options.unknown.length) {
    for (const item of options.unknown.slice(0, 8)) {
      lines.push(`• ${item}`);
    }
  } else {
    lines.push('• —');
  }

  const e = options.evidence;
  lines.push(
    '',
    '**Evidence count:**',
    `• Thread: ${e.thread}`,
    `• Memory: ${e.memory}`,
    `• Event: ${e.event}`,
    `• Character: ${e.character}`
  );

  return lines.join('\n');
}

export function hasAnyEvidence(counts: EvidenceCounts): boolean {
  return counts.thread + counts.memory + counts.event + counts.character > 0;
}
