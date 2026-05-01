import { Heart, Download, Eye } from "lucide-react";

export default function ModStats({ mod }) {
  if (mod.isImported) return null;

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 shadow-md">
      <h3 className="text-sm font-bold text-text-primary mb-4">Statistics</h3>
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col items-center justify-center bg-background border border-white/5 rounded-xl p-3">
          <Heart size={16} className="text-primary mb-1.5" />
          <span className="text-sm font-bold text-white">
            {mod._nLikeCount?.toLocaleString() || 0}
          </span>
          <span className="text-[9px] uppercase tracking-wider text-text-muted mt-0.5">
            Likes
          </span>
        </div>
        <div className="flex flex-col items-center justify-center bg-background border border-white/5 rounded-xl p-3">
          <Download size={16} className="text-blue-400 mb-1.5" />
          <span className="text-sm font-bold text-white">
            {mod._nDownloadCount?.toLocaleString() || 0}
          </span>
          <span className="text-[9px] uppercase tracking-wider text-text-muted mt-0.5">
            Downloads
          </span>
        </div>
        <div className="flex flex-col items-center justify-center bg-background border border-white/5 rounded-xl p-3">
          <Eye size={16} className="text-purple-400 mb-1.5" />
          <span className="text-sm font-bold text-white">
            {mod._nViewCount?.toLocaleString() || 0}
          </span>
          <span className="text-[9px] uppercase tracking-wider text-text-muted mt-0.5">
            Views
          </span>
        </div>
      </div>
    </div>
  );
}
