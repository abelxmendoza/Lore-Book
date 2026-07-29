// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

/**
 * App chrome copyright bar. Only mount on document-style surfaces (home, guide,
 * billing/legal). Do not use on books or viewport-locked UIs — those own their
 * own page chrome and a mid-layout mt-auto footer ends up floating mid-screen.
 */
export const Footer = () => {
  return (
    <footer className="mt-auto shrink-0 w-full border-t border-border/60 bg-black px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 text-xs sm:text-sm text-white/70 safe-area-bottom">
      <div className="mx-auto flex w-full max-w-7xl flex-col sm:flex-row items-center justify-between gap-2 sm:gap-3">
        <span className="text-center sm:text-left">© 2025 Omega Technologies — Built by Abel Mendoza.</span>
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-xs">
          <a className="hover:text-white transition-colors" href="/privacy-policy">
            Privacy
          </a>
          <span className="hidden sm:inline" aria-hidden>
            •
          </span>
          <a className="hover:text-white transition-colors" href="/terms">
            Terms
          </a>
          <span className="hidden sm:inline" aria-hidden>
            •
          </span>
          <a className="hover:text-white transition-colors" href="#ownership">
            Ownership
          </a>
        </div>
      </div>
    </footer>
  );
};
