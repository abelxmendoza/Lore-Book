/**
 * Controlled fault injection for durability lifecycle testing.
 * Enabled only when DURABILITY_FAULT_INJECTION=true (never default production).
 *
 * Set faults via:
 *   process env DURABILITY_FAULT_POINT=after_job_enqueue
 *   process env DURABILITY_FAULT_TYPE=openai_429
 * or registerFault() in tests.
 */

import { logger } from '../../logger';

export type FaultPoint =
  | 'before_message_persistence'
  | 'after_message_persistence'
  | 'before_durable_job_enqueue'
  | 'after_job_enqueue'
  | 'before_assistant_request'
  | 'during_assistant_stream'
  | 'after_assistant_response_persistence'
  | 'before_worker_claim'
  | 'after_worker_claim'
  | 'after_ingestion_stage'
  | 'before_job_completion';

export type FaultType =
  | 'openai_429'
  | 'quota_exhausted'
  | 'timeout'
  | 'provider_500'
  | 'database_connection_failure'
  | 'constraint_violation'
  | 'process_termination'
  | 'client_disconnect'
  | 'duplicate_request'
  | 'slow_worker';

type RegisteredFault = {
  point: FaultPoint;
  type: FaultType;
  once?: boolean;
  used?: boolean;
  delayMs?: number;
};

const registry: RegisteredFault[] = [];

/**
 * Production hard-block: fault injection must never activate when the runtime
 * is production — even if DURABILITY_FAULT_INJECTION=true is mis-set.
 */
export function isProductionRuntime(): boolean {
  const nodeEnv = (process.env.NODE_ENV ?? '').toLowerCase();
  const apiEnv = (process.env.API_ENV ?? '').toLowerCase();
  const railwayEnv = (process.env.RAILWAY_ENVIRONMENT ?? '').toLowerCase();
  // Vitest/unit tests must never be treated as production.
  if (process.env.VITEST === 'true' || nodeEnv === 'test') return false;
  return (
    nodeEnv === 'production' ||
    apiEnv === 'production' ||
    railwayEnv === 'production' ||
    railwayEnv === 'prod'
  );
}

export function isFaultInjectionEnabled(): boolean {
  // Absolute ban in production runtime (requirement: cannot activate in prod).
  if (isProductionRuntime()) return false;
  return (
    process.env.DURABILITY_FAULT_INJECTION === 'true' ||
    process.env.NODE_ENV === 'test' ||
    process.env.VITEST === 'true'
  );
}

export function registerFault(fault: RegisteredFault): void {
  if (isProductionRuntime()) {
    throw new Error('Fault injection is permanently disabled in production runtime');
  }
  if (!isFaultInjectionEnabled()) {
    throw new Error('Fault injection disabled — set DURABILITY_FAULT_INJECTION=true in non-production');
  }
  registry.push({ ...fault, used: false });
}

export function clearFaults(): void {
  registry.length = 0;
}

function resolveFault(point: FaultPoint): RegisteredFault | null {
  if (!isFaultInjectionEnabled()) return null;

  const envPoint = process.env.DURABILITY_FAULT_POINT as FaultPoint | undefined;
  const envType = process.env.DURABILITY_FAULT_TYPE as FaultType | undefined;
  if (envPoint === point && envType) {
    return { point: envPoint, type: envType };
  }

  const hit = registry.find((f) => f.point === point && (!f.once || !f.used));
  if (hit) {
    hit.used = true;
    return hit;
  }
  return null;
}

function throwForType(type: FaultType): never {
  switch (type) {
    case 'openai_429': {
      const e = new Error('Rate limit exceeded (injected)') as Error & { status: number };
      e.status = 429;
      throw e;
    }
    case 'quota_exhausted': {
      const e = new Error('insufficient_quota: You exceeded your current quota (injected)') as Error & {
        status: number;
      };
      e.status = 429;
      throw e;
    }
    case 'timeout': {
      const e = new Error('ETIMEDOUT (injected)');
      throw e;
    }
    case 'provider_500': {
      const e = new Error('Internal server error (injected)') as Error & { status: number };
      e.status = 500;
      throw e;
    }
    case 'database_connection_failure':
      throw new Error('connection terminated unexpectedly (injected)');
    case 'constraint_violation':
      throw new Error('duplicate key value violates unique constraint (injected)');
    case 'process_termination':
      throw new Error('process termination simulated (injected)');
    case 'client_disconnect':
      throw new Error('client disconnect (injected)');
    case 'duplicate_request':
      throw new Error('duplicate request (injected)');
    case 'slow_worker':
      // handled as delay below
      throw new Error('slow_worker should use delay path');
    default:
      throw new Error(`Unknown fault type: ${type}`);
  }
}

/**
 * Invoke at lifecycle points. No-op when injection disabled / no fault registered.
 */
export async function maybeInjectFault(
  point: FaultPoint,
  ctx?: { jobId?: string; userId?: string; stage?: string },
): Promise<void> {
  const fault = resolveFault(point);
  if (!fault) return;

  logger.warn({ point, type: fault.type, ...ctx }, 'durability fault injection firing');

  if (fault.type === 'slow_worker' || fault.delayMs) {
    await new Promise((r) => setTimeout(r, fault.delayMs ?? 5_000));
    return;
  }

  throwForType(fault.type);
}
