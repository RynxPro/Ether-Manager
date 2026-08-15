import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import type { InstallProgress } from "@/lib/tauri-commands";

interface UseInstallProgressResult {
  progress: InstallProgress | null;
  speedBytesPerSec: number | null;
  percent: number | null;
}

/** Listens to the `gamebanana-install-progress` event — now emitted only by
 * `update_installed_mod`, since installs moved to the download queue and its own per-row
 * `download-progress` event — while `active` is true, deriving download speed from samples and
 * percent from `progress.total` (when the server sent a Content-Length). Resets whenever
 * `active` goes false, so switching from pending back to idle clears stale progress. */
export function useInstallProgress(active: boolean): UseInstallProgressResult {
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [speedBytesPerSec, setSpeedBytesPerSec] = useState<number | null>(null);
  const lastSample = useRef<{ time: number; downloaded: number } | null>(null);

  useEffect(() => {
    if (!active) {
      setProgress(null);
      setSpeedBytesPerSec(null);
      lastSample.current = null;
      return;
    }

    const unlistenPromise = listen<InstallProgress>("gamebanana-install-progress", (event) => {
      const now = performance.now();
      const previous = lastSample.current;
      if (previous) {
        const elapsedSec = (now - previous.time) / 1000;
        const bytesSinceLast = event.payload.downloaded - previous.downloaded;
        if (elapsedSec > 0) {
          setSpeedBytesPerSec(bytesSinceLast / elapsedSec);
        }
      }
      lastSample.current = { time: now, downloaded: event.payload.downloaded };
      setProgress(event.payload);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [active]);

  const percent =
    progress?.total && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null;

  return { progress, speedBytesPerSec, percent };
}
