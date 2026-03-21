import React from 'react';
import { cn } from '../../lib/utils';

export const Input = React.forwardRef(({ className, icon: Icon, ...props }, ref) => {
  return (
    <div className="relative w-full">
      {Icon && (
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
          <Icon className="w-4 h-4" />
        </div>
      )}
      <input
        ref={ref}
        className={cn(
          "w-full bg-black/40 border border-border rounded-xl text-sm font-medium text-text-primary",
          "focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all",
          "placeholder:text-text-muted hover:bg-black/60",
          Icon ? "pl-10 pr-4 py-2.5" : "px-4 py-2.5",
          className
        )}
        {...props}
      />
    </div>
  );
});
Input.displayName = "Input";
