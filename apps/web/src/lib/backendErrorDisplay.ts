/** Detect errors caused by backend/network unavailability (not user-facing business logic errors). */
export function isBackendConnectionError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('backend unavailable') ||
    m.includes('backend server is not running') ||
    m.includes('backend server offline') ||
    m.includes('cannot connect to backend') ||
    m.includes('cannot reach server') ||
    m.includes('failed to fetch') ||
    m.includes('fetch failed') ||
    m.includes('network error') ||
    m.includes('networkerror') ||
    m.includes('err_connection_refused') ||
    m.includes('load failed') ||
    m.includes('connection refused') ||
    m.includes('the lorebook server is busy')
  );
}

/** One-line copy for the global offline indicator. */
export function compactBackendStatusMessage(options?: {
  isMobile?: boolean;
  usingMock?: boolean;
}): string {
  const { isMobile = false, usingMock = true } = options ?? {};
  if (isMobile) {
    return usingMock ? 'Offline · sample data' : 'Offline';
  }
  return usingMock
    ? 'Server unreachable — sample data active'
    : 'Server unreachable';
}

/**
 * Returns null when an error should not be shown inline (global banner covers it).
 */
export function sanitizeInlineError(
  message: string | null | undefined,
  options?: { suppressBackendNoise?: boolean }
): string | null {
  if (!message?.trim()) return null;
  if (options?.suppressBackendNoise && isBackendConnectionError(message)) {
    return null;
  }
  return message;
}
