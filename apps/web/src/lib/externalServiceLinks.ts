/**
 * Canonical external dashboard links for third-party services used by LoreBook.
 * Project-specific paths are derived from env where possible.
 */

export type ExternalServiceLink = {
  label: string;
  href: string;
  hint?: string;
};

export type ExternalService = {
  id: string;
  name: string;
  summary: string;
  manageLabel: string;
  primaryHref: string;
  links: ExternalServiceLink[];
  accent: 'emerald' | 'violet' | 'sky' | 'amber' | 'rose' | 'orange' | 'slate' | 'indigo';
};

const SUPABASE_PROJECT_REF = resolveSupabaseProjectRef();
const VERCEL_TEAM = 'abel-mendozas-projects';
const VERCEL_PROJECT = 'lore-keeper-web-w75p';
const RAILWAY_SERVICE_URL = 'https://lore-book-production.up.railway.app';
const APP_URL = import.meta.env.VITE_APP_URL || 'https://lorebookai.com';
const GITHUB_REPO = 'https://github.com/abelxmendoza/Lore-Book';

function resolveSupabaseProjectRef(): string {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (anonKey) {
    try {
      const payload = JSON.parse(atob(anonKey.split('.')[1] ?? '')) as { ref?: string };
      if (payload.ref) return payload.ref;
    } catch {
      // fall through
    }
  }
  return 'cshtthzpgkmrbcsfghyq';
}

function supabase(path: string): string {
  return `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}${path}`;
}

function vercel(path: string): string {
  return `https://vercel.com/${VERCEL_TEAM}/${VERCEL_PROJECT}${path}`;
}

