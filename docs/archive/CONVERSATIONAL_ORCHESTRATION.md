# LORE-KEEPER CONVERSATIONAL ORCHESTRATION LAYER (COL)

## Overview

The **Conversational Orchestration Layer (COL)** makes the chatbot aware of memory, perspective, insights, and uncertainty **WITHOUT hallucination or unauthorized memory mutation**. The chatbot is an interpreter of Lore-Keeper state with strict read/write boundaries.

## Core Concept

**The chatbot is NOT a source of truth.**  
**It is an interpreter of Lore-Keeper state with strict read/write boundaries.**

## Chat Session Context

Tracks conversation state:
- **Active Entity IDs**: Entities currently in focus
- **Active Perspective IDs**: Perspectives being discussed
- **Unresolved MRQ IDs**: Pending memory proposals
- **Recent Insight IDs**: Recently surfaced insights
- **User Intent**: Current user intent (REFLECTION, QUESTION, etc.)

## Response Modes

### FACTUAL_SUMMARY
Grounded in claims with citations:
- Uses only existing claims
- Cites claim IDs
- Shows confidence levels
- No new facts invented

### PERSPECTIVE_SUMMARY
Multiple viewpoints preserved:
- Shows different perspectives
- Highlights disagreements
- Preserves all viewpoints
- No perspective collapse

### INSIGHT_REFLECTION
Observations only:
- Surfaces insights
- Clear disclaimer: "These are observations, not facts"
- Links to insight evidence
- Never asserts new truth

### UNCERTAINTY_NOTICE
Explicit lack of confidence:
- Acknowledges uncertainty
- Doesn't invent answers
- Suggests alternatives
- Honest about limitations

### MRQ_PROMPT
Propose memory change:
- Detects memory change intent
- Creates MRQ proposal
- Queues for review
- Never writes directly

## Intent Classification

### QUESTION
User is asking a factual question:
- Route to `answerQuestion()`
- Use factual summaries
- Cite sources
- Show confidence

### REFLECTION
User wants to reflect on patterns:
- Route to `reflectWithInsights()`
- Surface relevant insights
- Show patterns
- Non-prescriptive

### DECISION_SUPPORT
User wants help making a decision:
- Route to `supportDecision()`
- Show relevant insights
- Surface past patterns
- Non-prescriptive guidance

### MEMORY_REVIEW
User wants to review pending memories:
- Route to `surfaceMRQ()`
- Show pending proposals
- Link to MRQ interface

### CLARIFICATION
User is asking for clarification:
- Route to `respondWithUncertainty()`
- Ask for clarification
- Don't guess

## API Endpoints

### POST `/api/chat/message`
Handle user message and generate response.

**Request:**
```json
{
  "message": "What does John Doe do?",
  "session_id": "optional-session-id"
}
```

**Response:**
```json
{
  "content": "Based on your memories, John Doe is a software engineer...",
  "response_mode": "FACTUAL_SUMMARY",
  "citations": ["claim-1", "claim-2"],
  "confidence": 0.85,
  "disclaimer": null
}
```

### GET `/api/chat/history/:sessionId`
Get chat history for a session.

**Query Parameters:**
- `limit`: Number of messages to return (default: 50)

**Response:**
```json
{
  "messages": [
    {
      "id": "msg-1",
      "role": "user",
      "content": "What does John do?",
      "created_at": "2025-01-02T12:00:00Z"
    },
    {
      "id": "msg-2",
      "role": "assistant",
      "content": "John is a software engineer...",
      "response_mode": "FACTUAL_SUMMARY",
      "citations": ["claim-1"],
      "confidence": 0.85,
      "created_at": "2025-01-02T12:00:01Z"
    }
  ]
}
```

## Response Constraints

All responses enforce:
1. **No new facts invented**: Only use existing claims
2. **No memory writes**: Never write directly to memory
3. **All assertions traceable**: Citations required
4. **Uncertainty surfaced**: Show when confidence is low

## Memory Write Gating

When user proposes a memory:
1. **Detect Intent**: Identify memory change intent
2. **Extract Memory**: Extract entity and claim from message
3. **Create Proposal**: Create MRQ proposal (not direct write)
4. **Queue for Review**: Add to Memory Review Queue
5. **Notify User**: "I've queued it for review"

