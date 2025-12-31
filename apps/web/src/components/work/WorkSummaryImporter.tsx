import React, { useState } from 'react';
import { X, FileText, Sparkles, CheckCircle2, Loader2, AlertTriangle, Zap } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { skillsApi } from '../../api/skills';
import { fetchJson } from '../../lib/api';
import type { Skill, SkillCategory } from '../../types/skill';

interface WorkSummaryImporterProps {
  onClose: () => void;
  onSuccess?: () => void;
}

const CATEGORY_COLORS: Record<SkillCategory, string> = {
  professional: 'bg-blue-500/20 border-blue-500/50 text-blue-300',
  creative: 'bg-purple-500/20 border-purple-500/50 text-purple-300',
  physical: 'bg-green-500/20 border-green-500/50 text-green-300',
  social: 'bg-pink-500/20 border-pink-500/50 text-pink-300',
  intellectual: 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300',
  emotional: 'bg-red-500/20 border-red-500/50 text-red-300',
  practical: 'bg-orange-500/20 border-orange-500/50 text-orange-300',
  artistic: 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300',
  technical: 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300',
  other: 'bg-gray-500/20 border-gray-500/50 text-gray-300'
};

export const WorkSummaryImporter: React.FC<WorkSummaryImporterProps> = ({
  onClose,
  onSuccess
}) => {
  const [content, setContent] = useState('');
  const [detectedSkills, setDetectedSkills] = useState<Array<{ skill: Skill; created: boolean }>>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleDetectSkills = async () => {
    if (!content.trim() || content.length < 50) {
      setError('Please provide at least 50 characters of work summary.');
      return;
    }

    setIsDetecting(true);
    setError(null);
    setDetectedSkills([]);

    try {
      // First, create a temporary journal entry
      const entryResponse = await fetchJson<{ entry: { id: string } }>('/api/entries', {
        method: 'POST',
        body: JSON.stringify({
          content: content.trim(),
          source: 'manual'
        })
      });

      const entryId = entryResponse.entry.id;

      // Extract skills from the entry
      const results = await skillsApi.extractSkills(entryId, content);
      setDetectedSkills(results);

      if (results.length === 0) {
        setError('No skills detected. Try adding more detail about what you worked on.');
      }
    } catch (err) {
      console.error('Failed to detect skills:', err);
      setError(err instanceof Error ? err.message : 'Failed to detect skills. Please try again.');
    } finally {
      setIsDetecting(false);
    }
  };

  const handleSave = async () => {
    if (!content.trim()) {
      setError('Please provide work summary content.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Create the journal entry
      const entryResponse = await fetchJson<{ entry: { id: string } }>('/api/entries', {
        method: 'POST',
        body: JSON.stringify({
          content: content.trim(),
          source: 'manual'
        })
      });

      const entryId = entryResponse.entry.id;

      // Extract and save skills
      const results = await skillsApi.extractSkills(entryId, content);

      // Add XP to each detected skill (50 XP per skill for work summaries)
      const xpPromises = results.map(({ skill }) =>
        skillsApi.addXP(skill.id, 50, 'memory', entryId, 'Work summary import')
      );

      await Promise.all(xpPromises);

      setSuccess(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 2000);
    } catch (err) {
      console.error('Failed to save work summary:', err);
      setError(err instanceof Error ? err.message : 'Failed to save work summary. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-black/90 border border-purple-500/30 rounded-2xl shadow-panel w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-purple-500/30 bg-opacity-70 bg-[radial-gradient(circle_at_top,_rgba(147,51,234,0.35),_transparent)]">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <FileText className="w-6 h-6 text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold text-white">
                Work Summary Importer
              </h2>
              <p className="text-sm text-white/60">Paste your ChatGPT work summary to track skills & XP</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Status Banner */}
        {isDetecting && (
          <div className="px-6 py-3 bg-purple-500/10 border-b border-purple-500/30 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
            <span className="text-sm text-purple-200">Detecting skills from your work summary...</span>
          </div>
        )}

        {error && (
          <div className="px-6 py-3 bg-red-500/10 border-b border-red-500/30 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-sm text-red-200">{error}</span>
          </div>
        )}

        {success && (
          <div className="px-6 py-3 bg-green-500/10 border-b border-green-500/30 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-sm text-green-200">
              Work summary saved! Skills updated with XP. Closing...
            </span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Instructions */}
          <Card className="bg-purple-500/10 border-purple-500/30">
            <CardHeader>
              <CardTitle className="text-white text-sm">How to use</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-white/70 space-y-2">
              <p>1. Copy your work summary from ChatGPT</p>
              <p>2. Paste it below</p>
              <p>3. Click "Detect Skills" to see what will be tracked</p>
              <p>4. Click "Save & Update Skills" to create the entry and award XP</p>
            </CardContent>
          </Card>

          {/* Textarea */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-white/80">
              Work Summary
            </label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste your ChatGPT work summary here... e.g., 'Today I worked on React components, practiced BJJ for 2 hours, and created a new video about AI.'"
              className="min-h-[200px] font-mono text-sm"
              disabled={isDetecting || isSaving || success}
            />
            <div className="text-xs text-white/50">
              {content.length} characters
            </div>
          </div>

          {/* Detected Skills */}
          {detectedSkills.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <h3 className="text-lg font-semibold text-white">
                  Detected Skills ({detectedSkills.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {detectedSkills.map(({ skill, created }) => (
                  <Card
                    key={skill.id}
                    className={`${CATEGORY_COLORS[skill.skill_category]} border`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold">{skill.skill_name}</span>
                            {created && (
                              <Badge variant="outline" className="text-xs bg-green-500/20 border-green-500/50 text-green-300">
                                New
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs opacity-70 capitalize mb-2">
                            {skill.skill_category}
                          </div>
                          <div className="text-xs opacity-60">
                            Level {skill.current_level} • {skill.total_xp} XP
                          </div>
                        </div>
                        <Zap className="w-4 h-4 opacity-50" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="border-t border-purple-500/30 p-6 flex items-center justify-between gap-4">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isDetecting || isSaving}
          >
            Cancel
          </Button>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={handleDetectSkills}
              disabled={!content.trim() || isDetecting || isSaving || success}
              leftIcon={isDetecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            >
              {isDetecting ? 'Detecting...' : 'Detect Skills'}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!content.trim() || isDetecting || isSaving || success}
              leftIcon={isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            >
              {isSaving ? 'Saving...' : 'Save & Update Skills'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
