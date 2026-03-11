import { ArrowUp } from "lucide-react";

export default function UpdateBadge({ className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 ${className}`}
    >
      <ArrowUp size={10} />
      Update
    </span>
  );
}
