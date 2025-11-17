import { useState, useMemo, useEffect } from 'react';
import { Search, Plus, User, AlertCircle, RefreshCw, Bug } from 'lucide-react';
import { CharacterProfileCard, type Character } from './CharacterProfileCard';
import { CharacterDetailModal } from './CharacterDetailModal';
import { UserProfile } from './UserProfile';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent } from '../ui/card';
import { fetchJson } from '../../lib/api';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';
import { ColorCodedTimeline } from '../timeline/ColorCodedTimeline';

const DEBUG = true; // Set to false in production

const debugLog = (component: string, message: string, data?: any) => {
  if (DEBUG) {
    console.log(`[CharacterBook:${component}]`, message, data || '');
  }
};

const debugError = (component: string, message: string, error: any) => {
  console.error(`[CharacterBook:${component}] ERROR:`, message, error);
  if (DEBUG) {
    console.error('Error details:', {
      message: error?.message,
      stack: error?.stack,
      response: error?.response,
      status: error?.status
    });
  }
};

export const CharacterBook = () => {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; details?: any } | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const { entries = [], chapters = [], timeline, refreshEntries, refreshTimeline } = useLoreKeeper();

  const loadCharacters = async (retryAttempt = 0) => {
    debugLog('loadCharacters', `Starting load (attempt ${retryAttempt + 1})`);
    setLoading(true);
    setError(null);
    
    try {
      debugLog('loadCharacters', 'Fetching from /api/characters/list');
      const response = await fetchJson<{ characters: Character[] }>('/api/characters/list');
      debugLog('loadCharacters', 'Response received', { count: response.characters?.length || 0 });
      
      if (!response) {
        throw new Error('Empty response from server');
      }
      
      const characterList = response.characters || [];
      setCharacters(characterList);
      setRetryCount(0);
      debugLog('loadCharacters', 'Successfully loaded characters', { count: characterList.length });
    } catch (error: any) {
      debugError('loadCharacters', 'Failed to load characters', error);
      
      const errorMessage = error?.message || 'Failed to load characters';
      const errorDetails = {
        status: error?.status,
        response: error?.response,
        stack: DEBUG ? error?.stack : undefined
      };
      
      setError({
        message: errorMessage,
        details: errorDetails
      });
      
      // Auto-retry once after 2 seconds
      if (retryAttempt === 0) {
        debugLog('loadCharacters', 'Scheduling retry in 2 seconds');
        setTimeout(() => {
          void loadCharacters(1);
        }, 2000);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    debugLog('useEffect', 'Component mounted, loading characters');
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
      {/* User Profile & Insights - Displayed first */}
      <div className="space-y-4">
        <UserProfile />
      </div>

      {/* Character Search Bar - Right under user profile */}
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            type="text"
            placeholder="Search characters by name, alias, tags, or role..."
            value={searchTerm}
            onChange={(e) => {
              debugLog('search', 'Search term changed', e.target.value);
              setSearchTerm(e.target.value);
            }}
            className="pl-10 bg-black/40 border-border/50 text-white placeholder:text-white/40"
          />
        </div>
        
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Character Book</h2>
            <p className="text-sm text-white/60 mt-1">
              {characters.length} characters · {filteredCharacters.length} shown
              {loading && ' · Loading...'}
            </p>
          </div>
          <Button 
            leftIcon={<Plus className="h-4 w-4" />} 
            onClick={() => void loadCharacters()}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Debug Info */}
      {DEBUG && (
        <Card className="bg-yellow-950/20 border-yellow-500/30">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs text-yellow-300/80">
              <Bug className="h-3 w-3" />
              <span>DEBUG MODE</span>
              <span className="text-yellow-300/60">·</span>
              <span>Characters: {characters.length}</span>
              <span className="text-yellow-300/60">·</span>
              <span>Loading: {loading ? 'Yes' : 'No'}</span>
              <span className="text-yellow-300/60">·</span>
              <span>Error: {error ? 'Yes' : 'No'}</span>
              {retryCount > 0 && (
                <>
                  <span className="text-yellow-300/60">·</span>
                  <span>Retries: {retryCount}</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Display */}
      {error && (
        <Card className="bg-red-950/20 border-red-500/30">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-red-400 mb-1">Error Loading Characters</h3>
                <p className="text-sm text-white/80 mb-2">{error.message}</p>
                {DEBUG && error.details && (
                  <details className="mt-2">
                    <summary className="text-xs text-white/60 cursor-pointer hover:text-white/80">
                      Debug Details
                    </summary>
                    <pre className="mt-2 text-xs text-white/60 bg-black/40 p-2 rounded overflow-auto">
                      {JSON.stringify(error.details, null, 2)}
                    </pre>
                  </details>
                )}
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void loadCharacters()}
                    leftIcon={<RefreshCw className="h-3 w-3" />}
                  >
                    Retry
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && !error ? (
        <div className="text-center py-12 text-white/60">
          <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-primary" />
          <p>Loading characters...</p>
        </div>
      ) : error && characters.length === 0 ? (
        <div className="text-center py-12 text-white/60">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-400/50" />
          <p className="text-lg font-medium mb-2">Failed to load characters</p>
          <p className="text-sm mb-4">{error.message}</p>
          <Button onClick={() => void loadCharacters()} leftIcon={<RefreshCw className="h-4 w-4" />}>
            Try Again
          </Button>
        </div>
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
          {filteredCharacters.map((character, index) => {
            try {
              return (
                <CharacterProfileCard
                  key={character.id || `char-${index}`}
                  character={character}
                  onClick={() => {
                    debugLog('characterClick', 'Character selected', character.name);
                    setSelectedCharacter(character);
                  }}
                />
              );
            } catch (cardError) {
              debugError('renderCharacter', `Failed to render character ${character.name}`, cardError);
              return (
                <Card key={`error-${index}`} className="bg-red-950/20 border-red-500/30">
                  <CardContent className="p-4">
                    <p className="text-xs text-red-400">Error rendering character</p>
                    <p className="text-xs text-white/60 mt-1">{character.name}</p>
                  </CardContent>
                </Card>
              );
            }
          })}
        </div>
      )}

      {/* Horizontal Timeline Component */}
      {(chapters.length > 0 || entries.length > 0) && (
        <div className="mt-8">
          <Card className="bg-black/40 border-border/60">
            <CardContent className="p-0">
              <ColorCodedTimeline
                chapters={chapters.map(ch => ({
                  id: ch.id,
                  title: ch.title,
                  start_date: ch.start_date,
                  end_date: ch.end_date || null,
                  description: ch.description || null,
                  summary: ch.summary || null
                }))}
                entries={entries.map(entry => ({
                  id: entry.id,
                  content: entry.content,
                  date: entry.date,
                  chapter_id: entry.chapter_id || null
                }))}
                showLabel={true}
                onItemClick={(item) => {
                  debugLog('timelineClick', 'Timeline item clicked', item);
                  // Could navigate to entry or chapter if needed
                }}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {selectedCharacter && (
        <CharacterDetailModal
          character={selectedCharacter}
          onClose={() => {
            debugLog('modal', 'Modal closed');
            setSelectedCharacter(null);
          }}
          onUpdate={() => {
            debugLog('modal', 'Character updated, reloading');
            void loadCharacters();
            setSelectedCharacter(null);
          }}
        />
      )}
    </div>
  );
};

