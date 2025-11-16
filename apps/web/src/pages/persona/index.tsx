import { useEffect, useState } from 'react';

import { PersonaPanel, type PersonaSnapshot } from '../../components/persona/PersonaPanel';
import { Button } from '../../components/ui/button';
import { fetchJson } from '../../lib/api';

const PersonaPage = () => {
  const [persona, setPersona] = useState<PersonaSnapshot | null>(null);
  const [history, setHistory] = useState<PersonaSnapshot[]>([]);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const loadPersona = async () => {
    setLoading(true);
    try {
      const data = await fetchJson<{ persona: PersonaSnapshot; history: { snapshots: PersonaSnapshot[] } }>(
        '/api/persona'
      );
      setPersona(data.persona);
      setHistory(data.history?.snapshots ?? []);
      const desc = await fetchJson<{ description: string }>('/api/persona/description');
      setDescription(desc.description);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPersona();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black p-8 text-white">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl border border-border/60 bg-black/50 p-6 shadow-panel">
          <p className="text-xs uppercase tracking-widest text-white/60">Persona</p>
          <h1 className="text-3xl font-semibold">Omega Persona Engine</h1>
          <p className="mt-2 text-sm text-white/70">
            Adaptive AI persona tuned by your identity arcs, emotional trajectory, and seasonal shifts.
          </p>
          <div className="mt-4 flex gap-3">
            <Button onClick={loadPersona} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh persona'}
            </Button>
            {description && (
              <Button variant="secondary" onClick={() => alert(description)}>
                View self-narrative
              </Button>
            )}
          </div>
        </header>

        <PersonaPanel persona={persona} history={history} onRefresh={loadPersona} />
      </div>
    </div>
  );
};

export default PersonaPage;
