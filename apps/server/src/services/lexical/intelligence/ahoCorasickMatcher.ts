/**
 * Aho–Corasick multi-pattern matcher — O(n + m + z) text scan.
 */

type AhoNode = {
  next: Map<string, AhoNode>;
  fail: AhoNode | null;
  outputs: number[];
};

function createNode(): AhoNode {
  return { next: new Map(), fail: null, outputs: [] };
}

export type AhoPatternSpec = {
  id: number;
  phrase: string;
  caseInsensitive: boolean;
};

export type AhoMatch = {
  patternId: number;
  start: number;
  end: number;
};

export class AhoCorasickMatcher {
  private readonly root = createNode();
  private readonly patterns: AhoPatternSpec[] = [];
  private built = false;

  register(spec: Omit<AhoPatternSpec, 'id'>): number {
    const id = this.patterns.length;
    this.patterns.push({ ...spec, id });
    this.built = false;
    return id;
  }

  getPattern(id: number): AhoPatternSpec {
    return this.patterns[id]!;
  }

  build(): void {
    if (this.built) return;

    for (const spec of this.patterns) {
      let node = this.root;
      const key = spec.phrase.toLowerCase();
      for (const ch of key) {
        let next = node.next.get(ch);
        if (!next) {
          next = createNode();
          node.next.set(ch, next);
        }
        node = next;
      }
      if (!node.outputs.includes(spec.id)) node.outputs.push(spec.id);
    }

    const queue: AhoNode[] = [];
    for (const child of this.root.next.values()) {
      child.fail = this.root;
      queue.push(child);
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const [ch, child] of current.next) {
        queue.push(child);
        let fail: AhoNode | null = current.fail;
        while (fail && !fail.next.has(ch)) fail = fail.fail;
        child.fail = fail?.next.get(ch) ?? this.root;
        for (const out of child.fail.outputs) {
          if (!child.outputs.includes(out)) child.outputs.push(out);
        }
      }
    }

    this.built = true;
  }

  search(text: string): AhoMatch[] {
    this.build();
    const matches: AhoMatch[] = [];
    let node: AhoNode = this.root;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i]!.toLowerCase();
      while (node !== this.root && !node.next.has(ch)) node = node.fail ?? this.root;
      node = node.next.get(ch) ?? this.root;

      if (node.outputs.length === 0) continue;

      for (const patternId of node.outputs) {
        const spec = this.patterns[patternId]!;
        const len = spec.phrase.length;
        const start = i - len + 1;
        const end = i + 1;
        if (start < 0) continue;

        const slice = text.slice(start, end);
        if (spec.caseInsensitive) {
          if (slice.toLowerCase() !== spec.phrase.toLowerCase()) continue;
        } else if (slice !== spec.phrase) {
          continue;
        }

        matches.push({ patternId, start, end });
      }
    }

    return matches;
  }
}
