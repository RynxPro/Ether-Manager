import { motion } from "framer-motion";
import { cn } from "../../lib/utils";

export function InteractiveCard({
  className,
  children,
  whileHover = { y: -10, scale: 1.01 },
  transition = { duration: 0.15, ease: "easeOut" },
  borderGlowClassName = "group-hover:border-primary/20",
  shadowGlowClassName = "shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5),0_0_15px_color-mix(in_srgb,var(--color-primary),transparent_82%)]",
  ...props
}) {
  return (
    <motion.div
      whileHover={whileHover}
      transition={transition}
      className={cn(
        "ui-panel ui-panel-hover group relative flex flex-col overflow-hidden",
        className,
      )}
      {...props}
    >
      {children}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 rounded-[inherit] border border-white/0 transition-all",
          borderGlowClassName,
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-0 z-[-1] rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100",
          shadowGlowClassName,
        )}
      />
    </motion.div>
  );
}
