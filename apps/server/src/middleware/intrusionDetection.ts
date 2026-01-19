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

// Patterns that indicate potential attacks
const ATTACK_PATTERNS = [
  /\.\.\//g, // Path traversal
  /<script/gi, // XSS attempts
  /union.*select/gi, // SQL injection
  /exec\(/gi, // Code execution attempts
  /eval\(/gi, // Code execution attempts
  /\.env/gi, // Environment file access
  /\/etc\/passwd/gi, // System file access
  /\.git/gi, // Git directory access
  /wp-admin/gi, // WordPress admin (common attack target)
  /phpmyadmin/gi, // phpMyAdmin (common attack target)
  /\.\.\\/g, // Windows path traversal
  /%00/gi, // Null byte injection
  /javascript:/gi, // JavaScript protocol
  /onerror=/gi, // Event handler injection
  /onload=/gi, // Event handler injection
];

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

  // Check body for attack patterns
  for (const pattern of ATTACK_PATTERNS) {
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

  // Check for rapid requests from same IP
  const key = req.ip || 'unknown';
  const existing = suspiciousActivities.get(key);
  if (existing) {
    const timeSinceLastSeen = Date.now() - existing.lastSeen;
    if (timeSinceLastSeen < 1000) { // Less than 1 second between requests
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

export const intrusionDetection = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const key = req.ip || 'unknown';
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
