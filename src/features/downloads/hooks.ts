import { listen } from "@tauri-apps/api/event";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  cancelDownload,
  clearFinishedDownloads,
  listDownloads,
  pauseDownload,
  resumeDownload,
  retryDownload,
  type Download,
  type DownloadPhaseEvent,
  type DownloadProgressEvent,
} from "@/lib/tauri-commands";

/** The queue, refetched whenever Rust says it changed.
 *
 * Rust emits `downloads-changed` without a payload and this refetches, rather than patching a
 * row from an event — there is then exactly one description of the queue and it is the
 * database's, which matters because a download outlives the screen that started it.
 *
 * The library invalidations are here for the same reason: nothing awaits an install anymore, so
 * a finished download is the only thing that can tell the library a mod arrived. `updateChecks`
 * is in the list because a reinstall runs through this queue too, and the row it rewrites is the
 * one carrying the "update available" badge that the reinstall just answered. */
export function useDownloads() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unlistenPromise = listen("downloads-changed", () => {
      queryClient.invalidateQueries({ queryKey: ["downloads"] });
      queryClient.invalidateQueries({ queryKey: ["mods"] });
      queryClient.invalidateQueries({ queryKey: ["allMods"] });
      queryClient.invalidateQueries({ queryKey: ["modCounts"] });
      queryClient.invalidateQueries({ queryKey: ["updateChecks"] });
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [queryClient]);

  return useQuery({ queryKey: ["downloads"], queryFn: listDownloads });
}

export interface LiveProgress {
  downloaded: number;
  total: number | null;
  speedBytesPerSec: number | null;
  /** True once the bytes are in and the archive is being unpacked — the stretch with nothing
   * to measure, where a bar alone would look stuck. */
  isExtracting: boolean;
}

/** Live byte counts keyed by download id.
 *
 * Kept in component state rather than the query cache: this updates several times a second and
 * would otherwise re-render every consumer of the download list on every tick. The persisted row
 * only carries byte counts at phase boundaries, so this is what makes an active row move. */
export function useDownloadProgress(): Record<number, LiveProgress> {
  const [progress, setProgress] = useState<Record<number, LiveProgress>>({});
  const lastSample = useRef<Record<number, { time: number; downloaded: number }>>({});

  useEffect(() => {
    const progressPromise = listen<DownloadProgressEvent>("download-progress", (event) => {
      const { id, downloaded, total } = event.payload;
      const now = performance.now();
      const previous = lastSample.current[id];
      const elapsedSec = previous ? (now - previous.time) / 1000 : 0;
      const speedBytesPerSec =
        previous && elapsedSec > 0 ? (downloaded - previous.downloaded) / elapsedSec : null;
      lastSample.current[id] = { time: now, downloaded };

      setProgress((current) => ({
        ...current,
        [id]: {
          downloaded,
          total,
          // Keep the last known speed through a sample that produced none, so the figure does
          // not blink out between ticks.
          speedBytesPerSec: speedBytesPerSec ?? current[id]?.speedBytesPerSec ?? null,
          isExtracting: false,
        },
      }));
    });

    const phasePromise = listen<DownloadPhaseEvent>("download-phase", (event) => {
      setProgress((current) => {
        const existing = current[event.payload.id];
        if (!existing) return current;
        return {
          ...current,
          [event.payload.id]: { ...existing, isExtracting: true, speedBytesPerSec: null },
        };
      });
    });

    return () => {
      progressPromise.then((unlisten) => unlisten());
      phasePromise.then((unlisten) => unlisten());
    };
  }, []);

  return progress;
}

export function useCancelDownload() {
  return useMutation({ mutationFn: (id: number) => cancelDownload(id) });
}

export function usePauseDownload() {
  return useMutation({ mutationFn: (id: number) => pauseDownload(id) });
}

export function useResumeDownload() {
  return useMutation({ mutationFn: (id: number) => resumeDownload(id) });
}

export function useRetryDownload() {
  return useMutation({ mutationFn: (id: number) => retryDownload(id) });
}

export function useClearFinishedDownloads() {
  return useMutation({ mutationFn: clearFinishedDownloads });
}

/** Downloads that still have work left in them. Drives the nav badge as well as the page's own
 * split, so both agree on what "active" means.
 *
 * Paused counts. It is not running, but it is unfinished work the user asked for and can pick up
 * again — dropping it into history would bury the one row that still owns bytes on disk. */
export function activeDownloads(downloads: Download[] | undefined): Download[] {
  return (downloads ?? []).filter(
    (download) =>
      download.status === "Queued" ||
      download.status === "Downloading" ||
      download.status === "Extracting" ||
      download.status === "Paused",
  );
}
