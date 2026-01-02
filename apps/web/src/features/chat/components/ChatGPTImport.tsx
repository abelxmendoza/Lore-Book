import React, { useState, useRef } from 'react';
import { MessageSquare, AlertTriangle, CheckCircle, X, Loader2, FileText, Eye, EyeOff } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Textarea } from '../../../components/ui/textarea';
import { Card } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';

interface ImportedFact {
  id: string;
  text: string;
  confidence: 'high' | 'medium' | 'low';
  verificationStatus: 'unverified' | 'verified' | 'contradicted' | 'ambiguous';
  contradictions?: Array<{ entryId: string; text: string }>;
  evidence?: Array<{ entryId: string; text: string }>;
  source: string; // Which part of the ChatGPT conversation
}

interface ChatGPTImportProps {
  onImportComplete?: (stats: { factsAdded: number; contradictionsFound: number; verified: number }) => void;
  onImportError?: (error: string) => void;
}

export const ChatGPTImport: React.FC<ChatGPTImportProps> = ({
  onImportComplete,
  onImportError
}) => {
  const [conversationText, setConversationText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [importedFacts, setImportedFacts] = useState<ImportedFact[]>([]);
  const [showReview, setShowReview] = useState(false);
  const [selectedFacts, setSelectedFacts] = useState<Set<string>>(new Set());
  const [showDetails, setShowDetails] = useState<Set<string>>(new Set());

  const handlePaste = async () => {
    if (!conversationText.trim()) {
      onImportError?.('Please paste a ChatGPT conversation');
      return;
    }

    setIsProcessing(true);
    try {
      const { supabase } = await import('../../../lib/supabase');
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      if (!token) {
        throw new Error('Authentication required. Please log in.');
      }

      const response = await fetch('/api/documents/import-chatgpt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          conversation: conversationText
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'Failed to process conversation');
      }

      const data = await response.json();
      setImportedFacts(data.facts || []);
      setShowReview(true);
      
      // Auto-select all facts by default
      setSelectedFacts(new Set(data.facts?.map((f: ImportedFact) => f.id) || []));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to process conversation';
      onImportError?.(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImportSelected = async () => {
    if (selectedFacts.size === 0) {
      onImportError?.('Please select at least one fact to import');
      return;
    }

    setIsProcessing(true);
    try {
      const { supabase } = await import('../../../lib/supabase');
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      if (!token) {
        throw new Error('Authentication required. Please log in.');
      }

      const factsToImport = importedFacts.filter(f => selectedFacts.has(f.id));

      const response = await fetch('/api/documents/import-facts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          facts: factsToImport
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'Failed to import facts');
      }

      const data = await response.json();
      onImportComplete?.({
        factsAdded: data.factsAdded || 0,
        contradictionsFound: data.contradictionsFound || 0,
        verified: data.verified || 0
      });

      // Reset
      setConversationText('');
      setImportedFacts([]);
      setShowReview(false);
      setSelectedFacts(new Set());
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to import facts';
      onImportError?.(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleFactSelection = (factId: string) => {
    setSelectedFacts(prev => {
      const next = new Set(prev);
      if (next.has(factId)) {
        next.delete(factId);
      } else {
        next.add(factId);
      }
      return next;
    });
  };

  const toggleDetails = (factId: string) => {
    setShowDetails(prev => {
      const next = new Set(prev);
      if (next.has(factId)) {
        next.delete(factId);
      } else {
        next.add(factId);
      }
      return next;
    });
  };

  const getStatusColor = (status: ImportedFact['verificationStatus']) => {
    switch (status) {
      case 'verified':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'contradicted':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'ambiguous':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default:
        return 'bg-white/10 text-white/60 border-white/20';
    }
  };

  const getConfidenceColor = (confidence: ImportedFact['confidence']) => {
    switch (confidence) {
      case 'high':
        return 'bg-primary/20 text-primary border-primary/30';
      case 'medium':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default:
        return 'bg-white/10 text-white/60 border-white/20';
    }
  };

  if (showReview && importedFacts.length > 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">
            Review Imported Information ({selectedFacts.size} of {importedFacts.length} selected)
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowReview(false);
              setImportedFacts([]);
            }}
            className="text-white/60 hover:text-white"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {importedFacts.map((fact) => (
            <Card
              key={fact.id}
              className={`p-4 border ${
                selectedFacts.has(fact.id)
                  ? 'border-primary/50 bg-primary/5'
                  : 'border-border/60 bg-black/20'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selectedFacts.has(fact.id)}
                  onChange={() => toggleFactSelection(fact.id)}
                  className="mt-1 w-4 h-4 rounded border-border/60 bg-black/40 text-primary focus:ring-primary/50"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm text-white/90 flex-1">{fact.text}</p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge className={getStatusColor(fact.verificationStatus)}>
                        {fact.verificationStatus}
                      </Badge>
                      <Badge className={getConfidenceColor(fact.confidence)}>
                        {fact.confidence} confidence
                      </Badge>
                    </div>
                  </div>

                  {(fact.contradictions?.length > 0 || fact.evidence?.length > 0) && (
                    <button
                      onClick={() => toggleDetails(fact.id)}
                      className="text-xs text-primary/70 hover:text-primary flex items-center gap-1 mt-2"
                    >
                      {showDetails.has(fact.id) ? (
                        <>
                          <EyeOff className="w-3 h-3" />
                          Hide details
                        </>
                      ) : (
                        <>
                          <Eye className="w-3 h-3" />
                          Show details
                        </>
                      )}
                    </button>
                  )}

                  {showDetails.has(fact.id) && (
                    <div className="mt-3 space-y-2 text-xs">
                      {fact.contradictions && fact.contradictions.length > 0 && (
                        <div className="p-2 bg-red-500/10 border border-red-500/30 rounded">
                          <p className="text-red-400 font-medium mb-1">⚠️ Contradictions Found:</p>
                          {fact.contradictions.map((cont, idx) => (
                            <p key={idx} className="text-red-300/70 text-[11px]">
                              • {cont.text.substring(0, 150)}...
                            </p>
                          ))}
                        </div>
                      )}
                      {fact.evidence && fact.evidence.length > 0 && (
                        <div className="p-2 bg-green-500/10 border border-green-500/30 rounded">
                          <p className="text-green-400 font-medium mb-1">✓ Supporting Evidence:</p>
                          {fact.evidence.map((ev, idx) => (
                            <p key={idx} className="text-green-300/70 text-[11px]">
                              • {ev.text.substring(0, 150)}...
                            </p>
                          ))}
                        </div>
                      )}
                      <p className="text-white/40 text-[11px]">Source: {fact.source}</p>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border/60">
          <p className="text-xs text-white/50">
            Select facts to import. Contradicted facts will be flagged for review.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowReview(false);
                setImportedFacts([]);
              }}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleImportSelected}
              disabled={isProcessing || selectedFacts.size === 0}
              leftIcon={isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            >
              {isProcessing ? 'Importing...' : `Import ${selectedFacts.size} Fact${selectedFacts.size !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-white">Import ChatGPT Conversation</h3>
      </div>

      <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-yellow-200/80">
            <p className="font-medium mb-1">Fact-Checking Enabled</p>
            <p>All imported information will be automatically verified against your existing memories. Contradictions will be flagged for review.</p>
          </div>
        </div>
      </div>

      <Textarea
        placeholder="Paste your ChatGPT conversation here... (Copy the entire conversation from ChatGPT)"
        value={conversationText}
        onChange={(e) => setConversationText(e.target.value)}
        disabled={isProcessing}
        className="min-h-[200px] bg-black/40 border-border/50 text-white placeholder:text-white/40 resize-none"
      />

      <div className="flex items-center justify-between">
        <p className="text-xs text-white/50">
          The AI will extract facts, verify them, and flag any contradictions
        </p>
        <Button
          onClick={handlePaste}
          disabled={!conversationText.trim() || isProcessing}
          leftIcon={isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          size="sm"
        >
          {isProcessing ? 'Processing...' : 'Process Conversation'}
        </Button>
      </div>
    </div>
  );
};
