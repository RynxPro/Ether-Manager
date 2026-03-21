import React from 'react';
import { cn } from '../../lib/utils';

export function Card({ className, children, hoverable = false, ...props }) {
  return (
    <div
      className={cn(
        "bg-surface border border-border rounded-2xl p-6 shadow-card",
        hoverable && "hover:border-white/20 hover:bg-surface/80 transition-all duration-300 cursor-pointer hover:shadow-surface",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
