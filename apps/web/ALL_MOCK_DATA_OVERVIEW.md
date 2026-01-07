# All UI Mock Data Overview

This document lists all mock data used across the application UI, organized by component/feature.

## 📊 Discovery Hub Analytics Panels

### 1. **Soul Profile Panel** (`SoulProfilePanel.tsx`)
**Mock Data**: `MOCK_ESSENCE_PROFILE`

**Contains**:
- **Hopes** (5 items): Building meaningful legacy, financial independence, authentic relationships, continuous growth, positive impact
- **Dreams** (4 items): Creative studio, remote travel work, publishing a book, building community
- **Fears** (4 items): Not living up to potential, unfulfilling routine, losing connections, regrettable decisions
- **Strengths** (5 items): Empathy, persistence, creativity, quick learning, self-awareness
- **Weaknesses** (4 items): Overthinking, procrastination, avoiding difficult conversations, being too hard on self
- **Top Skills** (6 items): JavaScript/TypeScript, UI/UX Design, Problem Solving, Communication, Project Management, Writing
- **Core Values** (5 items): Authenticity, continuous growth, meaningful relationships, creativity, work-life balance
- **Personality Traits** (6 items): Introverted but enjoys deep conversations, thoughtful, curious, perfectionist tendencies, empathetic, independent
- **Relationship Patterns** (4 items): Conflict avoidance but values honesty, prefers deep connections, listener/supporter role, values quality time
- **Evolution Timeline** (5 entries): Recent changes to profile over time

### 2. **Shadow Analytics Panel** (`ShadowAnalyticsPanel.tsx`)
**Mock Data**: `MOCK_SHADOW_DATA`

**Contains**:
- **Metrics**:
  - Shadow archetypes: 3
  - Dominant shadow: "The Perfectionist"
  - Shadow loops: 5
  - Shadow triggers: 8
  - Conflict score: 0.65
- **Shadow Archetypes**:
  - The Perfectionist (confidence: 0.85)
  - The People Pleaser (confidence: 0.72)
  - The Inner Critic (confidence: 0.68)
- **Shadow Loops** (3 patterns):
  - Perfectionism → Burnout → Self-criticism (frequency: 12)
  - People pleasing → Resentment → Withdrawal (frequency: 8)
  - Self-doubt → Procrastination → Guilt (frequency: 6)
- **Shadow Triggers** (3 items):
  - Work deadlines (impact: 0.9, frequency: 15)
  - Social situations (impact: 0.75, frequency: 10)
  - Creative projects (impact: 0.7, frequency: 8)
- **Projection**: Future trajectory and risk level
- **Insights** (3 items): Pattern analysis and recommendations

### 3. **Relationships Analytics Panel** (`RelationshipsAnalyticsPanel.tsx`)
**Mock Data**: `MOCK_RELATIONSHIPS_DATA`

**Contains**:
- **Metrics**:
  - Total characters: 12
  - Total relationships: 18
  - Average closeness: 0.72
  - Most central character: "Sarah"
  - Active relationships: 8
- **Graph Data**:
  - **Nodes** (6): You, Sarah, Mike, Emma, Dad, Mom
  - **Edges** (6): Relationship connections with closeness scores
- **Metadata**:
  - **Sentiment Timeline** (4 entries): Relationship sentiment over time
  - **Archetypes** (3): Character relationship archetypes
  - **Attachment Gravity** (3): Relationship strength scores
  - **Forecast** (2): Relationship predictions
  - **Arc Appearances** (2): Character appearances in story arcs
  - **Heatmap** (3): Relationship intensity by month
- **Insights** (3 items): Relationship pattern analysis

### 4. **XP Analytics Panel** (`XpAnalyticsPanel.tsx`)
**Mock Data**: `mockData` object

**Contains**:
- **Metrics**:
  - Current level: 5
  - Total XP: 1250
  - Daily XP: 42.5
  - XP to next level: 150
  - Streak: 12 days
  - **Breakdown by domain**:
    - Work: 350 XP (28%)
    - Relationships: 280 XP (22.4%)
    - Health: 200 XP (16%)
    - Hobbies: 180 XP (14.4%)
    - Travel: 150 XP (12%)
    - Learning: 90 XP (7.2%)
- **Charts**:
  - Pie chart: XP by Domain
  - Line chart: Daily XP Over Time (7 days of data)
