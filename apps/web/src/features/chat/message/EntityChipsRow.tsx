import { useNavigate } from 'react-router-dom';
import { Users, MapPin, Building2 } from 'lucide-react';

interface EntityChip {
  id: string;
  name: string;
  type: 'character' | 'location' | 'organization';
}

interface EntityChipsRowProps {
  entities: EntityChip[];
  /** Leading label; defaults to the per-message "mentioned:" */
  label?: string;
  /** Max chips before collapsing to "+N more" */
  max?: number;
}

const ICON = {
  character:    <Users     className="h-3 w-3 flex-shrink-0" />,
  location:     <MapPin    className="h-3 w-3 flex-shrink-0" />,
  organization: <Building2 className="h-3 w-3 flex-shrink-0" />,
};

const ROUTE = {
  character:    '/characters',
  location:     '/locations',
  organization: '/organizations',
};

const COLOR = {
  character:    'border-purple-500/40 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20',
  location:     'border-cyan-500/40   bg-cyan-500/10   text-cyan-300   hover:bg-cyan-500/20',
  organization: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20',
};

export const EntityChipsRow = ({ entities, label = 'mentioned:', max = 5 }: EntityChipsRowProps) => {
  const navigate = useNavigate();

  if (!entities || entities.length === 0) return null;

  const visible = entities.slice(0, max);
  const overflow = entities.length - visible.length;

  const handleClick = (entity: EntityChip) => {
    sessionStorage.setItem('highlightItem', entity.id);
    navigate(ROUTE[entity.type]);
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] text-white/30 mr-0.5">{label}</span>
      {visible.map(entity => (
        <button
          key={entity.id}
          type="button"
          onClick={() => handleClick(entity)}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${COLOR[entity.type]}`}
          title={`View ${entity.type}: ${entity.name}`}
        >
          {ICON[entity.type]}
          <span>{entity.name}</span>
        </button>
      ))}
      {overflow > 0 && (
        <span className="text-[11px] text-white/30">+{overflow} more</span>
      )}
    </div>
  );
};
