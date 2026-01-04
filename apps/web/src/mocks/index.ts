/**
 * Centralized Mock Data Exports
 * 
 * All mock data for the application is exported from here.
 * This provides a single source of truth for mock data.
 */

// Character mock data
export { default as mockCharacters } from './characters';
export { default as mockLocations } from './locations';
export { default as mockMemories } from './memories';

// Timeline mock data (already exists)
export { generateMockTimelines, generateMockChronologyEntries } from './timelineMockData';

