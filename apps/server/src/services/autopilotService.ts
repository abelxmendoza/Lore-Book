import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

import { logger } from '../logger';
import type { MemoryEntry, TaskRecord } from '../types';
import { memoryService } from './memoryService';
import { taskEngineService } from './taskEngineService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type AutopilotFormat = 'json' | 'markdown';

export type AutopilotPayload = {
  timeline: MemoryEntry[];
  tasks: TaskRecord[];
  identity: Record<string, unknown>;
  arcs: Record<string, unknown>;
};

class AutopilotService {
  private readonly rootDir = path.resolve(__dirname, '../../../..');

  private deriveIdentity(entries: MemoryEntry[]): Record<string, unknown> {
    const tagCounts: Record<string, number> = {};
    let moodBalance = 0;

    entries.forEach((entry) => {
      entry.tags?.forEach((tag) => {
        tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
      });
      if (entry.mood === 'positive') moodBalance += 1;
      if (entry.mood === 'negative') moodBalance -= 1;
    });

    const motifs = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([tag]) => tag);

    const emotionalSlope = entries.length ? moodBalance / entries.length : 0;

    return { motifs, emotional_slope: emotionalSlope } as Record<string, unknown>;
  }

  private deriveArcs(entries: MemoryEntry[]): Record<string, unknown> {
    const months = new Set(entries.map((entry) => (entry.date ?? '').slice(0, 7)).filter(Boolean));
    return { current_phase: 'operational', windowed_months: Array.from(months) };
  }

  async buildPayload(userId: string): Promise<AutopilotPayload> {
    const [tasks, timeline] = await Promise.all([
      taskEngineService.listTasks(userId, { limit: 150 }),
      memoryService.searchEntries(userId, { limit: 120 })
    ]);

    const identity = this.deriveIdentity(timeline);
    const arcs = this.deriveArcs(timeline);

    return { tasks, timeline, identity, arcs };
  }

  private async runPython(command: string, format: AutopilotFormat, payload: AutopilotPayload): Promise<string> {
    const args = ['-m', 'lorekeeper.autopilot', command, '--format', format];
    const child = spawn('python3', args, { cwd: this.rootDir });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();

    return await new Promise((resolve, reject) => {
      child.on('error', (error) => reject(error));
      child.on('close', (code) => {
        if (code !== 0) {
          logger.error({ stderr, code }, 'Autopilot process failed');
          reject(new Error(stderr || 'Autopilot process failed'));
        } else {
          resolve(stdout.trim());
        }
      });
    });
  }

  private parseResponse(raw: string, format: AutopilotFormat): unknown {
    if (format === 'markdown') return raw;
    try {
      return JSON.parse(raw || '{}');
    } catch (error) {
      logger.error({ error, raw }, 'Failed to parse Autopilot output');
      throw error;
    }
  }

  async run(command: string, userId: string, format: AutopilotFormat = 'json'): Promise<unknown> {
    const payload = await this.buildPayload(userId);
    const raw = await this.runPython(command, format, payload);
    return this.parseResponse(raw, format);
  }

  async getDailyPlan(userId: string, format: AutopilotFormat): Promise<unknown> {
    return this.run('daily', userId, format);
  }

  async getWeeklyStrategy(userId: string, format: AutopilotFormat): Promise<unknown> {
    return this.run('weekly', userId, format);
  }

  async getMonthlyCorrection(userId: string, format: AutopilotFormat): Promise<unknown> {
    return this.run('monthly', userId, format);
  }

  async getTransition(userId: string, format: AutopilotFormat): Promise<unknown> {
    return this.run('transition', userId, format);
  }

  async getAlerts(userId: string, format: AutopilotFormat): Promise<unknown> {
    return this.run('alerts', userId, format);
  }

  async getMomentum(userId: string, format: AutopilotFormat): Promise<unknown> {
    return this.run('momentum', userId, format);
  }
}

export const autopilotService = new AutopilotService();
