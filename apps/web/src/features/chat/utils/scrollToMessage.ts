/**
 * Smoothly scrolls to a message by its ID. Retries briefly while message refs mount
 * (long threads often register refs after the first paint).
 */
export const scrollToMessage = (
  messageId: string,
  containerRef: React.RefObject<HTMLElement | null>,
  messageRefs: Map<string, HTMLElement>,
  options?: { attempts?: number; behavior?: ScrollBehavior },
): void => {
  const maxAttempts = options?.attempts ?? 12;
  const behavior = options?.behavior ?? 'smooth';

  const tryScroll = (attempt: number) => {
    const element = messageRefs.get(messageId);
    const container = containerRef.current;
    if (element && container) {
      element.scrollIntoView({ behavior, block: 'center' });
      element.classList.add('ring-2', 'ring-primary/50', 'rounded-lg');
      window.setTimeout(() => {
        element.classList.remove('ring-2', 'ring-primary/50', 'rounded-lg');
      }, 2800);
      return;
    }
    if (attempt + 1 >= maxAttempts) return;
    window.requestAnimationFrame(() => tryScroll(attempt + 1));
  };

  tryScroll(0);
};
