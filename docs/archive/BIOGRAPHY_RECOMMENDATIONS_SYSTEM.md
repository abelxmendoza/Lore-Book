# Biography Recommendations & Version Management System

## ✅ **COMPLETE IMPLEMENTATION**

A comprehensive system that automatically detects user interests, recommends top 4 biographies, and provides version management for Full Life Story with content filtering.

---

## 🎯 **Core Features**

### 1. **Automatic Interest Detection**
- Analyzes last 1000 timeline entries
- Detects domain interests (fighting, robotics, relationships, creative, professional, etc.)
- Scores domains by activity level
- Generates human-readable reasons for recommendations

### 2. **Top 4 Recommendations**
- **#1: Full Life Story** (always present, with 4 versions)
- **#2-4: Top 3 Domain-Specific Biographies** (based on detected interests)

### 3. **Full Life Story Versions**
- **Main Version** — Default, full introspection, balanced
- **Safe/Public Version** — Filtered for public while living
- **Explicit/Death Version** — Honest, publish after death
- **Private Version** — Complete, never published

### 4. **Content Filtering System**
- Filters sensitive atoms before clustering
- Cleans biography text after generation
- Removes explicit language and sensitive topics
- Preserves full content for explicit/private versions

---

## 📁 **Files Created**

### **Backend:**

1. **`apps/server/src/services/biographyGeneration/biographyRecommendationEngine.ts`**
   - `BiographyRecommendationEngine` class
   - `detectDomainInterests()` — analyzes timeline entries
   - `getRecommendations()` — returns top 4
   - `BIOGRAPHY_VERSIONS` — version definitions

2. **`apps/server/src/services/biographyGeneration/contentFilter.ts`**
   - `filterSensitiveAtoms()` — filters atoms by sensitivity
   - `filterBiographyText()` — cleans text content
   - `cleanSummaryForPublic()` — removes explicit language

### **Frontend:**

3. **`apps/web/src/components/lorebook/BiographyRecommendations.tsx`**
   - Displays top 4 recommendations
   - Version selector for Full Life Story
   - Generate buttons for each recommendation

4. **`apps/web/src/components/lorebook/SavedBiographies.tsx`**
   - Lists all saved biographies
   - View/Delete functionality
   - Load biography into reader

### **Updated:**

5. **`apps/server/src/services/biographyGeneration/biographyGenerationEngine.ts`**
   - Integrated content filtering
   - Applies filters based on version/audience

6. **`apps/server/src/routes/biography.ts`**
   - Added `GET /api/biography/recommendations`
   - Added `DELETE /api/biography/:id`

7. **`apps/web/src/components/lorebook/LoreBook.tsx`**
   - Integrated recommendations component
   - Integrated saved biographies component
   - Tab navigation between recommendations/saved
   - Toggle to show/hide panels

---

## 🔄 **How It Works**

### **Interest Detection Flow:**

1. **Scan Timeline Entries**
   - Gets last 1000 entries from `memoryService`
   - Analyzes content and tags for domain keywords

2. **Score Domains**
   - Counts matches per domain (fighting, robotics, relationships, etc.)
   - Calculates activity level
   - Sorts by score (descending)

3. **Generate Recommendations**
   - Always includes Full Life Story as #1
   - Adds top 3 domain-specific biographies
   - Provides estimated chapter counts
   - Generates human-readable reasons

### **Content Filtering Flow:**

1. **Filter Atoms** (before clustering)
   - Removes high emotional weight (>0.8) for public
   - Removes conflict-type atoms for public
   - Removes introspection if not included
   - Checks for sensitive keywords

2. **Clean Text** (after generation)
   - Removes explicit language
   - Replaces sensitive phrases
   - Cleans summaries

### **Version System:**

