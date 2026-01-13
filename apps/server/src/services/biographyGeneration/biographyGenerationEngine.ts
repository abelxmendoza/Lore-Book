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
import { chapterService } from '../chapterService';
import { buildAtomsFromTimeline } from './narrativeAtomBuilder';
import { filterSensitiveAtoms, filterBiographyText } from './contentFilter';
import type {
  NarrativeAtom,
  NarrativeGraph,
  BiographySpec,
  Biography,
  BiographyChapter,
  ChapterCluster,
  TimelineChapter,
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

      // 3. Load timeline chapters (source structure)
      const timelineChapters = await this.loadTimelineChapters(userId, spec);

      // 4. Cluster atoms into chapters using timeline chapters as structure
      const chapterClusters = this.clusterAtomsIntoChaptersFromTimeline(
        filteredAtoms, 
        timelineChapters, 
        spec
      );

      // 5. Order chapters
      const orderedChapters = this.orderChapters(chapterClusters, spec);

      // 6. Generate chapter titles from timeline chapters
      const chaptersWithTitles = await this.generateChapterTitlesFromTimeline(
        orderedChapters, 
        spec,
        userId
      );

      // 7. Generate chapter narratives
      const chapters = await this.generateChapterNarratives(chaptersWithTitles, spec);

      // 7. Generate biography title (needs chapters and atoms for context)
      const biographyTitle = await this.generateBiographyTitle(userId, spec, filteredAtoms, chapters);

      // 8. Assemble biography
      const biography = this.assembleBiography(chapters, spec, filteredAtoms.length, filteredAtoms, biographyTitle);

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
                  .from('arcs')
                  .select('title, saga_id')
                  .eq('id', timelineChapter.parent_id)
                  .single();
                
                if (arc) {
                  hierarchyContext = `Part of Arc: ${arc.title}`;
                  
                  if (arc.saga_id) {
                    const { data: saga } = await supabaseAdmin
                      .from('sagas')
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
            .from('arcs')
            .select('title, saga_id')
            .eq('id', cluster.timelineChapter.parent_id)
            .single();
          
          if (arc) {
            timelineHierarchyContext = `Part of Arc: ${arc.title}`;
            
            // Get parent saga if available
            if (arc.saga_id) {
              const { data: saga } = await supabaseAdmin
                .from('sagas')
                .select('title, era_id')
                .eq('id', arc.saga_id)
                .single();
              
              if (saga) {
                timelineHierarchyContext += ` | Part of Saga: ${saga.title}`;
                
                // Get parent era if available
                if (saga.era_id) {
                  const { data: era } = await supabaseAdmin
                    .from('eras')
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
   * Generate chapter narratives
   */
  private async generateChapterNarratives(
    clusters: Array<ChapterCluster & { title: string; timelineChapterId?: string; timelineChapter?: TimelineChapter }>,
    spec: BiographySpec
  ): Promise<BiographyChapter[]> {
    const chapters: BiographyChapter[] = [];

    for (const cluster of clusters) {
      try {
        // Build context from atoms (only LLM call)
        // Format for biographical writing - provide temporal context
        const atomSummaries = cluster.atoms
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

        // Add timeline chapter context if available
        const timelineContext = cluster.timelineChapter
          ? `\nTimeline Chapter: ${cluster.timelineChapter.title}${cluster.timelineChapter.description ? `\nDescription: ${cluster.timelineChapter.description}` : ''}${cluster.timelineChapter.summary ? `\nSummary: ${cluster.timelineChapter.summary}` : ''}`
          : '';

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

**Raw Events (transform these into biographical prose):**
${atomSummaries}

**Your Task:**
Transform the events above into flowing biographical narrative prose. Write as if the subject is telling their own story. Make it read like a memoir chapter, not a timeline or list of events. Use natural temporal transitions and weave the events into a cohesive narrative.`
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
          timelineChapterIds: cluster.timelineChapterId ? [cluster.timelineChapterId] : [],
          timelineChapters: cluster.timelineChapter ? [cluster.timelineChapter] : undefined,
          atoms: cluster.atoms,
          themes: cluster.dominantThemes
        });
      } catch (error) {
        logger.error({ error }, 'Failed to generate chapter narrative');
        // Fallback: use atom summaries
        const text = cluster.atoms
          .map(a => a.content || a.summary || '')
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
    atomCount: number,
    filteredAtoms: any[] = [],
    generatedTitle?: string
  ): Biography {
    const title = generatedTitle || this.getFallbackTitle(spec);
    const subtitle = this.generateBiographySubtitle(spec);
    
    // If this is a core lorebook with a name, use that name (unless we generated a better one)
    const finalTitle = (spec as any).lorebookName || title;

    // List which filters were applied
    const filtersApplied: string[] = [];
    if (spec.version === 'safe') {
      filtersApplied.push('sensitivity-filter', 'high-emotion-filter', 'conflict-filter');
    } else if (spec.version === 'main') {
      filtersApplied.push('extreme-sensitivity-filter');
    }

    // Generate atom hashes for reference tracking (if available)
    const atomHashes: string[] = [];

    return {
      id: `bio-${Date.now()}`,
      title: finalTitle,
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
          .from('eras')
          .select('title')
          .eq('user_id', userId)
          .lte('start_date', endDate)
          .or(`end_date.is.null,end_date.gte.${startDate}`)
          .limit(3),
        supabaseAdmin
          .from('sagas')
          .select('title')
          .eq('user_id', userId)
          .lte('start_date', endDate)
          .or(`end_date.is.null,end_date.gte.${startDate}`)
          .limit(3),
        supabaseAdmin
          .from('arcs')
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
