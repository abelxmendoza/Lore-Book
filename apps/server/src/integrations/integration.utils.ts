import fs from 'fs/promises';
import path from 'path';

import { logger } from '../logger';
import { callPython } from '../utils/pythonBridge';

const INBOX_ROOT = path.resolve(process.cwd(), 'lorekeeper', 'inbox');

const ensureDir = async (dirPath: string) => {
  await fs.mkdir(dirPath, { recursive: true });
};

export const getInboxFile = async (source: string) => {
  const dir = path.join(INBOX_ROOT, source);
  await ensureDir(dir);
  return path.join(dir, 'raw_events.jsonl');
};

export const appendToInbox = async (source: string, events: unknown[]) => {
  if (!Array.isArray(events) || events.length === 0) return { count: 0 };
  const file = await getInboxFile(source);
  const lines = events.map((evt) => `${JSON.stringify(evt)}\n`).join('');
  await fs.appendFile(file, lines, { encoding: 'utf-8' });
  return { count: events.length };
};

export const readInbox = async (source: string) => {
  const file = await getInboxFile(source);
  try {
    const content = await fs.readFile(file, 'utf-8');
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    logger.warn({ error }, `Failed to read inbox for ${source}`);
    return [];
  }
};

export const distillInbox = async (integration: string, userId: string) => {
  try {
    const payload = await callPython('lorekeeper.pipelines.integration_pipeline:get_distilled', {
      integration,
      user_id: userId
    });
    return payload?.distilled ?? payload ?? [];
  } catch (error: any) {
    logger.warn({ error }, `Falling back to raw inbox for ${integration}`);
    return readInbox(integration);
  }
};

export const runIntegrationPipeline = async (userId: string) => {
  try {
    return await callPython('lorekeeper.pipelines.integration_pipeline:run_pipeline', { user_id: userId });
  } catch (error: any) {
    logger.warn({ error }, 'Integration pipeline failed');
    return { github: 0, instagram: 0 };
  }
};
