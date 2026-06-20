import { logger } from '../../logger';
import { normalizeNameKey, namesOverlapByContainment } from '../../utils/nameNormalization';
import { supabaseAdmin } from '../supabaseClient';
import { projectService } from '../projectService';

import { projectExtractor, type ExtractedProject } from './projectExtractor';
import {
  buildCrossBookIndexForUser,
  canonicalProjectKey,
  isRejectedProjectSuggestionName,
  type ProjectSuggestionOptions,
} from '../lexical/projects';
import { suggestionDismissalService } from '../suggestionDismissalService';
import { evaluateEntityQuality, passesEntityQualityGate, resolveDisplayName } from '../lorebook/quality/entityQualityGateService';

export type ProjectSuggestionRow = {
  id: string;
  name: string;
  description?: string | null;
  project_type: string;
  status: string;
  confidence: number;
  reasoning?: string | null;
  evidence?: Array<{ text: string } | string>;
  source?: string;
  source_message_id?: string | null;
  match_status: 'new' | 'similar' | 'existing';
  matched_project_id?: string | null;
  matched_project_name?: string | null;
};

export type MaterializeProjectInput = {
  name: string;
  description?: string | null;
  type?: string;
  status?: string;
  suggestionId?: string;
  sourceMessageId?: string | null;
};

function isTableMissing(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return code === 'PGRST205';
}

function normalizeProjectName(name: string): string {
  return canonicalProjectKey(name);
}

function buildFilterOptions(
  index: ProjectIndex,
  crossBook?: ProjectSuggestionOptions['crossBook']
): ProjectSuggestionOptions {
  return {
    knownProjects: new Set(index.all.map(p => p.name)),
    knownProjectIds: new Map(index.all.map(p => [canonicalProjectKey(p.name), p.id])),
    crossBook,
  };
}

type MatchResult = {
  match_status: 'new' | 'similar' | 'existing';
  matched_project_id: string | null;
  matched_project_name: string | null;
};

type ProjectIndex = {
  all: Awaited<ReturnType<typeof projectService.listProjects>>;
  byId: Map<string, { id: string; name: string; normalized_name: string }>;
  byNormalized: Map<string, { id: string; name: string; normalized_name: string }>;
};

class ProjectSuggestionService {
  private buildProjectIndex(projects: Awaited<ReturnType<typeof projectService.listProjects>>): ProjectIndex {
    const byId = new Map<string, { id: string; name: string; normalized_name: string }>();
    const byNormalized = new Map<string, { id: string; name: string; normalized_name: string }>();
    for (const project of projects) {
      const normalized = project.normalized_name || normalizeProjectName(project.name);
      const slim = { id: project.id, name: project.name, normalized_name: normalized };
      byId.set(project.id, slim);
      byNormalized.set(normalized, slim);
    }
    return { all: projects, byId, byNormalized };
  }

  private async getProjectIndex(userId: string): Promise<ProjectIndex> {
    const projects = await projectService.listProjects(userId);
    return this.buildProjectIndex(projects);
  }

  private resolveMatch(name: string, index: ProjectIndex): MatchResult {
    const key = normalizeProjectName(name);
    const exact = index.byNormalized.get(key);
    if (exact) {
      return { match_status: 'existing', matched_project_id: exact.id, matched_project_name: exact.name };
    }
    const similar = index.all.find((p) => namesOverlapByContainment(p.name, name));
    if (similar) {
      return { match_status: 'similar', matched_project_id: similar.id, matched_project_name: similar.name };
    }
    return { match_status: 'new', matched_project_id: null, matched_project_name: null };
  }

