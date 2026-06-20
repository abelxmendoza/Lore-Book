export type ScrollToTopOptions = {
  behavior?: ScrollBehavior;
  mainEl?: HTMLElement | null;
};

function resetElementScroll(el: HTMLElement, behavior: ScrollBehavior): void {
  if (typeof el.scrollTo === 'function') {
    el.scrollTo({ top: 0, left: 0, behavior });
    return;
  }
  el.scrollTop = 0;
  el.scrollLeft = 0;
}

/** Reset scroll position for SPA route changes (window, main shell, nested roots). */
export function scrollToTop(options: ScrollToTopOptions = {}): void {
  const { behavior = 'auto', mainEl = null } = options;
  const scrollOpts: ScrollToOptions = { top: 0, left: 0, behavior };

  window.scrollTo(scrollOpts);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;

  const main = mainEl ?? document.getElementById('main-content');
  if (main instanceof HTMLElement) {
    resetElementScroll(main, behavior);
  }

  document.querySelectorAll('[data-route-scroll-root]').forEach((node) => {
    if (node instanceof HTMLElement) {
      resetElementScroll(node, behavior);
    }
  });
}

let scrollRestorationConfigured = false;

/** Prevent the browser from restoring scroll on back/forward navigation. */
export function configureManualScrollRestoration(): void {
  if (scrollRestorationConfigured || typeof window === 'undefined') return;
  if ('scrollRestoration' in window.history) {
    window.history.scrollRestoration = 'manual';
  }
  scrollRestorationConfigured = true;
}
