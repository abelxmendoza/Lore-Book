# LORE-KEEPER PRIVACY, SCOPE & MEMORY OWNERSHIP ENGINE

## Overview

The **Privacy, Scope & Memory Ownership Engine** enforces ownership, visibility, retention, and access boundaries across **ALL Lore-Keeper subsystems**. The user owns all memory, privacy is explicit, scope applies before intelligence, deletion is respected system-wide, and the chatbot only sees what scope allows.

## Core Principles

1. **The user owns all memory**
2. **Privacy is explicit, not inferred**
3. **Scope applies BEFORE intelligence**
4. **Deletion is respected system-wide**
5. **Chatbot only sees what scope allows**

## Memory Scope Model

### Scope Types

- **PRIVATE**: Only visible to the owner, default scope
- **SHARED**: Explicitly shared with others
- **ANONYMOUS**: De-identified data
- **ARCHIVED**: Inactive but retained
- **DELETED**: Tombstoned, non-recoverable

### Scoped Resources

Every resource in Lore-Keeper has a scope:
- **Resource Type**: CLAIM, DECISION, INSIGHT, PREDICTION, GOAL, VALUE, EVENT, ENTITY, RELATIONSHIP, OUTCOME, SIGNAL, SNAPSHOT
- **Resource ID**: ID of the resource
- **Scope ID**: Reference to memory scope
- **Owner User ID**: User who owns the resource

## Access Control Rules

### Access Logic

1. **DELETED resources**: Never accessible
2. **Owner access**: Owner can always access (except DELETED)
3. **Non-owner access**: Only SHARED resources are accessible
4. **Default scope**: PRIVATE (owner only)

### Enforcement

Scope is enforced:
- **Before queries**: Filter by scope before returning results
- **In chatbot**: Only visible resources are used
- **In exports**: Only non-DELETED resources are exported
- **In propagation**: Deletion propagates to dependent resources

## API Endpoints

### PATCH `/api/privacy/scope`
Update resource scope.

**Request:**
```json
{
  "resource_type": "CLAIM",
  "resource_id": "claim-1",
  "scope_type": "SHARED"
}
```

**Response:**
```json
{
  "scoped_resource": {
    "id": "scoped-1",
    "resource_type": "CLAIM",
    "resource_id": "claim-1",
    "scope_type": "SHARED",
    "updated_at": "2025-01-02T12:00:00Z"
  }
}
```

### DELETE `/api/privacy/resources/:resource_type/:resource_id`
Delete resource (hard deletion).

**Response:**
```json
{
  "success": true,
  "message": "Resource deleted permanently"
}
```

### POST `/api/privacy/resources/:resource_type/:resource_id/archive`
Archive resource (soft retention).

**Response:**
```json
{
  "scoped_resource": {
    "id": "scoped-1",
    "scope_type": "ARCHIVED"
  }
}
```

### GET `/api/privacy/chat-visible`
Get chat-visible state (enforces scope).

**Response:**
```json
{
  "visible_state": {
    "claims": [ ... ],
    "insights": [ ... ],
    "decisions": [ ... ],
    "predictions": [ ... ],
    "goals": [ ... ],
    "values": [ ... ],
    "entities": [ ... ]
  }
}
```

### GET `/api/privacy/export`
Export user data.

**Response:**
```json
{
  "claims": [ ... ],
  "decisions": [ ... ],
  "outcomes": [ ... ],
  "goals": [ ... ],
  "values": [ ... ],
  "insights": [ ... ],
  "predictions": [ ... ],
  "scopes": [ ... ],
  "exported_at": "2025-01-02T12:00:00Z"
}
```

### GET `/api/privacy/access/:resource_type/:resource_id`
Check access to resource.

**Response:**
```json
{
  "allowed": true,
  "reason": "User is the owner"
}
```

## Chatbot Visibility Gate

