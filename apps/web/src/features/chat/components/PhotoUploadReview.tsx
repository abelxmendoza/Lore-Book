import React, { useState } from 'react';
import { Image, FileText, X, CheckCircle, AlertCircle, Loader2, MapPin, Calendar, User, Tag, Sparkles } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';

interface PhotoAnalysis {
  photoType: 'memory' | 'document' | 'junk';
  confidence: number;
  extractedText?: string;
  suggestedLocation?: {
    type: 'timeline' | 'character' | 'location' | 'memoir' | 'entry';
    id?: string;
    name: string;
    reason: string;
  };
  detectedEntities?: {
    characters?: string[];
    locations?: string[];
    dates?: string[];
  };
  summary?: string;
  metadata?: {
    date?: string;
    location?: string;
    people?: string[];
  };
}

interface PhotoUploadReviewProps {
  photo: File;
  analysis: PhotoAnalysis;
  onApprove: (options: {
    addToLoreBook: boolean;
    extractTextOnly: boolean;
    suggestedLocation?: PhotoAnalysis['suggestedLocation'];
  }) => Promise<void>;
  onReject: () => void;
  loading?: boolean;
}

export const PhotoUploadReview: React.FC<PhotoUploadReviewProps> = ({
  photo,
  analysis,
  onApprove,
  onReject,
  loading = false
}) => {
  const [addToLoreBook, setAddToLoreBook] = useState(analysis.photoType === 'memory');
  const [extractTextOnly, setExtractTextOnly] = useState(analysis.photoType === 'document');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  React.useEffect(() => {
    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(photo);
  }, [photo]);

  const handleApprove = async () => {
    await onApprove({
      addToLoreBook,
      extractTextOnly,
      suggestedLocation: addToLoreBook ? analysis.suggestedLocation : undefined
    });
  };

  const getTypeColor = (type: PhotoAnalysis['photoType']) => {
    switch (type) {
      case 'memory':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'document':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Review Photo</h3>
        <button
          onClick={onReject}
          className="text-white/40 hover:text-white/70 transition-colors"
          disabled={loading}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Photo Preview */}
      {photoPreview && (
        <div className="relative w-full h-48 bg-black/40 rounded-lg overflow-hidden border border-border/60">
          <img
            src={photoPreview}
            alt="Preview"
            className="w-full h-full object-contain"
          />
          <div className="absolute top-2 right-2">
            <Badge className={getTypeColor(analysis.photoType)}>
              {analysis.photoType === 'memory' ? 'Memory Photo' : analysis.photoType === 'document' ? 'Document' : 'Junk'}
            </Badge>
          </div>
        </div>
      )}

      {/* Analysis Results */}
      <Card className="bg-black/40 border-border/60 p-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-white">AI Analysis</span>
            <Badge className="text-[10px] px-1.5 py-0.5">
              {(analysis.confidence * 100).toFixed(0)}% confidence
            </Badge>
          </div>

          {analysis.summary && (
            <p className="text-xs text-white/70">{analysis.summary}</p>
          )}

          {analysis.suggestedLocation && (
            <div className="p-2 bg-primary/10 border border-primary/30 rounded">
              <p className="text-xs text-primary/80 mb-1">Suggested Location:</p>
              <p className="text-xs text-white/90 font-medium">{analysis.suggestedLocation.name}</p>
              <p className="text-xs text-white/60 mt-1">{analysis.suggestedLocation.reason}</p>
            </div>
          )}

          {analysis.detectedEntities && (
            <div className="space-y-2">
              {analysis.detectedEntities.characters && analysis.detectedEntities.characters.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <User className="w-3 h-3 text-white/60" />
                  <span className="text-xs text-white/60">People:</span>
                  {analysis.detectedEntities.characters.map((char, idx) => (
                    <Badge key={idx} variant="outline" className="text-[10px]">
                      {char}
                    </Badge>
                  ))}
                </div>
              )}
              {analysis.detectedEntities.locations && analysis.detectedEntities.locations.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <MapPin className="w-3 h-3 text-white/60" />
                  <span className="text-xs text-white/60">Locations:</span>
                  {analysis.detectedEntities.locations.map((loc, idx) => (
                    <Badge key={idx} variant="outline" className="text-[10px]">
                      {loc}
                    </Badge>
                  ))}
                </div>
              )}
              {analysis.detectedEntities.dates && analysis.detectedEntities.dates.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Calendar className="w-3 h-3 text-white/60" />
                  <span className="text-xs text-white/60">Dates:</span>
                  {analysis.detectedEntities.dates.map((date, idx) => (
                    <Badge key={idx} variant="outline" className="text-[10px]">
                      {date}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {analysis.metadata && (
            <div className="space-y-1 text-xs text-white/60">
              {analysis.metadata.date && (
                <p><Calendar className="w-3 h-3 inline mr-1" />{analysis.metadata.date}</p>
              )}
              {analysis.metadata.location && (
                <p><MapPin className="w-3 h-3 inline mr-1" />{analysis.metadata.location}</p>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Extracted Text (for documents) */}
      {analysis.extractedText && (
        <Card className="bg-black/40 border-border/60 p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-white">Extracted Text</span>
          </div>
          <p className="text-xs text-white/70 whitespace-pre-wrap max-h-32 overflow-y-auto">
            {analysis.extractedText.substring(0, 500)}
            {analysis.extractedText.length > 500 && '...'}
          </p>
        </Card>
      )}

      {/* Action Options */}
      <div className="space-y-3">
        {analysis.photoType === 'document' && (
          <label className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg cursor-pointer hover:bg-blue-500/15 transition-colors">
            <input
              type="checkbox"
              checked={extractTextOnly}
              onChange={(e) => {
                setExtractTextOnly(e.target.checked);
                if (e.target.checked) setAddToLoreBook(false);
              }}
              className="mt-0.5 w-4 h-4 rounded border-border/60 bg-black/40 text-primary focus:ring-primary/50"
            />
            <div className="flex-1">
              <p className="text-xs font-medium text-white">Extract text only (don't store photo)</p>
              <p className="text-xs text-white/60 mt-0.5">Useful for documents, screenshots, or photos of text</p>
            </div>
          </label>
        )}

        {analysis.photoType === 'memory' && (
          <label className="flex items-start gap-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg cursor-pointer hover:bg-green-500/15 transition-colors">
            <input
              type="checkbox"
              checked={addToLoreBook}
              onChange={(e) => {
                setAddToLoreBook(e.target.checked);
                if (e.target.checked) setExtractTextOnly(false);
              }}
              className="mt-0.5 w-4 h-4 rounded border-border/60 bg-black/40 text-primary focus:ring-primary/50"
            />
            <div className="flex-1">
              <p className="text-xs font-medium text-white">Add to Lore Book</p>
              <p className="text-xs text-white/60 mt-0.5">
                {analysis.suggestedLocation 
                  ? `Will be added to: ${analysis.suggestedLocation.name}`
                  : 'Photo will be stored and linked to your memories'}
              </p>
            </div>
          </label>
        )}

        {analysis.photoType === 'junk' && (
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-medium text-yellow-400">Low relevance detected</p>
                <p className="text-xs text-yellow-200/70 mt-0.5">
                  This photo appears to be a screenshot, low quality, or not relevant to your story. You can still add it if needed.
                </p>
              </div>
            </div>
            <label className="flex items-start gap-3 mt-3 cursor-pointer">
              <input
                type="checkbox"
                checked={addToLoreBook}
                onChange={(e) => setAddToLoreBook(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-border/60 bg-black/40 text-primary focus:ring-primary/50"
              />
              <span className="text-xs text-white/70">Add anyway</span>
            </label>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-border/60">
        <Button
          variant="outline"
          size="sm"
          onClick={onReject}
          disabled={loading}
        >
          Skip
        </Button>
        <Button
          size="sm"
          onClick={handleApprove}
          disabled={loading || (!addToLoreBook && !extractTextOnly)}
          leftIcon={loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
        >
          {loading 
            ? 'Processing...' 
            : extractTextOnly 
              ? 'Extract Text' 
              : addToLoreBook 
                ? 'Add to Lore Book' 
                : 'Process'}
        </Button>
      </div>
    </div>
  );
};
