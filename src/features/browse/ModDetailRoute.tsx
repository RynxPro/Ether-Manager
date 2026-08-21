import { useState } from "react";
import type { GbFile, GbMod, GbModDetail } from "@/lib/tauri-commands";
import { InstallConfirmDialog } from "./InstallConfirmDialog";
import { ModDetailPage } from "./ModDetailPage";

interface ModDetailRouteProps {
  mod: GbMod;
  onBack: () => void;
  /** Opens the author's page. Owned by App because the creator page is a sibling frame in
   * the same drill-down chain, not something this route renders inside itself. */
  onOpenCreator: (id: number, name: string) => void;
}

/** Pairs the mod detail page with its install dialog. Install stays a dialog on purpose — it's
 * a short, focused confirmation that interrupts by design, which is exactly what a modal is
 * for; only the browsing surfaces became pages. */
export function ModDetailRoute({ mod, onBack, onOpenCreator }: ModDetailRouteProps) {
  const [installFile, setInstallFile] = useState<GbFile | null>(null);
  const [installDetail, setInstallDetail] = useState<GbModDetail | null>(null);

  function closeInstall() {
    setInstallFile(null);
    setInstallDetail(null);
  }

  return (
    <>
      <ModDetailPage
        // Keyed by mod id so local state (`revealed`, `activeImageIndex`) resets when the mod
        // changes — a mature-content reveal must never leak from one mod to the next.
        key={mod.id}
        mod={mod}
        onBack={onBack}
        onOpenCreator={onOpenCreator}
        onInstall={(file, detail) => {
          setInstallFile(file);
          setInstallDetail(detail);
        }}
      />

      {installFile && installDetail && (
        <InstallConfirmDialog
          key={`${installDetail.id}-${installFile.id}`}
          detail={installDetail}
          file={installFile}
          onOpenChange={(open) => {
            if (!open) closeInstall();
          }}
          // Deliberately does not navigate back: the old dialog closed itself and revealed the
          // grid behind it, but yanking a whole page away after a successful install is
          // disorienting. You stay on the mod you just installed and leave when you choose.
          onInstalled={closeInstall}
        />
      )}
    </>
  );
}