The chatbot only sees resources that:
1. Are owned by the user
2. Have scope PRIVATE or SHARED (not DELETED, not ARCHIVED for chat)
3. Pass access control checks

**Implementation:**
- `getChatVisibleState()` filters all resources by scope
- Chat responses only use visible resources
- Scope is enforced before any intelligence processing

## Deletion & Forgetting (Hard)

When a resource is deleted:
1. **Mark as DELETED**: Update scope to DELETED
2. **Propagate deletion**: Remove from dependent resources
3. **Record event**: Log deletion in continuity layer
4. **No recovery**: DELETED resources are non-recoverable

**Propagation:**
- Remove from insights (if only reference)
- Remove from predictions (if only reference)
- Remove from goal signals
- Remove from chat context
- Note: Embeddings may remain but are filtered in queries

## Export & Portability

Export includes:
- All non-DELETED resources
- All scope assignments
- Complete data for portability

**Format:**
- JSON export with all resource types
- Includes scope information
- Timestamp of export

## Archiving (Soft Retention)

Archiving:
- Changes scope to ARCHIVED
- Resource is retained but inactive
- Not visible in chat by default
- Can be restored by changing scope

## UI Contract

### Scope Display
- **Every memory shows its scope**: Visible scope badge
- **Users can change scope**: At any time
- **Delete means delete**: No shadow use
- **Chat respects scope**: Silently filters

### Scope Management
- **Default**: PRIVATE
- **Changeable**: Users can change scope anytime
- **Deletable**: Hard deletion, no recovery
- **Archivable**: Soft retention option

### Export
- **One-click**: Simple export button
- **Complete**: All non-DELETED data
- **Portable**: Standard JSON format

## Integration

The Privacy & Scope Engine integrates with:
- **ALL SUBSYSTEMS**: Enforces scope across all systems
- **CONVERSATIONAL ORCHESTRATION**: Filters chat-visible resources
- **CONTINUITY LAYER**: Records deletion events
- **OMEGA MEMORY ENGINE**: Scopes claims and entities
- **DECISION MEMORY ENGINE**: Scopes decisions
- **INSIGHT ENGINE**: Scopes insights
- **PREDICTIVE CONTINUITY**: Scopes predictions
- **GOAL TRACKING**: Scopes goals and values

## Example Workflows

### Setting Scope
```
1. User creates claim
2. Scope defaults to PRIVATE
3. User can change to SHARED
4. Chatbot only sees if scope allows
```

### Deleting Resource
```
1. User deletes claim
2. Scope set to DELETED
3. Propagation removes from insights/predictions
4. Continuity event recorded
5. Resource no longer accessible
```

### Chat Visibility
```
1. User asks question
2. getChatVisibleState() filters resources
3. Only PRIVATE/SHARED resources used
4. DELETED/ARCHIVED resources excluded
5. Response generated from visible resources only
```

## Design Principles

1. **User Ownership**: User owns all memory
2. **Explicit Privacy**: Privacy is explicit, not inferred
3. **Scope First**: Scope applies before intelligence
4. **Respect Deletion**: Deletion is respected system-wide
5. **Chat Filtering**: Chatbot only sees what scope allows

## Security Considerations

1. **RLS Policies**: Row-level security enforces ownership
2. **Access Control**: CanAccess checks before any operation
3. **Scope Enforcement**: Applied at query level
4. **Deletion Propagation**: Ensures complete removal
5. **Export Security**: Only owner can export their data

## Future Enhancements

1. **Granular Sharing**: Share specific resources with specific users
2. **Time-based Scopes**: Auto-archive after time period
3. **Scope Templates**: Pre-defined scope configurations
4. **Bulk Operations**: Change scope for multiple resources
5. **Scope Analytics**: Statistics on scope usage
6. **Compliance Tools**: GDPR, CCPA compliance features

---

**Status**: ✅ Core implementation complete
**Version**: 1.0.0
**Last Updated**: 2025-01-02

