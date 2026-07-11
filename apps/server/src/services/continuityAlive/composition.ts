/**
 * Continuity composition helpers for system-prompt integration.
 */

export const CONTINUITY_COMPOSITION_RULES = `
CONTINUITY COMPOSITION RULES:
- Reference memories naturally in ordinary language.
- Never say "according to your stored memory", "database", or "artifact".
- Do not dump multiple unrelated memories.
- Prefer 0–3 continuity references maximum.
- Distinguish direct user statements from inference.
- Avoid overclaiming growth ("completely transformed", "healed", "always").
- Do not invent third-party emotions.
- Sensitive topics require clear relevance; otherwise omit.
- If no continuity candidate is selected, answer directly without forcing a callback.
`.trim();
