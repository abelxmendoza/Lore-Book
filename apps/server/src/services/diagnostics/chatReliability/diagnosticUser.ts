/**
 * Resolve or auto-create the synthetic user used by chat reliability diagnostics.
 * Never uses a real founder/admin account — mutations stay isolated to this user.
 */
import { randomUUID } from 'crypto';

import { logger } from '../../../logger';
import { supabaseAdmin } from '../../supabaseClient';

export const DIAGNOSTIC_USER_EMAIL =
  process.env.LOREBOOK_DIAGNOSTIC_EMAIL?.trim().toLowerCase() ||
  'lorebook-diagnostics@internal.lorebook.local';

export type DiagnosticUserResolution = {
  userId: string | null;
  source: 'env' | 'auto_created' | 'auto_found' | 'missing';
  email?: string;
  warning?: string;
};

/**
 * Prefer LOREBOOK_DIAGNOSTIC_USER_ID; otherwise find/create the internal diagnostic user.
 */
export async function resolveDiagnosticUser(
  env: NodeJS.ProcessEnv = process.env,
): Promise<DiagnosticUserResolution> {
  const envId = (env.LOREBOOK_DIAGNOSTIC_USER_ID ?? '').trim();
  if (envId) {
    try {
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(envId);
      if (!error && data?.user?.id) {
        return { userId: data.user.id, source: 'env', email: data.user.email ?? undefined };
      }
      return {
        userId: envId,
        source: 'env',
        warning: `LOREBOOK_DIAGNOSTIC_USER_ID=${envId} could not be verified in Auth (will still use it for scoping)`,
      };
    } catch (err) {
      logger.warn({ err }, 'diagnostic user: env id verify failed');
      return {
        userId: envId,
        source: 'env',
        warning: 'Could not verify LOREBOOK_DIAGNOSTIC_USER_ID against Auth; using as-is',
      };
    }
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      userId: null,
      source: 'missing',
      warning: 'Cannot auto-provision diagnostic user without Supabase service role credentials',
    };
  }

  try {
    // Search existing users by email (paginate lightly)
    const { data: listed, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (!listErr && listed?.users?.length) {
      const found = listed.users.find(
        (u) => (u.email ?? '').toLowerCase() === DIAGNOSTIC_USER_EMAIL,
      );
      if (found?.id) {
        return { userId: found.id, source: 'auto_found', email: DIAGNOSTIC_USER_EMAIL };
      }
    }

    const password = `diag-${randomUUID()}-${randomUUID()}`;
    let created: Awaited<ReturnType<typeof supabaseAdmin.auth.admin.createUser>>['data'] | null =
      null;
    let createErr: { message?: string } | null = null;

    // Retry once — custom Supabase hosts sometimes return transient 500 on first createUser.
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await supabaseAdmin.auth.admin.createUser({
        email: DIAGNOSTIC_USER_EMAIL,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: 'LoreBook Diagnostics',
          is_diagnostic: true,
        },
        app_metadata: {
          role: 'standard_user',
          is_diagnostic: true,
        },
      });
      if (!res.error && res.data?.user?.id) {
        created = res.data;
        createErr = null;
        break;
      }
      createErr = res.error;
      // Race: user may have been created between list and create
      const msg = (res.error?.message ?? '').toLowerCase();
      if (msg.includes('already') || msg.includes('exists') || msg.includes('registered')) {
        const { data: listed2 } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
        const found = listed2?.users?.find(
          (u) => (u.email ?? '').toLowerCase() === DIAGNOSTIC_USER_EMAIL,
        );
        if (found?.id) {
          return { userId: found.id, source: 'auto_found', email: DIAGNOSTIC_USER_EMAIL };
        }
      }
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    if (createErr || !created?.user?.id) {
      logger.warn({ err: createErr }, 'diagnostic user: create failed');
      return {
        userId: null,
        source: 'missing',
        warning: `Failed to auto-create diagnostic user: ${createErr?.message ?? 'unknown error'}`,
      };
    }

    logger.info({ userId: created.user.id }, 'diagnostic user auto-created');
    return {
      userId: created.user.id,
      source: 'auto_created',
      email: DIAGNOSTIC_USER_EMAIL,
    };
  } catch (err) {
    logger.warn({ err }, 'diagnostic user: resolution failed');
    return {
      userId: null,
      source: 'missing',
      warning: err instanceof Error ? err.message : 'Failed to resolve diagnostic user',
    };
  }
}