- **Safe/Public**: `filterSensitive: true`, `audience: 'public'`, `includeIntrospection: false`
- **Explicit/Death**: `filterSensitive: false`, `audience: 'self'`, `includeIntrospection: true`
- **Private**: `filterSensitive: false`, `audience: 'self'`, `includeIntrospection: true`
- **Main**: `filterSensitive: false`, `audience: 'self'`, `includeIntrospection: true`

---

## 🎨 **UI Features**

### **Recommendations Panel:**
- Full Life Story card with version selector
- Expandable version options (Main, Safe, Explicit, Private)
- Top 3 domain recommendations in grid
- Each shows: title, description, reason, estimated chapters, priority

### **Saved Biographies Panel:**
- Grid of saved biographies
- Shows: title, subtitle, domain, date, chapter count
- View button to load into reader
- Delete button with confirmation
- Refresh button to reload list

### **Navigation:**
- Tabs to switch between Recommendations and Saved
- Toggle buttons in search bar area
- Seamless integration with existing LoreBook UI

---

## 🔍 **Content Filtering Rules**

### **Sensitive Keywords Filtered:**
- suicide, self-harm, depression, anxiety, trauma
- abuse, addiction, drug, alcohol, illegal
- criminal, arrest, lawsuit, divorce, affair
- cheat, betrayal, secret, private, confidential

### **Content Removed for Public:**
- High emotional weight atoms (>0.8)
- Conflict-type atoms
- Introspection (if not included)
- Explicit language (fuck, shit, damn, etc.)

### **Phrase Replacements:**
- "struggled with depression" → "faced challenges"
- "was addicted to" → "had experience with"
- "hated" → "disliked"
- "despised" → "strongly disliked"

---

## 📊 **API Endpoints**

### **GET `/api/biography/recommendations`**
Returns top 4 recommendations and available versions.

**Response:**
```json
{
  "recommendations": [
    {
      "id": "full-life-story",
      "title": "My Full Life Story",
      "description": "...",
      "spec": {...},
      "reason": "...",
      "priority": 1,
      "estimatedChapters": 0
    },
    ...
  ],
  "versions": [
    {
      "id": "main",
      "name": "main",
      "displayName": "Main Version",
      "description": "...",
      "audience": "self",
      "includeIntrospection": true,
      "filterSensitive": false
    },
    ...
  ]
}
```

### **DELETE `/api/biography/:id`**
Deletes a specific biography.

---

## 🎯 **User Experience**

### **First Time User:**
1. Opens LoreBook → Sees Recommendations tab
2. Sees Full Life Story with 4 version options
3. Sees top 3 domain recommendations
4. Clicks version or recommendation → Generates biography
5. Biography loads in reader

### **Returning User:**
1. Opens LoreBook → Sees Saved Biographies tab
2. Views list of previously generated biographies
3. Clicks "View" → Loads biography into reader
4. Can generate new versions or recommendations

### **Version Selection:**
1. Expands Full Life Story versions
2. Sees 4 version cards with descriptions
3. Clicks version → Generates with appropriate filtering
4. Safe version is clean for public
5. Explicit version has full honesty
6. Private version is complete and unfiltered

---

## ✅ **Status: COMPLETE**

All features implemented:
- ✅ Automatic interest detection
- ✅ Top 4 recommendations
- ✅ Full Life Story with 4 versions
- ✅ Content filtering for safe versions
- ✅ Saved biographies management
- ✅ View/Delete functionality
- ✅ Frontend UI integrated
- ✅ API endpoints created
- ✅ Tab navigation
- ✅ Seamless user experience

**Ready for production use!**

---

## 🚀 **Next Steps (Optional Enhancements)**

1. **Version Regeneration** — Regenerate existing biography with different version
2. **Version Comparison** — Side-by-side comparison of versions
3. **Export Versions** — Download specific versions as PDF
4. **Version History** — Track when each version was generated
5. **Custom Filters** — User-defined sensitive content rules
6. **Recommendation Feedback** — User feedback to improve recommendations

---

**The system now automatically detects what users write about and recommends relevant biographies, with full version control for privacy and publication needs!**
