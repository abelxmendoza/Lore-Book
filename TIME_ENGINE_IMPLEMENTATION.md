# Time Engine Implementation

## Overview
Comprehensive time and timestamp engine for accurate chronology throughout Lore Keeper.

## Backend Implementation

### Core Service: `timeEngine.ts`
- **Timestamp Parsing**: Handles ISO, relative ("yesterday", "last week"), and fuzzy dates
- **Precision Detection**: Automatically detects year/month/day/hour/minute/second precision
- **Timezone Support**: Full timezone conversion using `date-fns-tz`
- **Chronological Sorting**: Sorts items by normalized timestamps with precision awareness
- **Time Range Creation**: Creates time ranges with proper boundaries
- **Conflict Detection**: Detects temporal conflicts (overlapping timestamps)
- **Relative Time**: Calculates human-readable time differences

### API Routes: `/api/time`
- `POST /parse` - Parse timestamp string
- `POST /range` - Create time range
- `POST /sort` - Sort items chronologically
- `POST /difference` - Get time difference
- `POST /conflicts` - Detect temporal conflicts
- `POST /timezone` - Set user timezone

## Frontend Implementation

### Client Service: `timeEngine.ts`
- Mirrors backend functionality
- Automatic timezone detection
- Local fallback parsing
- Chronological sorting utilities
- Time grouping by period (day/week/month/year)

### Components

#### `TimeDisplay.tsx`
- Displays timestamps with precision awareness
- Shows relative time ("2 days ago")
- Multiple variants: default, compact, detailed
- Optional icons and badges

#### `ChronologicalTimeline.tsx`
- Renders items in chronological order
- Groups by time period
- Shows date headers
- Visual timeline with connectors

## Integration Points

### Chat Service
- Enhanced date extraction using TimeEngine
- Better precision detection
- Confidence scoring for extracted dates

### Timeline Views
- Chronological sorting
- Time-based grouping
- Precision-aware display

### Entry Management
- Consistent timestamp handling
- Conflict detection
- Relative time display

## Features

### Timestamp Parsing
- Absolute dates: "2024-01-15", "January 15, 2024"
- Relative dates: "yesterday", "last week", "2 months ago"
- Fuzzy dates: Extracts dates from natural language
- Precision detection: Automatically determines precision level

### Chronological Ordering
- Normalizes timestamps before sorting
- Handles different precisions correctly
- More precise timestamps sort later when normalized time is equal

### Time Zone Handling
- User timezone detection
- Automatic conversion
- UTC normalization for storage

### Conflict Detection
- Identifies overlapping timestamps
- Configurable threshold (default: 60 minutes)
- Useful for continuity checking

## Usage Examples

### Backend
```typescript
import { timeEngine } from './services/timeEngine';

// Parse timestamp
const ref = timeEngine.parseTimestamp("yesterday");
// Returns: { timestamp: Date, precision: 'day', confidence: 0.9 }

// Sort chronologically
const sorted = timeEngine.sortChronologically(entries);

// Detect conflicts
const conflicts = timeEngine.detectTemporalConflicts(timestamps, 60);
```

### Frontend
```typescript
import { timeEngine } from '../utils/timeEngine';

// Format timestamp
const formatted = timeEngine.formatTimestamp(date, 'day');
// Returns: "January 15, 2024"

// Get relative time
const relative = timeEngine.getRelativeTime(date);
// Returns: "2 days ago"

// Sort chronologically
const sorted = timeEngine.sortChronologically(items);
```

## Benefits

1. **Accurate Chronology**: Consistent timestamp handling across the app
2. **Better UX**: Human-readable relative times and proper formatting
3. **Conflict Detection**: Identifies potential timeline issues
4. **Timezone Support**: Proper handling of user timezones
5. **Precision Awareness**: Respects different levels of time precision
6. **Natural Language**: Parses relative dates from user input

## Next Steps

1. Integrate into all timeline views
2. Add time-based filtering UI
3. Implement temporal relationship visualization
4. Add time-based search capabilities
5. Create time conflict resolution UI

