import { LegalMarkdownPage } from '../components/legal/LegalMarkdownPage';

export default function Terms() {
  return (
    <LegalMarkdownPage
      title="Terms of Service"
      markdownPath="/api/legal/terms"
      siblingLabel="View Privacy Policy"
      siblingPath="/privacy-policy"
    />
  );
}
