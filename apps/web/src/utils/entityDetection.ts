/**
 * Utility functions for detecting and linking entities in text
 */

export interface DetectedEntity {
  name: string;
  type: 'character' | 'location' | 'memory';
  startIndex: number;
  endIndex: number;
}

/**
 * Detect entity names in text and return positions
 */
export function detectEntitiesInText(text: string): DetectedEntity[] {
  const entities: DetectedEntity[] = [];

  // Character patterns (names)
  const characterPatterns = [
    /\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g, // Full names like "John Smith"
    /\b([A-Z][a-z]{2,})\b/g // Capitalized words (potential names)
  ];

  // Location patterns
  const locationPatterns = [
    /\b(?:in|at|to|from|near|by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    /\b([A-Z][a-z]+ (?:Street|Avenue|Road|Park|Beach|City|State|Country|University|College|School))\b/g
  ];

  // Extract characters
  characterPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1] || match[0];
      if (name.length > 2) {
        entities.push({
          name: name.trim(),
          type: 'character',
          startIndex: match.index,
          endIndex: match.index + match[0].length
        });
      }
    }
  });

  // Extract locations
  locationPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1] || match[0];
      if (name.length > 2) {
        entities.push({
          name: name.trim(),
          type: 'location',
          startIndex: match.index,
          endIndex: match.index + match[0].length
        });
      }
    }
  });

  // Remove duplicates
  const uniqueEntities = entities.filter((entity, index, self) =>
    index === self.findIndex(e => 
      e.name === entity.name && 
      e.startIndex === entity.startIndex
    )
  );

  return uniqueEntities;
}

/**
 * Wrap entity names in text with clickable spans
 */
export function wrapEntitiesInText(
  text: string,
  onEntityClick: (entity: DetectedEntity) => void
): React.ReactNode[] {
  const entities = detectEntitiesInText(text);
  
  if (entities.length === 0) {
    return [text];
  }

  // Sort by start index
  entities.sort((a, b) => a.startIndex - b.startIndex);

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  entities.forEach((entity, idx) => {
    // Add text before entity
    if (entity.startIndex > lastIndex) {
      parts.push(text.substring(lastIndex, entity.startIndex));
    }

    // Add clickable entity
    parts.push(
      <span
        key={`entity-${idx}`}
        onClick={(e) => {
          e.stopPropagation();
          onEntityClick(entity);
        }}
        className="text-primary hover:text-primary/80 underline cursor-pointer"
        title={`Click to view ${entity.name}`}
      >
        {text.substring(entity.startIndex, entity.endIndex)}
      </span>
    );

    lastIndex = entity.endIndex;
  });

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts;
}
