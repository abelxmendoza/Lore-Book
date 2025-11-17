import { useState, useMemo, useEffect } from 'react';
import { Search, Plus, User } from 'lucide-react';
import { CharacterProfileCard, type Character } from './CharacterProfileCard';
import { CharacterDetailModal } from './CharacterDetailModal';
import { UserProfile } from './UserProfile';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { fetchJson } from '../../lib/api';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';

export const CharacterBook = () => {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const { refreshEntries, refreshTimeline } = useLoreKeeper();

  const loadCharacters = async () => {
    setLoading(true);
    try {
      const response = await fetchJson<{ characters: Character[] }>('/api/characters/list');
      setCharacters(response.characters || []);
    } catch (error) {
      console.error('Failed to load characters:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCharacters();
  }, []);

  const filteredCharacters = useMemo(() => {
    if (!searchTerm.trim()) return characters;
    const term = searchTerm.toLowerCase();
    return characters.filter(
      (char) =>
        char.name.toLowerCase().includes(term) ||
        char.alias?.some((a) => a.toLowerCase().includes(term)) ||
        char.summary?.toLowerCase().includes(term) ||
        char.tags?.some((t) => t.toLowerCase().includes(term)) ||
        char.archetype?.toLowerCase().includes(term) ||
        char.role?.toLowerCase().includes(term)
    );
  }, [characters, searchTerm]);

  return (
    <div className="space-y-6">
      {/* User Profile - Prominently displayed at top */}
      <div className="rounded-2xl border border-border/60 bg-black/40 shadow-panel p-6">
        <UserProfile />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Character Book</h1>
          <p className="text-sm text-white/60 mt-1">
            {characters.length} characters · {filteredCharacters.length} shown
          </p>
        </div>
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={loadCharacters}>
          Refresh
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
        <Input
          type="text"
          placeholder="Search characters by name, alias, tags, or role..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 bg-black/40 border-border/50 text-white placeholder:text-white/40"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-white/60">Loading characters...</div>
      ) : filteredCharacters.length === 0 ? (
        <div className="text-center py-12 text-white/60">
          <User className="h-12 w-12 mx-auto mb-4 text-white/20" />
          <p className="text-lg font-medium mb-2">
            {searchTerm ? 'No characters found' : 'No characters yet'}
          </p>
          <p className="text-sm">
            {searchTerm
              ? 'Try a different search term'
              : 'Characters will appear here as you mention them in your journal entries'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredCharacters.map((character) => (
            <CharacterProfileCard
              key={character.id}
              character={character}
              onClick={() => setSelectedCharacter(character)}
            />
          ))}
        </div>
      )}

      {selectedCharacter && (
        <CharacterDetailModal
          character={selectedCharacter}
          onClose={() => setSelectedCharacter(null)}
          onUpdate={() => {
            void loadCharacters();
            setSelectedCharacter(null);
          }}
        />
      )}
    </div>
  );
};

