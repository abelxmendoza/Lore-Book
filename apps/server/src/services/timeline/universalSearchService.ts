/**
 * Universal Timeline Search Service
 * Searches across all timeline sources: people, locations, skills, jobs, projects, eras, etc.
 */

import { supabaseAdmin } from '../supabaseClient';
import { logger } from '../../logger';
import { TimelineEngine } from './timelineEngine';

export interface UniversalSearchResult {
  id: string;
  title: string;
  date: string;
  timelineType: string;
  sourceType?: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface UniversalSearchResponse {
  life: UniversalSearchResult[];
  people: UniversalSearchResult[];
  locations: UniversalSearchResult[];
  skills: UniversalSearchResult[];
  projects: UniversalSearchResult[];
  jobs: UniversalSearchResult[];
  eras: UniversalSearchResult[];
  arcs: UniversalSearchResult[];
  sagas: UniversalSearchResult[];
  relationships: UniversalSearchResult[];
}

export class UniversalSearchService {
  constructor(private timelineEngine: TimelineEngine) {}

  /**
   * Return empty response structure
   */
  emptyResponse(): UniversalSearchResponse {
    return {
      life: [],
      people: [],
      locations: [],
      skills: [],
      projects: [],
      jobs: [],
      eras: [],
      arcs: [],
      sagas: [],
      relationships: []
    };
  }

  /**
   * Search across all timeline sources
   */
  async search(userId: string, query: string): Promise<UniversalSearchResponse> {
    const searchTerm = query.toLowerCase().trim();
    
    if (searchTerm.length < 2) {
      return this.emptyResponse();
    }

    try {
      // Parallel searches across all sources
      const [
        lifeResults,
        peopleResults,
        locationsResults,
        skillsResults,
        projectsResults,
        jobsResults,
        erasResults,
        arcsResults,
        sagasResults,
        relationshipsResults
      ] = await Promise.all([
        this.searchLifeTimeline(userId, searchTerm),
        this.searchPeople(userId, searchTerm),
        this.searchLocations(userId, searchTerm),
        this.searchSkills(userId, searchTerm),
        this.searchProjects(userId, searchTerm),
        this.searchJobs(userId, searchTerm),
        this.searchEras(userId, searchTerm),
        this.searchArcs(userId, searchTerm),
        this.searchSagas(userId, searchTerm),
        this.searchRelationships(userId, searchTerm)
      ]);

      return {
        life: lifeResults,
        people: peopleResults,
        locations: locationsResults,
        skills: skillsResults,
        projects: projectsResults,
        jobs: jobsResults,
        eras: erasResults,
        arcs: arcsResults,
        sagas: sagasResults,
        relationships: relationshipsResults
      };
    } catch (error) {
      logger.error({ error, userId, query }, 'Failed to perform universal search');
      return this.emptyResponse();
    }
  }

  /**
   * Return empty response structure
   */
  private emptyResponse(): UniversalSearchResponse {
    return {
      life: [],
      people: [],
      locations: [],
      skills: [],
      projects: [],
      jobs: [],
      eras: [],
      arcs: [],
      sagas: [],
      relationships: []
    };
  }

  /**
   * Search general life timeline events
   */
  private async searchLifeTimeline(userId: string, query: string): Promise<UniversalSearchResult[]> {
    try {
      const events = await this.timelineEngine.getTimeline(userId, {
        limit: 50
      });

      return events
        .filter(event => 
          event.title.toLowerCase().includes(query) ||
          event.description?.toLowerCase().includes(query) ||
          event.tags.some(tag => tag.toLowerCase().includes(query))
        )
        .slice(0, 10)
        .map(event => ({
          id: event.id,
          title: event.title,
          date: event.eventDate.toISOString(),
          timelineType: 'life',
          sourceType: event.sourceType,
          description: event.description,
          metadata: event.metadata
        }));
    } catch (error) {
      logger.debug({ error }, 'Failed to search life timeline');
      return [];
    }
  }

