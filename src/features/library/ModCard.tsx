import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { Mod, UpdateCheck } from "@/lib/tauri-commands";
import { UpdateModDialog } from "./UpdateModDialog";

interface ModCardProps {
  mod: Mod;
  updateCheck?: UpdateCheck;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
  isToggling: boolean;
  isDeleting: boolean;
}

export function ModCard({
  mod,
  updateCheck,
  onToggle,
  onDelete,
  isToggling,
  isDeleting,
}: ModCardProps) {
  const hasUpdate = updateCheck?.status === "UpdateAvailable";

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 p-3 transition-colors hover:bg-card">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
        {mod.thumbnail_path ? (
          <img
            src={mod.thumbnail_path}
            alt={mod.display_name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            No preview
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {mod.display_name}
          </p>
          {hasUpdate && <Badge variant="secondary">Update available</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">{mod.enabled ? "Enabled" : "Disabled"}</p>
      </div>

      {hasUpdate && updateCheck && (
        <UpdateModDialog
          key={`${updateCheck.mod_id}:${updateCheck.suggested_file_id ?? "none"}`}
          mod={mod}
          updateCheck={updateCheck}
        />
      )}

      <Switch
        checked={mod.enabled}
        disabled={isToggling}
        onCheckedChange={onToggle}
        aria-label={`Toggle ${mod.display_name}`}
      />

      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={isDeleting}
        onClick={onDelete}
        aria-label={`Delete ${mod.display_name}`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
