import { Router } from 'express';
import { supabaseAdmin } from '../services/supabaseClient';
import { config } from '../config';

const router = Router();

router.get('/health', async (_req, res) => {
  const checks = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    checks: {
      database: 'unknown',
      openai: 'unknown',
      memory: {
        used: Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100,
        total: Math.round((process.memoryUsage().heapTotal / 1024 / 1024) * 100) / 100,
      },
    },
  };

  // Check database connection
  try {
    const { error } = await supabaseAdmin.from('journal_entries').select('id').limit(1);
    checks.checks.database = error ? 'error' : 'ok';
    if (error) {
      checks.checks.database_error = error.message;
    }
  } catch (error) {
    checks.checks.database = 'error';
    checks.checks.database_error = error instanceof Error ? error.message : String(error);
  }

  // Check OpenAI configuration
  try {
    checks.checks.openai = config.openAiKey && config.openAiKey.length > 0 ? 'configured' : 'not configured';
  } catch (error) {
    checks.checks.openai = 'error';
  }

  const statusCode = checks.checks.database === 'ok' ? 200 : 503;
  res.status(statusCode).json(checks);
});

router.get('/ready', async (_req, res) => {
  try {
    const { error } = await supabaseAdmin.from('journal_entries').select('id').limit(1);
    if (error) {
      return res.status(503).json({ 
        status: 'not ready', 
        error: error.message,
        code: error.code 
      });
    }
    res.json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ 
      status: 'not ready', 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
});

export default router;

