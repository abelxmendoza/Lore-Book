/**
 * Error Diagnostics Utility
 * Helps identify which API endpoints are failing and why
 */

export type DiagnosticResult = {
  endpoint: string;
  status: 'ok' | 'error' | 'timeout';
  error?: string;
  responseTime?: number;
};

export const diagnoseEndpoints = async (baseUrl: string = '/api'): Promise<DiagnosticResult[]> => {
  const endpoints = [
    '/health',
    '/characters/list',
    '/entries',
    '/timeline',
    '/insights/recent',
    '/documents/language-style',
    '/chat/stream', // This one might fail if not POST
  ];

  const results: DiagnosticResult[] = [];

  for (const endpoint of endpoints) {
    const startTime = Date.now();
    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: endpoint === '/chat/stream' ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        body: endpoint === '/chat/stream' ? JSON.stringify({ message: 'test' }) : undefined,
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      const responseTime = Date.now() - startTime;
      
      if (response.ok) {
        results.push({
          endpoint,
          status: 'ok',
          responseTime,
        });
      } else {
        const errorText = await response.text().catch(() => 'Unknown error');
        results.push({
          endpoint,
          status: 'error',
          error: `HTTP ${response.status}: ${errorText.substring(0, 100)}`,
          responseTime,
        });
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      if (error instanceof Error) {
        if (error.name === 'AbortError' || error.message.includes('timeout')) {
          results.push({
            endpoint,
            status: 'timeout',
            error: 'Request timeout (>5s)',
            responseTime,
          });
        } else {
          results.push({
            endpoint,
            status: 'error',
            error: error.message,
            responseTime,
          });
        }
      } else {
        results.push({
          endpoint,
          status: 'error',
          error: 'Unknown error',
          responseTime,
        });
      }
    }
  }

  return results;
};

export const logDiagnostics = (results: DiagnosticResult[]) => {
  console.group('🔍 API Endpoint Diagnostics');
  console.table(
    results.map((r) => ({
      Endpoint: r.endpoint,
      Status: r.status === 'ok' ? '✅ OK' : r.status === 'timeout' ? '⏱️ Timeout' : '❌ Error',
      'Response Time': r.responseTime ? `${r.responseTime}ms` : 'N/A',
      Error: r.error || '-',
    }))
  );

  const errors = results.filter((r) => r.status !== 'ok');
  if (errors.length > 0) {
    console.group('❌ Failed Endpoints');
    errors.forEach((r) => {
      console.error(`${r.endpoint}: ${r.error}`);
    });
    console.groupEnd();
  }
  console.groupEnd();
};

