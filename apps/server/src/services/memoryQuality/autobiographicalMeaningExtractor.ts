/**
 * Deterministic autobiographical meaning extraction.
 *
 * Expands who/where/when into intent, lessons, behavior change, causal chains,
 * and continuity — without LLM calls. Only emits claims with explicit textual evidence.
 */

export type MeaningNodeKind =
  | 'past_event'
  | 'current_event'
  | 'behavior_change'
  | 'identity_growth'
  | 'lesson'
  | 'intent'
  | 'outcome'
  | 'future_continuity'
  | 'emotion'
  | 'motivation';

export type MeaningEdgeKind =
  | 'taught'
  | 'caused'
  | 'led_to'
  | 'informed'
  | 'will_apply'
  | 'motivated';

export type MeaningNode = {
  kind: MeaningNodeKind;
  label: string;
  evidence: string;
  confidence: number;
  /** Epistemic status of this node */
  epistemicType?: 'direct_statement' | 'deterministic_inference';
};

export type MeaningEdge = {
  kind: MeaningEdgeKind;
  fromIndex: number;
  toIndex: number;
  evidence: string;
  confidence: number;
};

export type CausalChain = {
  pastEvent?: string;
  behaviorChange?: string;
  currentEvent?: string;
  identityGrowth?: string;
  futureContinuity?: string;
  evidencePhrases: string[];
  confidence: number;
};

export type AutobiographicalMeaning = {
  nodes: MeaningNode[];
  edges: MeaningEdge[];
  chains: CausalChain[];
  lessons: Array<{ lesson: string; source?: string; evidence: string; confidence: number }>;
  intents: Array<{ intent: string; evidence: string; confidence: number }>;
  outcomes: Array<{ outcome: string; evidence: string; confidence: number }>;
  emotions: Array<{ emotion: string; evidence: string; confidence: number }>;
  evidenceCount: number;
  overallConfidence: number;
};

