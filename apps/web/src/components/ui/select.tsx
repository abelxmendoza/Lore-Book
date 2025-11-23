import * as React from 'react';
import { cn } from '../../lib/cn';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  children: React.ReactNode;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          'h-11 w-full rounded-lg border border-border/50 bg-black/20 px-4 text-sm text-white focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      >
        {children}
      </select>
    );
  }
);
Select.displayName = 'Select';

// For compatibility with shadcn-style API
export const SelectTrigger = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return <Select ref={ref} className={className} {...props}>{children}</Select>;
  }
);
SelectTrigger.displayName = 'SelectTrigger';

export const SelectValue = ({ placeholder, ...props }: { placeholder?: string } & React.HTMLAttributes<HTMLOptionElement>) => {
  return <option value="" disabled {...props}>{placeholder || 'Select...'}</option>;
};

export const SelectContent = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
};

export const SelectItem = React.forwardRef<HTMLOptionElement, React.OptionHTMLAttributes<HTMLOptionElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <option ref={ref} className={className} {...props}>
        {children}
      </option>
    );
  }
);
SelectItem.displayName = 'SelectItem';

