import { EventEmitter } from 'events';

type EventPayload<T> = { events: T[] };

type FlushHandler<T> = (payload: EventPayload<T>) => Promise<void> | void;

/**
 * Micro-batching ingest pipe with bounded queue and debounce.
 */
export class EventIngestPipe<T> extends EventEmitter {
  private queue: T[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly flushHandler: FlushHandler<T>,
    private readonly debounceMs = 200,
    private readonly maxBatchSize = 10,
    private readonly capacity = 200
  ) {
    super();
  }

  enqueue(event: T): void {
    if (this.queue.length >= this.capacity) {
      this.emit('overflow', event);
      return;
    }
    this.queue.push(event);
    if (this.queue.length >= this.maxBatchSize) {
      this.flush();
      return;
    }
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.flush();
    }, this.debounceMs);
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.queue.length) return;
    const payload = { events: [...this.queue] };
    this.queue = [];
    Promise.resolve(this.flushHandler(payload)).catch((err) => this.emit('error', err));
  }
}
