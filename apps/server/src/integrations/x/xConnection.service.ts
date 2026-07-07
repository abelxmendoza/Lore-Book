import crypto from 'node:crypto';

import type { Request } from 'express';

import { config } from '../../config';
import { xApiGuard } from '../../lib/externalCircuitBreaker';
import { logger } from '../../logger';
import { encrypt, decrypt } from '../../services/encryption';
import { memoryService } from '../../services/memoryService';
import { supabaseAdmin } from '../../services/supabaseClient';
import postgres from 'postgres';
import { xAdapter, type XResponse } from '../../external/x.adapter';
import { summarizeMilestonesBridge } from '../../external/summarizer.bridge';
import type { ExternalSummary } from '../../external/types';
import {
  ingestExternalPost,
  confirmExternalLoreCandidate,
  DEFAULT_LORE_INTAKE_MODE,
  type ExternalProvenance,
  type ExternalLoreIntakeMode,
  type ExternalIngestReport,
  type ExternalEntityRef,
} from '../../services/unifiedErIngestion';

export const LORE_INTAKE_MODES: readonly ExternalLoreIntakeMode[] = [
  'reference_only',
  'conservative',
  'review_first',
];

/** Held candidate enriched with the post it came from, so confirm can stamp it. */
export type HeldLoreCandidate = ExternalEntityRef & { provenance: ExternalProvenance };

export type XSyncLoreReport = {
  referenced: ExternalEntityRef[];
  created: ExternalEntityRef[];
  heldForReview: HeldLoreCandidate[];
};

function loreIntakeModeFrom(metadata: Record<string, unknown> | null | undefined): ExternalLoreIntakeMode {
  const mode = metadata?.lore_intake_mode;
  return LORE_INTAKE_MODES.includes(mode as ExternalLoreIntakeMode)
    ? (mode as ExternalLoreIntakeMode)
    : DEFAULT_LORE_INTAKE_MODE;
}

function mergeLoreReports(
  aggregate: XSyncLoreReport,
  report: ExternalIngestReport,
  provenance: ExternalProvenance
): void {
  const seen = (list: ExternalEntityRef[], ref: ExternalEntityRef) =>
    list.some((r) => r.name.toLowerCase() === ref.name.toLowerCase() && r.type === ref.type);
  for (const ref of report.referenced) {
    if (!seen(aggregate.referenced, ref)) aggregate.referenced.push(ref);
  }
  for (const ref of report.created) {
    if (!seen(aggregate.created, ref)) aggregate.created.push(ref);
  }
  for (const ref of report.heldForReview) {
    if (!seen(aggregate.heldForReview, ref)) aggregate.heldForReview.push({ ...ref, provenance });
  }
}

const PROVIDER = 'x';
const X_AUTHORIZE_URL = 'https://x.com/i/oauth2/authorize';
const X_TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const X_API_BASE_URL = 'https://api.x.com/2';
const X_SCOPES = ['tweet.read', 'users.read', 'offline.access'];
const STATE_TTL_MS = 10 * 60 * 1000;

const EXTERNAL_CONNECTIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS external_account_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_user_id TEXT,
  provider_username TEXT,
  access_token_enc TEXT,
  refresh_token_enc TEXT,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'connected',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS external_account_connections_provider_idx
  ON external_account_connections (provider, updated_at DESC);

CREATE INDEX IF NOT EXISTS external_account_connections_user_idx
  ON external_account_connections (user_id, provider);

ALTER TABLE external_account_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own external account connections"
  ON external_account_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own external account connections"
  ON external_account_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own external account connections"
  ON external_account_connections FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own external account connections"
  ON external_account_connections FOR DELETE
  USING (auth.uid() = user_id);