  private async toSuggestionPayload(
    userId: string,
    extracted: ExtractedProject,
    index: ProjectIndex,
    opts: {
      sourceMessageId?: string;
      sourceThreadId?: string | null;
      source?: 'chat' | 'journal' | 'llm_scan';
    },
    filterOptions: ProjectSuggestionOptions
  ) {
    const name = extracted.name?.trim();
    if (!name || extracted.confidence < 0.45) return null;
    const evidenceLine = extracted.evidence?.[0] ?? name;
    const evidenceText = typeof evidenceLine === 'string' ? evidenceLine : name;
    if (isRejectedProjectSuggestionName(name, filterOptions, evidenceText)) {
      return null;
    }

    const quality = evaluateEntityQuality(
      {
        name,
        domain: 'projects',
        contextText: evidenceText,
        evidence: evidenceText,
        confidence: extracted.confidence,
        sourceMessageId: opts.sourceMessageId,
        sourceThreadId: opts.sourceThreadId ?? undefined,
      },
      {
        crossBook: filterOptions.crossBook,
        knownInBook: filterOptions.knownProjects,
        knownInBookIds: filterOptions.knownProjectIds,
      }
    );
    if (!passesEntityQualityGate(quality)) return null;
    const safeName = resolveDisplayName({ name, domain: 'projects' }, quality);

    const suppressed = await suggestionDismissalService.shouldSuppress(userId, 'projects', name, {
      sourceMessageId: opts.sourceMessageId,
      threadId: opts.sourceThreadId,
    });
    if (suppressed.suppressed) return null;

    const match = this.resolveMatch(safeName, index);
    const normalized = normalizeProjectName(safeName);

    return {
      user_id: userId,
      name: safeName,
      normalized_name: normalized,
      description: extracted.description ?? null,
      project_type: extracted.type ?? 'project',
      status: extracted.status ?? 'active',
      confidence: Math.max(0, Math.min(1, Number(extracted.confidence))),
      reasoning: extracted.reasoning ?? null,
      evidence: (extracted.evidence ?? []).map((e) => (typeof e === 'string' ? { text: e } : e)),
      source_message_id: opts.sourceMessageId ?? null,
      source: opts.source ?? 'chat',
      match_status: match.match_status,
      matched_project_id: match.matched_project_id,
      status_row: 'pending',
      updated_at: new Date().toISOString(),
    };
  }

  async upsertFromExtraction(
    userId: string,
    extracted: ExtractedProject,
    opts: {
      sourceMessageId?: string;
      sourceThreadId?: string | null;
      source?: 'chat' | 'journal' | 'llm_scan';
    } = {}
  ): Promise<void> {
    const [index, crossBook] = await Promise.all([
      this.getProjectIndex(userId),
      buildCrossBookIndexForUser(userId).catch(() => undefined),
    ]);
    const filterOptions = buildFilterOptions(index, crossBook);
    const payload = await this.toSuggestionPayload(userId, extracted, index, opts, filterOptions);
    if (!payload) return;

    const { error } = await supabaseAdmin
      .from('project_suggestions')
      .upsert(payload, { onConflict: 'user_id,normalized_name' });

    if (error && !isTableMissing(error)) {
      logger.warn({ error, userId, name: payload.name }, 'Failed to upsert project suggestion');
    }
  }

  async upsertManyFromExtraction(
    userId: string,
    extractedList: ExtractedProject[],
    opts: {
      sourceMessageId?: string;
      sourceThreadId?: string | null;
      source?: 'chat' | 'journal' | 'llm_scan';
    } = {}
  ): Promise<number> {
    if (extractedList.length === 0) return 0;
    const [index, crossBook] = await Promise.all([
      this.getProjectIndex(userId),
      buildCrossBookIndexForUser(userId).catch(() => undefined),
    ]);
    const filterOptions = buildFilterOptions(index, crossBook);
    const payloads = (
      await Promise.all(
        extractedList.map((extracted) => this.toSuggestionPayload(userId, extracted, index, opts, filterOptions))
      )
    ).filter((payload): payload is NonNullable<typeof payload> => payload !== null);
    if (payloads.length === 0) return 0;

    const { error } = await supabaseAdmin
      .from('project_suggestions')
      .upsert(payloads, { onConflict: 'user_id,normalized_name' });

    if (error && !isTableMissing(error)) {
      logger.warn({ error, userId, count: payloads.length }, 'Failed to batch upsert project suggestions');
      return 0;
    }
    return payloads.length;
  }

