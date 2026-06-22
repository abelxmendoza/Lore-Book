# INVESTOR READINESS REPORT

Framing: an Antler-style partner interview. What's impressive, what's the moat,
what would a sharp investor poke at.

---

## The moat / what's differentiated

The defensible idea is **not** "an AI that remembers" (OpenAI/Google ship memory).
It's the **epistemic discipline around memory**:

- A **provenance-aware life graph**: claims are evidenced, attributed to source
  messages, and confidence-scored — not vibes. (omega_entities + omega_claims +
  identity ledger.)
- **Correction + contradiction handling**: the system can be wrong and be *fixed*,
  with an append-only `identity_mutations` audit trail.
- The new **Response Compiler**: the assistant is treated as *non-authoritative* —
  it can summarize/infer/suggest but cannot fabricate canon; every claim is
  grounded to evidence or labeled inference, and writes require user confirmation.

That "trustworthy memory with receipts" is a genuinely differentiated wedge versus
chatbot memory that silently misremembers. **Lead the story with this.**

## What's impressive
- Working continuity loop (capture → store → retrieve → use) with provenance.
- ChatGPT history **import** → instant populated graph (great demo).
- Three-tier grounding (token / semantic / whole-lore canon) shipped this cycle.
- The team can already isolate a trustworthy core (`CORE_RUNTIME`) from 79
  experimental surfaces via one env flag — shows engineering maturity.

## What would concern an investor (be ready to answer)

1. **Unit economics are unmeasured.** ~10–18 model/embedding calls per message
   (estimate) and no live cost-per-message/per-user number. *First thing a good
   investor asks: "what does a message cost and what's your gross margin?"* You must
   have this number. **P0 for the raise.**
2. **Reliability of the core promise.** Memory formation runs on an **in-memory
   queue** (lost on restart) with fire-and-forget ingestion. "Does it actually
   remember, every time?" must be answerable with a measured ingestion-success rate.
3. **Surface-area / focus risk.** 348 services, 79 experimental routes — reads as a
   solo-founder building breadth, not depth. Investors fund *focused* wedges.
   Reframe the breadth as backlog; demo one loop flawlessly.
4. **Single-author key-person risk** and large unproven codebase.
5. **Defensibility vs incumbents.** "Why won't ChatGPT memory eat this?" Answer:
   provenance, correction, life-graph structure, and user-owned, inspectable memory.

## Technical risks remaining
- No durable queue / outbox; no unified identity write-gate; silent recall misses
  (all in RELIABILITY).
- Service-role-everywhere security posture (no RLS backstop) — see SECURITY.

## Scalability risks remaining
- Per-message LLM fan-out (cost + 429s) and WMA N+1/full-table scans.
- In-memory queue won't survive horizontal scaling (state per process).

## Metrics that are missing (instrument before the raise)
- **Cost per message / per active user** (the meter exists — turn it on).
- **Ingestion success rate** and **recall hit rate / accuracy**.
- **Time-to-first-aha** and **D1/D7 retention**.
- **p50/p95 chat latency**.
- Activation: % of new users who complete import or seed ≥3 facts.

## One-line readiness verdict
Differentiated thesis and a working core, **not yet investable on metrics**:
produce cost-per-message, ingestion-success, and retention numbers, make the
memory loop provably durable, and demo the provenance wedge on a single flawless
continuity story.
