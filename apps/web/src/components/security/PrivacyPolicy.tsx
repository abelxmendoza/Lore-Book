import { Shield, Lock, Database, EyeOff, Key, Server, CheckCircle2, FileText, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';

interface PrivacyPolicyProps {
  onBack?: () => void;
}

export const PrivacyPolicy = ({ onBack }: PrivacyPolicyProps) => {
  return (
    <div className="space-y-8 max-w-4xl mx-auto text-white w-full" role="main" aria-label="Privacy Policy">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <FileText className="h-16 w-16 text-purple-400" />
        </div>
        <h1 className="text-4xl font-bold text-white">Privacy Policy</h1>
        <p className="text-lg text-white/70">
          Last Updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
        {onBack && (
          <div className="flex justify-center pt-4">
            <Button variant="outline" onClick={onBack} className="border-purple-500/50 text-purple-400 hover:bg-purple-500/20">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Privacy & Security
            </Button>
          </div>
        )}
      </div>

      {/* Introduction */}
      <Card className="bg-gradient-to-br from-purple-900/40 to-fuchsia-900/40 border-purple-500/50">
        <CardHeader>
          <CardTitle className="text-white">1. Introduction</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-white/80 leading-relaxed">
          <p>
            Welcome to Lore Book ("we," "our," or "us"). We are committed to protecting your privacy and ensuring the security of your personal information. 
            This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our application.
          </p>
          <p>
            By using Lore Book, you agree to the collection and use of information in accordance with this policy. 
            If you do not agree with our policies and practices, please do not use our Service.
          </p>
        </CardContent>
      </Card>

      {/* Information We Collect */}
      <Card className="bg-gradient-to-br from-blue-900/40 to-cyan-900/40 border-blue-500/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Database className="h-6 w-6 text-blue-400" />
            2. Information We Collect
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-white/80 leading-relaxed">
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
          <div>
            <h3 className="font-semibold text-white mb-2">2.3 What We Do NOT Collect</h3>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>We do not track your browsing activity outside our application</li>
              <li>We do not collect information from third-party services without your consent</li>
              <li>We do not use cookies for advertising or tracking purposes</li>
              <li>We do not collect biometric data or sensitive personal identifiers</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* How We Use Your Information */}
      <Card className="bg-gradient-to-br from-green-900/40 to-emerald-900/40 border-green-500/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Key className="h-6 w-6 text-green-400" />
            3. How We Use Your Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-white/80 leading-relaxed">
          <p>
            We use the information we collect solely to provide, maintain, and improve our Service. Specifically:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li><strong className="text-white">Service Delivery:</strong> To provide you with access to Lore Book and its features, including AI-powered assistance, timeline management, and data storage.</li>
            <li><strong className="text-white">Account Management:</strong> To create and manage your account, authenticate your identity, and maintain your preferences.</li>
            <li><strong className="text-white">Data Processing:</strong> To process your journal entries, generate insights, and provide AI-powered features that enhance your experience.</li>
            <li><strong className="text-white">Communication:</strong> To send you important updates about the Service, security notifications, and respond to your inquiries.</li>
            <li><strong className="text-white">Security:</strong> To detect, prevent, and address security issues, fraud, and unauthorized access.</li>
            <li><strong className="text-white">Improvement:</strong> To analyze anonymized usage patterns and improve our Service's functionality and user experience.</li>
          </ul>
        </CardContent>
      </Card>

      {/* Data Security */}
      <Card className="bg-gradient-to-br from-orange-900/40 to-red-900/40 border-orange-500/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Lock className="h-6 w-6 text-orange-400" />
            4. Data Security
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-white/80 leading-relaxed">
          <p>
            We implement industry-standard security measures to protect your information:
          </p>
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
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-white">Regular Audits</p>
                <p className="text-sm text-white/70">We perform regular security assessments and keep our dependencies up to date.</p>
              </div>
            </div>
          </div>
          <p className="text-sm text-white/60 italic">
            However, no method of transmission over the Internet or electronic storage is 100% secure. 
            While we strive to use commercially acceptable means to protect your information, we cannot guarantee absolute security.
          </p>
        </CardContent>
      </Card>

      {/* Data Sharing and Disclosure */}
      <Card className="bg-gradient-to-br from-purple-900/40 to-fuchsia-900/40 border-purple-500/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <EyeOff className="h-6 w-6 text-purple-400" />
            5. Data Sharing and Disclosure
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-white/80 leading-relaxed">
          <p className="font-semibold text-white text-lg">We Do NOT Sell Your Data</p>
          <p>
            We do not sell, rent, or trade your personal information to third parties for marketing or advertising purposes. 
            Your data is never used to train AI models or for any purpose other than providing you with the Service.
          </p>
          <div>
            <h3 className="font-semibold text-white mb-2">Limited Sharing Scenarios</h3>
            <p className="mb-2">We may share your information only in the following limited circumstances:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li><strong className="text-white">Service Providers:</strong> With trusted third-party service providers who assist us in operating our Service (e.g., hosting, payment processing), subject to strict confidentiality agreements.</li>
              <li><strong className="text-white">Legal Requirements:</strong> When required by law, court order, or governmental authority, or to protect our rights, property, or safety.</li>
              <li><strong className="text-white">Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets, with notice to users.</li>
              <li><strong className="text-white">With Your Consent:</strong> When you explicitly authorize us to share your information.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Your Rights */}
      <Card className="bg-gradient-to-br from-blue-900/40 to-cyan-900/40 border-blue-500/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Shield className="h-6 w-6 text-blue-400" />
            6. Your Rights and Choices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-white/80 leading-relaxed">
          <p>You have the following rights regarding your personal information:</p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li><strong className="text-white">Access:</strong> You can access and view all your data within the application at any time.</li>
            <li><strong className="text-white">Export:</strong> You can export all your data in JSON, PDF, or eBook formats through the Privacy Settings.</li>
            <li><strong className="text-white">Correction:</strong> You can update or correct your information directly within the application.</li>
            <li><strong className="text-white">Deletion:</strong> You can delete your account and all associated data at any time through the Privacy Settings.</li>
            <li><strong className="text-white">Data Retention:</strong> You can configure data retention periods and auto-deletion settings.</li>
            <li><strong className="text-white">Opt-Out:</strong> You can opt out of analytics and data sharing through your Privacy Settings.</li>
            <li><strong className="text-white">Portability:</strong> You can request a copy of your data in a machine-readable format.</li>
          </ul>
          <p className="text-sm text-white/60 italic">
            To exercise these rights, please use the Privacy Settings within the application or contact us at the email address provided below.
          </p>
        </CardContent>
      </Card>

      {/* Data Retention */}
      <Card className="bg-gradient-to-br from-green-900/40 to-emerald-900/40 border-green-500/50">
        <CardHeader>
          <CardTitle className="text-white">7. Data Retention</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-white/80 leading-relaxed">
          <p>
            We retain your personal information for as long as necessary to provide you with the Service and fulfill the purposes outlined in this Privacy Policy, 
            unless a longer retention period is required or permitted by law.
          </p>
          <p>
            You can configure your data retention preferences in Privacy Settings, including:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Setting a data retention period (30-3650 days)</li>
            <li>Enabling automatic deletion of entries older than a specified number of days</li>
            <li>Manually deleting your account and all data at any time</li>
          </ul>
          <p>
            When you delete your account, we will delete or anonymize your personal information, 
            except where we are required to retain it for legal or regulatory purposes.
          </p>
        </CardContent>
      </Card>

      {/* Children's Privacy */}
      <Card className="bg-gradient-to-br from-orange-900/40 to-red-900/40 border-orange-500/50">
        <CardHeader>
          <CardTitle className="text-white">8. Children's Privacy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-white/80 leading-relaxed">
          <p>
            Lore Book is not intended for children under the age of 13. We do not knowingly collect personal information from children under 13. 
            If you are a parent or guardian and believe your child has provided us with personal information, please contact us immediately.
          </p>
          <p>
            If we become aware that we have collected personal information from a child under 13 without parental consent, 
            we will take steps to delete that information from our servers.
          </p>
        </CardContent>
      </Card>

      {/* International Data Transfers */}
      <Card className="bg-gradient-to-br from-purple-900/40 to-fuchsia-900/40 border-purple-500/50">
        <CardHeader>
          <CardTitle className="text-white">9. International Data Transfers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-white/80 leading-relaxed">
          <p>
            Your information may be transferred to and processed in countries other than your country of residence. 
            These countries may have data protection laws that differ from those in your country.
          </p>
          <p>
            We ensure that appropriate safeguards are in place to protect your information in accordance with this Privacy Policy, 
            including compliance with GDPR and CCPA requirements.
          </p>
        </CardContent>
      </Card>

      {/* Changes to This Privacy Policy */}
      <Card className="bg-gradient-to-br from-blue-900/40 to-cyan-900/40 border-blue-500/50">
        <CardHeader>
          <CardTitle className="text-white">10. Changes to This Privacy Policy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-white/80 leading-relaxed">
          <p>
            We may update this Privacy Policy from time to time. We will notify you of any material changes by:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Posting the new Privacy Policy on this page</li>
            <li>Updating the "Last Updated" date at the top of this policy</li>
            <li>Sending you an email notification (if you have provided an email address)</li>
            <li>Displaying a prominent notice within the application</li>
          </ul>
          <p>
            Your continued use of the Service after any changes constitutes your acceptance of the updated Privacy Policy.
          </p>
        </CardContent>
      </Card>

      {/* Contact Us */}
      <Card className="bg-gradient-to-r from-purple-900/30 to-fuchsia-900/30 border-purple-500/50">
        <CardHeader>
          <CardTitle className="text-white">11. Contact Us</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-white/80 leading-relaxed">
          <p>
            If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us:
          </p>
          <div className="bg-black/40 p-4 rounded-lg border border-white/10">
            <p className="font-semibold text-white mb-2">Lore Book Privacy Team</p>
            <p className="text-sm">Email: privacy@lorekeeper.app</p>
            <p className="text-sm">Support: support@lorekeeper.app</p>
          </div>
          <p className="text-sm text-white/60 italic">
            We will respond to your inquiry within 30 days.
          </p>
        </CardContent>
      </Card>

      {/* Back Button */}
      {onBack && (
        <div className="flex justify-center pt-6">
          <Button variant="outline" onClick={onBack} className="border-purple-500/50 text-purple-400 hover:bg-purple-500/20">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Privacy & Security
          </Button>
        </div>
      )}
    </div>
  );
};

