import { describe, it, expect, beforeEach, vi } from 'vitest';
import { configureManualScrollRestoration, scrollToTop } from './scrollToTop';

describe('scrollToTop', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main id="main-content" style="height: 200px; overflow: auto;">
        <div style="height: 800px"></div>
      </main>
      <div data-route-scroll-root style="height: 100px; overflow: auto;">
        <div style="height: 400px"></div>
      </div>
    `;
    const main = document.getElementById('main-content')!;
    main.scrollTop = 300;
    const nested = document.querySelector('[data-route-scroll-root]') as HTMLElement;
    nested.scrollTop = 150;
    window.scrollTo = vi.fn();
  });

  it('resets window, main, and nested scroll roots', () => {
    const main = document.getElementById('main-content')!;
    scrollToTop({ mainEl: main });

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
    expect(main.scrollTop).toBe(0);
    expect((document.querySelector('[data-route-scroll-root]') as HTMLElement).scrollTop).toBe(0);
  });

  it('sets manual scroll restoration once', () => {
    Object.defineProperty(window.history, 'scrollRestoration', {
      configurable: true,
      writable: true,
      value: 'auto',
    });
    configureManualScrollRestoration();
    expect(window.history.scrollRestoration).toBe('manual');
  });
});
