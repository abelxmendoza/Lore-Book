// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { useState } from 'react';
import { Plus, AlertTriangle, CheckCircle, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

interface ProsConsViewProps {
  relationshipId: string;
  pros: string[];
  cons: string[];
  redFlags: string[];
  greenFlags: string[];
  onUpdate?: () => void;
}

export const ProsConsView = ({ pros, cons, redFlags, greenFlags }: ProsConsViewProps) => {
  return (
    <div className="space-y-6">
      {/* Pros & Cons Split View */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pros */}
        <Card className="border-green-500/30 bg-green-950/10">
          <CardHeader>
            <CardTitle className="text-green-300 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              Pros ({pros.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pros.length === 0 ? (
              <p className="text-white/50 text-sm italic">No pros added yet. Chat with me to add some!</p>
            ) : (
              <ul className="space-y-3">
                {pros.map((pro, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-white/80">
                    <span className="text-green-400 mt-1">✓</span>
                    <span className="flex-1 text-sm">{pro}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Cons */}
        <Card className="border-red-500/30 bg-red-950/10">
          <CardHeader>
            <CardTitle className="text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Cons ({cons.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cons.length === 0 ? (
              <p className="text-white/50 text-sm italic">No cons added yet. Chat with me to add some!</p>
            ) : (
              <ul className="space-y-3">
                {cons.map((con, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-white/80">
                    <span className="text-red-400 mt-1">⚠</span>
                    <span className="flex-1 text-sm">{con}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Flags */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Green Flags */}
        {greenFlags.length > 0 && (
          <Card className="border-green-500/30 bg-green-950/10">
            <CardHeader>
              <CardTitle className="text-green-300 flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                Green Flags ({greenFlags.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {greenFlags.map((flag, idx) => (
                  <li key={idx} className="text-sm text-white/80 flex items-start gap-2">
                    <span className="text-green-400 mt-1">✓</span>
                    <span>{flag}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Red Flags */}
        {redFlags.length > 0 && (
          <Card className="border-red-500/30 bg-red-950/10">
            <CardHeader>
              <CardTitle className="text-red-300 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Red Flags ({redFlags.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {redFlags.map((flag, idx) => (
                  <li key={idx} className="text-sm text-white/80 flex items-start gap-2">
                    <span className="text-red-400 mt-1">⚠</span>
                    <span>{flag}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Chat Prompt */}
      <Card className="border-primary/30 bg-primary/10">
        <CardContent className="p-4">
          <p className="text-sm text-white/80">
            💬 <strong>Want to add or update pros/cons?</strong> Switch to the Chat tab and tell me about this relationship. 
            I'll automatically extract and update the pros and cons based on our conversation!
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
