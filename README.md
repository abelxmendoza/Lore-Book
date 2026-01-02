
// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.
# LoreBook

<div align="center">
  <img src="apps/web/public/branding/logo.svg" alt="LoreBook Logo" width="200" />
  
  **AI Life Engine**
  
  *Understand your past, navigate your present, predict your future. A system that remembers you, studies your identity, tracks your emotional and narrative arcs, and preserves your evolving digital self.*
  
  **Cost-Optimized & High-Performance**: Rule-based extraction, aggressive caching, and efficient algorithms ensure fast, free operations.
  
  [![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)](https://reactjs.org/)
  [![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
  [![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat&logo=supabase&logoColor=white)](https://supabase.com/)
</div>

---

## Table of Contents

- [What is LoreBook?](#what-is-lore-keeper)
- [Key Features](#key-features)
  - [User-Facing Features](#user-facing-features)
  - [Technical Features](#technical-features)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Architecture Overview](#architecture-overview)
- [Development Guide](#development-guide)
- [Key Concepts](#key-concepts)
- [Documentation](#documentation)
- [Cost & Performance](#cost--performance)
- [Roadmap](#roadmap)
- [FAQ](#faq)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)

---

## What is LoreBook?

**LoreBook** is an **AI Life Engine**—not just journaling, but a system that remembers you, studies your identity, tracks your emotional and narrative arcs, predicts your trajectory, and preserves your evolving digital self.

**Its purpose is to give people self-awareness, continuity, identity clarity, and a long-term companion that understands the story they're living.**

LoreBook helps you:
- **Understand who you are** - See your values, fears, strengths, patterns, and behavioral trends
- **See how you're changing** - Track identity drift, emotional arcs, and personal evolution
- **Track what you keep repeating** - Identify behavioral loops, abandoned goals, and recurring patterns
- **Monitor how your relationships evolve** - Understand relationship dynamics, sentiment shifts, and attachment patterns
- **Stay aligned with your goals** - Detect when goals are at risk, track progress, and maintain focus
- **Stop drifting** - Continuity intelligence spots contradictions, emotional changes, and identity shifts
- **Keep your life story coherent** - Automatic timeline organization and truth verification
- **Preserve your essence for the future** - Structured data for future AI systems

**In short:** ✨ It helps people understand their past, navigate their present, and predict their future.

**LoreBook is your favorite:**
- 🗣️ **Gossip Buddy** - Curious, engaging, relationship-focused. Discusses characters, relationships, and social dynamics with enthusiasm and curiosity.
- 🛋️ **Therapist** - Deep, reflective, supportive. Validates emotions, helps process experiences, asks gentle exploratory questions.
- 📚 **Historian** - Preserves your complete story, organizes your timeline, and maintains truth and continuity across your entire narrative.
- 🎯 **Strategist** - Goal-oriented, actionable. Provides strategic guidance, helps with planning, offers actionable insights based on your patterns.
- 🧠 **Memory Bank** - Remembers everything. Your complete digital memory that never forgets and can answer questions about your past, present, and patterns.

### ⭐ Core Mission (4 Pillars)

1. **Continuity Intelligence** - The Jarvis of your life. Tracks your life as a continuous narrative—spotting contradictions, emotional changes, identity drift, abandoned goals, and repeating loops. Automatically saves every detection into continuity events.

2. **Life Map & Story Engine** - Automatically generates timelines, arcs, sagas, and chapters from your daily life—turning your existence into a structured story with a 9-layer hierarchy (Mythos → Eras → Sagas → Arcs → Chapters → Scenes → Actions → MicroActions).

3. **Identity Mirror** - Extracts your values, fears, strengths, patterns, relationships, attachments, and behavioral trends—a living self-profile that evolves with every conversation.

4. **Digital Preservation & Future Self** - Stores your memories, patterns, personality, and life story in a structured way so future AI systems can reconstruct your essence.

### 🚀 Current Capabilities

**Production-Ready Features:**
- ✅ **Enterprise-Grade Security Suite** - CSRF protection, rate limiting, secure headers, XSS protection, data encryption (AES-256-GCM), privacy controls (GDPR compliant)
- ✅ **Comprehensive Testing** - Unit tests, integration tests, E2E tests (Playwright), security test suite (100% coverage)
- ✅ **CI/CD Pipeline** - Automated testing, code quality checks, duplicate detection, unused code analysis
- ✅ **Code Quality** - ESLint rules, import order enforcement, automated code cleanup
- ✅ **Memory Explorer** - Semantic search with HQI integration, memory cards, linked memories, filters
- ✅ **Timeline System** - 9-layer hierarchical timeline (Mythos → MicroActions), visual timeline page, emotion heatmap, highlights
- ✅ **Character System** - Relationship tracking, knowledge base, auto-generated avatars, relationship graphs, character modals, main character display
- ✅ **Location Tracking** - Location profiles, visit timelines, location modals
- ✅ **Automatic Biography & Lorebooks** - Multi-version biography generation engine with PDF export, chapter navigation, and recommendations
- ✅ **Resume Upload** - Upload resumes to populate memory bank, profile info, and verify skills with AI
- ✅ **Multi-Persona Chat** - Gossip Buddy, Therapist, Historian, Strategist, Memory Bank personas
- ✅ **Continuity Engine** ⭐ - The Jarvis of your life. Detects contradictions, emotional arcs, identity drift, abandoned goals, repeating loops, and thematic changes. Automatically runs after every journal entry.
- ✅ **Truth Seeker** - Automatic fact checking and contradiction detection
- ✅ **Task Engine** - Task management with Microsoft To-Do integration
- ✅ **Autopilot** - Strategic guidance panels (daily/weekly/monthly)
- ✅ **Essence Profiles** - Automatic extraction of hopes, dreams, fears, strengths, values, traits
- ✅ **Auto-Tagging** - AI-powered classification for entries (tags, lane, hierarchy)
- ✅ **RAG System** - Cached context packets for efficient AI responses
- ✅ **Semantic Search** - Vector embeddings for similarity search
- ✅ **Privacy Controls** - User-controlled data access, encryption, audit logging

**Analytics & Intelligence Engines:**
- ✅ **Creative Output Engine** - Tracks creative activities, flow states, creative blocks, inspiration sources, project lifecycles, and creative scores
- ✅ **Time Management Engine** - Analyzes time allocation, activity patterns, procrastination signals, energy curves, time cycles, and time efficiency scores
- ✅ **Social Network Engine** - Maps social relationships, detects communities, calculates influence scores, tracks toxicity signals, detects relationship drift, and computes network cohesion
- ✅ **Reflection Engine** - Extracts reflection signals (insights, realizations, lessons, questions, gratitude, growth) and builds reflection profiles
- ✅ **Personality Engine** - Tracks personality traits over time, builds personality profiles, and detects trait evolution
- ✅ **Archetype Engine** - Detects 11 archetypes (Warrior, Rebel, Hermit, Creator, Lover, Seeker, Protector, Leader, Outlaw, Sage, Shadow Self), tracks archetype transitions and distortions
- ✅ **Behavior Loop Resolution Engine** - Identifies recurring behavior patterns, detects behavior loops, normalizes behaviors, and tracks behavior statistics
- ✅ **Scene Generator Engine** - Extracts narrative scenes from entries, structures scenes with characters, beats, emotional arcs, and outcomes
- ✅ **Conflict Detection Engine** - Detects conflicts (physical, verbal, social, emotional, internal), tracks escalation patterns, emotional impact, and conflict outcomes
- ✅ **Toxicity & Red Flag Engine** - Identifies toxic dynamics, red flags, dangerous patterns, tracks toxicity by entity (person/place/situation), and predicts outcomes
- ✅ **Social Projection Engine** - Separates hypothetical people, imagined groups, influencer references, and mental simulations from real people in the social graph
- ✅ **Emotion Resolution Engine** - Extracts and clusters emotions, classifies emotion types, computes intensity, detects triggers, and resolves emotion events
- ✅ **Entity Resolution Engine** - Resolves mentions of people, places, organizations to canonical records using fuzzy matching and semantic similarity
- ✅ **Event Resolution Engine** - Groups temporal signals into resolved events, detects duplicate events, and tracks event patterns
- ✅ **Location Resolution Engine** - Resolves location mentions to canonical locations using vector similarity and fuzzy matching
- ✅ **Activity Resolution Engine** - Resolves activity mentions to canonical activities, tracks categories and intensity
- ✅ **Engine Manifest System** - Registers, describes, and semantically searches for available engines
- ✅ **Engine Registry & Health System** - Manages engine dependencies, execution order, health monitoring, and dynamic engine loading
- ✅ **Chronology Engine** - Builds temporal graphs, detects gaps, resolves ambiguities, infers causality, and constructs narrative sequences
- ✅ **Analytics Modules** - Identity Pulse, Relationship Analytics, Character Analytics, Saga Engine, Memory Fabric, Insight Engine, Prediction Engine, Shadow Engine, XP Engine, Life Map
- ✅ **Recommendation Engine** - Generates personalized recommendations (journal prompts, reflection questions, action items, relationship check-ins, goal reminders, pattern exploration)
- ✅ **Wisdom Engine** - Extracts and preserves wisdom, lessons learned, and life insights
- ✅ **Learning Engine** - Tracks learning activities, skill development, and knowledge acquisition
- ✅ **Context Engine** - Provides contextual understanding and relationship mapping
- ✅ **Consolidation Engine** - Consolidates similar memories and reduces redundancy
- ✅ **Narrative Engine** - Constructs narrative structures and story arcs
- ✅ **Relationship Dynamics Engine** - Analyzes relationship patterns, attachment styles, and relationship evolution
- ✅ **Intervention Engine** - Detects when intervention is needed and suggests actions
- ✅ **Goals Engine** - Tracks goals, milestones, progress, and goal achievement
- ✅ **Habits Engine** - Monitors habits, streaks, and habit formation patterns
- ✅ **Decisions Engine** - Tracks decision-making patterns and outcomes
- ✅ **Resilience Engine** - Measures resilience, tracks recovery patterns, and identifies resilience factors
- ✅ **Influence Engine** - Tracks influence patterns and social impact
- ✅ **Growth Engine** - Measures personal growth, tracks development areas, and identifies growth opportunities
- ✅ **Legacy Engine** - Preserves legacy content, wisdom, and messages for future generations
- ✅ **Values Engine** - Tracks core values, value evolution, and value alignment
- ✅ **Dreams Engine** - Tracks dreams, aspirations, and life goals
- ✅ **Financial Engine** - Tracks financial patterns, spending habits, and financial goals
- ✅ **Health Engine** - Monitors health patterns, symptoms, and wellness trends

LoreBook becomes your memory, your story engine, and your mirror—a living archive of who you are, who you were, and who you're becoming. The Continuity Engine acts as the core intelligence, running automatically after every entry to detect contradictions, emotional changes, identity drift, and repeating patterns. This is not just journaling—this is digital immortality, properly structured, with continuity intelligence that helps you understand your past, navigate your present, and predict your future.

### For Everyone (Non-Technical Users)

**What can LoreBook do for you?**

- **🧠 Continuity Intelligence** - Your life's Jarvis. Detects contradictions, emotional changes, identity drift, abandoned goals, repeating loops, suppressed topics, and self-narrative instability. Automatically runs after every journal entry and saves events for your review.

- **📖 Capture Your Complete Story**: Write naturally about your experiences, thoughts, and feelings—LoreBook preserves everything

- **🗣️ Your Favorite Gossip Buddy**: Curious, engaging, relationship-focused AI that discusses characters, relationships, and social dynamics with enthusiasm

- **🛋️ Your Therapist**: Deep, reflective, supportive AI that validates emotions, helps process experiences, and asks gentle exploratory questions

- **📚 Your Historian**: Preserves your complete story, organizes your timeline, and maintains truth and continuity across your entire narrative

- **🎯 Your Strategist**: Goal-oriented, actionable AI that provides strategic guidance, helps with planning, and offers insights based on your patterns

- **🧠 Your Memory Bank**: Remembers everything—your complete digital memory that never forgets and can answer questions about your past, present, and patterns

- **📚 Automatic Biography Generation**: **Your biography writes itself automatically**—just journal your life, and LoreBook transforms your entries into a polished, comprehensive biography with AI assistance. No writing skills required.

- **📊 Automatic Timeline Creation**: **Your timeline builds itself automatically**—LoreBook organizes your entries into a hierarchical timeline (mythos, eras, sagas, arcs, chapters, scenes) as you journal. See your life story unfold chronologically with beautiful visualizations.

- **🔮 Predictive Intelligence**: Forecast mood trends, identify goals at risk, predict relationship outcomes, and forecast your trajectory based on patterns

- **💝 Preserve Your Heart**: Track emotions, relationships, and what truly matters to you

- **🧠 Archive Your Mind**: Capture your thoughts, ideas, beliefs, values, and intellectual journey

- **✨ Preserve Your Soul**: Document your essence—your dreams, fears, triumphs, failures, and the patterns that make you unique

- **🔍 Truth & Continuity**: Automatic fact-checking and contradiction detection ensures your story is accurate and consistent

- **👥 Relationship Mapping**: Build a complete network of your relationships, showing how people shaped your life and how relationships evolve

- **📊 Life Patterns**: Discover insights about your habits, growth, repeating loops, and the themes that define you

**Why use LoreBook?**

Traditional journals capture only fragments—dates and events—but miss the deeper essence of who you are. LoreBook is an **AI Life Engine** designed for **continuity intelligence**, **self-awareness**, and **predictive life modeling**, capturing:

- **Your Complete Story**: Not just what happened, but why it mattered
- **Your Emotional Journey**: How experiences shaped your heart and soul, with automatic detection of emotional arcs and transitions
- **Your Identity Evolution**: Track how you're changing—identity drift, value shifts, and personal growth
- **Your Relationships**: The people who defined you, how relationships evolve, and sentiment trends
- **Your Patterns**: The recurring themes, habits, behavioral loops, and growth that make you unique
- **Your Continuity**: Automatic detection of contradictions, abandoned goals, and narrative inconsistencies
- **Your Future**: Predictive modeling of mood trends, goal risks, and trajectory forecasting

Unlike simple journals, LoreBook uses AI to:
- **Automatically detect continuity events**—contradictions, identity drift, emotional arcs, abandoned goals, repeating loops
- **Automatically write your biography** from your journal entries—no writing required
- **Automatically create your timeline**—organizing entries into eras, sagas, arcs, chapters, and scenes as you journal
- **Predict your trajectory**—forecast mood trends, identify goals at risk, and predict relationship outcomes
- Connect related memories automatically, building a complete picture
- Find insights and patterns you might have missed
- Maintain truth and continuity across your entire narrative
- Answer questions about your past, present, and patterns
- Structure your data for future AI systems that may one day continue your story

### How It Works

```
┌─────────────────┐
│  You Journal    │  ← Just write naturally about your life
│  Your Life      │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  LoreBook AI Processing              │
│  • Extracts facts, themes, patterns │
│  • Detects relationships & emotions│
│  • Organizes chronologically        │
│  • Verifies truth & consistency     │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Continuity Engine (Jarvis)         │
│  • Detects contradictions           │
│  • Tracks emotional arcs             │
│  • Monitors identity drift           │
│  • Identifies abandoned goals        │
│  • Spots repeating loops             │
│  • Saves continuity events           │
└────────┬────────────────────────────┘
         │
         ├──────────────────┬──────────────────┬──────────────────┐
         ▼                  ▼                  ▼                  ▼
┌─────────────────┐ ┌──────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  Biography      │ │  Timeline    │ │  Predictions     │ │  Digital Self    │
│  Writes Itself  │ │  Builds Itself│ │  & Insights      │ │  Preserved       │
│  Automatically  │ │  Automatically│ │  Generated       │ │  For Future AI   │
└─────────────────┘ └──────────────┘ └──────────────────┘ └──────────────────┘
```

**The Magic**: You just journal. LoreBook's Continuity Engine (the Jarvis of your life) automatically detects contradictions, emotional changes, identity drift, abandoned goals, and repeating loops. The system organizes, structures, predicts, and preserves your complete digital self.

**Your AI Companion**: LoreBook adapts to be exactly what you need—your gossip buddy for relationship talk, your therapist for emotional support, your historian for your story, your strategist for planning, and your memory bank that never forgets.

### LoreBook vs. Traditional Journals

| Feature | Traditional Journal | Other Journal Apps | **LoreBook** |
|---------|-------------------|-------------------|-----------------|
| **Biography Writing** | Manual, time-consuming | Not available | ✅ **Automatic** |
| **Timeline Creation** | Manual organization | Basic date sorting | ✅ **Automatic 9-layer hierarchy** |
| **AI Memory** | None | Limited | ✅ **Remembers everything** |
| **Fact Checking** | Manual | None | ✅ **Automatic verification** |
| **Relationship Tracking** | Manual notes | Basic tagging | ✅ **Automatic network mapping** |
| **Digital Immortality** | Not possible | Not designed for it | ✅ **Core purpose** |
| **Cost** | Free (pen & paper) | Free/Paid | ✅ **Free operations** (cost-optimized) |
| **Search** | Manual page flipping | Basic text search | ✅ **Semantic AI search** |
| **Insights** | None | Basic stats | ✅ **Deep pattern analysis** |

---

## Use Cases

### 📚 For Writers & Creators
- **Automatic Memoir Generation**: Transform your journal entries into a polished memoir without writing skills
- **Story Arc Organization**: See your life as narrative arcs, sagas, and chapters
- **Character Development**: Track how people in your life shaped your story
- **Timeline Visualization**: Understand the chronology of your creative journey

### 👨‍👩‍👧‍👦 For Families
- **Preserve Family History**: Capture stories, memories, and relationships for future generations
- **Legacy Building**: Create a digital legacy that can be passed down
- **Relationship Mapping**: Understand family connections and how they evolved
- **Multi-Generational Timeline**: See how your story fits into your family's larger narrative

### 💼 For Professionals
- **Career Journey Tracking**: Document your professional growth, achievements, and learnings
- **Network Mapping**: Track professional relationships and how they developed
- **Skill Development**: See patterns in your learning and growth
- **Achievement Timeline**: Visualize your career milestones and progression

### 🌟 For Everyone
- **Digital Immortality**: Preserve your complete essence for future AI systems
- **Self-Discovery**: Understand yourself through pattern analysis and insights
- **Memory Preservation**: Never forget important moments, people, or experiences
- **Life Organization**: Transform scattered memories into an organized, searchable narrative

---

## Key Features

### User-Facing Features

#### 💬 **AI Chat Assistant** - Your Multi-Faceted Companion ⭐
LoreBook seamlessly blends five personas based on context, becoming exactly what you need:

- 🗣️ **Gossip Buddy**: Curious, engaging, relationship-focused. Discusses characters, relationships, and social dynamics with enthusiasm and curiosity. Perfect for: "Tell me about Sarah" or "Who have I been spending time with?"
- 🛋️ **Therapist**: Deep, reflective, supportive. Validates emotions, helps process experiences, asks gentle exploratory questions. Perfect for: Processing difficult experiences or understanding your emotional patterns.
- 📚 **Biography Writer**: Narrative-focused, story-crafting. Helps shape compelling life stories, structure narratives, capture meaningful moments. Perfect for: "Help me write about my college years" or "What's the story of my career?"
- ✨ **Soul Capturer**: Essence-focused, identity tracking. Identifies and tracks core identity elements—hopes, dreams, fears, strengths, values, traits. Perfect for: Understanding who you are at your core.
- 🎯 **Strategist**: Goal-oriented, actionable. Provides strategic guidance, helps with planning, offers actionable insights. Perfect for: "What should I focus on?" or "Help me plan my next steps."
- 🧠 **Memory Bank**: Remembers everything. Your complete digital memory that never forgets. Perfect for: "What did I do with Marcus last month?" or "Remind me of my goals."

**Features:**
- Natural language conversations about your memories
- **Streaming responses** for real-time word-by-word interaction
- **Slash commands** for quick actions:
  - `/recent` - Show recent entries
  - `/characters` - List all characters
  - `/locations` - List all locations
  - `/arcs` or `/chapters` - Show story arcs/chapters
  - `/soul` or `/essence` - View your soul profile
  - `/search <query>` - Search entries
  - `/help` - Show all commands
- **Message Actions**: Copy, regenerate, edit, delete messages with feedback (thumbs up/down)
- **Clickable Sources**: Sources and citations are clickable to view entries/chapters
- Context-aware responses using your entire journal history
- **Intelligent Persona Blending**: Automatically adapts to your needs—emotional topics trigger Therapist, goal-setting triggers Strategist, character talk triggers Gossip Buddy, story editing triggers Biography Writer
- **Automatic Essence Extraction**: After every conversation, LoreBook extracts insights about your hopes, dreams, fears, strengths, weaknesses, skills, values, and relationship patterns
- **Cached RAG Packets**: Expensive context building cached for 5 minutes (50x faster)
- Source citations showing where information came from
- **Optimized Context Building**: Batched database queries, parallel operations

#### 📖 **Journal Entries**
- Rich text journaling with markdown support
- **Resume Upload**: Upload resumes to populate your memory bank and profile
  - Automatic skill extraction and verification
  - Profile information updates
  - AI-powered skill confirmation with public knowledge and Google searches
  - Career progression tracking
- **Rule-Based Tag Suggestions**: Fast, free tag extraction using pattern matching
  - Real-time tag suggestions as you type
  - Context-aware tag recommendations based on entry content
  - Uses existing tags database and keyword patterns
  - Aggressive caching for instant results
  - One-click tag selection
- **Voice Memo Recording**: Record or upload audio directly in the composer
  - Browser-based recording using MediaRecorder API
  - Upload pre-recorded audio files
  - Automatic transcription using OpenAI Whisper
  - Auto-populates composer with transcribed content, tags, and mood
  - Recording controls: start, pause, resume, stop, and cancel
  - Visual feedback with duration timer and recording indicators
- Automatic tagging and mood detection
- AI-generated summaries
- Photo integration with location context
- Date extraction from natural language using rule-based patterns

#### 📚 **Chapters & Story Arcs**
- Organize entries into meaningful chapters
- Automatic chapter suggestions based on themes
- Timeline visualization of your story arcs
- Chapter summaries and insights (AI-generated)
- Chapter creation chatbot interface (ChapterCreationChatbot)
- Chapter viewer with entry organization

#### 👥 **Character & Relationship Tracking**
- **Rule-Based Character Detection**: Pattern matching for names and places (cost-optimized)
- Relationship mapping (friends, family, colleagues)
- Character timelines showing their role in your story
- Knowledge base for each person/place
- **Optimized Character List**: Batch queries eliminate N+1 problem (10-25x faster)
- **Auto-Generated Avatars**: Unique avatars for each character using DiceBear API
  - Deterministic avatar generation based on character UUID
  - Different avatar styles for humans, AI, locations, and events
  - Optional Supabase caching for improved performance
- **Enhanced Character Detail Modals**: Comprehensive tabbed interface
  - **Info**: Edit character details, aliases, pronouns, archetype, role, summary, tags
  - **Social Media**: Instagram, Twitter/X, Facebook, LinkedIn, GitHub, website, email, phone
  - **Connections**: Relationship to you, mutual connections, closeness scores
  - **History**: Shared memories and timeline
  - **Context**: Character overview, summary, tags
  - **Timeline**: Visual timeline of shared memories
  - **Chat**: AI-powered chatbot for character updates
  - **Insights**: Character stats, relationships count, first appearance
  - **Metadata**: Technical details and raw data
- Keyboard shortcuts (Ctrl/Cmd + 1-9) for quick navigation
- Chat integration for updating character information through conversation

#### 📊 **Automatic Timeline Creation** ⭐ **Core Feature**
- **Your timeline builds itself automatically** - Just journal your life, and LoreBook organizes your entries into a hierarchical timeline
- **9-Layer Hierarchy**: Automatically organizes entries into Mythos → Epochs → Eras → Sagas → Arcs → Chapters → Scenes → Actions → MicroActions
- **AI-Powered Organization**: AI detects themes, relationships, and patterns to create meaningful timeline structure
- **Color-Coded Visualization**: Beautiful visual representation of your life story
- **Nested Timeline Display**: See parent-child relationships and how events connect
- **Multiple View Modes**: Explore your timeline as graph, cards, or chapters
- **Chronological Sorting**: Precise date handling ensures accurate timeline ordering
- **Automatic Updates**: Timeline automatically updates as you add new journal entries
- **Visual Storytelling**: See your life story unfold chronologically with beautiful visualizations

#### 🔍 **Memory Explorer (HQI Search)**
- Natural language search queries
- Semantic search powered by embeddings
- Automatic filter detection (dates, characters, tags, motifs)
- **Enhanced Detail Modals**: Comprehensive tabbed interface for exploring memories
  - **Overview**: Quick stats, full content, tags, timeline hierarchy, characters
  - **Context**: Timeline hierarchy details, temporal context (±5 days), chapter context
  - **Connections**: Characters mentioned and relationships
  - **Linked Memories**: Grouped by connection type (temporal, tag, chapter, character, source)
  - **Chat**: AI-powered chatbot for memory enhancement and updates
  - **Insights**: AI-generated analysis, themes, sentiment, reading time
  - **Timeline**: Visual timeline centered on memory with related entries
  - **Metadata**: Technical details, source information, raw JSON viewer
- Keyboard shortcuts (Ctrl/Cmd + 1-8) for quick navigation
- Chat integration for updating memories through conversation

#### 🔍 **Truth Seeker & Fact Checking**
- **Automatic Verification**: Every entry is automatically verified against existing facts
- **Cost-Optimized Fact Extraction**: Rule-based pattern matching extracts facts (dates, locations, characters, events, relationships) - NO API calls
- **Efficient Contradiction Detection**: Uses discrete math (set theory, boolean algebra) for fast O(1) contradiction checks
- **Aggressive Caching**: Facts are cached by content hash - same content = instant results
- **Verification Status**: Four statuses - Verified, Unverified, Contradicted, Ambiguous
- **Truth Seeker Panel**: Discovery Hub panel showing all contradictions and verification statistics
- **Evidence Tracking**: Shows supporting and contradicting entries with evidence
- **Database-Optimized**: Uses efficient database queries and indexes for fast verification
- **Resolution Tools**: Mark contradictions as resolved with notes
- **Verification Badges**: Visual indicators on entries showing verification status

#### 📖 **Automatic Biography Generation & Lorebooks** ⭐ **Core Feature**
- **Your biography writes itself automatically** - Just journal your life, and LoreBook transforms your entries into a polished biography
- **Multi-Biography Generation Engine**: Generate multiple versions of your life story (Main, Safe, Explicit, Private) with intelligent content filtering
- **Lorebook System**: 
  - **Core Lorebooks**: Save named, versioned editions of your biographies
  - **Ephemeral Lorebooks**: Generate on-demand views of your story
  - **Chapter Navigation**: Browse biographies chapter-by-chapter with page counts
  - **PDF Export**: Download any lorebook as a beautifully formatted PDF
  - **Search & Generate**: Intelligent search bar to generate custom biographies
  - **Recommendations**: AI-powered recommendations for which biographies to generate
- **AI-Powered Content Generation**: Automatically extracts themes, stories, and insights from your journal entries
- **Chatbot-style Editor**: Refine and edit your biography through natural conversation with AI
- **Automatic Section Organization**: AI organizes your life story into meaningful chapters and sections
- **Real-time Streaming**: Watch your biography come together as you chat with AI
- **Section Preview**: See all biography sections in a sidebar for easy navigation
- **Markdown Support**: Rich formatting for beautiful biography output
- **Continuous Updates**: Your biography automatically updates as you add new journal entries
- **Version Control**: Multiple versions (safe for public, explicit for posthumous, private for personal) with automatic content filtering

#### 📍 **Location Tracking**
- Automatic location detection from entries
- Visit history and frequency tracking
- People who visited each location
- Location timelines and memories
- **Enhanced Location Detail Modals**: Comprehensive tabbed interface
  - **Overview**: Visit stats, top tags, chapters, moods
  - **Visits**: Complete visit history with dates, summaries, tags
  - **People**: People who visited with visit counts
  - **Context**: Location details, coordinates, visit timeline, sources
  - **Timeline**: Visual timeline of visits
  - **Chat**: AI-powered chatbot for location information
  - **Insights**: Visit patterns, frequency analysis, top tags
  - **Metadata**: Technical details and raw data
- Keyboard shortcuts (Ctrl/Cmd + 1-8) for quick navigation
- Chat integration for location-related queries

#### 📘 **Lore Book (Reading Mode)**
- Beautiful reading interface with book-like typography
- **Chapter Navigation**: Left sidebar showing all autogenerated chapter names with page counts
- **PDF Download**: Download any lorebook version as a beautifully formatted PDF
- **Search & Generate**: Intelligent search bar at the top to generate custom biographies
- **Recommendations**: AI-powered top 4 lorebook recommendations based on your preferences
- **Version Management**: Multiple versions (Main, Safe, Explicit, Private) with automatic content filtering
- **Core vs Ephemeral**: Save important lorebooks as Core editions or generate temporary views
- Font size and line height controls
- Section navigation with progress indicators
- Timeline visualization at the bottom
- Chat interface for asking questions about the book
- Memoir integration for reading your auto-generated biography

#### ✅ **Task Engine**
- Goal and milestone tracking
- Task creation from chat commands (`/task` or natural language)
- Microsoft To-Do integration (sync tasks)
- Task timeline links
- Task briefing and event tracking
- Task completion and management

#### 🧠 **Discovery Hub** - Deep Intelligence Panels
- **10 Analytical Panels** - Toggle panels to explore different aspects of your life intelligence
  - **Identity Pulse**: Your persona signature and emotional trajectory—track identity drift and personality evolution
  - **Relationships**: Relationship analytics—tie strength, sentiment, attachment, conflict cycles
  - **Characters**: Character mention patterns, sentiment trends, interaction scores—who matters most and why
  - **Sagas**: Your major life arcs and story beats—narrative structure and themes
  - **Memory Fabric**: Embedding-based world model—clusters, topic graph, connections between memories
  - **Insights**: Daily AI insights, patterns, correlations, and behavioral loops—understand yourself deeply
  - **Predictions**: Mood trends, goals at risk, relationship forecasts—predict your trajectory
  - **Shadow Module**: Suppressed topics, fears, negative loops, shadow archetypes—what you're avoiding
  - **XP Dashboard**: Gamified personal growth—levels, streaks, life XP tracking
  - **Life Map**: Global narrative graph—turning points, eras, momentum score
- Clean, organized interface with visual feedback
- Easy panel toggling system
- **Purpose**: These panels provide deep intelligence about your life—helping you understand your past, navigate your present, and predict your future

#### ⌨️ **Keyboard Shortcuts**
- **Cmd+K** (Mac) / **Ctrl+K** (Windows): Quick search
- **Cmd+N** (Mac) / **Ctrl+N** (Windows): Create new entry
- **Ctrl/Cmd + 1-9**: Navigate between modal tabs
- All shortcuts are customizable and accessible

#### 🔒 **Privacy & Security**
- **Privacy & Security Page**: Comprehensive information about data protection
- **Privacy Settings**: Control data retention, analytics, and sharing preferences
- **Privacy Policy**: Full privacy policy document
- **Terms of Service**: Required acceptance on first login
- **Data Export**: Download all your data in JSON format (GDPR compliant)
- **Account Deletion**: Permanently delete your account and all data
- End-to-end encryption (TLS 1.3 in transit, AES-256 at rest)
- Row-level security ensuring complete data isolation
- No data selling or third-party sharing

#### 🧠 **Analytics & Intelligence Engines**

LoreBook includes a comprehensive suite of analytics engines that automatically extract insights from your journal entries:

**Creative & Productivity Engines:**
- **Creative Output Engine**: Tracks creative activities (coding, art, music, writing, video, robotics, design, performance), detects flow states, identifies creative blocks, tracks inspiration sources, monitors project lifecycles, and computes creative scores
- **Time Management Engine**: Analyzes time allocation across activities (coding, robotics, gym, BJJ, Muay Thai, family, social, travel, learning, sleep, eating, work), detects procrastination signals, estimates energy curves, identifies time cycles, and computes time efficiency scores

**Social & Relationship Engines:**
- **Social Network Engine**: Maps your social graph, detects communities, calculates influence scores, tracks relationship health, identifies toxicity signals, detects relationship drift, and computes network cohesion scores
- **Social Projection Engine**: Separates hypothetical people, imagined groups, influencer references, and mental simulations from real people in your social graph. Tracks anticipated connections, archetypes, and imagined groups
- **Relationship Dynamics Engine**: Analyzes relationship patterns, attachment styles, relationship evolution, and sentiment trends

**Identity & Personality Engines:**
- **Personality Engine**: Tracks personality traits over time (introverted/extroverted, analytical/creative, empathetic, etc.), builds personality profiles, and detects trait evolution
- **Archetype Engine**: Detects 11 archetypes (Warrior, Rebel, Hermit, Creator, Lover, Seeker, Protector, Leader, Outlaw, Sage, Shadow Self), tracks archetype transitions, identifies archetype distortions (Overdrive, Identity Split), and computes archetype profiles
- **Reflection Engine**: Extracts reflection signals (insights, realizations, lessons, questions, gratitude, growth) and builds reflection profiles

**Behavior & Pattern Engines:**
- **Behavior Loop Resolution Engine**: Identifies recurring behavior patterns (drinking, flirting, sparring, avoidance, overthinking, impulse, grinding, self-criticism), detects behavior loops, normalizes behaviors, and tracks behavior statistics
- **Habits Engine**: Monitors habits, tracks streaks, identifies habit formation patterns, and measures habit consistency
- **Decisions Engine**: Tracks decision-making patterns, decision outcomes, and decision quality over time

**Emotional & Mental Health Engines:**
- **Emotion Resolution Engine**: Extracts and clusters emotions (anger, sadness, fear, joy, disgust, surprise, desire, confidence, love, shame, envy, relief), classifies emotion types and subtypes, computes intensity, detects triggers, and resolves emotion events into temporal clusters
- **Conflict Detection Engine**: Detects conflicts (physical, verbal, social, emotional, internal), tracks escalation patterns, emotional impact (before/during/after), conflict beats, and conflict outcomes
- **Toxicity & Red Flag Engine**: Identifies toxic dynamics, red flags, dangerous patterns, tracks toxicity by entity (person/place/situation), categorizes toxicity types (jealousy, manipulation, aggression, chaos, betrayal), and predicts outcomes

**Narrative & Story Engines:**
- **Scene Generator Engine**: Extracts narrative scenes from entries, structures scenes with characters, beats, emotional arcs, interactions, and outcomes. Segments long entries into multiple scenes
- **Chronology Engine**: Builds temporal graphs, detects gaps in your timeline, resolves temporal ambiguities, infers causality, and constructs narrative sequences
- **Narrative Engine**: Constructs narrative structures, identifies story arcs, and organizes your life story

**Entity Resolution Engines:**
- **Entity Resolution Engine**: Resolves mentions of people, places, organizations to canonical records using fuzzy matching (Jaro-Winkler Distance) and semantic similarity (vector embeddings)
- **Event Resolution Engine**: Groups temporal signals into resolved events, detects duplicate events using time overlap, people overlap, activity overlap, and vector similarity
- **Location Resolution Engine**: Resolves location mentions to canonical locations using vector similarity, text similarity, and type matching
- **Activity Resolution Engine**: Resolves activity mentions to canonical activities, tracks categories and intensity

**Life Management Engines:**
- **Goals Engine**: Tracks goals, milestones, progress, goal achievement, and identifies goals at risk
- **Task Engine**: Task management with Microsoft To-Do integration, task creation from chat, task timeline links
- **Financial Engine**: Tracks financial patterns, spending habits, financial goals, and financial health
- **Health Engine**: Monitors health patterns, symptoms, wellness trends, and health metrics

**Growth & Development Engines:**
- **Growth Engine**: Measures personal growth, tracks development areas, identifies growth opportunities, and monitors growth patterns
- **Learning Engine**: Tracks learning activities, skill development, knowledge acquisition, and learning patterns
- **Resilience Engine**: Measures resilience, tracks recovery patterns, identifies resilience factors, and monitors resilience over time
- **Influence Engine**: Tracks influence patterns, social impact, and influence networks

**Wisdom & Legacy Engines:**
- **Wisdom Engine**: Extracts and preserves wisdom, lessons learned, and life insights
- **Legacy Engine**: Preserves legacy content, wisdom, and messages for future generations
- **Values Engine**: Tracks core values, value evolution, and value alignment
- **Dreams Engine**: Tracks dreams, aspirations, and life goals

**System & Infrastructure:**
- **Engine Manifest System**: Registers, describes, and semantically searches for available engines. Manages engine blueprints and embeddings
- **Engine Registry & Health System**: Manages engine dependencies, execution order (topological sorting), health monitoring (success/error rates, duration, error counts), and dynamic engine loading
- **Recommendation Engine**: Generates personalized recommendations (journal prompts, reflection questions, action items, relationship check-ins, goal reminders, pattern exploration, gap fillers, continuity follow-ups, growth opportunities, legacy building)
- **Consolidation Engine**: Consolidates similar memories and reduces redundancy
- **Context Engine**: Provides contextual understanding and relationship mapping

**Analytics Modules:**
- **Identity Pulse**: Tracks your persona signature and emotional trajectory, monitors identity drift and personality evolution
- **Relationship Analytics**: Analyzes tie strength, sentiment, attachment, conflict cycles, and relationship health
- **Character Analytics**: Character mention patterns, sentiment trends, interaction scores—who matters most and why
- **Saga Engine**: Identifies major life arcs and story beats, narrative structure and themes
- **Memory Fabric**: Embedding-based world model—clusters, topic graph, connections between memories
- **Insight Engine**: Daily AI insights, patterns, correlations, and behavioral loops
- **Prediction Engine**: Mood trends, goals at risk, relationship forecasts—predicts your trajectory
- **Shadow Engine**: Suppressed topics, fears, negative loops, shadow archetypes—what you're avoiding
- **XP Engine**: Gamified personal growth—levels, streaks, life XP tracking
- **Life Map**: Global narrative graph—turning points, eras, momentum score

### Technical Features

#### 🏗️ **Architecture**
- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **AI**: OpenAI GPT-4 for chat and content generation
- **Search**: Vector embeddings for semantic search (HQI)
- **Styling**: Tailwind CSS with custom cyberpunk theme

#### 🔐 **Security**
- Row Level Security (RLS) policies
- User authentication via Supabase Auth
- Secure API endpoints
- Data isolation per user

#### 🧪 **Testing**
- Unit tests with Vitest
- Component tests for critical UI components
- Integration tests
- E2E tests with Playwright
- Test coverage reporting

#### 📦 **Development Tools**
- Hot module replacement (HMR)
- TypeScript strict mode
- ESLint + Prettier
- Pre-commit hooks
- GitHub Actions CI/CD

#### ♿ **Accessibility**
- ARIA labels and roles for screen readers
- Keyboard navigation support
- Skip links for main content
- Semantic HTML structure
- Focus management for modals and dialogs

#### ⚡ **Performance**
- Virtual scrolling for long lists (React Virtual)
- Code splitting and lazy loading
- Optimized bundle sizes
- Skeleton loaders for better perceived performance
- Debounced API calls for tag suggestions

---

## Getting Started

### For Users

**Quick Start (5 minutes)**

1. **Sign Up**: Create an account using email or Google
2. **Start Writing**: Create your first journal entry
3. **Explore**: Check out the Timeline, Characters, and Chat features
4. **Ask Questions**: Try asking the AI about your entries

**First Steps**

- Write a few journal entries about recent events
- Let LoreBook automatically detect characters and relationships
- Try asking the AI: "What have I been working on lately?"
- Explore the Timeline to see your entries visualized
- Check out the Characters tab to see people automatically tracked

### For Developers

#### Prerequisites

- **Node.js** 20+ ([Download](https://nodejs.org/))
- **pnpm** 8+ (Install: `npm install -g pnpm`)
- **Supabase Account** ([Sign up](https://supabase.com/)) or local Supabase CLI
- **OpenAI API Key** ([Get one](https://platform.openai.com/api-keys))

#### Installation

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/lorekeeper.git
cd lorekeeper

# 2. Install dependencies
pnpm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your credentials (see below)
```

#### Environment Setup

Create a `.env` file in the project root:

```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-key

# Server Configuration
PORT=4000
NODE_ENV=development
LOG_LEVEL=info
```

**For Local Development:**

```bash
# Install Supabase CLI
npm install -g supabase

# Initialize and start Supabase locally
supabase init
supabase start

# Copy the credentials shown to your .env file
# They'll look like:
# SUPABASE_URL=http://localhost:54321
# SUPABASE_ANON_KEY=eyJhbGc...
# SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Run database migrations
supabase db reset
```

#### Running the Application

```bash
# Terminal 1: Start the backend server
pnpm dev:server
# Server runs on http://localhost:4000

# Terminal 2: Start the frontend web app
pnpm dev:web
# Web app runs on http://localhost:5173
```

## API Endpoints

- `GET /api/legal/terms` – Terms of Service markdown
- `GET /api/legal/privacy` – Privacy Policy markdown
- `GET /api/account/export` – Export account data as JSON gzip archive
- `POST /api/account/delete` – Irreversible account deletion
- `POST /api/billing/create-checkout-session` – Stripe checkout for upgrades
- `POST /api/billing/portal` – Manage billing portal access
- `POST /api/billing/webhook` – Billing webhook receiver

## Ownership & Rights
This project, LoreBook, including all code, documentation, and concepts, is © 2025 Abel Mendoza (Omega Technologies).
All rights reserved. No part of this software may be used commercially, redistributed, or sold without explicit permission.

### Character Knowledge Base (Entity-Relationship Schema)

```sql
-- Characters: central entities in the lore graph
create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  alias text[],
  pronouns text,
  archetype text,
  role text,
  status text default 'active',
  first_appearance date,
  summary text,
  tags text[] default '{}',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, name)
);

-- Relationship edges: directional link from a source character to a target character
create table if not exists public.character_relationships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  source_character_id uuid references public.characters(id) on delete cascade,
  target_character_id uuid references public.characters(id) on delete cascade,
  relationship_type text not null,
  closeness_score smallint check (closeness_score between -10 and 10),
  status text default 'active',
  summary text,
  last_shared_memory_id uuid references public.journal_entries(id),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, source_character_id, target_character_id, relationship_type)
);

-- Character memories: bridge between characters and journal entries/chapters
create table if not exists public.character_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  character_id uuid references public.characters(id) on delete cascade,
  journal_entry_id uuid references public.journal_entries(id) on delete cascade,
  chapter_id uuid references public.chapters(id),
  role text,
  emotion text,
  perspective text,
  summary text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, character_id, journal_entry_id)
);

-- ER-friendly view that blends characters, their memories, and outbound relationships
create or replace view public.character_knowledge_base as
select
  c.id as character_id,
  c.user_id,
  c.name,
  c.alias,
  c.pronouns,
  c.archetype,
  c.role,
  c.status,
  c.tags,
  cm.journal_entry_id,
  cm.chapter_id,
  cm.role as memory_role,
  cm.emotion as memory_emotion,
  cm.perspective,
  cm.summary as memory_summary,
  cr.target_character_id,
  cr.relationship_type,
  cr.closeness_score,
  cr.summary as relationship_summary
from public.characters c
left join public.character_memories cm
  on cm.character_id = c.id
left join public.character_relationships cr
  on cr.source_character_id = c.id;
**Open your browser** to `http://localhost:5173` and start using LoreBook!

#### Populating Dummy Data

To see LoreBook in action with sample data:

1. Open the browser console (F12)
2. Copy and paste the script from `populate-browser-console.js`
3. Press Enter
4. Wait for "Population complete!"
5. The page will refresh automatically

This creates:
- 3 chapters spanning 2 years
- 23 journal entries with relationships
- 5 characters/places
- 3 biography sections
- Sample tasks

---

## Project Structure

```
lorekeeper/
├── apps/
│   ├── web/                    # Frontend React application
│   │   ├── src/
│   │   │   ├── components/    # React components
│   │   │   │   ├── chat/      # Chat interface
│   │   │   │   ├── timeline/  # Timeline visualizations
│   │   │   │   ├── characters/# Character management
│   │   │   │   ├── biography/ # Biography editor (chatbot-style)
│   │   │   │   ├── memoir/    # Memoir editor (legacy)
│   │   │   │   ├── discovery/ # Discovery Hub
│   │   │   │   ├── security/  # Privacy & Security pages
│   │   │   │   └── lorebook/  # Reading interface
│   │   │   ├── hooks/         # React hooks
│   │   │   ├── lib/           # Utilities
│   │   │   └── pages/         # Page components
│   │   ├── public/            # Static assets
│   │   └── package.json
│   │
│   └── server/                 # Backend Express API
│       ├── src/
│       │   ├── routes/        # API route handlers
│       │   ├── services/      # Business logic
│       │   ├── types/         # TypeScript types
│       │   └── index.ts       # Server entry point
│       └── package.json
│
├── lorekeeper/                 # Python backend (legacy/orchestrator)
│   ├── orchestrator/          # Main orchestration engine
│   ├── continuity/            # Continuity checking
│   ├── persona/               # Persona engine
│   └── ...
│
├── migrations/                 # Database migrations
│   ├── 000_setup_all_tables.sql
│   ├── 20250120_timeline_hierarchy.sql
│   └── ...
│
├── scripts/                    # Utility scripts
│   ├── setup-dev.sh           # Development setup
│   └── populate-dummy-data.ts # Data seeding
│
└── package.json                # Root package.json (monorepo)
```

---

## Architecture Overview

### Frontend Architecture

**Technology Stack:**
- **React 18** with TypeScript for type safety
- **Vite** for fast development and building
- **Tailwind CSS** for styling with custom cyberpunk theme
- **React Query** for data fetching and caching
- **Zustand** for state management (where needed)

**Key Components:**
- **Chat Interface**: Streaming AI responses with source citations, slash commands, message actions (ChatFirstInterface)
- **Timeline Views**: Multiple visualization modes (graph, cards, chapters, overview) with color-coding (TimelinePage, ImprovedTimelineView)
- **Character System**: Relationship tracking, knowledge base, auto-generated avatars, relationship graphs (CharacterBook, CharacterDetailModal)
- **Automatic Biography Generation**: AI-powered biography writing from journal entries with chatbot-style editor (BiographyEditor)
- **Discovery Hub**: Analytical panels for exploring insights and patterns (DiscoveryHub with 8 panels)
- **Memory Explorer**: Semantic search interface with HQI integration (MemoryExplorer, HQIPanel)
- **Truth Seeker**: Automatic fact checking and contradiction detection (TruthSeekerPanel)
- **Lore Book**: Reading-optimized interface for memoirs (LoreBook)
- **Entry Composer**: Rich text editor with AI tag suggestions and voice memo recording (NeonComposer)
- **Task Engine**: Task management with Microsoft To-Do integration (TaskEnginePanel)
- **Autopilot**: Strategic guidance panels (AutopilotPanel)
- **Location Tracking**: Location profiles and visit timelines (Locations, LocationDetailModal)
- **Skeleton Loaders**: Beautiful loading states for better UX

### Backend Architecture

**Technology Stack:**
- **Node.js + Express** for REST API
- **TypeScript** for type safety
- **Supabase Client** for database access
- **OpenAI API** for AI features

**Key Services:**
- **Memory Service**: Journal entry management and CRUD operations
- **Chapter Service**: Story arc organization and summaries
- **Character Service**: Relationship tracking with optimized batch queries
- **Omega Chat Service**: Multi-persona AI chat with streaming (Gossip Buddy, Therapist, Biography Writer, Soul Capturer, Strategist, Memory Bank)
- **Chat Service**: Simple chat service for summaries and reflections (used in chapters and summary routes)
- **Essence Profile Service**: Automatic extraction and tracking of psychological essence (hopes, dreams, fears, strengths, weaknesses, skills, values, traits, relationship patterns) with evolution tracking
- **HQI Service**: Semantic search with embeddings (cached)
- **Timeline Manager**: Hierarchical timeline management (9-layer hierarchy)
- **Timeline Page Service**: Timeline views, emotion intensity, highlights
- **Auto-Tagging Service**: AI-powered classification for entries (tags, lane, hierarchy)
- **Truth Verification Service**: Cost-optimized fact checking with rule-based extraction
- **Fact Extraction Service**: Rule-based pattern matching (no API calls)
- **Tag Service**: Rule-based tag extraction with caching
- **Embedding Service**: Cached embeddings for semantic search
- **RAG Packet Cache**: Cached context packets for chat (5-minute TTL)
- **Chapter Insights Cache**: Cached chapter profiles
- **Memoir Service**: Memoir generation and auto-update (cached)
- **Biography Service**: Biography generation with chatbot-style editing
- **Autopilot Service**: Strategic guidance (daily/weekly/monthly)
- **Task Engine Service**: Task management with Microsoft To-Do sync
- **Orchestrator Service**: Comprehensive context orchestration
- **Identity Service**: Identity pulse and persona tracking
- **People Places Service**: Location and character detection
- **Location Service**: Location profile management and visit tracking
- **Conversation Service**: Conversation session management
- **Naming Service**: AI-powered naming for chapters and memoirs
- **Canonical Service**: Canon alignment and correction tracking
- **Memory Ladder Renderer**: Memory ladder visualization service

### Database Schema

**Core Tables:**
- `journal_entries`: User journal entries (with embeddings for semantic search)
- `chapters`: Story chapters and arcs
- `characters`: People and places
- `memoir_sections`: Biography content (stored as memoir in database)
- `tasks`: Goals and milestones
- `timeline_*`: 9-layer hierarchy tables (mythos, epochs, eras, sagas, arcs, chapters, scenes, actions, microactions)
- `essence_profiles`: Dynamic psychological essence profiles (hopes, dreams, fears, strengths, weaknesses, skills, values, traits, relationship patterns, evolution)
- `fact_claims`: Extracted factual claims (for Truth Seeker)
- `entry_verifications`: Verification status and reports
- **Optimized Indexes**: Composite indexes for fast fact lookups, contradiction detection, and verification queries

**Security:**
- Row Level Security (RLS) on all tables
- User isolation via `user_id` foreign keys
- Secure API endpoints with authentication

---

## Development Guide

### Available Scripts

```bash
# Development
pnpm dev:web      # Start web app (port 5173)
pnpm dev:server   # Start API server (port 4000)

# Building
pnpm build        # Build all apps for production

# Testing
pnpm test         # Run all tests
pnpm test:coverage # Run tests with coverage
pnpm test:e2e     # Run end-to-end tests

# Code Quality
pnpm lint         # Lint all code
pnpm format       # Format code with Prettier
```

### Development Workflow

1. **Start Supabase** (if using local):
   ```bash
   supabase start
   ```

2. **Start Development Servers**:
   ```bash
   # Terminal 1
   pnpm dev:server
   
   # Terminal 2
   pnpm dev:web
   ```

3. **Make Changes**:
   - Frontend changes hot-reload automatically
   - Backend changes require server restart
   - Database changes require migrations

4. **Run Tests**:
   ```bash
   pnpm test
   ```

5. **Check Linting**:
   ```bash
   pnpm lint
   ```

### Database Migrations

```bash
# Create a new migration
supabase migration new migration_name

# Apply migrations
supabase db reset

# Or manually:
psql "your-db-url" -f migrations/your_migration.sql
```

### API Development

**API Routes Structure:**

**Core Features:**
- `/api/entries` - Journal entry CRUD, tag suggestions, voice transcription
- `/api/chapters` - Chapter management and summaries
- `/api/characters` - Character management (optimized batch queries)
- `/api/chat` - AI chat with streaming support (multi-persona)
- `/api/memoir/*` - Memoir operations (cached, auto-update)
- `/api/biography/*` - Biography operations (chatbot-style editor)
- `/api/timeline` - Timeline views, emotion intensity, highlights
- `/api/timeline-hierarchy/*` - 9-layer timeline hierarchy operations (batched queries)
- `/api/verification/*` - Truth Seeker and fact checking (rule-based, cached)
- `/api/hqi/*` - Semantic search (cached embeddings)
- `/api/orchestrator/*` - Comprehensive context orchestration
- `/api/autopilot/*` - Daily/weekly/monthly strategic guidance
- `/api/tasks` - Task management with Microsoft To-Do integration
- `/api/insights` - AI insights and predictions
- `/api/identity` - Identity pulse and persona tracking
- `/api/essence` - Essence profile and evolution tracking
  - `GET /profile` - Get current essence profile
  - `POST /extract` - Manual essence extraction
  - `PUT /skills` - Update skills (user-curated)
  - `GET /evolution` - Get evolution timeline
  - `POST /refine` - User refinement of AI findings
- `/api/locations` - Location tracking and visit history
- `/api/persona` - Persona state management
- `/api/evolution` - Evolution insights
- `/api/documents` - Document upload and language style
- `/api/privacy` - Privacy settings and data export
- `/api/subscription` - Subscription management
- `/api/dev` - Development utilities (dummy data population)

**Analytics & Intelligence Engines:**
- `/api/creative/*` - Creative Output Engine (analyze, events, flow, blocks, score, stats)
- `/api/time/*` - Time Management Engine (analyze, events, blocks, procrastination, energy, cycles, score)
- `/api/social/*` - Social Network Engine (analyze, graph, communities, influence, toxicity, drift, network score)
- `/api/reflection/*` - Reflection Engine (analyze, reflections, profile)
- `/api/personality/*` - Personality Engine (analyze, profile, traits)
- `/api/archetype/*` - Archetype Engine (analyze, profile, transitions, distortions)
- `/api/behavior/*` - Behavior Loop Resolution Engine (resolve, events, loops)
- `/api/scenes/*` - Scene Generator Engine (resolve, scenes, scene by ID)
- `/api/conflicts/*` - Conflict Detection Engine (resolve, conflicts, conflict by ID)
- `/api/toxicity/*` - Toxicity & Red Flag Engine (resolve, events, events by entity, event by ID)
- `/api/social-projection/*` - Social Projection Engine (analyze, projections, links)
- `/api/emotion/*` - Emotion Resolution Engine (resolve, events, event by ID)
- `/api/entities/*` - Entity Resolution Engine (resolve, entities, entity by ID)
- `/api/events/*` - Event Resolution Engine (resolve, events, event by ID)
- `/api/locations/*` - Location Resolution Engine (resolve, locations, location by ID)
- `/api/activities/*` - Activity Resolution Engine (resolve, activities, activity by ID)
- `/api/temporal-events/*` - Temporal Event Resolution Engine (resolve, events, event by ID)
- `/api/engines/*` - Engine Manifest System (list, search, get-blueprint, sync)
- `/api/engine-registry/*` - Engine Registry & Health System (list, health, run, run-all)
- `/api/chronology/*` - Chronology Engine (analyze, gaps, causality, narrative)
- `/api/analytics/*` - Analytics modules (identity, relationships, characters, sagas, fabric, insights, predictions, shadow, xp, life-map)
- `/api/recommendations/*` - Recommendation Engine (get, history, show, dismiss, act, refresh, stats)
- `/api/wisdom/*` - Wisdom Engine (extract, wisdom, insights)
- `/api/learning/*` - Learning Engine (track, activities, skills)
- `/api/context/*` - Context Engine (analyze, relationships)
- `/api/consolidation/*` - Consolidation Engine (consolidate, similar, reduce)
- `/api/narrative/*` - Narrative Engine (construct, arcs, structure)
- `/api/relationship-dynamics/*` - Relationship Dynamics Engine (analyze, patterns, evolution)
- `/api/intervention/*` - Intervention Engine (detect, suggest, actions)
- `/api/goals/*` - Goals Engine (track, progress, at-risk)
- `/api/habits/*` - Habits Engine (track, streaks, patterns)
- `/api/decisions/*` - Decisions Engine (track, patterns, outcomes)
- `/api/resilience/*` - Resilience Engine (measure, recovery, factors)
- `/api/influence/*` - Influence Engine (track, patterns, networks)
- `/api/growth/*` - Growth Engine (measure, opportunities, patterns)
- `/api/legacy/*` - Legacy Engine (preserve, wisdom, messages)
- `/api/values/*` - Values Engine (track, evolution, alignment)
- `/api/dreams/*` - Dreams Engine (track, aspirations, goals)
- `/api/financial/*` - Financial Engine (track, patterns, goals)
- `/api/health/*` - Health Engine (monitor, patterns, metrics)

**See `BACKEND_FRONTEND_MAPPING.md`** for complete API documentation.

### Adding New Features

1. **Frontend Component**:
   - Create component in `apps/web/src/components/`
   - Add to appropriate surface/page
   - Update types if needed

2. **Backend Endpoint**:
   - Create route in `apps/server/src/routes/`
   - Add service logic in `apps/server/src/services/`
   - Update types in `apps/server/src/types/`

3. **Database Changes**:
   - Create migration file
   - Update types
   - Test migration

---

## Key Concepts

### Timeline Hierarchy

LoreBook uses a 9-layer hierarchy to organize memories:

1. **Mythos** - Top-level narrative themes
2. **Epochs** - Major time periods
3. **Eras** - Significant eras within epochs
4. **Sagas** - Long-form story arcs
5. **Arcs** - Story arcs within sagas
6. **Chapters** - Organized chapters
7. **Scenes** - Specific scenes
8. **Actions** - Individual actions
9. **MicroActions** - Granular events

This allows for rich, nested organization of your life story.

### Memory Fabric

The Memory Fabric is a graph-based representation of your memories, where:
- **Nodes** represent memories, characters, concepts
- **Edges** represent relationships and connections
- **Embeddings** enable semantic search and similarity

### HQI (High-Quality Intelligence) Search

HQI provides semantic search capabilities:
- Natural language queries
- Vector embeddings for similarity search
- Automatic filter detection
- Context-aware results

### Continuity Intelligence

The Continuity Engine is the core intelligence of LoreBook—the "Jarvis of your life." It ensures narrative consistency and provides self-awareness:
- **Detects contradictions** in your story automatically
- **Tracks emotional arcs** and transitions
- **Monitors identity drift** and personal evolution
- **Identifies abandoned goals** and goal progress
- **Spots repeating loops** and behavioral patterns
- **Detects thematic drift** and topic changes
- **Saves continuity events** for review and insights
- Maintains timeline accuracy and prevents factual drift
- Runs automatically after every journal entry

---

## Documentation

### Getting Started
- **[Quick Start Guide](QUICK_START.md)** - Get up and running fast
- **[Demo Guide](DEMO_GUIDE.md)** - Explore all features

### Technical Documentation
- **[Backend API Mapping](BACKEND_FRONTEND_MAPPING.md)** - Complete API reference
- **[Codex Blueprint](CODEX_BLUEPRINT.md)** - System architecture details
- **[Database Blueprint](DATABASE_BLUEPRINT.md)** - Database schema details

### Implementation & Status
- **[Implementation Status](docs/IMPLEMENTATION_STATUS.md)** - Feature implementation tracking
- **[Memory Engine](docs/MEMORY_ENGINE.md)** - Memory extraction system
- **[Analytics System](docs/ANALYTICS_SYSTEM.md)** - Analytics modules documentation
- **[Security Testing](docs/SECURITY_TESTING.md)** - Security test suite
- **[Testing](docs/TESTING.md)** - Testing documentation
- **[CI/CD](docs/CI_CD.md)** - CI/CD pipeline setup
- **[Code Cleanup](docs/CODE_CLEANUP.md)** - Code cleanup documentation

### Guides & Plans
- **[Improvement Plan](IMPROVEMENT_PLAN.md)** - Roadmap and ideas
- **[Privacy Guide](PRIVACY_GUIDE.md)** - Privacy and data protection
- **[Subscription Guide](SUBSCRIPTION_GUIDE.md)** - Subscription management

---

## Contributing

We welcome contributions! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/your-feature`
3. **Make your changes**
4. **Add tests** for new features
5. **Run tests**: `pnpm test`
6. **Check linting**: `pnpm lint`
7. **Commit your changes**: `git commit -m "Add your feature"`
8. **Push to your fork**: `git push origin feature/your-feature`
9. **Submit a pull request**

### Code Style

- Use TypeScript for all new code
- Follow existing code patterns
- Add JSDoc comments for public APIs
- Write tests for new features
- Update documentation as needed

### Testing

- Write unit tests for services and utilities
- Write integration tests for API endpoints
- Write E2E tests for critical user flows
- Aim for >80% code coverage

---

## Troubleshooting

### Common Issues

**"Cannot connect to database"**
- Check Supabase is running: `supabase status`
- Verify `.env` file has correct credentials
- Restart server after updating `.env`

**"Module not found" errors**
- Run `pnpm install` again
- Delete `node_modules` and reinstall
- Check Node.js version: `node --version` (should be 20+)

**"Port already in use"**
- Change `PORT` in `.env` to a different number
- Or kill the process: `lsof -ti:4000 | xargs kill`

**"500 Internal Server Error"**
- Check server logs in terminal
- Verify database tables exist: `supabase db reset`
- Check `.env` configuration

**Frontend not loading**
- Check server is running on port 4000
- Verify API endpoints are accessible
- Check browser console for errors

---

## Technology Stack Details

### Frontend
- **React 18.3+** - UI library
- **TypeScript 5+** - Type safety
- **Vite 5+** - Build tool and dev server
- **Tailwind CSS 3+** - Utility-first CSS
- **Lucide React** - Icon library
- **@tanstack/react-virtual** - Virtual scrolling for performance
- **TanStack Query** - Data fetching and caching
- **Vitest** - Component and unit testing

### Backend
- **Node.js 20+** - Runtime
- **Express 4+** - Web framework
- **TypeScript 5+** - Type safety
- **Supabase JS** - Database client
- **OpenAI SDK** - AI integration

### Database
- **PostgreSQL** (via Supabase)
- **Row Level Security** for data isolation
- **Vector extensions** for embeddings
- **Full-text search** capabilities

### AI & ML
- **OpenAI GPT-4** - Chat and content generation
- **OpenAI Embeddings** - Semantic search vectors
- **Whisper API** - Voice transcription
- **DiceBear API** - Character avatar generation

### DevOps
- **GitHub Actions** - CI/CD
- **Vitest** - Testing framework
- **Playwright** - E2E testing
- **ESLint + Prettier** - Code quality

---

## Security & Privacy

- **Authentication**: Supabase Auth with email/password and OAuth
- **Data Isolation**: Row Level Security ensures users only see their data
- **API Security**: All endpoints require authentication
- **Encryption**: Data encrypted at rest and in transit
- **Privacy**: Your data is yours - we don't sell or share it

---

## Performance

- **Frontend**: 
  - Code splitting and lazy loading
  - Virtual scrolling for long lists (React Virtual)
  - Skeleton loaders for better perceived performance
  - Debounced API calls to reduce server load
  - Optimized bundle sizes with Vite
- **Backend**: 
  - Multi-level caching (memory + database)
  - Batch database queries (eliminated N+1 problems)
  - Rule-based extraction (no API calls for common operations)
  - Parallel query execution (Promise.all)
  - Discrete math operations for efficiency
- **Database**: Indexed queries, optimized schemas, composite indexes
- **Search**: Vector indexes for fast semantic search (cached embeddings)

---

## Cost & Performance

### Cost Optimization Strategy
- **Rule-Based Extraction**: Tags, facts, entities, dates extracted using pattern matching (FREE)
- **Aggressive Caching**: Multi-level caching (memory + database) for embeddings, facts, RAG packets, insights
- **Batch Operations**: Eliminated N+1 queries, parallel database operations
- **Smart API Usage**: API calls only when rule-based extraction insufficient
- **Estimated Savings**: ~$8-10/month in API costs eliminated

### Performance Optimizations

**Speed Improvements:**
- **Character List**: 2-5s → 200ms (10-25x faster) - Eliminated N+1 queries
- **RAG Packets**: 500ms-5s → 10-50ms (50-100x faster) - Aggressive caching
- **Chapter Insights**: 2-5s → 50ms (40-100x faster) - Entry count invalidation
- **Memoir Generation**: 500ms → 10ms (50x faster) - Content hash caching
- **Tag Extraction**: 500ms → 10ms (50x faster) - Rule-based + caching
- **Entity Detection**: 500ms → 10ms (50x faster) - Pattern matching first
- **Timeline Hierarchy**: 300ms → 100ms (3x faster) - Parallel queries
- **Auto-Tagging**: 500ms → 10ms (50x faster) - Rule-based extraction

**Overall Impact:**
- **10-100x faster** operations across the board
- **O(1) lookups** using discrete math operations
- **Zero API calls** for common operations (rule-based extraction)
- **Efficient Algorithms**: Set theory, boolean algebra, hashing for optimal performance
- **Database Indexes**: Composite indexes for fast fact queries and verification

---

## Roadmap

### Current Features (v0.1.0)
- ✅ **Automatic Biography Generation** ⭐ - Your biography writes itself from journal entries
- ✅ **Automatic Timeline Creation** ⭐ - Your timeline builds itself automatically from journal entries
- ✅ **Multi-Persona AI Chat** ⭐ - Gossip Buddy, Therapist, Biography Writer, Soul Capturer, Strategist, Memory Bank
- ✅ **Soul Profile & Essence Tracking** ⭐ - Automatically extracts and tracks your hopes, dreams, fears, strengths, weaknesses, skills, values, traits, and relationship patterns. Dynamically evolves with every conversation.
- ✅ Journal entries with AI assistance (full CRUD)
- ✅ Rule-based tag suggestions (cost-optimized, cached)
- ✅ Voice memo recording and transcription (OpenAI Whisper)
- ✅ Character and relationship tracking (optimized batch queries, relationship graphs)
- ✅ Auto-generated character avatars (DiceBear API)
- ✅ Timeline visualization with multiple view modes (graph, cards, chapters, overview)
- ✅ Biography editor (chatbot-style) for refining auto-generated content
- ✅ Discovery Hub with 8 analytical panels (Identity, Characters, Saga, Fabric, Insights, Autopilot, **Soul Profile**, Truth)
- ✅ **Enhanced Chat Features**: Slash commands (`/soul`, `/locations`, `/help`), message actions (copy, regenerate, edit, delete), clickable sources
- ✅ Truth Seeker & Fact Checking system (cost-optimized, rule-based)
- ✅ Memory Explorer with semantic search (HQI)
- ✅ Task Engine with Microsoft To-Do integration
- ✅ Autopilot strategic guidance (daily/weekly/monthly)
- ✅ Location tracking with visit history
- ✅ Chapter management with AI summaries
- ✅ Lore Book reading interface
- ✅ Privacy & Security features (data export, account deletion)
- ✅ Terms of Service acceptance system
- ✅ Subscription management
- ✅ Onboarding wizard
- ✅ Keyboard shortcuts (Cmd+K, Cmd+N, Ctrl/Cmd + 1-9)
- ✅ Accessibility features (ARIA labels, skip links)
- ✅ Virtual scrolling for performance
- ✅ Skeleton loaders for better UX
- ✅ Frontend component tests
- ✅ **Cost Optimizations**: Rule-based extraction, aggressive caching, batch queries
- ✅ **Performance Optimizations**: 10-100x faster operations, eliminated N+1 queries

### Planned Features (Digital Immortality Roadmap)
- 🔄 **Emotional Depth**: Enhanced mood/emotion tracking with sentiment analysis
- 🔄 **Values & Beliefs System**: Explicitly capture and track your core values and how they evolve
- 🔄 **Dreams & Aspirations**: Dedicated tracking of goals, dreams, and life aspirations
- 🔄 **Legacy Builder**: Tools to create messages, wisdom, and guidance for future generations
- 🔄 **Personality Profiling**: AI-powered personality analysis and trait tracking over time
- 🔄 **Photo Gallery**: Visual memories with emotional context
- 🔄 **Voice & Video**: Capture your voice, mannerisms, and speaking patterns
- 🔄 **External Platform Imports**: Import from GitHub, Instagram, X/Twitter to capture your digital footprint
- 🔄 **Mobile App**: Capture moments as they happen, anywhere
- 🔄 **Export Formats**: Export to PDF/eBook, structured JSON for AI systems, or custom formats
- 🔄 **Collaborative Memories**: Let others contribute memories about you
- 🔄 **Advanced Analytics**: Deep insights into your patterns, growth, and essence
- 🔄 **AI Personality Training**: Train AI models on your complete data for future digital immortality

---

## FAQ

### General Questions

**Q: Do I need to be a good writer to use LoreBook?**  
A: No! LoreBook is designed for everyone. Just write naturally about your life—the AI handles the rest. Your biography and timeline write themselves automatically.

**Q: How automatic is it really?**  
A: Very automatic! When you create a journal entry:
- Facts are automatically extracted
- Timeline structure is automatically updated
- Biography sections are automatically generated
- Relationships are automatically detected
- Truth verification happens automatically

You can refine and edit everything, but the heavy lifting is done for you.

**Q: What about my privacy?**  
A: Your data is yours. We use:
- Row-level security ensuring complete data isolation
- End-to-end encryption (TLS 1.3 in transit, AES-256 at rest)
- No data selling or third-party sharing
- GDPR-compliant data export
- Account deletion removes all data permanently

**Q: Can I export my data?**  
A: Yes! You can export all your data in JSON format (GDPR compliant). Future export formats include PDF, eBook, and structured formats for AI systems.

**Q: How much does it cost?**  
A: LoreBook is cost-optimized with rule-based extraction and aggressive caching, eliminating most API costs. The core operations are free—no expensive API calls for common tasks.

### Technical Questions

**Q: What are the different personas/roles LoreBook can be?**  
A: LoreBook seamlessly blends six personas based on context:
- **Gossip Buddy**: For discussing characters, relationships, and social dynamics
- **Therapist**: For emotional support and processing experiences
- **Biography Writer**: For shaping compelling life stories and structuring narratives
- **Soul Capturer**: For identifying and tracking your core essence (hopes, dreams, fears, strengths, values)
- **Strategist**: For goal-oriented planning and actionable insights
- **Memory Bank**: For remembering everything and answering questions

The AI automatically adapts—emotional topics trigger Therapist mode, goal-setting triggers Strategist, character talk triggers Gossip Buddy, story editing triggers Biography Writer, deep reflection triggers Soul Capturer, etc.

**Q: What is the Soul Profile feature?**  
A: The Soul Profile automatically extracts and tracks your psychological essence from conversations:
- **Hopes & Dreams**: Your aspirations and ideal scenarios
- **Fears**: Your anxieties and concerns
- **Strengths**: Your core competencies and positive traits
- **Weaknesses**: Areas for growth and challenges
- **Top Skills**: Technical abilities and talents (with confidence scores)
- **Core Values**: What matters most to you
- **Personality Traits**: Your character attributes
- **Relationship Patterns**: How you interact with others

The profile **dynamically evolves** with every conversation—LoreBook learns more about you over time and tracks how you change. View it in Discovery Hub → Soul Profile panel or use `/soul` command in chat.

**Q: How does automatic biography generation work?**  
A: LoreBook analyzes your journal entries, extracts themes and stories, and uses AI to transform them into polished biography sections. You can refine through a chatbot-style editor.

**Q: How does automatic timeline creation work?**  
A: AI analyzes your entries to detect themes, relationships, and patterns, then automatically organizes them into a 9-layer hierarchy (Mythos → Epochs → Eras → Sagas → Arcs → Chapters → Scenes → Actions → MicroActions).

**Q: What is digital immortality?**  
A: Digital immortality means preserving your complete essence—story, heart, mind, soul—in a structured format that future AI systems can use to continue your story, share your wisdom, and keep you connected to loved ones.

**Q: How fast is it?**  
A: Very fast! Through optimizations:
- Character list: 2-5s → 200ms (10-25x faster)
- RAG packets: 500ms-5s → 10-50ms (50-100x faster)
- Tag extraction: 500ms → 10ms (50x faster)
- Most operations are 10-100x faster than before

**Q: What technologies does LoreBook use?**  
A: 
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **Backend**: Node.js, Express, TypeScript
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **AI**: OpenAI GPT-4 for chat and content generation
- **Search**: Vector embeddings for semantic search

### Feature Questions

**Q: Can I import data from other journaling apps?**  
A: Currently, you can export your data in JSON format. Import features for other platforms are planned (see Roadmap).

**Q: Can others contribute to my journal?**  
A: Currently, it's private to you. Collaborative memories (letting others contribute) are planned for the future.

**Q: Does it work offline?**  
A: Currently, LoreBook requires an internet connection. Offline support is planned for future releases.

**Q: Can I use it on mobile?**  
A: The web app works on mobile browsers. A dedicated mobile app is planned (see Roadmap).

**Q: How does truth verification work?**  
A: Every entry is automatically checked against existing facts using:
- Rule-based fact extraction (no API calls)
- Discrete math (set theory, boolean algebra) for contradiction detection
- Database queries for evidence tracking
- Automatic flagging of contradictions for your review

---

## License

**Private** - Omega Technologies

All rights reserved. This software is proprietary and confidential.

---

## Support

- **Documentation**: Check the `/docs` folder and markdown files
- **Issues**: Open an issue on GitHub
- **Questions**: Check existing documentation first

---

<div align="center">
  <p>Built with ❤️ by <strong>Omega Technologies</strong></p>
  <p><em>Understand your past, navigate your present, predict your future. An AI Life Engine that remembers you, studies your identity, and preserves your evolving digital self.</em></p>
  <p>
    <strong>Ready to start?</strong> 
    <a href="#getting-started">Get Started</a> • 
    <a href="#contributing">Contribute</a> • 
    <a href="#faq">FAQ</a>
  </p>
</div>
ted</a> • 
    <a href="#contributing">Contribute</a> • 
    <a href="#faq">FAQ</a>
  </p>
</div>
