import { Shield, Lock, Download, Zap, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';

export const PrivacyAssurance = () => {
  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-r from-purple-900/30 to-fuchsia-900/30 border-purple-500/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Shield className="h-5 w-5 text-purple-400" />
            Your Privacy is Our Priority
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <Lock className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-semibold text-white mb-1">End-to-End Encryption</h4>
                <p className="text-sm text-white/70">
                  Your journal entries and personal data are encrypted both in transit and at rest.
                  Only you can decrypt and read your data.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-semibold text-white mb-1">We Never Sell Your Data</h4>
                <p className="text-sm text-white/70">
                  Your personal information, journal entries, and usage data are never sold,
                  shared, or used for advertising purposes.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Download className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-semibold text-white mb-1">You Own Your Data</h4>
                <p className="text-sm text-white/70">
                  Export your data anytime in multiple formats (JSON, PDF, eBook).
                  Delete your account and all data whenever you want.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Zap className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-semibold text-white mb-1">GDPR Compliant</h4>
                <p className="text-sm text-white/70">
                  We comply with GDPR and other privacy regulations.
                  You have full control over your personal data.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-white/10">
            <h4 className="font-semibold text-white mb-3">Privacy Guarantees</h4>
            <div className="space-y-2">
              {[
                'Row-Level Security ensures only you can access your data',
                'All API requests are authenticated and encrypted',
                'No third-party tracking or analytics on your personal data',
                'Regular security audits and updates',
                'Transparent privacy policy and terms of service',
              ].map((guarantee, idx) => (
                <div key={idx} className="flex items-start gap-2 text-sm text-white/80">
                  <Check className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                  <span>{guarantee}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={() => window.open('/privacy', '_blank')}>
              View Privacy Policy
            </Button>
            <Button variant="outline" onClick={() => window.open('/terms', '_blank')}>
              View Terms of Service
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

