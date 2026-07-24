/**
 * Client-side filters for narrative anchors vs community clusters.
 */

const PLACEHOLDER_TITLE =
  /^(family|work|social|goth|ska|school|other|general|life)\s+(period|community|chapter|phase|era|group)$/i;

export function isPlaceholderAnchorTitle(title: string): boolean {
  const t = (title ?? '').trim();
  return !t || PLACEHOLDER_TITLE.test(t) || (/\bcommunity$/i.test(t) && t.split(/\s+/).length <= 3);
}

export function isPrimaryNarrativeAnchor(anchor: {
  title: string;
  anchorType?: string;
  evidence?: Array<{ label?: string; source?: string }>;
  metadata?: Record<string, unknown> | null;
}): boolean {
  const meta = anchor.metadata ?? {};
  if (meta.anchor_book_visible === false) return false;
  if (meta.archived === true || meta.routed_to_community === true) return false;
  if (typeof meta.cluster_type === 'string' && meta.cluster_type !== 'NARRATIVE_ANCHOR') {
    return false;
  }

  // Membership-only community types should not appear as story chapters
  if (anchor.anchorType === 'community') {
    const labels = (anchor.evidence ?? []).map((e) => e.label ?? '');
    if (labels.length > 0 && labels.every((l) => /members?\s+share/i.test(l))) {
      return false;
    }
  }

  if (isPlaceholderAnchorTitle(anchor.title)) return false;
  return true;
}
