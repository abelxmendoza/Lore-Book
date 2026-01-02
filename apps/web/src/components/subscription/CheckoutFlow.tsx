import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { ArrowLeft, Lock, Shield, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { useSubscription } from '../../hooks/useSubscription';

// Get Stripe publishable key from environment
const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';

// Initialize Stripe (will be null if key not configured)
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

const CheckoutForm = ({ 
  clientSecret, 
  onSuccess, 
  onCancel 
}: { 
  clientSecret: string;
  onSuccess: () => void; 
  onCancel: () => void;
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements || !clientSecret) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setError(submitError.message || 'Payment form validation failed');
        setLoading(false);
        return;
      }

      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
          return_url: `${window.location.origin}/subscription?success=true`,
        },
        redirect: 'if_required',
      });

      if (confirmError) {
        setError(confirmError.message || 'Payment confirmation failed');
        setLoading(false);
      } else {
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      
      {error && (
        <div className="p-3 bg-red-500/20 border border-red-500/50 rounded text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="flex-1"
          disabled={loading}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Cancel
        </Button>
        <Button
          type="submit"
          variant="default"
          className="flex-1"
          disabled={loading || !stripe}
        >
          {loading ? 'Processing...' : 'Start 7-Day Free Trial'}
        </Button>
      </div>

      <div className="flex items-start gap-2 text-xs text-white/60">
        <Lock className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <div>
          <p>Your payment method will be saved but not charged during the 7-day trial.</p>
          <p className="mt-1">You can cancel anytime before the trial ends to avoid charges.</p>
        </div>
      </div>
    </form>
  );
};

export const CheckoutFlow = ({ onCancel, onSuccess }: { onCancel: () => void; onSuccess?: () => void }) => {
  const { subscription, createSubscription } = useSubscription();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    createSubscription()
      .then((result) => {
        setClientSecret(result.clientSecret);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to create subscription:', err);
        setLoading(false);
      });
  }, [createSubscription]);

  if (!stripePromise) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-purple-950/20 to-black p-6 flex items-center justify-center">
        <Card className="bg-black/40 border-border/60 max-w-md">
          <CardContent className="p-6">
            <p className="text-white/60 text-center">
              Payment processing is not configured. Please contact support.
            </p>
            <Button onClick={onCancel} className="w-full mt-4" variant="outline">
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading || !clientSecret) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-purple-950/20 to-black p-6 flex items-center justify-center">
        <Card className="bg-black/40 border-border/60 max-w-md">
          <CardContent className="p-6">
            <div className="text-center text-white/60">Loading checkout...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-950/20 to-black p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <Button
          variant="ghost"
          onClick={onCancel}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Pricing
        </Button>

        <Card className="bg-black/40 border-border/60">
          <CardHeader>
            <CardTitle className="text-2xl text-white">Start Your Free Trial</CardTitle>
            <p className="text-white/60 mt-2">
              Get 7 days of full Premium access. No charges until the trial ends.
            </p>
          </CardHeader>
          <CardContent>
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: {
                  theme: 'night',
                  variables: {
                    colorPrimary: '#a855f7',
                    colorBackground: '#000000',
                    colorText: '#ffffff',
                    colorDanger: '#ef4444',
                    fontFamily: 'system-ui, sans-serif',
                    spacingUnit: '4px',
                    borderRadius: '8px',
                  },
                },
              }}
            >
              <CheckoutForm
                clientSecret={clientSecret}
                onSuccess={() => {
                  if (onSuccess) {
                    onSuccess();
                  } else {
                    window.location.href = '#subscription?success=true';
                  }
                }}
                onCancel={onCancel}
              />
            </Elements>
          </CardContent>
        </Card>

        {/* Privacy Assurance */}
        <Card className="bg-gradient-to-r from-purple-900/30 to-fuchsia-900/30 border-purple-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white text-lg">
              <Shield className="h-5 w-5 text-purple-400" />
              Your Data is Private
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm text-white/80">
              <div className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>End-to-end encryption protects your data</span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>We never sell or share your personal information</span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>You can export or delete your data anytime</span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>GDPR compliant and privacy-first</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

