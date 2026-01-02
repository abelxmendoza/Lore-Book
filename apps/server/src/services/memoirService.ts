import OpenAI from 'openai';
import { v4 as uuid } from 'uuid';

import { config } from '../config';
import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';
import { memoirCacheService } from './memoirCacheService';

const openai = new OpenAI({ apiKey: config.openAiKey });

type MemoirSection = {
  id: string;
  title: string;
  content: string;
  order: number;
  parentId?: string;
  children?: MemoirSection[];
  focus?: string;
  period?: { from: string; to: string };
  lastUpdated?: string;
  corrections?: Array<{ date: string; reason: string; change: string }>;
};

type MemoirOutline = {
  id: string;
  title: string;
  sections: MemoirSection[];
  lastUpdated: string;
  autoUpdate: boolean;
  metadata?: {
    languageStyle?: string;
    originalDocument?: boolean;
  };
};

class MemoirService {
  async getOutline(userId: string): Promise<MemoirOutline> {
    // Try cached first
    const cached = await memoirCacheService.getCachedMemoir(userId);
    if (cached) {
      return cached;
    }

    const { data, error } = await supabaseAdmin
      .from('memoir_outlines')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      // Create default outline if none exists
      const defaultOutline: MemoirOutline = {
        id: uuid(),
        title: 'My Memoir',
        sections: [],
        lastUpdated: new Date().toISOString(),
        autoUpdate: true
      };
      await this.saveOutline(userId, defaultOutline);
      await memoirCacheService.cacheMemoir(userId, defaultOutline);
      return defaultOutline;
    }

    const outline = {
      id: data.id,
      title: data.title || 'My Memoir',
      sections: (data.sections as MemoirSection[]) || [],
      lastUpdated: data.updated_at || data.created_at,
      autoUpdate: data.auto_update ?? true,
      metadata: (data.metadata as { languageStyle?: string; originalDocument?: boolean }) || {}
    };

