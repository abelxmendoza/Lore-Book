/**
 * BiographyGenerationEngine
 * 
 * Core principle: "Structure first. Narrative second. Prose last."
 * 
 * Generates biographies from precomputed NarrativeAtoms, not raw journal text.
 */

import OpenAI from 'openai';

import { config } from '../../config';
import { logger } from '../../logger';
import { chapterService } from '../chapterService';
import { supabaseAdmin } from '../supabaseClient';

import { filterSensitiveAtoms, filterBiographyText } from './contentFilter';
import { buildAtomsFromTimeline } from './narrativeAtomBuilder';
import { preservedContentPlacer } from './preservedContentPlacer';
import { timePeriodAnalyzer } from './timePeriodAnalyzer';
import { themeAnalyzer } from './themeAnalyzer';
import { voidAwarenessService } from './voidAwarenessService';
import { atomPrioritizer } from './atomPrioritizer';
import { fallbackGenerator } from './fallbackGenerator';
import { qualityValidator } from './qualityValidator';
import type {
  NarrativeAtom,
  NarrativeGraph,
  BiographySpec,
  Biography,
  BiographyChapter,
  ChapterCluster,
  TimelineChapter,
  TimelineHierarchy,
  Domain
} from './types';

const openai = new OpenAI({ apiKey: config.openAiKey });

export class BiographyGenerationEngine {
  /**
   * Generate biography from spec
   */
  async generateBiography(userId: string, spec: BiographySpec): Promise<Biography> {
    try {
      logger.info({ userId, spec }, 'Generating biography');

      // 1. Load or build NarrativeGraph
      const graph = await this.loadOrBuildNarrativeGraph(userId);

      // 2. Filter atoms by spec (O(n) using indexes when possible)
      let filteredAtoms = this.filterAtoms(graph, spec);

      // 3. Apply content filtering (version-aware build flags)
      filteredAtoms = this.applyContentFilters(filteredAtoms, spec);

      if (filteredAtoms.length === 0) {
        throw new Error('No atoms found matching specification');
      }

      // 3a. Detect voids in timeline
      const timelineSpan = this.calculateTimelineSpan(filteredAtoms, spec);
      const voidPeriods = voidAwarenessService.detectVoids(filteredAtoms, timelineSpan);

      // 3. Load timeline chapters (source structure)
      const timelineChapters = await this.loadTimelineChapters(userId, spec);

      // 4. Cluster atoms into chapters using timeline chapters as structure
      const chapterClusters = this.clusterAtomsIntoChaptersFromTimeline(
        filteredAtoms, 
        timelineChapters, 
        spec
      );

      // 4a. Create void chapters for significant gaps
      const voidChapters = voidAwarenessService.createVoidChapters(
        voidPeriods.filter(v => v.significance !== 'low'),
        spec
      );

      // Merge void chapters into chapter clusters
      const allChapters = [...chapterClusters, ...voidChapters];

      // 5. Order chapters (including void chapters)
      const orderedChapters = this.orderChapters(allChapters, spec);

      // 6. Generate chapter titles from timeline chapters
      const chaptersWithTitles = await this.generateChapterTitlesFromTimeline(
        orderedChapters, 
        spec,
        userId
      );

      // 7. Generate chapter narratives
      const chapters = await this.generateChapterNarratives(chaptersWithTitles, spec);

      // 7a. Detect time periods and assign to chapters
      const timelineHierarchy = await this.loadTimelineHierarchy(userId, spec);
      const timePeriods = timePeriodAnalyzer.detectTimePeriods(chaptersWithTitles, timelineHierarchy, voidPeriods);
      
      // Assign time period IDs to chapters
      for (const period of timePeriods) {
        for (const chapterId of period.chapters) {
          const chapter = chapters.find(ch => ch.id === chapterId);
          if (chapter) {
            chapter.timePeriodId = period.id;
          }
        }
      }

      // 8. Generate biography title (needs chapters and atoms for context)
      const biographyTitle = await this.generateBiographyTitle(userId, spec, filteredAtoms, chapters);

      // 9. Assemble biography
      // Generate atom hashes for version tracking
      const atomHashes = filteredAtoms.map(atom => atom.id);
      const voidCount = chapters.filter(ch => ch.isVoidChapter).length;
      const biography = this.assembleBiography(
        chapters,
        spec,
        filteredAtoms.length,
        filteredAtoms,
        biographyTitle,
        atomHashes,
        timePeriods,
        timelineHierarchy,
        voidPeriods,
        voidCount
      );

      // 9a. Validate quality
      const qualityReport = await qualityValidator.validateBiography(biography, filteredAtoms);
      
      // Add quality metrics to metadata
      biography.metadata.quality = {
        overallScore: qualityReport.overallScore,
        temporalAccuracy: qualityReport.temporalAccuracy,
        sourceFidelity: qualityReport.sourceFidelity,
        completeness: qualityReport.completeness,
        conflictAwareness: qualityReport.conflictAwareness,
        warnings: qualityReport.warnings
      };

      // Log warnings if quality is low
      if (qualityReport.overallScore < 0.7) {
        logger.warn({ qualityReport, userId }, 'Biography quality below threshold');
      }

      // 9. Save biography
      await this.saveBiography(userId, biography);

      return biography;
    } catch (error) {
      logger.error({ error, userId, spec }, 'Failed to generate biography');
      throw error;
    }
  }

