import React from 'react';
import { cn } from '../../lib/utils';

export function Card({ className, children, hoverable = false, ...props }) {
  return (
    <div
      className={cn(
        "ui-panel p-6",
        hoverable && "ui-panel-hover cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
