/** Height of the mobile bottom tab bar (excludes safe-area inset). */
export const OMNI_TIMELINE_BOTTOM_NAV_HEIGHT = '3.25rem';

/** Total inset to reserve above the home indicator + bottom nav. */
export const omniTimelineBottomInset =
  `calc(${OMNI_TIMELINE_BOTTOM_NAV_HEIGHT} + env(safe-area-inset-bottom, 0px))` as const;
