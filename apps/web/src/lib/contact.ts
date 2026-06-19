/** Public contact email for user support, privacy, and general inquiries. */
export const CONTACT_EMAIL =
  import.meta.env.VITE_CONTACT_EMAIL?.trim() || 'support@lorebook.app';

export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}` as const;
