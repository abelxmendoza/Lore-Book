// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

export const Footer = () => {
  return (
    <footer className="mt-8 border-t border-border/60 bg-black/70 px-6 py-4 text-sm text-white/70 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>© 2025 Omega Technologies — Built by Abel Mendoza.</span>
        <div className="flex flex-wrap gap-3 text-xs">
          <a className="hover:text-white" href="/api/legal/privacy" target="_blank" rel="noreferrer">
            Privacy
          </a>
          <span>•</span>
          <a className="hover:text-white" href="/api/legal/terms" target="_blank" rel="noreferrer">
            Terms
          </a>
          <span>•</span>
          <a className="hover:text-white" href="#ownership">
            Ownership
          </a>
        </div>
      </div>
    </footer>
  );
};