  async getPendingSuggestions(userId: string): Promise<ProjectSuggestionRow[]> {
    const { data, error } = await supabaseAdmin
      .from('project_suggestions')
      .select('*')
      .eq('user_id', userId)
      .eq('status_row', 'pending')
      .order('confidence', { ascending: false })
      .limit(24);

    if (error) {
      if (isTableMissing(error)) return [];
      logger.warn({ error, userId }, 'Failed to load project suggestions');
      return [];
    }

    const [projectIndex, crossBook] = await Promise.all([
      this.getProjectIndex(userId),
      buildCrossBookIndexForUser(userId).catch(() => undefined),
    ]);
    const filterOptions = buildFilterOptions(projectIndex, crossBook);

    const filteredRows = [];
    for (const row of data ?? []) {
      if (isRejectedProjectSuggestionName(row.name, filterOptions, row.reasoning ?? row.name)) continue;
      const suppressed = await suggestionDismissalService.shouldSuppress(userId, 'projects', row.name, {
        sourceMessageId: row.source_message_id,
      });
      if (suppressed.suppressed) continue;
      filteredRows.push(row);
    }

    return filteredRows.map((row) => {
      let match_status = (row.match_status ?? 'new') as ProjectSuggestionRow['match_status'];
      let matched_project_id = row.matched_project_id as string | null;
      let matched_project_name: string | null = null;

      if (matched_project_id) {
        matched_project_name = projectIndex.byId.get(matched_project_id)?.name ?? null;
      } else {
        const live = projectIndex.byNormalized.get(row.normalized_name) ?? projectIndex.all.find(
          (p) =>
            normalizeProjectName(p.name) === row.normalized_name ||
            namesOverlapByContainment(p.name, row.name)
        );
        if (live) {
          match_status = normalizeProjectName(live.name) === row.normalized_name ? 'existing' : 'similar';
          matched_project_id = live.id;
          matched_project_name = live.name;
        }
      }

      return {
        id: row.id,
        name: row.name,
        description: row.description,
        project_type: row.project_type ?? 'project',
        status: row.status ?? 'active',
        confidence: Number(row.confidence),
        reasoning: row.reasoning,
        evidence: row.evidence ?? [],
        source: row.source ?? 'chat',
        source_message_id: row.source_message_id,
        match_status,
        matched_project_id,
        matched_project_name,
      };
    });
  }

  async hasAnySuggestions(userId: string): Promise<boolean> {
    const { count, error } = await supabaseAdmin
      .from('project_suggestions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (error) {
      if (isTableMissing(error)) return false;
      return false;
    }
    return (count ?? 0) > 0;
  }

