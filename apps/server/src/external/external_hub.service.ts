import { EventEmitter } from 'events';

import { calendarAdapter } from './calendar.adapter';
import { classifyMilestones } from './classifiers';
import { filterNoise } from './filters';
import { githubAdapter } from './github.adapter';
import { instagramAdapter } from './instagram.adapter';
import { photosAdapter } from './photos.adapter';
import { summarizeMilestonesBridge } from './summarizer.bridge';
import { ExternalEvent, ExternalSource, ExternalSummary } from './types';
import { xAdapter } from './x.adapter';

interface TimelineRepository {
  _entries: ExternalSummary[];
  create: (entry: ExternalSummary) => ExternalSummary;
  all: () => ExternalSummary[];
}

const timelineRepo: TimelineRepository = {
  _entries: [],
  create(entry) {
    this._entries.push(entry);
    return entry;
  },
  all() {
    return [...this._entries];
  },
};

export const orchestratorDelta = new EventEmitter();

export class ExternalHubService {
  async ingest(source: ExternalSource, payload: unknown): Promise<ExternalSummary[]> {
    const normalized = await this.normalize(source, payload);
    const filtered = filterNoise(normalized);
    const milestones = classifyMilestones(filtered);
    const summaries = await this.summarize(milestones);
    const entries = this.persist(summaries);

    orchestratorDelta.emit('external_ingest', { type: 'external_ingest', entries });
    return entries;
  }

  async normalize(source: ExternalSource, data: any): Promise<ExternalEvent[]> {
    switch (source) {
      case 'github':
        return githubAdapter(data);
      case 'instagram':
        return instagramAdapter(data);
      case 'x':
        return xAdapter(data);
      case 'calendar':
        return calendarAdapter(data);
      case 'photos':
        return photosAdapter(data);
      default:
        return [];
    }
  }

  summarize(milestones: ExternalEvent[]): Promise<ExternalSummary[]> {
    return summarizeMilestonesBridge(milestones);
  }

  persist(entries: ExternalSummary[]): ExternalSummary[] {
    entries.forEach((entry) => timelineRepo.create(entry));
    return entries;
  }

  getStatus() {
    const entries = timelineRepo.all();
    const lastBySource: Record<ExternalSource, ExternalSummary | undefined> = {
      github: undefined,
      instagram: undefined,
      x: undefined,
      calendar: undefined,
      photos: undefined,
    };

    entries.forEach((entry) => {
      lastBySource[entry.source] = entry;
    });

    return {
      sources: Object.entries(lastBySource).map(([source, entry]) => ({
        source: source as ExternalSource,
        connected: Boolean(entry),
        lastSync: entry?.timestamp ?? null,
      })),
      timeline: entries,
    };
  }
}

export const externalHubService = new ExternalHubService();
