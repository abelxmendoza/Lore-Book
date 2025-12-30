# Lorebook Therapist Layer — Blueprint Contract

## SYSTEM GOAL
Implement a therapist-grade reflective layer that tracks:
- lived experience
- perceived information (gossip / beliefs)
- personal reactions

WITHOUT:
- diagnosing
- asserting objective truth about others
- moralizing or giving advice

The system must enforce:
**Event → Perception → Reaction → Outcome**
as a relationship model, not a narrative rewrite.

---

## CORE PRINCIPLES (NON-NEGOTIABLE)

1. **Lorebook stores user perception, not objective truth about others.**
2. **Other people do NOT own timelines by default.**
3. **Reactions are responses, not facts.**
4. **Patterns surface as questions, never conclusions.**
5. **AI assists with structure, never judgment.**

---

## DATA MODEL (AUTHORITATIVE)

### 1. journal_entries (EXISTING)
Represents lived experiences only.

**Rules:**
- ✅ Can anchor timelines
- ✅ Can trigger reactions
- ❌ Cannot store gossip or secondhand info

---

### 2. perception_entries (FIRST-CLASS)

**Purpose:**
Stores secondhand info, beliefs, rumors, assumptions, and interpretations.

**Schema:**
```sql
perception_entries (
  id UUID PK,
  user_id UUID,

  subject_person_id UUID NULL,
  subject_alias TEXT NOT NULL,

  content TEXT NOT NULL,

  source ENUM(
    'overheard',
    'told_by',
    'rumor',
    'social_media',
    'intuition',
    'assumption'
  ) NOT NULL,

  source_detail TEXT NULL,

  confidence_level NUMERIC(3,2) DEFAULT 0.3 CHECK (0 <= confidence_level <= 1),

  sentiment ENUM('negative','neutral','positive','mixed'),

  timestamp_heard TIMESTAMPTZ NOT NULL,

  related_memory_id UUID NULL REFERENCES journal_entries(id),

  status ENUM(
    'unverified',
    'confirmed',
    'disproven',
    'retracted'
  ) DEFAULT 'unverified',

  resolution_note TEXT NULL,

  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

**Rules:**
- ❌ Cannot anchor timelines
- ✅ Must belong to user timelines only
- ✅ Confidence defaults LOW (0.3)
- ✅ Status must be explicit

---

### 3. reaction_entries (FIRST-CLASS)

**Purpose:**
Stores emotional / behavioral / cognitive responses to memories or perceptions.

**Schema:**
```sql
reaction_entries (
  id UUID PK,
  user_id UUID,

  trigger_type ENUM('memory','perception') NOT NULL,
  trigger_id UUID NOT NULL,

  reaction_type ENUM(
    'emotional',
    'behavioral',
    'cognitive',
    'physical'
  ) NOT NULL,

  reaction_label TEXT NOT NULL,
  -- e.g. anxiety, anger, avoidance, rumination, shutdown

  intensity NUMERIC(3,2) CHECK (0 <= intensity <= 1),

  duration TEXT NULL,

  automatic BOOLEAN DEFAULT TRUE,

  coping_response TEXT NULL,

  timestamp_started TIMESTAMPTZ NOT NULL,
  timestamp_resolved TIMESTAMPTZ NULL,

  created_at TIMESTAMPTZ
)
```

**Validation:**
- ✅ trigger_id must exist
- ✅ reactions cannot exist without a trigger
- ✅ reactions never stand alone

---

### 4. people (THIN ENTITY)

**Purpose:**
Context only, not truth owners.

**Schema:**
```sql
people (
  id UUID PK,
  user_id UUID,

  display_name TEXT NOT NULL,
  alias TEXT NULL,

  relationship_to_user TEXT,
  sensitivity ENUM('public','private','sensitive') DEFAULT 'private',

  first_appearance TIMESTAMPTZ,
  last_interaction TIMESTAMPTZ,

  created_at TIMESTAMPTZ
)
```

**Rules:**
- ❌ No timelines owned by people
- ❌ No lore arcs by default
- ✅ Only linked via memories or perceptions

---

## SERVICES (REQUIRED)

### ReactionService

**CRUD reactions**
- ✅ Create, Read, Update, Delete

**Validate trigger existence**
- ✅ Validates trigger_id exists before creating reaction

**Aggregate patterns:**
- ✅ Most common reaction types
- ✅ Average intensity
- ✅ Duration trends
- ✅ Triggers per timeline

**Must NOT:**
- ❌ Infer diagnosis
- ❌ Suggest coping strategies
- ❌ Rank reactions as good/bad

### PerceptionService

**CRUD perceptions**
- ✅ Create, Read, Update, Delete

**Confidence + status management**
- ✅ Default confidence 0.3 (low)
- ✅ Status tracking (unverified, confirmed, disproven, retracted)

**Resolution tracking**
- ✅ Resolution notes
- ✅ Evolution tracking

**Belief evolution (time-based changes)**
- ✅ Original content preservation
- ✅ Evolution notes array

---

## FRONTEND COMPONENTS (REQUIRED)

### ReactionChip
- ✅ Color-coded by reaction_label
- ✅ Intensity visualization
- ✅ Transient styling (secondary visual weight)

### ReactionForm
- ✅ Trigger-aware
- ✅ Forces reaction_type + label
- ✅ Optional coping_response
- ❌ No diagnostic language

### ReactionList
- ✅ Grouped by trigger
- ✅ Shows duration + resolution state

### ReflectiveView (THERAPIST MODE)

**Purpose:**
Surface patterns safely.

**Shows:**
- ✅ "This perception triggered anxiety 7 times"
- ✅ Reaction distributions
- ✅ Intensity trends over time

**Asks:**
- ✅ "Does this feel accurate?"
- ✅ "What do you notice about this pattern?"

**Never:**
- ❌ Diagnoses
- ❌ Gives advice
- ❌ Labels personality traits

---

## UI RULES (PSYCHOLOGICAL SAFETY)

**Memories:** solid, grounded
**Perceptions:** muted, unstable
**Reactions:** flowing, transient

**Badges:**
- ✅ "Unverified"
- ✅ "Belief at the time"
- ✅ "Retracted"

**Language:**
- ✅ Always first-person framing
- ❌ No objective claims about others

---

## AI ASSIST RULES

**AI MAY:**
- ✅ Classify entry type
- ✅ Ask clarifying questions
- ✅ Surface repeated patterns

**AI MUST NOT:**
- ❌ Diagnose
- ❌ Moralize
- ❌ Promote perception → fact
- ❌ Rewrite user memory

**Default AI stance:**
"Reflective mirror, not authority."

---

## HARD RED LINES (ENFORCED)

1. ❌ **No objective claims about others without perception framing**
2. ❌ **No people-owned timelines unless explicitly fictional**
3. ❌ **No automatic truth promotion**
4. ❌ **No emotional scoring or health labels**

---

## SYSTEM MANTRA (PIN THIS)

> **"Lorebook records how I experienced and interpreted my life — not the objective truth of others."**

---

## IMPLEMENTATION STATUS

### ✅ Completed
- [x] reaction_entries table migration
- [x] ReactionService with pattern analysis
- [x] ReactionChip component
- [x] ReactionForm component
- [x] ReactionList component
- [x] ReflectiveView (Therapist Mode)
- [x] Integration into MemoryDetailModal
- [x] Integration into PerceptionDetailModal
- [x] perception_entries system (from previous work)
- [x] API routes for reactions
- [x] Frontend API client

### 🔄 To Verify
- [ ] Timeline validation prevents perceptions from anchoring
- [ ] People table has sensitivity flags
- [ ] AI prompts enforce non-diagnostic language
- [ ] All UI copy uses first-person framing

### 📋 Future Enhancements
- [ ] Timeline relationship validation
- [ ] AI pattern detection with question-based prompts
- [ ] Cool-down review reminders for high-emotion entries
- [ ] Advanced pattern visualization
