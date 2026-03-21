import React from 'react';
import { cn } from '../../lib/utils';

const variants = {
  default: 'bg-surface border border-border text-text-secondary',
  primary: 'bg-primary/10 text-primary border border-primary/20 shadow-[0_0_10px_var(--color-primary)]/10',
  success: 'bg-success/10 text-success border border-success/20',
  warning: 'bg-warning/10 text-warning border border-warning/20',
  danger: 'bg-danger/10 text-danger border border-danger/20',
};

export function Badge({ children, variant = 'default', className, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
