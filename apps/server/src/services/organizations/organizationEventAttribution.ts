/**
 * Organization event attribution
 *
 * Event→organization association is not membership, not a mention, and not
 * relationship history. An org on an event must carry a role, evidence, and
 * whether Organization Timeline may show it.
 *
 * Storage: resolved_events.metadata.organizationAttributions (no new table).
 */

export type OrganizationEventRole =
  | 'employer'
  | 'host'
  | 'organizer'
  | 'institution'
  | 'interview_target'
  | 'client'
  | 'vendor'
  | 'project_owner'
  | 'community'
  | 'software_tool'
  | 'referenced'
  | 'department'
  | 'parent_context';

export type OrganizationCatalogEntry = {
  id: string;
  name: string;
  aliases?: string[];
  parentGroupId?: string | null;
  groupType?: string | null;
};

export type OrganizationAttribution = {
  organizationId: string | null;
  organizationName: string;
  role: OrganizationEventRole;
  evidence: string;
  evidenceKind: string;
  confidence: number;
  accepted: boolean;
  canonical: boolean;
  acceptedForOrganizationTimeline: boolean;
  direct: boolean;
  derivedFrom?: string | null;
  whyIncluded: string;
  sourceSpan?: string;
  subjectCharacterHint?: string | null;
  protagonistRelation: boolean;
  unresolved: boolean;
  rejected?: boolean;
  correctionHistory?: Array<{
    at: string;
    action: 'swap' | 'retract' | 'accept';
    fromOrganizationId?: string | null;
    toOrganizationId?: string | null;
    role?: OrganizationEventRole;
  }>;
};

export type OrganizationTimelineInclusion = {
  canonicalEventId?: string;
  organizationId: string;
  organizationName: string;
  role: OrganizationEventRole;
  direct: boolean;
  derivedFrom?: string | null;
  evidence: string;
  evidenceKind: string;
  confidence: number;
  accepted: boolean;
  acceptedForOrganizationTimeline: boolean;
  whyIncluded: string;
  sourceSpan?: string;
};

