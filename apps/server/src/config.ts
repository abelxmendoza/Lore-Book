import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

// Load .env from project root
// From apps/server/src/config.ts, we need to go up 3 levels to reach root
const currentDir = path.dirname(fileURLToPath(import.meta.url)); // apps/server/src
const serverDir = path.dirname(currentDir); // apps/server
const appsDir = path.dirname(serverDir); // apps
const rootDir = path.dirname(appsDir); // root
const envPath = path.resolve(rootDir, '.env');

const result = dotenv.config({ path: envPath });
if (result.error) {
  console.error(`❌ Failed to load .env from ${envPath}:`, result.error.message);
  // Try process.cwd() as fallback
  const fallbackPath = path.resolve(process.cwd(), '.env');
  const fallbackResult = dotenv.config({ path: fallbackPath });
  if (!fallbackResult.error) {
    console.log(`✅ Loaded .env from fallback: ${fallbackPath}`);
  }
} else {
  console.log(`✅ Loaded .env from: ${envPath}`);
}

type EnvConfig = {
  port: number;
  openAiKey: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  defaultModel: string;
  embeddingModel: string;
  xBearerToken?: string;
  microsoftClientId?: string;
  microsoftClientSecret?: string;
  microsoftTenantId?: string;
  microsoftRedirectUri?: string;
  encryptionSalt?: string;
  githubToken?: string;
};

export const config: EnvConfig = {
  port: Number(process.env.PORT ?? 4000),
  openAiKey: process.env.OPENAI_API_KEY ?? '',
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  defaultModel: process.env.OPENAI_API_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  embeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
  xBearerToken: process.env.X_API_BEARER_TOKEN ?? process.env.TWITTER_BEARER_TOKEN ?? '',
  microsoftClientId: process.env.MICROSOFT_CLIENT_ID ?? '',
  microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? '',
  microsoftTenantId: process.env.MICROSOFT_TENANT_ID ?? 'common',
  microsoftRedirectUri: process.env.MICROSOFT_REDIRECT_URI ?? '',
  encryptionSalt: process.env.ENCRYPTION_SALT ?? '',
  githubToken: process.env.GITHUB_TOKEN ?? process.env.GITHUB_API_TOKEN ?? ''
};

export const assertConfig = () => {
  const required: (keyof EnvConfig)[] = [
    'openAiKey',
    'supabaseUrl',
    'supabaseAnonKey',
    'supabaseServiceRoleKey'
  ];

  const missing = required.filter((key) => {
    const value = config[key];
    // Check for placeholder values
    if (typeof value === 'string') {
      return !value || 
             value === 'service-role-key' || 
             value === 'sk-xxx' || 
             value.startsWith('your-') ||
             value.includes('placeholder');
    }
    return !value;
  });
  
  if (missing.length) {
    console.error(`\n⚠️  Missing or placeholder environment variables: ${missing.join(', ')}`);
    console.error('⚠️  Backend will start but authentication and API features will not work.');
    console.error('\n📝 To fix:');
    console.error('   1. Get your Supabase Service Role Key from: https://supabase.com/dashboard/project/jawzxiiwfagliloxnnkc/settings/api');
    console.error('   2. Get your OpenAI API Key from: https://platform.openai.com/api-keys');
    console.error('   3. Update your .env file with the real values\n');
    // Don't throw - allow server to start for development
  }
};
