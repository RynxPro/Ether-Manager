import { ArrowUp } from "lucide-react";

export default function UpdateBadge({ className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-(--active-accent)/10 text-(--active-accent) border border-(--active-accent)/20 backdrop-blur-md shadow-[0_0_15px_var(--active-accent)]/10 ${className}`}
    >
      <ArrowUp size={10} />
      Update
    </span>
  );
}
