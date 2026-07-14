/**
 * Biography subject invariant — the user's biography subject must ALWAYS be
 * the canonical self entity. No retrieved character (however frequently
 * mentioned) may become the biography subject. If canonical self is
 * unresolved, biography generation fails safely rather than picking someone.
 */

export type BiographySubjectCandidate = {
  id: string;
  name: string;
  metadata?: Record<string, unknown> | null;
};

export type BiographySubject = { id: string; name: string };

function isSelfFlagged(meta: Record<string, unknown>): boolean {
  return meta.is_self === true || meta.is_user === true;
}

function isDistinct(meta: Record<string, unknown>): boolean {
  return meta.distinct_from_self === true || meta.confirmed_distinct === true;
}

/**
 * Returns the canonical self among character rows, or null. Selection uses
 * ONLY identity flags — mention counts, retrieval rank, and prominence are
 * deliberately ignored (that heuristic is how a stage-name card once became
 * the biography subject).
 */
export function pickBiographySubject(rows: BiographySubjectCandidate[]): BiographySubject | null {
  const candidates = rows.filter((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    return isSelfFlagged(meta) && !isDistinct(meta);
  });
  if (candidates.length === 0) return null;

  // Prefer explicit is_self over is_user; then prefer a real_name-backed row.
  candidates.sort((a, b) => {
    const ma = (a.metadata ?? {}) as Record<string, unknown>;
    const mb = (b.metadata ?? {}) as Record<string, unknown>;
    const score = (m: Record<string, unknown>) =>
      (m.is_self === true ? 2 : 0) + (typeof m.real_name === 'string' && m.real_name.trim() ? 1 : 0);
    return score(mb) - score(ma);
  });

  const chosen = candidates[0];
  const meta = (chosen.metadata ?? {}) as Record<string, unknown>;
  const realName = typeof meta.real_name === 'string' && meta.real_name.trim() ? meta.real_name.trim() : null;
  return { id: chosen.id, name: realName ?? chosen.name };
}
