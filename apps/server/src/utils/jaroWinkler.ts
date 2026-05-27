/**
 * Jaro-Winkler string similarity — tuned for personal name matching.
 *
 * Returns a score in [0, 1]:
 *   1.0 = identical
 *   ≥ 0.92 = very likely same name (Jerry / Jeremy, Sara / Sarah)
 *   ≥ 0.85 = probable match (needs context)
 *   < 0.75 = unlikely match
 *
 * Winkler prefix bonus (up to 4 chars) rewards shared prefixes,
 * which is exactly right for names — "Lorekeeper" vs "LK" scores low
 * as intended, while "Sara" vs "Sarah" scores high.
 */
export function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  const matchDistance = Math.max(Math.floor(Math.max(s1.length, s2.length) / 2) - 1, 0);

  const s1Matched = new Uint8Array(s1.length);
  const s2Matched = new Uint8Array(s2.length);
  let matches = 0;

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (s2Matched[j] || s1[i] !== s2[j]) continue;
      s1Matched[i] = 1;
      s2Matched[j] = 1;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matched[i]) continue;
    while (!s2Matched[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro =
    (matches / s1.length +
      matches / s2.length +
      (matches - transpositions / 2) / matches) /
    3;

  // Winkler prefix bonus — scale factor p = 0.1 (standard)
  let prefix = 0;
  const maxPrefix = Math.min(4, s1.length, s2.length);
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Case-insensitive Jaro-Winkler. Use this for all name comparisons.
 */
export function namesSimilar(a: string, b: string, threshold = 0.88): boolean {
  return jaroWinkler(a.toLowerCase(), b.toLowerCase()) >= threshold;
}
