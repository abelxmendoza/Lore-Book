import { LegalMarkdownPage } from '../components/legal/LegalMarkdownPage';

export default function PrivacyPolicy() {
  return (
    <LegalMarkdownPage
      title="Privacy Policy"
      markdownPath="/api/legal/privacy"
      siblingLabel="View Terms of Service"
      siblingPath="/terms"
    />
  );
}
