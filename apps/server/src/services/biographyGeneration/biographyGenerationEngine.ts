/**
 * BiographyGenerationEngine
 * 
 * Core principle: "Structure first. Narrative second. Prose last."
 * 
 * Generates biographies from precomputed NarrativeAtoms, not raw journal text.
 */

import OpenAI from 'openai';
import { logger } from '../../logger';
import { config } from '../../config';
import { supabaseAdmin } from '../supabaseClient';
import { buildAtomsFromTimeline } from './narrativeAtomBuilder';
import { filterSensitiveAtoms, filterBiographyText } from './contentFilter';
import type {
  NarrativeAtom,
  NarrativeGraph,
  BiographySpec,
  Biography,
  BiographyChapter,
  ChapterCluster,
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

      // 3. Cluster atoms into chapters
      const chapterClusters = this.clusterAtomsIntoChapters(filteredAtoms, spec);

      // 4. Order chapters
      const orderedChapters = this.orderChapters(chapterClusters, spec);

      // 5. Generate chapter titles
      const chaptersWithTitles = await this.generateChapterTitles(orderedChapters, spec);

      // 6. Generate chapter narratives
      const chapters = await this.generateChapterNarratives(chaptersWithTitles, spec);

      // 7. Assemble biography
      const biography = this.assembleBiography(chapters, spec, filteredAtoms.length);

      // 8. Save biography
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
    // Private and explicit versions: no filtering
    if (spec.version === 'private' || spec.version === 'explicit') {
      return atoms;
    }

    // Safe version: filter sensitive content
    if (spec.version === 'safe') {
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
        const summary = a.summary.toLowerCase();
        return spec.themes!.some(theme => summary.includes(theme.toLowerCase()));
      });
    }

    // Filter by people
    if (spec.peopleIds && spec.peopleIds.length > 0) {
      atoms = atoms.filter(a => 
        a.peopleIds.some(pid => spec.peopleIds!.includes(pid))
      );
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
   * Order chapters
   */
  private orderChapters(
    clusters: ChapterCluster[],
    spec: BiographySpec
  ): ChapterCluster[] {
    if (spec.scope === 'full_life' || spec.scope === 'time_range') {
      // Chronological order
      return clusters.sort((a, b) => 
        new Date(a.timeSpan.start).getTime() - new Date(b.timeSpan.start).getTime()
      );
    } else {
      // Thematic order (by significance)
      return clusters.sort((a, b) => b.significance - a.significance);
    }
  }

  /**
   * Generate chapter titles
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
          .map(a => a.summary.substring(0, 50))
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
   * Generate chapter narratives
   */
  private async generateChapterNarratives(
    clusters: Array<ChapterCluster & { title: string }>,
    spec: BiographySpec
  ): Promise<BiographyChapter[]> {
    const chapters: BiographyChapter[] = [];

    for (const cluster of clusters) {
      try {
        // Build context from atoms (only LLM call)
        const atomSummaries = cluster.atoms
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
          .map(a => `[${a.timestamp}] ${a.content}`)
          .join('\n');

        const toneInstructions = this.getToneInstructions(spec.tone);
        const audienceInstructions = this.getAudienceInstructions(spec.audience);
        const introspection = spec.includeIntrospection 
          ? 'Include introspection and inner thoughts.' 
          : 'Focus on external events and actions.';

        const completion = await openai.chat.completions.create({
          model: config.defaultModel,
          temperature: 0.7,
          messages: [
            {
              role: 'system',
              content: `You are writing a ${spec.depth} biography chapter in ${spec.tone} tone for ${spec.audience} audience.
${toneInstructions}
${audienceInstructions}
${introspection}
Write in first person. Create cohesive narrative prose that flows naturally.`
            },
            {
              role: 'user',
              content: `Chapter Title: ${cluster.title}\n\nEvents:\n${atomSummaries}\n\nWrite the chapter narrative:`
            }
          ],
          max_tokens: spec.depth === 'summary' ? 500 : spec.depth === 'detailed' ? 1000 : 2000
        });

        let text = completion.choices[0]?.message?.content || '';

        // Apply text-level filtering (version-aware)
        if (spec.version === 'safe') {
          text = filterBiographyText(text, {
            filterSensitive: true,
            audience: 'public',
            includeIntrospection: false
          });
        }

        chapters.push({
          id: cluster.id,
          title: cluster.title,
          text,
          timeSpan: cluster.timeSpan,
          atoms: cluster.atoms,
          themes: cluster.dominantThemes
        });
      } catch (error) {
        logger.error({ error }, 'Failed to generate chapter narrative');
        // Fallback: use atom summaries
        const text = cluster.atoms
          .map(a => a.summary)
          .join('\n\n');
        
        chapters.push({
          id: cluster.id,
          title: cluster.title,
          text,
          timeSpan: cluster.timeSpan,
          atoms: cluster.atoms,
          themes: cluster.dominantThemes
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
    atomCount: number
  ): Biography {
    const title = this.generateBiographyTitle(spec);
    const subtitle = this.generateBiographySubtitle(spec);

    // List which filters were applied
    const filtersApplied: string[] = [];
    if (spec.version === 'safe') {
      filtersApplied.push('sensitivity-filter', 'high-emotion-filter', 'conflict-filter');
    } else if (spec.version === 'main') {
      filtersApplied.push('extreme-sensitivity-filter');
    }

    // Generate atom hashes for reference tracking
    const atomHashes = filteredAtoms.map(a => a.id);

    return {
      id: `bio-${Date.now()}`,
      title,
      subtitle,
      version: spec.version, // Build flag used
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
        atomHashes, // Reference hashes to NarrativeAtoms used
        memorySnapshotAt: new Date().toISOString() // When memory was queried
      }
    };
  }

  /**
   * Generate biography title
   */
  private generateBiographyTitle(spec: BiographySpec): string {
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
          created_at: new Date().toISOString()
        });
    } catch (error) {
      logger.error({ error, userId }, 'Failed to save biography');
      // Don't throw - biography is still generated
    }
  }
}

export const biographyGenerationEngine = new BiographyGenerationEngine();