`;

/**
 * Best-effort: if the table is missing (common after fresh deploy or before running migrate),
 * create it directly via the postgres connection string (using the 'postgres' package already in deps).
 * Also attempts to notify PostgREST to reload schema so the JS client sees it immediately.
 *
 * Tries multiple common connection string env vars so it works in most Supabase setups.
 */
export async function ensureExternalAccountConnectionsTable(): Promise<boolean> {
  const candidates = [
    process.env.SUPABASE_CONNECTION_STRING,
    process.env.SUPABASE_POOLER_SESSION_URL,
    process.env.SUPABASE_POOLER_TRANSACTION_URL,
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.POSTGRES_PRISMA_URL,
  ].filter((c): c is string => !!c && c.length > 0);

  if (candidates.length === 0) {
    logger.warn('No direct database connection string found for auto-creating external_account_connections table. Set SUPABASE_CONNECTION_STRING, SUPABASE_POOLER_SESSION_URL, DATABASE_URL etc.');
    return false;
  }

  for (const conn of candidates) {
    const masked = conn.replace(/:[^@]+@/, ':***@').slice(0, 40) + '...';
    logger.info({ masked }, 'Attempting to ensure external_account_connections table using connection string');

    try {
      const sql = postgres(conn, {
        ssl: { rejectUnauthorized: false },
        max: 1,
        idle_timeout: 5,
      });

      try {
        // Use unsafe for the block of DDL (multi-statement)
        await sql.unsafe(EXTERNAL_CONNECTIONS_TABLE_SQL);

        // Tell PostgREST to reload its schema cache immediately
        try {
          await sql`SELECT pg_notify('pgrst', 'reload schema');`;
        } catch {
          // notify may fail depending on user/permissions, non-fatal
        }

        // Give PostgREST a moment to process the reload before retrying queries from the JS client
        await new Promise((r) => setTimeout(r, 1500));

        logger.info('Auto-created external_account_connections table (and notified pgrst)');
        return true;
      } finally {
        await sql.end({ timeout: 1 });
      }
    } catch (err) {
      logger.warn({ err, masked }, 'Auto table creation attempt failed for this connection string');
      // try next candidate
    }
  }

  logger.warn('All auto table creation attempts for external_account_connections failed. Run the migration manually.');
  return false;
}

type XConnectionRow = {
  id: string;
  user_id: string;
  provider: string;
  provider_user_id: string | null;
  provider_username: string | null;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  scopes: string[] | null;
  expires_at: string | null;
  last_sync_at: string | null;
  status: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type XTokenResponse = {
  token_type?: string;
  expires_in?: number;
  access_token: string;
  refresh_token?: string;
  scope?: string;
};

type SignedStatePayload = {
  userId: string;
  codeVerifier: string;
  returnTo: string;
  exp: number;
  nonce: string;
};

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sha256Base64url(input: string): string {
  return crypto.createHash('sha256').update(input).digest('base64url');
}

function stateSecret(): string {
  return config.encryptionSalt || config.xOAuthClientSecret || 'x-oauth-state-dev-secret';
}

function sign(value: string): string {
  return crypto.createHmac('sha256', stateSecret()).update(value).digest('base64url');
}

function signedState(payload: SignedStatePayload): string {
  const body = base64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

function verifySignedState(state: string): SignedStatePayload {
  const [body, signature] = state.split('.');
  if (!body || !signature) throw new Error('Invalid OAuth state');

  const expected = sign(body);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new Error('Invalid OAuth state signature');
  }

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SignedStatePayload;
  if (!payload.userId || !payload.codeVerifier || Date.now() > payload.exp) {
    throw new Error('Expired OAuth state');
  }
  return payload;
}

function requestBaseUrl(req: Request): string {
  const configured = process.env.API_URL || process.env.BACKEND_URL;
  if (configured) return configured.trim().replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0] || req.get('host') || 'localhost:4000';
  return `${proto}://${host}`;
}

function redirectUri(req: Request): string {
  if (config.xOAuthRedirectUri) {
    return config.xOAuthRedirectUri;
  }
  let base = requestBaseUrl(req);
  // Aggressively normalize local dev hosts. Many people (and browsers) use either localhost or 127.0.0.1.
  // The exact string sent in redirect_uri MUST match one you registered in the X app settings.
  base = base.replace(/^(https?:\/\/)(127\.0\.0\.1|0\.0\.0\.0|::1)(:\d+)?/i, '$1localhost$3');
  return `${base}/api/integrations/x/callback`;
}

function webReturnUrl(returnTo = '/account'): string {
  const root = (process.env.FRONTEND_URL || config.mcpWebAppUrl || 'http://localhost:5173').replace(/\/$/, '');
  const path = returnTo.startsWith('/') ? returnTo : '/account';
  return `${root}${path}`;
}

