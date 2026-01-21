// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

type HeaderProps = {
  onUpgrade?: () => void;
};

export const Header = ({ onUpgrade }: HeaderProps) => {
  return (
    <header className="flex items-center justify-between border-b border-border/50 bg-black/60 px-6 py-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <img src="/branding/logo.svg" alt="Lore Book" className="h-10 w-10" />
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary/80">Omega Technologies</p>
          <h1 className="text-xl font-semibold text-white">Lore Book</h1>
        </div>
      </div>
      <div className="flex items-center gap-4 text-sm text-white/70">
        <a className="hover:text-white" href="/about">
          About
        </a>
        <a className="hover:text-white" href="/upgrade">
          Pricing
        </a>
        <a className="hover:text-white" href="/api/legal/terms" target="_blank" rel="noreferrer">
          Terms
        </a>
        <a className="hover:text-white" href="/api/legal/privacy" target="_blank" rel="noreferrer">
          Privacy
        </a>
        {onUpgrade && (
          <button
            onClick={onUpgrade}
            className="rounded-full border border-primary bg-primary/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/40"
          >
            Upgrade
          </button>
        )}
      </div>
    </header>
  );
};
