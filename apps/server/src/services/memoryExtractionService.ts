import crypto from 'crypto';
import { v4 as uuid } from 'uuid';

import { config } from '../config';
import { openai } from '../lib/openai';
import { logger } from '../logger';
import type {
  ConversationMessage,
  MemoryEntry,
  MemoryComponent,
  ExtractMemoryInput
} from '../types';

import { conversationService } from './conversationService';
import { embeddingService } from './embeddingService';
import { memoryDetectionCacheService } from './memoryDetectionCacheService';
import { memoryService } from './memoryService';
import { ruleBasedMemoryDetectionService } from './ruleBasedMemoryDetection';
import { supabaseAdmin } from './supabaseClient';
import { JOURNAL_COLS } from '../db/journalEntryColumns';

// Thrown when content is not memory-worthy — signals worker to mark 'skipped',
// not 'failed'. Skipped sessions are re-evaluated after 24h; failed ones count
// against the retry budget.
export class NotMemoryWorthyError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'NotMemoryWorthyError';
  }
}

// User messages that are purely about the app or the AI's capabilities.
// These should not become life memories.
const META_PATTERNS = [
  /\bdo you remember\b/i,
  /\bcan you remember\b/i,
  /\bwill you remember\b/i,
  /\bdid you save\b/i,
  /\bcan you recall\b/i,
  /\bwill this update\b/i,
  /\bremember this conversation\b/i,
  /\bremember what (i|we) (just |)talked about\b/i,
  /\bcharacter card\b/i,
  /\blocation card\b/i,
  /\btesting (the |this |)app\b/i,
  /\btesting (for |)new changes\b/i,
  /\bhow does this (app|work)\b/i,
  /\bwhat do you (know about me|remember about me)\b/i,
  /\bdo you know who i am\b/i,
  /\byou (don't|dont) already know\b/i,
  /\blore ?books? (not working|is broken)\b/i,
];

function isMetaMessage(content: string): boolean {
  return META_PATTERNS.some(p => p.test(content));
}

function contentHash(messages: ConversationMessage[]): string {
  const userText = messages
    .filter(m => m.role === 'user')
    .map(m => m.content.trim())
    .join('|');
  return crypto.createHash('sha256').update(userText).digest('hex').slice(0, 16);
}

class MemoryExtractionService {
  async extractMemory(input: ExtractMemoryInput): Promise<{
    journalEntry: MemoryEntry;
    components: MemoryComponent[];
    timelineLinks: any[];
    extractionConfidence: number;
  }> {
    const sessionData = await conversationService.getSessionWithMessages(
      input.sessionId,
      input.userId
    );

    if (!sessionData) {
      throw new Error('Session not found or access denied');
    }

    const { messages } = sessionData;

    // ── 1. Separate user messages from AI responses ──────────────────────────
    const userMessages = messages.filter(m => m.role === 'user');
    if (userMessages.length === 0) {
      throw new NotMemoryWorthyError('No user messages in session');
    }

    // ── 2. Meta-conversation filter ──────────────────────────────────────────
    // If every user message is about the app/AI rather than the user's life,
    // this session holds no memory-worthy content.
    const lifeMessages = userMessages.filter(m => !isMetaMessage(m.content));
    const metaRatio = 1 - lifeMessages.length / userMessages.length;

    if (lifeMessages.length === 0 || metaRatio > 0.85) {
      throw new NotMemoryWorthyError(
        `Session is ${Math.round(metaRatio * 100)}% meta-conversation — no life events to record`
      );
    }

    // ── 3. Deduplication check ───────────────────────────────────────────────
    // Prevent saving identical content twice (e.g. same metadata.messages in
    // multiple ghost sessions).
    const hash = contentHash(messages);
    const { data: existing } = await supabaseAdmin
      .from('journal_entries')
      .select('id')
      .eq('user_id', input.userId)
      .eq('metadata->>contentHash', hash)
      .limit(1);

    if (existing && existing.length > 0) {
      logger.info(
        { sessionId: input.sessionId, hash, existingId: existing[0].id },
        'Duplicate session content — returning existing journal entry'
      );
      // Return the existing entry rather than creating a duplicate.
      const { data: entryRow } = await supabaseAdmin
        .from('journal_entries')
        .select(JOURNAL_COLS)
        .eq('id', existing[0].id)
        .single();
      return {
        journalEntry: entryRow as MemoryEntry,
        components: [],
        timelineLinks: [],
        extractionConfidence: 0.5,
      };
    }

    // ── 4. Memory-worthiness gate ────────────────────────────────────────────
    const allContent = messages.map(m => m.content).join('\n');
    const lifeContent = lifeMessages.map(m => m.content).join('\n');

    let detection = await memoryDetectionCacheService.getCachedDetection(allContent)
      ?? await ruleBasedMemoryDetectionService.detectMemoryWorthy(allContent, messages.map(m => m.content));
    await memoryDetectionCacheService.cacheDetection(allContent, detection);

    // Re-run detection on life-only content if the full transcript failed the gate
    if (!detection.isMemoryWorthy) {
      const lifeDetection = await ruleBasedMemoryDetectionService.detectMemoryWorthy(
        lifeContent,
        lifeMessages.map(m => m.content)
      );
      if (!lifeDetection.isMemoryWorthy) {
        throw new NotMemoryWorthyError('Life content does not meet memory-worthiness threshold');
      }
      detection = lifeDetection;
    }

    // ── 5. LLM distillation — the core fix ──────────────────────────────────
    const { distilled, title, tags, emotionalTone } =
      await this.distillConversation(lifeMessages, input.sessionId);

    if (!distilled || distilled.trim().length < 10) {
      throw new NotMemoryWorthyError('LLM distillation produced no usable content');
    }

    // ── 6. Save journal entry ────────────────────────────────────────────────
    const journalEntry = await memoryService.saveEntry({
      userId: input.userId,
      content: distilled,
      summary: title,
      tags,
      mood: emotionalTone ?? null,
      source: 'chat',
      metadata: {
        sessionId: input.sessionId,
        contentHash: hash,
        messageCount: messages.length,
        lifeMessageCount: lifeMessages.length,
        metaRatio: Math.round(metaRatio * 100),
        extractionMethod: 'llm_distillation',
        detectionConfidence: detection.confidence,
      },
    });

    // ── 7. Extract structured components from distilled content ──────────────
    const components = await this.extractComponentsFromDistilled(
      distilled,
      journalEntry,
      detection
    );

    const savedComponents = await this.saveComponents(components);

    // Knowledge graph edges (fire-and-forget)
    const { knowledgeGraphService } = await import('./knowledgeGraphService');
    knowledgeGraphService
      .batchBuildEdges(savedComponents, input.userId)
      .catch(err => logger.debug({ err }, 'Knowledge graph edge build failed (non-critical)'));

    // Identity signals (fire-and-forget)
    this.triggerIdentityExtraction(input.userId, journalEntry, savedComponents).catch(err =>
      logger.debug({ err, entryId: journalEntry.id }, 'Identity extraction failed (non-critical)')
    );

    return {
      journalEntry,
      components: savedComponents,
      timelineLinks: [],
      extractionConfidence: detection.confidence,
    };
  }

  /**
   * Distill life-content user messages into a clean, factual narrative memory.
   * Returns the distilled text, a short title, semantic tags, and emotional tone.
   */
  private async distillConversation(
    lifeMessages: ConversationMessage[],
    sessionId: string
  ): Promise<{
    distilled: string;
    title: string;
    tags: string[];
    emotionalTone: string | null;
  }> {
    const userText = lifeMessages.map(m => m.content.trim()).join('\n\n');

    const systemPrompt = `You are a memory distillation engine for a personal memoir app.

Convert raw user messages from a chat conversation into a clean, factual journal memory.

RULES:
- Write in third person ("User went...", "User mentioned...", "User shared...")
- Only record facts the user explicitly stated — never invent or embellish
- Be specific: keep real names, places, dollar amounts, timeframes when the user stated them
- Preserve emotional tone without dramatization
- Write 2–5 sentences. No more.
- If the messages contain NO life events (only questions or testing), return exactly: EMPTY

Also return:
- title: A 5–10 word headline for this memory (e.g. "Costco trip with Abuela, $550 spent")
- tags: 3–7 lowercase semantic tags (e.g. family, finances, relationships, career)
- emotionalTone: one word for the user's dominant emotion (e.g. hopeful, hurt, proud) or null

Respond in JSON:
{
  "distilled": "...",
  "title": "...",
  "tags": ["...", "..."],
  "emotionalTone": "..." | null
}`;

    const userPrompt = `User messages to distill (session ${sessionId}):\n\n${userText.slice(0, 6000)}`;

    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });

      const raw = completion.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(raw) as {
        distilled?: string;
        title?: string;
        tags?: string[];
        emotionalTone?: string | null;
      };

      if (!parsed.distilled || parsed.distilled.trim() === 'EMPTY') {
        return { distilled: '', title: '', tags: [], emotionalTone: null };
      }

      return {
        distilled: parsed.distilled.trim(),
        title: (parsed.title ?? '').trim(),
        tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 8) : ['memory'],
        emotionalTone: parsed.emotionalTone ?? null,
      };
    } catch (err) {
      // Fallback: join life messages directly (raw but functional)
      logger.warn({ err, sessionId }, 'LLM distillation failed, falling back to raw join');
      return {
        distilled: lifeMessages.map(m => m.content.trim()).join('\n\n').slice(0, 4000),
        title: '',
        tags: ['memory'],
        emotionalTone: null,
      };
    }
  }

  /**
   * Extract structured memory components from the DISTILLED content.
   * Operates on clean narrative text, not raw transcripts.
   */
  private async extractComponentsFromDistilled(
    distilled: string,
    entry: MemoryEntry,
    detection: { detectedPatterns: string[]; confidence: number }
  ): Promise<Omit<MemoryComponent, 'id' | 'created_at' | 'updated_at'>[]> {
    const components: Omit<MemoryComponent, 'id' | 'created_at' | 'updated_at'>[] = [];
    const baseScore = Math.min(Math.round(detection.confidence * 10), 10);

    // Event detection — past-tense actions in the distilled narrative
    const eventMatches = distilled.match(/.{0,200}(?:went|visited|attended|met|saw|completed|finished|started|bought|spent|moved|joined|left|received|applied|interviewed).{0,200}/gi);
    if (eventMatches) {
      components.push({
        journal_entry_id: entry.id,
        component_type: 'event',
        text: eventMatches[0].trim().slice(0, 500),
        characters_involved: this.extractNamedEntities(distilled),
        location: this.extractFirstLocation(distilled),
        timestamp: entry.date,
        tags: [],
        importance_score: Math.min(baseScore + 1, 10),
        embedding: null,
        metadata: {},
      });
    }

    // Relationship component — if real people are named in distilled text
    const namedPeople = this.extractNamedEntities(distilled);
    if (namedPeople.length > 0 && detection.detectedPatterns.includes('relationship')) {
      components.push({
        journal_entry_id: entry.id,
        component_type: 'relationship_update',
        text: distilled.slice(0, 400),
        characters_involved: namedPeople,
        location: null,
        timestamp: entry.date,
        tags: [],
        importance_score: baseScore,
        embedding: null,
        metadata: {},
      });
    }

    // Reflection — emotional or introspective content
    if (detection.detectedPatterns.includes('emotional_weight') || detection.detectedPatterns.includes('reflection')) {
      components.push({
        journal_entry_id: entry.id,
        component_type: 'reflection',
        text: distilled.slice(0, 400),
        characters_involved: [],
        location: null,
        timestamp: entry.date,
        tags: [],
        importance_score: baseScore,
        embedding: null,
        metadata: {},
      });
    }

    // Default fallback — every entry gets at least one component
    if (components.length === 0) {
      components.push({
        journal_entry_id: entry.id,
        component_type: 'thought',
        text: distilled.slice(0, 500),
        characters_involved: this.extractNamedEntities(distilled),
        location: this.extractFirstLocation(distilled),
        timestamp: entry.date,
        tags: [],
        importance_score: Math.max(baseScore - 1, 1),
        embedding: null,
        metadata: {},
      });
    }

    return components;
  }

  /**
   * Extract proper names from distilled narrative (not raw transcripts).
   * Skips common English words, pronouns, and sentence starters.
   */
  private extractNamedEntities(text: string): string[] {
    const SKIP = new Set([
      'User', 'The', 'A', 'An', 'In', 'On', 'At', 'To', 'For', 'Of', 'With',
      'And', 'But', 'Or', 'So', 'Yet', 'That', 'This', 'It', 'He', 'She',
      'They', 'We', 'I', 'My', 'His', 'Her', 'Their', 'Our', 'Its',
      'Meanwhile', 'Hoping', 'Well', 'June', 'July', 'August',
    ]);

    const capitalised = text.match(/\b([A-Z][a-z]{1,}(?:\s+[A-Z][a-z]+)*)\b/g) ?? [];
    const names = new Set<string>();
    for (const name of capitalised) {
      if (!SKIP.has(name) && name.length >= 3 && name.length <= 40) {
        names.add(name);
      }
    }
    return Array.from(names).slice(0, 8);
  }

  /**
   * Extract the first location-like noun from distilled text.
   */
  private extractFirstLocation(text: string): string | null {
    const locationPattern = /\b(?:at|in|to|from)\s+([A-Z][a-z]+(?:'s\s+[A-Z][a-z]+|\s+[A-Z][a-z]+)*)\b/;
    const match = text.match(locationPattern);
    return match?.[1] ?? null;
  }

  private async triggerIdentityExtraction(
    userId: string,
    journalEntry: MemoryEntry,
    components: MemoryComponent[]
  ): Promise<void> {
    try {
      const { IdentitySignalExtractor } = await import('./identityCore/identitySignals');
      const signalExtractor = new IdentitySignalExtractor();
      const entryForExtraction = {
        id: journalEntry.id,
        text: journalEntry.content,
        timestamp: journalEntry.date,
      };
      const signals = await signalExtractor.extract([entryForExtraction]);
      if (signals.length > 0) {
        const { IdentityCoreEngine } = await import('./identityCore/identityCoreEngine');
        const identityEngine = new IdentityCoreEngine();
        await identityEngine.processFromEntry(userId, entryForExtraction, components);
      }
    } catch (error) {
      logger.debug({ error, entryId: journalEntry.id }, 'Identity extraction failed (non-blocking)');
    }
  }

  private async saveComponents(
    components: Omit<MemoryComponent, 'id' | 'created_at' | 'updated_at'>[]
  ): Promise<MemoryComponent[]> {
    const saved: MemoryComponent[] = [];
    for (const component of components) {
      let embedding: number[] | null = null;
      try {
        embedding = await embeddingService.embedText(component.text);
      } catch {
        // embedding is optional
      }
      const full: MemoryComponent = {
        ...component,
        id: uuid(),
        embedding,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabaseAdmin.from('memory_components').insert(full);
      if (error) {
        logger.error({ error, componentId: full.id }, 'Failed to save memory component');
        continue;
      }
      saved.push(full);
    }
    return saved;
  }
}

export const memoryExtractionService = new MemoryExtractionService();
