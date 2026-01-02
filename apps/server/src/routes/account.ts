// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { Router } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { supabaseAdmin } from '../services/supabaseClient';

export const accountRouter = Router();

const timelineRoot = path.resolve(process.cwd(), 'lorekeeper', 'timeline');

accountRouter.get('/export', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const tables = ['journal_entries', 'chapters', 'tasks', 'timeline_events', 'people_places', 'character_relationships'];
  const payload: Record<string, unknown> = { user_id: userId, generated_at: new Date().toISOString() };

  for (const table of tables) {
    const { data } = await supabaseAdmin.from(table).select('*').eq('user_id', userId);
    payload[table] = data ?? [];
  }

  const archive = zlib.gzipSync(Buffer.from(JSON.stringify(payload, null, 2), 'utf-8'));
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="lorekeeper-export.json.gz"');
  return res.send(archive);
});

accountRouter.post('/delete', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const tables = ['journal_entries', 'chapters', 'tasks', 'timeline_events', 'task_memory_bridges', 'people_places', 'character_relationships'];

  for (const table of tables) {
    await supabaseAdmin.from(table).delete().eq('user_id', userId);
  }

  const userTimelineDir = path.join(timelineRoot, userId);
  if (fs.existsSync(userTimelineDir)) {
    fs.rmSync(userTimelineDir, { recursive: true, force: true });
  }

  return res.json({ status: 'deleted', message: 'Account data removed and sessions should be re-authenticated.' });
});

export default accountRouter;
import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { logSecurityEvent } from '../services/securityLog';
import { supabaseAdmin } from '../services/supabaseClient';

const router = Router();
const exportTables = [
  'journal_entries',
  'timeline_events',
  'tasks',
  'characters',
  'relationships',
  'task_memory_bridges',
  'voice_memos'
];

router.get('/export', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const payload: Record<string, unknown> = {};
  const summaryOnly = req.query.summary === 'true';

  if (!summaryOnly) {
    for (const table of exportTables) {
      const { data, error } = await supabaseAdmin.from(table).select('*').eq('user_id', userId);
      if (error) {
        logSecurityEvent('export_error', { table, userId, error: error.message });
        return res.status(500).json({ error: `Failed to export ${table}` });
      }
      payload[table] = data ?? [];
    }
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

router.post('/delete', requireAuth, async (req: AuthenticatedRequest, res) => {
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

  logSecurityEvent('account_data_deleted', { userId, ip: req.ip });
  res.status(202).json({ status: 'scheduled', message: 'Account data deletion queued.' });
});

export const accountRouter = router;