  /**
   * Search people/characters
   */
  private async searchPeople(userId: string, query: string): Promise<UniversalSearchResult[]> {
    try {
      const { data: characters, error } = await supabaseAdmin
        .from('characters')
        .select('id, name, first_appearance, summary, tags, alias')
        .eq('user_id', userId)
        .or(`name.ilike.%${query}%,summary.ilike.%${query}%`);

      if (error) {
        logger.debug({ error }, 'Failed to search characters');
        return [];
      }

      return (characters || [])
        .filter(char => 
          char.name.toLowerCase().includes(query) ||
          char.summary?.toLowerCase().includes(query) ||
          (char.alias && Array.isArray(char.alias) && char.alias.some((a: string) => a.toLowerCase().includes(query)))
        )
        .slice(0, 10)
        .map(char => ({
          id: char.id,
          title: char.name,
          date: char.first_appearance || new Date().toISOString(),
          timelineType: 'people',
          sourceType: 'character',
          description: char.summary,
          metadata: { tags: char.tags, alias: char.alias }
        }));
    } catch (error) {
      logger.debug({ error }, 'Failed to search people');
      return [];
    }
  }

  /**
   * Search locations
   */
  private async searchLocations(userId: string, query: string): Promise<UniversalSearchResult[]> {
    try {
      const { data: locations, error } = await supabaseAdmin
        .from('locations')
        .select('id, name, created_at, type')
        .eq('user_id', userId)
        .ilike('name', `%${query}%`);

      if (error) {
        logger.debug({ error }, 'Failed to search locations');
        return [];
      }

      return (locations || [])
        .slice(0, 10)
        .map(loc => ({
          id: loc.id,
          title: loc.name,
          date: loc.created_at || new Date().toISOString(),
          timelineType: 'locations',
          sourceType: 'location',
          description: loc.type ? `Type: ${loc.type}` : undefined,
          metadata: { type: loc.type }
        }));
    } catch (error) {
      logger.debug({ error }, 'Failed to search locations');
      return [];
    }
  }

  /**
   * Search skills/hobbies (from tags and timeline events)
   */
  private async searchSkills(userId: string, query: string): Promise<UniversalSearchResult[]> {
    try {
      // Search timeline events with skill-related tags
      const events = await this.timelineEngine.getTimeline(userId, {
        tags: ['skill', 'hobby', 'learning', 'training'],
        limit: 50
      });

      return events
        .filter(event => 
          event.title.toLowerCase().includes(query) ||
          event.tags.some(tag => tag.toLowerCase().includes(query))
        )
        .slice(0, 10)
        .map(event => ({
          id: event.id,
          title: event.title,
          date: event.eventDate.toISOString(),
          timelineType: 'skills',
          sourceType: event.sourceType,
          description: event.description,
          metadata: { tags: event.tags }
        }));
    } catch (error) {
      logger.debug({ error }, 'Failed to search skills');
      return [];
    }
  }

  /**
   * Search projects
   */
  private async searchProjects(userId: string, query: string): Promise<UniversalSearchResult[]> {
    try {
      const events = await this.timelineEngine.getTimeline(userId, {
        sourceTypes: ['project'],
        limit: 50
      });

      return events
        .filter(event => 
          event.title.toLowerCase().includes(query) ||
          event.description?.toLowerCase().includes(query)
        )
        .slice(0, 10)
        .map(event => ({
          id: event.id,
          title: event.title,
          date: event.eventDate.toISOString(),
          timelineType: 'projects',
          sourceType: 'project',
          description: event.description,
          metadata: event.metadata
        }));
    } catch (error) {
      logger.debug({ error }, 'Failed to search projects');
      return [];
    }
  }

  /**
   * Search jobs
   */
  private async searchJobs(userId: string, query: string): Promise<UniversalSearchResult[]> {
    try {
      const events = await this.timelineEngine.getTimeline(userId, {
        sourceTypes: ['job'],
        limit: 50
      });

      return events
        .filter(event => 
          event.title.toLowerCase().includes(query) ||
          event.description?.toLowerCase().includes(query) ||
          event.metadata?.company?.toLowerCase().includes(query) ||
          event.metadata?.position?.toLowerCase().includes(query)
        )
        .slice(0, 10)
        .map(event => ({
          id: event.id,
          title: event.title,
          date: event.eventDate.toISOString(),
          timelineType: 'jobs',
          sourceType: 'job',
          description: event.description,
          metadata: event.metadata
        }));
    } catch (error) {
      logger.debug({ error }, 'Failed to search jobs');
      return [];
    }
  }

