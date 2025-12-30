import type { MemoryContext } from './chatTypes';

/**
 * Memory Context Builder
 * Formats memory context for LLM consumption
 */
export class MemoryContextBuilder {
  /**
   * Build context string from memory context
   */
  build(userMsg: string, ctx: MemoryContext): string {
    const entriesText =
      ctx.entries.length > 0
        ? ctx.entries
            .map((e) => `• ${e.date || e.timestamp || 'Unknown'}: ${e.content || e.text || ''}`)
            .join('\n')
        : 'No recent memories yet.';

    const identityText = ctx.identity && Object.keys(ctx.identity).length > 0
      ? JSON.stringify(ctx.identity, null, 2)
      : 'No identity profile yet.';

    const valuesText = ctx.values && Object.keys(ctx.values).length > 0
      ? JSON.stringify(ctx.values, null, 2)
      : 'No values tracked yet.';

    const goalsText = Array.isArray(ctx.goals) && ctx.goals.length > 0
      ? JSON.stringify(ctx.goals, null, 2)
      : 'No goals tracked yet.';

    const habitsText = Array.isArray(ctx.habits) && ctx.habits.length > 0
      ? JSON.stringify(ctx.habits, null, 2)
      : 'No habits tracked yet.';

    const relationshipsText = ctx.relationships && Object.keys(ctx.relationships).length > 0
      ? JSON.stringify(ctx.relationships, null, 2)
      : 'No relationship data yet.';

    const emotionalArcsText = ctx.emotionalArcs && Object.keys(ctx.emotionalArcs).length > 0
      ? JSON.stringify(ctx.emotionalArcs, null, 2)
      : 'No emotional arcs tracked yet.';

    const archetypesText = ctx.archetypes && Object.keys(ctx.archetypes).length > 0
      ? JSON.stringify(ctx.archetypes, null, 2)
      : 'No archetype profile yet.';

    const paracosmText = ctx.paracosm && Object.keys(ctx.paracosm).length > 0
      ? JSON.stringify(ctx.paracosm, null, 2)
      : 'No paracosm/imagined entities tracked yet.';

    const insightsText = ctx.insights && Object.keys(ctx.insights).length > 0
      ? JSON.stringify(ctx.insights, null, 2)
      : 'No insights available yet.';

    return `
You are Lore Keeper, an AI agent with persistent memory. 
Use ONLY the information below to understand the user's life:



=== RECENT MEMORIES ===

${entriesText}



=== IDENTITY CORE ===

${identityText}



=== VALUES ===

${valuesText}



=== GOALS ===

${goalsText}



=== HABITS ===

${habitsText}



=== RELATIONSHIPS ===

${relationshipsText}



=== EMOTIONAL ARCS ===

${emotionalArcsText}



=== ARCHETYPES ===

${archetypesText}



=== PARACOSM / IMAGINED ENTITIES ===

${paracosmText}



=== INSIGHTS FROM ALL ENGINES ===

${insightsText}



The user says: "${userMsg}"

Respond in the user's preferred tone:

- grounded, sharp, chill

- like a robotics homie who spars and codes

- direct and not fluffy
    `;
  }
}

