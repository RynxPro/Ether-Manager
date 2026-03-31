import React from 'react';
import { cn } from '../../lib/utils';

export const Input = React.forwardRef(({ className, icon: Icon, ...props }, ref) => {
  return (
    <div className="ui-input-shell">
      {Icon && (
        <div className="ui-input-icon">
          <Icon className="w-4 h-4" />
        </div>
      )}
      <input
        ref={ref}
        className={cn(
          "ui-input-control ui-focus-ring",
          Icon ? "pl-10 pr-4 py-2.5" : "px-4 py-2.5",
          className
        )}
        {...props}
      />
    </div>
  );
});
Input.displayName = "Input";
