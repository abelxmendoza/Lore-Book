import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

// Load .env from project root
// From apps/server/src/config.ts, we need to go up 3 levels to reach root
const currentDir = path.dirname(fileURLToPath(import.meta.url)); // apps/server/src
const serverDir = path.dirname(currentDir); // apps/server
const appsDir = path.dirname(serverDir); // apps
const rootDir = path.dirname(appsDir); // root

// Determine which .env file to load based on API_ENV
const tempApiEnv = process.env.API_ENV || 'dev';
const envFileName = tempApiEnv === 'production' ? '.env.production' : 
                     tempApiEnv === 'staging' ? '.env.staging' : 
                     '.env.development';
const envPath = path.resolve(rootDir, envFileName);
const defaultEnvPath = path.resolve(rootDir, '.env');

// Try to load environment-specific file first, then fallback to .env
let result = dotenv.config({ path: envPath });
if (result.error) {
  console.warn(`⚠️  Failed to load ${envFileName}, trying .env`);
  result = dotenv.config({ path: defaultEnvPath });
  if (result.error) {
    console.error(`❌ Failed to load .env from ${defaultEnvPath}:`, result.error.message);
    // Try process.cwd() as fallback
    const fallbackPath = path.resolve(process.cwd(), '.env');
    const fallbackResult = dotenv.config({ path: fallbackPath });
    if (!fallbackResult.error) {
      console.warn(`✅ Loaded .env from fallback: ${fallbackPath}`);
    }
  } else {
    console.warn(`✅ Loaded .env from: ${defaultEnvPath}`);
  }
} else {
  console.warn(`✅ Loaded ${envFileName} from: ${envPath}`);
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
  stripeSecretKey?: string;
  stripePublishableKey?: string;
  stripeWebhookSecret?: string;
  subscriptionPriceId?: string;
  freeTierEntryLimit?: number;
  freeTierAiLimit?: number;
  apiEnv: 'dev' | 'staging' | 'production';
  enableExperimental: boolean;
  adminUserId?: string;
};

const apiEnv = (process.env.API_ENV ?? 'dev') as 'dev' | 'staging' | 'production';
const enableExperimental = process.env.ENABLE_EXPERIMENTAL === 'true';

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
  githubToken: process.env.GITHUB_TOKEN ?? process.env.GITHUB_API_TOKEN ?? '',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  subscriptionPriceId: process.env.SUBSCRIPTION_PRICE_ID ?? '',
  freeTierEntryLimit: Number(process.env.FREE_TIER_ENTRY_LIMIT ?? 50),
  freeTierAiLimit: Number(process.env.FREE_TIER_AI_LIMIT ?? 100),
  apiEnv,
  enableExperimental,
  adminUserId: process.env.ADMIN_USER_ID
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