export const EXTERNAL_SERVICES: ExternalService[] = [
  {
    id: 'supabase',
    name: 'Supabase',
    summary: 'Postgres database, auth (Google OAuth + email), storage, and RLS policies.',
    manageLabel: 'Open Supabase project',
    primaryHref: supabase(''),
    accent: 'emerald',
    links: [
      { label: 'Table editor', href: supabase('/editor'), hint: 'Browse and edit rows' },
      { label: 'SQL editor', href: supabase('/sql/new'), hint: 'Run migrations and ad-hoc queries' },
      { label: 'Authentication', href: supabase('/auth/users'), hint: 'Users, providers, and sessions' },
      { label: 'Auth providers', href: supabase('/auth/providers'), hint: 'Google OAuth and email settings' },
      { label: 'API keys', href: supabase('/settings/api'), hint: 'Anon and service role keys' },
      { label: 'Database settings', href: supabase('/settings/database'), hint: 'Connection strings and pooler' },
      { label: 'Storage', href: supabase('/storage/buckets'), hint: 'File buckets and policies' },
      { label: 'Edge Functions', href: supabase('/functions'), hint: 'Serverless functions' },
      { label: 'Logs', href: supabase('/logs/explorer'), hint: 'API, auth, and Postgres logs' },
    ],
  },
  {
    id: 'railway',
    name: 'Railway',
    summary: 'Express API server — env vars, deploys, logs, and scaling.',
    manageLabel: 'Open Railway dashboard',
    primaryHref: 'https://railway.app/dashboard',
    accent: 'violet',
    links: [
      { label: 'Production API', href: RAILWAY_SERVICE_URL, hint: 'Live backend health check' },
      { label: 'API health', href: `${RAILWAY_SERVICE_URL}/api/health`, hint: 'Env and service status JSON' },
      { label: 'All projects', href: 'https://railway.app/dashboard', hint: 'Find lore-book-production service' },
      { label: 'Docs', href: 'https://docs.railway.com', hint: 'Deploy and env var reference' },
    ],
  },
  {
    id: 'vercel',
    name: 'Vercel',
    summary: 'Web app hosting — builds, domains, env vars, and /api proxy to Railway.',
    manageLabel: 'Open Vercel project',
    primaryHref: vercel(''),
    accent: 'sky',
    links: [
      { label: 'Deployments', href: vercel('/deployments'), hint: 'Build history and rollbacks' },
      { label: 'Environment variables', href: vercel('/settings/environment-variables'), hint: 'VITE_* and build config' },
      { label: 'Domains', href: vercel('/settings/domains'), hint: 'lorebookai.com and aliases' },
      { label: 'Logs', href: vercel('/logs'), hint: 'Runtime and build logs' },
      { label: 'Live site', href: APP_URL, hint: 'Production frontend' },
      { label: 'Git settings', href: vercel('/settings/git'), hint: 'GitHub deploy integration' },
    ],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    summary: 'Subscriptions, checkout, webhooks, and customer billing.',
    manageLabel: 'Open Stripe dashboard',
    primaryHref: 'https://dashboard.stripe.com',
    accent: 'indigo',
    links: [
      { label: 'Test mode', href: 'https://dashboard.stripe.com/test', hint: 'Sandbox billing' },
      { label: 'Live mode', href: 'https://dashboard.stripe.com', hint: 'Production billing' },
      { label: 'Products & prices', href: 'https://dashboard.stripe.com/products', hint: 'Subscription price IDs' },
      { label: 'Webhooks', href: 'https://dashboard.stripe.com/webhooks', hint: 'Endpoint secrets for Railway' },
      { label: 'API keys', href: 'https://dashboard.stripe.com/apikeys', hint: 'Secret and publishable keys' },
      { label: 'Customers', href: 'https://dashboard.stripe.com/customers', hint: 'Subscriber lookup' },
      { label: 'Subscriptions', href: 'https://dashboard.stripe.com/subscriptions', hint: 'Active and canceled plans' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    summary: 'Chat, extraction, embeddings, and platform API usage.',
    manageLabel: 'Open OpenAI platform',
    primaryHref: 'https://platform.openai.com',
    accent: 'emerald',
    links: [
      { label: 'API keys', href: 'https://platform.openai.com/api-keys', hint: 'OPENAI_API_KEY management' },
      { label: 'Usage', href: 'https://platform.openai.com/usage', hint: 'Token spend and limits' },
      { label: 'Billing', href: 'https://platform.openai.com/settings/organization/billing', hint: 'Payment method and invoices' },
      { label: 'Rate limits', href: 'https://platform.openai.com/settings/organization/limits', hint: 'RPM/TPM caps' },
      { label: 'Storage / vector stores', href: 'https://platform.openai.com/storage', hint: 'Vector store files' },
      { label: 'Docs', href: 'https://platform.openai.com/docs', hint: 'Responses API and models' },
    ],
  },
  {
    id: 'google',
    name: 'Google Cloud',
    summary: 'Google OAuth sign-in and Places / Maps APIs (if enabled).',
    manageLabel: 'Open Google Cloud Console',
    primaryHref: 'https://console.cloud.google.com',
    accent: 'amber',
    links: [
      { label: 'OAuth consent screen', href: 'https://console.cloud.google.com/apis/credentials/consent', hint: 'App name, scopes, and publishing status' },
      { label: 'Credentials', href: 'https://console.cloud.google.com/apis/credentials', hint: 'OAuth client IDs for Supabase' },
      { label: 'Enabled APIs', href: 'https://console.cloud.google.com/apis/dashboard', hint: 'Places, Maps, and other APIs' },
      { label: 'Places API', href: 'https://console.cloud.google.com/marketplace/product/google/places-backend.googleapis.com', hint: 'Enable and manage Places API' },
      { label: 'Maps Platform', href: 'https://console.cloud.google.com/google/maps-apis', hint: 'Maps, geocoding, and billing' },
      { label: 'Billing', href: 'https://console.cloud.google.com/billing', hint: 'GCP project billing account' },
    ],
  },
  {
    id: 'sentry',
    name: 'Sentry',
    summary: 'Frontend error tracking and performance monitoring.',
    manageLabel: 'Open Sentry',
    primaryHref: 'https://sentry.io',
    accent: 'rose',
    links: [
      { label: 'Issues', href: 'https://sentry.io/issues/', hint: 'Production exceptions' },
      { label: 'Performance', href: 'https://sentry.io/performance/', hint: 'Transaction traces' },
      { label: 'Replays', href: 'https://sentry.io/replays/', hint: 'Session replay on errors' },
      { label: 'Project settings', href: 'https://sentry.io/settings/projects/', hint: 'DSN and alert rules' },
    ],
  },
  {
    id: 'posthog',
    name: 'PostHog',
    summary: 'Product analytics and feature usage (when VITE_POSTHOG_KEY is set).',
    manageLabel: 'Open PostHog',
    primaryHref: 'https://us.posthog.com',
    accent: 'orange',
    links: [
      { label: 'Dashboards', href: 'https://us.posthog.com/dashboard', hint: 'Analytics overview' },
      { label: 'Events', href: 'https://us.posthog.com/events', hint: 'Raw event stream' },
      { label: 'Feature flags', href: 'https://us.posthog.com/feature_flags', hint: 'Remote flag toggles' },
      { label: 'Project settings', href: 'https://us.posthog.com/project/settings', hint: 'API key and ingestion' },
    ],
  },
  {
    id: 'github',
    name: 'GitHub',
    summary: 'Source repo, Actions CI, and deploy webhooks to Vercel/Railway.',
    manageLabel: 'Open repository',
    primaryHref: GITHUB_REPO,
    accent: 'slate',
    links: [
      { label: 'Actions', href: `${GITHUB_REPO}/actions`, hint: 'CI workflow runs' },
      { label: 'Deployments', href: `${GITHUB_REPO}/deployments`, hint: 'Vercel/Railway deploy history' },
      { label: 'Settings → Webhooks', href: `${GITHUB_REPO}/settings/hooks`, hint: 'Vercel deploy hooks' },
      { label: 'Pull requests', href: `${GITHUB_REPO}/pulls`, hint: 'Open and merged PRs' },
      { label: 'Issues', href: `${GITHUB_REPO}/issues`, hint: 'Bug and task tracking' },
    ],
  },
];

export function getExternalService(id: string): ExternalService | undefined {
  return EXTERNAL_SERVICES.find((s) => s.id === id);
}
