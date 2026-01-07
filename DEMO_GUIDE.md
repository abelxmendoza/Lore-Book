# Lore Keeper Demo Guide

## Overview
This guide helps you explore all the features we've built in Lore Keeper. After populating dummy data, you'll have a rich dataset to demonstrate the app's capabilities.

## 🧠 LoreKeeper Narrative Compiler (LNC) - Behind the Scenes

**What You Need to Know**: The LNC works automatically in the background to ensure your memories are accurate and reliable. You never see it directly, but you experience its benefits:

- ✅ **Fewer Wrong Memories**: When you ask questions, you get accurate answers
- ✅ **Better Disambiguation**: "Sarah" always refers to the same person
- ✅ **Cleaner Timelines**: Only valid experiences are used for patterns
- ✅ **Honest Uncertainty**: Low-confidence information is marked appropriately

**How It Works**: Every journal entry is automatically classified (EXPERIENCE, FEELING, BELIEF, FACT, DECISION, QUESTION) and processed with epistemic integrity. This means:
- Your beliefs stay as beliefs (never become facts)
- Your feelings stay as feelings (never become claims)
- Low-confidence facts are automatically downgraded
- Pattern detection only uses actual experiences

**See Also**: Check out `LNC_USER_GUIDE.md` for detailed information about the compiler system.

## Quick Start

1. **Populate Dummy Data**
   - Click the "Populate Data" button in the header (compact mode) or use the full component
   - This creates:
     - 3 chapters spanning 2 years
     - 23 journal entries with relationships
     - 5 characters/places (Sarah Chen, Marcus Johnson, Alex Rivera, The Coffee Shop, Central Park)
     - 3 memoir sections
     - 4 tasks

2. **Explore the Features**

## Feature Demonstrations

### 1. Chat Tab - AI Life Guidance
**Location**: Chat tab (default)

**What to Try**:
- **Streaming Responses**: Send a message and watch it stream word-by-word
- **Slash Commands**: 
  - `/recent` - See recent entries
  - `/characters` - List all characters
  - `/arcs` - Show story chapters
  - `/search <query>` - Search memories
- **Message Actions**: Hover over messages to see copy, regenerate, edit, delete options
- **Sources**: Click source cards to view entry/chapter/character details
- **Search**: Click search icon to search conversation history
- **Export**: Click download icon to export conversation as Markdown or JSON
- **Date Extraction**: Try messages like "I met Sarah yesterday" or "Last week I finished my novel"

**Key Features**:
- Full orchestrator context integration
- HQI semantic search
- Memory Fabric neighbor traversal
- Inline citations
- Continuity checking
- Strategic guidance

### 2. Timeline Tab - Chronological View
**Location**: Timeline tab

**What to See**:
- **Color-Coded Timeline**: Horizontal scrollable timeline at the top showing chapters and entries
- **Chronological Sorting**: All entries sorted using TimeEngine for accurate ordering
- **Multiple View Modes**:
  - Overview: Card-based view with density toggle
  - Graph: Visual timeline graph
  - Chapters: Organized by story arcs
  - Tasks: Task management view
- **Entry Details**: Click entries to see full details, related entries, characters
- **Time Display**: All timestamps use TimeEngine for consistent formatting

**Key Features**:
- TimeEngine-powered chronological sorting
- Precision-aware timestamp handling
- Grouped by date with sticky headers
- Clickable timeline items

### 3. Characters Tab - People & Places
**Location**: Characters tab

**What to See**:
- **User Profile**: Your profile at the top with stats, insights, and identity pulse
- **Character List**: All characters and places with relationships
- **Character Details**: Click characters to see their story, relationships, and timeline

**Key Features**:
- Character relationship tracking
- Timeline integration
- Entity detection from entries

### 4. Memory Explorer (Search)
**Location**: Search tab

**What to Try**:
- **Smart Query Parsing**: Type natural language queries like "entries about Sarah last month"
- **Filter Detection**: Automatically detects dates, characters, tags, motifs
- **Result Modal**: Click results to see detailed view with timeline context