const TIMELINE_ROLES = new Set<OrganizationEventRole>([
  'employer',
  'host',
  'organizer',
  'institution',
  'interview_target',
  'client',
  'vendor',
  'project_owner',
  'community',
  'department',
  'parent_context',
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function labelsFor(org: OrganizationCatalogEntry): string[] {
  const labels = [org.name, ...(org.aliases ?? [])]
    .map((label) => label.trim())
    .filter((label) => label.length >= 2);
  return [...new Set(labels)].sort((a, b) => b.length - a.length);
}

function findMention(span: string, label: string): { index: number; matched: string } | null {
  const pattern = new RegExp(`\\b${escapeRegExp(label)}\\b`, 'i');
  const match = span.match(pattern);
  if (!match || match.index == null) return null;
  return { index: match.index, matched: match[0] };
}

function windowAround(span: string, index: number, length: number): string {
  const start = Math.max(0, index - 72);
  const end = Math.min(span.length, index + length + 72);
  return span.slice(start, end);
}

function splitSpans(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+|(?<=;)\s+/)
    .map((span) => span.trim())
    .filter(Boolean);
}

function isSoftwareOrg(org: OrganizationCatalogEntry): boolean {
  const type = (org.groupType ?? '').toLowerCase();
  return type === 'software' || type === 'platform' || type === 'vendor';
}

function classifyMention(input: {
  span: string;
  window: string;
  org: OrganizationCatalogEntry;
  label: string;
}): Omit<OrganizationAttribution, 'organizationId' | 'organizationName' | 'direct' | 'derivedFrom'> {
  const w = input.window;
  const lower = w.toLowerCase();
  const name = escapeRegExp(input.label);

  const thirdParty = new RegExp(
    String.raw`\b(?:my|a|our)\s+(?:friend|coworker|colleague|teammate|brother|sister|cousin|roommate)\b.{0,48}\b(?:works? at|working at|job at|hired by|recruits? for)`,
    'i',
  ).test(w)
    || new RegExp(
      String.raw`\b([A-Z][a-z]{2,24})\s+(?:works? at|working at|graduated from|recruits? for|got into)\s+${name}\b`,
    ).test(w);

  const thinking = new RegExp(
    String.raw`\b(?:thinking about|thought about|read about|heard about|drove past)\s+${name}\b`,
    'i',
  ).test(w);

  const usedTool = new RegExp(String.raw`\b(?:used|using|via)\s+${name}\b`, 'i').test(w)
    || isSoftwareOrg(input.org);

  const host = new RegExp(
    String.raw`\b(?:${name})\s+(?:hosted|threw|organized|put on)\b|\b(?:hosted|threw|organized|put on)\s+(?:by|at)\s+${name}\b`,
    'i',
  ).test(w);

  const interview = new RegExp(
    String.raw`\b(?:i\s+)?interview(?:ed|ing)?\s+(?:with|at|for)\s+${name}\b`,
    'i',
  ).test(w);

  const work = new RegExp(
    String.raw`\b(?:i|we)\s+(?:started working|start working|work(?:ed|ing)?|got (?:a |the )?job|was hired|onboard(?:ed|ing)?)\b.{0,40}\b(?:at|with|for)\s+${name}\b|\b(?:started working|working|worked|onboard(?:ed|ing)?)\s+(?:at|with)\s+${name}\b|\bjob at\s+${name}\b`,
    'i',
  ).test(w);

  const institution = new RegExp(
    String.raw`\b(?:graduated from|enrolled at|student at|attended|class at)\s+${name}\b`,
    'i',
  ).test(w);

  const department = /\b(?:lab|team|department|division|office)\b/i.test(w)
    && new RegExp(String.raw`\bat\s+${name}\b`, 'i').test(w)
    && !work;

  const personHint = w.match(
    /\b(?:my|a|our)\s+(friend|coworker|colleague)|(\b[A-Z][a-z]{2,24})\s+(?:works? at|graduated from|recruits? for)/i,
  );
  const subjectCharacterHint = personHint
    ? (personHint[1] || personHint[2] || null)
    : null;

  if (thinking && !work && !host && !interview) {
    return {
      role: 'referenced',
      evidence: w.trim(),
      evidenceKind: 'reference_phrase',
      confidence: 0.82,
      accepted: true,
      canonical: Boolean(input.org.id),
      acceptedForOrganizationTimeline: false,
      whyIncluded: 'Referenced only — not organization participation',
      sourceSpan: input.span,
      subjectCharacterHint,
      protagonistRelation: false,
      unresolved: false,
    };
  }

  if (usedTool && !work && !host && !interview && !institution) {
    return {
      role: 'software_tool',
      evidence: w.trim(),
      evidenceKind: 'software_use_phrase',
      confidence: 0.86,
      accepted: true,
      canonical: Boolean(input.org.id),
      acceptedForOrganizationTimeline: false,
      whyIncluded: 'Software/tool context — not employer, host, or membership',
      sourceSpan: input.span,
      subjectCharacterHint,
      protagonistRelation: false,
      unresolved: false,
    };
  }

  if (thirdParty && institution) {
    return {
      role: 'institution',
      evidence: w.trim(),
      evidenceKind: 'third_party_education',
      confidence: 0.88,
      accepted: true,
      canonical: Boolean(input.org.id),
      acceptedForOrganizationTimeline: false,
      whyIncluded: 'Institution belongs to another person — not protagonist education',
      sourceSpan: input.span,
      subjectCharacterHint,
      protagonistRelation: false,
      unresolved: false,
    };
  }

  if (thirdParty && (work || /\bworks? at\b|\brecruits? for\b/i.test(w))) {
    return {
      role: 'employer',
      evidence: w.trim(),
      evidenceKind: 'third_party_employment',
      confidence: 0.86,
      accepted: true,
      canonical: Boolean(input.org.id),
      acceptedForOrganizationTimeline: false,
      whyIncluded: 'Employment belongs to another person — not protagonist membership',
      sourceSpan: input.span,
      subjectCharacterHint,
      protagonistRelation: false,
      unresolved: false,
    };
  }

  if (host) {
    return {
      role: 'host',
      evidence: w.trim(),
      evidenceKind: 'host_phrase',
      confidence: 0.92,
      accepted: true,
      canonical: Boolean(input.org.id),
      acceptedForOrganizationTimeline: true,
      whyIncluded: 'Explicit host/organizer of this event',
      sourceSpan: input.span,
      subjectCharacterHint,
      protagonistRelation: true,
      unresolved: false,
    };
  }

  if (interview) {
    return {
      role: 'interview_target',
      evidence: w.trim(),
      evidenceKind: 'interview_phrase',
      confidence: 0.9,
      accepted: true,
      canonical: Boolean(input.org.id),
      acceptedForOrganizationTimeline: true,
      whyIncluded: 'Professional interview context',
      sourceSpan: input.span,
      subjectCharacterHint,
      protagonistRelation: true,
      unresolved: false,
    };
  }

  if (work) {
    return {
      role: 'employer',
      evidence: w.trim(),
      evidenceKind: 'explicit_work_phrase',
      confidence: 0.93,
      accepted: true,
      canonical: Boolean(input.org.id),
      acceptedForOrganizationTimeline: true,
      whyIncluded: 'Explicit work/employer context',
      sourceSpan: input.span,
      subjectCharacterHint,
      protagonistRelation: true,
      unresolved: false,
    };
  }

  if (institution) {
    return {
      role: 'institution',
      evidence: w.trim(),
      evidenceKind: 'education_phrase',
      confidence: 0.9,
      accepted: true,
      canonical: Boolean(input.org.id),
      acceptedForOrganizationTimeline: true,
      whyIncluded: 'Educational institution associated with this event',
      sourceSpan: input.span,
      subjectCharacterHint,
      protagonistRelation: !thirdParty,
      unresolved: false,
    };
  }

  if (department) {
    return {
      role: 'department',
      evidence: w.trim(),
      evidenceKind: 'department_phrase',
      confidence: 0.84,
      accepted: true,
      canonical: Boolean(input.org.id),
      acceptedForOrganizationTimeline: true,
      whyIncluded: 'Department/team context',
      sourceSpan: input.span,
      subjectCharacterHint,
      protagonistRelation: true,
      unresolved: false,
    };
  }

  if (/\bthrew\b|\borganized\b/i.test(lower)) {
    return {
      role: 'organizer',
      evidence: w.trim(),
      evidenceKind: 'organizer_phrase',
      confidence: 0.84,
      accepted: true,
      canonical: Boolean(input.org.id),
      acceptedForOrganizationTimeline: true,
      whyIncluded: 'Organizer of this event',
      sourceSpan: input.span,
      subjectCharacterHint,
      protagonistRelation: true,
      unresolved: false,
    };
  }

  return {
    role: 'referenced',
    evidence: w.trim(),
    evidenceKind: 'name_in_span',
    confidence: 0.55,
    accepted: true,
    canonical: Boolean(input.org.id),
    acceptedForOrganizationTimeline: false,
    whyIncluded: 'Named in the event text without an involvement role',
    sourceSpan: input.span,
    subjectCharacterHint,
    protagonistRelation: false,
    unresolved: false,
  };
}

function withOrg(
  org: OrganizationCatalogEntry,
  rest: ReturnType<typeof classifyMention>,
): OrganizationAttribution {
  return {
    organizationId: org.id,
    organizationName: org.name,
    direct: true,
    derivedFrom: null,
    ...rest,
  };
}

export function deriveParentAttributions(
  attributions: OrganizationAttribution[],
  catalog: OrganizationCatalogEntry[],
): OrganizationAttribution[] {
  const byId = new Map(catalog.map((org) => [org.id, org]));
  const extra: OrganizationAttribution[] = [];
  const seen = new Set(
    attributions.map((row) => `${row.organizationId}:${row.role}`),
  );

  for (const row of attributions) {
    if (!row.organizationId || !row.accepted || row.rejected) continue;
    if (!row.acceptedForOrganizationTimeline || !row.direct) continue;
    const child = byId.get(row.organizationId);
    const parentId = child?.parentGroupId;
    if (!parentId) continue;
    const parent = byId.get(parentId);
    if (!parent) continue;
    const key = `${parent.id}:parent_context`;
    if (seen.has(key)) continue;
    seen.add(key);
    extra.push({
      organizationId: parent.id,
      organizationName: parent.name,
      role: 'parent_context',
      evidence: row.evidence,
      evidenceKind: 'parent_hierarchy',
      confidence: Math.max(0.4, row.confidence - 0.15),
      accepted: true,
      canonical: true,
      acceptedForOrganizationTimeline: true,
      direct: false,
      derivedFrom: child.id,
      whyIncluded: `Parent context derived from ${child.name}`,
      sourceSpan: row.sourceSpan,
      subjectCharacterHint: row.subjectCharacterHint,
      protagonistRelation: row.protagonistRelation,
      unresolved: false,
    });
  }
  return extra;
}

export function attributeOrganizationsInEvent(input: {
  text: string;
  organizations: OrganizationCatalogEntry[];
  explicitOrganizationId?: string | null;
}): OrganizationAttribution[] {
  const catalog = input.organizations;
  const spans = splitSpans(input.text);
  const attributed = new Map<string, OrganizationAttribution>();

  if (input.explicitOrganizationId) {
    const explicit = catalog.find((org) => org.id === input.explicitOrganizationId);
    if (explicit) {
      attributed.set(explicit.id, {
        organizationId: explicit.id,
        organizationName: explicit.name,
        role: 'host',
        evidence: 'Explicit organization_id on the event',
        evidenceKind: 'explicit_event_link',
        confidence: 1,
        accepted: true,
        canonical: true,
        acceptedForOrganizationTimeline: true,
        direct: true,
        derivedFrom: null,
        whyIncluded: 'User-assigned organization on the event',
        protagonistRelation: true,
        unresolved: false,
      });
    }
  }

  for (const span of spans) {
    const hits: Array<{ org: OrganizationCatalogEntry; label: string; index: number }> = [];
    for (const org of catalog) {
      for (const label of labelsFor(org)) {
        const mention = findMention(span, label);
        if (!mention) continue;
        hits.push({ org, label, index: mention.index });
        break;
      }
    }
    hits.sort((a, b) => b.label.length - a.label.length);
    const claimed = new Set<string>();
    for (const hit of hits) {
      if (claimed.has(hit.org.id)) continue;
      const overlappingLonger = hits.some(
        (other) =>
          other.org.id !== hit.org.id
          && other.label.length > hit.label.length
          && other.index <= hit.index
          && other.index + other.label.length >= hit.index + hit.label.length,
      );
      if (overlappingLonger) continue;
      claimed.add(hit.org.id);
      const classified = classifyMention({
        span,
        window: windowAround(span, hit.index, hit.label.length),
        org: hit.org,
        label: hit.label,
      });
      const current = attributed.get(hit.org.id);
      if (!current || classified.confidence > current.confidence) {
        attributed.set(hit.org.id, withOrg(hit.org, classified));
      }
    }
  }

  const direct = [...attributed.values()];
  return [...direct, ...deriveParentAttributions(direct, catalog)];
}

export function eventAcceptedForOrganization(
  attributions: OrganizationAttribution[],
  organizationId: string,
): boolean {
  return attributions.some(
    (row) =>
      row.organizationId === organizationId
      && row.accepted
      && row.acceptedForOrganizationTimeline
      && row.rejected !== true
      && !row.unresolved,
  );
}

export function readOrganizationAttributions(metadata: unknown): OrganizationAttribution[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const raw = (metadata as Record<string, unknown>).organizationAttributions;
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is OrganizationAttribution =>
    Boolean(row && typeof row === 'object' && 'role' in row),
  );
}

