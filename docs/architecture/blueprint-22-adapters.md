# Blueprint 22 follow-on adapters

The first Blueprint 22 implementation is the primary chat vertical slice. The
chat path owns the canonical composition contract; other surfaces should adopt
it through adapters rather than duplicating profile or quality logic.

## Adapter boundary

Each surface should provide:

- the user request or publishing operation;
- its already-resolved evidence and provenance;
- the surface-specific goal and allowed domains;
- the draft or structured narrative artifact;
- a `CompositionPlan` and quality result in its response metadata.

The adapter must not retrieve new evidence or bypass review and provenance
rules. It may choose a surface renderer after the canonical plan has been
resolved.

## Migration order

1. `narrativeCompilerService` and Story Book: map `NarrativeIR` chapters and
   turning points to the timeline profile.
2. Biography generation and edition manifests: map chapter prose to the
   narrative or recall profile while preserving version and publication gates.
3. Thread and chapter summaries: replace legacy plain-text summary paths with
   the recall profile and shared summary discipline.
4. Book readers and PDF export: consume the same composed document model while
   selecting typography and pagination locally.
5. Publishing and future agents: expose composition metadata in admin/audit
   responses, never in ordinary reader prose.

## Compatibility rule

Do not replace `NarrativeIR`, biography versioning, or existing publishing
contracts until benchmark results show parity for chronology, provenance,
identity preservation, and leakage. During migration, an adapter may keep the
legacy payload shape and add composition metadata behind an additive field.
