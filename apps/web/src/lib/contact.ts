/** Public product contact — legal, Chronicle, Lore, and support surfaces. */

/** Fallback when VITE_CONTACT_EMAIL is unset (never a personal founder inbox). */
export const DEFAULT_CONTACT_EMAIL = 'support@lorebook.app';

/** Public contact email for user support, privacy, and general inquiries. */
export const CONTACT_EMAIL =
  import.meta.env.VITE_CONTACT_EMAIL?.trim() || DEFAULT_CONTACT_EMAIL;

/** @deprecated Use CONTACT_EMAIL — kept for older imports. */
export const FOUNDER_EMAIL = CONTACT_EMAIL;

/** Gmail compose — avoids opening the OS default mail client (e.g. Outlook). */
export const CONTACT_GMAIL_URL =
  `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(CONTACT_EMAIL)}` as const;

/** @deprecated Name kept for imports — opens Gmail compose, not mailto. */
export const CONTACT_MAILTO = CONTACT_GMAIL_URL;

export const CONTACT_LINK_PROPS = {
  href: CONTACT_GMAIL_URL,
  target: '_blank',
  rel: 'noopener noreferrer',
} as const;
