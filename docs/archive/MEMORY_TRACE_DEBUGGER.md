# Memory Trace Debugger

## Overview

The Memory Trace Debugger reconstructs the full lineage of how chat messages become structured memory and influence behavior. It shows the complete flow from raw language to memory artifacts to events.

## Trace Flow

```
chat_message
  ↓
conversation_message (normalized)
  ↓
utterances (sentence-level splits)
  ↓
extracted_units (semantic units: EXPERIENCE, PERCEPTION, FEELING, THOUGHT)
  ↓
memory_artifacts (perception_entries, journal_entries, insights)
  ↓
resolved_events (multi-utterance synthesis)
  ↓
(future: actions, rewards)
```

## API Endpoints

### 1. Trace from Chat Message

**GET** `/api/conversation/trace/chat/:chatMessageId`

Reconstructs the full forward trace from a chat message.

**Example:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://api.lorekeeper.com/api/conversation/trace/chat/123e4567-e89b-12d3-a456-426614174000
```

**Response:**
```json
{
  "success": true,
  "trace": {
    "root": {
      "id": "chat-msg-id",
      "type": "chat_message",
      "content": "I get disrespected for not working outside my hands by my family",
      "timestamp": "2024-01-15T10:30:00Z",
      "children": [
        {
          "id": "conv-msg-id",
          "type": "conversation_message",
          "content": "I get disrespected for not working outside my hands by my family",
          "children": [
            {
              "id": "utterance-id",
              "type": "utterance",
              "content": "I get disrespected for not working outside my hands by my family",
              "children": [
                {
                  "id": "unit-id",
                  "type": "extracted_unit",
                  "content": "I get disrespected for not working outside my hands by my family",
                  "confidence": 0.8,
                  "metadata": {
                    "unit_type": "PERCEPTION"
                  },
                  "children": [
                    {
                      "id": "perception-id",
                      "type": "perception_entry",
                      "content": "I believe my family disrespects me for not working with my hands",
                      "confidence": 0.4,
                      "metadata": {
                        "subject_alias": "my family",
                        "source": "intuition"
                      },
                      "children": []
                    },
                    {
                      "id": "journal-id",
                      "type": "journal_entry",
                      "content": "I get disrespected for not working outside my hands by my family",
                      "metadata": {
                        "tags": ["ongoing", "family", "work"],
                        "temporal_scope": "ONGOING"
                      },
                      "children": []
                    },
                    {
                      "id": "insight-id",
                      "type": "insight",
                      "content": "Feeling disrespected by family",
                      "metadata": {
                        "category": "emotional_state",
                        "intensity": "medium"
                      },
                      "children": []
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    "depth": 5,
    "totalNodes": 6,
    "tracePath": ["chat-msg-id", "conv-msg-id", "utterance-id", "unit-id", "perception-id", "journal-id"],
    "summary": {
      "chatMessages": 1,
      "utterances": 1,
      "extractedUnits": 1,
      "memoryArtifacts": 3,
      "events": 0
    }
  }
}
```

### 2. Reverse Trace from Memory Artifact

**GET** `/api/conversation/trace/memory/:artifactType/:artifactId`

Reconstructs the backward trace from a memory artifact to its source chat message.

**Artifact Types:**
- `perception_entry`
- `journal_entry`
- `insight`

**Example:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://api.lorekeeper.com/api/conversation/trace/memory/journal_entry/123e4567-e89b-12d3-a456-426614174000
```

**Response:**
```json
{
  "success": true,
  "trace": {
    "root": {
      "id": "journal-id",
      "type": "journal_entry",
      "content": "I get disrespected for not working outside my hands by my family",
      "timestamp": "2024-01-15T10:30:00Z",
      "children": [
        {
          "id": "unit-id",
          "type": "extracted_unit",
          "content": "I get disrespected for not working outside my hands by my family",
          "children": [
            {
              "id": "utterance-id",
              "type": "utterance",
              "content": "I get disrespected for not working outside my hands by my family",
              "children": [
                {
                  "id": "conv-msg-id",
                  "type": "conversation_message",
                  "content": "I get disrespected for not working outside my hands by my family",
                  "children": [
                    {
                      "id": "chat-msg-id",
                      "type": "chat_message",
                      "content": "I get disrespected for not working outside my hands by my family",
                      "children": []
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    "depth": 5,
    "totalNodes": 5,
    "tracePath": ["journal-id", "unit-id", "utterance-id", "conv-msg-id", "chat-msg-id"],
    "summary": {
      "chatMessages": 1,
      "utterances": 1,
      "extractedUnits": 1,
      "memoryArtifacts": 1,
      "events": 0
    }
  }
}
```

### 3. Trace from Extracted Unit

**GET** `/api/conversation/trace/unit/:unitId`

Shows how a semantic unit became memory artifacts, plus backward trace to utterance/conversation.

**Example:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://api.lorekeeper.com/api/conversation/trace/unit/123e4567-e89b-12d3-a456-426614174000
```

## Use Cases

### 1. Debug Memory Formation
"Why didn't my chat message create a journal entry?"
- Use trace from chat message
- Check if utterance was created
- Check if semantic unit was extracted
- Check if conversion service was called
- Verify metadata links are correct

### 2. Verify Lineage
"Where did this journal entry come from?"
- Use reverse trace from journal entry
- Follow back to original chat message
- Verify the full chain is intact

### 3. Understand Semantic Extraction
"How was this sentence interpreted?"
- Use trace from extracted unit
- See all memory artifacts created from one unit
- Understand how PERCEPTION vs EXPERIENCE vs FEELING were handled

### 4. Audit Conversion Logic
"Is the conversion service working correctly?"
- Trace from chat message
- Verify PERCEPTION units → perception_entries
- Verify EXPERIENCE units → journal_entries
- Verify FEELING/THOUGHT units → insights

## Trace Node Types

- **chat_message**: Raw user message from chat interface
- **conversation_message**: Normalized message in conversation_messages table
- **utterance**: Sentence-level split from message
- **extracted_unit**: Semantic unit (EXPERIENCE, PERCEPTION, FEELING, THOUGHT, etc.)
- **perception_entry**: Belief/interpretation stored in perception_entries
- **journal_entry**: Experience stored in journal_entries
- **insight**: Emotional/cognitive marker stored in insights
- **knowledge_unit**: Epistemic classification
- **resolved_event**: Multi-utterance event synthesis
- **action**: (Future) Action taken based on memory
- **reward**: (Future) Reward signal from RL

## Implementation Details

### Service Location
`apps/server/src/services/conversationCentered/memoryTraceService.ts`

### Key Methods
- `traceFromChatMessage()`: Forward trace from chat
- `traceFromMemoryArtifact()`: Reverse trace from memory
- `traceFromExtractedUnit()`: Bidirectional trace from unit

### Performance
- Uses efficient JSONB queries for metadata lookups
- Filters at database level (not in-memory)
- Limits event queries to prevent large result sets

### Error Handling
- Returns `null` if trace not found (404 in API)
- Logs errors but doesn't throw (graceful degradation)
- Handles missing links gracefully (partial traces)

## Future Enhancements

1. **Action/Reward Tracing**: Link memory artifacts to RL actions and rewards
2. **Visualization**: Graph view of trace tree
3. **Batch Tracing**: Trace multiple messages at once
4. **Trace Comparison**: Compare two traces side-by-side
5. **Trace Metrics**: Aggregate statistics across traces
6. **Trace Export**: Export trace as JSON/GraphML for external tools

## Example: Full Trace for "I get disrespected..."

```
chat_message: "I get disrespected for not working outside my hands by my family"
  ↓
conversation_message: (normalized)
  ↓
utterance: "I get disrespected for not working outside my hands by my family"
  ↓
extracted_unit: {
  type: "PERCEPTION",
  content: "I get disrespected for not working outside my hands by my family",
  confidence: 0.8
}
  ↓
perception_entry: {
  subject_alias: "my family",
  content: "I believe my family disrespects me for not working with my hands",
  confidence_level: 0.4,
  source: "intuition"
}
  ↓
journal_entry: {
  content: "I get disrespected for not working outside my hands by my family",
  tags: ["ongoing", "family", "work"],
  temporal_scope: "ONGOING"
}
  ↓
insight: {
  category: "emotional_state",
  content: "Feeling disrespected by family",
  intensity: "medium"
}
```

This shows how one sentence becomes three distinct memory artifacts, each serving a different purpose in the cognitive architecture.
