/**
 * Sprint AK-4 — Thread vs Lore distinction
 */

export function formatLabeledRecall(options: {
  currentThread?: string | null;
  storedLore?: string | null;
  recentEvents?: string | null;
}): string {
  const parts: string[] = [];

  if (options.currentThread?.trim()) {
    parts.push('**Current Thread:**', options.currentThread.trim(), '');
  }

  if (options.storedLore?.trim()) {
    parts.push('**Stored Lore:**', options.storedLore.trim(), '');
  }

  if (options.recentEvents?.trim()) {
    parts.push('**Recent Events:**', options.recentEvents.trim(), '');
  }

  if (!parts.length) {
    return 'No verified content in thread or stored lore yet.';
  }

  return parts.join('\n').trim();
}
