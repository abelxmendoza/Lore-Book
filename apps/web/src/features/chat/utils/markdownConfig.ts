// Markdown renderer configuration
export const markdownConfig = {
  // Syntax highlighting theme
  codeTheme: 'dark',
  
  // Allowed HTML tags
  allowedTags: ['p', 'br', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'blockquote', 'a', 'h1', 'h2', 'h3'],
  
  // Link handling
  linkTarget: '_blank',
  linkRel: 'noopener noreferrer',
  
  // Code block configuration
  codeBlockClass: 'bg-black/60 border border-border/30 rounded p-2 text-sm font-mono',
  inlineCodeClass: 'bg-black/40 px-1 rounded text-primary/80',
};