function requireOAuthConfig() {
  if (!config.xOAuthClientId) {
    throw new Error('X OAuth Client ID is not configured. Create an OAuth 2.0 app in https://developer.x.com and set X_OAUTH_CLIENT_ID (and SECRET). Do NOT use old Consumer API keys here.');
  }
}

function basicAuthHeader(): Record<string, string> {
  if (!config.xOAuthClientId || !config.xOAuthClientSecret) return {};
  return {
    Authorization: `Basic ${Buffer.from(`${config.xOAuthClientId}:${config.xOAuthClientSecret}`).toString('base64')}`,
  };
}

function serializeConnection(row: XConnectionRow | null) {
  return {
    connected: Boolean(row && row.status === 'connected'),
    provider: PROVIDER,
    username: row?.provider_username ?? null,
    providerUserId: row?.provider_user_id ?? null,
    scopes: row?.scopes ?? [],
    expiresAt: row?.expires_at ?? null,
    lastSyncAt: row?.last_sync_at ?? null,
    status: row?.status ?? 'disconnected',
    metadata: row?.metadata ?? {},
    loreIntakeMode: loreIntakeModeFrom(row?.metadata as Record<string, unknown> | null),
  };
}

async function getConnection(userId: string): Promise<XConnectionRow | null> {
  const { data, error } = await supabaseAdmin
    .from('external_account_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', PROVIDER)
    .maybeSingle();

  if (error) {
    const isMissing = error.code === 'PGRST205' || /schema cache|external_account_connections/i.test(error.message ?? '');
    if (isMissing) {
      const created = await ensureExternalAccountConnectionsTable();
      if (created) {
        // retry once
        const { data: retryData, error: retryErr } = await supabaseAdmin
          .from('external_account_connections')
          .select('*')
          .eq('user_id', userId)
          .eq('provider', PROVIDER)
          .maybeSingle();
        if (!retryErr) {
          return (retryData as XConnectionRow | null) ?? null;
        }
      }
      throw new Error('External account connections table is missing. (Auto-create attempted using pooler URL; otherwise run: npm run migrate base)');
    }
    throw error;
  }
  return (data as XConnectionRow | null) ?? null;
}

async function saveConnection(input: {
  userId: string;
  xUserId: string;
  username: string;
  token: XTokenResponse;
}) {
  const scopes = input.token.scope?.split(/\s+/).filter(Boolean) ?? X_SCOPES;
  const expiresAt = input.token.expires_in
    ? new Date(Date.now() + input.token.expires_in * 1000).toISOString()
    : null;

  let { error } = await supabaseAdmin.from('external_account_connections').upsert(
    {
      user_id: input.userId,
      provider: PROVIDER,
      provider_user_id: input.xUserId,
      provider_username: input.username,
      access_token_enc: encrypt(input.token.access_token),
      refresh_token_enc: input.token.refresh_token ? encrypt(input.token.refresh_token) : null,
      scopes,
      expires_at: expiresAt,
      status: 'connected',
      metadata: { token_type: input.token.token_type ?? 'bearer' },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,provider' }
  );

  if (error && (error.code === 'PGRST205' || /schema cache|external_account_connections/i.test(error.message ?? ''))) {
    const created = await ensureExternalAccountConnectionsTable();
    if (created) {
      const res = await supabaseAdmin.from('external_account_connections').upsert(
        {
          user_id: input.userId,
          provider: PROVIDER,
          provider_user_id: input.xUserId,
          provider_username: input.username,
          access_token_enc: encrypt(input.token.access_token),
          refresh_token_enc: input.token.refresh_token ? encrypt(input.token.refresh_token) : null,
          scopes,
          expires_at: expiresAt,
          status: 'connected',
          metadata: { token_type: input.token.token_type ?? 'bearer' },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,provider' }
      );
      error = res.error;
    }
  }

  if (error) throw error;
}

async function exchangeCode(code: string, verifier: string, callbackUri: string): Promise<XTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.xOAuthClientId ?? '',
    code,
    redirect_uri: callbackUri,
    code_verifier: verifier,
  });

  const response = await xApiGuard.run(() =>
    fetch(X_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...basicAuthHeader(),
      },
      body,
    })
  );

  if (!response.ok) {
    throw new Error(`X token exchange failed: ${response.status} ${await response.text()}`);
  }

  return response.json() as Promise<XTokenResponse>;
}

