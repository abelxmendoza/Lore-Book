import React, { useState, useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { fetchJson } from '../../lib/api';
import { ContradictionAlertCard, type ContradictionAlert } from './ContradictionAlertCard';

export const ContradictionAlertsPanel: React.FC = () => {
  const [alerts, setAlerts] = useState<ContradictionAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAlerts();
  }, []);

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const response = await fetchJson('/api/contradiction-alerts?limit=20');
      if (response.success) {
        setAlerts(response.alerts || []);
      }
    } catch (error) {
      console.error('Failed to load contradiction alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = (alertId: string, action: string) => {
    // Remove alert from list if dismissed or abandoned
    if (action === 'DISMISS' || action === 'ABANDON' || action === 'NOT_NOW') {
      setAlerts(alerts.filter(a => a.id !== alertId));
    } else {
      // Reload to get updated status
      loadAlerts();
    }
  };

  if (loading) {
    return (
      <Card className="bg-black/40 border-border/50">
        <CardContent className="p-8 text-center text-white/60">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading alerts...</p>
        </CardContent>
      </Card>
    );
  }

  if (alerts.length === 0) {
    return (
      <Card className="bg-black/40 border-border/50">
        <CardContent className="p-8 text-center text-white/60">
          <AlertTriangle className="h-8 w-8 mx-auto mb-4 text-white/40" />
          <p>No contradiction alerts.</p>
          <p className="text-sm mt-2 text-white/40">
            You'll be notified when beliefs are contradicted or confidence drops significantly.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Contradiction Alerts</h2>
          <p className="text-white/60 text-sm">
            Beliefs that conflict with evidence or have low confidence
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadAlerts}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Alerts List */}
      <div className="space-y-4">
        {alerts.map((alert) => (
          <ContradictionAlertCard
            key={alert.id}
            alert={alert}
            onAction={handleAction}
          />
        ))}
      </div>
    </div>
  );
};