  /**
   * Load or build NarrativeGraph (with indexes)
   * Think: Building AST with symbol tables
   */
  private async loadOrBuildNarrativeGraph(userId: string): Promise<NarrativeGraph> {
    try {
      // Try to load from cache
      const { data, error } = await supabaseAdmin
        .from('narrative_graphs')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (!error && data && data.graph_data) {
        const graph = data.graph_data as NarrativeGraph;
        // Check if graph is recent (within 24 hours)
        const lastUpdated = new Date(data.updated_at || data.created_at);
        const age = Date.now() - lastUpdated.getTime();
        if (age < 24 * 60 * 60 * 1000 && graph.index) {
          return graph;
        }
      }

      // Build new graph with indexes
      const atoms = await buildAtomsFromTimeline(userId);
      const edges = this.buildEdges(atoms);
      const index = this.buildIndex(atoms);

      const graph: NarrativeGraph = {
        atoms,
        edges,
        index,
        lastUpdated: new Date().toISOString()
      };

      // Save graph
      await supabaseAdmin
        .from('narrative_graphs')
        .upsert({
          user_id: userId,
          graph_data: graph,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      return graph;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to load/build narrative graph');
      // Return empty graph on error
      return {
        atoms: [],
        edges: [],
        index: {
          byDomain: new Map(),
          byTime: [],
          byPerson: new Map()
        },
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Build indexes for fast lookups
   * Think: Symbol tables in compiler
   */
  private buildIndex(atoms: NarrativeAtom[]): NarrativeGraph['index'] {
    const byDomain = new Map<Domain, string[]>();
    const byTime: Array<{ atomId: string; timestamp: string }> = [];
    const byPerson = new Map<string, string[]>();

    for (const atom of atoms) {
      // Index by domain
      for (const domain of atom.domains) {
        if (!byDomain.has(domain)) {
          byDomain.set(domain, []);
        }
        byDomain.get(domain)!.push(atom.id);
      }

      // Index by time (sorted)
      byTime.push({ atomId: atom.id, timestamp: atom.timestamp });
      byTime.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Index by person
      if (atom.peopleIds) {
        for (const personId of atom.peopleIds) {
          if (!byPerson.has(personId)) {
            byPerson.set(personId, []);
          }
          byPerson.get(personId)!.push(atom.id);
        }
      }
    }

    return { byDomain, byTime, byPerson };
  }

  /**
   * Build edges between atoms
   */
  private buildEdges(atoms: NarrativeAtom[]): NarrativeGraph['edges'] {
    const edges: NarrativeGraph['edges'] = [];

    for (let i = 0; i < atoms.length; i++) {
      for (let j = i + 1; j < atoms.length; j++) {
        const atomA = atoms[i];
        const atomB = atoms[j];

        // Temporal edge
        const timeDiff = Math.abs(
          new Date(atomA.timestamp).getTime() - new Date(atomB.timestamp).getTime()
        );
        if (timeDiff < 7 * 24 * 60 * 60 * 1000) { // Within 7 days
          edges.push({
            fromAtomId: atomA.id,
            toAtomId: atomB.id,
            relation: 'temporal',
            weight: 1 - (timeDiff / (7 * 24 * 60 * 60 * 1000))
          });
        }

        // Thematic edge (shared domains)
        const sharedDomains = atomA.domains.filter(d => atomB.domains.includes(d));
        if (sharedDomains.length > 0) {
          edges.push({
            fromAtomId: atomA.id,
            toAtomId: atomB.id,
            relation: 'thematic',
            weight: sharedDomains.length / Math.max(atomA.domains.length, atomB.domains.length)
          });
        }

        // People edge (shared people)
        const sharedPeople = atomA.peopleIds.filter(p => atomB.peopleIds.includes(p));
        if (sharedPeople.length > 0) {
          edges.push({
            fromAtomId: atomA.id,
            toAtomId: atomB.id,
            relation: 'thematic',
            weight: sharedPeople.length / Math.max(atomA.peopleIds.length, atomB.peopleIds.length, 1)
          });
        }
      }
    }

    return edges;
  }

  /**
   * Apply content filters (version-aware build flags)
   * Think: Compile-time flags (--public, --private, --posthumous)
   */
  private applyContentFilters(
    atoms: NarrativeAtom[],
    spec: BiographySpec
  ): NarrativeAtom[] {
    // Default to 'main' if version not specified
    const version = spec.version || 'main';

    // Private and explicit versions: no filtering
    if (version === 'private' || version === 'explicit') {
      return atoms;
    }

    // Safe version: filter sensitive content
    if (version === 'safe') {
      return atoms.filter(atom => {
        // Filter high sensitivity
        if (atom.sensitivity > 0.7) return false;
        // Filter high emotional weight for safe version
        if (atom.emotionalWeight > 0.85) return false;
        // Filter conflicts for public
        if (atom.type === 'conflict' && spec.audience === 'public') return false;
        return true;
      });
    }

    // Main version: light filtering
    return atoms.filter(atom => {
      // Only filter extreme sensitivity
      if (atom.sensitivity > 0.9) return false;
      return true;
    });
  }

  /**
   * Calculate timeline span from atoms or spec
   */
  private calculateTimelineSpan(
    atoms: NarrativeAtom[],
    spec: BiographySpec
  ): { start: string; end: string } {
    if (spec.timeRange) {
      return spec.timeRange;
    }
    
    if (atoms.length === 0) {
      const now = new Date();
      return { start: now.toISOString(), end: now.toISOString() };
    }
    
    const dates = atoms.map(a => new Date(a.timestamp).getTime());
    return {
      start: new Date(Math.min(...dates)).toISOString(),
      end: new Date(Math.max(...dates)).toISOString()
    };
  }

  /**
   * Filter atoms by spec (O(n) using indexes when possible)
   * Think: Query optimization
   */
  private filterAtoms(graph: NarrativeGraph, spec: BiographySpec): NarrativeAtom[] {
    // Use index for domain filtering if available
    let atoms: NarrativeAtom[];
    
    if (spec.scope === 'domain' && spec.domain && graph.index?.byDomain?.has(spec.domain)) {
      // O(k) where k = atoms in domain (much faster than O(n))
      const atomIds = graph.index.byDomain.get(spec.domain)!;
      atoms = atomIds.map(id => graph.atoms.find(a => a.id === id)!).filter(Boolean);
    } else {
      atoms = graph.atoms;
    }

    // Filter by domain (use index if available for O(k) lookup)
    if (spec.scope === 'domain' && spec.domain) {
      if (graph.index.byDomain.has(spec.domain)) {
        // Use index for fast lookup
        const atomIds = graph.index.byDomain.get(spec.domain)!;
        atoms = atomIds.map(id => atoms.find(a => a.id === id)!).filter(Boolean);
      } else {
        // Fallback to linear scan
        atoms = atoms.filter(a => a.domains.includes(spec.domain!));
      }
    }

    // Filter by time range
    if (spec.timeRange) {
      const start = new Date(spec.timeRange.start).getTime();
      const end = new Date(spec.timeRange.end).getTime();
      atoms = atoms.filter(a => {
        const atomTime = new Date(a.timestamp).getTime();
        return atomTime >= start && atomTime <= end;
      });
    }

    // Filter by themes
    if (spec.themes && spec.themes.length > 0) {
      atoms = atoms.filter(a => {
        const content = a.content.toLowerCase();
        return spec.themes!.some(theme => content.includes(theme.toLowerCase()));
      });
    }

    // Filter by people
    if (spec.peopleIds && spec.peopleIds.length > 0) {
      atoms = atoms.filter(a => 
        a.peopleIds && a.peopleIds.some(pid => spec.peopleIds!.includes(pid))
      );
    }

    // Filter by locations (from metadata)
    if ((spec as any).locationIds && (spec as any).locationIds.length > 0) {
      atoms = atoms.filter(a => {
        const locationIds = a.metadata?.locationIds as string[] | undefined;
        return locationIds && locationIds.some(lid => (spec as any).locationIds.includes(lid));
      });
    }

    // Filter by events (from metadata)
    if ((spec as any).eventIds && (spec as any).eventIds.length > 0) {
      atoms = atoms.filter(a => {
        const eventIds = a.metadata?.eventIds as string[] | undefined;
        return eventIds && eventIds.some(eid => (spec as any).eventIds.includes(eid));
      });
    }

    // Filter by skills (from metadata)
    if ((spec as any).skillIds && (spec as any).skillIds.length > 0) {
      atoms = atoms.filter(a => {
        const skillIds = a.metadata?.skillIds as string[] | undefined;
        return skillIds && skillIds.some(sid => (spec as any).skillIds.includes(sid));
      });
    }

    // Rank by significance * emotionalWeight
    atoms.sort((a, b) => {
      const scoreA = a.significance * a.emotionalWeight;
      const scoreB = b.significance * b.emotionalWeight;
      return scoreB - scoreA;
    });

    // Limit based on depth
    const limit = spec.depth === 'summary' ? 20 : spec.depth === 'detailed' ? 50 : 100;
    return atoms.slice(0, limit);
  }

  /**
   * Cluster atoms into chapters
   */
  private clusterAtomsIntoChapters(
    atoms: NarrativeAtom[],
    spec: BiographySpec
  ): ChapterCluster[] {
    if (atoms.length === 0) return [];

    // Simple clustering: group by temporal proximity and shared themes
    const clusters: ChapterCluster[] = [];
    const used = new Set<string>();

    for (const atom of atoms) {
      if (used.has(atom.id)) continue;

      const cluster: ChapterCluster = {
        id: `cluster-${clusters.length}`,
        atoms: [atom],
        dominantThemes: [...atom.domains],
        timeSpan: {
          start: atom.timestamp,
          end: atom.timestamp
        },
        significance: atom.significance
      };

      used.add(atom.id);

      // Find related atoms
      for (const otherAtom of atoms) {
        if (used.has(otherAtom.id)) continue;

        // Check temporal proximity (within 30 days)
        const timeDiff = Math.abs(
          new Date(atom.timestamp).getTime() - new Date(otherAtom.timestamp).getTime()
        );
        if (timeDiff > 30 * 24 * 60 * 60 * 1000) continue;

        // Check shared themes
        const sharedThemes = atom.domains.filter(d => otherAtom.domains.includes(d));
        if (sharedThemes.length === 0 && atom.peopleIds.length === 0) continue;

        // Add to cluster
        cluster.atoms.push(otherAtom);
        used.add(otherAtom.id);

        // Update time span
        const atomTime = new Date(otherAtom.timestamp).getTime();
        const startTime = new Date(cluster.timeSpan.start).getTime();
        const endTime = new Date(cluster.timeSpan.end).getTime();
        
        if (atomTime < startTime) {
          cluster.timeSpan.start = otherAtom.timestamp;
        }
        if (atomTime > endTime) {
          cluster.timeSpan.end = otherAtom.timestamp;
        }

        // Update themes
        otherAtom.domains.forEach(d => {
          if (!cluster.dominantThemes.includes(d)) {
            cluster.dominantThemes.push(d);
          }
        });

        // Update significance
        cluster.significance = 
          cluster.atoms.reduce((sum, a) => sum + a.significance, 0) / cluster.atoms.length;
      }

      // Only add clusters with multiple atoms or high significance
      if (cluster.atoms.length > 1 || cluster.significance > 0.7) {
        clusters.push(cluster);
      }
    }

    return clusters;
  }

  /**
   * Load timeline hierarchy (Sagas → Arcs → Chapters)
   */
  private async loadTimelineHierarchy(
    userId: string,
    spec: BiographySpec
  ): Promise<TimelineHierarchy> {
    try {
      // Load sagas
      const { data: sagas, error: sagasError } = await supabaseAdmin
        .from('timeline_sagas')
        .select('id, title, description, start_date, end_date, era_id')
        .eq('user_id', userId)
        .order('start_date', { ascending: true });

      if (sagasError) {
        logger.error({ error: sagasError }, 'Failed to load sagas');
        return { sagas: [] };
      }

      if (!sagas || sagas.length === 0) {
        return { sagas: [] };
      }

      // Filter sagas by spec if time range is specified
      let filteredSagas = sagas;
      if (spec.timeRange) {
        filteredSagas = sagas.filter(saga => {
          const sagaStart = new Date(saga.start_date);
          const sagaEnd = saga.end_date ? new Date(saga.end_date) : new Date();
          const specStart = new Date(spec.timeRange!.start);
          const specEnd = new Date(spec.timeRange!.end);
          return (sagaStart >= specStart && sagaStart <= specEnd) ||
                 (sagaEnd >= specStart && sagaEnd <= specEnd) ||
                 (sagaStart <= specStart && sagaEnd >= specEnd);
        });
      }

      // Load arcs for each saga
      const sagasWithArcs = await Promise.all(
        filteredSagas.map(async (saga) => {
          const { data: arcs, error: arcsError } = await supabaseAdmin
            .from('timeline_arcs')
            .select('id, title, description, start_date, end_date, saga_id')
            .eq('saga_id', saga.id)
            .eq('user_id', userId)
            .order('start_date', { ascending: true });

          if (arcsError) {
            logger.error({ error: arcsError, sagaId: saga.id }, 'Failed to load arcs');
            return { ...saga, arcs: [] };
          }

          // Load chapters for each arc
          const arcsWithChapters = await Promise.all(
            (arcs || []).map(async (arc) => {
              const { data: chapters, error: chaptersError } = await supabaseAdmin
                .from('chapters')
                .select('id, title, start_date, end_date, description, summary, parent_id, user_id, created_at, updated_at')
                .eq('parent_id', arc.id)
                .eq('user_id', userId)
                .order('start_date', { ascending: true });

              if (chaptersError) {
                logger.error({ error: chaptersError, arcId: arc.id }, 'Failed to load chapters');
                return { ...arc, chapters: [] };
              }

              return {
                ...arc,
                chapters: (chapters || []).map(ch => ({
                  id: ch.id,
                  title: ch.title,
                  start_date: ch.start_date,
                  end_date: ch.end_date,
                  description: ch.description,
                  summary: ch.summary,
                  parent_id: ch.parent_id,
                  user_id: ch.user_id,
                  created_at: ch.created_at,
                  updated_at: ch.updated_at
                })) as TimelineChapter[]
              };
            })
          );

          return {
            id: saga.id,
            title: saga.title,
            description: saga.description || undefined,
            start_date: saga.start_date,
            end_date: saga.end_date || undefined,
            arcs: arcsWithChapters
          };
        })
      );

      return { sagas: sagasWithArcs };
    } catch (error) {
      logger.error({ error }, 'Failed to load timeline hierarchy');
      return { sagas: [] };
    }
  }

  /**
   * Load timeline chapters (flattened from hierarchy)
   */
  private async loadTimelineChapters(
    userId: string,
    spec: BiographySpec
  ): Promise<TimelineChapter[]> {
    try {
      const hierarchy = await this.loadTimelineHierarchy(userId, spec);
      
      // Flatten chapters from all arcs
      const chapters: TimelineChapter[] = [];
      hierarchy.sagas.forEach(saga => {
        saga.arcs.forEach(arc => {
          chapters.push(...arc.chapters);
        });
      });

      // If no chapters from hierarchy, try direct query
      if (chapters.length === 0) {
        const { data: directChapters, error } = await supabaseAdmin
          .from('chapters')
          .select('id, title, start_date, end_date, description, summary, parent_id, user_id, created_at, updated_at')
          .eq('user_id', userId)
          .order('start_date', { ascending: true });

        if (error) {
          logger.error({ error }, 'Failed to load chapters directly');
          return [];
        }

        return (directChapters || []).map(ch => ({
          id: ch.id,
          title: ch.title,
          start_date: ch.start_date,
          end_date: ch.end_date,
          description: ch.description,
          summary: ch.summary,
          parent_id: ch.parent_id,
          user_id: ch.user_id,
          created_at: ch.created_at,
          updated_at: ch.updated_at
        })) as TimelineChapter[];
      }

      return chapters;
    } catch (error) {
      logger.error({ error }, 'Failed to load timeline chapters');
      return [];
    }
  }

  /**
   * Cluster atoms into chapters using timeline chapters as structure
   */
  private clusterAtomsIntoChaptersFromTimeline(
    atoms: NarrativeAtom[],
    timelineChapters: TimelineChapter[],
    spec: BiographySpec
  ): Array<ChapterCluster & { timelineChapterId?: string; timelineChapter?: TimelineChapter }> {
    if (atoms.length === 0) return [];

    const clusters: Array<ChapterCluster & { timelineChapterId?: string; timelineChapter?: TimelineChapter }> = [];
    const usedAtoms = new Set<string>();

    // Primary clustering: Use timeline chapters as structure
    for (const timelineChapter of timelineChapters) {
      const chapterStart = new Date(timelineChapter.start_date);
      const chapterEnd = timelineChapter.end_date ? new Date(timelineChapter.end_date) : new Date();

      // Find atoms that fall within this timeline chapter
      const chapterAtoms = atoms.filter(atom => {
        if (usedAtoms.has(atom.id)) return false;
        const atomDate = new Date(atom.timestamp);
        return atomDate >= chapterStart && atomDate <= chapterEnd;
      });

      if (chapterAtoms.length > 0) {
        // Prioritize atoms before clustering
        const prioritizedAtoms = atomPrioritizer.prioritizeAtoms(chapterAtoms, {
          depth: spec.depth,
          preserveAll: false // Except preserved content
        });

        // Select top N atoms based on chapter time span and depth
        const maxAtoms = atomPrioritizer.getMaxAtomsForDepth(spec.depth);
        const selectedAtoms = atomPrioritizer.selectAtomsForChapter(
          prioritizedAtoms,
          { start: chapterStart.toISOString(), end: chapterEnd.toISOString() },
          maxAtoms
        );

        // Mark atoms as used
        selectedAtoms.forEach(atom => usedAtoms.add(atom.id));

        // Extract themes from selected atoms
        const themes = new Set<string>();
        selectedAtoms.forEach(atom => {
          atom.domains.forEach(domain => themes.add(domain));
          if (atom.tags) {
            atom.tags.forEach(tag => themes.add(tag));
          }
        });

        // Calculate time span from selected atoms
        const atomDates = selectedAtoms.map(a => new Date(a.timestamp).getTime());
        const minDate = new Date(Math.min(...atomDates));
        const maxDate = new Date(Math.max(...atomDates));

        clusters.push({
          id: `cluster-${timelineChapter.id}`,
          atoms: selectedAtoms,
          dominantThemes: Array.from(themes),
          timeSpan: {
            start: minDate.toISOString(),
            end: maxDate.toISOString()
          },
          significance: selectedAtoms.length > 0 
            ? selectedAtoms.reduce((sum, a) => sum + a.significance, 0) / selectedAtoms.length 
            : 0,
          timelineChapterId: timelineChapter.id,
          timelineChapter: timelineChapter
        });
      }
    }

    // Secondary clustering: Thematic cross-cutting for remaining atoms
    const remainingAtoms = atoms.filter(atom => !usedAtoms.has(atom.id));
    if (remainingAtoms.length > 0 && spec.scope !== 'time_range') {
      // Use existing clusterAtomsIntoChapters for remaining atoms
      const thematicClusters = this.clusterAtomsIntoChapters(remainingAtoms, spec);
      clusters.push(...thematicClusters);
    } else if (remainingAtoms.length > 0) {
      // For time_range scope, create clusters for remaining atoms
      const remainingClusters = this.clusterAtomsIntoChapters(remainingAtoms, spec);
      clusters.push(...remainingClusters);
    }

    return clusters;
  }

  /**
   * Create thematic chapters (cross-cutting themes)
   */
  private createThematicChapters(
    atoms: NarrativeAtom[],
    timelineChapters: TimelineChapter[],
    spec: BiographySpec
  ): ChapterCluster[] {
    // Only create thematic chapters if hybrid structure is allowed
    if (spec.scope === 'time_range') {
      return []; // Strict chronological for time ranges
    }

    // Identify cross-cutting themes by analyzing atoms directly
    // Group atoms by timeline chapter for theme analysis
    const chapterAtomMap = new Map<string, NarrativeAtom[]>();
    timelineChapters.forEach(tc => {
      const chapterAtoms = atoms.filter(a => {
        const atomDate = new Date(a.timestamp);
        const chapterStart = new Date(tc.start_date);
        const chapterEnd = tc.end_date ? new Date(tc.end_date) : new Date();
        return atomDate >= chapterStart && atomDate <= chapterEnd;
      });
      if (chapterAtoms.length > 0) {
        chapterAtomMap.set(tc.id, chapterAtoms);
      }
    });

    // Extract themes from all atoms and find cross-cutting ones
    const allThemes = themeAnalyzer.extractDominantThemes(atoms, { maxThemes: 20 });
    
    // Find themes that appear in multiple chapters
    const crossCuttingThemes: string[] = [];
    for (const theme of allThemes) {
      let chapterCount = 0;
      for (const [chapterId, chapterAtoms] of chapterAtomMap) {
        const hasTheme = chapterAtoms.some(atom => 
          atom.domains.includes(theme as Domain) ||
          atom.tags?.includes(theme) ||
          atom.content.toLowerCase().includes(theme.toLowerCase())
        );
        if (hasTheme) chapterCount++;
      }
      if (chapterCount >= 2) {
        crossCuttingThemes.push(theme);
      }
    }

    const thematicClusters: ChapterCluster[] = [];

    for (const theme of crossCuttingThemes.slice(0, 3)) { // Limit to top 3 themes
      const themeAtoms = atoms.filter(atom => {
        return atom.domains.includes(theme as Domain) ||
               atom.tags?.includes(theme) ||
               atom.content.toLowerCase().includes(theme.toLowerCase());
      });

      if (themeAtoms.length >= 3) { // Minimum 3 atoms for thematic chapter
        const atomDates = themeAtoms.map(a => new Date(a.timestamp).getTime());
        const minDate = new Date(Math.min(...atomDates));
        const maxDate = new Date(Math.max(...atomDates));

        thematicClusters.push({
          id: `thematic-${theme}`,
          atoms: themeAtoms,
          dominantThemes: [theme],
          timeSpan: {
            start: minDate.toISOString(),
            end: maxDate.toISOString()
          },
          significance: themeAtoms.reduce((sum, a) => sum + a.significance, 0) / themeAtoms.length
        });
      }
    }

    return thematicClusters;
  }

  /**
   * Order chapters (enhanced with hybrid ordering)
   */
  private orderChapters(
    clusters: Array<ChapterCluster & { timelineChapterId?: string; timelineChapter?: TimelineChapter }>,
    spec: BiographySpec
  ): Array<ChapterCluster & { timelineChapterId?: string; timelineChapter?: TimelineChapter }> {
    if (spec.scope === 'full_life' || spec.scope === 'time_range') {
      // Primary: Chronological order
      // Secondary: Maintain timeline hierarchy structure
      return clusters.sort((a, b) => {
        // First, sort by time
        const timeDiff = new Date(a.timeSpan.start).getTime() - new Date(b.timeSpan.start).getTime();
        if (Math.abs(timeDiff) > 7 * 24 * 60 * 60 * 1000) { // More than 7 days difference
          return timeDiff;
        }
        // If close in time, maintain hierarchy order if available
        if (a.timelineChapterId && b.timelineChapterId) {
          // Try to maintain arc/chapter order
          return 0; // Keep original order for same-time chapters
        }
        return timeDiff;
      });
    } else if (spec.scope === 'thematic') {
      // Thematic order (by significance)
      return clusters.sort((a, b) => b.significance - a.significance);
    } else {
      // Domain scope: Hybrid - primary chronological, secondary thematic grouping
      return clusters.sort((a, b) => {
        // Primary: Chronological
        const timeDiff = new Date(a.timeSpan.start).getTime() - new Date(b.timeSpan.start).getTime();
        if (Math.abs(timeDiff) > 30 * 24 * 60 * 60 * 1000) { // More than 30 days
          return timeDiff;
        }
        // Secondary: Significance for close chapters
        return b.significance - a.significance;
      });
    }
  }

  /**
   * Generate chapter titles from timeline chapters
   * Uses timeline chapter title/description as context for better titles
   */
  private async generateChapterTitlesFromTimeline(
    clusters: Array<ChapterCluster & { timelineChapterId?: string; timelineChapter?: TimelineChapter }>,
    spec: BiographySpec,
    userId: string
  ): Promise<Array<ChapterCluster & { title: string; timelineChapterId?: string; timelineChapter?: TimelineChapter }>> {
    const chaptersWithTitles: Array<ChapterCluster & { title: string; timelineChapterId?: string; timelineChapter?: TimelineChapter }> = [];

    for (const cluster of clusters) {
      try {
        let title: string;

        // If we have a timeline chapter, use it as context for title generation
        if (cluster.timelineChapter) {
          const timelineChapter = cluster.timelineChapter;
          
          // If timeline chapter already has a good title, use it or enhance it
          if (timelineChapter.title && timelineChapter.title.length > 3) {
            // Use timeline chapter title as base, but enhance it with more context
            const themes = cluster.dominantThemes.join(', ');
            const keyEvents = cluster.atoms
              .sort((a, b) => b.significance - a.significance)
              .slice(0, 5)
              .map(a => {
                const date = new Date(a.timestamp);
                const dateStr = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                return `${dateStr}: ${a.content.substring(0, 60)}`;
              })
              .join('\n');

            // Get timeline hierarchy context
            let hierarchyContext = '';
            if (timelineChapter.parent_id) {
              try {
                const { data: arc } = await supabaseAdmin
                  .from('timeline_arcs')
                  .select('title, saga_id')
                  .eq('id', timelineChapter.parent_id)
                  .single();
                
                if (arc) {
                  hierarchyContext = `Part of Arc: ${arc.title}`;
                  
                  if (arc.saga_id) {
                    const { data: saga } = await supabaseAdmin
                      .from('timeline_sagas')
                      .select('title')
                      .eq('id', arc.saga_id)
                      .single();
                    
                    if (saga) {
                      hierarchyContext += ` | Part of Saga: ${saga.title}`;
                    }
                  }
                }
              } catch (error) {
                logger.debug({ error }, 'Failed to get hierarchy for chapter title');
              }
            }

            // Get character context
            let characterContext = '';
            const peopleIds = new Set<string>();
            cluster.atoms.forEach(a => {
              if (a.peopleIds) a.peopleIds.forEach(id => peopleIds.add(id));
            });
            
            if (peopleIds.size > 0) {
              try {
                const { data: characters } = await supabaseAdmin
                  .from('characters')
                  .select('name')
                  .in('id', Array.from(peopleIds))
                  .limit(3);
                if (characters && characters.length > 0) {
                  characterContext = `Characters: ${characters.map(c => c.name).join(', ')}`;
                }
              } catch (error) {
                logger.debug({ error }, 'Failed to fetch characters for chapter title');
              }
            }

            const completion = await openai.chat.completions.create({
              model: config.defaultModel || 'gpt-4o-mini',
              temperature: 0.7,
              messages: [
                {
                  role: 'system',
                  content: `Generate a concise, evocative chapter title (3-8 words) based on the timeline chapter title, events, timeline hierarchy, and characters.
Timeline Chapter: "${timelineChapter.title}"
Tone: ${spec.tone}. 
Examples: "Forged in Backyard Fights", "Learning to Build Instead of Break", "When Discipline Became Identity", "The Year Everything Changed"`
                },
                {
                  role: 'user',
                  content: `Timeline Chapter Title: ${timelineChapter.title}
${timelineChapter.description ? `Description: ${timelineChapter.description}\n` : ''}
${hierarchyContext ? `${hierarchyContext}\n` : ''}
${characterContext ? `${characterContext}\n` : ''}
Themes: ${themes}
Key Events:
${keyEvents}
Generate an enhanced chapter title that reflects the timeline context, events, and characters:`
                }
              ],
              max_tokens: 25
            });

            title = completion.choices[0]?.message?.content?.trim() || timelineChapter.title;
          } else {
            // Generate new title from timeline chapter context
            title = await this.generateTitleFromCluster(cluster, spec, userId);
          }
        } else {
          // Fallback to original title generation
          title = await this.generateTitleFromCluster(cluster, spec, userId);
        }

        chaptersWithTitles.push({ ...cluster, title });
      } catch (error) {
        logger.error({ error }, 'Failed to generate chapter title');
        const fallbackTitle = cluster.timelineChapter?.title || `Chapter ${chaptersWithTitles.length + 1}`;
        chaptersWithTitles.push({ 
          ...cluster, 
          title: fallbackTitle
        });
      }
    }

    return chaptersWithTitles;
  }

  /**
   * Generate title from cluster (helper method)
   * Enhanced with timeline hierarchy and detailed event context
   */
  private async generateTitleFromCluster(
    cluster: ChapterCluster,
    spec: BiographySpec,
    userId?: string
  ): Promise<string> {
    const themes = cluster.dominantThemes.join(', ');
    
    // Get more detailed event context (up to 5 events with dates)
    const keyEvents = cluster.atoms
      .sort((a, b) => b.significance - a.significance)
      .slice(0, 5)
      .map(a => {
        const date = new Date(a.timestamp);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        return `${dateStr}: ${a.content.substring(0, 60)}`;
      })
      .join('\n');

    // Get character names if available
    let characterContext = '';
    if (cluster.atoms.some(a => a.peopleIds && a.peopleIds.length > 0)) {
      const peopleIds = new Set<string>();
      cluster.atoms.forEach(a => {
        if (a.peopleIds) a.peopleIds.forEach(id => peopleIds.add(id));
      });
      
      if (peopleIds.size > 0 && userId) {
        try {
          const { data: characters } = await supabaseAdmin
            .from('characters')
            .select('name')
            .in('id', Array.from(peopleIds))
            .limit(3);
          if (characters && characters.length > 0) {
            characterContext = `Characters: ${characters.map(c => c.name).join(', ')}`;
          }
        } catch (error) {
          logger.debug({ error }, 'Failed to fetch characters for chapter title');
        }
      }
    }

    // Get timeline hierarchy context (parent arc, saga, era)
    let timelineHierarchyContext = '';
    if (cluster.timelineChapter && userId) {
      try {
        // Get parent arc if available
        if (cluster.timelineChapter.parent_id) {
          const { data: arc } = await supabaseAdmin
            .from('timeline_arcs')
            .select('title, saga_id')
            .eq('id', cluster.timelineChapter.parent_id)
            .single();
          
          if (arc) {
            timelineHierarchyContext = `Part of Arc: ${arc.title}`;
            
            // Get parent saga if available
            if (arc.saga_id) {
              const { data: saga } = await supabaseAdmin
                .from('timeline_sagas')
                .select('title, era_id')
                .eq('id', arc.saga_id)
                .single();
              
              if (saga) {
                timelineHierarchyContext += ` | Part of Saga: ${saga.title}`;
                
                // Get parent era if available
                if (saga.era_id) {
                  const { data: era } = await supabaseAdmin
                    .from('timeline_eras')
                    .select('title')
                    .eq('id', saga.era_id)
                    .single();
                  
                  if (era) {
                    timelineHierarchyContext += ` | Part of Era: ${era.title}`;
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        logger.debug({ error }, 'Failed to get timeline hierarchy for chapter title');
      }
    }

    // Build context
    const contextParts = [
      themes ? `Themes: ${themes}` : '',
      keyEvents ? `Key Events:\n${keyEvents}` : '',
      characterContext,
      timelineHierarchyContext,
      cluster.timeSpan ? `Time Span: ${new Date(cluster.timeSpan.start).getFullYear()} - ${cluster.timeSpan.end ? new Date(cluster.timeSpan.end).getFullYear() : 'present'}` : ''
    ].filter(Boolean);

    const completion = await openai.chat.completions.create({
      model: config.defaultModel || 'gpt-4o-mini',
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content: `Generate a concise, evocative chapter title (3-8 words) based on themes, events, timeline context, and characters.
Tone: ${spec.tone}
Examples: "Forged in Backyard Fights", "Learning to Build Instead of Break", "When Discipline Became Identity", "The Year Everything Changed", "Gabriel's Influence", "Building Robots, Breaking Barriers"`
        },
        {
          role: 'user',
          content: `Generate a chapter title based on:
${contextParts.join('\n\n')}

The title should reflect the specific events, timeline period, and characters involved.`
        }
      ],
      max_tokens: 25
    });

    return completion.choices[0]?.message?.content?.trim() || `Chapter`;
  }

  /**
   * Generate chapter titles (legacy method - kept for backward compatibility)
   */
  private async generateChapterTitles(
    clusters: ChapterCluster[],
    spec: BiographySpec
  ): Promise<Array<ChapterCluster & { title: string }>> {
    const chaptersWithTitles: Array<ChapterCluster & { title: string }> = [];

    for (const cluster of clusters) {
      try {
        // Build context for title generation
        const themes = cluster.dominantThemes.join(', ');
        const keyEvents = cluster.atoms
          .slice(0, 3)
          .map(a => a.content.substring(0, 50))
          .join('; ');

        const completion = await openai.chat.completions.create({
          model: config.defaultModel || 'gpt-4o-mini',
          temperature: 0.7,
          messages: [
            {
              role: 'system',
              content: `Generate a concise, evocative chapter title (3-8 words) based on themes and events. 
Tone: ${spec.tone}. 
Examples: "Forged in Backyard Fights", "Learning to Build Instead of Break", "When Discipline Became Identity"`
            },
            {
              role: 'user',
              content: `Themes: ${themes}\nKey events: ${keyEvents}\nGenerate a chapter title:`
            }
          ],
          max_tokens: 20
        });

        const title = completion.choices[0]?.message?.content?.trim() || 
          `Chapter ${chaptersWithTitles.length + 1}`;

        chaptersWithTitles.push({ ...cluster, title });
      } catch (error) {
        logger.error({ error }, 'Failed to generate chapter title');
        chaptersWithTitles.push({ 
          ...cluster, 
          title: `Chapter ${chaptersWithTitles.length + 1}` 
        });
      }
    }

    return chaptersWithTitles;
  }

  /**
   * Generate chapter narratives (enhanced with preserved content placement)
   */
  private async generateChapterNarratives(
    clusters: Array<ChapterCluster & { title: string; timelineChapterId?: string; timelineChapter?: TimelineChapter; isVoidChapter?: boolean; voidPeriodId?: string }>,
    spec: BiographySpec
  ): Promise<BiographyChapter[]> {
    const chapters: BiographyChapter[] = [];

    // Separate void chapters from regular chapters
    const voidChapters = clusters.filter(c => c.isVoidChapter);
    const regularClusters = clusters.filter(c => !c.isVoidChapter);

    // Extract all preserved atoms across regular clusters only
    const allPreservedAtoms = regularClusters.flatMap(c => 
      c.atoms.filter(a => (a.metadata as any)?.preserve_original_language === true)
    );

    // Get intelligent placement for preserved content (only for regular clusters)
    const placementMap = await preservedContentPlacer.placePreservedContent(
      allPreservedAtoms,
      regularClusters,
      spec
    );

    // Process void chapters first
    for (const cluster of voidChapters) {
      try {
        if (!cluster.voidPeriodId) continue;

        // Get void period information (we need to get this from the void periods detected earlier)
        // For now, we'll generate based on cluster metadata
        const voidStart = new Date(cluster.timeSpan.start);
        const voidEnd = new Date(cluster.timeSpan.end);
        const durationDays = Math.ceil(
          (voidEnd.getTime() - voidStart.getTime()) / (1000 * 60 * 60 * 24)
        );

        const startDateStr = voidStart.toLocaleDateString('en-US', { 
          month: 'long', 
          year: 'numeric',
          day: 'numeric'
        });
        const endDateStr = voidEnd.toLocaleDateString('en-US', { 
          month: 'long', 
          year: 'numeric',
          day: 'numeric'
        });

        const months = Math.ceil(durationDays / 30);
        const years = Math.floor(durationDays / 365);

        // Generate void-aware narrative with retry and fallback
        let text = await fallbackGenerator.callWithFallback(
          async () => {
            const completion = await openai.chat.completions.create({
              model: config.defaultModel || 'gpt-4o-mini',
              temperature: 0.7,
              messages: [
                {
                  role: 'system',
                  content: `You are a biographer writing about a gap in someone's life story. Acknowledge the void honestly, use context from surrounding periods, and provide prompts to help fill the gap. Write in first person, as if the subject is reflecting on this missing period.`
                },
                {
                  role: 'user',
                  content: `Chapter Title: ${cluster.title}

Between ${startDateStr} and ${endDateStr}, there are no recorded memories in the Lore Book. This period spans approximately ${durationDays} days${months >= 1 ? ` (about ${months} month${months > 1 ? 's' : ''})` : ''}${years >= 1 ? ` (about ${years} year${years > 1 ? 's' : ''})` : ''}.

Themes from surrounding periods: ${cluster.dominantThemes.join(', ') || 'Unknown'}

Write a narrative that:
1. Acknowledges this gap explicitly and honestly
2. Reflects on what might have happened during this period based on surrounding context
3. Provides thoughtful prompts/questions to help the person remember and fill this void
4. Maintains the ${spec.tone} tone appropriate for ${spec.audience} audience
5. Writes in first person as if the subject is reflecting on this missing time

Make it feel like a natural part of the biography, not just a placeholder.`
                }
              ],
              max_tokens: spec.depth === 'summary' ? 300 : spec.depth === 'detailed' ? 600 : 1000
            });
            const generatedText = completion.choices[0]?.message?.content || '';
            // Fallback if AI doesn't generate content
            if (!generatedText || generatedText.trim().length < 50) {
              throw new Error('Generated text too short');
            }
            return generatedText;
          },
          () => {
            // Fallback for void chapters
            return `Between ${startDateStr} and ${endDateStr}, there are no recorded memories in my Lore Book. This period spans approximately ${durationDays} days. 

What happened during this time? Consider:
- Major life changes
- Significant events or milestones
- Relationships that developed or changed
- Challenges or growth experiences
- Creative projects, work changes, or personal transformations

This gap in my story represents a period I haven't yet captured. What memories from this time should be preserved?`;
          },
          `Generate void narrative for chapter: ${cluster.title}`
        );

        // Generate prompts for this void
        const prompts = voidAwarenessService.generateVoidPrompts({
          id: cluster.voidPeriodId,
          start: cluster.timeSpan.start,
          end: cluster.timeSpan.end,
          durationDays,
          type: durationDays < 30 ? 'short_gap' : durationDays < 180 ? 'medium_gap' : 'long_silence',
          significance: durationDays >= 180 ? 'high' : durationDays >= 30 ? 'medium' : 'low'
        });

        chapters.push({
          id: cluster.id,
          title: cluster.title,
          text,
          timeSpan: cluster.timeSpan,
          timelineChapterIds: [],
          atoms: [],
          themes: cluster.dominantThemes,
          isVoidChapter: true,
          voidPeriodId: cluster.voidPeriodId,
          voidMetadata: {
            durationDays,
            type: durationDays < 30 ? 'short_gap' : durationDays < 180 ? 'medium_gap' : 'long_silence',
            prompts
          }
        });
      } catch (error) {
        logger.error({ error }, 'Failed to generate void chapter narrative');
        // Fallback for void chapters
        const voidStart = new Date(cluster.timeSpan.start);
        const voidEnd = new Date(cluster.timeSpan.end);
        const durationDays = Math.ceil(
          (voidEnd.getTime() - voidStart.getTime()) / (1000 * 60 * 60 * 24)
        );
        
        chapters.push({
          id: cluster.id,
          title: cluster.title,
          text: `Between ${voidStart.toLocaleDateString()} and ${voidEnd.toLocaleDateString()}, there are no recorded memories. This period spans approximately ${durationDays} days. What happened during this time?`,
          timeSpan: cluster.timeSpan,
          timelineChapterIds: [],
          atoms: [],
          themes: cluster.dominantThemes,
          isVoidChapter: true,
          voidPeriodId: cluster.voidPeriodId,
          voidMetadata: {
            durationDays,
            type: durationDays < 30 ? 'short_gap' : durationDays < 180 ? 'medium_gap' : 'long_silence',
            prompts: ['What happened during this period?']
          }
        });
      }
    }

    // Process regular chapters
    for (const cluster of regularClusters) {
      try {
        // Get preserved content for this chapter
        const preservedInChapter = placementMap.get(cluster.id) || [];
        const openingContent = preservedInChapter.filter(p => p.position === 'opening');
        const middleContent = preservedInChapter.filter(p => p.position === 'middle');
        const closingContent = preservedInChapter.filter(p => p.position === 'closing');

        // Separate preserved content from regular content
        const preservedAtomIds = new Set(preservedInChapter.map(p => p.atom.id));
        const preservedAtoms = cluster.atoms.filter(a => 
          preservedAtomIds.has(a.id)
        );
        const regularAtoms = cluster.atoms.filter(a => 
          !preservedAtomIds.has(a.id)
        );

        // Build context from regular atoms (for LLM processing)
        // Format for biographical writing - provide temporal context
        const atomSummaries = regularAtoms
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
          .map((a, index, array) => {
            const date = new Date(a.timestamp);
            const dateStr = date.toLocaleDateString('en-US', { 
              month: 'long', 
              year: 'numeric',
              day: date.getDate() === 1 ? undefined : 'numeric'
            });
            
            // Add relative time context if helpful
            let timeContext = '';
            if (index > 0) {
              const prevDate = new Date(array[index - 1].timestamp);
              const daysDiff = Math.floor((date.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
              if (daysDiff > 30) {
                timeContext = ` (${Math.round(daysDiff / 30)} months later)`;
              } else if (daysDiff > 7) {
                timeContext = ` (${Math.round(daysDiff / 7)} weeks later)`;
              }
            }
            
            return `${dateStr}${timeContext}: ${a.content}`;
          })
          .join('\n');

        // Format preserved content by position (verbatim, no LLM processing)
        const formatPreservedContent = (placements: Array<{ atom: NarrativeAtom; position: string }>) => {
          return placements
            .sort((a, b) => new Date(a.atom.timestamp).getTime() - new Date(b.atom.timestamp).getTime())
            .map(p => {
              const contentType = (p.atom.metadata as any)?.content_type || 'preserved';
              const date = new Date(p.atom.timestamp);
              const dateStr = date.toLocaleDateString('en-US', { 
                month: 'long', 
                year: 'numeric',
                day: date.getDate() === 1 ? undefined : 'numeric'
              });
              return `[${contentType.toUpperCase()}, ${dateStr}]\n${p.atom.content}`;
            })
            .join('\n\n---\n\n');
        };

        const openingPreservedContent = formatPreservedContent(openingContent);
        const middlePreservedContent = formatPreservedContent(middleContent);
        const closingPreservedContent = formatPreservedContent(closingContent);

        // Add timeline chapter context if available
        const timelineContext = cluster.timelineChapter
          ? `\nTimeline Chapter: ${cluster.timelineChapter.title}${cluster.timelineChapter.description ? `\nDescription: ${cluster.timelineChapter.description}` : ''}${cluster.timelineChapter.summary ? `\nSummary: ${cluster.timelineChapter.summary}` : ''}`
          : '';

        const toneInstructions = this.getToneInstructions(spec.tone);
        const audienceInstructions = this.getAudienceInstructions(spec.audience);
        const introspection = spec.includeIntrospection 
          ? 'Include introspection and inner thoughts.' 
          : 'Focus on external events and actions.';

        // Wrap LLM call with retry and fallback
        let text = await fallbackGenerator.callWithFallback(
          async () => {
            const completion = await openai.chat.completions.create({
              model: config.defaultModel,
              temperature: 0.7,
              messages: [
                {
                  role: 'system',
                  content: `You are a skilled biographer writing a ${spec.depth} biography chapter in ${spec.tone} tone for ${spec.audience} audience.

${toneInstructions}
${audienceInstructions}
${introspection}

**CRITICAL BIOGRAPHY WRITING RULES:**
1. **Write like a biography, NOT a timeline**: Transform facts into flowing narrative prose. Don't just list events chronologically - weave them into a story.
2. **Use temporal flow**: Use phrases like "In the spring of...", "As the months passed...", "During this period...", "Over time..." to create natural transitions.
3. **Narrative transitions**: Connect events with transitions like "Meanwhile...", "Around this time...", "This led to...", "As a result...", "In response..."
4. **Show, don't just tell**: Instead of "I went to the store", write "I found myself walking through the aisles of the local market" (when appropriate for the tone).
5. **Character development**: When characters appear, briefly establish who they are in the narrative context, not just their name.
6. **Emotional context**: Include emotional undertones and inner experience when relevant (based on introspection setting).
7. **Chronological flow**: Events should flow naturally through time, but not feel like a list. Group related events together.
8. **First person voice**: Write in first person ("I", "my", "me") as if the subject is telling their own story.
9. **Biographical style**: This should read like a memoir or autobiography, not a journal entry or timeline.

**What to AVOID:**
- Don't start every sentence with a date or timestamp
- Don't list events like "On [date], I did X. On [date], I did Y."
- Don't write like a bulleted list or timeline
- Don't use clinical or report-like language

**What to DO:**
- Weave events into a cohesive narrative
- Use natural time transitions
- Create a sense of story and progression
- Make it read like someone is recounting their life story`
                },
                {
                  role: 'user',
                  content: `Chapter Title: ${cluster.title}${timelineContext}

${openingPreservedContent ? `**OPENING PRESERVED CONTENT (include at the beginning, verbatim, do not rewrite):**
${openingPreservedContent}

` : ''}**Raw Events (transform these into biographical prose):**
${atomSummaries}

${middlePreservedContent ? `**MIDDLE PRESERVED CONTENT (integrate naturally in the middle, verbatim, do not rewrite):**
${middlePreservedContent}

` : ''}${closingPreservedContent ? `**CLOSING PRESERVED CONTENT (include at the end, verbatim, do not rewrite):**
${closingPreservedContent}

` : ''}**Your Task:**
${openingPreservedContent ? 'First, include the opening preserved content EXACTLY as written. Then, ' : ''}Transform the events above into flowing biographical narrative prose. Write as if the subject is telling their own story. Make it read like a memoir chapter, not a timeline or list of events.${middlePreservedContent ? ' Integrate the middle preserved content naturally within the narrative flow, keeping it in its original wording.' : ''}${closingPreservedContent ? ' End with the closing preserved content EXACTLY as written.' : ''} Use natural temporal transitions and weave the events into a cohesive narrative.`
                }
              ],
              max_tokens: spec.depth === 'summary' ? 500 : spec.depth === 'detailed' ? 1000 : 2000
            });
            return completion.choices[0]?.message?.content || '';
          },
          () => {
            // Fallback: use template-based generation
            const fallbackChapter = fallbackGenerator.generateTemplateBased(cluster, spec);
            return fallbackChapter.text;
          },
          `Generate narrative for chapter: ${cluster.title}`
        );

        // Apply text-level filtering (version-aware)
        const version = spec.version || 'main';
        if (version === 'safe') {
          text = filterBiographyText(text, {
            filterSensitive: true,
            audience: 'public',
            includeIntrospection: false
          });
        }

        // Build preserved content placements metadata
        const preservedContentPlacements = preservedInChapter.map(p => ({
          atomId: p.atom.id,
          chapterId: cluster.id,
          position: p.position,
          contentType: (p.atom.metadata as any)?.content_type || 'standard',
          reasoning: `Placed at ${p.position} based on content type and narrative relevance`
        }));

        // Get timeline hierarchy metadata
        let timelineHierarchyMetadata: { sagaId?: string; arcId?: string; eraId?: string } | undefined;
        if (cluster.timelineChapter?.parent_id) {
          try {
            const { data: arc } = await supabaseAdmin
              .from('timeline_arcs')
              .select('id, saga_id')
              .eq('id', cluster.timelineChapter.parent_id)
              .single();
            
            if (arc) {
              timelineHierarchyMetadata = { arcId: arc.id };
              
              if (arc.saga_id) {
                timelineHierarchyMetadata.sagaId = arc.saga_id;
                
                // Try to get era_id from saga
                const { data: saga } = await supabaseAdmin
                  .from('timeline_sagas')
                  .select('era_id')
                  .eq('id', arc.saga_id)
                  .single();
                
                if (saga?.era_id) {
                  timelineHierarchyMetadata.eraId = saga.era_id;
                }
              }
            }
          } catch (error) {
            logger.debug({ error }, 'Failed to get timeline hierarchy metadata');
          }
        }

        chapters.push({
          id: cluster.id,
          title: cluster.title,
          text,
          timeSpan: cluster.timeSpan,
          timelineChapterIds: cluster.timelineChapterId ? [cluster.timelineChapterId] : [],
          timelineChapters: cluster.timelineChapter ? [cluster.timelineChapter] : undefined,
          atoms: cluster.atoms,
          themes: cluster.dominantThemes,
          preservedContent: preservedContentPlacements.length > 0 ? preservedContentPlacements : undefined,
          timelineHierarchy: timelineHierarchyMetadata,
          isVoidChapter: false
        });
      } catch (error) {
        logger.error({ error }, 'Failed to generate chapter narrative');
        // Fallback: use atom content
        const text = cluster.atoms
          .map(a => a.content || '')
          .filter(Boolean)
          .join('\n\n');
        
        chapters.push({
          id: cluster.id,
          title: cluster.title,
          text,
          timeSpan: cluster.timeSpan,
          timelineChapterIds: cluster.timelineChapterId ? [cluster.timelineChapterId] : [],
          timelineChapters: cluster.timelineChapter ? [cluster.timelineChapter] : undefined,
          atoms: cluster.atoms,
          themes: cluster.dominantThemes,
          preservedContent: undefined,
          isVoidChapter: false,
          timelineHierarchy: undefined
        });
      }
    }

    return chapters;
  }

  /**
   * Get tone instructions
   */
  private getToneInstructions(tone: BiographySpec['tone']): string {
    switch (tone) {
      case 'dramatic':
        return 'Use vivid, dramatic language. Emphasize conflict, tension, and emotional intensity.';
      case 'reflective':
        return 'Use thoughtful, introspective language. Focus on meaning and personal growth.';
      case 'mythic':
        return 'Use elevated, archetypal language. Frame events as part of a larger narrative.';
      case 'professional':
        return 'Use clear, professional language. Focus on achievements and competence.';
      default:
        return 'Use neutral, factual language.';
    }
  }

  /**
   * Get audience instructions
   */
  private getAudienceInstructions(audience: BiographySpec['audience']): string {
    switch (audience) {
      case 'public':
        return 'Write for a general audience. Avoid overly personal details.';
      case 'professional':
        return 'Write for professional context. Emphasize skills, achievements, and competence.';
      default:
        return 'Write for personal reflection. Include authentic personal details.';
    }
  }

  /**
   * Assemble final biography (compiled binary)
   */
  private assembleBiography(
    chapters: BiographyChapter[],
    spec: BiographySpec,
    atomCount: number,
    filteredAtoms: any[] = [],
    generatedTitle?: string,
    atomHashes: string[] = [],
    timePeriods?: any[],
    timelineHierarchy?: TimelineHierarchy,
    voidPeriods?: any[],
    voidCount?: number
  ): Biography {
    const title = generatedTitle || this.getFallbackTitle(spec);
    const subtitle = this.generateBiographySubtitle(spec);
    
    // If this is a core lorebook with a name, use that name (unless we generated a better one)
    const finalTitle = (spec as any).lorebookName || title;

    // List which filters were applied
    const version = spec.version || 'main';
    const filtersApplied: string[] = [];
    if (version === 'safe') {
      filtersApplied.push('sensitivity-filter', 'high-emotion-filter', 'conflict-filter');
    } else if (version === 'main') {
      filtersApplied.push('extreme-sensitivity-filter');
    }

    // Use provided atom hashes or generate from filtered atoms
    const finalAtomHashes = atomHashes.length > 0 
      ? atomHashes 
      : filteredAtoms.map(atom => atom.id);

    return {
      id: `bio-${Date.now()}`,
      title: finalTitle,
      subtitle,
      version: spec.version || 'main', // Build flag used
      chapters,
      metadata: {
        domain: spec.domain,
        generatedAt: new Date().toISOString(),
        spec,
        atomCount,
        filtersApplied, // Which filters were applied
        isCoreLorebook: (spec as any).isCoreLorebook || false,
        lorebookName: (spec as any).lorebookName,
        lorebookVersion: (spec as any).lorebookVersion || 1,
        atomHashes: finalAtomHashes, // Reference hashes to NarrativeAtoms used
        memorySnapshotAt: new Date().toISOString(), // When memory was queried
        timePeriods: timePeriods || [], // Time periods detected
        timelineHierarchy: timelineHierarchy || undefined, // Full timeline hierarchy
        voidPeriods: voidPeriods || [], // Void periods detected
        voidCount: voidCount || 0 // Number of void chapters
      }
    };
  }

  /**
   * Generate biography title based on lorebook context, timelines, and events
   */
  private async generateBiographyTitle(
    userId: string,
    spec: BiographySpec,
    filteredAtoms: NarrativeAtom[],
    chapters: BiographyChapter[]
  ): Promise<string> {
    // If lorebook name is provided, use it as base
    const lorebookName = (spec as any).lorebookName;
    if (lorebookName) {
      return lorebookName;
    }

    try {
      // Get timeline hierarchy context
      const timelineContext = await this.getTimelineContextForBiography(userId, filteredAtoms);
      
      // Extract key themes and events
      const themes = this.extractDominantThemes(filteredAtoms);
      const keyEvents = filteredAtoms
        .sort((a, b) => b.significance - a.significance)
        .slice(0, 5)
        .map(a => a.content.substring(0, 80))
        .join('; ');

      // Get character context if character-based lorebook
      let characterContext = '';
      if (spec.characterIds && spec.characterIds.length > 0) {
        const { data: characters } = await supabaseAdmin
          .from('characters')
          .select('name')
          .in('id', spec.characterIds)
          .limit(3);
        if (characters && characters.length > 0) {
          characterContext = `Characters: ${characters.map(c => c.name).join(', ')}`;
        }
      }

      // Build context string
      const contextParts = [
        timelineContext ? `Timeline Context: ${timelineContext}` : '',
        themes.length > 0 ? `Themes: ${themes.join(', ')}` : '',
        keyEvents ? `Key Events: ${keyEvents}` : '',
        spec.domain ? `Domain: ${spec.domain}` : '',
        spec.scope === 'time_range' && spec.timeRange 
          ? `Time Range: ${new Date(spec.timeRange.start).getFullYear()} - ${new Date(spec.timeRange.end).getFullYear()}`
          : '',
        characterContext
      ].filter(Boolean);

      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.8,
        messages: [
          {
            role: 'system',
            content: `Generate an evocative biography title (3-8 words) based on the lorebook context, timeline, themes, and events.
Tone: ${spec.tone}
Examples: "The Fighter's Journey", "Building the Future", "Connections and Bonds", "The Creative Path", "My Robotics Story", "The Year of Transformation", "Gabriel and Me: A Story of Friendship"`
          },
          {
            role: 'user',
            content: `Generate a biography title for:
${contextParts.join('\n')}

The title should reflect the specific lorebook, timeline period, and key themes/events.`
          }
        ],
        max_tokens: 30
      });

      const title = completion.choices[0]?.message?.content?.trim() || this.getFallbackTitle(spec);
      return title.replace(/^["']|["']$/g, '');
    } catch (error) {
      logger.error({ error }, 'Failed to generate biography title, using fallback');
      return this.getFallbackTitle(spec);
    }
  }

  /**
   * Get timeline context for biography (eras, sagas, arcs)
   */
  private async getTimelineContextForBiography(
    userId: string,
    atoms: NarrativeAtom[]
  ): Promise<string> {
    if (atoms.length === 0) return '';

    try {
      // Get date range from atoms
      const dates = atoms.map(a => new Date(a.timestamp).getTime()).sort((a, b) => a - b);
      const startDate = new Date(dates[0]).toISOString().split('T')[0];
      const endDate = new Date(dates[dates.length - 1]).toISOString().split('T')[0];

      // Find eras, sagas, and arcs that overlap with this date range
      const [erasResult, sagasResult, arcsResult] = await Promise.all([
        supabaseAdmin
          .from('timeline_eras')
          .select('title')
          .eq('user_id', userId)
          .lte('start_date', endDate)
          .or(`end_date.is.null,end_date.gte.${startDate}`)
          .limit(3),
        supabaseAdmin
          .from('timeline_sagas')
          .select('title')
          .eq('user_id', userId)
          .lte('start_date', endDate)
          .or(`end_date.is.null,end_date.gte.${startDate}`)
          .limit(3),
        supabaseAdmin
          .from('timeline_arcs')
          .select('title')
          .eq('user_id', userId)
          .lte('start_date', endDate)
          .or(`end_date.is.null,end_date.gte.${startDate}`)
          .limit(5)
      ]);

      const parts: string[] = [];
      if (erasResult.data && erasResult.data.length > 0) {
        parts.push(`Eras: ${erasResult.data.map(e => e.title).join(', ')}`);
      }
      if (sagasResult.data && sagasResult.data.length > 0) {
        parts.push(`Sagas: ${sagasResult.data.map(s => s.title).join(', ')}`);
      }
      if (arcsResult.data && arcsResult.data.length > 0) {
        parts.push(`Arcs: ${arcsResult.data.map(a => a.title).join(', ')}`);
      }

      return parts.join(' | ');
    } catch (error) {
      logger.debug({ error }, 'Failed to get timeline context');
      return '';
    }
  }

  /**
   * Extract dominant themes from atoms
   */
  private extractDominantThemes(atoms: NarrativeAtom[]): string[] {
    const themeCounts: Record<string, number> = {};
    
    atoms.forEach(atom => {
      atom.domains.forEach(domain => {
        themeCounts[domain] = (themeCounts[domain] || 0) + 1;
      });
      if (atom.tags) {
        atom.tags.forEach(tag => {
          themeCounts[tag] = (themeCounts[tag] || 0) + 1;
        });
      }
    });

    return Object.entries(themeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([theme]) => theme);
  }

  /**
   * Get fallback title
   */
  private getFallbackTitle(spec: BiographySpec): string {
    if (spec.scope === 'domain' && spec.domain) {
      const domainTitles: Record<Domain, string> = {
        fighting: 'The Fighter\'s Journey',
        robotics: 'Building the Future',
        relationships: 'Connections and Bonds',
        creative: 'The Creative Path',
        professional: 'Professional Journey',
        personal: 'My Story',
        health: 'Health and Wellness',
        education: 'Learning Journey',
        family: 'Family Story',
        friendship: 'Friendships',
        romance: 'Love Story'
      };
      return domainTitles[spec.domain] || 'My Biography';
    }
    return 'My Life Story';
  }

  /**
   * Generate biography subtitle
   */
  private generateBiographySubtitle(spec: BiographySpec): string {
    if (spec.timeRange) {
      const start = new Date(spec.timeRange.start).getFullYear();
      const end = new Date(spec.timeRange.end).getFullYear();
      return `${start} - ${end}`;
    }
    return undefined;
  }

  /**
   * Save biography
   */
  private async saveBiography(userId: string, biography: Biography): Promise<void> {
    try {
      // Generate atom snapshot hash if atoms are available
      let atomSnapshotHash: string | null = null;
      if (biography.metadata.atomHashes && biography.metadata.atomHashes.length > 0) {
        try {
          const { bookVersionManager } = await import('./bookVersionManager');
          atomSnapshotHash = bookVersionManager.generateAtomSnapshotHash(
            biography.metadata.atomHashes.map(hash => ({ id: hash }))
          );
        } catch (error) {
          logger.debug({ error }, 'Failed to generate atom snapshot hash');
        }
      }

      await supabaseAdmin
        .from('biographies')
        .insert({
          user_id: userId,
          biography_data: biography,
          title: biography.title,
          subtitle: biography.subtitle,
          domain: biography.metadata.domain,
          version: biography.version, // Build flag
          is_core_lorebook: biography.metadata.isCoreLorebook || false,
          lorebook_name: biography.metadata.lorebookName,
          lorebook_version: biography.metadata.lorebookVersion || 1,
          memory_snapshot_at: biography.metadata.memorySnapshotAt || new Date().toISOString(),
          atom_snapshot_hash: atomSnapshotHash,
          created_at: new Date().toISOString()
        });
    } catch (error) {
      logger.error({ error, userId }, 'Failed to save biography');
      // Don't throw - biography is still generated
    }
  }
}

export const biographyGenerationEngine = new BiographyGenerationEngine();
