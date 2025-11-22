import { useNavigate } from 'react-router-dom';
import { Shield, Lock, Database, EyeOff, Key, FileText, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Logo } from '../components/Logo';

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <FileText className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            Privacy Policy
          </h1>
          <p className="text-white/70">
            Last Updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
          <div className="flex justify-center gap-4 pt-4">
            <Button variant="outline" onClick={() => navigate('/')} className="border-border/60 bg-white/5 hover:bg-white/10 text-white">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to App
            </Button>
            <Button variant="outline" onClick={() => navigate('/terms')} className="border-border/60 bg-white/5 hover:bg-white/10 text-white">
              View Terms of Service
            </Button>
          </div>
        </div>

        {/* Privacy Policy Content */}
        <div className="space-y-6">
          {/* Introduction */}
          <div className="rounded-xl border border-border/60 bg-gradient-to-br from-purple-900/40 to-fuchsia-900/40 backdrop-blur-sm p-6">
            <h2 className="text-2xl font-bold text-white mb-4">1. Introduction</h2>
            <div className="space-y-3 text-white/80 leading-relaxed">
              <p>
                Welcome to LoreKeeper ("we," "our," or "us"). We are committed to protecting your privacy and ensuring the security of your personal information. 
                This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our application.
              </p>
              <p>
                By using LoreKeeper, you agree to the collection and use of information in accordance with this policy. 
                If you do not agree with our policies and practices, please do not use our Service.
              </p>
            </div>
          </div>

          {/* Information We Collect */}
          <div className="rounded-xl border border-border/60 bg-gradient-to-br from-blue-900/40 to-cyan-900/40 backdrop-blur-sm p-6">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <Database className="h-6 w-6 text-blue-400" />
              2. Information We Collect
            </h2>
            <div className="space-y-4 text-white/80 leading-relaxed">
              <div>
                <h3 className="font-semibold text-white mb-2">2.1 Information You Provide</h3>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Account information (email address, username)</li>
                  <li>Journal entries, memories, and personal notes</li>
                  <li>Character information, locations, and story elements</li>
                  <li>Timeline events and chronological data</li>
                  <li>Chapters and narrative content</li>
                  <li>Any other content you choose to upload or create</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-white mb-2">2.2 Automatically Collected Information</h3>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Usage data (features used, time spent, interactions)</li>
                  <li>Device information (browser type, operating system)</li>
                  <li>IP address and general location data</li>
                  <li>Session information and authentication tokens</li>
                </ul>
              </div>
            </div>
          </div>

          {/* How We Use Your Information */}
          <div className="rounded-xl border border-border/60 bg-gradient-to-br from-green-900/40 to-emerald-900/40 backdrop-blur-sm p-6">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <Key className="h-6 w-6 text-green-400" />
              3. How We Use Your Information
            </h2>
            <div className="space-y-3 text-white/80 leading-relaxed">
              <p>We use the information we collect solely to provide, maintain, and improve our Service. Specifically:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong className="text-white">Service Delivery:</strong> To provide you with access to LoreKeeper and its features, including AI-powered assistance, timeline management, and data storage.</li>
                <li><strong className="text-white">Account Management:</strong> To create and manage your account, authenticate your identity, and maintain your preferences.</li>
                <li><strong className="text-white">Data Processing:</strong> To process your journal entries, generate insights, and provide AI-powered features that enhance your experience.</li>
                <li><strong className="text-white">Security:</strong> To detect, prevent, and address security issues, fraud, and unauthorized access.</li>
              </ul>
            </div>
          </div>

          {/* Data Security */}
          <div className="rounded-xl border border-border/60 bg-gradient-to-br from-orange-900/40 to-red-900/40 backdrop-blur-sm p-6">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <Lock className="h-6 w-6 text-orange-400" />
              4. Data Security
            </h2>
            <div className="space-y-3 text-white/80 leading-relaxed">
              <p>We implement industry-standard security measures to protect your information:</p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-white">Encryption</p>
                    <p className="text-sm text-white/70">All data is encrypted in transit using TLS 1.3 and at rest using AES-256 encryption.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-white">Access Controls</p>
                    <p className="text-sm text-white/70">Row-level security ensures only you can access your data. All API requests require authentication.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-white">Secure Infrastructure</p>
                    <p className="text-sm text-white/70">We use Supabase, an enterprise-grade platform with SOC 2 Type II certification and ISO 27001 compliance.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Data Sharing */}
          <div className="rounded-xl border border-border/60 bg-gradient-to-br from-purple-900/40 to-fuchsia-900/40 backdrop-blur-sm p-6">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <EyeOff className="h-6 w-6 text-purple-400" />
              5. Data Sharing and Disclosure
            </h2>
            <div className="space-y-3 text-white/80 leading-relaxed">
              <p className="font-semibold text-white text-lg">We Do NOT Sell Your Data</p>
              <p>
                We do not sell, rent, or trade your personal information to third parties for marketing or advertising purposes. 
                Your data is never used to train AI models or for any purpose other than providing you with the Service.
              </p>
            </div>
          </div>

          {/* Your Rights */}
          <div className="rounded-xl border border-border/60 bg-gradient-to-br from-blue-900/40 to-cyan-900/40 backdrop-blur-sm p-6">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <Shield className="h-6 w-6 text-blue-400" />
              6. Your Rights and Choices
            </h2>
            <div className="space-y-3 text-white/80 leading-relaxed">
              <p>You have the following rights regarding your personal information:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong className="text-white">Access:</strong> You can access and view all your data within the application at any time.</li>
                <li><strong className="text-white">Export:</strong> You can export all your data in JSON, PDF, or eBook formats through the Privacy Settings.</li>
                <li><strong className="text-white">Deletion:</strong> You can delete your account and all associated data at any time through the Privacy Settings.</li>
                <li><strong className="text-white">Portability:</strong> You can request a copy of your data in a machine-readable format.</li>
              </ul>
            </div>
          </div>

          {/* Contact */}
          <div className="rounded-xl border border-border/60 bg-gradient-to-r from-purple-900/30 to-fuchsia-900/30 backdrop-blur-sm p-6">
            <h2 className="text-2xl font-bold text-white mb-4">7. Contact Us</h2>
            <div className="space-y-3 text-white/80 leading-relaxed">
              <p>If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us:</p>
              <div className="bg-black/40 p-4 rounded-lg border border-white/10">
                <p className="font-semibold text-white mb-2">LoreKeeper Privacy Team</p>
                <p className="text-sm">Email: privacy@lorekeeper.app</p>
                <p className="text-sm">Support: support@lorekeeper.app</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-8 border-t border-white/10 text-center">
          <Logo size="md" showText={true} />
          <p className="text-sm text-white/60 mt-4">
            Your privacy is important to us. We are committed to protecting your data.
          </p>
        </div>
      </div>
    </div>
  );
}