**Key Features**:
- Natural language query parsing
- Semantic search
- Filter badges
- Detailed result modals

### 5. My Memoir Editor
**Location**: My Memoir Editor tab

**What to See**:
- **Memoir Sections**: Three sections covering different time periods
- **Omega Canon Keeper**: Toggle to see continuity checking panel
- **AI Assistance**: Get help writing and editing memoir sections
- **Document Upload**: Upload documents to extract content

**Key Features**:
- Memoir writing interface
- Continuity checking
- AI assistance
- Document processing

### 6. Lore Book
**Location**: Lore Book tab

**What to See**:
- **Reading Interface**: Clean, book-like reading experience
- **Navigation**: Previous/next section navigation
- **Reading Controls**: Adjust font size and line spacing
- **Progress Timeline**: Color-coded timeline showing current position

**Key Features**:
- Reading-focused UI
- Customizable reading settings
- Progress tracking

## Time Engine Features

### Chronological Accuracy
- All timestamps are parsed and normalized using TimeEngine
- Entries sorted with precision awareness
- Relative dates ("yesterday", "last week") properly handled
- Timezone support

### Time Display
- Consistent formatting across the app
- Relative time display ("2 days ago")
- Precision-aware formatting (year/month/day/hour)

## Data Relationships

The dummy data creates a rich interconnected story:

1. **Characters**:
   - Sarah Chen (Best Friend) - appears in multiple entries
   - Marcus Johnson (Mentor) - guides career decisions
   - Alex Rivera (Collaborator) - creative projects together
   - The Coffee Shop (Place) - workspace
   - Central Park (Place) - reflection space

2. **Chapters**:
   - "The Beginning: Finding My Path" (2 years ago - 18 months ago)
   - "Building Momentum: Growth and Challenges" (18 months ago - 6 months ago)
   - "Current Chapter: Transformation" (6 months ago - present)

3. **Story Arc**:
   - Journey from corporate job to full-time writer
   - Building creative habits and relationships
   - Completing first novel draft
   - Ongoing transformation

## Testing Scenarios

### Test Chat Intelligence
1. Ask: "Tell me about my relationship with Sarah"
2. Ask: "What happened when I finished my novel?"
3. Ask: "Show me entries from last month"
4. Try: "I'm feeling overwhelmed with editing"

### Test Timeline Features
1. Switch between view modes (Overview, Graph, Chapters, Tasks)
2. Change density (detailed, summary, chapters)
3. Click timeline items to see details
4. Scroll through chronological entries

### Test Search
1. Search: "Sarah"
2. Search: "creativity"
3. Search: "last month"
4. Use filters: date range, characters, tags

### Test Time Engine
1. Notice consistent date formatting
2. See relative times ("2 days ago")
3. Observe chronological ordering
4. Check precision handling (some entries have exact times, others just dates)

## What Makes This Demo Special

1. **Comprehensive Data**: Rich interconnected story spanning 2 years
2. **Real Relationships**: Characters appear across multiple entries
3. **Time Progression**: Clear narrative arc from past to present
4. **Feature Coverage**: Demonstrates all major features
5. **Realistic Content**: Believable journal entries and memoir sections

## Next Steps After Demo

1. **Add Your Own Data**: Start adding real entries
2. **Explore Connections**: See how the AI finds connections
3. **Use Chat**: Have conversations about your story
4. **Build Your Memoir**: Edit and refine memoir sections
5. **Track Progress**: Use tasks and timeline to track your journey

## Tips for Best Demo Experience

1. **Start with Chat**: Show the AI's intelligence first
2. **Show Timeline**: Demonstrate chronological organization
3. **Explore Characters**: Show relationship tracking
4. **Try Search**: Demonstrate smart query parsing
5. **Show Memoir**: Display the reading experience

Enjoy exploring Lore Keeper!

