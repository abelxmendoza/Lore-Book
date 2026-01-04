/**
 * Mock Data Finder
 * 
 * Utility to find all mock/dummy/sample data in the codebase
 * Helps ensure all mock data is properly managed through the centralized service
 */

export interface MockDataLocation {
  file: string;
  line: number;
  type: 'dummy' | 'mock' | 'sample' | 'test' | 'fake';
  variableName: string;
  dataType: string;
  isExported: boolean;
  isUsed: boolean;
}

/**
 * Common patterns for mock data
 */
export const MOCK_DATA_PATTERNS = {
  variableNames: [
    /dummy\w+/i,
    /mock\w+/i,
    /sample\w+/i,
    /test\w+[Dd]ata/i,
    /fake\w+/i,
    /demo\w+/i,
  ],
  comments: [
    /mock\s+data/i,
    /dummy\s+data/i,
    /sample\s+data/i,
    /test\s+data/i,
    /fake\s+data/i,
    /demo\s+data/i,
  ],
  functions: [
    /generateMock\w+/i,
    /createMock\w+/i,
    /getMock\w+/i,
    /getDummy\w+/i,
    /createDummy\w+/i,
  ],
};

/**
 * Check if a file likely contains mock data
 */
export function hasMockDataIndicators(content: string): boolean {
  const lowerContent = content.toLowerCase();
  
  // Check for common patterns
  for (const pattern of MOCK_DATA_PATTERNS.variableNames) {
    if (pattern.test(content)) return true;
  }
  
  for (const pattern of MOCK_DATA_PATTERNS.comments) {
    if (pattern.test(content)) return true;
  }
  
  for (const pattern of MOCK_DATA_PATTERNS.functions) {
    if (pattern.test(content)) return true;
  }
  
  // Check for common mock data structures
  if (lowerContent.includes('mock-user') || 
      lowerContent.includes('dummy-') ||
      lowerContent.includes('mock-')) {
    return true;
  }
  
  return false;
}

/**
 * Extract mock data locations from file content
 */
export function extractMockDataLocations(
  filePath: string,
  content: string
): MockDataLocation[] {
  const locations: MockDataLocation[] = [];
  const lines = content.split('\n');
  
  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const lowerLine = line.toLowerCase();
    
    // Check for variable declarations
    for (const pattern of MOCK_DATA_PATTERNS.variableNames) {
      const match = line.match(new RegExp(`(const|let|var|export\\s+(const|let|var))\\s+(${pattern.source})\\s*[:=]`, 'i'));
      if (match) {
        const isExported = line.includes('export');
        const varName = match[3] || match[2];
        locations.push({
          file: filePath,
          line: lineNum,
          type: lowerLine.includes('dummy') ? 'dummy' : 
                lowerLine.includes('mock') ? 'mock' :
                lowerLine.includes('sample') ? 'sample' :
                lowerLine.includes('test') ? 'test' : 'fake',
          variableName: varName,
          dataType: 'unknown',
          isExported,
          isUsed: false, // Would need AST parsing to determine
        });
      }
    }
    
    // Check for function declarations
    for (const pattern of MOCK_DATA_PATTERNS.functions) {
      const match = line.match(new RegExp(`(export\\s+)?(function|const)\\s+(${pattern.source})`, 'i'));
      if (match) {
        locations.push({
          file: filePath,
          line: lineNum,
          type: 'mock',
          variableName: match[3] || match[2],
          dataType: 'function',
          isExported: line.includes('export'),
          isUsed: false,
        });
      }
    }
  });
  
  return locations;
}

