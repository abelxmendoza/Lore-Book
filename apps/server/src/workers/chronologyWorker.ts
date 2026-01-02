import { logger } from '../logger';
import { supabaseAdmin } from '../services/supabaseClient';
import { ChronologyEngine, EventMapper, ChronologyStorageService } from '../services/chronology';

const chronologyEngine = new ChronologyEngine();
const eventMapper = new EventMapper();
const storageService = new ChronologyStorageService();

/**
 * Run chronology analysis for a user
 */
export async function runChronologyAnalysis(userId: string): Promise<void> {
  try {
    logger.info({ userId }, 'Starting chronology analysis');

    // Fetch user's memory components
    const { data: entries, error: entriesError } = await supabaseAdmin
      .from('journal_entries')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(500); // Limit for performance

    if (entriesError) {
      logger.error({ error: entriesError, userId }, 'Failed to fetch entries');
      return;
    }

    // Fetch memory components
    const entryIds = (entries || []).map(e => e.id);
    const { data: components, error: componentsError } = await supabaseAdmin
      .from('memory_components')
      .select('*')
      .in('journal_entry_id', entryIds)
      .limit(1000);

    if (componentsError) {
      logger.error({ error: componentsError, userId }, 'Failed to fetch components');
      return;
    }

    // Map to events
    const entryEvents = eventMapper.mapMemoryEntriesToEvents(entries || []);
    const componentEvents = eventMapper.mapMemoryComponentsToEvents(components || []);
    const allEvents = [...entryEvents, ...componentEvents];

    if (allEvents.length === 0) {
      logger.info({ userId }, 'No events to process');
      return;
    }

    // Run chronology engine
    const result = await chronologyEngine.process(allEvents);

    // Store results
    await storageService.saveChronologyResult(userId, result);

    // Create component ID mapping for storing edges
    const componentIdMap = new Map<string, string>();
    (components || []).forEach(c => {
      const event = componentEvents.find(e => e.id === c.id);
      if (event) {
        componentIdMap.set(event.id, c.id);
      }
    });

    // Store temporal edges
    await storageService.saveTemporalEdges(result.graph.edges, componentIdMap);

    logger.info(
      {
        userId,
        eventCount: allEvents.length,
        edgeCount: result.graph.edges.length,
        chainCount: result.causalChains.length,
        gapCount: result.gaps.length,
      },
      'Chronology analysis completed'
    );
  } catch (error) {
    logger.error({ error, userId }, 'Chronology analysis failed');
  }
}

