// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

export const Footer = () => {
  return (
    <footer className="mt-auto -mx-4 -mb-4 sm:-mx-6 sm:-mb-6 lg:-mx-8 lg:-mb-8 xl:-mx-10 xl:-mb-10 border-t border-border/60 bg-black/95 px-3 sm:px-4 lg:px-6 py-2 sm:py-3 lg:py-4 text-xs sm:text-sm text-white/70 backdrop-blur safe-area-bottom">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-3">
        <span className="text-center sm:text-left">© 2025 Omega Technologies — Built by Abel Mendoza.</span>
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-xs">
          <a className="hover:text-white transition-colors" href="/privacy-policy">
            Privacy
          </a>
          <span className="hidden sm:inline">•</span>
          <a className="hover:text-white transition-colors" href="/terms">
            Terms
          </a>
          <span className="hidden sm:inline">•</span>
          <a className="hover:text-white transition-colors" href="#ownership">
            Ownership
          </a>
        </div>
      </div>
    </footer>
  );
};
