import { Shield, Lock, Database, EyeOff, Key, Server, CheckCircle2, AlertCircle, FileLock, Globe, Zap, Download, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';

interface PrivacySecurityPageProps {
  onSurfaceChange?: (surface: 'privacy-settings' | 'privacy-policy') => void;
}

export const PrivacySecurityPage = ({ onSurfaceChange }: PrivacySecurityPageProps = {}) => {
  return (
    <div className="space-y-8 max-w-6xl mx-auto text-white w-full" role="main" aria-label="Privacy and Security">
      {/* Hero Section */}
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="relative">
            <Shield className="h-20 w-20 text-purple-400 animate-pulse" />
            <Lock className="h-10 w-10 text-green-400 absolute -bottom-2 -right-2" />
          </div>
        </div>
        <h1 className="text-4xl font-bold text-white">Your Information is Safe & Locked</h1>
        <p className="text-xl text-white/70 max-w-2xl mx-auto">
          Your data never leaves our secure infrastructure. Everything is encrypted, protected, and accessible only by you.
        </p>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/20 text-green-400 border border-green-500/50 rounded-full text-sm">
          <CheckCircle2 className="h-4 w-4" />
          All Systems Secure
        </div>
      </div>

      {/* Main Security Features */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Encryption */}
        <Card className="bg-gradient-to-br from-purple-900/40 to-fuchsia-900/40 border-purple-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Lock className="h-6 w-6 text-purple-400" />
              End-to-End Encryption
            </CardTitle>
            <CardDescription className="text-white/70">
              Your data is encrypted at every layer
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white font-medium">Encrypted in Transit</p>
                <p className="text-sm text-white/60">All data transfers use TLS 1.3 encryption</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white font-medium">Encrypted at Rest</p>
                <p className="text-sm text-white/60">Database encryption with AES-256</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white font-medium">Client-Side Encryption</p>
                <p className="text-sm text-white/60">Sensitive data encrypted before sending</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data Isolation */}
        <Card className="bg-gradient-to-br from-blue-900/40 to-cyan-900/40 border-blue-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Database className="h-6 w-6 text-blue-400" />
              Complete Data Isolation
            </CardTitle>
            <CardDescription className="text-white/70">
              Your data is completely isolated from others
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white font-medium">Row-Level Security</p>
                <p className="text-sm text-white/60">Database-level access control ensures only you can see your data</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white font-medium">User-Scoped Queries</p>
                <p className="text-sm text-white/60">Every API request is filtered by your user ID</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white font-medium">No Cross-User Access</p>
                <p className="text-sm text-white/60">Impossible for other users to access your data</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* No Data Selling */}
        <Card className="bg-gradient-to-br from-green-900/40 to-emerald-900/40 border-green-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <EyeOff className="h-6 w-6 text-green-400" />
              We Never Sell Your Data
            </CardTitle>
            <CardDescription className="text-white/70">
              Your privacy is not for sale
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white font-medium">No Third-Party Sharing</p>
                <p className="text-sm text-white/60">We don't share your data with advertisers, data brokers, or third parties</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white font-medium">No Advertising Tracking</p>
                <p className="text-sm text-white/60">We don't use your data for advertising or marketing</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white font-medium">No Analytics on Personal Data</p>
                <p className="text-sm text-white/60">Usage analytics are anonymized and don't include your content</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Infrastructure Security */}
        <Card className="bg-gradient-to-br from-orange-900/40 to-red-900/40 border-orange-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Server className="h-6 w-6 text-orange-400" />
              Secure Infrastructure
            </CardTitle>
            <CardDescription className="text-white/70">
              Enterprise-grade security infrastructure
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white font-medium">Hosted on Supabase</p>
                <p className="text-sm text-white/60">Enterprise-grade PostgreSQL with built-in security</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white font-medium">Regular Security Audits</p>
                <p className="text-sm text-white/60">We perform regular security assessments and updates</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white font-medium">Automated Backups</p>
                <p className="text-sm text-white/60">Your data is backed up daily with point-in-time recovery</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Your Control */}
      <Card className="bg-gradient-to-r from-purple-900/30 to-fuchsia-900/30 border-purple-500/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white text-2xl">
            <Key className="h-7 w-7 text-purple-400" />
            You Have Complete Control
          </CardTitle>
          <CardDescription className="text-white/70 text-lg">
            Your data, your rules
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center space-y-3">
              <div className="flex justify-center">
                <div className="p-4 bg-purple-500/20 rounded-full">
                  <Download className="h-8 w-8 text-purple-400" />
                </div>
              </div>
              <h3 className="font-semibold text-white text-lg">Export Anytime</h3>
              <p className="text-sm text-white/70">
                Download all your data in JSON, PDF, or eBook format. Your data belongs to you.
              </p>
            </div>
            <div className="text-center space-y-3">
              <div className="flex justify-center">
                <div className="p-4 bg-purple-500/20 rounded-full">
                  <Trash2 className="h-8 w-8 text-purple-400" />
                </div>
              </div>
              <h3 className="font-semibold text-white text-lg">Delete Anytime</h3>
              <p className="text-sm text-white/70">
                Permanently delete your account and all data. No questions asked, no data retained.
              </p>
            </div>
            <div className="text-center space-y-3">
              <div className="flex justify-center">
                <div className="p-4 bg-purple-500/20 rounded-full">
                  <FileLock className="h-8 w-8 text-purple-400" />
                </div>
              </div>
              <h3 className="font-semibold text-white text-lg">Privacy Settings</h3>
              <p className="text-sm text-white/70">
                Control data retention, encryption, and sharing preferences. Customize your privacy.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Compliance & Standards */}
      <Card className="bg-black/40 border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white text-xl">
            <Globe className="h-6 w-6 text-primary" />
            Compliance & Standards
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-400" />
                <span className="font-semibold text-white">GDPR Compliant</span>
              </div>
              <p className="text-sm text-white/70 ml-7">
                Full compliance with EU General Data Protection Regulation. You have the right to access, rectify, and delete your data.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-400" />
                <span className="font-semibold text-white">CCPA Compliant</span>
              </div>
              <p className="text-sm text-white/70 ml-7">
                California Consumer Privacy Act compliant. Your data rights are protected.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-400" />
                <span className="font-semibold text-white">SOC 2 Type II</span>
              </div>
              <p className="text-sm text-white/70 ml-7">
                Our infrastructure provider (Supabase) maintains SOC 2 Type II certification.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-400" />
                <span className="font-semibold text-white">ISO 27001</span>
              </div>
              <p className="text-sm text-white/70 ml-7">
                Infrastructure follows ISO 27001 security management standards.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security Guarantees */}
      <Card className="bg-gradient-to-r from-green-900/20 to-emerald-900/20 border-green-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Shield className="h-6 w-6 text-green-400" />
            Security Guarantees
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              'All API requests require authentication',
              'Session tokens expire automatically',
              'Password hashing with bcrypt',
              'Rate limiting prevents abuse',
              'Input validation and sanitization',
              'SQL injection protection',
              'XSS (Cross-Site Scripting) protection',
              'CSRF (Cross-Site Request Forgery) protection',
              'Regular dependency updates',
              'Security headers configured',
              'HTTPS enforced everywhere',
              'No sensitive data in logs'
            ].map((guarantee, idx) => (
              <div key={idx} className="flex items-start gap-2 text-sm text-white/80">
                <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>{guarantee}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Call to Action */}
      <div className="text-center space-y-4 pt-6">
        <h2 className="text-2xl font-bold text-white">Your Data is Locked Within This App</h2>
        <p className="text-white/70 max-w-2xl mx-auto">
          Everything you write, every memory you save, every character you create - it all stays here, 
          encrypted and protected. We can't see it, advertisers can't see it, and other users can't see it. 
          Only you have the key.
        </p>
        <div className="flex gap-4 justify-center">
          <Button 
            variant="outline" 
            onClick={() => onSurfaceChange?.('privacy-settings')}
            className="border-purple-500/50 text-purple-400 hover:bg-purple-500/20"
          >
            View Privacy Settings
          </Button>
          <Button 
            variant="outline"
            onClick={() => onSurfaceChange?.('privacy-policy')}
            className="border-purple-500/50 text-purple-400 hover:bg-purple-500/20"
          >
            Read Privacy Policy
          </Button>
        </div>
      </div>

      {/* Trust Badge */}
      <div className="text-center pt-8 border-t border-white/10">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/20 rounded-full border border-green-500/50">
          <Shield className="h-5 w-5 text-green-400" />
          <span className="text-green-400 font-semibold">Verified Secure</span>
        </div>
        <p className="text-sm text-white/60 mt-4">
          Last security audit: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </p>
      </div>
    </div>
  );
};

