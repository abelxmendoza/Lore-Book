/**
 * Sprint AI — Verified memory claims (Phase AI-4)
 *
 * Forbidden unverified success language in recall/diagnostic paths.
 */

export const FORBIDDEN_UNVERIFIED_CLAIMS = [
  /i'?ve captured/i,
  /i'?ve saved/i,
  /i'?ve recorded/i,
  /i'?ll remember/i,
  /i'?ve added this to your lore/i,
  /captured everything/i,
  /goes into your lore/i,
  /my record.{0,20}thin/i,
  /tell me now and it goes/i,
];

export const INGESTION_ACK_GUIDANCE = `
Respond warmly in 1-2 sentences reflecting something specific from what they shared.
Do NOT claim the memory is saved, captured, or recorded — extraction runs asynchronously in the background.
You may say you heard them or that you're noting it, but never confirm storage until verified.
Avoid therapist-style reflective questions unless genuinely needed for one missing detail.
`.trim();

export const INGESTION_ACK_FALLBACK =
  "I heard you — I'm holding onto what you shared while the system processes it in the background.";

export function isMultiTransitionLifeUpdate(text: string): boolean {
  const signals = text.match(
    /\b(?:interview(?:ed)?|rejected|accepted|hired|fired|laid off|unemployed|started|stopped|left|joined|completed|passed|failed|currently|right now|no longer|still|continuing|focused on)\b/gi,
  );
  return text.length >= 180 && (signals?.length ?? 0) >= 2;
}

export const LIFE_UPDATE_REFLECTION_GUIDANCE = `
This is a multi-part life update, not a request for a generic acknowledgment.
In 2-4 concise sentences, reflect the concrete state changes: what finished, its
outcome, what remains active or upcoming, and any continuing situation. Preserve
names and stated roles exactly. Do not invent causes, feelings, or relationships.
Do not claim storage succeeded; background extraction is still asynchronous.
`.trim();

export const VERIFIED_SILENCE_FALLBACK =
  'Nothing verified on record for that yet. Share it here and extraction will pick it up in the background.';

export function containsUnverifiedClaim(text: string): boolean {
  return FORBIDDEN_UNVERIFIED_CLAIMS.some((re) => re.test(text));
}