**Example:**
```
User: "Remember that I like coffee"
Bot: "I can remember this if you want. I've queued it for review."
[Proposal created in MRQ, not written to memory]
```

## Decision Support (Non-Prescriptive)

When user asks for decision support:
1. Get relevant insights
2. Get related past decisions/patterns
3. Synthesize context
4. Show patterns, not prescriptions
5. Include disclaimer: "I'm not telling you what to do — just showing patterns"

**Example:**
```
User: "Should I take this job?"
Bot: "Based on your past patterns, you've tended to value work-life balance highly. 
      This role might require longer hours. I'm not telling you what to do — 
      just showing patterns."
```

## UI Contract

### Chat Interface
- **Confidence Labels**: Show confidence for each response
- **Perspective Labels**: Show which perspectives are included
- **Citation Links**: Click to see supporting claims
- **Insight Badges**: Visually distinct from facts
- **MRQ Suggestions**: Inline suggestions for memory proposals

### Response Display
- **Factual Responses**: Standard chat bubbles with citations
- **Perspective Responses**: Show multiple viewpoints clearly
- **Insight Responses**: Distinct styling with disclaimer
- **Uncertainty Responses**: Show uncertainty clearly
- **MRQ Prompts**: Link to review queue

### Navigation
- **Jump to Evidence**: Click citation → view claim
- **Jump to MRQ**: Click proposal → review queue
- **Jump to Insight**: Click insight → view details
- **Jump to Entity**: Click entity → entity view

## Example Conversations

### Factual Question
```
User: "What does John Doe do?"
Bot: "Based on your memories, John Doe is a software engineer who works at Microsoft. 
      (Confidence: 85%, Sources: claim-1, claim-2)"
[FACTUAL_SUMMARY mode, citations provided]
```

### Perspective Question
```
User: "What do people think about John?"
Bot: "Different perspectives exist here:

      From Self: 'John is a good person'
      From Coach Felipe: 'John needs improvement'

      (Sources: perspective-claim-1, perspective-claim-2)"
[PERSPECTIVE_SUMMARY mode, multiple viewpoints preserved]
```

### Reflection Request
```
User: "What patterns do you see?"
Bot: "Here are some insights I've found:

      **Recurring positive sentiment about work**
      You frequently express positive sentiment about your work.
      (Confidence: 75%)

      **Temporal shift detected**
      Sentiment has become more positive over time.
      (Confidence: 80%)

      These are observations, not facts."
[INSIGHT_REFLECTION mode, disclaimer included]
```

### Memory Proposal
```
User: "Remember that I like coffee"
Bot: "I can remember this if you want. I've queued it for review."
[MRQ_PROMPT mode, proposal created]
```

### Uncertainty
```
User: "What's my favorite color?"
Bot: "I don't have enough reliable information to answer that yet."
[UNCERTAINTY_NOTICE mode, honest about limitations]
```

## Design Principles

1. **No Hallucination**: Never invent facts
2. **Strict Boundaries**: Read-only by default, writes through MRQ
3. **Traceability**: All assertions have citations
4. **Uncertainty Honesty**: Acknowledge when uncertain
5. **Non-Prescriptive**: Show patterns, don't tell what to do

## Integration

The COL integrates with:
- **OMEGA MEMORY ENGINE**: For factual claims
- **PERSPECTIVE SERVICE**: For multiple viewpoints
- **INSIGHT ENGINE**: For pattern observations
- **MEMORY REVIEW QUEUE**: For memory write gating
- **CONTINUITY LAYER**: For audit trail

## Future Enhancements

1. **Context Persistence**: Better context management across sessions
2. **Multi-Turn Reasoning**: Track reasoning across multiple messages
3. **Proactive Insights**: Suggest insights when relevant
4. **Learning from Feedback**: Improve responses based on user feedback
5. **Custom Response Modes**: Allow users to define custom modes
6. **Voice Integration**: Support voice-based interactions

---

**Status**: ✅ Core implementation complete
**Version**: 1.0.0
**Last Updated**: 2025-01-02

