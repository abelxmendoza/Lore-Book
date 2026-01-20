import fs from 'node:fs';
import path from 'node:path';

import { logger } from '../logger';

const LOG_DIR = path.resolve(process.cwd(), 'logs', 'security');
const MAX_DAYS = 30;

const ensureLogDir = () => {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
};

const pruneOldLogs = () => {
  ensureLogDir();
  const cutoff = Date.now() - MAX_DAYS * 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(LOG_DIR);
  files.forEach((file) => {
    const filePath = path.join(LOG_DIR, file);
    const stats = fs.statSync(filePath);
    if (stats.mtimeMs < cutoff) {
      fs.rmSync(filePath);
    }
  });
};

export const redactSensitive = (value?: string | null) => {
  if (!value) return value ?? '';
  // Use more specific email regex to prevent ReDoS - avoid nested quantifiers
  // Email pattern: word chars, dots, hyphens, plus, percent before @, domain after
  const scrubbedEmails = value.replace(/\b[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}\b/g, '[redacted-email]');
  // Use word boundary and limit length to prevent ReDoS on long alphanumeric strings
  return scrubbedEmails.replace(/\b[A-Za-z0-9]{6,}\b/g, (match) => {
    // Limit processing to reasonable length
    if (match.length > 100) {
      return `${match.slice(0, 2)}***${match.slice(-2)}`;
    }
    return `${match.slice(0, 2)}***${match.slice(-2)}`;
  });
};

type SecurityEvent = {
  type: string;
  timestamp: string;
  details: Record<string, unknown>;
};

export const logSecurityEvent = (type: string, details: Record<string, unknown>) => {
  ensureLogDir();
  pruneOldLogs();

  const sanitizedDetails = Object.fromEntries(
    Object.entries(details).map(([key, value]) => {
      if (typeof value === 'string') {
        return [key, redactSensitive(value)];
      }
      if (Array.isArray(value)) {
        return [
          key,
          value.map((item) => (typeof item === 'string' ? redactSensitive(item) : item)).slice(0, 50)
        ];
      }
      return [key, value];
    })
  );

  const event: SecurityEvent = {
    type,
    timestamp: new Date().toISOString(),
    details: sanitizedDetails
  };

  const logLine = `${JSON.stringify(event)}\n`;
  const logFile = path.join(LOG_DIR, `${event.timestamp.slice(0, 10)}.log`);

  try {
    fs.appendFileSync(logFile, logLine, { encoding: 'utf8' });
  } catch (error) {
    logger.warn({ error }, 'Failed to write security log');
  }

  logger.info({ event: event.type, ...event.details }, 'Security event');
};
