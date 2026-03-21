import React from 'react';
import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';

const variants = {
  primary: 'bg-primary text-black hover:brightness-110 shadow-card',
  secondary: 'bg-surface text-text-primary border border-border hover:bg-white/5',
  ghost: 'bg-transparent text-text-secondary hover:text-text-primary hover:bg-white/5',
  danger: 'bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20 hover:border-danger/40',
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-6 py-3.5 text-base',
};

export function Button({ 
  className, 
  variant = 'primary', 
  size = 'md', 
  isLoading, 
  disabled, 
  children, 
  icon: Icon,
  ...props 
}) {
  return (
    <button
      disabled={disabled || isLoading}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-bold transition-all duration-300 rounded-xl outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="animate-spin w-4 h-4" />
      ) : Icon ? (
        <Icon className={cn("w-4 h-4", size === 'lg' && "w-5 h-5")} />
      ) : null}
      {children}
    </button>
  );
}
