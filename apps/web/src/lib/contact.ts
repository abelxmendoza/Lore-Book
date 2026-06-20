/** Public founder contact — legal, Chronicle, Lore, and support surfaces. */
export const FOUNDER_EMAIL = 'abelxmendoza@gmail.com';

/** Public contact email for user support, privacy, and general inquiries. */
export const CONTACT_EMAIL =
  import.meta.env.VITE_CONTACT_EMAIL?.trim() || FOUNDER_EMAIL;

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