async function refreshAccessToken(row: XConnectionRow): Promise<XTokenResponse> {
  if (!row.refresh_token_enc) throw new Error('X refresh token is missing. Reconnect X.');
  const refreshToken = decrypt(row.refresh_token_enc);
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.xOAuthClientId ?? '',
    refresh_token: refreshToken,
  });

  const response = await xApiGuard.run(() =>
    fetch(X_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...basicAuthHeader(),
      },
      body,
    })
  );

  if (!response.ok) {
    throw new Error(`X token refresh failed: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<XTokenResponse>;
}

async function getValidAccessToken(userId: string): Promise<{ row: XConnectionRow; accessToken: string }> {
  const row = await getConnection(userId);
  if (!row || row.status !== 'connected' || !row.access_token_enc) {
    throw new Error('X is not connected for this account.');
  }

  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (expiresAt && expiresAt - Date.now() < 60_000 && row.refresh_token_enc) {
    const refreshed = await refreshAccessToken(row);
    await saveConnection({
      userId,
      xUserId: row.provider_user_id ?? '',
      username: row.provider_username ?? '',
      token: {
        ...refreshed,
        refresh_token: refreshed.refresh_token ?? decrypt(row.refresh_token_enc),
      },
    });
    const updated = await getConnection(userId);
    return { row: updated ?? row, accessToken: refreshed.access_token };
  }

  return { row, accessToken: decrypt(row.access_token_enc) };
}

async function fetchMe(accessToken: string): Promise<{ id: string; username: string }> {
  const response = await xApiGuard.run(() =>
    fetch(`${X_API_BASE_URL}/users/me?user.fields=username`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  );
  if (!response.ok) throw new Error(`Failed to fetch X profile: ${response.status} ${await response.text()}`);
  const payload = (await response.json()) as { data?: { id?: string; username?: string } };
  if (!payload.data?.id || !payload.data.username) throw new Error('X profile response was missing id or username.');
  return { id: payload.data.id, username: payload.data.username };
}

async function fetchUserPosts(accessToken: string, xUserId: string, maxPosts: number): Promise<XResponse> {
  const params = new URLSearchParams({
    max_results: `${Math.min(Math.max(maxPosts, 5), 100)}`,
    expansions: 'author_id,attachments.media_keys,referenced_tweets.id',
    'tweet.fields': 'created_at,public_metrics,entities,attachments,referenced_tweets,lang,note_tweet',
    'user.fields': 'username',
    'media.fields': 'url,preview_image_url,type',
    exclude: 'retweets,replies',
  });

  const response = await xApiGuard.run(() =>
    fetch(`${X_API_BASE_URL}/users/${encodeURIComponent(xUserId)}/tweets?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  );
  if (!response.ok) throw new Error(`Failed to fetch X posts: ${response.status} ${await response.text()}`);
  return response.json() as Promise<XResponse>;
}

async function importedSourceIds(userId: string, sourceIds: string[]): Promise<Set<string>> {
  if (!sourceIds.length) return new Set();

  const { data, error } = await supabaseAdmin
    .from('journal_entries')
    .select('metadata')
    .eq('user_id', userId)
    .eq('source', PROVIDER)
    .in('metadata->>sourceId', sourceIds);

  if (error) throw error;

  return new Set(
    (data ?? [])
      .map((row: any) => row?.metadata?.sourceId)
      .filter((sourceId: unknown): sourceId is string => typeof sourceId === 'string')
  );
}