  /**
   * Search eras
   */
  private async searchEras(userId: string, query: string): Promise<UniversalSearchResult[]> {
    try {
      const { data: eras, error } = await supabaseAdmin
        .from('timeline_hierarchy')
        .select('id, name, start_date, description, type')
        .eq('user_id', userId)
        .eq('type', 'era')
        .or(`name.ilike.%${query}%,description.ilike.%${query}%`);

      if (error) {
        logger.debug({ error }, 'Failed to search eras');
        return [];
      }

      return (eras || [])
        .slice(0, 10)
        .map(era => ({
          id: era.id,
          title: era.name,
          date: era.start_date || new Date().toISOString(),
          timelineType: 'eras',
          sourceType: 'era',
          description: era.description,
          metadata: { type: era.type }
        }));
    } catch (error) {
      logger.debug({ error }, 'Failed to search eras');
      return [];
    }
  }

  /**
   * Search arcs
   */
  private async searchArcs(userId: string, query: string): Promise<UniversalSearchResult[]> {
    try {
      const { data: arcs, error } = await supabaseAdmin
        .from('timeline_hierarchy')
        .select('id, name, start_date, description, type')
        .eq('user_id', userId)
        .eq('type', 'arc')
        .or(`name.ilike.%${query}%,description.ilike.%${query}%`);

      if (error) {
        logger.debug({ error }, 'Failed to search arcs');
        return [];
      }

      return (arcs || [])
        .slice(0, 10)
        .map(arc => ({
          id: arc.id,
          title: arc.name,
          date: arc.start_date || new Date().toISOString(),
          timelineType: 'arcs',
          sourceType: 'arc',
          description: arc.description,
          metadata: { type: arc.type }
        }));
    } catch (error) {
      logger.debug({ error }, 'Failed to search arcs');
      return [];
    }
  }

  /**
   * Search sagas
   */
  private async searchSagas(userId: string, query: string): Promise<UniversalSearchResult[]> {
    try {
      const { data: sagas, error } = await supabaseAdmin
        .from('timeline_hierarchy')
        .select('id, name, start_date, description, type')
        .eq('user_id', userId)
        .eq('type', 'saga')
        .or(`name.ilike.%${query}%,description.ilike.%${query}%`);

      if (error) {
        logger.debug({ error }, 'Failed to search sagas');
        return [];
      }

      return (sagas || [])
        .slice(0, 10)
        .map(saga => ({
          id: saga.id,
          title: saga.name,
          date: saga.start_date || new Date().toISOString(),
          timelineType: 'sagas',
          sourceType: 'saga',
          description: saga.description,
          metadata: { type: saga.type }
        }));
    } catch (error) {
      logger.debug({ error }, 'Failed to search sagas');
      return [];
    }
  }

  /**
   * Search relationships
   */
  private async searchRelationships(userId: string, query: string): Promise<UniversalSearchResult[]> {
    try {
      const events = await this.timelineEngine.getTimeline(userId, {
        sourceTypes: ['relationship'],
        limit: 50
      });

      return events
        .filter(event => 
          event.title.toLowerCase().includes(query) ||
          event.description?.toLowerCase().includes(query) ||
          event.metadata?.character_name?.toLowerCase().includes(query)
        )
        .slice(0, 10)
        .map(event => ({
          id: event.id,
          title: event.title,
          date: event.eventDate.toISOString(),
          timelineType: 'relationships',
          sourceType: 'relationship',
          description: event.description,
          metadata: event.metadata
        }));
    } catch (error) {
      logger.debug({ error }, 'Failed to search relationships');
      return [];
    }
  }
}

