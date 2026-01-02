/**
 * Smoothly scrolls to a message by its ID
 */
export const scrollToMessage = (
  messageId: string,
  containerRef: React.RefObject<HTMLElement>,
  messageRefs: Map<string, HTMLElement>
): void => {
  const element = messageRefs.get(messageId);
  if (element && containerRef.current) {
    const container = containerRef.current;
    const elementTop = element.offsetTop;
    const containerTop = container.scrollTop;
    const containerHeight = container.clientHeight;
    const elementHeight = element.offsetHeight;
    
    // Calculate scroll position to center the element
    const scrollPosition = elementTop - containerTop - (containerHeight / 2) + (elementHeight / 2);
    
    container.scrollTo({
      top: container.scrollTop + scrollPosition,
      behavior: 'smooth'
    });
    
    // Add highlight class temporarily
    element.classList.add('ring-2', 'ring-primary/50', 'rounded-lg');
    setTimeout(() => {
      element.classList.remove('ring-2', 'ring-primary/50', 'rounded-lg');
    }, 2000);
  }
};

