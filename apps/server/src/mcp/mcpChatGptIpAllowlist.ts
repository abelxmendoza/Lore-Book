/**
 * Optional ChatGPT connector IP allowlist for /mcp (OpenAI egress ranges).
 * @see https://openai.com/chatgpt-connectors.json
 */
import type { NextFunction, Request, Response } from 'express';

import { config } from '../config';
import { logger } from '../logger';

type PrefixEntry = { ipv4Prefix?: string; ipv6Prefix?: string };

type ConnectorManifest = {
  creationTime?: string;
  prefixes?: PrefixEntry[];
};

const REFRESH_MS = 6 * 60 * 60 * 1000;
const MANIFEST_URL = 'https://openai.com/chatgpt-connectors.json';

let cachedPrefixes: Array<{ family: 4 | 6; base: bigint; bits: number }> = [];
let lastFetch = 0;
let fetchPromise: Promise<void> | null = null;

function ipv4ToBigInt(ip: string): bigint | null {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return null;
  }
  return (
    (BigInt(parts[0]) << 24n) |
    (BigInt(parts[1]) << 16n) |
    (BigInt(parts[2]) << 8n) |
    BigInt(parts[3])
  );
}

function parseCidr(prefix: string, family: 4 | 6): { base: bigint; bits: number } | null {
  const [addr, bitsRaw] = prefix.split('/');
  const bits = Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0) return null;

  if (family === 4) {
    const base = ipv4ToBigInt(addr);
    if (base == null || bits > 32) return null;
    return { base, bits };
  }

  return null;
}

function normalizeClientIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim();
  }
  return req.ip || req.socket.remoteAddress || undefined;
}

function ipMatchesIpv4(ip: string, rules: Array<{ base: bigint; bits: number }>): boolean {
  const value = ipv4ToBigInt(ip.replace(/^::ffff:/, ''));
  if (value == null) return false;

  for (const rule of rules) {
    const mask = rule.bits === 0 ? 0n : (~((1n << BigInt(32 - rule.bits)) - 1n)) & 0xffffffffn;
    if ((value & mask) === (rule.base & mask)) return true;
  }
  return false;
}

export function resetChatGptIpCacheForTests(): void {
  cachedPrefixes = [];
  lastFetch = 0;
  fetchPromise = null;
}

export async function refreshChatGptConnectorPrefixes(force = false): Promise<void> {
  const now = Date.now();
  if (!force && cachedPrefixes.length > 0 && now - lastFetch < REFRESH_MS) return;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      const response = await fetch(MANIFEST_URL, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const manifest = (await response.json()) as ConnectorManifest;
      const parsed: Array<{ family: 4 | 6; base: bigint; bits: number }> = [];

      for (const entry of manifest.prefixes ?? []) {
        if (entry.ipv4Prefix) {
          const rule = parseCidr(entry.ipv4Prefix, 4);
          if (rule) parsed.push({ family: 4, ...rule });
        }
      }

      if (parsed.length === 0) {
        logger.warn('ChatGPT connector manifest returned no IPv4 prefixes');
        return;
      }

      cachedPrefixes = parsed;
      lastFetch = Date.now();
      logger.info(
        { prefixCount: parsed.length, creationTime: manifest.creationTime },
        'Refreshed ChatGPT connector IP allowlist'
      );
    } catch (error) {
      logger.warn({ error }, 'Failed to refresh ChatGPT connector IP allowlist');
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

export function isChatGptConnectorIp(ip: string, rules = cachedPrefixes): boolean {
  const ipv4Rules = rules.filter((r) => r.family === 4);
  return ipMatchesIpv4(ip, ipv4Rules);
}

export async function mcpChatGptIpAllowlistMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!config.mcpChatGptIpAllowlist) {
    next();
    return;
  }

  const isDev =
    process.env.NODE_ENV === 'development' ||
    process.env.API_ENV === 'dev' ||
    process.env.NODE_ENV === 'test';

  if (isDev) {
    next();
    return;
  }

  await refreshChatGptConnectorPrefixes();

  if (cachedPrefixes.length === 0) {
    logger.warn('ChatGPT IP allowlist enabled but no prefixes loaded — allowing request');
    next();
    return;
  }

  const clientIp = normalizeClientIp(req);
  if (!clientIp) {
    res.status(403).json({ error: 'Forbidden', message: 'Unable to determine client IP' });
    return;
  }

  if (!isChatGptConnectorIp(clientIp)) {
    logger.warn({ clientIp: clientIp.slice(0, 12) }, 'MCP request blocked — IP not in ChatGPT allowlist');
    res.status(403).json({
      error: 'Forbidden',
      message: 'MCP endpoint is restricted to ChatGPT connector egress ranges',
    });
    return;
  }

  next();
}