- **Insights** (3 items): Level progress, streak, top domain
- **Mock Skills** (3 items):
  - Python Programming (Level 5, 450 XP)
  - Guitar Playing (Level 3, 180 XP)
  - Public Speaking (Level 4, 320 XP)

### 5. **Achievements Panel** (`AchievementsPanel.tsx`)
**Mock Data**: Array of 5 achievements

**Contains**:
1. **First Entry** (Common)
   - Description: "Wrote your first journal entry"
   - XP Reward: 50
   - Icon: book-open

2. **Week Warrior** (Common)
   - Description: "7 days of consecutive journaling"
   - XP Reward: 100
   - Icon: flame

3. **Level 5** (Common)
   - Description: "Reached Level 5"
   - XP Reward: 250
   - Icon: trophy

4. **Skill Master** (Uncommon)
   - Description: "Reached level 10 in any skill"
   - XP Reward: 300
   - Icon: award

5. **Month Master** (Uncommon)
   - Description: "30 days of consecutive journaling"
   - XP Reward: 500
   - Icon: flame

**Statistics**:
- Total: 5 achievements
- By type: milestone (1), streak (2), xp_milestone (1), skill_level (1)
- By rarity: common (3), uncommon (2)

### 6. **Reactions & Resilience Panel** (`ReactionsResiliencePanel.tsx`)
**Mock Data**: `mockPatterns`, `mockInsights`, `mockStabilityMetrics`

**Contains**:
- **Reaction Patterns**:
  - By trigger: memory-1 (3), perception-1 (5), memory-2 (2)
  - By label: anxiety (8), anger (3), sadness (4), avoidance (5), rumination (6)
  - By type: emotional (12), behavioral (6), cognitive (4), physical (2)
  - Intensity averages for each label
  - Common patterns (3): Perception-reaction loops
- **Pattern Insights** (3 items):
  - Perception-reaction loops
  - False alarms (low-confidence beliefs triggering strong reactions)
  - Regulation trends (recovery time improvements)
- **Stability Metrics**:
  - Average recovery time: 75 minutes
  - Recovery trend: improving
  - Recurrence rate: 0.3
  - Intensity trend: decreasing
  - Resilience score: 0.72

## 👤 Main Character Profile

### **User Profile** (`UserProfile.tsx`)
**Mock Data**: `getMockEngineResults()` function

**Contains**:
- **Story of Self**:
  - Mode: Reflective (confidence: 0.85)
  - Themes: Self-Discovery (0.92), Growth (0.88), Connection (0.75)
  - Coherence score: 0.82
- **Archetype**:
  - Dominant: The Seeker (0.89)
  - Secondary: The Sage (0.76), The Creator (0.71)
- **Shadow**:
  - Dominant: The Perfectionist (0.78)
  - Scores: Perfectionist (0.78), Critic (0.65), Controller (0.52)
  - Projection: Self-compassion focus, integrating shadow patterns
- **Growth**:
  - Trajectory: Ascending
  - Milestones: Started journaling (2024-01), Major breakthrough (2024-06)
  - Velocity: 0.73
- **Inner Dialogue**:
  - Voices: future_self (0.45), inner_critic (0.32), wise_self (0.28)
  - Dominant: future_self
- **Alternate Self**:
  - Clusters: The Ideal Self (0.85), The Past Self (0.72)
  - Trajectory: Forward-moving
- **Cognitive Bias**:
  - Dominant: Confirmation Bias (0.68)
  - Biases: Confirmation (0.75), Anchoring (0.52)
- **Paracosm**:
  - Imagined Worlds (12 signals, confidence: 0.81)
  - Future Visions (8 signals, confidence: 0.74)

## 📚 Character Book

### **Character Book** (`CharacterBook.tsx`)
**Mock Data**: `dummyCharacters` array (exported from `mocks/index.ts`)

**Contains**: Multiple character profiles including:
- **Sarah Chen**: Best Friend, major character, 24 memories, 8 relationships
- **Marcus Johnson**: Mentor & Coach, major character, 18 memories
- **Alex Rivera**: Creative Collaborator
- And more characters with full profiles including:
  - Names, pronouns, archetypes, roles
  - Summaries and descriptions
  - Tags and metadata
  - Social media links
  - Relationship counts
  - Importance scores

## 📍 Location Book

### **Location Book** (`LocationBook.tsx`)
**Mock Data**: `dummyLocations` array (exported from `mocks/index.ts`)