export function mergeOrganizationAttributionMetadata(
  metadata: Record<string, unknown> | null | undefined,
  attributions: OrganizationAttribution[],
): Record<string, unknown> {
  const timelineIds = attributions
    .filter((row) => eventAcceptedForOrganization([row], row.organizationId ?? ''))
    .map((row) => row.organizationId)
    .filter((id): id is string => Boolean(id));
  return {
    ...(metadata ?? {}),
    organizationAttributions: attributions,
    organizationIds: [...new Set(timelineIds)],
  };
}

export function applyOrganizationAttributionCorrection(
  attributions: OrganizationAttribution[],
  patch: {
    fromOrganizationId?: string | null;
    toOrganizationId?: string | null;
    toOrganizationName?: string;
    retractOrganizationId?: string | null;
    retractRole?: OrganizationEventRole;
    at?: string;
  },
): OrganizationAttribution[] {
  const at = patch.at ?? new Date().toISOString();
  return attributions.map((row) => {
    if (patch.retractOrganizationId && row.organizationId === patch.retractOrganizationId) {
      if (patch.retractRole && row.role !== patch.retractRole) return row;
      return {
        ...row,
        accepted: false,
        rejected: true,
        acceptedForOrganizationTimeline: false,
        correctionHistory: [
          ...(row.correctionHistory ?? []),
          {
            at,
            action: 'retract',
            fromOrganizationId: row.organizationId,
            role: row.role,
          },
        ],
      };
    }
    if (patch.fromOrganizationId && row.organizationId === patch.fromOrganizationId && patch.toOrganizationId) {
      return {
        ...row,
        organizationId: patch.toOrganizationId,
        organizationName: patch.toOrganizationName ?? row.organizationName,
        canonical: true,
        accepted: true,
        rejected: false,
        acceptedForOrganizationTimeline: TIMELINE_ROLES.has(row.role) && row.role !== 'software_tool' && row.role !== 'referenced',
        correctionHistory: [
          ...(row.correctionHistory ?? []),
          {
            at,
            action: 'swap',
            fromOrganizationId: patch.fromOrganizationId,
            toOrganizationId: patch.toOrganizationId,
            role: row.role,
          },
        ],
      };
    }
    return row;
  });
}

