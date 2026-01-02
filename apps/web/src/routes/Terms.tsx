import { useNavigate } from 'react-router-dom';
import { Shield, Lock, FileText, ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Logo } from '../components/Logo';

export default function Terms() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Shield className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            Terms of Service
          </h1>
          <p className="text-white/70">
            Last Updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
          <div className="flex justify-center gap-4 pt-4">
            <Button variant="outline" onClick={() => navigate('/')} className="border-border/60 bg-white/5 hover:bg-white/10 text-white">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to App
            </Button>
            <Button variant="outline" onClick={() => navigate('/privacy-policy')} className="border-border/60 bg-white/5 hover:bg-white/10 text-white">
              View Privacy Policy
            </Button>
          </div>
        </div>

        {/* Terms Content */}
        <div className="space-y-6 text-white/90">
          <div className="rounded-xl border border-border/60 bg-black/40 backdrop-blur-sm p-6">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <FileText className="h-6 w-6 text-purple-400" />
              1. Acceptance of Terms
            </h2>
            <p className="text-white/80 leading-relaxed">
              By accessing and using Lore Book ("the Service"), you accept and agree to be bound by the terms and provision of this agreement. 
              If you do not agree to these terms, you must not use the Service.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-black/40 backdrop-blur-sm p-6">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <Lock className="h-6 w-6 text-purple-400" />
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

          <div className="rounded-xl border border-border/60 bg-black/40 backdrop-blur-sm p-6">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <Shield className="h-6 w-6 text-purple-400" />
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

          <div className="rounded-xl border border-border/60 bg-black/40 backdrop-blur-sm p-6">
            <h2 className="text-2xl font-bold text-white mb-4">4. Intellectual Property</h2>
            <p className="text-white/80 leading-relaxed">
              The Service, including its original content, features, and functionality, is owned by Lore Book and is protected by international copyright, 
              trademark, patent, trade secret, and other intellectual property laws. You may not copy, modify, distribute, sell, or lease any part of the Service 
              without our express written permission.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-black/40 backdrop-blur-sm p-6">
            <h2 className="text-2xl font-bold text-white mb-4">5. Subscription & Payment</h2>
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

          <div className="rounded-xl border border-border/60 bg-black/40 backdrop-blur-sm p-6">
            <h2 className="text-2xl font-bold text-white mb-4">6. Limitation of Liability</h2>
            <p className="text-white/80 leading-relaxed">
              To the maximum extent permitted by law, Lore Book shall not be liable for any indirect, incidental, special, consequential, or punitive damages, 
              or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses, 
              resulting from your use of the Service.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-black/40 backdrop-blur-sm p-6">
            <h2 className="text-2xl font-bold text-white mb-4">7. Changes to Terms</h2>
            <p className="text-white/80 leading-relaxed">
              We reserve the right to modify these Terms at any time. Material changes will be communicated to you via email or through the Service. 
              Your continued use of the Service after such modifications constitutes acceptance of the updated Terms. 
              If you do not agree to the modified Terms, you must stop using the Service and may delete your account.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-black/40 backdrop-blur-sm p-6">
            <h2 className="text-2xl font-bold text-white mb-4">8. Termination</h2>
            <p className="text-white/80 leading-relaxed">
              We reserve the right to terminate or suspend your account and access to the Service immediately, without prior notice, 
              for conduct that we believe violates these Terms or is harmful to other users, us, or third parties. 
              Upon termination, your right to use the Service will immediately cease.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-black/40 backdrop-blur-sm p-6">
            <h2 className="text-2xl font-bold text-white mb-4">9. Governing Law</h2>
            <p className="text-white/80 leading-relaxed">
              These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which Lore Book operates, 
              without regard to its conflict of law provisions.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-black/40 backdrop-blur-sm p-6">
            <h2 className="text-2xl font-bold text-white mb-4">10. Contact Information</h2>
            <p className="text-white/80 leading-relaxed">
              If you have any questions about these Terms, please contact us through the Service or at the contact information provided in our Privacy Policy.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-8 border-t border-white/10 text-center">
          <Logo size="md" showText={true} />
          <p className="text-sm text-white/60 mt-4">
            By using Lore Book, you agree to these Terms of Service.
          </p>
        </div>
      </div>
    </div>
  );
}

