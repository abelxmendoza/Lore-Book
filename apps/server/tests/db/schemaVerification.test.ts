import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  REQUIRED_TABLES,
  tableExists,
  verifySchema,
  getSchemaStatus,
  getMissingTables,
  getLastSchemaCheck,
  setSchemaStatus,
} from '../../src/db/schemaVerification';

vi.mock('../../src/db/dbAdapter', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  },
}));

describe('schemaVerification', () => {
  beforeEach(() => {
    setSchemaStatus('ok', []);
  });

  afterEach(() => {
    setSchemaStatus('ok', []);
  });

  describe('REQUIRED_TABLES', () => {
    it('includes chapters, journal_entries, characters, tasks', () => {
      expect(REQUIRED_TABLES).toContain('chapters');
      expect(REQUIRED_TABLES).toContain('journal_entries');
      expect(REQUIRED_TABLES).toContain('characters');
      expect(REQUIRED_TABLES).toContain('tasks');
      expect(REQUIRED_TABLES).toHaveLength(4);
    });
  });

  describe('getSchemaStatus / getMissingTables / setSchemaStatus', () => {
    it('defaults to ok and empty missing tables', () => {
      setSchemaStatus('ok');
      expect(getSchemaStatus()).toBe('ok');
      expect(getMissingTables()).toEqual([]);
    });

    it('setSchemaStatus degraded sets status and missing list', () => {
      setSchemaStatus('degraded', ['chapters', 'tasks']);
      expect(getSchemaStatus()).toBe('degraded');
      expect(getMissingTables()).toEqual(['chapters', 'tasks']);
    });

    it('setSchemaStatus ok clears missing tables', () => {
      setSchemaStatus('degraded', ['chapters']);
      setSchemaStatus('ok');
      expect(getSchemaStatus()).toBe('ok');
      expect(getMissingTables()).toEqual([]);
    });

    it('getMissingTables returns a copy', () => {
      setSchemaStatus('degraded', ['chapters']);
      const missing = getMissingTables();
      missing.push('other');
      expect(getMissingTables()).toEqual(['chapters']);
    });
  });

  describe('tableExists', () => {
    it('resolves true when mock returns no error', async () => {
      const exists = await tableExists('chapters');
      expect(exists).toBe(true);
    });
  });

  describe('verifySchema', () => {
    it('updates lastSchemaCheck', async () => {
      expect(getLastSchemaCheck()).toBeNull();
      await verifySchema();
      expect(getLastSchemaCheck()).toBeInstanceOf(Date);
    });

    it('returns ok and empty missingTables when all tables exist', async () => {
      const result = await verifySchema();
      expect(result.ok).toBe(true);
      expect(result.missingTables).toEqual([]);
      expect(getSchemaStatus()).toBe('ok');
    });
  });
});
