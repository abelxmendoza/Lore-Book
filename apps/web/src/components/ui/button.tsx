import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '../../lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-r from-purple-600 to-fuchsia-500 text-white shadow-neon hover:opacity-90',
        ghost: 'bg-transparent border border-border text-foreground hover:border-primary',
        outline: 'border border-primary text-primary hover:bg-primary/10',
        subtle: 'bg-accent text-foreground hover:bg-accent/80'
      },
      size: {
        default: 'h-11 px-6 text-sm min-h-[44px]',
        sm: 'h-9 px-4 text-xs min-h-[36px]',
        lg: 'h-12 px-8 text-base min-h-[48px]',
        icon: 'h-11 w-11 min-h-[44px] min-w-[44px]'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
  };

export const Button = ({
  className,
  variant,
  size,
  leftIcon,
  rightIcon,
  children,
  disabled,
  'aria-label': ariaLabel,
  ...props
}: ButtonProps) => {
  // Generate accessible label if children is just text
  const accessibleLabel = ariaLabel || (typeof children === 'string' ? children : undefined);
  
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled}
      aria-label={accessibleLabel}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      {...props}
    >
      {leftIcon && <span className="mr-2" aria-hidden="true">{leftIcon}</span>}
      {children}
      {rightIcon && <span className="ml-2" aria-hidden="true">{rightIcon}</span>}
    </button>
  );
};
