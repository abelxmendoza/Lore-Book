// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { Calendar, Heart, MapPin, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';

type DateEvent = {
  id: string;
  date_type: string;
  date_time: string;
  location?: string;
  description?: string;
  sentiment?: number;
  was_positive?: boolean;
};

type RelationshipData = {
  id: string;
  start_date?: string;
  end_date?: string;
  status: string;
};

interface RelationshipTimelineProps {
  relationshipId: string;
  dates: DateEvent[];
  relationship: RelationshipData;
}

const formatDateType = (type: string) => {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
};

const getDateIcon = (type: string) => {
  if (type.includes('love') || type.includes('anniversary')) return Heart;
  if (type.includes('date') || type.includes('meeting')) return Calendar;
  return Calendar;
};

const getDateColor = (type: string, wasPositive?: boolean) => {
  if (type.includes('breakup') || type.includes('fight')) return 'border-red-500/30 bg-red-500/10 text-red-300';
  if (type.includes('love') || type.includes('anniversary') || wasPositive) return 'border-pink-500/30 bg-pink-500/10 text-pink-300';
  return 'border-blue-500/30 bg-blue-500/10 text-blue-300';
};

export const RelationshipTimeline = ({ dates, relationship }: RelationshipTimelineProps) => {
  // Sort dates chronologically
  const sortedDates = [...dates].sort((a, b) => 
    new Date(a.date_time).getTime() - new Date(b.date_time).getTime()
  );

  return (
    <div className="space-y-6">
      {/* Relationship Period */}
      <Card className="border-border/60 bg-black/40">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white mb-2">Relationship Period</h3>
              <div className="flex items-center gap-4 text-sm text-white/70">
                {relationship.start_date && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>Started: {new Date(relationship.start_date).toLocaleDateString()}</span>
                  </div>
                )}
                {relationship.end_date && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>Ended: {new Date(relationship.end_date).toLocaleDateString()}</span>
                  </div>
                )}
                {!relationship.end_date && relationship.start_date && (
                  <Badge variant="outline" className="bg-green-500/20 text-green-300 border-green-500/30">
                    Ongoing
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      {sortedDates.length === 0 ? (
        <Card className="border-border/60 bg-black/40">
          <CardContent className="p-8 text-center">
            <Calendar className="w-12 h-12 mx-auto mb-4 text-pink-400/30" />
            <p className="text-white/60 mb-2">No milestones yet</p>
            <p className="text-white/40 text-sm">
              Milestones are automatically detected from your conversations. Keep chatting about this relationship!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white mb-4">Milestones & Dates</h3>
          <div className="relative">
            {/* Timeline Line */}
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-pink-500/30 via-purple-500/30 to-pink-500/30" />
            
            {/* Timeline Items */}
            <div className="space-y-6">
              {sortedDates.map((date, idx) => {
                const DateIcon = getDateIcon(date.date_type);
                const isPositive = date.was_positive ?? (date.sentiment && date.sentiment > 0);
                
                return (
                  <div key={date.id} className="relative flex items-start gap-4 pl-2">
                    {/* Timeline Dot */}
                    <div className={`relative z-10 w-12 h-12 rounded-full border-2 flex items-center justify-center ${getDateColor(date.date_type, isPositive)}`}>
                      <DateIcon className="w-5 h-5" />
                    </div>
                    
                    {/* Content */}
                    <Card className={`flex-1 border ${getDateColor(date.date_type, isPositive)}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4 className="font-semibold text-white mb-1">
                              {formatDateType(date.date_type)}
                            </h4>
                            <p className="text-sm text-white/70">
                              {new Date(date.date_time).toLocaleDateString('en-US', {
                                month: 'long',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </p>
                          </div>
                          {date.sentiment !== undefined && (
                            <div className="flex items-center gap-1">
                              {date.sentiment > 0 ? (
                                <TrendingUp className="w-4 h-4 text-green-400" />
                              ) : date.sentiment < 0 ? (
                                <TrendingDown className="w-4 h-4 text-red-400" />
                              ) : null}
                            </div>
                          )}
                        </div>
                        
                        {date.location && (
                          <div className="flex items-center gap-2 text-sm text-white/60 mb-2">
                            <MapPin className="w-3 h-3" />
                            <span>{date.location}</span>
                          </div>
                        )}
                        
                        {date.description && (
                          <p className="text-sm text-white/80">{date.description}</p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
