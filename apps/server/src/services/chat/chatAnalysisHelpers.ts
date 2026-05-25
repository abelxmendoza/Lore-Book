import { logger } from '../../logger';
import { autopilotService } from '../autopilotService';
import type { ChatSource } from '../omegaChatService';

export async function checkContinuity(
  userId: string,
  message: string,
  extractedDates: Array<{ date: string; context: string; precision?: string; confidence?: number }>,
  orchestratorSummary: any
): Promise<string[]> {
  const warnings: string[] = [];

  try {
    const continuity = orchestratorSummary?.continuity;
    if (continuity?.conflicts && continuity.conflicts.length > 0) {
      continuity.conflicts.forEach((conflict: any) => {
        warnings.push(`Continuity issue: ${conflict.description || conflict.detail || 'Potential conflict detected'}`);
      });
    }

    const recentEntries = (orchestratorSummary?.timeline?.events || []).slice(0, 50);
    for (const dateInfo of extractedDates) {
      try {
        const date = new Date(dateInfo.date);
        if (isNaN(date.getTime())) continue;

        const conflictingEntries = recentEntries.filter((entry: any) => {
          try {
            const entryDate = new Date(entry.date);
            if (isNaN(entryDate.getTime())) return false;
            const daysDiff = Math.abs((date.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
            return daysDiff < 1 && entry.content?.toLowerCase().includes(dateInfo.context.toLowerCase());
          } catch {
            return false;
          }
        });

        if (conflictingEntries.length > 0) {
          warnings.push(`Potential conflict: ${dateInfo.context} on ${dateInfo.date} may overlap with existing entries`);
        }
      } catch (error) {
        logger.debug({ error, dateInfo }, 'Failed to check date conflict');
      }
    }
  } catch (error) {
    logger.warn({ error }, 'Failed to check continuity, continuing without warnings');
  }

  return warnings;
}

export async function findConnections(
  userId: string,
  message: string,
  orchestratorSummary: any,
  hqiResults: any[],
  sources: ChatSource[]
): Promise<string[]> {
  const connections: string[] = [];

  if (hqiResults.length > 0) {
    connections.push(`Found ${hqiResults.length} semantically related memories via HQI`);
  }

  const mentionedCharacters = orchestratorSummary.characters.filter((char: any) =>
    message.toLowerCase().includes((char.character.name || '').toLowerCase())
  );
  if (mentionedCharacters.length > 0) {
    connections.push(`Mentioned ${mentionedCharacters.length} character${mentionedCharacters.length > 1 ? 's' : ''}: ${mentionedCharacters.map((c: any) => c.character.name).join(', ')}`);
  }

  const fabricSources = sources.filter(s => s.type === 'fabric');
  if (fabricSources.length > 0) {
    connections.push(`Found ${fabricSources.length} related memories through Memory Fabric`);
  }

  const chapters = orchestratorSummary.timeline.arcs || [];
  if (chapters.length > 0) {
    const relevantChapters = chapters.filter((ch: any) =>
      message.toLowerCase().includes((ch.title || '').toLowerCase())
    );
    if (relevantChapters.length > 0) {
      connections.push(`Related to ${relevantChapters.length} chapter${relevantChapters.length > 1 ? 's' : ''}: ${relevantChapters.map((c: any) => c.title).join(', ')}`);
    }
  }

  return connections;
}

export function generateCitations(
  sources: ChatSource[],
  answer: string
): Array<{ text: string; sourceId: string; sourceType: string }> {
  const citations: Array<{ text: string; sourceId: string; sourceType: string }> = [];

  sources.slice(0, 10).forEach(source => {
    if (source.title && answer.toLowerCase().includes(source.title.toLowerCase().substring(0, 20))) {
      citations.push({ text: source.title, sourceId: source.id, sourceType: source.type });
    } else if (source.date) {
      const dateStr = new Date(source.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      if (answer.includes(dateStr)) {
        citations.push({ text: dateStr, sourceId: source.id, sourceType: source.type });
      }
    }
  });

  return citations;
}

export function detectArchivistIntent(message: string): boolean {
  const archivistKeywords = [
    'when did', 'when was', 'have i', 'did i', 'what did',
    'tell me about', 'show me', 'find', 'search', 'recall',
    'what happened', 'what was', 'when did i', 'how many times',
    'how often', 'last time', 'first time'
  ];
  const adviceKeywords = ['should', 'advice', 'recommend', 'suggest', 'what should'];

  const lowerMessage = message.toLowerCase();
  return archivistKeywords.some(k => lowerMessage.includes(k)) &&
         !adviceKeywords.some(k => lowerMessage.includes(k));
}

export function mightBeRefinement(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  const patterns = [
    /that'?s?\s+not\s+me\b/i,
    /that'?s?\s+wrong\b/i,
    /that'?s?\s+incorrect\b/i,
    /no,?\s+that'?s?\s+/i,
    /only\s+(when|in|at)\s+/i,
    /used\s+to\b/i,
    /not\s+anymore\b/i,
    /that\s+was\s+(only|just)\b/i,
    /not\s+really\b/i,
    /not\s+quite\b/i,
    /partially\s+(true|accurate)/i,
    /half\s+true\b/i,
    /only\s+(true|accurate)\s+/i,
    /that'?s?\s+more\s+about\b/i,
    /that'?s\s+(just|only)\s+at\s+work\b/i,
    /don'?t\s+think\s+that'?s\s+me\b/i,
    /wouldn'?t\s+say\s+that\b/i,
  ];
  return patterns.some((p) => p.test(normalized));
}

export function getRecentInsights(
  profile: any
): Array<{ id: string; category: string; text: string; confidence: number }> {
  const insights: Array<{ id: string; category: string; text: string; confidence: number }> = [];

  const categories: string[] = [
    'hopes', 'dreams', 'fears', 'strengths', 'weaknesses',
    'coreValues', 'personalityTraits', 'relationshipPatterns'
  ];

  for (const category of categories) {
    const items = (profile[category] || []) as any[];
    items.forEach((item: any, idx: number) => {
      if (item.confidence > 0.5) {
        insights.push({ id: `${category}-${idx}`, category, text: item.text, confidence: item.confidence });
      }
    });
  }

  if (profile.topSkills) {
    (profile.topSkills as any[]).forEach((skill: any, idx: number) => {
      if (skill.confidence > 0.5) {
        insights.push({ id: `topSkills-${idx}`, category: 'topSkills', text: skill.skill, confidence: skill.confidence });
      }
    });
  }

  return insights.sort((a, b) => b.confidence - a.confidence).slice(0, 10);
}

export async function getStrategicGuidance(userId: string, message: string): Promise<string | null> {
  try {
    const dailyPlan = await autopilotService.getDailyPlan(userId, 'json') as any;
    if (dailyPlan?.daily_plan?.description) {
      return `💡 **Today's Focus**: ${dailyPlan.daily_plan.description}`;
    }
  } catch (error) {
    logger.debug({ error }, 'Could not fetch autopilot guidance');
  }
  return null;
}