export function explainOrganizationTimelineInclusion(
  attributions: OrganizationAttribution[],
  organizationId: string,
): OrganizationTimelineInclusion | null {
  const row = attributions.find(
    (item) =>
      item.organizationId === organizationId
      && item.accepted
      && item.acceptedForOrganizationTimeline
      && item.rejected !== true,
  );
  if (!row || !row.organizationId) return null;
  return {
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    role: row.role,
    direct: row.direct,
    derivedFrom: row.derivedFrom,
    evidence: row.evidence,
    evidenceKind: row.evidenceKind,
    confidence: row.confidence,
    accepted: row.accepted,
    acceptedForOrganizationTimeline: row.acceptedForOrganizationTimeline,
    whyIncluded: row.whyIncluded,
    sourceSpan: row.sourceSpan,
  };
}

export function subjectWhyIncludedForOrganization(
  attributions: OrganizationAttribution[],
  organizationId: string,
): { relation: 'DIRECT_EVENT' | 'INCIDENTAL_MENTION'; whyIncluded: string } | null {
  const match = attributions.find((row) => row.organizationId === organizationId);
  if (!match) return null;
  if (match.acceptedForOrganizationTimeline && match.accepted && match.rejected !== true) {
    return { relation: 'DIRECT_EVENT', whyIncluded: match.whyIncluded };
  }
  return {
    relation: 'INCIDENTAL_MENTION',
    whyIncluded: match.whyIncluded || 'Referenced only — not organization participation',
  };
}

export function isTimelineEligibleRole(role: OrganizationEventRole): boolean {
  return TIMELINE_ROLES.has(role);
}
