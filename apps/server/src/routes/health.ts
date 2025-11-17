import { Router } from 'express';
import { supabase } from '../lib/supabase';

const router = Router();

router.get('/health', async (_req, res) => {
  const checks = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: 'unknown',
      memory: {
        used: Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100,
        total: Math.round((process.memoryUsage().heapTotal / 1024 / 1024) * 100) / 100,
      },
    },
  };

  try {
    // Check database connection
    const { error } = await supabase.from('journal_entries').select('id').limit(1);
    checks.checks.database = error ? 'error' : 'ok';
  } catch (error) {
    checks.checks.database = 'error';
  }

  const statusCode = checks.checks.database === 'ok' ? 200 : 503;
  res.status(statusCode).json(checks);
});

router.get('/ready', async (_req, res) => {
  try {
    const { error } = await supabase.from('journal_entries').select('id').limit(1);
    if (error) {
      return res.status(503).json({ status: 'not ready', error: error.message });
    }
    res.json({ status: 'ready' });
  } catch (error) {
    res.status(503).json({ status: 'not ready', error: String(error) });
  }
});

export default router;

