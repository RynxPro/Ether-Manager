import { ArrowUp } from "lucide-react";

export default function UpdateBadge({ className = "", children }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-(--color-update)/10 text-(--color-update) border border-(--color-update)/20 backdrop-blur-md shadow-[0_0_15px_rgba(250,204,21,0.1)] ${className}`}
    >
      <ArrowUp size={10} />
      {children || "Update"}
    </span>
  );
}
