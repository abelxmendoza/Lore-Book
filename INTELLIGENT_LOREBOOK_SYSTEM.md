# Intelligent Lorebook System

## ✅ **COMPLETE IMPLEMENTATION**

A comprehensive intelligent lorebook system that understands natural language queries and recommends lorebooks based on your data (characters, locations, events, skills, timelines).

---

## 🎯 **Core Features**

### **1. Intelligent Search Parser**
The system understands natural language queries and extracts:
- **Timeline criteria**: "my 2020 story", "last year", "college years"
- **Characters**: "my story with Sarah", "everything about John"
- **Locations**: "life at the gym", "everything at home"
- **Events**: "the wedding story", "what happened at graduation"
- **Skills**: "my fighting journey", "learning to code"
- **Domains**: "robotics", "relationships", "fighting"
- **Themes**: "growth", "transformation", "challenges"

### **2. Smart Recommendations**
The system analyzes your data and recommends:
- **Full Life Story** (always recommended)
- **Character-based lorebooks** (top relationships)
- **Location-based lorebooks** (significant places)
- **Event-based lorebooks** (major events)
- **Skill-based lorebooks** (skill journeys)
- **Timeline-based lorebooks** (significant periods)
- **Domain-based lorebooks** (high-activity areas)

### **3. Enhanced Search Bar**
The search bar in the LoreBook section:
- Understands natural language
- Extracts multiple criteria from a single query
- Automatically generates the perfect lorebook spec
- Shows helpful examples and suggestions

---

## 📁 **Files Created/Modified**

### **Backend Services:**

1. **`apps/server/src/services/lorebook/lorebookSearchParser.ts`** (NEW)
   - Parses natural language queries
   - Extracts timeline, character, location, event, skill criteria
   - Returns structured BiographySpec

2. **`apps/server/src/services/lorebook/lorebookRecommendationEngine.ts`** (NEW)
   - Analyzes user's data (characters, locations, events, skills)
   - Generates personalized recommendations
   - Suggests main lorebooks based on activity

3. **`apps/server/src/services/biographyGeneration/narrativeAtomBuilder.ts`** (MODIFIED)
   - Now extracts character IDs, location IDs, event IDs, skill IDs
   - Batch fetches relationships for efficiency
   - Stores entity IDs in atom metadata

4. **`apps/server/src/services/biographyGeneration/biographyGenerationEngine.ts`** (MODIFIED)
   - Filters atoms by characterIds, locationIds, eventIds, skillIds
   - Supports complex multi-criteria filtering

5. **`apps/server/src/services/biographyGeneration/types.ts`** (MODIFIED)
   - Added characterIds, locationIds, eventIds, skillIds to BiographySpec

6. **`apps/server/src/routes/biography.ts`** (MODIFIED)
   - Added `/api/biography/search` endpoint (intelligent search)
   - Added `/api/biography/lorebook-recommendations` endpoint

### **Frontend Components:**

7. **`apps/web/src/components/lorebook/LoreBook.tsx`** (MODIFIED)
   - Updated search bar with intelligent query understanding
   - Renamed "Knowledge Base" to "Lorebook"
   - Enhanced instructions and examples
   - Uses new `/api/biography/search` endpoint

8. **`apps/web/src/components/lorebook/KnowledgeBaseCreator.tsx`** (MODIFIED)
   - Renamed to "Lorebook Creator" throughout
   - Updated all text references

---

## 🔄 **How It Works**

### **Search Flow:**

1. **User types query** (e.g., "my story with Sarah")
2. **Parser extracts criteria**:
   - Character: "Sarah" → finds character ID
   - Scope: "character"
3. **System generates spec**:
   ```typescript
   {
     scope: 'character',
     characterIds: ['sarah-uuid'],
     tone: 'reflective',
     depth: 'detailed',
     audience: 'self',
     includeIntrospection: true
   }
   ```
4. **Biography engine filters atoms**:
   - Gets all atoms with Sarah's character ID
   - Filters by metadata.locationIds, eventIds, skillIds if needed
5. **Generates lorebook** from filtered atoms

### **Recommendation Flow:**

1. **System analyzes user data**:
   - Characters with most journal entries
   - Locations with most mentions
   - Events with highest significance
   - Skills with progress
   - Timeline periods with most activity
   - Domains with most mentions

2. **Generates recommendations**:
   - Full Life Story (always #1)
   - Top 5 characters
   - Top 3 locations
   - Top 3 events
   - Top 3 skills
   - Top 2 timeline periods
   - Top 2 domains

3. **User clicks recommendation**:
   - System generates lorebook with appropriate spec
   - Loads into reader

---

## 🎨 **Example Queries**

### **Character-Based:**
- "my story with Sarah"
- "everything about John"
- "my relationship with mom"

### **Location-Based:**
- "life at the gym"
- "everything at home"
- "my time in New York"

### **Event-Based:**
- "the wedding story"
- "what happened at graduation"
- "the party last week"

### **Skill-Based:**
- "my fighting journey"
- "learning to code"
- "my BJJ progress"

### **Timeline-Based:**
- "my 2020 story"
- "last year"
- "college years"
- "when I was 25"

### **Domain-Based:**
- "my robotics journey"
- "everything about relationships"
- "my fighting career"

### **Complex Queries:**
- "my story with Sarah in 2020"
- "everything at the gym last year"
- "my fighting journey at the academy"

---

## 📊 **API Endpoints**

### **POST `/api/biography/search`**
Intelligent search for lorebooks.

**Request:**
```json
{
  "query": "my story with Sarah"
}
```

**Response:**
```json
{
  "biography": { ... },
  "parsedQuery": {
    "scope": "character",
    "characterIds": ["sarah-uuid"],
    "tone": "reflective",
    "depth": "detailed",
    ...
  }
}
```

### **GET `/api/biography/lorebook-recommendations`**
Get recommended lorebooks based on user's data.

**Query Params:**
- `limit` (optional): Number of recommendations (default: 10)

**Response:**
```json
{
  "recommendations": [
    {
      "id": "character-sarah-uuid",
      "title": "My Story with Sarah",
      "description": "Your relationship and experiences with Sarah",
      "type": "character",
      "spec": { ... },
      "reason": "Significant relationship with Sarah",
      "priority": 2,
      "estimatedChapters": 5,
      "metadata": {
        "characterName": "Sarah"
      }
    },
    ...
  ]
}
```

---

## ✅ **Status: COMPLETE**

All features implemented:
- ✅ Intelligent search parser
- ✅ Recommendation engine
- ✅ Enhanced narrative atom builder (extracts entity IDs)
- ✅ Biography generation with multi-criteria filtering
- ✅ API endpoints
- ✅ Frontend integration
- ✅ Renamed "Knowledge Base" to "Lorebook"

**Ready for production use!**

---

## 🚀 **Future Enhancements (Optional)**

1. **Query Suggestions**: Show autocomplete suggestions as user types
2. **Query History**: Remember and suggest previous searches
3. **Multi-Criteria UI**: Visual builder for complex queries
4. **Recommendation Feedback**: Learn from user clicks to improve recommendations
5. **Smart Merging**: Combine multiple criteria intelligently
6. **Query Templates**: Pre-built query templates for common use cases
7. **Voice Search**: Support voice input for queries

---

**The intelligent lorebook system is now fully functional and provides users with powerful, natural language search and personalized recommendations!**
