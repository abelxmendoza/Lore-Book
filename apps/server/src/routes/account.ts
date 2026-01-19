// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { logSecurityEvent } from '../services/securityLog';
import { supabaseAdmin } from '../services/supabaseClient';

export const accountRouter = Router();

const timelineRoot = path.resolve(process.cwd(), 'lorekeeper', 'timeline');

const exportTables = [
  'journal_entries',
  'timeline_events',
  'tasks',
  'chapters',
  'characters',
  'relationships',
  'people_places',
  'character_relationships',
  'task_memory_bridges',
  'voice_memos'
];

// Export endpoint
accountRouter.get('/export', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const payload: Record<string, unknown> = { user_id: userId, generated_at: new Date().toISOString() };
  const summaryOnly = req.query.summary === 'true';

  if (!summaryOnly) {
    for (const table of exportTables) {
      const { data, error } = await supabaseAdmin.from(table).select('*').eq('user_id', userId);
      if (error) {
        logSecurityEvent('export_error', { table, userId, error: error.message });
        // Continue with other tables even if one fails
        payload[table] = [];
        continue;
      }
      payload[table] = data ?? [];
    }
  }

  // If summary only, return compressed archive
  if (summaryOnly) {
    const archive = zlib.gzipSync(Buffer.from(JSON.stringify(payload, null, 2), 'utf-8'));
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="lorekeeper-export.json.gz"');
    return res.send(archive);
  }

  res.json({
    userId,
    exportedAt: new Date().toISOString(),
    data: payload,
    audit: {
      lastLogin: req.user?.lastSignInAt ?? null,
      sessions: [
        {
          device: req.headers['user-agent'] || 'unknown',
          lastActive: new Date().toISOString()
        }
      ],
      audit: []
    }
  });
});

// Delete endpoint
accountRouter.post('/delete', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  
  if (req.body?.scope === 'sessions') {
    logSecurityEvent('session_revocation_requested', { userId, ip: req.ip });
    return res.status(202).json({ status: 'scheduled', message: 'Other sessions will be revoked.' });
  }
  
  for (const table of exportTables) {
    const { error } = await supabaseAdmin.from(table).delete().eq('user_id', userId);
    if (error) {
      logSecurityEvent('delete_error', { table, userId, error: error.message });
      return res.status(500).json({ error: `Failed to delete data for ${table}` });
    }
  }

  // Also delete timeline directory if it exists
  const userTimelineDir = path.join(timelineRoot, userId);
  if (fs.existsSync(userTimelineDir)) {
    fs.rmSync(userTimelineDir, { recursive: true, force: true });
  }

  logSecurityEvent('account_data_deleted', { userId, ip: req.ip });
  res.status(202).json({ status: 'scheduled', message: 'Account data deletion queued.' });
});
