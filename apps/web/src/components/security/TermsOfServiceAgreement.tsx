import { useState } from 'react';
import { Shield, Lock, FileText, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { fetchJson } from '../../lib/api';

type TermsOfServiceAgreementProps = {
  onAccept: () => void;
};

export const TermsOfServiceAgreement = ({ onAccept }: TermsOfServiceAgreementProps) => {
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
    if (isAtBottom) {
      setScrolledToBottom(true);
    }
  };

  const handleAccept = async () => {
    if (!accepted || !scrolledToBottom) return;

    setLoading(true);
    try {
      const response = await fetchJson('/api/user/accept-terms', {
        method: 'POST',
        body: JSON.stringify({
          acceptedAt: new Date().toISOString(),
          version: '1.0'
        })
      });
      console.log('Terms accepted successfully:', response);
      onAccept();
    } catch (error: any) {
      console.error('Failed to accept terms:', error);
      const errorMessage = error?.message || 'Failed to accept terms. Please try again.';
      
      // Check for specific error types
      let detailedMessage = errorMessage;
      if (errorMessage.includes('table does not exist') || errorMessage.includes('Database table not found')) {
        detailedMessage = `Database migration required!\n\n${errorMessage}\n\nPlease run the migration:\nmigrations/20250120_terms_acceptance.sql`;
      } else if (errorMessage.includes('Cannot connect') || errorMessage.includes('Backend server')) {
        detailedMessage = `Backend server not running!\n\n${errorMessage}\n\nPlease start the backend server.`;
      }
      
      alert(`Failed to accept terms: ${detailedMessage}\n\nCheck the browser console for more details.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-black/95 border-purple-500/50 shadow-2xl">
        <CardHeader className="border-b border-white/10 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Shield className="h-6 w-6 text-purple-400" />
              </div>
              <div>
                <CardTitle className="text-2xl text-white">Terms of Service & Privacy Agreement</CardTitle>
                <p className="text-sm text-white/60 mt-1">Please read and accept to continue</p>
              </div>
            </div>
            <div className="text-xs text-white/40">Version 1.0</div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-hidden flex flex-col p-0">
          <div
            className="flex-1 overflow-y-auto p-6 space-y-6 text-white/90 prose prose-invert max-w-none"
            onScroll={handleScroll}
          >
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-purple-400" />
                  1. Acceptance of Terms
                </h2>
                <p className="text-white/80 leading-relaxed">
                  By accessing and using Lore Book ("the Service"), you accept and agree to be bound by the terms and provision of this agreement. 
                  If you do not agree to these terms, you must not use the Service.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
                  <Lock className="h-5 w-5 text-purple-400" />
                  2. Data Privacy & Security
                </h2>
                <div className="space-y-3 text-white/80 leading-relaxed">
                  <p>
                    <strong className="text-white">2.1 Data Ownership:</strong> You retain full ownership of all data you upload, create, or store within the Service. 
                    We do not claim any ownership rights over your content.
                  </p>
                  <p>
                    <strong className="text-white">2.2 Data Storage:</strong> Your data is stored securely using industry-standard encryption (AES-256) both in transit and at rest. 
                    All data is isolated using row-level security, ensuring only you can access your information.
                  </p>
                  <p>
                    <strong className="text-white">2.3 Data Access:</strong> Only you have access to your data. Our staff cannot view your personal journal entries, memories, or sensitive information 
                    unless you explicitly grant permission for support purposes.
                  </p>
                  <p>
                    <strong className="text-white">2.4 Data Sharing:</strong> We will never sell, rent, or share your personal data with third parties for marketing or advertising purposes. 
                    Your data is never used to train AI models or for any purpose other than providing you with the Service.
                  </p>
                  <p>
                    <strong className="text-white">2.5 Data Export:</strong> You may export all your data at any time in JSON, PDF, or eBook formats. 
                    You have the right to request a complete copy of your data.
                  </p>
                  <p>
                    <strong className="text-white">2.6 Data Deletion:</strong> You may delete your account and all associated data at any time. 
                    Upon deletion, all data will be permanently removed from our systems within 30 days, except as required by law.
                  </p>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
                  <Shield className="h-5 w-5 text-purple-400" />
                  3. Service Usage
                </h2>
                <div className="space-y-3 text-white/80 leading-relaxed">
                  <p>
                    <strong className="text-white">3.1 Acceptable Use:</strong> You agree to use the Service only for lawful purposes and in accordance with these Terms. 
                    You agree not to use the Service to store, transmit, or share any content that is illegal, harmful, threatening, abusive, or violates any third-party rights.
                  </p>
                  <p>
                    <strong className="text-white">3.2 Account Security:</strong> You are responsible for maintaining the confidentiality of your account credentials and for all activities 
                    that occur under your account. You agree to notify us immediately of any unauthorized use of your account.
                  </p>
                  <p>
                    <strong className="text-white">3.3 Service Availability:</strong> We strive to maintain high availability but do not guarantee uninterrupted or error-free service. 
                    We reserve the right to perform maintenance, updates, or modifications that may temporarily affect service availability.
                  </p>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-bold text-white mb-3">4. Intellectual Property</h2>
                <p className="text-white/80 leading-relaxed">
                  The Service, including its original content, features, and functionality, is owned by Lore Book and is protected by international copyright, 
                  trademark, patent, trade secret, and other intellectual property laws. You may not copy, modify, distribute, sell, or lease any part of the Service 
                  without our express written permission.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-bold text-white mb-3">5. Subscription & Payment</h2>
                <div className="space-y-3 text-white/80 leading-relaxed">
                  <p>
                    <strong className="text-white">5.1 Free Trial:</strong> New users receive a 7-day free trial of Premium features. 
                    You may cancel at any time during the trial without being charged.
                  </p>
                  <p>
                    <strong className="text-white">5.2 Subscription:</strong> After the trial period, continued use of Premium features requires a paid subscription. 
                    Subscriptions are billed monthly and will automatically renew unless cancelled.
                  </p>
                  <p>
                    <strong className="text-white">5.3 Cancellation:</strong> You may cancel your subscription at any time. 
                    Cancellation takes effect at the end of your current billing period. No refunds are provided for partial billing periods.
                  </p>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-bold text-white mb-3">6. Limitation of Liability</h2>
                <p className="text-white/80 leading-relaxed">
                  To the maximum extent permitted by law, Lore Book shall not be liable for any indirect, incidental, special, consequential, or punitive damages, 
                  or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses, 
                  resulting from your use of the Service.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-bold text-white mb-3">7. Changes to Terms</h2>
                <p className="text-white/80 leading-relaxed">
                  We reserve the right to modify these Terms at any time. Material changes will be communicated to you via email or through the Service. 
                  Your continued use of the Service after such modifications constitutes acceptance of the updated Terms. 
                  If you do not agree to the modified Terms, you must stop using the Service and may delete your account.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-bold text-white mb-3">8. Termination</h2>
                <p className="text-white/80 leading-relaxed">
                  We reserve the right to terminate or suspend your account and access to the Service immediately, without prior notice, 
                  for conduct that we believe violates these Terms or is harmful to other users, us, or third parties. 
                  Upon termination, your right to use the Service will immediately cease.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-bold text-white mb-3">9. Governing Law</h2>
                <p className="text-white/80 leading-relaxed">
                  These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which Lore Book operates, 
                  without regard to its conflict of law provisions.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-bold text-white mb-3">10. Contact Information</h2>
                <p className="text-white/80 leading-relaxed">
                  If you have any questions about these Terms, please contact us through the Service or at the contact information provided in our Privacy Policy.
                </p>
              </div>

              <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4 mt-6">
                <p className="text-white font-semibold mb-2">By accepting these Terms, you acknowledge that:</p>
                <ul className="list-disc list-inside space-y-1 text-white/80 text-sm">
                  <li>You have read and understood all terms and conditions</li>
                  <li>You agree to be bound by these Terms</li>
                  <li>You understand your data privacy rights and our commitments</li>
                  <li>You consent to the collection and use of your data as described in our Privacy Policy</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 p-6 bg-black/50">
            <div className="flex items-start gap-3 mb-4">
              <input
                type="checkbox"
                id="accept-terms"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                disabled={!scrolledToBottom}
                className="mt-1 h-5 w-5 rounded border-white/30 bg-black/50 text-purple-500 focus:ring-purple-500 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <label htmlFor="accept-terms" className="flex-1 text-white cursor-pointer">
                <span className="font-semibold">I have read and agree to the Terms of Service and Privacy Agreement</span>
                <span className="text-white/60 block text-sm mt-1">
                  {!scrolledToBottom && 'Please scroll to the bottom to enable acceptance'}
                </span>
              </label>
            </div>
            <Button
              onClick={handleAccept}
              disabled={!accepted || !scrolledToBottom || loading}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              size="lg"
            >
              {loading ? (
                'Processing...'
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5 mr-2" />
                  Accept & Continue
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

