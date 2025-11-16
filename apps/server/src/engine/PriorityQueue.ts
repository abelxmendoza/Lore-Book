export interface QueueItem<T> {
  priority: number;
  value: T;
}

/**
 * Binary heap priority queue for task scheduling.
 */
export class PriorityQueue<T> {
  private heap: QueueItem<T>[] = [];

  constructor(private comparator: (a: number, b: number) => boolean = (a, b) => a < b) {}

  private parent(index: number): number {
    return Math.floor((index - 1) / 2);
  }

  private left(index: number): number {
    return index * 2 + 1;
  }

  private right(index: number): number {
    return index * 2 + 2;
  }

  push(item: QueueItem<T>): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): QueueItem<T> | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const end = this.heap.pop();
    if (this.heap.length > 0 && end) {
      this.heap[0] = end;
      this.bubbleDown(0);
    }
    return top;
  }

  peek(): QueueItem<T> | undefined {
    return this.heap[0];
  }

  size(): number {
    return this.heap.length;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = this.parent(index);
      if (this.comparator(this.heap[index].priority, this.heap[parentIndex].priority)) {
        [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
        index = parentIndex;
      } else {
        break;
      }
    }
  }

  private bubbleDown(index: number): void {
    const length = this.heap.length;
    while (true) {
      const leftIndex = this.left(index);
      const rightIndex = this.right(index);
      let smallest = index;

      if (
        leftIndex < length &&
        this.comparator(this.heap[leftIndex].priority, this.heap[smallest].priority)
      ) {
        smallest = leftIndex;
      }

      if (
        rightIndex < length &&
        this.comparator(this.heap[rightIndex].priority, this.heap[smallest].priority)
      ) {
        smallest = rightIndex;
      }

      if (smallest !== index) {
        [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
        index = smallest;
      } else {
        break;
      }
    }
  }
}
