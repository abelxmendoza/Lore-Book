/**
 * Metrics for ingestion payload validation (schemaVersion / jobType / rejection / dead-letter).
 */

export type IngestionPayloadMetrics = {
  validated_ok: number;
  legacy_adapted: number;
  rejected: number;
  dead_lettered_invalid: number;
  by_job_type: Record<string, number>;
  by_schema_version: Record<string, number>;
  by_rejection_reason: Record<string, number>;
};

const metrics: IngestionPayloadMetrics = {
  validated_ok: 0,
  legacy_adapted: 0,
  rejected: 0,
  dead_lettered_invalid: 0,
  by_job_type: {},
  by_schema_version: {},
  by_rejection_reason: {},
};

function bump(map: Record<string, number>, key: string, by = 1): void {
  map[key] = (map[key] ?? 0) + by;
}

export function recordPayloadValidated(opts: {
  jobType: string;
  schemaVersion: number | string;
  legacyAdapted?: boolean;
}): void {
  metrics.validated_ok += 1;
  if (opts.legacyAdapted) metrics.legacy_adapted += 1;
  bump(metrics.by_job_type, opts.jobType);
  bump(metrics.by_schema_version, String(opts.schemaVersion));
}

export function recordPayloadRejected(reason: string): void {
  metrics.rejected += 1;
  bump(metrics.by_rejection_reason, reason);
}

export function recordPayloadDeadLetterInvalid(reason: string): void {
  metrics.dead_lettered_invalid += 1;
  bump(metrics.by_rejection_reason, `dead_letter:${reason}`);
}

export function getIngestionPayloadMetrics(): IngestionPayloadMetrics {
  return {
    ...metrics,
    by_job_type: { ...metrics.by_job_type },
    by_schema_version: { ...metrics.by_schema_version },
    by_rejection_reason: { ...metrics.by_rejection_reason },
  };
}

export function resetIngestionPayloadMetricsForTests(): void {
  metrics.validated_ok = 0;
  metrics.legacy_adapted = 0;
  metrics.rejected = 0;
  metrics.dead_lettered_invalid = 0;
  metrics.by_job_type = {};
  metrics.by_schema_version = {};
  metrics.by_rejection_reason = {};
}
