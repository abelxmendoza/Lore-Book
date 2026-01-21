// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

const AboutPage = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-purple-950 to-black p-8 text-white">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-3">
          <img src="/branding/logo-dark.svg" alt="Lore Book" className="h-12 w-12" />
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary/80">Omega Technologies</p>
            <h1 className="text-3xl font-bold">About Omega Technologies</h1>
          </div>
        </div>
        <section className="space-y-2 text-white/80">
          <h2 className="text-xl font-semibold text-white">Mission</h2>
          <p>
            We build resilient memory systems that help people preserve, understand, and act on their lived experiences. Lore Book is the Memory OS that remembers for you.
          </p>
        </section>
        <section className="space-y-2 text-white/80">
          <h2 className="text-xl font-semibold text-white">Team</h2>
          <p>Led by Abel Mendoza, crafting AI-first storytelling infrastructure with care for privacy and agency.</p>
        </section>
        <section className="space-y-2 text-white/80">
          <h2 className="text-xl font-semibold text-white">Philosophy</h2>
          <p>Human stories deserve secure, contextual recall. We honor that by combining encryption options, strict data boundaries, and transparent AI disclaimers.</p>
        </section>
        <section className="space-y-2 text-white/80">
          <h2 className="text-xl font-semibold text-white">Rights</h2>
          <p>© 2025 Abel Mendoza — Omega Technologies. Licensed under MIT for code, with ownership retained for brand and product identity.</p>
        </section>
      </div>
    </div>
  );
};

export default AboutPage;
