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
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs sm:text-sm font-semibold text-white flex-1 min-w-0">
            <span className="hidden sm:inline">Review Imported Information </span>
            <span className="sm:hidden">Review </span>
            ({selectedFacts.size}/{importedFacts.length})
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowReview(false);
              setImportedFacts([]);
            }}
            className="text-white/60 hover:text-white flex-shrink-0 p-1.5 sm:p-2"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="space-y-2 sm:space-y-3 max-h-[300px] sm:max-h-[400px] overflow-y-auto">
          {importedFacts.map((fact) => (
            <Card
              key={fact.id}
              className={`p-3 sm:p-4 border ${
                selectedFacts.has(fact.id)
                  ? 'border-primary/50 bg-primary/5'
                  : 'border-border/60 bg-black/20'
              }`}
            >
              <div className="flex items-start gap-2 sm:gap-3">
                <input
                  type="checkbox"
                  checked={selectedFacts.has(fact.id)}
                  onChange={() => toggleFactSelection(fact.id)}
                  className="mt-1 w-4 h-4 sm:w-5 sm:h-5 rounded border-border/60 bg-black/40 text-primary focus:ring-primary/50 flex-shrink-0 touch-manipulation"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2">
                    <p className="text-xs sm:text-sm text-white/90 flex-1 break-words">{fact.text}</p>
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 flex-shrink-0">
                      <Badge className={`${getStatusColor(fact.verificationStatus)} text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5`}>
                        <span className="hidden sm:inline">{fact.verificationStatus}</span>
                        <span className="sm:hidden">{fact.verificationStatus.substring(0, 4)}</span>
                      </Badge>
                      <Badge className={`${getConfidenceColor(fact.confidence)} text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5`}>
                        <span className="hidden sm:inline">{fact.confidence} confidence</span>
                        <span className="sm:hidden">{fact.confidence}</span>
                      </Badge>
                    </div>
                  </div>

                  {(fact.contradictions?.length > 0 || fact.evidence?.length > 0) && (
                    <button
                      onClick={() => toggleDetails(fact.id)}
                      className="text-[10px] sm:text-xs text-primary/70 hover:text-primary flex items-center gap-1 mt-2 touch-manipulation"
                    >
                      {showDetails.has(fact.id) ? (
                        <>
                          <EyeOff className="w-3 h-3" />
                          <span className="hidden sm:inline">Hide details</span>
                          <span className="sm:hidden">Hide</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3 h-3" />
                          <span className="hidden sm:inline">Show details</span>
                          <span className="sm:hidden">Details</span>
                        </>
                      )}
                    </button>
                  )}

                  {showDetails.has(fact.id) && (
                    <div className="mt-2 sm:mt-3 space-y-2 text-[10px] sm:text-xs">
                      {fact.contradictions && fact.contradictions.length > 0 && (
                        <div className="p-2 bg-red-500/10 border border-red-500/30 rounded">
                          <p className="text-red-400 font-medium mb-1">⚠️ Contradictions:</p>
                          {fact.contradictions.map((cont, idx) => (
                            <p key={idx} className="text-red-300/70 break-words">
                              • {cont.text.substring(0, 100)}...
                            </p>
                          ))}
                        </div>
                      )}
                      {fact.evidence && fact.evidence.length > 0 && (
                        <div className="p-2 bg-green-500/10 border border-green-500/30 rounded">
                          <p className="text-green-400 font-medium mb-1">✓ Evidence:</p>
                          {fact.evidence.map((ev, idx) => (
                            <p key={idx} className="text-green-300/70 break-words">
                              • {ev.text.substring(0, 100)}...
                            </p>
                          ))}
                        </div>
                      )}
                      <p className="text-white/40 break-words">Source: {fact.source}</p>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-border/60">
          <p className="text-[10px] sm:text-xs text-white/50">
            Select facts to import. Contradicted facts will be flagged for review.
          </p>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowReview(false);
                setImportedFacts([]);
              }}
              disabled={isProcessing}
              className="flex-1 sm:flex-initial text-xs sm:text-sm"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleImportSelected}
              disabled={isProcessing || selectedFacts.size === 0}
              leftIcon={isProcessing ? <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" /> : <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4" />}
              className="flex-1 sm:flex-initial text-xs sm:text-sm"
            >
              {isProcessing ? 'Importing...' : (
                <>
                  <span className="hidden sm:inline">Import {selectedFacts.size} Fact{selectedFacts.size !== 1 ? 's' : ''}</span>
                  <span className="sm:hidden">Import ({selectedFacts.size})</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 sm:space-y-3">
      <div className="flex items-center gap-2 mb-1 sm:mb-2">
        <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
        <h3 className="text-xs sm:text-sm font-semibold text-white">Import ChatGPT Conversation</h3>
      </div>

      <div className="p-2.5 sm:p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="text-[10px] sm:text-xs text-yellow-200/80">
            <p className="font-medium mb-1">Fact-Checking Enabled</p>
            <p className="leading-relaxed">All imported information will be automatically verified against your existing memories. Contradictions will be flagged for review.</p>
          </div>
        </div>
      </div>

      <Textarea
        placeholder="Paste your ChatGPT conversation here..."
        value={conversationText}
        onChange={(e) => setConversationText(e.target.value)}
        disabled={isProcessing}
        className="min-h-[120px] sm:min-h-[150px] lg:min-h-[200px] bg-black/40 border-border/50 text-white placeholder:text-white/40 resize-none text-xs sm:text-sm px-3 sm:px-4 py-2.5 sm:py-3"
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
        <p className="text-[10px] sm:text-xs text-white/50 order-2 sm:order-1">
          The AI will extract facts, verify them, and flag any contradictions
        </p>
        <Button
          onClick={handlePaste}
          disabled={!conversationText.trim() || isProcessing}
          leftIcon={isProcessing ? <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" /> : <FileText className="w-3 h-3 sm:w-4 sm:h-4" />}
          size="sm"
          className="w-full sm:w-auto order-1 sm:order-2 text-xs sm:text-sm"
        >
          {isProcessing ? 'Processing...' : (
            <>
              <span className="hidden sm:inline">Process Conversation</span>
              <span className="sm:hidden">Process</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
