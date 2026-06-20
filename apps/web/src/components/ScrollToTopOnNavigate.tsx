import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { configureManualScrollRestoration, scrollToTop } from '../lib/scrollToTop';

/**
 * Scrolls to top whenever the route changes (pathname or search).
 * Mount once inside BrowserRouter — covers public pages and app shell routes.
 */
export function ScrollToTopOnNavigate() {
  const { pathname, search } = useLocation();

  useLayoutEffect(() => {
    configureManualScrollRestoration();
  }, []);

  useLayoutEffect(() => {
    scrollToTop();
  }, [pathname, search]);

  return null;
}