async function persistXImports(
  userId: string,
  summaries: ExternalSummary[],
  loreIntakeMode: ExternalLoreIntakeMode
) {
  const importable = summaries.filter((summary) => summary.sourceId && (summary.text || summary.summary));
  const alreadyImported = await importedSourceIds(
    userId,
    importable.map((summary) => summary.sourceId!)
  );

  let imported = 0;
  let skipped = 0;
  const entryIds: string[] = [];
  const lore: XSyncLoreReport = { referenced: [], created: [], heldForReview: [] };

  for (const summary of importable) {
    if (!summary.sourceId || alreadyImported.has(summary.sourceId)) {
      skipped += 1;
      continue;
    }

    const entry = await memoryService.saveEntry({
      userId,
      content: summary.text ?? summary.summary,
      date: summary.timestamp,
      tags: Array.from(new Set(['x-import', summary.type, ...(summary.tags ?? [])])),
      summary: summary.milestone ?? summary.summary,
      source: PROVIDER,
      original_content: summary.text ?? null,
      preserve_original_language: true,
      metadata: {
        provider: PROVIDER,
        sourceId: summary.sourceId,
        url: summary.url,
        importedAt: new Date().toISOString(),
        eventType: summary.type,
        imageUrl: summary.imageUrl,
        x: summary.metadata ?? {},
      },
      skipIngestion: true, // we will call the external provenance-aware path below
    });

    // Use the dedicated external post ingestion path so entities get stamped with X provenance
    const provenance: ExternalProvenance = {
      provider: PROVIDER,
      sourceId: summary.sourceId,
      url: summary.url,
      postedAt: summary.timestamp,
      excerpt: (summary.text ?? summary.summary)?.slice(0, 280),
    };

    try {
      const report = await ingestExternalPost(
        userId,
        entry.id,
        summary.text ?? summary.summary,
        provenance,
        loreIntakeMode
      );
      if (report) mergeLoreReports(lore, report, provenance);
    } catch (ingestErr) {
      logger.warn({ ingestErr, sourceId: summary.sourceId }, 'X post ER ingestion failed (non-fatal)');
    }

    alreadyImported.add(summary.sourceId);
    entryIds.push(entry.id);
    imported += 1;
  }

  return { imported, skipped, entryIds, lore };
}

export class XConnectionService {
  begin(userId: string, req: Request, returnTo = '/account') {
    requireOAuthConfig();
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = sha256Base64url(codeVerifier);
    const callbackUri = redirectUri(req);
    const state = signedState({
      userId,
      codeVerifier,
      returnTo,
      exp: Date.now() + STATE_TTL_MS,
      nonce: crypto.randomBytes(16).toString('base64url'),
    });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.xOAuthClientId ?? '',
      redirect_uri: callbackUri,
      scope: X_SCOPES.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const authorizationUrl = `${X_AUTHORIZE_URL}?${params.toString()}`;

    // Log for debugging OAuth "Something went wrong / 400" issues — the redirect_uri here *must* exactly match a registered Callback URL in X Developer Portal
    logger.warn({ 
      clientId: config.xOAuthClientId, 
      redirectUri: callbackUri, 
      returnTo,
      scopes: X_SCOPES 
    }, 'X OAuth begin: generated authorization URL (verify this redirectUri is registered in X Dev Portal)');

    return {
      authorizationUrl,
      redirectUri: callbackUri,
      scopes: X_SCOPES,
    };
  }

  async complete(code: string, state: string, req: Request): Promise<{ redirectTo: string }> {
    requireOAuthConfig();
    const payload = verifySignedState(state);
    const token = await exchangeCode(code, payload.codeVerifier, redirectUri(req));
    const profile = await fetchMe(token.access_token);
    await saveConnection({
      userId: payload.userId,
      xUserId: profile.id,
      username: profile.username,
      token,
    });
    return { redirectTo: `${webReturnUrl(payload.returnTo)}?x=connected` };
  }

  async status(userId: string) {
    const row = await getConnection(userId);
    return serializeConnection(row);
  }

  async disconnect(userId: string) {
    let { error } = await supabaseAdmin
      .from('external_account_connections')
      .delete()
      .eq('user_id', userId)
      .eq('provider', PROVIDER);

    if (error && (error.code === 'PGRST205' || /schema cache|external_account_connections/i.test(error.message ?? ''))) {
      const created = await ensureExternalAccountConnectionsTable();
      if (created) {
        const retry = await supabaseAdmin
          .from('external_account_connections')
          .delete()
          .eq('user_id', userId)
          .eq('provider', PROVIDER);
        error = retry.error;
      }
    }
    if (error) throw error;
    return { connected: false };
  }

