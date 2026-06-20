/** Public founder contact — legal, Chronicle, Lore, and support surfaces. */
export const FOUNDER_EMAIL = 'abelxmendoza@gmail.com';

/** Public contact email for user support, privacy, and general inquiries. */
export const CONTACT_EMAIL =
  import.meta.env.VITE_CONTACT_EMAIL?.trim() || FOUNDER_EMAIL;

export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}` as const;
