import type { Request, Response, NextFunction } from 'express';

import { logger } from '../logger';
import { logSecurityEvent } from '../services/securityLog';

interface SuspiciousActivity {
  ip: string;
  patterns: string[];
  count: number;
  firstSeen: number;
  lastSeen: number;
}

const suspiciousActivities = new Map<string, SuspiciousActivity>();
const BLOCK_THRESHOLD = 10; // Number of suspicious patterns before blocking
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const isDevelopment = () =>
  process.env.NODE_ENV === 'development' || process.env.API_ENV === 'dev';

const isLoopbackIp = (ip: string | undefined): boolean => {
  if (!ip) return false;
  const normalized = ip.replace(/^::ffff:/, '');
  return normalized === '127.0.0.1' || normalized === '::1' || ip === 'localhost';
};

// Path traversal in URLs is suspicious; in JSON bodies it is normal user content (chat, paths, code).
const PATH_TRAVERSAL_PATTERNS = [/\.\.\//g, /\.\.\\/g];

// Patterns that indicate potential attacks
// Using non-greedy quantifiers and word boundaries to prevent ReDoS
const ATTACK_PATTERNS = [
  ...PATH_TRAVERSAL_PATTERNS,
  /<script/gi, // XSS attempts
  /\bunion\s+select\b/gi, // SQL injection - using word boundaries and \s+ instead of .*
  /\bexec\s*\(/gi, // Code execution attempts - word boundary prevents ReDoS
  /\beval\s*\(/gi, // Code execution attempts - word boundary prevents ReDoS
  /\.env/gi, // Environment file access
  /\/etc\/passwd/gi, // System file access
  /\.git/gi, // Git directory access
  /wp-admin/gi, // WordPress admin (common attack target)
  /phpmyadmin/gi, // phpMyAdmin (common attack target)
  /%00/gi, // Null byte injection
  /javascript:/gi, // JavaScript protocol
  /\bonerror\s*=/gi, // Event handler injection - word boundary prevents ReDoS
  /\bonload\s*=/gi, // Event handler injection - word boundary prevents ReDoS
];

const BODY_ATTACK_PATTERNS = ATTACK_PATTERNS.filter(
  (pattern) => !PATH_TRAVERSAL_PATTERNS.some((p) => p.source === pattern.source)
);

// Suspicious user agents
const SUSPICIOUS_USER_AGENTS = [
  /sqlmap/i,
  /nikto/i,
  /nmap/i,
  /masscan/i,
  /zap/i,
  /burp/i,
  /w3af/i,
  /^$/i, // Empty user agent
];

// Suspicious paths
const SUSPICIOUS_PATHS = [
  /\/admin\/?$/i,
  /\/wp-admin/i,
  /\/phpmyadmin/i,
  /\/\.env/i,
  /\/\.git/i,
  /\/config/i,
  /\/backup/i,
  /\/test/i,
  /\/debug/i,
];

const detectSuspiciousPattern = (req: Request): string[] => {
  const patterns: string[] = [];
  const url = req.url.toLowerCase();
  const userAgent = (req.headers['user-agent'] || '').toLowerCase();
  const body = JSON.stringify(req.body || {}).toLowerCase();

  // Check URL for attack patterns
  for (const pattern of ATTACK_PATTERNS) {
    if (pattern.test(url)) {
      patterns.push(`url_pattern:${pattern.source}`);
    }
  }

  // Check body for attack patterns (exclude path traversal — common in chat/code uploads)
  for (const pattern of BODY_ATTACK_PATTERNS) {
    if (pattern.test(body)) {
      patterns.push(`body_pattern:${pattern.source}`);
    }
  }

  // Check user agent
  for (const pattern of SUSPICIOUS_USER_AGENTS) {
    if (pattern.test(userAgent)) {
      patterns.push(`suspicious_user_agent:${pattern.source}`);
    }
  }

  // Check path
  for (const pattern of SUSPICIOUS_PATHS) {
    if (pattern.test(url)) {
      patterns.push(`suspicious_path:${pattern.source}`);
    }
  }

  // Rapid requests alone are handled by rate limiting; only flag when paired with attack signals.
  const key = req.ip || 'unknown';
  const existing = suspiciousActivities.get(key);
  const hasAttackSignal = patterns.some((p) => p !== 'rapid_requests');
  if (existing && hasAttackSignal) {
    const timeSinceLastSeen = Date.now() - existing.lastSeen;
    if (timeSinceLastSeen < 1000) {
      patterns.push('rapid_requests');
    }
  }

  // Check for requests to non-existent endpoints (probing)
  if (req.path.includes('..') || req.path.length > 200) {
    patterns.push('path_traversal_or_oversized');
  }

  return patterns;
};

const recordSuspiciousActivity = (req: Request, patterns: string[]) => {
  if (patterns.length === 0) return;

  const key = req.ip || 'unknown';
  const now = Date.now();
  const existing = suspiciousActivities.get(key);

  if (existing) {
    // Reset if outside window
    if (now - existing.firstSeen > WINDOW_MS) {
      suspiciousActivities.set(key, {
        ip: key,
        patterns: [...new Set([...existing.patterns, ...patterns])],
        count: patterns.length,
        firstSeen: now,
        lastSeen: now,
      });
    } else {
      existing.patterns = [...new Set([...existing.patterns, ...patterns])];
      existing.count += patterns.length;
      existing.lastSeen = now;
    }
  } else {
    suspiciousActivities.set(key, {
      ip: key,
      patterns: [...new Set(patterns)],
      count: patterns.length,
      firstSeen: now,
      lastSeen: now,
    });
  }

  const activity = suspiciousActivities.get(key)!;
  
  // Log suspicious activity
  logSecurityEvent('suspicious_activity_detected', {
    ip: key,
    path: req.path,
    method: req.method,
    patterns: activity.patterns,
    count: activity.count,
    userAgent: req.headers['user-agent'],
  });

  // Block if threshold exceeded
  if (activity.count >= BLOCK_THRESHOLD) {
    logSecurityEvent('ip_blocked', {
      ip: key,
      reason: 'suspicious_activity_threshold_exceeded',
      patterns: activity.patterns,
      count: activity.count,
    });
    
    logger.warn({ 
      ip: key, 
      patterns: activity.patterns, 
      count: activity.count 
    }, '🚨 IP blocked due to suspicious activity');
  }
};

/** Clears in-memory state — for tests and dev server hot reload. */
export const resetIntrusionDetectionState = () => {
  suspiciousActivities.clear();
};

export const intrusionDetection = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const key = req.ip || 'unknown';

  // Local dev traffic (thread sync, CSRF polling) should never self-block the UI.
  if (isDevelopment() && isLoopbackIp(key)) {
    return next();
  }

  const activity = suspiciousActivities.get(key);

  // Block if threshold exceeded
  if (activity && activity.count >= BLOCK_THRESHOLD) {
    const timeSinceFirstSeen = Date.now() - activity.firstSeen;
    
    // Reset after window expires
    if (timeSinceFirstSeen > WINDOW_MS) {
      suspiciousActivities.delete(key);
      return next();
    }

    logSecurityEvent('blocked_request', {
      ip: key,
      path: req.path,
      method: req.method,
      reason: 'ip_blocked',
    });

    return res.status(403).json({
      error: 'Forbidden',
      message: 'Access denied due to suspicious activity',
    });
  }

  // Detect suspicious patterns
  const patterns = detectSuspiciousPattern(req);
  if (patterns.length > 0) {
    recordSuspiciousActivity(req, patterns);
  }

  next();
};

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, activity] of suspiciousActivities.entries()) {
    if (now - activity.firstSeen > WINDOW_MS) {
      suspiciousActivities.delete(key);
    }
  }
}, 5 * 60 * 1000); // Every 5 minutes
