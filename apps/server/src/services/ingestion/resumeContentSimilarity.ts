const TOKEN_PATTERN = /[a-z0-9]+/g;

/**
 * Conservative near-duplicate detection for resumes. Word-frequency cosine
 * similarity ignores PDF/DOCX line-wrap and formatting differences while the
 * size-ratio guard prevents an updated resume with a meaningful new section
 * from being mistaken for an already-imported copy.
 */
export const RESUME_DUPLICATE_SIMILARITY_THRESHOLD = 0.94;
const MIN_RESUME_TOKENS = 25;
const MIN_SIZE_RATIO = 0.9;

function tokenCounts(text: string): Map<string, number> {
  const tokens = text.toLowerCase().match(TOKEN_PATTERN) ?? [];
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

export function resumeContentSimilarity(left: string, right: string): number {
  const leftCounts = tokenCounts(left);
  const rightCounts = tokenCounts(right);
  const leftSize = [...leftCounts.values()].reduce((sum, count) => sum + count, 0);
  const rightSize = [...rightCounts.values()].reduce((sum, count) => sum + count, 0);

  if (leftSize < MIN_RESUME_TOKENS || rightSize < MIN_RESUME_TOKENS) return 0;
  const sizeRatio = Math.min(leftSize, rightSize) / Math.max(leftSize, rightSize);
  if (sizeRatio < MIN_SIZE_RATIO) return 0;

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (const [token, count] of leftCounts) {
    dot += count * (rightCounts.get(token) ?? 0);
    leftMagnitude += count * count;
  }
  for (const count of rightCounts.values()) {
    rightMagnitude += count * count;
  }
  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

export function isNearDuplicateResume(left: string, right: string): boolean {
  return resumeContentSimilarity(left, right) >= RESUME_DUPLICATE_SIMILARITY_THRESHOLD;
}
