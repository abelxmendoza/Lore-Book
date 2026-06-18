/**
 * Shared helpers for diagnostic audit scripts (founder resolution, formatting, CLI flags).
 */
import { config } from '../../src/config';
import { supabaseAdmin } from '../../src/services/supabaseClient';

export type AccountLabel = 'founder' | 'developer';

export function estTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function pct(n: number, d: number): string {
  if (d === 0) return '0%';
  return `${((n / d) * 100).toFixed(1)}%`;
}

export function pctNum(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 100);
}

export function parseFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

export function parseArg(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

/** Resolve the founder/admin account used by most chat-memory audits. */
export async function resolveFounderId(): Promise<string> {
  if (config.ownerUserId?.trim()) return config.ownerUserId.trim();
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const match = data.users.find((u) => {
    const role = String(u.app_metadata?.role ?? '').toLowerCase();
    return role === 'admin' || role === 'owner' || u.email?.toLowerCase() === config.ownerEmail?.toLowerCase();
  });
  if (!match) throw new Error('Could not resolve founder account');
  return match.id;
}

/** Resolve founder or developer account (life-story cross-account audits). */
export async function resolveAccount(label: AccountLabel): Promise<{ id: string; email: string } | null> {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;

  if (label === 'founder') {
    if (config.ownerUserId?.trim()) {
      const u = data.users.find((x) => x.id === config.ownerUserId.trim());
      return u ? { id: u.id, email: u.email ?? '' } : { id: config.ownerUserId.trim(), email: '' };
    }
    const match = data.users.find((u) => {
      const role = String(u.app_metadata?.role ?? '').toLowerCase();
      return role === 'admin' || role === 'owner' || u.email?.toLowerCase() === config.ownerEmail?.toLowerCase();
    });
    return match ? { id: match.id, email: match.email ?? '' } : null;
  }

  const match = data.users.find((u) => {
    const role = String(u.app_metadata?.role ?? '').toLowerCase();
    return role === 'developer' || u.email?.toLowerCase() === config.developerEmail?.toLowerCase();
  });
  return match ? { id: match.id, email: match.email ?? '' } : null;
}

/** Parse comma-separated user ids from env or CLI (--user-id / --users). */
export function resolveUserIds(argv: string[], envKeys: string[]): string[] {
  const fromArg = parseArg(argv, '--user-id') ?? parseArg(argv, '--users');
  if (fromArg) {
    return fromArg.split(',').map((s) => s.trim()).filter(Boolean);
  }
  for (const key of envKeys) {
    const raw = process.env[key];
    if (raw?.trim()) {
      return raw.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

export function requireUserIds(argv: string[], envKeys: string[], usage: string): string[] {
  const ids = resolveUserIds(argv, envKeys);
  if (!ids.length) throw new Error(usage);
  return ids;
}
