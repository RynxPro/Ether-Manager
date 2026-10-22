import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import {
  checkAppUpdate,
  getUpdateChannel,
  installAppUpdate,
  setUpdateChannel,
  type AppUpdateInfo,
  type InstallProgress,
  type UpdateChannel,
} from "@/lib/tauri-commands";

/** The running app's own version, the one compiled in from `tauri.conf.json`.
 *
 * Held in the query cache rather than read per component because it cannot change while the
 * process is alive — `staleTime: Infinity` makes every caller after the first free, and the two
 * places that show it stay in step by construction rather than by both remembering to ask the
 * same way. */
export function useAppVersion() {
  return useQuery({
    queryKey: ["appVersion"],
    queryFn: getVersion,
    staleTime: Infinity,
  });
}

/** Which releases this install is willing to be offered. */
export function useUpdateChannel() {
  return useQuery({ queryKey: ["updateChannel"], queryFn: getUpdateChannel });
}

/** Switches channel, then immediately asks the new one what it has.
 *
 * The re-check is the point of the switch: picking Nightly and being told nothing until some
 * later poll would read as the setting having done nothing at all. */
export function useSetUpdateChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (channel: UpdateChannel) => setUpdateChannel(channel),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["updateChannel"] });
      queryClient.invalidateQueries({ queryKey: ["appUpdate"] });
    },
  });
}

/** Whether the chosen channel is offering something other than what is running.
 *
 * Resolves to the release when there is one and to `null` when there is not.
 *
 * Asked once per run. A poll would be answering a question that cannot usefully change
 * mid-session: applying anything found here exits the app, so a second answer arriving an hour
 * in has nowhere to go. Settings can ask again by hand, and switching channel asks for you.
 *
 * `retry: false` because the expected failure is a verdict rather than a flake — on Nightly
 * before any nightly build exists the endpoint is a 404 every time, and three tries with
 * backoff would turn a known answer into four requests and several seconds of "checking". */
export function useAppUpdate() {
  return useQuery<AppUpdateInfo | null>({
    queryKey: ["appUpdate"],
    queryFn: checkAppUpdate,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

interface UseInstallAppUpdateResult {
  install: () => void;
  isInstalling: boolean;
  error: Error | null;
  /** Shaped as the mod installer's progress so `InstallProgressBar` can draw it unchanged.
   * Null until the first chunk arrives. */
  progress: InstallProgress | null;
  percent: number | null;
}

/** Downloads and installs whatever the channel is offering.
 *
 * Takes no argument: Rust asks the channel again on the way in, so there is no handle to pass
 * and no way for this to install something other than what the card is describing.
 *
 * On Windows the call does not return — the NSIS installer closes the app and relaunches it. So
 * there is no success state to render and no need for `@tauri-apps/plugin-process`;
 * `isInstalling` simply stays true until the process is gone, which is the right thing to be
 * showing while it happens. */
export function useInstallAppUpdate(): UseInstallAppUpdateResult {
  const [progress, setProgress] = useState<InstallProgress | null>(null);

  // Progress arrives as an event now that the download runs in Rust, rather than as a callback
  // from the JavaScript plugin. Listening always, rather than only while installing: the
  // listener takes a moment to register, and the first chunks would otherwise be missed.
  useEffect(() => {
    const pending = listen<InstallProgress>("app-update-progress", (event) => {
      setProgress(event.payload);
    });
    return () => {
      pending.then((unlisten) => unlisten());
    };
  }, []);

  const mutation = useMutation({
    mutationFn: () => {
      setProgress(null);
      return installAppUpdate();
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