  async sync(userId: string, maxPosts = 25) {
    const { row, accessToken } = await getValidAccessToken(userId);
    const xUserId = row.provider_user_id;
    if (!xUserId) throw new Error('X connection is missing provider user id. Reconnect X.');

    const payload = await fetchUserPosts(accessToken, xUserId, maxPosts);
    const events = xAdapter(payload);
    const summaries = await summarizeMilestonesBridge(events);
    const loreIntakeMode = loreIntakeModeFrom(row.metadata as Record<string, unknown> | null);
    const persistence = await persistXImports(userId, summaries, loreIntakeMode);

    let updateErr: any = null;
    const updateRes = await supabaseAdmin
      .from('external_account_connections')
      .update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('provider', PROVIDER);
    updateErr = updateRes.error;

    if (updateErr && (updateErr.code === 'PGRST205' || /schema cache|external_account_connections/i.test(updateErr.message ?? ''))) {
      const created = await ensureExternalAccountConnectionsTable();
      if (created) {
        const retry = await supabaseAdmin
          .from('external_account_connections')
          .update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('provider', PROVIDER);
        updateErr = retry.error;
      }
    }
    if (updateErr) {
      // non-fatal for sync
      logger.warn({ updateErr }, 'Failed to update last_sync_at (table may have been missing)');
    }

    return {
      count: summaries.length,
      imported: persistence.imported,
      skipped: persistence.skipped,
      entryIds: persistence.entryIds,
      events: summaries,
      loreIntakeMode,
      lore: persistence.lore,
    };
  }

  /** Persist the user's lore-intake preference on the connection row. */
  async setLoreIntakeMode(userId: string, mode: ExternalLoreIntakeMode) {
    if (!LORE_INTAKE_MODES.includes(mode)) throw new Error('Invalid lore intake mode');
    const row = await getConnection(userId);
    if (!row) throw new Error('No X connection found. Connect X first.');
    const metadata = { ...((row.metadata as Record<string, unknown>) ?? {}), lore_intake_mode: mode };
    const { error } = await supabaseAdmin
      .from('external_account_connections')
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('provider', PROVIDER);
    if (error) throw error;
    return { loreIntakeMode: mode };
  }

  /** "Add to lore" on a held sync-receipt candidate — user-confirmed creation. */
  async confirmLoreCandidate(
    userId: string,
    candidate: { name: string; type: string },
    provenance: ExternalProvenance
  ) {
    const entity = await confirmExternalLoreCandidate(userId, candidate, {
      ...provenance,
      provider: PROVIDER,
    });
    return { entity };
  }

  async adminSummary() {
    const { data, error } = await supabaseAdmin
      .from('external_account_connections')
      .select('id, user_id, provider_username, status, last_sync_at, updated_at')
      .eq('provider', PROVIDER)
      .order('updated_at', { ascending: false })
      .limit(100);

    if (error) {
      const isMissingTable =
        error.code === 'PGRST205' ||
        /schema cache|could not find the table|external_account_connections/i.test(error.message ?? '');

      if (isMissingTable) {
        const created = await ensureExternalAccountConnectionsTable();
        if (created) {
          // retry the summary query
          const { data: retryData, error: retryError } = await supabaseAdmin
            .from('external_account_connections')
            .select('id, user_id, provider_username, status, last_sync_at, updated_at')
            .eq('provider', PROVIDER)
            .order('updated_at', { ascending: false })
            .limit(100);

          if (!retryError) {
            return {
              configured: Boolean(config.xOAuthClientId),
              connections: retryData ?? [],
              total: retryData?.length ?? 0,
            };
          }
        }
      }

      logger.warn({ error }, 'Failed to load X integration admin summary');

      const friendlyError = isMissingTable
        ? 'External account connections table could not be found or auto-created. Check that SUPABASE_POOLER_SESSION_URL or DATABASE_URL is set, or run: npm run migrate base'
        : error.message;

      return {
        configured: Boolean(config.xOAuthClientId),
        connections: [],
        total: 0,
        error: friendlyError,
      };
    }

    return {
      configured: Boolean(config.xOAuthClientId),
      connections: data ?? [],
      total: data?.length ?? 0,
    };
  }

  /** Returns the exact redirect/callback URI that will be sent to X for authorization (for registration in dev console). */
  getCallbackInfo(req: Request) {
    try {
      requireOAuthConfig();
    } catch {
      // still return info
    }
    const effective = redirectUri(req);
    const usingOverride = !!config.xOAuthRedirectUri;
    return {
      redirectUri: effective,
      usingExplicitRedirectUri: usingOverride,
      clientId: config.xOAuthClientId || null,
    };
  }
}

export const xConnectionService = new XConnectionService();
