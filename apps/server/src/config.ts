import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

type EnvConfig = {
  port: number;
  openAiKey: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  defaultModel: string;
  embeddingModel: string;
};

export const config: EnvConfig = {
  port: Number(process.env.PORT ?? 4000),
  openAiKey: process.env.OPENAI_API_KEY ?? '',
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  defaultModel: process.env.OPENAI_API_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  embeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small'
  defaultModel: process.env.OPENAI_API_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
};

export const assertConfig = () => {
  const required: (keyof EnvConfig)[] = [
    'openAiKey',
    'supabaseUrl',
    'supabaseAnonKey',
    'supabaseServiceRoleKey'
  ];

  const missing = required.filter((key) => !config[key]);
  if (missing.length) {
    throw new Error(`Missing env vars: ${missing.join(', ')}`);
  }
};
