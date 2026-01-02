import { useState } from 'react';
import { Check, Shield, Lock, Download, Zap, Crown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { useSubscription } from '../../hooks/useSubscription';
import { CheckoutFlow } from './CheckoutFlow';

const features = {
  free: [
    '50 journal entries per month',
    '100 AI requests per month',
    'Basic timeline view',
    'Character tracking',
    'Search functionality',
  ],
  premium: [
    'Unlimited journal entries',
    'Unlimited AI requests',
    'Advanced timeline visualization',
    'All premium features',
    'Priority support',
    'Early access to new features',
    'Export to PDF/eBook',
    'Advanced analytics',
  ],
};

const privacyFeatures = [
  { icon: Lock, text: 'End-to-end encryption' },
  { icon: Shield, text: 'Your data is never sold' },
  { icon: Download, text: 'Export your data anytime' },
  { icon: Zap, text: 'GDPR compliant' },
];

export const PricingPage = ({ onSurfaceChange }: { onSurfaceChange?: (surface: 'subscription' | 'pricing') => void }) => {
  const { subscription } = useSubscription();
  const [showCheckout, setShowCheckout] = useState(false);
  const isPremium = subscription?.planType === 'premium' || subscription?.usage.isTrial;

  if (showCheckout) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-purple-950/20 to-black">
        <CheckoutFlow 
          onCancel={() => setShowCheckout(false)}
          onSuccess={() => {
            setShowCheckout(false);
            onSurfaceChange?.('subscription');
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-950/20 to-black p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-white">Choose Your Plan</h1>
          <p className="text-xl text-white/60">
            Start with a 7-day free trial. No credit card required until trial ends.
          </p>
        </div>

        {/* Privacy Assurance */}
        <Card className="bg-gradient-to-r from-purple-900/30 to-fuchsia-900/30 border-purple-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Shield className="h-5 w-5 text-purple-400" />
              Your Privacy is Protected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {privacyFeatures.map((feature, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm text-white/80">
                  <feature.icon className="h-4 w-4 text-purple-400 flex-shrink-0" />
                  <span>{feature.text}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Free Plan */}
          <Card className={`bg-black/40 border-border/60 ${isPremium ? 'opacity-60' : ''}`}>
            <CardHeader>
              <CardTitle className="text-2xl text-white">Free</CardTitle>
              <div className="mt-2">
                <span className="text-4xl font-bold text-white">$0</span>
                <span className="text-white/60">/month</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                {features.free.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-white/80">
                    <Check className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              {isPremium ? (
                <Button variant="outline" className="w-full" disabled>
                  Current Plan
                </Button>
              ) : (
                <Button variant="outline" className="w-full" disabled>
                  Current Plan
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Premium Plan */}
          <Card className={`bg-gradient-to-br from-purple-900/40 to-fuchsia-900/40 border-purple-500/50 relative ${isPremium ? 'ring-2 ring-purple-500' : ''}`}>
            {isPremium && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-purple-500 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                  <Crown className="h-3 w-3" />
                  Active
                </span>
              </div>
            )}
            <CardHeader>
              <CardTitle className="text-2xl text-white flex items-center gap-2">
                <Crown className="h-5 w-5 text-yellow-400" />
                Premium
              </CardTitle>
              <div className="mt-2">
                <span className="text-4xl font-bold text-white">$15</span>
                <span className="text-white/60">/month</span>
              </div>
              <p className="text-sm text-yellow-400 mt-2">7-day free trial • Cancel anytime</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                {features.premium.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-white/90">
                    <Check className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              {isPremium ? (
                <Button variant="default" className="w-full" disabled>
                  Current Plan
                </Button>
              ) : (
                <Button
                  variant="default"
                  className="w-full"
                  onClick={() => setShowCheckout(true)}
                >
                  Start Free Trial
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Feature Comparison */}
        <Card className="bg-black/40 border-border/60">
          <CardHeader>
            <CardTitle className="text-white">Feature Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="pb-3 text-white font-semibold">Feature</th>
                    <th className="pb-3 text-white font-semibold text-center">Free</th>
                    <th className="pb-3 text-white font-semibold text-center">Premium</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  <tr className="border-b border-border/30">
                    <td className="py-3 text-white/80">Journal Entries</td>
                    <td className="py-3 text-center text-white/60">50/month</td>
                    <td className="py-3 text-center text-green-400 font-semibold">Unlimited</td>
                  </tr>
                  <tr className="border-b border-border/30">
                    <td className="py-3 text-white/80">AI Requests</td>
                    <td className="py-3 text-center text-white/60">100/month</td>
                    <td className="py-3 text-center text-green-400 font-semibold">Unlimited</td>
                  </tr>
                  <tr className="border-b border-border/30">
                    <td className="py-3 text-white/80">Timeline Visualization</td>
                    <td className="py-3 text-center text-white/60">Basic</td>
                    <td className="py-3 text-center text-green-400 font-semibold">Advanced</td>
                  </tr>
                  <tr className="border-b border-border/30">
                    <td className="py-3 text-white/80">Data Export</td>
                    <td className="py-3 text-center text-white/60">JSON</td>
                    <td className="py-3 text-center text-green-400 font-semibold">PDF, eBook, JSON</td>
                  </tr>
                  <tr>
                    <td className="py-3 text-white/80">Support</td>
                    <td className="py-3 text-center text-white/60">Community</td>
                    <td className="py-3 text-center text-green-400 font-semibold">Priority</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

