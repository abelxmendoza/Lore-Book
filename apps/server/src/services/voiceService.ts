import type { Express } from 'express';
import OpenAI from 'openai';

import { config } from '../config';
import { logger } from '../logger';

const openai = new OpenAI({ apiKey: config.openAiKey });

export type VoiceFormatting = {
  content: string;
  summary: string;
  tags: string[];
  mood?: string | null;
};

class VoiceService {
  async transcribe(file: Express.Multer.File): Promise<string> {
    try {
      const transcription = await openai.audio.transcriptions.create({
        file: { data: file.buffer, name: file.originalname || 'audio.wav', type: file.mimetype },
        model: 'whisper-1'
      });

      return transcription.text?.trim() ?? '';
    } catch (error) {
      logger.error({ error }, 'Failed to transcribe audio');
      throw error;
    }
  }

  async formatTranscript(transcript: string): Promise<VoiceFormatting> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Rewrite the following transcript into a clean journal entry. Return JSON with keys content, summary, mood, tags (array). Keep the users voice.'
          },
          { role: 'user', content: transcript }
        ]
      });

      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
      return {
        content: parsed.content ?? transcript,
        summary: parsed.summary ?? parsed.content ?? transcript,
        mood: parsed.mood ?? null,
        tags: Array.isArray(parsed.tags)
          ? parsed.tags
          : String(parsed.tags ?? '')
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean)
      };
    } catch (error) {
      logger.error({ error }, 'Failed to format transcript');
      return {
        content: transcript,
        summary: transcript.slice(0, 200),
        mood: null,
        tags: []
      };
    }
  }
}

export const voiceService = new VoiceService();
