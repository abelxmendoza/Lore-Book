import { useState, useEffect } from 'react';
import { X, Save, Instagram, Twitter, Facebook, Linkedin, Github, Globe, Mail, Phone, Calendar, Users, Tag, Sparkles } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Card, CardContent, CardHeader } from '../ui/card';
import { fetchJson } from '../../lib/api';
import type { Character } from './CharacterProfileCard';

type SocialMedia = {
  instagram?: string;
  twitter?: string;
  facebook?: string;
  linkedin?: string;
  github?: string;
  website?: string;
  email?: string;
  phone?: string;
};

type Relationship = {
  id?: string;
  character_id: string;
  character_name?: string;
  relationship_type: string;
  closeness_score?: number;
  summary?: string;
  status?: string;
};

type CharacterDetail = Character & {
  social_media?: SocialMedia;
  relationships?: Relationship[];
  shared_memories?: Array<{
    id: string;
    entry_id: string;
    date: string;
    summary?: string;
  }>;
};

type CharacterDetailModalProps = {
  character: Character;
  onClose: () => void;
  onUpdate: () => void;
};

export const CharacterDetailModal = ({ character, onClose, onUpdate }: CharacterDetailModalProps) => {
  const [editedCharacter, setEditedCharacter] = useState<CharacterDetail>(character as CharacterDetail);
  const [loading, setLoading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [activeTab, setActiveTab] = useState<'info' | 'social' | 'relationships' | 'history'>('info');

  useEffect(() => {
    const loadFullDetails = async () => {
      setLoadingDetails(true);
      try {
        const response = await fetchJson<CharacterDetail>(`/api/characters/${character.id}`);
        setEditedCharacter(response);
      } catch (error) {
        console.error('Failed to load character details:', error);
      } finally {
        setLoadingDetails(false);
      }
    };
    void loadFullDetails();
  }, [character.id]);

  const handleSave = async () => {
    setLoading(true);
    try {
      await fetchJson(`/api/characters/${character.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editedCharacter.name,
          alias: editedCharacter.alias,
          pronouns: editedCharacter.pronouns,
          archetype: editedCharacter.archetype,
          role: editedCharacter.role,
          status: editedCharacter.status,
          summary: editedCharacter.summary,
          tags: editedCharacter.tags,
          social_media: editedCharacter.social_media,
          metadata: editedCharacter.metadata
        })
      });
      onUpdate();
      onClose();
    } catch (error) {
      console.error('Failed to update character:', error);
      alert('Failed to save changes');
    } finally {
      setLoading(false);
    }
  };

  const updateSocialMedia = (field: keyof SocialMedia, value: string) => {
    setEditedCharacter((prev) => ({
      ...prev,
      social_media: {
        ...prev.social_media,
        [field]: value
      }
    }));
  };

  const addTag = (tag: string) => {
    if (tag.trim() && !editedCharacter.tags?.includes(tag.trim())) {
      setEditedCharacter((prev) => ({
        ...prev,
        tags: [...(prev.tags || []), tag.trim()]
      }));
    }
  };

  const removeTag = (tag: string) => {
    setEditedCharacter((prev) => ({
      ...prev,
      tags: prev.tags?.filter((t) => t !== tag) || []
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
      <div className="bg-black border border-border/60 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border/60">
          <div>
            <h2 className="text-2xl font-semibold">{editedCharacter.name}</h2>
            {editedCharacter.alias && editedCharacter.alias.length > 0 && (
              <p className="text-sm text-white/60 mt-1">
                Also known as: {editedCharacter.alias.join(', ')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="flex border-b border-border/60">
            {[
              { key: 'info', label: 'Info' },
              { key: 'social', label: 'Social Media' },
              { key: 'relationships', label: 'Connections' },
              { key: 'history', label: 'History' }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`px-6 py-3 text-sm font-medium transition ${
                  activeTab === tab.key
                    ? 'border-b-2 border-primary text-white'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-6 space-y-6">
            {loadingDetails && (
              <div className="text-center py-8 text-white/60">Loading character details...</div>
            )}
            {!loadingDetails && activeTab === 'info' && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 block">Name</label>
                  <Input
                    value={editedCharacter.name}
                    onChange={(e) => setEditedCharacter((prev) => ({ ...prev, name: e.target.value }))}
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 block">Aliases (comma-separated)</label>
                  <Input
                    value={editedCharacter.alias?.join(', ') || ''}
                    onChange={(e) =>
                      setEditedCharacter((prev) => ({
                        ...prev,
                        alias: e.target.value.split(',').map((a) => a.trim()).filter(Boolean)
                      }))
                    }
                    placeholder="Alias1, Alias2, ..."
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-white/80 mb-2 block">Pronouns</label>
                    <Input
                      value={editedCharacter.pronouns || ''}
                      onChange={(e) => setEditedCharacter((prev) => ({ ...prev, pronouns: e.target.value }))}
                      placeholder="they/them"
                      className="bg-black/40 border-border/50 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-white/80 mb-2 block">Archetype</label>
                    <Input
                      value={editedCharacter.archetype || ''}
                      onChange={(e) => setEditedCharacter((prev) => ({ ...prev, archetype: e.target.value }))}
                      placeholder="mentor, friend, etc."
                      className="bg-black/40 border-border/50 text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 block">Role</label>
                  <Input
                    value={editedCharacter.role || ''}
                    onChange={(e) => setEditedCharacter((prev) => ({ ...prev, role: e.target.value }))}
                    placeholder="colleague, family, etc."
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 block">Summary</label>
                  <Textarea
                    value={editedCharacter.summary || ''}
                    onChange={(e) => setEditedCharacter((prev) => ({ ...prev, summary: e.target.value }))}
                    rows={4}
                    placeholder="Character description and background..."
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 block">Tags</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {editedCharacter.tags?.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 rounded text-xs bg-primary/10 text-primary border border-primary/20 flex items-center gap-1"
                      >
                        {tag}
                        <button onClick={() => removeTag(tag)} className="hover:text-primary/60">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <Input
                    placeholder="Add a tag and press Enter"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTag(e.currentTarget.value);
                        e.currentTarget.value = '';
                      }
                    }}
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>
              </div>
            )}

            {!loadingDetails && activeTab === 'social' && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                    <Instagram className="h-4 w-4" />
                    Instagram
                  </label>
                  <Input
                    value={editedCharacter.social_media?.instagram || ''}
                    onChange={(e) => updateSocialMedia('instagram', e.target.value)}
                    placeholder="@username"
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                    <Twitter className="h-4 w-4" />
                    Twitter/X
                  </label>
                  <Input
                    value={editedCharacter.social_media?.twitter || ''}
                    onChange={(e) => updateSocialMedia('twitter', e.target.value)}
                    placeholder="@username"
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                    <Facebook className="h-4 w-4" />
                    Facebook
                  </label>
                  <Input
                    value={editedCharacter.social_media?.facebook || ''}
                    onChange={(e) => updateSocialMedia('facebook', e.target.value)}
                    placeholder="username or profile URL"
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                    <Linkedin className="h-4 w-4" />
                    LinkedIn
                  </label>
                  <Input
                    value={editedCharacter.social_media?.linkedin || ''}
                    onChange={(e) => updateSocialMedia('linkedin', e.target.value)}
                    placeholder="username or profile URL"
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                    <Github className="h-4 w-4" />
                    GitHub
                  </label>
                  <Input
                    value={editedCharacter.social_media?.github || ''}
                    onChange={(e) => updateSocialMedia('github', e.target.value)}
                    placeholder="username"
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Website
                  </label>
                  <Input
                    value={editedCharacter.social_media?.website || ''}
                    onChange={(e) => updateSocialMedia('website', e.target.value)}
                    placeholder="https://..."
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email
                  </label>
                  <Input
                    type="email"
                    value={editedCharacter.social_media?.email || ''}
                    onChange={(e) => updateSocialMedia('email', e.target.value)}
                    placeholder="email@example.com"
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Phone
                  </label>
                  <Input
                    type="tel"
                    value={editedCharacter.social_media?.phone || ''}
                    onChange={(e) => updateSocialMedia('phone', e.target.value)}
                    placeholder="+1 (555) 123-4567"
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>
              </div>
            )}

            {!loadingDetails && activeTab === 'relationships' && (
              <div className="space-y-6">
                {/* Relationship to You */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Relationship to You
                  </h3>
                  <Card className="bg-gradient-to-br from-primary/10 to-purple-900/20 border-primary/30">
                    <CardContent className="p-4">
                      <div className="space-y-2">
                        {editedCharacter.role && (
                          <div>
                            <span className="text-xs text-white/50 uppercase">Role</span>
                            <p className="text-white font-medium">{editedCharacter.role}</p>
                          </div>
                        )}
                        {editedCharacter.archetype && (
                          <div>
                            <span className="text-xs text-white/50 uppercase">Archetype</span>
                            <p className="text-white font-medium">{editedCharacter.archetype}</p>
                          </div>
                        )}
                        {editedCharacter.summary && (
                          <div>
                            <span className="text-xs text-white/50 uppercase">Summary</span>
                            <p className="text-white/80 text-sm mt-1">{editedCharacter.summary}</p>
                          </div>
                        )}
                        {editedCharacter.relationships && editedCharacter.relationships.length > 0 && (
                          <div>
                            <span className="text-xs text-white/50 uppercase">Closeness</span>
                            {editedCharacter.relationships.find(r => r.character_name === 'You' || !r.character_name) && (
                              <div className="mt-1">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-black/40 rounded-full h-2">
                                    <div 
                                      className="bg-primary h-2 rounded-full"
                                      style={{ 
                                        width: `${((editedCharacter.relationships.find(r => r.character_name === 'You' || !r.character_name)?.closeness_score || 0) / 10) * 100}%` 
                                      }}
                                    />
                                  </div>
                                  <span className="text-sm text-white/70">
                                    {editedCharacter.relationships.find(r => r.character_name === 'You' || !r.character_name)?.closeness_score || 0}/10
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Mutual Connections */}
                {editedCharacter.relationships && editedCharacter.relationships.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary" />
                      Mutual Connections
                    </h3>
                    <div className="space-y-2">
                      {editedCharacter.relationships
                        .filter(rel => rel.character_name && rel.character_name !== 'You')
                        .map((rel) => (
                          <Card key={rel.id} className="bg-black/40 border-border/50">
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium text-white">{rel.character_name}</p>
                                    <span className="text-xs text-primary/70 px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                                      {rel.relationship_type}
                                    </span>
                                  </div>
                                  {rel.summary && <p className="text-sm text-white/60 mt-1">{rel.summary}</p>}
                                </div>
                                {rel.closeness_score !== undefined && (
                                  <div className="text-right ml-4">
                                    <span className="text-xs text-white/50 block">Closeness</span>
                                    <span className="text-sm font-medium text-primary">{rel.closeness_score}/10</span>
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      {editedCharacter.relationships.filter(rel => rel.character_name && rel.character_name !== 'You').length === 0 && (
                        <div className="text-center py-8 text-white/40">
                          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>No mutual connections tracked yet</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!loadingDetails && activeTab === 'history' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-primary" />
                      Shared Timeline & Memories
                    </h3>
                    <p className="text-sm text-white/60 mt-1">
                      Stories and moments you've shared with {editedCharacter.name}
                    </p>
                  </div>
                  {editedCharacter.shared_memories && editedCharacter.shared_memories.length > 0 && (
                    <span className="text-sm text-white/50">
                      {editedCharacter.shared_memories.length} {editedCharacter.shared_memories.length === 1 ? 'memory' : 'memories'}
                    </span>
                  )}
                </div>
                {editedCharacter.shared_memories && editedCharacter.shared_memories.length > 0 ? (
                  <div className="space-y-3">
                    {editedCharacter.shared_memories.map((memory) => (
                      <Card key={memory.id} className="bg-black/40 border-border/50 hover:border-primary/30 transition-colors">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                              <Calendar className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-medium text-primary/80">
                                  {new Date(memory.date).toLocaleDateString('en-US', { 
                                    month: 'short', 
                                    day: 'numeric', 
                                    year: 'numeric' 
                                  })}
                                </span>
                                <span className="text-xs text-white/40">
                                  {new Date(memory.date).toLocaleTimeString('en-US', { 
                                    hour: 'numeric', 
                                    minute: '2-digit' 
                                  })}
                                </span>
                              </div>
                              {memory.summary ? (
                                <p className="text-sm text-white/90 leading-relaxed">{memory.summary}</p>
                              ) : (
                                <p className="text-sm text-white/60 italic">Memory recorded</p>
                              )}
                              {memory.entry_id && (
                                <button 
                                  className="text-xs text-primary/70 hover:text-primary mt-2"
                                  onClick={() => {
                                    // Could navigate to entry if needed
                                    console.log('View entry:', memory.entry_id);
                                  }}
                                >
                                  View full entry →
                                </button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-white/40">
                    <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-lg font-medium mb-1">No shared memories yet</p>
                    <p className="text-sm">Memories will appear here as you mention {editedCharacter.name} in your journal entries</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-6 border-t border-border/60">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading} leftIcon={<Save className="h-4 w-4" />}>
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
};

