// =====================================================
// ENTITY LIST PANEL
// Purpose: Display all entities with usage stats
// =====================================================

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Edit, Clock, TrendingUp } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Modal } from '../ui/modal';
import { Input } from '../ui/input';
import { fetchJson } from '../../lib/api';

interface EntityCandidate {
  entity_id: string;
  primary_name: string;
  aliases: string[];
  entity_type: 'CHARACTER' | 'LOCATION' | 'ENTITY' | 'ORG' | 'CONCEPT';
  confidence: number;
  usage_count: number;
  last_seen: string;
  table_name: string;
}

interface EntityListPanelProps {
  entities: EntityCandidate[];
  onRefresh: () => void;
}

export const EntityListPanel: React.FC<EntityListPanelProps> = ({
  entities,
  onRefresh,
}) => {
  const [editingEntity, setEditingEntity] = useState<EntityCandidate | null>(null);
  const [editName, setEditName] = useState('');
  const [loading, setLoading] = useState(false);

  const formatDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'MMM d, yyyy');
    } catch {
      return dateString;
    }
  };

  const getEntityTypeColor = (type: string) => {
    switch (type) {
      case 'CHARACTER':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'LOCATION':
        return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'ORG':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'CONCEPT':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      default:
        return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  const handleEdit = (entity: EntityCandidate) => {
    setEditingEntity(entity);
    setEditName(entity.primary_name);
  };

  const handleSaveEdit = async () => {
    if (!editingEntity || !editName.trim()) return;

    setLoading(true);
    try {
      const result = await fetchJson<{ success: boolean; message?: string; error?: string }>(
        '/api/entity-resolution/edit',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entity_id: editingEntity.entity_id,
            entity_type: editingEntity.entity_type,
            updates: {
              name: editName.trim(),
            },
          }),
        }
      );

      if (result.success) {
        setEditingEntity(null);
        setEditName('');
        onRefresh();
      } else {
        alert(result.error || 'Failed to edit entity');
      }
    } catch (err: any) {
      console.error('Failed to edit entity:', err);
      alert(err.message || 'Failed to edit entity');
    } finally {
      setLoading(false);
    }
  };

  if (entities.length === 0) {
    return (
      <Card className="border-border/60 bg-black/40">
        <CardContent className="pt-6 text-center py-12">
          <p className="text-white/60">No entities found.</p>
          <p className="text-sm text-white/40 mt-2">
            Entities will appear here as you create characters, locations, and other entities.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {entities.map(entity => (
          <Card key={entity.entity_id} className="border-border/60 bg-black/40">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {entity.primary_name}
                    <Badge variant="outline" className={getEntityTypeColor(entity.entity_type)}>
                      {entity.entity_type}
                    </Badge>
                  </CardTitle>
                  {entity.aliases.length > 0 && (
                    <p className="text-sm text-white/60 mt-1">
                      Also known as: {entity.aliases.join(', ')}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEdit(entity)}
                  className="h-auto px-3 py-1.5 text-xs"
                >
                  <Edit className="w-3 h-3 mr-1" />
                  Edit
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-white/60 mb-1">Usage Count</div>
                  <div className="flex items-center gap-1">
                    <TrendingUp className="w-4 h-4" />
                    <span className="font-semibold">{entity.usage_count}</span>
                  </div>
                </div>
                <div>
                  <div className="text-white/60 mb-1">Confidence</div>
                  <div className="font-semibold">
                    {Math.round(entity.confidence * 100)}%
                  </div>
                </div>
                <div>
                  <div className="text-white/60 mb-1">Last Seen</div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span>{formatDate(entity.last_seen)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Modal */}
      {editingEntity && (
        <Modal
          isOpen={true}
          onClose={() => {
            setEditingEntity(null);
            setEditName('');
          }}
          title="Edit Entity"
        >
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Entity Name:</label>
              <Input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="Enter entity name"
                className="w-full"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEditingEntity(null);
                  setEditName('');
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleSaveEdit} disabled={!editName.trim() || loading}>
                Save
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};