  async rejectSuggestion(
    userId: string,
    suggestionId: string,
    opts?: { threadId?: string | null }
  ) {
    const { data: row } = await supabaseAdmin
      .from('project_suggestions')
      .select('id, name, source_message_id')
      .eq('user_id', userId)
      .eq('id', suggestionId)
      .maybeSingle();

    if (!row?.name) return null;

    const result = await suggestionDismissalService.recordDismissal(userId, 'projects', {
      name: row.name,
      sourceMessageId: row.source_message_id,
      sourceSuggestionId: suggestionId,
      threadId: opts?.threadId,
    });

    if (result.isPermanent) {
      await supabaseAdmin
        .from('project_suggestions')
        .update({ status_row: 'rejected', updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('id', suggestionId);
      return result;
    }

    await supabaseAdmin.from('project_suggestions').delete().eq('user_id', userId).eq('id', suggestionId);
    return result;
  }

  async rejectByName(
    userId: string,
    name: string,
    opts?: { threadId?: string | null; sourceMessageId?: string | null; suggestionId?: string }
  ) {
    const key = normalizeProjectName(name);
    const updateTime = new Date().toISOString();

    const { data: existing } = await supabaseAdmin
      .from('project_suggestions')
      .select('id, name, source_message_id')
      .eq('user_id', userId)
      .eq('normalized_name', key)
      .maybeSingle();

    const result = await suggestionDismissalService.recordDismissal(userId, 'projects', {
      name,
      sourceMessageId: opts?.sourceMessageId ?? existing?.source_message_id,
      sourceSuggestionId: opts?.suggestionId ?? existing?.id,
      threadId: opts?.threadId,
    });

    if (result.isPermanent) {
      const { error } = await supabaseAdmin.from('project_suggestions').upsert(
        {
          user_id: userId,
          name: name.trim(),
          normalized_name: key,
          status_row: 'rejected',
          confidence: 0,
          updated_at: updateTime,
        },
        { onConflict: 'user_id,normalized_name' }
      );
      if (error && !isTableMissing(error)) {
        logger.debug({ error, userId, name }, 'rejectByName permanent upsert failed');
      }
      return result;
    }

    if (existing?.id) {
      await supabaseAdmin.from('project_suggestions').delete().eq('user_id', userId).eq('id', existing.id);
    }
    return result;
  }

  async materializeProject(userId: string, input: MaterializeProjectInput) {
    const existing = await projectService.listProjects(userId);
    const duplicate = existing.find((p) => normalizeProjectName(p.name) === normalizeProjectName(input.name));
    if (duplicate) {
      if (input.suggestionId) {
        await supabaseAdmin
          .from('project_suggestions')
          .update({ status_row: 'confirmed', updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('id', input.suggestionId);
      }
      return duplicate;
    }

    const normalized = normalizeProjectName(input.name);
    const { data, error } = await supabaseAdmin
      .from('projects')
      .upsert(
        {
          user_id: userId,
          name: input.name.trim(),
          normalized_name: normalized,
          description: input.description ?? null,
          status: input.status ?? 'active',
          type: input.type ?? 'project',
          metadata: {
            source: 'suggested',
            suggestion_id: input.suggestionId,
            source_message_id: input.sourceMessageId,
            materialized_at: new Date().toISOString(),
          },
        },
        { onConflict: 'user_id,normalized_name' }
      )
      .select('*')
      .single();

    if (error) throw new Error('Could not create project');

    if (input.suggestionId) {
      await supabaseAdmin
        .from('project_suggestions')
        .update({ status_row: 'confirmed', updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('id', input.suggestionId);
    }

    return data;
  }

  async confirmSuggestion(userId: string, suggestionId: string) {
    const { data: suggestion } = await supabaseAdmin
      .from('project_suggestions')
      .select('*')
      .eq('user_id', userId)
      .eq('id', suggestionId)
      .single();

    if (!suggestion) throw new Error('Suggestion not found');

    return this.materializeProject(userId, {
      name: suggestion.name,
      description: suggestion.description,
      type: suggestion.project_type,
      status: suggestion.status,
      suggestionId,
      sourceMessageId: suggestion.source_message_id,
    });
  }

  async processChatMessageForProjectSuggestions(
    userId: string,
    messageId: string,
    content: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<number> {
    const sourceThreadId = await suggestionDismissalService.resolveThreadIdFromMessageId(messageId);
    const extracted = await projectExtractor.extractProjectsFromMessage(userId, content, conversationHistory);
    if (extracted.length === 0) return 0;
    return this.upsertManyFromExtraction(
      userId,
      extracted,
      { sourceMessageId: messageId, sourceThreadId, source: 'chat' }
    );
  }

  async processEntryForProjectSuggestions(userId: string, entryId: string, content: string): Promise<number> {
    const extracted = projectExtractor.extractFromText(content);
    let saved = await this.upsertManyFromExtraction(userId, extracted, { source: 'journal' });
    if (saved === 0 && content.length > 80) {
      const batch = await projectExtractor.extractProjects(userId, [{ content, date: new Date().toISOString() }]);
      saved += await this.upsertManyFromExtraction(userId, batch, { source: 'journal' });
    }
  void entryId;
    return saved;
  }
}

export const projectSuggestionService = new ProjectSuggestionService();
