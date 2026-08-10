# Cognitive Evaluation & Regression Framework

Status: Blueprint 17 foundation

## Goal

Every cognitive capability must have a measurable contract. Unit tests continue
to verify implementation mechanics; cognitive evaluations verify whether the
system still remembers, scopes, orders, explains, and compresses a life
coherently.

## Safety boundary

The CI golden set is synthetic and read-only. It uses names such as Marcus,
Jamie, Vanguard Robotics, and MemoVault. The runner rejects manifests that are
not explicitly marked synthetic, performs no external writes, and reads no
private account data.

Private or opt-in research datasets may eventually use the same adapter
contract, but they must not be committed or run in ordinary CI.

## Evaluation manifest

Each versioned scenario contains:

- a prompt and synthetic conversation history;
- required assertions and concepts;
- required and excluded contexts;
- expected timeline order and known/unknown dates;
- identity threads and current chapter;
- narrative transitions and evidence-link floors;
- compression limits;
- per-metric thresholds;
- qualitative human-review questions;
- a current baseline output for differential comparison.

The ten initial permanent domains are career timeline, identity summary,
relationship recall, project recall, current chapter, recent changes, character
summary, memory compression, contradiction handling, and temporal
reconstruction.

## Metrics

Metrics are scored independently from 0–100:

- coverage;
- correctness;
- narrative quality contract;
- chronological correctness;
- context precision;
- leakage;
- explainability;
- compression quality;
- identity preservation.

Each metric returns `PASS`, `WARN`, `FAIL`, or `SKIPPED`. Narrative quality also
retains human-review questions because a lexical score cannot decide whether a
biography feels coherent or recognizable.

## Differential evaluation

The differential layer compares a candidate with a baseline and reports:

- metric deltas and regressions;
- added and removed assertions;
- context changes;
- timeline additions, removals, and reorderings;
- identity-thread changes;
- recall-text changes.

Nothing is silently treated as equivalent simply because both outputs pass.

## Running

```bash
npm run eval:cognition --prefix apps/server
```

The command emits compact scenario-level results and exits non-zero on a failed
benchmark. CI runs this after the existing system-cognition regression suite.

## Connecting real engines

`runCognitiveEvaluationSuite` accepts an adapter. The committed baseline adapter
replays known outputs to validate manifests and scoring. Future adapters should
invoke Identity Snapshot, Context Assembly, the Canonical Temporal Model, or
chat recall using the same synthetic scenario input and return the normalized
evaluation output.

An architecture change is ready to replace legacy behavior only when:

1. its unit and integration tests pass;
2. the cognitive benchmark has no unexplained regression;
3. differential changes are reviewed;
4. qualitative scenarios are approved where required;
5. tenant isolation and provenance invariants remain intact.
