import OpenAI from 'openai';

import { config } from '../config';

const openai = new OpenAI({ apiKey: config.openAiKey });

export class TagService {
  async suggestTags(content: string) {
    const completion = await openai.chat.completions.create({
      model: config.defaultModel,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: 'Extract up to 5 short lowercase tags from the text. Respond with comma separated values.'
        },
        { role: 'user', content }
      ]
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    return raw
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);
  }
}

export const tagService = new TagService();
