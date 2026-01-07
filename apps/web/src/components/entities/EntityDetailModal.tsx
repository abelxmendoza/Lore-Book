// =====================================================
// ENTITY DETAIL MODAL
// Purpose: View entity details, merge conflicts, edit entity
// =====================================================

import { useState } from 'react';
import { X, User, MapPin, Building2, Lightbulb, AlertTriangle, Users, Hash, Clock, Merge, XCircle } from 'lucide-react';
import { Modal } from '../ui/modal';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { EntityProfileCard, type EntityCandidate } from './EntityProfileCard';
import { entityResolutionApi, type EntityConflict, type EntityType } from '../../api/entityResolution';
import { format, parseISO } from 'date-fns';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';

type EntityDetailModalProps = {
  entity: EntityCandidate;
  conflicts: EntityConflict[];
  onClose: () => void;
};

export const EntityDetailModal = ({ entity, conflicts, onClose }: EntityDetailModalProps) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [mergeReason, setMergeReason] = useState('');
  const [isMerging, setIsMerging] = useState(false);
  const [selectedConflict, setSelectedConflict] = useState<EntityConflict | null>(null);

  const getEntityTypeIcon = (type: EntityType) => {
    switch (type) {
      case 'CHARACTER':
      case 'PERSON':
        return <User className="h-5 w-5 text-blue-400" />;
      case 'LOCATION':
        return <MapPin className="h-5 w-5 text-green-400" />;
      case 'ORG':
        return <Building2 className="h-5 w-5 text-purple-400" />;
      case 'CONCEPT':
        return <Lightbulb className="h-5 w-5 text-yellow-400" />;
      default:
        return <Hash className="h-5 w-5 text-primary" />;
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'MMM d, yyyy');
    } catch {
      return dateString;
    }
  };

  const handleMerge = async (conflict: EntityConflict) => {
    if (!mergeReason.trim()) {
      alert('Please provide a reason for merging');
      return;
    }

    setIsMerging(true);
    try {
      // Determine which entity is source and which is target
      // For now, merge conflict.entity_b into conflict.entity_a
      await entityResolutionApi.mergeEntities(
        conflict.entity_b_id,
        conflict.entity_a_id,
        conflict.entity_b_type,
        conflict.entity_a_type,
        mergeReason
      );
      
      // Dismiss the conflict
      await entityResolutionApi.dismissConflict(conflict.id);
      
      onClose();
    } catch (error: any) {
      console.error('Failed to merge entities:', error);
      alert('Failed to merge entities: ' + (error.message || 'Unknown error'));
    } finally {
      setIsMerging(false);
    }
  };

  const handleDismissConflict = async (conflictId: string) => {
    try {
      await entityResolutionApi.dismissConflict(conflictId);
      onClose();
    } catch (error: any) {
      console.error('Failed to dismiss conflict:', error);
      alert('Failed to dismiss conflict: ' + (error.message || 'Unknown error'));
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          {getEntityTypeIcon(entity.entity_type)}
          <span>{entity.primary_name}</span>
          {entity.has_conflicts && (
            <Badge variant="outline" className="bg-orange-500/20 text-orange-400 border-orange-500/30">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {entity.conflict_count} conflict{entity.conflict_count !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      }
      maxWidth="4xl"
    >

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="w-full bg-black/40 border border-border/50">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="conflicts">
              Possible Duplicates
              {conflicts.length > 0 && (
                <Badge variant="outline" className="ml-2 bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs">
                  {conflicts.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-white/70">Entity Type</label>
                <p className="text-white font-medium">{entity.entity_type}</p>
              </div>
              <div>
                <label className="text-sm text-white/70">Usage Count</label>
                <p className="text-white font-medium">{entity.usage_count} references</p>
              </div>
              <div>
                <label className="text-sm text-white/70">Last Seen</label>
                <p className="text-white font-medium">{formatDate(entity.last_seen)}</p>
              </div>
              <div>
                <label className="text-sm text-white/70">Confidence</label>
                <p className="text-white font-medium">{Math.round(entity.confidence * 100)}%</p>
              </div>
            </div>

            {entity.aliases && entity.aliases.length > 0 && (
              <div>
                <label className="text-sm text-white/70 mb-2 block">Aliases</label>
                <div className="flex flex-wrap gap-2">
                  {entity.aliases.map((alias, idx) => (
                    <Badge key={idx} variant="outline" className="bg-primary/10 text-primary/80 border-primary/20">
                      {alias}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="conflicts" className="space-y-4 mt-4">
            {conflicts.length === 0 ? (
              <div className="text-center py-8 text-white/60">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-white/20" />
                <p>No potential duplicates found</p>
              </div>
            ) : (
              conflicts.map((conflict) => {
                const otherEntityId = conflict.entity_a_id === entity.entity_id 
                  ? conflict.entity_b_id 
                  : conflict.entity_a_id;
                const otherEntityType = conflict.entity_a_id === entity.entity_id
                  ? conflict.entity_b_type
                  : conflict.entity_a_type;

                return (
                  <div key={conflict.id} className="border border-border/60 rounded-lg p-4 bg-black/40 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-white font-medium">Potential Duplicate</h4>
                        <p className="text-sm text-white/60">
                          Similarity: {Math.round(conflict.similarity_score * 100)}% · 
                          Reason: {conflict.conflict_reason.replace('_', ' ')}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDismissConflict(conflict.id)}
                          className="text-white/70 hover:text-white"
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Dismiss
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-white/50 mb-2 block">Current Entity</label>
                        <div className="p-3 bg-black/60 rounded border border-border/50">
                          <p className="text-white font-medium">{entity.primary_name}</p>
                          <p className="text-xs text-white/60 mt-1">{entity.entity_type}</p>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-white/50 mb-2 block">Possible Duplicate</label>
                        <div className="p-3 bg-black/60 rounded border border-border/50">
                          <p className="text-white font-medium">Entity {otherEntityId.slice(0, 8)}...</p>
                          <p className="text-xs text-white/60 mt-1">{otherEntityType}</p>
                        </div>
                      </div>
                    </div>

                    {selectedConflict?.id === conflict.id && (
                      <div className="space-y-3 p-4 bg-orange-500/10 border border-orange-500/30 rounded">
                        <div>
                          <label className="text-sm text-white/70 mb-2 block">
                            Reason for merging (required)
                          </label>
                          <Textarea
                            value={mergeReason}
                            onChange={(e) => setMergeReason(e.target.value)}
                            placeholder="Explain why these entities should be merged..."
                            className="bg-black/60 border-border/50 text-white"
                            rows={3}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleMerge(conflict)}
                            disabled={isMerging || !mergeReason.trim()}
                            className="bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border-orange-500/30"
                          >
                            <Merge className="h-4 w-4 mr-1" />
                            {isMerging ? 'Merging...' : 'Confirm Merge'}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setSelectedConflict(null);
                              setMergeReason('');
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}

                    {selectedConflict?.id !== conflict.id && (
                      <Button
                        variant="outline"
                        onClick={() => setSelectedConflict(conflict)}
                        className="w-full border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                      >
                        <Merge className="h-4 w-4 mr-2" />
                        Merge Entities
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </TabsContent>
        </Tabs>
    </Modal>
  );
};

