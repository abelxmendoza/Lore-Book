// =====================================================
// MEMORY FEEDBACK BUS
//
// Bridges the async ingestion pipeline back to the HTTP polling endpoint.
// When the pipeline completes for a given chatMessageId, it emits here.
// The polling endpoint either finds cached data immediately or waits up
// to 8s for the event (long-poll).
//
// Lifetime: in-process only. Restarts clear the cache — that's acceptable
// since feedback is ephemeral/observational, not load-bearing.
// =====================================================

import { EventEmitter } from 'events';

export interface MemoryFeedbackEvent {
  chatMessageId: string;
  userId: string;
  timestamp: string;
  processingTimeMs: number;
  pipelineComplete: boolean;

  // Epistemic classification of what was said
  knowledgeUnits: Array<{
    type: 'EXPERIENCE' | 'FEELING' | 'BELIEF' | 'FACT' | 'DECISION' | 'QUESTION';
    content: string;
    confidence: number;
    certaintySource: string;
    temporalScope: 'MOMENT' | 'PERIOD' | 'ONGOING' | 'UNKNOWN';
  }>;

  // Emotional fingerprint of the message
  emotionalSignals: {
    emotions: string[];
    intensity: 'LOW' | 'MEDIUM' | 'HIGH' | null;
    isVenting: boolean;
  };

  // Who / what was mentioned
  entitiesDetected: Array<{
    name: string;
    type: string;
  }>;

  // Whether a time reference was anchored
  temporalAnchor: {
    detected: boolean;
    precision?: string;
    confidence?: number;
  };

  // Any contradictions that surfaced
  contradictionsDetected: Array<{
    description: string;
  }>;
}

// ─── Bus ─────────────────────────────────────────────────────────────────────

class MemoryFeedbackBus extends EventEmitter {
  private readonly cache = new Map<string, { data: MemoryFeedbackEvent; expiresAt: number }>();
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor() {
    super();
    this.setMaxListeners(200); // one waiter per active chat connection
  }

  /** Called by the ingestion pipeline when it finishes processing a message. */
  publish(chatMessageId: string, data: MemoryFeedbackEvent): void {
    this.cache.set(chatMessageId, { data, expiresAt: Date.now() + this.TTL_MS });
    this.emit(`feedback:${chatMessageId}`, data);
  }

  /** Returns cached feedback if already ready, null otherwise. */
  get(chatMessageId: string): MemoryFeedbackEvent | null {
    const entry = this.cache.get(chatMessageId);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(chatMessageId);
      return null;
    }
    return entry.data;
  }

  /**
   * Long-poll: resolves immediately if data is cached, otherwise waits up to
   * timeoutMs for the pipeline to emit it. Returns null on timeout.
   */
  waitFor(chatMessageId: string, timeoutMs = 8000): Promise<MemoryFeedbackEvent | null> {
    const cached = this.get(chatMessageId);
    if (cached) return Promise.resolve(cached);

    return new Promise((resolve) => {
      const eventKey = `feedback:${chatMessageId}`;

      const timer = setTimeout(() => {
        this.off(eventKey, handler);
        resolve(null);
      }, timeoutMs);

      const handler = (data: MemoryFeedbackEvent) => {
        clearTimeout(timer);
        resolve(data);
      };

      this.once(eventKey, handler);
    });
  }

  /** Evict expired entries. Call periodically or on GC pressure. */
  evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) this.cache.delete(key);
    }
  }
}

export const memoryFeedbackBus = new MemoryFeedbackBus();

// Sweep expired cache entries every 10 minutes
setInterval(() => memoryFeedbackBus.evictExpired(), 10 * 60 * 1000).unref();