    await memoirCacheService.cacheMemoir(userId, outline);
    return outline;
  }

  async saveOutline(userId: string, outline: MemoirOutline): Promise<void> {
    const { error } = await supabaseAdmin
      .from('memoir_outlines')
      .upsert({
        id: outline.id,
        user_id: userId,
        title: outline.title,
        sections: outline.sections,
        auto_update: outline.autoUpdate,
        metadata: outline.metadata || {},
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id'
      });

    if (error) {
      logger.error({ error }, 'Failed to save memoir outline');
      throw error;
    }
  }

  async autoUpdateMemoir(userId: string): Promise<void> {
    const outline = await this.getOutline(userId);
    if (!outline.autoUpdate) return;

    // Get recent entries (last 24 hours)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const { data: recentEntries } = await supabaseAdmin
      .from('journal_entries')
      .select('*')
      .eq('user_id', userId)
      .gte('date', yesterday.toISOString())
      .order('date', { ascending: false })
      .limit(50);

    if (!recentEntries || recentEntries.length === 0) return;

    // If no sections exist, auto-generate outline from entries (like timeline)
    if (outline.sections.length === 0) {
      await this.autoGenerateOutlineFromEntries(userId, recentEntries);
      return;
    }

    // Check if memoir needs updating based on new information
    const needsUpdate = await this.checkNeedsUpdate(userId, outline, recentEntries);
    if (!needsUpdate) return;

    // Update relevant sections or create new ones
    await this.integrateNewInformation(userId, outline, recentEntries);
  }

  private async autoGenerateOutlineFromEntries(userId: string, entries: any[]): Promise<void> {
    // Group entries by date ranges (weekly chunks)
    const ranges: Array<{ from: string; to: string; entries: any[] }> = [];
    let currentRange: { from: string; to: string; entries: any[] } | null = null;

    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    entries.forEach(entry => {
      const entryDate = new Date(entry.date);
      if (!currentRange) {
        currentRange = { from: entry.date, to: entry.date, entries: [entry] };
      } else {
        const rangeStart = new Date(currentRange.from);
        const daysDiff = Math.abs((entryDate.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysDiff <= 7) {
          // Same week
          currentRange.entries.push(entry);
          if (entryDate < new Date(currentRange.from)) {
            currentRange.from = entry.date;
          }
          if (entryDate > new Date(currentRange.to)) {
            currentRange.to = entry.date;
          }
        } else {
          // New range
          ranges.push(currentRange);
          currentRange = { from: entry.date, to: entry.date, entries: [entry] };
        }
      }
    });

    if (currentRange) {
      ranges.push(currentRange);
    }

    // Generate sections for each range
    for (const range of ranges) {
      if (range.entries.length >= 3) {
        await this.generateSection(userId, {
          period: { from: range.from, to: range.to }
        });
      }
    }
  }

  private async checkNeedsUpdate(
    userId: string,
    outline: MemoirOutline,
    newEntries: any[]
  ): Promise<boolean> {
    if (outline.sections.length === 0) return true;

    // Check if new entries contain significant information
    const entryContent = newEntries
      .slice(0, 10)
      .map(e => e.summary || e.content)
      .join('\n');

    const completion = await openai.chat.completions.create({
      model: config.defaultModel,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: 'Analyze if these new journal entries contain significant information that should be added to or correct an existing memoir. Respond with "UPDATE_NEEDED" if yes, "NO_UPDATE" if no.'
        },
        {
          role: 'user',
          content: `New entries:\n${entryContent}\n\nExisting memoir sections: ${outline.sections.map(s => s.title).join(', ')}`
        }
      ]
    });

    const response = completion.choices[0]?.message?.content?.toUpperCase() || '';
    return response.includes('UPDATE_NEEDED');
  }

  private async integrateNewInformation(
    userId: string,
    outline: MemoirOutline,
    newEntries: any[]
  ): Promise<void> {
    const languageStyle = outline.metadata?.languageStyle;
    
    // Find sections that might need updating
    for (const section of outline.sections) {
      const relevantEntries = newEntries.filter(entry => {
        if (section.period) {
          const entryDate = new Date(entry.date);
          const from = new Date(section.period.from);
          const to = section.period.to ? new Date(section.period.to) : new Date();
          return entryDate >= from && entryDate <= to;
        }
        return true;
      });

      if (relevantEntries.length === 0) continue;

      // Check for corrections or updates needed
      const updateResult = await this.checkSectionCorrections(section, relevantEntries, languageStyle);
      if (updateResult.needsCorrection) {
        await this.applyCorrection(userId, outline, section, updateResult);
      }
    }

    // Check if new entries warrant a new section
    const shouldCreateSection = await this.shouldCreateNewSection(outline, newEntries);
    if (shouldCreateSection) {
      await this.generateSection(userId, {
        period: {
          from: newEntries[newEntries.length - 1].date,
          to: newEntries[0].date
        }
      });
    }

    outline.lastUpdated = new Date().toISOString();
    await this.saveOutline(userId, outline);
  }

  private async checkSectionCorrections(
    section: MemoirSection,
    newEntries: any[],
    languageStyle?: string
  ): Promise<{ needsCorrection: boolean; reason?: string; correctedContent?: string }> {
    const entryContent = newEntries
      .map(e => `Date: ${e.date}\n${e.summary || e.content}`)
      .join('\n---\n');

    const stylePrompt = languageStyle
      ? `\n\nIMPORTANT: Match the user's original writing style: ${languageStyle}. Use the same tone, formality level, and voice.`
      : '';

    const completion = await openai.chat.completions.create({
      model: config.defaultModel,
      temperature: 0.5,
      messages: [
        {
          role: 'system',
          content: `You are a truth-seeking memoir editor. Compare the existing memoir section with new journal entries. 
          
If the new entries:
1. Correct factual errors in the memoir
2. Add important missing details
3. Clarify ambiguous statements
4. Update outdated information

Then provide corrected content that integrates the new information truthfully and chronologically. Preserve the original writing style and voice.${stylePrompt} Otherwise, respond with "NO_CORRECTION_NEEDED".`
        },
        {
          role: 'user',
          content: `Existing section:\nTitle: ${section.title}\nContent: ${section.content}\n\nNew entries:\n${entryContent}\n\nDoes this need correction? If yes, provide corrected content.`
        }
      ]
    });

    const response = completion.choices[0]?.message?.content || '';
    
    if (response.includes('NO_CORRECTION_NEEDED') || response.length < 100) {
      return { needsCorrection: false };
    }

    return {
      needsCorrection: true,
      reason: 'New information requires correction or update',
      correctedContent: response
    };
  }

  private async applyCorrection(
    userId: string,
    outline: MemoirOutline,
    section: MemoirSection,
    correction: { reason: string; correctedContent?: string }
  ): Promise<void> {
    if (!correction.correctedContent) return;

    // Track corrections
    if (!section.corrections) {
      section.corrections = [];
    }
    section.corrections.push({
      date: new Date().toISOString(),
      reason: correction.reason,
      change: `Updated: ${correction.reason}`
    });

    // Update content
    section.content = correction.correctedContent;
    section.lastUpdated = new Date().toISOString();

    outline.lastUpdated = new Date().toISOString();
    await this.saveOutline(userId, outline);
  }

  private async shouldCreateNewSection(
    outline: MemoirOutline,
    newEntries: any[]
  ): Promise<boolean> {
    if (newEntries.length < 3) return false;

    const entryContent = newEntries
      .slice(0, 10)
      .map(e => e.summary || e.content)
      .join('\n');

    const completion = await openai.chat.completions.create({
      model: config.defaultModel,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: 'Determine if these entries represent a new significant period or theme that warrants a new memoir section. Respond with "NEW_SECTION" or "NO_NEW_SECTION".'
        },
        {
          role: 'user',
          content: `Entries:\n${entryContent}`
        }
      ]
    });

    const response = completion.choices[0]?.message?.content?.toUpperCase() || '';
    return response.includes('NEW_SECTION');
  }

  async generateSection(
    userId: string,
    options?: { focus?: string; period?: { from?: string; to?: string }; chapterId?: string }
  ): Promise<MemoirSection> {
    // Get relevant entries
    let query = supabaseAdmin
      .from('journal_entries')
      .select('*')
      .eq('user_id', userId);
    
    // If chapterId is provided, filter by chapter
    if (options?.chapterId) {
      query = query.eq('chapter_id', options.chapterId);
    }

    if (options?.period?.from) {
      query = query.gte('date', options.period.from);
    }
    if (options?.period?.to) {
      query = query.lte('date', options.period.to);
    }

    const { data: entriesData } = await query.order('date', { ascending: false }).limit(100);

    if (!entriesData || entriesData.length === 0) {
      throw new Error('Not enough entries to generate section');
    }

    const entries = entriesData.map((e: any) => ({
      date: e.date,
      content: e.content,
      summary: e.summary
    }));

    const content = entries
      .slice(0, 50)
      .map((e) => `Date: ${e.date}\n${e.summary || e.content}`)
      .join('\n---\n');

    const focusPrompt = options?.focus
      ? `Focus on: ${options.focus}\n\n`
      : '';

    // Get outline first for language style and order
    const outline = await this.getOutline(userId);
    const languageStyle = outline.metadata?.languageStyle;
    const stylePrompt = languageStyle
      ? `\n\nIMPORTANT: Match the user's original writing style: ${languageStyle}. Use the same tone, formality level, and voice.`
      : '';

    const completion = await openai.chat.completions.create({
      model: config.defaultModel,
      temperature: 0.8,
      messages: [
        {
          role: 'system',
          content:
            `You are writing a truthful, chronological memoir. Create a compelling section title (2-5 words) and write 3-5 paragraphs of reflective, personal narrative based on the journal entries. Write in first person, be reflective, capture the emotional journey, and always prioritize accuracy and truth. Organize chronologically.${stylePrompt}`
        },
        {
          role: 'user',
          content: `${focusPrompt}Journal entries:\n${content}\n\nGenerate a memoir section with a title and content:`
        }
      ]
    });

    const response = completion.choices[0]?.message?.content || '';
    const lines = response.split('\n');
    const title = lines[0].replace(/^#+\s*/, '').trim() || 'Untitled Section';
    const contentText = lines.slice(1).join('\n').trim() || response;

    const section: MemoirSection = {
      id: uuid(),
      title,
      content: contentText,
      order: outline.sections.length,
      focus: options?.focus,
      period: options?.period as { from: string; to: string } | undefined,
      lastUpdated: new Date().toISOString(),
      originalContent: contentText, // Store original AI-generated content
      isEdited: false
    };

    // Add to outline
    outline.sections.push(section);
    // Sort chronologically
    outline.sections.sort((a, b) => {
      const aDate = a.period?.from || '';
      const bDate = b.period?.from || '';
      return aDate.localeCompare(bDate);
    });
    outline.lastUpdated = new Date().toISOString();
    await this.saveOutline(userId, outline);

    return section;
  }

  async updateSection(
    userId: string,
    sectionId: string,
    updates: { title?: string; content?: string }
  ): Promise<void> {
    const outline = await this.getOutline(userId);
    const section = outline.sections.find(s => s.id === sectionId);
    if (!section) {
      throw new Error('Section not found');
    }

    if (updates.title) section.title = updates.title;
    if (updates.content) {
      // Preserve original content if this is the first edit
      if (!section.originalContent) {
        section.originalContent = section.content;
      }
      section.content = updates.content;
      section.isEdited = true;
    }
    section.lastUpdated = new Date().toISOString();

    outline.lastUpdated = new Date().toISOString();
    await this.saveOutline(userId, outline);
  }

  async chatEdit(
    userId: string,
    sectionId: string,
    focus: string,
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<{ answer: string; updatedContent?: string; driftWarning?: string }> {
    const outline = await this.getOutline(userId);
    const section = outline.sections.find(s => s.id === sectionId);
    if (!section) {
      throw new Error('Section not found');
    }

    // Get original context
    const originalContent = section.content;
    const originalFocus = section.focus || focus;

    // Get language style preference
    const languageStyle = outline.metadata?.languageStyle;
    const stylePrompt = languageStyle
      ? `\n\nIMPORTANT: Match the user's original writing style: ${languageStyle}. Use the same tone, formality level, and voice.`
      : '';

    // Build conversation context
    const systemPrompt = `You are helping edit a memoir section. The section focuses on: "${originalFocus}".

Original section content:
${originalContent}

Your role:
1. Understand what the user wants to change
2. Keep edits focused on the original topic (${originalFocus})
3. Detect if the user is drifting off-topic
4. Provide updated content that maintains coherence and stays on-topic
5. Always prioritize truth and accuracy - correct any factual errors
6. Maintain chronological order
7. Preserve the original writing style and voice${stylePrompt}

When the user asks to update/edit the content:
- If the request stays on-topic, provide the updated content directly in your response
- If the request drifts off-topic, explain why and suggest creating a new section instead
- Always maintain the memoir's reflective, personal tone
- Ensure chronological accuracy
- Match the user's original writing style

Format your response as natural conversation. If providing updated content, include it naturally in your response.`;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history.map(msg => ({
        role: msg.role,
        content: msg.content
      })) as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      { role: 'user', content: message }
    ];

    const completion = await openai.chat.completions.create({
      model: config.defaultModel,
      temperature: 0.7,
      messages
    });

    const response = completion.choices[0]?.message?.content || '';

    // Check for drift
    const driftCheck = await openai.chat.completions.create({
      model: config.defaultModel,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: `Analyze if the following edit request drifts from the original focus: "${originalFocus}". Respond with "DRIFT" if it significantly changes the topic, or "ON_TRACK" if it stays relevant.`
        },
        {
          role: 'user',
          content: `User request: ${message}\nOriginal focus: ${originalFocus}`
        }
      ]
    });

    const driftResult = driftCheck.choices[0]?.message?.content?.toUpperCase() || '';
    const hasDrift = driftResult.includes('DRIFT') && !driftResult.includes('ON_TRACK');

    // Extract updated content if provided
    let updatedContent: string | undefined;
    let answer = response;
    let driftWarning: string | undefined;

    if (hasDrift) {
      driftWarning = 'Warning: This edit may drift from the original focus. Consider creating a new section instead.';
    }

    // Try to extract updated content from response
    const codeBlockMatch = response.match(/```[\s\S]*?```/);
    const contentMatch = response.match(/UPDATED_CONTENT:\s*([\s\S]*?)(?=\n\n|$)/i);
    
    if (contentMatch) {
      updatedContent = contentMatch[1].trim();
      answer = response.replace(/UPDATED_CONTENT:[\s\S]*/i, '').trim();
    } else if (codeBlockMatch) {
      updatedContent = codeBlockMatch[0].replace(/```/g, '').trim();
      answer = response.replace(codeBlockMatch[0], '').trim();
    } else if (!hasDrift && response.length > 200 && (message.toLowerCase().includes('update') || message.toLowerCase().includes('change') || message.toLowerCase().includes('edit'))) {
      updatedContent = response;
    }

    return {
      answer: answer || 'I understand. How would you like to proceed?',
      updatedContent,
      driftWarning
    };
  }

  async generateFullMemoir(userId: string, options?: { focus?: string; period?: { from?: string; to?: string } }): Promise<string> {
    const { data: entriesData } = await supabaseAdmin
      .from('journal_entries')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: true })
      .limit(200);

    if (!entriesData || entriesData.length === 0) {
      return 'Not enough memories yet to generate a memoir. Keep journaling!';
    }

    const entries = entriesData.map((e: any) => ({
      date: e.date,
      content: e.content,
      summary: e.summary
    }));

    const content = entries
      .map((e) => `Date: ${e.date}\n${e.summary || e.content}`)
      .join('\n---\n');

    // Get language style preference
    const outline = await this.getOutline(userId);
    const languageStyle = outline.metadata?.languageStyle;
    const stylePrompt = languageStyle
      ? `\n\nIMPORTANT: Match the user's original writing style: ${languageStyle}. Use the same tone, formality level, and voice.`
      : '';

    const prompt = options?.focus
      ? `Write a memoir chapter focusing on: ${options.focus}\n\nMemories:\n${content}`
      : `Write a comprehensive memoir based on these journal entries. Capture the essence, growth, and key moments chronologically. Make it personal, reflective, and truthful. Write 5-8 paragraphs.\n\nMemories:\n${content}`;

    const completion = await openai.chat.completions.create({
      model: config.defaultModel,
      temperature: 0.8,
      messages: [
        {
          role: 'system',
          content:
            `You are a memoir writer. Write in first person, be reflective and personal. Capture the emotional journey, key moments, and growth chronologically. Always prioritize truth and accuracy. Write 5-8 paragraphs.${stylePrompt}`
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    return completion.choices[0]?.message?.content || 'Unable to generate memoir at this time.';
  }
}

export const memoirService = new MemoirService();
