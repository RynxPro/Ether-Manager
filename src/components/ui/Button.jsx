import React from "react";
import { cn } from "../../lib/utils";
import { Loader2 } from "lucide-react";

const variants = {
  primary: "ui-button-primary",
  secondary: "ui-button-secondary",
  ghost: "ui-button-ghost",
  danger: "ui-button-danger",
};

const sizes = {
  sm: "ui-button-sm",
  md: "ui-button-md",
  lg: "ui-button-lg",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
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
        "ui-button-base ui-focus-ring",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="animate-spin w-4 h-4" />
      ) : Icon ? (
        <Icon className={cn("w-4 h-4", size === "lg" && "w-5 h-5")} />
      ) : null}
      {children}
    </button>
  );
}
