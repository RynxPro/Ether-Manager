import React from 'react';
import { cn } from '../../lib/utils';

export function Card({ className, children, hoverable = false, ...props }) {
  return (
    <div
      className={cn(
        "bg-card border border-border rounded-2xl p-6",
        hoverable && "hover:border-neutral hover:bg-secondary/50 transition-all duration-300 cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
