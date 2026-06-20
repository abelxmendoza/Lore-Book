import { Mail } from 'lucide-react';

import { cn } from '../../lib/cn';
import { CONTACT_EMAIL, CONTACT_LINK_PROPS } from '../../lib/contact';

interface FounderContactProps {
  className?: string;
  /** inline = text link under bio; block = card row with icon */
  variant?: 'inline' | 'block';
  label?: string;
}

export function FounderContact({
  className,
  variant = 'inline',
  label = 'Contact',
}: FounderContactProps) {
  if (variant === 'block') {
    return (
      <div
        className={cn(
          'flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 pt-3 mt-3 border-t border-white/10',
          className,
        )}
      >
        <div className="flex items-center gap-2 text-white/45 text-xs uppercase tracking-wider">
          <Mail className="h-3.5 w-3.5 text-primary shrink-0" />
          {label}
        </div>
        <a
          {...CONTACT_LINK_PROPS}
          className="text-sm text-primary hover:text-primary/80 transition break-all"
        >
          {CONTACT_EMAIL}
        </a>
      </div>
    );
  }

  return (
    <p className={cn('text-sm text-white/50 mt-3', className)}>
      {label}:{' '}
      <a {...CONTACT_LINK_PROPS} className="text-primary hover:underline break-all">
        {CONTACT_EMAIL}
      </a>
    </p>
  );
}
