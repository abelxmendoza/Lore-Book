import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Loader2 } from 'lucide-react';
import { fetchFileProvenance, type ProvenanceLink } from '../../api/profileClaims';

const ROUTE_LABEL: Record<string, string> = {
  '/events': 'Life Log',
  '/timeline': 'Timeline',
  '/documents': 'Documents',
  '/skills': 'Skills',
};

export function ProvenanceLinks({ fileId }: { fileId: string }) {
  const [links, setLinks] = useState<ProvenanceLink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchFileProvenance(fileId)
      .then(setLinks)
      .finally(() => setLoading(false));
  }, [fileId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-white/40">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading lore links…
      </div>
    );
  }

  if (links.length === 0) {
    return <p className="text-xs text-white/40">No linked lore entries yet.</p>;
  }

  return (
    <ul className="space-y-1.5 max-h-48 overflow-y-auto">
      {links.map((link) => (
        <li key={`${link.type}-${link.id}`} className="flex items-start gap-2 text-sm">
          <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase text-white/45">
            {link.type.replace(/_/g, ' ')}
          </span>
          <span className="min-w-0 flex-1 truncate text-white/75">{link.label}</span>
          {link.route && (
            <Link
              to={link.route}
              className="shrink-0 text-primary hover:underline flex items-center gap-0.5 text-xs"
            >
              {ROUTE_LABEL[link.route] ?? 'Open'}
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
