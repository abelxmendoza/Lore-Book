# Event Impacts Implementation

## Overview

This implementation tracks how events affect the user even when they're not direct participants. The system can now identify and display:

- **Direct participants**: User was directly in the event
- **Indirect affected**: User is affected but not present
- **Related person affected**: Someone close to user is in the event
- **Observer**: User talks about it but not affected
- **Ripple effect**: Event creates consequences for user later

## Components

### 1. Database Schema

**Table**: `event_impacts`

Stores impact classifications with:
- `impact_type`: Type of impact (direct_participant, indirect_affected, etc.)
- `connection_character_id`: Character who links user to event (for related_person_affected)
- `emotional_impact`: positive, negative, neutral, or mixed
- `impact_intensity`: 0.0-1.0 (how strongly this affects the user)
- `impact_description`: Human-readable explanation
- `source_message_ids`: Evidence from chat messages
- `source_journal_entry_ids`: Evidence from journal entries

### 2. EventImpactDetector Service

**File**: `apps/server/src/services/conversationCentered/eventImpactDetector.ts`

**Key Methods**:
- `detectEventImpact()`: Main entry point - detects how event affects user
- `analyzeIndirectImpact()`: Uses LLM to analyze indirect impacts
- `getEventImpacts()`: Retrieves impacts for an event

**How it works**:
1. Checks if user is direct participant (by checking if user's character is in event.people)
2. If not direct, uses LLM to analyze:
   - User's messages/journal entries about the event
   - Emotional language and context
   - Relationships to people in the event
3. Classifies impact type and intensity
4. Stores in database

### 3. API Integration

**Updated Endpoint**: `GET /api/conversation/events`

Now returns events with impact metadata:
```json
{
  "success": true,
  "events": [
    {
      "id": "...",
      "title": "...",
      "impact": {
        "type": "related_person_affected",
        "connectionCharacter": "Abuelo",
        "connectionType": "family",
        "emotionalImpact": "negative",
        "impactIntensity": 0.8,
        "impactDescription": "This event affects you because it involves your grandfather who you care about"
      }
    }
  ]
}
```

### 4. UI Components

**Updated Files**:
- `EventProfileCard.tsx`: Shows impact badge on event cards
- `EventsView.tsx`: Updated Event interface to include impact

**Visual Indicators**:
- **Direct participant**: Blue badge "You were there"
- **Indirect affected**: Purple badge "Affects you"
- **Related person**: Orange badge "Affects someone close" + shows connection
- **Observer**: Gray badge "You mentioned this"
- **Ripple effect**: Pink badge "Ripple effect"

### 5. Pipeline Integration

**File**: `apps/server/src/services/conversationCentered/ingestionPipeline.ts`

**Step 12.6**: After event assembly, detects impacts:
1. Gets source messages and journal entries for the event
2. Calls `eventImpactDetector.detectEventImpact()`
3. Stores impact in database
4. Non-blocking (doesn't interrupt chat flow)

## Usage Examples

### Example 1: Related Person Affected

**User says**: "My abuelo got West Nile virus in September and has been at the post acute center ever since"

**System processes**:
1. Event assembly creates event: "Abuelo's West Nile virus and hospitalization"
2. Impact detection analyzes:
   - User mentions abuelo (family member)
   - Emotional language suggests concern
   - User is not in the event but clearly affected
3. Creates impact:
   - Type: `related_person_affected`
   - Connection: Abuelo (family)
   - Emotional: negative
   - Intensity: 0.8
   - Description: "This event affects you because it involves your grandfather who you care about"

**UI shows**: Orange badge "Affects someone close (via Abuelo)"

### Example 2: Indirect Affected

**User says**: "My friend's breakup is really affecting me. I can't stop thinking about it."

**System processes**:
1. Event: "Friend's breakup"
2. Impact detection:
   - User expresses emotional impact
   - Not directly in event but affected
3. Creates impact:
   - Type: `indirect_affected`
   - Emotional: negative
   - Intensity: 0.7
   - Description: "You are emotionally affected by this event even though you weren't directly involved"

**UI shows**: Purple badge "Affects you"

### Example 3: Observer

**User says**: "I heard about a car accident downtown. Hope everyone is okay."

**System processes**:
1. Event: "Car accident downtown"
2. Impact detection:
   - User mentions it but no emotional impact
   - No personal connection
3. Creates impact:
   - Type: `observer`
   - Emotional: neutral
   - Intensity: 0.2
   - Description: "You mentioned this event but it doesn't appear to affect you personally"

**UI shows**: Gray badge "You mentioned this"

## Database Queries

### Get all events that affect the user indirectly

```sql
SELECT e.*, ei.impact_type, ei.impact_description
FROM resolved_events e
JOIN event_impacts ei ON e.id = ei.event_id
WHERE ei.user_id = $1
  AND ei.impact_type IN ('indirect_affected', 'related_person_affected', 'ripple_effect')
ORDER BY e.start_time DESC;
```

### Get events affecting user through specific person

```sql
SELECT e.*, ei.impact_description, c.name as connection_name
FROM resolved_events e
JOIN event_impacts ei ON e.id = ei.event_id
LEFT JOIN characters c ON ei.connection_character_id = c.id
WHERE ei.user_id = $1
  AND ei.impact_type = 'related_person_affected'
  AND ei.connection_character_id = $2;
```

## Future Enhancements

1. **Impact intensity visualization**: Show intensity as bar/indicator
2. **Impact timeline**: Show how impacts change over time
3. **Impact filtering**: Filter events by impact type in UI
4. **Impact analytics**: Track patterns in indirect impacts
5. **Manual impact adjustment**: Allow user to correct/confirm impacts
6. **Impact decay**: Reduce intensity over time if not reinforced

## Testing

To test the implementation:

1. **Create an event about someone else**:
   - Chat: "My friend got a promotion today"
   - Check if impact is detected (should be `related_person_affected` or `observer`)

2. **Create an event that affects you indirectly**:
   - Chat: "The layoffs at work are really stressing me out"
   - Check if impact is detected (should be `indirect_affected`)

3. **Check UI**:
   - View events in EventsBook or EventsView
   - Verify impact badges appear
   - Verify connection character names show when applicable

## Files Modified

- `migrations/20250120_event_impacts.sql` (NEW)
- `apps/server/src/services/conversationCentered/eventImpactDetector.ts` (NEW)
- `apps/server/src/routes/conversationCentered.ts` (MODIFIED)
- `apps/server/src/services/conversationCentered/ingestionPipeline.ts` (MODIFIED)
- `apps/web/src/components/events/EventProfileCard.tsx` (MODIFIED)
- `apps/web/src/components/events/EventsView.tsx` (MODIFIED)

## Dependencies

- OpenAI API (for LLM-based impact analysis)
- Supabase (for database operations)
- Existing services:
  - `eventAssemblyService` (for event assembly)
  - `supabaseAdmin` (for database queries)
