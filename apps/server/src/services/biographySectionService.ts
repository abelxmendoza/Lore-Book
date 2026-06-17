/**
 * Manual biography section (chapter) editing — replaces memoir outline updates.
 */

import OpenAI from 'openai';

import { config } from '../config';
import { logger } from '../logger';

import { mainLifestoryService } from './mainLifestoryService';
import { supabaseAdmin } from './supabaseClient';

const openai = new OpenAI({ apiKey: config.openaiApiKey });

type BiographyRow = {
  id: string;
  biography_data: Record<string, unknown>;
};

async function getBiographyRow(userId: string, biographyId?: string): Promise<BiographyRow> {
  if (biographyId) {
    const { data, error } = await supabaseAdmin
      .from('biographies')
      .select('id, biography_data')
      .eq('user_id', userId)
      .eq('id', biographyId)
      .single();
    if (error || !data) {
      throw new Error('Biography not found');
    }
    return data as BiographyRow;
  }

  const row = await mainLifestoryService.getMainLifestory(userId);
  if (!row) {
    throw new Error('Biography not found');
  }
  return { id: row.id, biography_data: row.biography_data as Record<string, unknown> };
}

function findChapter(bioData: Record<string, unknown>, sectionId: string) {
  const chapters = (bioData.chapters as Array<Record<string, unknown>>) || [];
  const chapter = chapters.find((c) => c.id === sectionId);
  if (!chapter) {
    throw new Error('Section not found');
  }
  return { chapters, chapter };
}

export async function updateBiographySection(
  userId: string,
  sectionId: string,
  updates: { title?: string; content?: string },
  biographyId?: string
): Promise<void> {
  const row = await getBiographyRow(userId, biographyId);
  const bioData = { ...row.biography_data };
  const { chapter } = findChapter(bioData, sectionId);

  if (updates.title) {
    chapter.title = updates.title;
  }
  if (updates.content !== undefined) {
    if (!chapter.originalText) {
      chapter.originalText = chapter.text ?? '';
    }
    chapter.text = updates.content;
    chapter.isEdited = true;
  }
  chapter.lastUpdated = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from('biographies')
    .update({
      biography_data: bioData,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('user_id', userId);

  if (error) {
    logger.error({ err: error, userId, sectionId }, 'Failed to update biography section');
    throw error;
  }
}

export async function chatEditBiographySection(
  userId: string,
  sectionId: string,
  focus: string,
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  biographyId?: string
): Promise<{ answer: string; updatedContent?: string; driftWarning?: string }> {
  const row = await getBiographyRow(userId, biographyId);
  const { chapter } = findChapter(row.biography_data, sectionId);

  const originalContent = String(chapter.text ?? '');
  const originalFocus = focus || String(chapter.title ?? '');

  const systemPrompt = `You are helping edit a lorebook section. The section focuses on: "${originalFocus}".

Original section content:
${originalContent}

Your role:
1. Understand what the user wants to change
2. Provide helpful guidance and suggestions
3. When asked to rewrite or update, provide the full updated content prefixed with "UPDATED_CONTENT:" on its own line

Keep the user's voice and style. Be concise in your explanation.`;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })) as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    { role: 'user', content: message },
  ];

  const completion = await openai.chat.completions.create({
    model: config.defaultModel,
    temperature: 0.7,
    messages,
  });

  const response = completion.choices[0]?.message?.content || '';

  const driftCheck = await openai.chat.completions.create({
    model: config.defaultModel,
    temperature: 0.3,
    messages: [
      {
        role: 'system',
        content: `Analyze if the following edit request drifts from the original focus: "${originalFocus}". Respond with "DRIFT" if it significantly changes the topic, or "ON_TRACK" if it stays relevant.`,
      },
      {
        role: 'user',
        content: `User request: ${message}\nOriginal focus: ${originalFocus}`,
      },
    ],
  });

  const driftResult = driftCheck.choices[0]?.message?.content?.toUpperCase() || '';
  const hasDrift = driftResult.includes('DRIFT') && !driftResult.includes('ON_TRACK');

  let updatedContent: string | undefined;
  let answer = response;
  let driftWarning: string | undefined;

  if (hasDrift) {
    driftWarning =
      'Warning: This edit may drift from the original focus. Consider creating a new section instead.';
  }

  const contentMatch = response.match(/UPDATED_CONTENT:\s*([\s\S]*?)(?=\n\n|$)/i);
  const codeBlockMatch = response.match(/```[\s\S]*?```/);

  if (contentMatch) {
    updatedContent = contentMatch[1].trim();
    answer = response.replace(/UPDATED_CONTENT:[\s\S]*/i, '').trim();
  } else if (codeBlockMatch) {
    updatedContent = codeBlockMatch[0].replace(/```/g, '').trim();
    answer = response.replace(codeBlockMatch[0], '').trim();
  } else if (
    !hasDrift &&
    response.length > 200 &&
    (message.toLowerCase().includes('update') ||
      message.toLowerCase().includes('change') ||
      message.toLowerCase().includes('edit'))
  ) {
    updatedContent = response;
  }

  if (updatedContent) {
    await updateBiographySection(userId, sectionId, { content: updatedContent }, biographyId);
  }

  return {
    answer: answer || 'I understand. How would you like to proceed?',
    updatedContent,
    driftWarning,
  };
}
