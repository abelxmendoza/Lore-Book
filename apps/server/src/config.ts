import path from 'node:path';

import dotenv from 'dotenv';

import { logger } from './logger';
import { resolveServerPort } from './config/serverPort';
import { getActiveSupabaseUrl } from './lib/supabaseUrlResolution';

// Load .env from project root (skip on hosted platforms — env vars are injected directly)
const currentDir = __dirname;
const serverDir = path.dirname(currentDir);
const appsDir = path.dirname(serverDir);
const rootDir = path.dirname(appsDir);

const isHostedRuntime = Boolean(
  process.env.RAILWAY_ENVIRONMENT ||
  process.env.VERCEL ||
  process.env.RENDER ||
  process.env.FLY_APP_NAME
);

if (!isHostedRuntime) {
  const tempApiEnv = process.env.API_ENV || 'dev';
  const envFileName = tempApiEnv === 'production' ? '.env.production'
    : tempApiEnv === 'staging' ? '.env.staging'
    : '.env.development';
  const envPath = path.resolve(rootDir, envFileName);
  const defaultEnvPath = path.resolve(rootDir, '.env');

  const tryLoad = (filePath: string, label: string): boolean => {
    const result = dotenv.config({ path: filePath });
    if (!result.error) {
      if (process.env.NODE_ENV !== 'production') {
        logger.info(`Loaded ${label} from ${filePath}`);
      }
      return true;
    }
    return false;
  };

  if (!tryLoad(envPath, envFileName)) {
    if (!tryLoad(defaultEnvPath, '.env')) {
      tryLoad(path.resolve(process.cwd(), '.env'), 'cwd .env');
    }
  }
}

type EnvConfig = {
  port: number;
  openAiKey: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  databaseUrl: string;
  supabasePoolerTransactionUrl?: string;
  supabasePoolerSessionUrl?: string;
  supabasePublishableKey?: string;
  supabaseSecretKey?: string;
  supabaseJwksUrl?: string;
  defaultModel: string;
  /** User-facing chat responses — flagship tier (quality is felt here) */
  chatModel: string;
  /** Opt-in bridge for the user-facing chat stream to use OpenAI Responses API. */
  useResponsesApiForChat: boolean;
  /** Extraction, facts, titles — mini tier (quality is remembered here) */
  extractionModel: string;
  /** High-volume classification/routing — nano tier */
  nanoModel: string;
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
  /** System Cognition / Agent Layer — runs LoreAgents after the interpretation pipeline. */
  enableLoreAgents: boolean;
  adminUserId?: string;
  adminEmail?: string;
  /** Canonical owner / founder account — never billed, never downgraded. */
  ownerUserId?: string;
  ownerEmail?: string;
  /** Developer test account — premium without billing. */
  developerEmail?: string;
};

const apiEnv = (process.env.API_ENV ?? 'dev') as 'dev' | 'staging' | 'production';
const enableExperimental = process.env.ENABLE_EXPERIMENTAL === 'true';

const portResolution = resolveServerPort(process.env);
for (const warning of portResolution.warnings) {
  logger.warn({ port: portResolution.port, source: portResolution.source }, warning);
}

export const config: EnvConfig = {
  port: portResolution.port,
  openAiKey: process.env.OPENAI_API_KEY ?? '',
  supabaseUrl: getActiveSupabaseUrl(),
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  databaseUrl: process.env.DATABASE_URL ?? '',
  supabasePoolerTransactionUrl: process.env.SUPABASE_POOLER_TRANSACTION_URL,
  supabasePoolerSessionUrl: process.env.SUPABASE_POOLER_SESSION_URL,
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
  supabaseJwksUrl: process.env.SUPABASE_JWKS_URL,
  defaultModel: process.env.OPENAI_API_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-5.5',
  chatModel: process.env.OPENAI_CHAT_MODEL ?? 'gpt-5.5',
  useResponsesApiForChat: process.env.OPENAI_CHAT_USE_RESPONSES === 'true',
  extractionModel: process.env.OPENAI_EXTRACTION_MODEL ?? 'gpt-5.4-mini',
  nanoModel: process.env.OPENAI_NANO_MODEL ?? 'gpt-5.4-nano',
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
  enableLoreAgents: process.env.ENABLE_LORE_AGENTS === 'true',
  adminUserId: process.env.ADMIN_USER_ID,
  adminEmail: process.env.ADMIN_EMAIL?.trim().toLowerCase(),
  ownerUserId: process.env.OWNER_USER_ID || process.env.FOUNDER_USER_ID,
  ownerEmail: (
    process.env.OWNER_EMAIL ||
    process.env.FOUNDER_EMAIL ||
    process.env.ADMIN_EMAIL ||
    ''
  ).trim().toLowerCase() || undefined,
  developerEmail: process.env.DEVELOPER_EMAIL?.trim().toLowerCase(),
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
    console.error('   1. Get your Supabase Service Role Key from: https://supabase.com/dashboard/project/cshtthzpgkmrbcsfghyq/settings/api');
    console.error('   2. Get your OpenAI API Key from: https://platform.openai.com/api-keys');
    console.error('   3. Update your .env file with the real values\n');
    // Don't throw - allow server to start for development
  }
};