const LESSON_RES: Array<{ re: RegExp; conf: number }> = [
  {
    re: /\b(?:what happened with|the situation with|my experience with)\s+([A-Z][\w'.-]+)\s+taught me\s+(?:to\s+)?([^.!?\n]{4,120})/gi,
    conf: 0.92,
  },
  {
    re: /\b([A-Z][\w'.-]+)\s+taught me\s+(?:to\s+)?([^.!?\n]{4,120})/gi,
    conf: 0.88,
  },
  {
    re: /\b(?:I\s+)?learned\s+(?:that\s+|to\s+)?([^.!?\n]{4,120})\s+(?:from|because of|after)\s+([^.!?\n]{2,80})/gi,
    conf: 0.86,
  },
  {
    re: /\b(?:I\s+)?learned\s+(?:that\s+|to\s+)?([^.!?\n]{4,120})/gi,
    conf: 0.8,
  },
  {
    re: /\b(?:that|this)\s+taught me\s+(?:to\s+)?([^.!?\n]{4,120})/gi,
    conf: 0.84,
  },
];

const BECAUSE_BEHAVIOR_RE =
  /\bI\s+(backed off|left|stayed|apologized|waited|spoke up|said nothing|respected (?:her|his|their) boundary|kept my distance)[^.!?\n]{0,80}?\bbecause\b[^.!?\n]{0,120}/gi;

const INTENT_RES: Array<{ re: RegExp; conf: number }> = [
  { re: /\bI (?:wanted|want|hoped|meant|tried|planned) to ([^.!?\n]{3,100})/gi, conf: 0.82 },
  { re: /\bso (?:that|I could) ([^.!?\n]{3,100})/gi, conf: 0.72 },
  { re: /\bin order to ([^.!?\n]{3,100})/gi, conf: 0.8 },
];

const OUTCOME_RES: Array<{ re: RegExp; conf: number }> = [
  { re: /\b(?:ended up|resulted in|turned out|so I)\s+([^.!?\n]{3,100})/gi, conf: 0.78 },
  { re: /\b(?:which|that)\s+(?:made me|left me|helped me)\s+([^.!?\n]{3,100})/gi, conf: 0.8 },
  { re: /\bI (?:succeeded|failed|finished|completed|quit|gave up)(?:\s+([^.!?\n]{0,80}))?/gi, conf: 0.76 },
];

const IDENTITY_RES: Array<{ re: RegExp; conf: number }> = [
  { re: /\bI(?:'m| am) (?:becoming|getting) (?:more |better at )?([^.!?\n]{3,80})/gi, conf: 0.84 },
  { re: /\bI(?:'ve| have) (?:grown|changed|improved)(?:\s+(?:as|in|at))?\s+([^.!?\n]{3,80})/gi, conf: 0.86 },
  { re: /\b(?:this|that)\s+(?:changed|shaped|defined)\s+(?:how I|who I|my)\s+([^.!?\n]{3,80})/gi, conf: 0.85 },
  { re: /\bimproved (?:my )?([^.!?\n]{3,60}awareness|confidence|boundaries|patience|skills?)/gi, conf: 0.83 },
];

const FUTURE_RES: Array<{ re: RegExp; conf: number }> = [
  { re: /\b(?:from now on|next time|in the future|going forward)[^.!?\n]{0,100}/gi, conf: 0.84 },
  { re: /\bI(?:'ll| will) (?:try to |always |never )?([^.!?\n]{3,100})/gi, conf: 0.75 },
  { re: /\buse this (?:lesson|experience|insight)[^.!?\n]{0,80}/gi, conf: 0.86 },
];

const EMOTION_RES: Array<{ re: RegExp; emotion: string; conf: number }> = [
  { re: /\bI felt (?:really |so |very )?(proud|sad|happy|anxious|scared|relieved|guilty|grateful|embarrassed|angry|lonely|excited)\b/gi, emotion: '$1', conf: 0.88 },
  { re: /\b(?:made me feel|left me feeling)\s+(proud|sad|happy|anxious|scared|relieved|grateful|embarrassed|angry)\b/gi, emotion: '$1', conf: 0.86 },
  { re: /\bI was (?:really |so |very )?(nervous|excited|overwhelmed|calm|confident|insecure)\b/gi, emotion: '$1', conf: 0.84 },
];

// Person-centric past anchors only (avoid place names like "Anime Expo")
const PAST_ANCHOR_RES: Array<{ re: RegExp; conf: number }> = [
  { re: /\bbecause (?:of )?(?:what happened with |the situation with )([A-Z][\w'.-]+)/g, conf: 0.8 },
  { re: /\bafter (?:what happened with |my experience with )([A-Z][\w'.-]+)/g, conf: 0.78 },
  { re: /\bfrom (?:my time with |working with )([A-Z][\w'.-]+)/g, conf: 0.72 },
];

const PLACE_FALSE_POSITIVE =
  /^(Anime|Expo|Catch|One|Lake|Austin|Park|Street|Club|House|City|Town)$/i;

function clip(s: string, n = 160): string {
  return s.trim().replace(/\s+/g, ' ').slice(0, n);
}

function collect(re: RegExp, text: string): RegExpExecArray[] {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  return [...text.matchAll(new RegExp(re.source, flags))] as RegExpExecArray[];
}

/**
 * Extract autobiographical meaning graph from a single user message.
 * Pure / deterministic — safe for unit tests and offline scoring.
 */
/** Hard negatives: technical / fictional / non-autobiographical — skip deep meaning. */
export function isNonAutobiographicalContext(text: string): boolean {
  const t = text.toLowerCase();
  // Fiction / media lessons about third parties
  if (/\b(in (?:the )?(?:show|movie|book|anime|manga|episode)|one piece|luffy|naruto|harry potter|star wars)\b/i.test(text)) {
    return true;
  }
  // AI-generated self-description as evidence
  if (/\b(?:the ai|chatgpt|claude|the assistant|lorekeeper|lorebook)\s+said\b/i.test(t)) {
    return true;
  }
  // Pure technical ops without first-person life context beyond IT
  if (
    /\b(backed up|backup|restore|deployed|merged the pr|pulled (?:the )?cable|restarted the server|database|schema migration)\b/i.test(t) &&
    !/\b(felt|taught me|relationship|friend|family|dating|boundaries)\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

function isFactualLearningNotLifeLesson(lesson: string): boolean {
  const l = lesson.toLowerCase();
  // "learned that the meeting starts at nine"
  if (/\b(meeting|starts at|schedule|password|deadline|room number|ip address|port)\b/.test(l)) {
    return true;
  }
  if (/^\d/.test(l.trim())) return true;
  return false;
}

function isConditionalOrWish(text: string): boolean {
  return /\b(I wish|if I |if I had|someday if|hypothetically|in a dream|I dreamed|I would )\b/i.test(
    text,
  );
}

function isThirdPartyReport(text: string): boolean {
  return /\b(?:my friend|he|she|they|someone)\s+said\s+(?:I|i'm|that I)\b/i.test(text);
}

export function extractAutobiographicalMeaning(text: string): AutobiographicalMeaning {
  const raw = text?.trim() ?? '';
  if (raw.length < 8) {
    return emptyMeaning();
  }

  // Non-autobiographical technical/fictional contexts: extract nothing deep
  if (isNonAutobiographicalContext(raw)) {
    return emptyMeaning();
  }

  const nodes: MeaningNode[] = [];
  const edges: MeaningEdge[] = [];
  const lessons: AutobiographicalMeaning['lessons'] = [];
  const intents: AutobiographicalMeaning['intents'] = [];
  const outcomes: AutobiographicalMeaning['outcomes'] = [];
  const emotions: AutobiographicalMeaning['emotions'] = [];
  const chains: CausalChain[] = [];
  const evidenceSet = new Set<string>();
  const conditional = isConditionalOrWish(raw);
  const thirdPartyReport = isThirdPartyReport(raw);

  // Lessons + optional source person/situation
  for (const { re, conf } of LESSON_RES) {
    for (const m of collect(re, raw)) {
      const evidence = clip(m[0]);
      evidenceSet.add(evidence);
      if (m.length >= 3 && m[2]) {
        // pattern with source + lesson
        const source = clip(m[1], 60);
        const lesson = clip(m[2], 120);
        if (isFactualLearningNotLifeLesson(lesson)) continue;
        const c = conditional ? conf * 0.55 : conf;
        lessons.push({ lesson, source, evidence, confidence: c });
        const pastIdx = nodes.length;
        nodes.push({
          kind: 'past_event',
          label: source,
          evidence,
          confidence: c * 0.95,
          epistemicType: 'direct_statement',
        });
        const lessonIdx = nodes.length;
        nodes.push({
          kind: 'lesson',
          label: lesson,
          evidence,
          confidence: c,
          epistemicType: 'direct_statement',
        });
        // Only mark behavior_change when "taught me to <verb>" (actionable), not bare facts
        if (/\b(to |respect |stop |start |give |listen )/i.test(evidence) || /^to\s/i.test(lesson)) {
          const behIdx = nodes.length;
          nodes.push({
            kind: 'behavior_change',
            label: lesson.startsWith('to ') ? lesson : `practice: ${lesson}`,
            evidence,
            confidence: c * 0.85,
            epistemicType: 'deterministic_inference',
          });
          edges.push({ kind: 'taught', fromIndex: pastIdx, toIndex: lessonIdx, evidence, confidence: c });
          edges.push({ kind: 'led_to', fromIndex: lessonIdx, toIndex: behIdx, evidence, confidence: c * 0.85 });
        } else {
          edges.push({ kind: 'taught', fromIndex: pastIdx, toIndex: lessonIdx, evidence, confidence: c });
        }
      } else if (m[1]) {
        const lesson = clip(m[1], 120);
        if (isFactualLearningNotLifeLesson(lesson)) continue;
        const c = conditional ? conf * 0.55 : conf;
        lessons.push({ lesson, evidence, confidence: c });
        nodes.push({
          kind: 'lesson',
          label: lesson,
          evidence,
          confidence: c,
          epistemicType: 'direct_statement',
        });
      }
    }
  }

  // Behavior with because clause → chain to current action
  // Require interpersonal / boundary context — not "backed up the database" / "pulled back the cable"
  for (const m of collect(BECAUSE_BEHAVIOR_RE, raw)) {
    const evidence = clip(m[0]);
    if (/\b(database|backup|cable|server|file|commit|branch)\b/i.test(evidence)) continue;
    if (!/\b(because|boundary|space|away|pressure|respect)\b/i.test(evidence) && !lessons.length) {
      continue;
    }
    evidenceSet.add(evidence);
    const behavior = clip(m[1] ?? m[0], 80);
    const curIdx = nodes.length;
    nodes.push({
      kind: 'current_event',
      label: behavior,
      evidence,
      confidence: 0.88,
      epistemicType: 'deterministic_inference',
    });
    // Link latest lesson/behavior_change to this current event
    const lessonIdx = nodes.findIndex((n) => n.kind === 'lesson' || n.kind === 'behavior_change');
    if (lessonIdx >= 0) {
      edges.push({
        kind: 'informed',
        fromIndex: lessonIdx,
        toIndex: curIdx,
        evidence,
        confidence: 0.9,
      });
    }
  }

  // Interpersonal "pulled away" / "gave her space" without "because" still supports
  // current_event when a lesson already exists (Genni → Catch One continuity).
  if (lessons.length > 0) {
    const spaceRe =
      /\bI\s+(?:stopped|backed off|gave (?:her|him|them) space|respected (?:her|his|their) boundary|didn't pressure)\b[^.!?\n]{0,80}/gi;
    for (const m of collect(spaceRe, raw)) {
      const evidence = clip(m[0]);
      if (/\b(database|backup|cable|server)\b/i.test(evidence)) continue;
      evidenceSet.add(evidence);
      const curIdx = nodes.length;
      nodes.push({
        kind: 'current_event',
        label: clip(m[0], 80),
        evidence,
        confidence: 0.86,
        epistemicType: 'deterministic_inference',
      });
      const lessonIdx = nodes.findIndex((n) => n.kind === 'lesson');
      if (lessonIdx >= 0) {
        edges.push({
          kind: 'informed',
          fromIndex: lessonIdx,
          toIndex: curIdx,
          evidence,
          confidence: 0.88,
        });
      }
    }
  }

  // Intents
  for (const { re, conf } of INTENT_RES) {
    for (const m of collect(re, raw)) {
      if (!m[1]) continue;
      const evidence = clip(m[0]);
      evidenceSet.add(evidence);
      const intent = clip(m[1], 100);
      intents.push({ intent, evidence, confidence: conf });
      nodes.push({ kind: 'intent', label: intent, evidence, confidence: conf });
    }
  }

  // Outcomes
  for (const { re, conf } of OUTCOME_RES) {
    for (const m of collect(re, raw)) {
      const evidence = clip(m[0]);
      evidenceSet.add(evidence);
      const outcome = clip((m[1] || m[0]).trim(), 100);
      if (outcome.length < 3) continue;
      outcomes.push({ outcome, evidence, confidence: conf });
      nodes.push({ kind: 'outcome', label: outcome, evidence, confidence: conf });
    }
  }

  // Identity growth — skip pure third-party reports (not established self-truth)
  if (!thirdPartyReport) {
    for (const { re, conf } of IDENTITY_RES) {
      for (const m of collect(re, raw)) {
        if (!m[1] && !m[0]) continue;
        const evidence = clip(m[0]);
        evidenceSet.add(evidence);
        const label = clip(m[1] || m[0], 100);
        const c = conditional ? conf * 0.5 : conf;
        nodes.push({
          kind: 'identity_growth',
          label,
          evidence,
          confidence: c,
          epistemicType: 'direct_statement',
        });
      }
    }
  }

  // Future continuity — skip bare conditionals ("If I get the job, I'll move")
  if (!conditional) {
    for (const { re, conf } of FUTURE_RES) {
      for (const m of collect(re, raw)) {
        const evidence = clip(m[0]);
        // "I'll move" alone without from now on / lesson context is weak plan noise
        if (/^I(?:'ll| will)\s/i.test(evidence) && !/\b(from now on|next time|going forward|use this)\b/i.test(raw)) {
          continue;
        }
        evidenceSet.add(evidence);
        const label = clip(m[1] || m[0], 100);
        nodes.push({
          kind: 'future_continuity',
          label,
          evidence,
          confidence: conf,
          epistemicType: 'direct_statement',
        });
      }
    }
  }

  // Emotions (explicit only)
  for (const { re, emotion, conf } of EMOTION_RES) {
    for (const m of collect(re, raw)) {
      const evidence = clip(m[0]);
      evidenceSet.add(evidence);
      const em = (m[1] || emotion.replace('$1', m[1] || '')).toLowerCase();
      if (!em) continue;
      emotions.push({ emotion: em, evidence, confidence: conf });
      nodes.push({ kind: 'emotion', label: em, evidence, confidence: conf });
    }
  }

  // Past anchors without full "taught me" phrasing
  for (const { re, conf } of PAST_ANCHOR_RES) {
    for (const m of collect(re, raw)) {
      if (!m[1]) continue;
      const evidence = clip(m[0]);
      evidenceSet.add(evidence);
      const label = clip(m[1], 60);
      if (PLACE_FALSE_POSITIVE.test(label)) continue;
      if (nodes.some((n) => n.kind === 'past_event' && n.label.toLowerCase() === label.toLowerCase())) {
        continue;
      }
      nodes.push({ kind: 'past_event', label, evidence, confidence: conf });
    }
  }

  // Deduplicate lessons by normalized label
  const seenLessons = new Set<string>();
  const dedupedLessons = lessons.filter((l) => {
    const k = l.lesson.toLowerCase();
    if (seenLessons.has(k)) return false;
    seenLessons.add(k);
    return true;
  });
  lessons.length = 0;
  lessons.push(...dedupedLessons);

  // Build primary chain if we have past + lesson/behavior + current
  const past = nodes.find((n) => n.kind === 'past_event');
  const lesson = nodes.find((n) => n.kind === 'lesson');
  const behavior = nodes.find((n) => n.kind === 'behavior_change');
  const current = nodes.find((n) => n.kind === 'current_event');
  const identity = nodes.find((n) => n.kind === 'identity_growth');
  const future = nodes.find((n) => n.kind === 'future_continuity');

  if (past || lesson || behavior || current) {
    const chainEvidence = [past, lesson, behavior, current, identity, future]
      .filter(Boolean)
      .map((n) => n!.evidence);
    const confs = [past, lesson, behavior, current, identity, future]
      .filter(Boolean)
      .map((n) => n!.confidence);
    chains.push({
      pastEvent: past?.label,
      behaviorChange: behavior?.label || (lesson ? `practice: ${lesson.label}` : undefined),
      currentEvent: current?.label,
      identityGrowth: identity?.label,
      futureContinuity: future?.label,
      evidencePhrases: [...new Set(chainEvidence)],
      confidence: confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0,
    });

    // Synthetic future continuity only for interpersonal life lessons (not meeting times)
    if (
      lesson &&
      !future &&
      !conditional &&
      /boundary|respect|patience|listen|communicat|honest|trust/i.test(lesson.label)
    ) {
      const futLabel = `Apply lesson in future interactions: ${lesson.label}`;
      const futIdx = nodes.length;
      nodes.push({
        kind: 'future_continuity',
        label: futLabel,
        evidence: lesson.evidence,
        confidence: lesson.confidence * 0.55,
        epistemicType: 'deterministic_inference',
      });
      edges.push({
        kind: 'will_apply',
        fromIndex: nodes.findIndex((n) => n.kind === 'lesson'),
        toIndex: futIdx,
        evidence: lesson.evidence,
        confidence: lesson.confidence * 0.55,
      });
      chains[0].futureContinuity = futLabel;
    }

    // Identity growth: only soft inference when explicit interpersonal lesson + concrete
    // later behavior — never claim permanent transformation.
    if (
      lesson &&
      !identity &&
      current &&
      !conditional &&
      !thirdPartyReport &&
      /boundary|respect|patience|listen|communicat/i.test(lesson.label)
    ) {
      const idLabel = 'Growing social awareness around boundaries';
      const idIdx = nodes.length;
      nodes.push({
        kind: 'identity_growth',
        label: idLabel,
        evidence: lesson.evidence,
        confidence: Math.min(0.72, lesson.confidence * 0.65),
        epistemicType: 'deterministic_inference',
      });
      const lessonIdx = nodes.findIndex((n) => n.kind === 'lesson');
      if (lessonIdx >= 0) {
        edges.push({
          kind: 'led_to',
          fromIndex: lessonIdx,
          toIndex: idIdx,
          evidence: lesson.evidence,
          confidence: lesson.confidence * 0.65,
        });
      }
      chains[0].identityGrowth = idLabel;
    }
  }

  // Third-party reports are not established identity truth
  if (thirdPartyReport) {
    for (const n of nodes) {
      if (n.kind === 'identity_growth') {
        n.confidence = Math.min(n.confidence, 0.55);
        n.epistemicType = 'deterministic_inference';
        n.label = `Reported observation: ${n.label}`;
      }
    }
  }

  const overallConfidence =
    nodes.length === 0
      ? 0
      : nodes.reduce((s, n) => s + n.confidence, 0) / nodes.length;

  return {
    nodes,
    edges,
    chains,
    lessons,
    intents,
    outcomes,
    emotions,
    evidenceCount: evidenceSet.size,
    overallConfidence,
  };
}

function emptyMeaning(): AutobiographicalMeaning {
  return {
    nodes: [],
    edges: [],
    chains: [],
    lessons: [],
    intents: [],
    outcomes: [],
    emotions: [],
    evidenceCount: 0,
    overallConfidence: 0,
  };
}

/** Enrich resolved_events.metadata.meaning without inventing facts. */
export function meaningToEventMetadata(meaning: AutobiographicalMeaning): Record<string, unknown> | null {
  if (meaning.nodes.length === 0 && meaning.chains.length === 0) return null;
  return {
    lessons: meaning.lessons,
    intents: meaning.intents,
    outcomes: meaning.outcomes,
    emotions: meaning.emotions,
    chains: meaning.chains,
    nodes: meaning.nodes.map((n) => ({
      kind: n.kind,
      label: n.label,
      confidence: n.confidence,
      evidence: n.evidence,
    })),
    edges: meaning.edges,
    evidenceCount: meaning.evidenceCount,
    overallConfidence: meaning.overallConfidence,
    extractor: 'autobiographicalMeaningExtractor',
    extractorVersion: 'v1',
  };
}
