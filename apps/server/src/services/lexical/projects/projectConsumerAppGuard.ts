/**
 * Reject third-party consumer app / tool references unless user is building them.
 */

const CONSUMER_APPS = new Set([
  'find my',
  'find my app',
  'instagram',
  'facebook',
  'tiktok',
  'snapchat',
  'google maps',
  'maps',
  'youtube',
  'whatsapp',
  'messenger',
  'spotify',
  'netflix',
  'amazon',
  'cursor',
  'codex',
  'claude code',
  'chatgpt',
  'github',
  'discord',
  'slack',
  'notion',
  'figma',
]);

const DEV_TOOLS = new Set(['cursor', 'codex', 'claude code', 'chatgpt', 'github copilot']);

const CONSUMER_USAGE =
  /\b(?:went on|go on|gone on|used|opened|checked|found (?:it )?on|posted on|saw it on|looked on|tracked (?:it )?(?:on|with|using)|had to go on|locate it (?:on|with|using))\b/i;

const BUILD_USAGE =
  /\b(?:building|working on|created|creating|developing|launched|shipping|my app called|project called|repo named|feature for|integration for|extension for|plugin for)\b/i;

const norm = (s: string) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

export type ConsumerAppGuardResult = {
  allowed: boolean;
  rejectedAs?: string;
  rejectionReason?: string;
  rulesFired: string[];
};

function matchesConsumerApp(text: string): string | null {
  const n = norm(text);
  if (CONSUMER_APPS.has(n)) return n;
  for (const app of CONSUMER_APPS) {
    if (n === app || n.endsWith(` ${app}`) || n.startsWith(`${app} `)) return app;
  }
  if (/\bfind my\b/i.test(text)) return 'find my';
  if (/\bgoogle maps\b/i.test(text)) return 'google maps';
  if (/\bamazon ring\b/i.test(text)) return 'amazon ring';
  return null;
}

export function guardConsumerAppReference(
  span: string,
  contextLine: string
): ConsumerAppGuardResult {
  const text = span.trim();
  const haystack = `${text} ${contextLine}`;
  const app = matchesConsumerApp(text);
  if (!app) return { allowed: true, rulesFired: ['not_consumer_app'] };

  if (BUILD_USAGE.test(haystack) && !CONSUMER_USAGE.test(haystack)) {
    return { allowed: true, rulesFired: ['consumer_app_build_context'] };
  }

  if (DEV_TOOLS.has(app) && /\b(?:extension|integration|plugin|feature|tooling for)\b/i.test(haystack)) {
    return { allowed: true, rulesFired: ['dev_tool_build_context'] };
  }

  if (CONSUMER_USAGE.test(haystack) || DEV_TOOLS.has(app)) {
    return {
      allowed: false,
      rejectedAs: DEV_TOOLS.has(app) ? 'TOOL_REFERENCE' : 'CONSUMER_APP',
      rejectionReason: DEV_TOOLS.has(app) ? 'tool_reference' : 'consumer_app_reference',
      rulesFired: [DEV_TOOLS.has(app) ? 'dev_tool_usage' : 'consumer_app_usage'],
    };
  }

  if (/\bapp\b/i.test(text) && CONSUMER_APPS.has(norm(text.replace(/\s{1,40}app$/i, '')))) {
    return {
      allowed: false,
      rejectedAs: 'CONSUMER_APP',
      rejectionReason: 'consumer_app_reference',
      rulesFired: ['consumer_app_suffix'],
    };
  }

  return { allowed: true, rulesFired: ['consumer_app_ambiguous_allow'] };
}
