// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

/**
 * Day-one vs day-thirty — shows the product promise without comparing to other apps.
 */

export function ContinuityProofSection() {
  return (
    <section className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8 bg-black/30">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8 sm:mb-12">
          <p className="text-xs font-mono text-primary/70 uppercase tracking-widest mb-3">
            The difference time makes
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">
            It gets better the longer you use it
          </h2>
          <p className="text-base sm:text-lg text-white/60 max-w-2xl mx-auto">
            Same you. Same app. A record that compounds — so you stop re-introducing your life.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
          <div className="rounded-xl border border-white/10 bg-black/50 p-5 sm:p-6">
            <p className="text-[10px] font-mono uppercase tracking-widest text-white/35 mb-4">Day one</p>
            <div className="space-y-3 text-sm">
              <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 px-3 py-2 text-white/85 ml-6">
                My sister is visiting from Portland. It&apos;s complicated with Mom.
              </div>
              <div className="rounded-lg bg-white/5 border border-white/8 px-3 py-2 text-white/70 mr-8">
                Tell me more about what&apos;s complicated — I&apos;m listening.
              </div>
            </div>
            <p className="mt-4 text-xs text-white/40">No shared history yet. You start from zero.</p>
          </div>

          <div className="rounded-xl border border-primary/25 bg-gradient-to-br from-purple-950/40 to-black/50 p-5 sm:p-6">
            <p className="text-[10px] font-mono uppercase tracking-widest text-primary/70 mb-4">Day thirty</p>
            <div className="space-y-3 text-sm">
              <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 px-3 py-2 text-white/85 ml-6">
                She&apos;s here again. Same tension as last time.
              </div>
              <div className="rounded-lg bg-white/5 border border-white/8 px-3 py-2 text-white/80 mr-4">
                Last visit you said Mom called twice before she arrived — and that Portland felt like an escape, not a reunion. Want to unpack what&apos;s repeating?
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-4">
              {['Sister', 'Mom', 'Portland'].map((chip) => (
                <span
                  key={chip}
                  className="px-2 py-0.5 rounded-full bg-primary/15 border border-primary/25 text-primary text-[10px] font-mono"
                >
                  {chip}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-white/45">Context carried forward. No backstory required.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
