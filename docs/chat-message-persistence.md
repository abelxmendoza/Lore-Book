# Chat message persistence

Lorekeeper chat durability is implemented to match official OpenAI and Anthropic guidance for streaming assistants and stateless message APIs.

## Official references

| Provider | Document | Key pattern |
|----------|----------|-------------|
| OpenAI | [How to stream completions](https://developers.openai.com/cookbook/examples/how_to_stream_completions) | Use `stream=True`, read `chunk.choices[0].delta.content`, accumulate text, persist after the stream completes. Enable `stream_options={"include_usage": true}` for token stats on a final chunk where `choices` may be `[]`. |
| Anthropic | [Working with Messages](https://platform.claude.com/docs/en/build-with-claude/working-with-messages) | Messages API is **stateless** — the client must store and resend full conversation history each turn. |
| Anthropic | [Streaming](https://platform.claude.com/docs/en/build-with-claude/streaming) | Accumulate `content_block_delta` text deltas; treat `message_stop` as the signal that the assistant turn is complete and safe to persist. |

Lorekeeper uses OpenAI for chat generation today. Anthropic patterns are mirrored conceptually (client-owned history + persist-on-stream-end) so a future Claude provider adapter can plug in without changing the durability contract.

## Lorekeeper implementation

### User turns

1. `omegaChatService.chatStream` calls `persistUserMessageEarly` before model routing.
2. The stream route emits `metadata.persistence.user` so the web client can show save status.

### Assistant turns

1. **Placeholder** — `insertAssistantPlaceholder` writes an empty assistant row when the SSE stream starts (`stream_status: streaming`).
2. **Streaming** — `parseChatCompletionStreamChunk` extracts deltas; skips usage-only terminal chunks per OpenAI docs.
3. **Finalize** — `finalizeAssistantMessage` updates the placeholder (or inserts) after the stream loop exits, including on partial client disconnect or mid-stream errors.
4. **Client** — `useChat` applies `metadata.persistence`, hydrates from `chat_messages`, and keeps an auth localStorage backup for in-flight turns.

### OpenAI-specific settings

- Chat Completions: `stream_options: { include_usage: true }` in `createOpenAIChatStream`.
- Responses API (opt-in): `store: false` (stateless, like Anthropic); usage normalized from `response.completed`.
- Token usage is stored on assistant message `metadata.tokenUsage` and sent in the SSE `done` event.

### Code map

| File | Role |
|------|------|
| `apps/server/src/services/chat/openaiChatStreamAdapter.ts` | Provider stream creation |
| `apps/server/src/services/chat/chatStreamChunk.ts` | Delta + usage chunk parsing |
| `apps/server/src/services/chat/chatMessagePersistenceService.ts` | DB writes |
| `apps/server/src/routes/chat.ts` | SSE loop, persist-on-complete |
| `apps/web/src/features/chat/hooks/useChat.ts` | Client durability + persist UI |