**Contains**: Multiple location profiles with:
- Location names and descriptions
- Geographic information
- Memory associations
- Timeline data
- Tags and metadata

## 💭 Memory Book

### **Memory Book** (`MemoryBook.tsx`)
**Mock Data**: `dummyMemoryCards` array (exported from `mocks/index.ts`)

**Contains**: Multiple memory cards with:
- Memory content and summaries
- Dates and timestamps
- Associated characters and locations
- Tags and categories
- Emotional context

## 📖 Timeline & Memoir

### **Timeline Mock Data** (`timelineMockData.ts`)
**Mock Data**: `generateMockTimelines()` and `generateMockChronologyEntries()`

**Contains**:
- Multiple timeline objects with:
  - Titles and descriptions
  - Start/end dates
  - Timeline types (mythos, epoch, era, saga, arc, chapter, scene, action, microaction)
  - Tags and metadata
- Chronology entries linked to timelines:
  - Entry content
  - Timestamps
  - Timeline memberships
  - Character associations

### **Lore Book** (`LoreBook.tsx`)
**Mock Data**: `dummyBook` and `dummyChapters`

**Contains**:
- Memoir outline with sections
- Chapter data:
  - Chapter titles
  - Start/end dates
  - Descriptions and summaries
  - Content sections

### **Memoir Editor** (`MemoirEditor.tsx`)
**Mock Data**: `dummyMemoir` (exported from `mocks/index.ts`)

**Contains**:
- Memoir outline structure
- Sections with hierarchy
- Content and metadata

## 🔍 Perceptions

### **Perceptions View** (`PerceptionsView.tsx`)
**Mock Data**: Mock perception entries

**Contains**:
- Perception entries with:
  - Beliefs and thoughts
  - Confidence scores
  - Associated memories
  - Character relationships
  - Emotional context

## 🔄 Continuity Dashboard

### **Continuity Dashboard** (`ContinuityDashboard.tsx`)
**Mock Data**: `MOCK_CONTINUITY_EVENTS`, `MOCK_GOALS`, `MOCK_CONTRADICTIONS`

**Contains**:
- **Continuity Events**: Contradictions, identity drift, abandoned goals, emotional transitions
- **Goals**: Active and abandoned goals with progress tracking
- **Contradictions**: Conflicting information in entries

## 💰 Admin Console

### **Finance Dashboard** (`FinanceDashboard.tsx`)
**Mock Data**: Finance metrics

**Contains**:
- Revenue data
- Subscription metrics
- Payment information
- Financial trends

### **Logs Viewer** (`LogsViewer.tsx`)
**Mock Data**: System logs

**Contains**:
- Application logs
- Error logs
- Activity logs
- System events

### **Payment Events Feed** (`PaymentEventsFeed.tsx`)
**Mock Data**: Payment events

**Contains**:
- Payment transactions
- Subscription events
- Billing history
- Payment status

### **Revenue Graph** (`RevenueGraph.tsx`)
**Mock Data**: Monthly financials

**Contains**:
- Revenue over time
- Monthly breakdowns
- Growth trends
- Projections

### **Subscription Table** (`SubscriptionTable.tsx`)
**Mock Data**: Subscription data

**Contains**:
- User subscriptions
- Plan details
- Status information
- Billing cycles

## 👤 Account Center

### **Account Center** (`AccountCenter.tsx`)
**Mock Data**: User account data

**Contains**:
- User profile information
- Billing history
- Payment methods
- Activity logs
- Storage usage
- Privacy settings

## 📸 Photo Gallery

### **Photo Gallery** (`PhotoGallery.tsx`)
**Mock Data**: Mock photos and entries

**Contains**:
- Photo entries
- Image metadata
- Associated memories
- Timeline information

## 🎯 How to View Mock Data

1. **Toggle Mock Data On**:
   - Go to Settings/Dev Panel
   - Toggle "Mock Data Mode" switch ON
   - All components will show mock data

2. **Toggle Mock Data Off**:
   - Toggle "Mock Data Mode" switch OFF
   - Components will show real data or empty states

3. **Debug in Console**:
   ```javascript
   // Check current state
   window.mockDataDebug?.log()
   
   // Get detailed info
   window.mockDataDebug?.getInfo()
   ```

## 📝 Notes

- All mock data respects the global toggle
- Mock data only shows when toggle is enabled
- Real data takes precedence when available
- Mock data provides comprehensive examples for demos
- All mock data is type-safe and follows real data structures

