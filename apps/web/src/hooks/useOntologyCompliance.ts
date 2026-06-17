import { useCallback, useEffect, useState } from 'react';
import { ontologyComplianceApi, type ComplianceBook, type OntologyComplianceReport } from '../api/ontologyCompliance';
import { useShouldUseMockData } from './useShouldUseMockData';

export function useOntologyCompliance(book?: ComplianceBook) {
  const isMock = useShouldUseMockData();
  const [report, setReport] = useState<OntologyComplianceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (isMock) {
      setReport(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await ontologyComplianceApi.get();
      setReport(res.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Compliance check failed');
    } finally {
      setLoading(false);
    }
  }, [isMock]);

  useEffect(() => {
    void refresh();
    const onInference = () => { void refresh(); };
    window.addEventListener('lk:inference-complete', onInference);
    return () => window.removeEventListener('lk:inference-complete', onInference);
  }, [refresh]);

  const issues = book
    ? (report?.issues ?? []).filter((i) => i.book === book)
    : (report?.issues ?? []);

  const issueCount = issues.length;
  const errorCount = issues.filter((i) => i.severity === 'error').length;

  return {
    report,
    issues,
    issueCount,
    errorCount,
    healthy: !isMock && report?.summary.healthy === true,
    loading,
    error,
    refresh,
  };
}

/** Issues for a specific entity card badge. */
export function issuesForEntity(
  entityId: string,
  report: OntologyComplianceReport | null
) {
  return (report?.issues ?? []).filter((i) => i.id === entityId);
}
