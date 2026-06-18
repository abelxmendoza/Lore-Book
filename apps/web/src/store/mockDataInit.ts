const STORAGE_KEY = 'lorebook_use_mock_data';

/** Synchronous bootstrap for mock/demo toggle before the first Redux-driven render. */
export function computeInitialMockDataToggle(): boolean {
  if (typeof window === 'undefined') return false;

  const urlParams = new URLSearchParams(window.location.search);
  const urlMockData = urlParams.get('mockData');
  if (urlMockData === 'true') return true;
  if (urlMockData === 'false') return false;

  const hasSession = Object.keys(localStorage).some(
    (k) => k.startsWith('sb-') && k.endsWith('-auth-token'),
  );
  if (hasSession) {
    localStorage.setItem(STORAGE_KEY, 'false');
    return false;
  }

  const isOnDemoPath = window.location.pathname.startsWith('/demo');
  const isDemoSession = sessionStorage.getItem('lk_demo_runtime') === 'true';
  if (isOnDemoPath || isDemoSession) return true;

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved !== null) return saved === 'true';

  return false;
}

export const MOCK_DATA_STORAGE_KEY = STORAGE_KEY;
