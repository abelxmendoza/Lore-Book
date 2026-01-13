# Entity Scopes & Relationship Detection Implementation

## Overview

This implementation adds entity scoping and relationship detection to LoreKeeper, enabling the system to:
- Track what context/scope entities belong to (e.g., "recruiting", "employment", "vendor")
- Detect relationships between entities (e.g., "works_for", "recruits_for", "vendor_for")
- Group related entities together automatically
- Resolve ambiguous entity references using scope context

## Problem Solved

**Before**: When you mentioned "Sam from Mach Industries", the system couldn't distinguish that:
- Sam actually works for "Strativ Group" (also known as "People 2.0")
- Strativ Group recruits for Mach Industries
- Sam is not directly from Mach Industries

**After**: The system now:
- Detects that Sam works for Strativ Group
- Detects that Strativ Group recruits for Mach Industries
- Groups all three entities in the "recruiting" scope
- Correctly resolves "Sam from Mach Industries" as "Sam (Strativ Group) → recruits_for → Mach Industries"

## Architecture

### Database Schema

#### `entity_scopes`
Tracks what context/scope an entity belongs to:
- `entity_id` + `entity_type` (polymorphic: can be `omega_entity` or `character`)
- `scope` (e.g., "recruiting", "employment", "vendor")
- `scope_context` (optional additional context)
- `confidence` (0.0-1.0)
- `evidence_count` (how many times this scope was observed)

#### `entity_relationships`
Tracks relationships between entities:
- `from_entity_id` + `from_entity_type` → `to_entity_id` + `to_entity_type`
- `relationship_type` (works_for, recruits_for, vendor_for, etc.)
- `scope` (context where this relationship exists)
- `confidence` (0.0-1.0)
- `evidence_count` (how many times this relationship was observed)
- `evidence_source_ids` (array of message/journal entry IDs)

#### `entity_scope_groups`
Groups entities that share the same scope:
- `scope` + `scope_context`
- `entity_ids[]` + `entity_types[]` (arrays of entities in this group)
- `confidence` and `evidence_count`

### Services

#### `EntityRelationshipDetector`
- **Purpose**: Detects relationships and scopes from conversational context using LLM
- **Key Methods**:
  - `detectRelationshipsAndScopes()`: Analyzes message to find relationships and scopes
  - `saveRelationship()`: Persists detected relationships
  - `saveScope()`: Persists detected scopes
  - `getEntityRelationships()`: Retrieves all relationships for an entity
  - `getEntityScopes()`: Retrieves all scopes for an entity

#### `EntityScopeService`
- **Purpose**: Manages entity scopes and groups related entities
- **Key Methods**:
  - `addEntityToScopeGroup()`: Adds entity to a scope group (creates if doesn't exist)
  - `getScopeGroup()`: Gets all entities in a scope
  - `getEntitiesInScope()`: Gets entity IDs in a scope
  - `getEntityScopes()`: Gets all scopes for an entity
  - `resolveEntityWithScope()`: Resolves ambiguous entity references using scope
  - `buildRelationshipChain()`: Builds relationship chain (e.g., Sam → works_for → Strativ Group → recruits_for → Mach Industries)

### Integration Points

#### Ingestion Pipeline
1. **After Entity Extraction** (Step 4.2):
   - Detects relationships and scopes from the full message
   - Saves relationships and scopes
   - Adds entities to scope groups

2. **During Unit Processing** (Step 6.8):
   - Detects relationships between entities mentioned in each semantic unit
   - Saves relationships and scopes for unit-level context

### API Endpoints

#### `GET /api/conversation/entities/:entityId/relationships?entityType=character|omega_entity`
Returns all relationships for an entity, enriched with entity names.

#### `GET /api/conversation/entities/:entityId/scopes?entityType=character|omega_entity`
Returns all scopes for an entity.

#### `GET /api/conversation/scopes/:scope/entities?scopeContext=...`
Returns all entities in a scope.

#### `GET /api/conversation/entities/:entityId/relationship-chain?entityType=character|omega_entity`
Returns the relationship chain for an entity (e.g., Sam → works_for → Strativ Group → recruits_for → Mach Industries).

### UI Updates

#### EntityDetailModal
The "Connections" tab now shows:
1. **Scopes**: Badges showing what contexts the entity belongs to
2. **Relationships**: Cards showing relationships with other entities (works_for, recruits_for, etc.)
3. **Character Connections**: Legacy character relationships (for backward compatibility)

## Example Flow

### Input Message
```
"I've been waiting for a whole month to hear back from Mach Industries. 
I finally received an email from Sam the recruiter and he said he had 
shingles during the holidays and was going to meet with Mach Industries. 
He never got back to me about the meeting and how it went so I'm hoping 
to finally hear back from him on Monday, the 2nd work week of the year."
```

### Processing
1. **Entity Extraction**: Detects "Sam", "Mach Industries", "Strativ Group" (if mentioned)
2. **Relationship Detection**:
   - "Sam" → `works_for` → "Strativ Group" (if context suggests it)
   - "Strativ Group" → `recruits_for` → "Mach Industries"
3. **Scope Detection**:
   - All three entities get `scope: "recruiting"`
4. **Scope Grouping**:
   - Creates/updates `entity_scope_groups` with all three entities in "recruiting" scope

### Result
- Sam is correctly identified as working for Strativ Group
- Strativ Group is linked to Mach Industries via `recruits_for`
- All entities are grouped in the "recruiting" scope
- Future mentions of "Sam from Mach Industries" can be resolved using scope context

## Relationship Types

- `works_for`: Person works for organization
- `recruits_for`: Organization recruits/hires for another organization
- `vendor_for`: Organization provides services to another organization
- `contractor_for`: Organization contracts for another organization
- `hires_for`: Organization hires on behalf of another
- `part_of`: Entity is part of another entity
- `owns`: Entity owns another entity
- `manages`: Entity manages another entity
- `represents`: Entity represents another entity
- `associated_with`: General association

## Scope Types

- `recruiting`: Job recruitment context
- `employment`: Employment/job context
- `vendor`: Vendor/supplier context
- `family`: Family context
- `job_search`: Job search context
- `business`: Business context
- (and more as detected)

## Safety Guarantees

1. **Non-blocking**: Relationship detection failures don't block message ingestion
2. **Confidence-scored**: All relationships and scopes have confidence scores
3. **Evidence-based**: Tracks evidence count and source IDs
4. **Reversible**: Can be updated or removed as more evidence is collected
5. **No entity merging**: Relationships are metadata-only, don't mutate core entities

## Future Enhancements

1. **Relationship confidence decay**: Relationships weaken without reinforcement
2. **Scope-based entity resolution**: Use scopes to disambiguate entity references
3. **Relationship visualization**: Graph view of entity relationships
4. **Scope-aware search**: Filter entities by scope
5. **Automatic scope inference**: Learn new scopes from context
