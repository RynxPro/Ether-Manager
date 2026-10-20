import { useMutation, useQuery } from "@tanstack/react-query";
import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useState } from "react";
import type { InstallProgress } from "@/lib/tauri-commands";

/** The running app's own version, the one compiled in from `tauri.conf.json`.
 *
 * Held in the query cache rather than read per component because it cannot change while the
 * process is alive — `staleTime: Infinity` makes every caller after the first free, and the two
 * places that show it (the title bar readout and the Settings sheet) stay in step by
 * construction rather than by both remembering to ask the same way. */
export function useAppVersion() {
  return useQuery({
    queryKey: ["appVersion"],
    queryFn: getVersion,
    staleTime: Infinity,
  });
}

/** Whether the release endpoint is offering something newer than what is running.
 *
 * Resolves to an `Update` when there is one and to `null` when there is not — that null is the
 * plugin's own distinction, not an absence of data, so a successful check with nothing to offer
 * is still a loaded query.
 *
 * Asked once per run. A poll would be answering a question that cannot usefully change
 * mid-session: applying anything found here exits the app, so a second answer arriving an hour
 * in has nowhere to go. Settings can ask again by hand, which is the only re-check ever wanted.
 *
 * `retry: false` because the expected failure is a verdict rather than a flake. Until the
 * repository has a published release the endpoint returns a 404 every time, and the default
 * three tries with backoff would turn a known answer into four requests and several seconds of
 * "checking". A genuine network blip simply reports itself, which is the honest thing for a
 * check nobody asked for out loud.
 *
 * `gcTime: Infinity` because the `Update` is a handle on a Rust-side resource and installing
 * needs the same object the check produced. Letting the cache collect it would leave the
 * Install button holding a handle to something the backend had already dropped. The handle a
 * manual re-check replaces is not closed, which is deliberate rather than overlooked: that
 * costs one small resource per press of a button nobody presses in a loop, and closing the
 * previous one means tracking which of them the UI is still rendering. */
export function useAppUpdate() {
  return useQuery<Update | null>({
    queryKey: ["appUpdate"],
    queryFn: () => check(),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

interface UseInstallAppUpdateResult {
  install: (update: Update) => void;
  isInstalling: boolean;
  error: Error | null;
  /** Shaped as the mod installer's progress so `InstallProgressBar` can draw it unchanged —
   * bytes of a download are bytes of a download. Null until the first chunk arrives. */
  progress: InstallProgress | null;
  percent: number | null;
}

/** Downloads the update and hands it to the installer.
 *
 * On Windows this call does not return: the NSIS installer takes over, closes the app and
 * relaunches the new build itself. So there is no success state to render and no need for
 * `@tauri-apps/plugin-process` — `isInstalling` simply stays true until the process is gone,
 * which is exactly the right thing to be showing while it happens.
 *
 * That also means the only outcomes worth designing for are "still going" and "failed". A
 * failure here is usually a signature that does not verify or a download that was cut off, and
 * both leave the current install untouched. */
export function useInstallAppUpdate(): UseInstallAppUpdateResult {
  const [progress, setProgress] = useState<InstallProgress | null>(null);

  const mutation = useMutation({
    mutationFn: async (update: Update) => {
      setProgress(null);
      // Counted here rather than from the previous state because `Progress` reports the size of
      // each chunk, not a running total, and chunks can land faster than React commits.
      let downloaded = 0;
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            // `contentLength` is absent when the server sent no Content-Length, which the bar
            // already handles by running indeterminate rather than guessing at a percentage.
            setProgress({ downloaded: 0, total: event.data.contentLength ?? null });
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            setProgress((current) => ({ downloaded, total: current?.total ?? null }));
            break;
          case "Finished":
            // Snap to full. Chunk sizes and the declared length disagree often enough that a
            // finished download otherwise rests at 99%, which reads as stalled at the exact
            // moment the installer is about to take the window away.
            setProgress((current) => ({
              downloaded: current?.total ?? downloaded,
              total: current?.total ?? null,
            }));
            break;
        }
      });
    },
  });

  const percent =
    progress?.total && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null;

  return {
    install: mutation.mutate,
    isInstalling: mutation.isPending,
    error: mutation.error,
    progress,
    percent,
  };
}
