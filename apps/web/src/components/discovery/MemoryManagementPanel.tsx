/**
 * Memory Management Panel
 * Better than ChatGPT's memory - time-aware, evidence-based, with full control
 */

import { useState } from 'react';
import { 
  Database, 
  Search,
  Edit,
  Trash2,
  Merge,
  User,
  MapPin,
  Building,
  Calendar,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  Filter
} from 'lucide-react';
import { 
  useOmegaMemory, 
  type Entity, 
  type Claim,
  type EntityType,
  type ClaimSource
} from '../../hooks/useOmegaMemory';

const EntityTypeIcon = ({ type }: { type: EntityType }) => {
  const icons = {
    PERSON: User,
    CHARACTER: User,
    LOCATION: MapPin,
    ORG: Building,
    EVENT: Calendar,
  };
  const Icon = icons[type] || Database;
  return <Icon className="h-4 w-4" />;
};

const SourceBadge = ({ source }: { source: ClaimSource }) => {
  const colors = {
    USER: 'bg-green-500/20 text-green-400 border-green-500/50',
    AI: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    EXTERNAL: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${colors[source]}`}>
      {source}
    </span>
  );
};

const ConfidenceBar = ({ confidence }: { confidence: number }) => {
  const percentage = Math.round(confidence * 100);
  const color = confidence >= 0.7 ? 'bg-green-500' : confidence >= 0.4 ? 'bg-yellow-500' : 'bg-red-500';
  
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
        <div 
          className={`h-full ${color} transition-all`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-white/60 w-12 text-right">{percentage}%</span>
    </div>
  );
};

const ClaimCard = ({ 
  claim, 
  entityName,
  onEdit, 
  onDelete 
}: { 
  claim: Claim;
  entityName: string;
  onEdit: (claim: Claim) => void;
  onDelete: (claimId: string) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className={`border rounded-lg p-3 space-y-2 ${claim.is_active ? 'border-border/60 bg-black/40' : 'border-red-500/30 bg-red-500/10 opacity-60'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <SourceBadge source={claim.source} />
            {!claim.is_active && (
              <span className="text-xs text-red-400">Inactive</span>
            )}
            {claim.sentiment && (
              <span className="text-xs text-white/60">({claim.sentiment})</span>
            )}
          </div>
          <p className="text-sm text-white/90 mb-2">{claim.text}</p>
          <div className="flex items-center gap-4 text-xs text-white/60">
            <span>About: {entityName}</span>
            <span>•</span>
            <span>From: {formatDate(claim.start_time)}</span>
            {claim.end_time && (
              <>
                <span>•</span>
                <span>Until: {formatDate(claim.end_time)}</span>
              </>
            )}
          </div>
          <div className="mt-2">
            <ConfidenceBar confidence={claim.confidence} />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded hover:bg-white/10 transition-colors"
          >
            {expanded ? '−' : '+'}
          </button>
          <button
            onClick={() => onEdit(claim)}
            className="p-1 rounded hover:bg-blue-500/20 transition-colors"
            title="Edit"
          >
            <Edit className="h-4 w-4 text-blue-400" />
          </button>
          <button
            onClick={() => onDelete(claim.id)}
            className="p-1 rounded hover:bg-red-500/20 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-4 w-4 text-red-400" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="pt-2 border-t border-white/10 space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-white/60">Created:</span>
              <span className="text-white/80 ml-2">{formatDate(claim.created_at)}</span>
            </div>
            <div>
              <span className="text-white/60">Updated:</span>
              <span className="text-white/80 ml-2">{formatDate(claim.updated_at)}</span>
            </div>
          </div>
          {claim.metadata && Object.keys(claim.metadata).length > 0 && (
            <div>
              <span className="text-white/60">Metadata:</span>
              <pre className="text-white/80 mt-1 text-xs bg-white/5 p-2 rounded overflow-auto">
                {JSON.stringify(claim.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const EntityCard = ({ 
  entity, 
  onViewClaims,
  onMerge 
}: { 
  entity: Entity;
  onViewClaims: (entityId: string) => void;
  onMerge: (entityId: string) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loadingClaims, setLoadingClaims] = useState(false);
  const { getEntityClaims, updateClaim, deleteClaim } = useOmegaMemory();

  const loadClaims = async () => {
    if (expanded && claims.length === 0) {
      setLoadingClaims(true);
      try {
        const entityClaims = await getEntityClaims(entity.id);
        setClaims(entityClaims);
      } catch (error) {
        console.error('Failed to load claims:', error);
      } finally {
        setLoadingClaims(false);
      }
    }
  };

  const handleToggle = () => {
    setExpanded(!expanded);
    if (!expanded) {
      void loadClaims();
    }
  };

  const handleEditClaim = (claim: Claim) => {
    // TODO: Open edit modal
    console.log('Edit claim:', claim);
  };

  const handleDeleteClaim = async (claimId: string) => {
    if (confirm('Are you sure you want to delete this memory? It will be marked inactive but preserved for history.')) {
      try {
        await deleteClaim(claimId);
        setClaims(claims.filter(c => c.id !== claimId));
      } catch (error) {
        console.error('Failed to delete claim:', error);
      }
    }
  };

  return (
    <div className="border border-border/60 rounded-lg bg-black/40 p-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-start gap-3 flex-1">
          <div className="p-2 bg-primary/20 rounded-lg">
            <EntityTypeIcon type={entity.type} />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-white mb-1">{entity.primary_name}</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/60">{entity.type}</span>
              {entity.aliases && entity.aliases.length > 0 && (
                <>
                  <span className="text-xs text-white/40">•</span>
                  <span className="text-xs text-white/60">
                    Also known as: {entity.aliases.join(', ')}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggle}
            className="px-3 py-1 bg-primary/20 text-primary border border-primary/50 rounded text-xs hover:bg-primary/30 transition-colors"
          >
            {expanded ? 'Hide' : 'View'} Claims
          </button>
          <button
            onClick={() => onMerge(entity.id)}
            className="p-1 rounded hover:bg-yellow-500/20 transition-colors"
            title="Merge with another entity"
          >
            <Merge className="h-4 w-4 text-yellow-400" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="pt-3 border-t border-white/10 space-y-3">
          {loadingClaims ? (
            <div className="text-center py-4">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : claims.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-white">
                  {claims.filter(c => c.is_active).length} Active / {claims.length} Total Memories
                </h4>
              </div>
              {claims.map((claim) => (
                <ClaimCard
                  key={claim.id}
                  claim={claim}
                  entityName={entity.primary_name}
                  onEdit={handleEditClaim}
                  onDelete={handleDeleteClaim}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-white/60 text-center py-4">No memories yet for this entity</p>
          )}
        </div>
      )}
    </div>
  );
};

export const MemoryManagementPanel = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<EntityType | 'ALL'>('ALL');
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const { entities, loading, error, refetch, mergeEntities } = useOmegaMemory(
    filterType !== 'ALL' ? { type: filterType } : undefined
  );

  const filteredEntities = entities.filter(entity => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        entity.primary_name.toLowerCase().includes(query) ||
        entity.aliases.some(alias => alias.toLowerCase().includes(query))
      );
    }
    return true;
  });

  const handleMerge = async (sourceId: string) => {
    const targetName = prompt('Enter the name of the entity to merge with:');
    if (!targetName) return;

    const targetEntity = entities.find(e => 
      e.primary_name.toLowerCase() === targetName.toLowerCase() ||
      e.aliases.some(a => a.toLowerCase() === targetName.toLowerCase())
    );

    if (!targetEntity) {
      alert('Entity not found');
      return;
    }

    if (confirm(`Merge "${entities.find(e => e.id === sourceId)?.primary_name}" into "${targetEntity.primary_name}"?`)) {
      try {
        await mergeEntities(sourceId, targetEntity.id);
      } catch (error) {
        console.error('Failed to merge entities:', error);
        alert('Failed to merge entities');
      }
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="mt-4 text-white/60">Loading memories...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-400" />
        <p className="text-red-400 mb-2">Failed to load memories</p>
        <p className="text-sm text-white/60 mb-4">{error}</p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/80 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Database className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">Memory Management</h3>
            <p className="text-sm text-white/70">
              Better than ChatGPT's memory: time-aware, evidence-based, with confidence scores. 
              View, edit, and manage all your memories. Memories are never deleted, only marked inactive to preserve history.
            </p>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search entities by name or alias..."
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-primary/50"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-white/60" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as EntityType | 'ALL')}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50"
          >
            <option value="ALL">All Types</option>
            <option value="PERSON">People</option>
            <option value="CHARACTER">Characters</option>
            <option value="LOCATION">Locations</option>
            <option value="ORG">Organizations</option>
            <option value="EVENT">Events</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-lg p-3">
          <div className="text-2xl font-bold text-white">{entities.length}</div>
          <div className="text-xs text-white/60">Total Entities</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-lg p-3">
          <div className="text-2xl font-bold text-white">{filteredEntities.length}</div>
          <div className="text-xs text-white/60">Filtered</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-lg p-3">
          <div className="text-2xl font-bold text-white">
            {entities.filter(e => e.type === 'PERSON' || e.type === 'CHARACTER').length}
          </div>
          <div className="text-xs text-white/60">People</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-lg p-3">
          <div className="text-2xl font-bold text-white">
            {entities.filter(e => e.type === 'LOCATION').length}
          </div>
          <div className="text-xs text-white/60">Locations</div>
        </div>
      </div>

      {/* Entities List */}
      {filteredEntities.length > 0 ? (
        <div className="space-y-3">
          {filteredEntities.map((entity) => (
            <EntityCard
              key={entity.id}
              entity={entity}
              onViewClaims={() => setSelectedEntity(entity)}
              onMerge={handleMerge}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 border border-border/60 rounded-lg bg-black/20">
          <Database className="h-12 w-12 mx-auto mb-4 text-white/40" />
          <p className="text-white/60 mb-2">No entities found</p>
          <p className="text-sm text-white/40">
            {searchQuery ? 'Try a different search term' : 'Start chatting to build your memory'}
          </p>
        </div>
      )}
    </div>
  );
};

