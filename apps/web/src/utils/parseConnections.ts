/**
 * Parse connection strings to extract clickable entities
 * Examples:
 * - "Mentioned 2 characters: John, Jane" → [{ type: 'character', names: ['John', 'Jane'] }]
 * - "Related to 3 chapters: Chapter 1, Chapter 2" → [{ type: 'chapter', names: ['Chapter 1', 'Chapter 2'] }]
 * - "Found 5 semantically related memories via HQI" → [{ type: 'hqi', count: 5 }]
 */

export type ParsedConnection = {
  type: 'character' | 'chapter' | 'location' | 'hqi' | 'fabric' | 'entry' | 'generic';
  names?: string[];
  count?: number;
  text: string;
  originalText: string;
};

export function parseConnections(connections: string[]): ParsedConnection[] {
  return connections.map((conn) => {
    // Character mentions: "Mentioned 2 character(s): John, Jane"
    const characterMatch = conn.match(/Mentioned (\d+) character(?:s)?: (.+)/i);
    if (characterMatch) {
      const names = characterMatch[2].split(',').map(n => n.trim());
      return {
        type: 'character',
        names,
        count: parseInt(characterMatch[1], 10),
        text: `Mentioned ${characterMatch[1]} character${characterMatch[1] !== '1' ? 's' : ''}`,
        originalText: conn
      };
    }

    // Chapter mentions: "Related to 3 chapter(s): Chapter 1, Chapter 2"
    const chapterMatch = conn.match(/Related to (\d+) chapter(?:s)?: (.+)/i);
    if (chapterMatch) {
      const names = chapterMatch[2].split(',').map(n => n.trim());
      return {
        type: 'chapter',
        names,
        count: parseInt(chapterMatch[1], 10),
        text: `Related to ${chapterMatch[1]} chapter${chapterMatch[1] !== '1' ? 's' : ''}`,
        originalText: conn
      };
    }

    // Location mentions: "Found at 2 location(s): New York, Paris"
    const locationMatch = conn.match(/(?:Found at|Mentioned) (\d+) location(?:s)?: (.+)/i);
    if (locationMatch) {
      const names = locationMatch[2].split(',').map(n => n.trim());
      return {
        type: 'location',
        names,
        count: parseInt(locationMatch[1], 10),
        text: `Found at ${locationMatch[1]} location${locationMatch[1] !== '1' ? 's' : ''}`,
        originalText: conn
      };
    }

    // HQI results: "Found 5 semantically related memories via HQI"
    const hqiMatch = conn.match(/Found (\d+) (?:semantically related memories|related memories) via HQI/i);
    if (hqiMatch) {
      return {
        type: 'hqi',
        count: parseInt(hqiMatch[1], 10),
        text: `Found ${hqiMatch[1]} related memories via HQI`,
        originalText: conn
      };
    }

    // Memory Fabric: "Found 3 related memories through Memory Fabric"
    const fabricMatch = conn.match(/Found (\d+) related memories through Memory Fabric/i);
    if (fabricMatch) {
      return {
        type: 'fabric',
        count: parseInt(fabricMatch[1], 10),
        text: `Found ${fabricMatch[1]} related memories via Memory Fabric`,
        originalText: conn
      };
    }

    // Entry mentions: "Related to 2 entries: Entry 1, Entry 2"
    const entryMatch = conn.match(/Related to (\d+) entr(?:y|ies): (.+)/i);
    if (entryMatch) {
      const names = entryMatch[2].split(',').map(n => n.trim());
      return {
        type: 'entry',
        names,
        count: parseInt(entryMatch[1], 10),
        text: `Related to ${entryMatch[1]} entr${entryMatch[1] !== '1' ? 'ies' : 'y'}`,
        originalText: conn
      };
    }

    // Generic connection
    return {
      type: 'generic',
      text: conn,
      originalText: conn
    };
  });
}
