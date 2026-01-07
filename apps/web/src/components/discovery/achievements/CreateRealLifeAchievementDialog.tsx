import React, { useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { achievementsApi } from '../../../api/achievements';
import type { AchievementRarity } from '../../../types/achievement';
// Import RARITY_COLORS from AchievementsPanel
const RARITY_COLORS: Record<AchievementRarity, { 
  bg: string; 
  border: string; 
  text: string; 
  icon: string;
  gradient: string;
  glow: string;
  iconBg: string;
}> = {
  common: { 
    bg: 'bg-gray-500/10', 
    border: 'border-gray-500/30', 
    text: 'text-gray-300', 
    icon: 'text-gray-400',
    gradient: 'from-gray-500/20 to-gray-600/10',
    glow: 'shadow-gray-500/20',
    iconBg: 'bg-gray-500/20'
  },
  uncommon: { 
    bg: 'bg-green-500/10', 
    border: 'border-green-500/30', 
    text: 'text-green-300', 
    icon: 'text-green-400',
    gradient: 'from-green-500/20 to-emerald-600/10',
    glow: 'shadow-green-500/20',
    iconBg: 'bg-green-500/20'
  },
  rare: { 
    bg: 'bg-blue-500/10', 
    border: 'border-blue-500/30', 
    text: 'text-blue-300', 
    icon: 'text-blue-400',
    gradient: 'from-blue-500/20 to-cyan-600/10',
    glow: 'shadow-blue-500/20',
    iconBg: 'bg-blue-500/20'
  },
  epic: { 
    bg: 'bg-purple-500/10', 
    border: 'border-purple-500/30', 
    text: 'text-purple-300', 
    icon: 'text-purple-400',
    gradient: 'from-purple-500/20 to-pink-600/10',
    glow: 'shadow-purple-500/30',
    iconBg: 'bg-purple-500/20'
  },
  legendary: { 
    bg: 'bg-yellow-500/10', 
    border: 'border-yellow-500/30', 
    text: 'text-yellow-300', 
    icon: 'text-yellow-400',
    gradient: 'from-yellow-500/30 via-orange-500/20 to-amber-600/10',
    glow: 'shadow-yellow-500/40',
    iconBg: 'bg-gradient-to-br from-yellow-500/30 to-orange-500/20'
  }
};

interface CreateRealLifeAchievementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const LIFE_CATEGORIES = [
  'career', 'education', 'health', 'relationships', 'creative',
  'financial', 'personal_growth', 'travel', 'hobby', 'other'
] as const;

export const CreateRealLifeAchievementDialog: React.FC<CreateRealLifeAchievementDialogProps> = ({
  open,
  onOpenChange,
  onSuccess
}) => {
  const [formData, setFormData] = useState({
    achievement_name: '',
    description: '',
    achievement_date: new Date().toISOString().split('T')[0],
    life_category: 'other' as typeof LIFE_CATEGORIES[number],
    significance_score: 0.5,
    impact_description: '',
    verified: false,
    icon_name: 'award'
  });

  const [previewRarity, setPreviewRarity] = useState<AchievementRarity | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCalculateRarity = async () => {
    try {
      setLoading(true);
      const rarity = await achievementsApi.calculateRarity({
        life_category: formData.life_category,
        achievement_name: formData.achievement_name,
        significance_score: formData.significance_score,
        verified: formData.verified,
        impact_description: formData.impact_description
      });
      setPreviewRarity(rarity);
    } catch (err) {
      console.error('Failed to calculate rarity:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await achievementsApi.createRealLifeAchievement({
        ...formData,
        achievement_date: new Date(formData.achievement_date).toISOString()
      });
      onSuccess();
      // Reset form
      setFormData({
        achievement_name: '',
        description: '',
        achievement_date: new Date().toISOString().split('T')[0],
        life_category: 'other',
        significance_score: 0.5,
        impact_description: '',
        verified: false,
        icon_name: 'award'
      });
      setPreviewRarity(null);
    } catch (err: any) {
      setError(err.message || 'Failed to create achievement');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const rarityColors = previewRarity ? RARITY_COLORS[previewRarity] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-black/95 border-purple-500/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-2xl text-white">Add Real-Life Achievement</CardTitle>
            <CardDescription className="text-white/70">
              Document a real accomplishment from your life
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            className="text-white/60 hover:text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Achievement Name */}
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                Achievement Name *
              </label>
              <input
                type="text"
                required
                value={formData.achievement_name}
                onChange={(e) => setFormData({ ...formData, achievement_name: e.target.value })}
                className="w-full px-4 py-2 bg-black/40 border border-white/10 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:border-purple-500/50"
                placeholder="e.g., Graduated University, Quit Smoking"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                Description *
              </label>
              <textarea
                required
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-2 bg-black/40 border border-white/10 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:border-purple-500/50 min-h-[80px]"
                placeholder="Describe what you achieved..."
              />
            </div>

            {/* Achievement Date */}
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                Achievement Date *
              </label>
              <input
                type="date"
                required
                value={formData.achievement_date}
                onChange={(e) => setFormData({ ...formData, achievement_date: e.target.value })}
                className="w-full px-4 py-2 bg-black/40 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-500/50"
              />
            </div>

            {/* Life Category */}
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                Life Category *
              </label>
              <select
                required
                value={formData.life_category}
                onChange={(e) => setFormData({ ...formData, life_category: e.target.value as typeof LIFE_CATEGORIES[number] })}
                className="w-full px-4 py-2 bg-black/40 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-500/50"
              >
                {LIFE_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>
                    {cat.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                  </option>
                ))}
              </select>
            </div>

            {/* Significance Score */}
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                Significance Score: {Math.round(formData.significance_score * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={formData.significance_score}
                onChange={(e) => setFormData({ ...formData, significance_score: parseFloat(e.target.value) })}
                className="w-full"
              />
              <p className="text-xs text-white/50 mt-1">
                How significant was this achievement to you? (0% = minor, 100% = life-changing)
              </p>
            </div>

            {/* Impact Description */}
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                Impact Description
              </label>
              <textarea
                value={formData.impact_description}
                onChange={(e) => setFormData({ ...formData, impact_description: e.target.value })}
                className="w-full px-4 py-2 bg-black/40 border border-white/10 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:border-purple-500/50 min-h-[80px]"
                placeholder="How did this achievement impact your life?"
              />
            </div>

            {/* Verified */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="verified"
                checked={formData.verified}
                onChange={(e) => setFormData({ ...formData, verified: e.target.checked })}
                className="h-4 w-4 rounded border-white/10 bg-black/40 text-purple-500 focus:ring-purple-500"
              />
              <label htmlFor="verified" className="text-sm text-white/70">
                Verified (I can provide evidence for this achievement)
              </label>
            </div>

            {/* Preview Rarity */}
            <div className="flex items-center gap-4">
              <Button
                type="button"
                onClick={handleCalculateRarity}
                disabled={loading || !formData.achievement_name || !formData.life_category}
                className="bg-purple-500/20 text-purple-400 border-purple-500/40 hover:bg-purple-500/30"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Preview Rarity
              </Button>
              {previewRarity && rarityColors && (
                <Badge className={`${rarityColors.bg} ${rarityColors.border} ${rarityColors.text} border`}>
                  {previewRarity.charAt(0).toUpperCase() + previewRarity.slice(1)}
                </Badge>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Submit Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="text-white/60 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-purple-500/20 text-purple-400 border-purple-500/40 hover:bg-purple-500/30"
              >
                {loading ? 'Creating...' : 'Create Achievement'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

