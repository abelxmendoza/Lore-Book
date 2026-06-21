import { useCallback } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { useAppSelector } from '../store/hooks';
import { selectAuthLoading, selectAuthSession, selectAuthUser } from '../store/selectors';
import {
  readSupabaseUrlEnvFromVite,
  resolveSupabaseUrl,
} from './supabaseUrlResolution';

type SupabaseConfig = {
  url: string;
  key: string;
};

let resolvedUrl = '';
let supabaseClient: SupabaseClient | null = null;
let initPromise: Promise<SupabaseClient> | null = null;

const getAnonKey = (): string => (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ?? '';

function validateConfig(url: string, key: string): { config: SupabaseConfig | null; issues: string[] } {
  const issues: string[] = [];

  if (!url) {
    issues.push('VITE_SUPABASE_URL is missing');
  } else if (url.includes('your-project')) {
    issues.push('VITE_SUPABASE_URL contains placeholder value');
  } else if (!url.startsWith('https://') && !url.startsWith('http://')) {
    issues.push('VITE_SUPABASE_URL is not a valid URL');
  }

  if (!key) {
    issues.push('VITE_SUPABASE_ANON_KEY is missing');
  } else if (key.includes('public-anon-key')) {
    issues.push('VITE_SUPABASE_ANON_KEY contains placeholder value');
  } else if (key.length < 50) {
    issues.push('VITE_SUPABASE_ANON_KEY appears to be too short (expected JWT token)');
  }

  const config: SupabaseConfig | null = issues.length === 0 && url && key ? { url, key } : null;
  return { config, issues };
}

function buildDebug(url: string, key: string, issues: string[]) {
  return {
    url: url || 'MISSING',
    keyPresent: !!key,
    issues,
    usedFallback: resolvedUrl !== '' && resolvedUrl !== (import.meta.env.VITE_SUPABASE_URL as string | undefined),
  };
}

let debug = buildDebug('', getAnonKey(), ['not-initialized']);

async function createConfiguredClient(): Promise<SupabaseClient> {
  const key = getAnonKey();
  const env = readSupabaseUrlEnvFromVite();
  const resolution = await resolveSupabaseUrl(env);
  resolvedUrl = resolution.url || env.primary.trim();

  const { config, issues } = validateConfig(resolvedUrl, key);
  debug = buildDebug(resolvedUrl, key, issues);

  if (import.meta.env.DEV && import.meta.env.MODE !== 'test') {
    console.log('[Supabase Config Debug]', {
      url: resolvedUrl ? `${resolvedUrl.substring(0, 40)}...` : 'MISSING',
      usedFallback: resolution.usedFallback,
      reason: resolution.reason,
      keyPresent: !!key,
    });
    if (issues.length > 0) {
      console.error('[Supabase Config] Configuration issues:', issues);
    }
    if (resolution.usedFallback) {
      console.warn(
        '[Supabase Config] Custom domain unreachable — using *.supabase.co fallback until it recovers.'
      );
    }
  }

  if (!config) {
    return createClient('https://placeholder.supabase.co', 'placeholder-key');
  }

  return createClient(config.url, config.key);
}

export async function initSupabase(): Promise<SupabaseClient> {
  if (supabaseClient) return supabaseClient;
  if (!initPromise) {
    initPromise = createConfiguredClient().then((client) => {
      supabaseClient = client;
      return client;
    });
  }
  return initPromise;
}

function getSupabaseClientSync(): SupabaseClient {
  if (supabaseClient) return supabaseClient;
  const key = getAnonKey();
  const url = resolvedUrl || (import.meta.env.VITE_SUPABASE_URL as string) || '';
  const { config } = validateConfig(url, key);
  return config
    ? createClient(config.url, config.key)
    : createClient('https://placeholder.supabase.co', 'placeholder-key');
}

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getSupabaseClientSync();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export const isSupabaseConfigured = () => {
  const key = getAnonKey();
  const url = resolvedUrl || (import.meta.env.VITE_SUPABASE_URL as string) || '';
  return validateConfig(url, key).config !== null;
};

export const getConfigDebug = () => debug;

export const getResolvedSupabaseUrl = () => resolvedUrl;

/** Redux-backed adapter — session sync runs once in ReduxProvider via bindSupabaseAuth. */
export function useAuth() {
  const user = useAppSelector(selectAuthUser);
  const session = useAppSelector(selectAuthSession);
  const loading = useAppSelector(selectAuthLoading);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return { user, session, loading, signOut };
}
