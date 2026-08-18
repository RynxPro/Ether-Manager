import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  addMod,
  checkAllModUpdates,
  checkModUpdate,
  deleteMod,
  enqueueDownload,
  getModsFolder,
  listAllMods,
  listCharacters,
  listModCounts,
  listModsForCharacter,
  listUpdateChecks,
  pickModsFolder,
  setModsFolder,
  toggleMod,
  updateInstalledMod,
  type AddModInput,
  type EnqueueDownloadInput,
  type Mod,
} from "@/lib/tauri-commands";

export function useCharacters() {
  return useQuery({
    queryKey: ["characters"],
    queryFn: listCharacters,
  });
}

export function useModCounts() {
  return useQuery({
    queryKey: ["modCounts"],
    queryFn: listModCounts,
  });
}

export function useModsForCharacter(characterId: string | null) {
  return useQuery({
    queryKey: ["mods", characterId],
    queryFn: () => listModsForCharacter(characterId as string),
    enabled: characterId !== null,
  });
}

/** Every installed mod, for Library's search. */
export function useAllMods() {
  return useQuery({
    queryKey: ["allMods"],
    queryFn: listAllMods,
  });
}

/** Adding, toggling or deleting a mod changes three cached things at once: the character's own
 * mod list, the flat all-mods list behind search, and the per-character counts the Library grid
 * renders. Invalidating `["mods"]` as a prefix covers every character's list — which matters
 * because search results span characters, so the mutation can't know which single list to
 * refresh. Only mounted queries actually refetch. */
function useModMutationInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["mods"] });
    queryClient.invalidateQueries({ queryKey: ["allMods"] });
    queryClient.invalidateQueries({ queryKey: ["modCounts"] });
  };
}

export function useAddMod() {
  const invalidate = useModMutationInvalidation();
  return useMutation({
    mutationFn: (input: AddModInput) => addMod(input),
    onSuccess: invalidate,
  });
}

export function useToggleMod() {
  const invalidate = useModMutationInvalidation();
  return useMutation({
    mutationFn: ({ modId, enabled }: { modId: number; enabled: boolean }) =>
      toggleMod(modId, enabled),
    onSuccess: invalidate,
  });
}

export function useDeleteMod() {
  const invalidate = useModMutationInvalidation();
  return useMutation({
    mutationFn: (modId: number) => deleteMod(modId),
    onSuccess: invalidate,
  });
}

export function useModsFolder() {
  return useQuery({
    queryKey: ["modsFolder"],
    queryFn: getModsFolder,
  });
}

export function useSetModsFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => setModsFolder(path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["modsFolder"] });
    },
  });
}

export function usePickModsFolder() {
  return useMutation({
    mutationFn: () => pickModsFolder(),
  });
}

/** Cache read only — never triggers a network check itself. Data only ever changes via
 * `useCheckAllUpdates`'s own invalidation, so there's nothing to gain from refetching this on
 * every mount (e.g. navigating between characters). */
export function useUpdateChecks() {
  return useQuery({
    queryKey: ["updateChecks"],
    queryFn: listUpdateChecks,
    staleTime: Infinity,
  });
}

export function useCheckAllUpdates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (force: boolean) => checkAllModUpdates(force),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["updateChecks"] });
    },
  });
}

/** Re-checks one mod on demand, for the button on its card. Library's "Check for updates"
 * sweeps the whole library; this is for when you only care about the mod in front of you. Both
 * write to the same cache, so either one refreshes every badge on screen. */
export function useCheckModUpdate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (modId: number) => checkModUpdate(modId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["updateChecks"] });
    },
  });
}

export interface InstalledFromGameBanana {
  /** How many library entries came from each GameBanana mod id. A count rather than a flag
   * because one mod page can legitimately be installed several times — different files, or the
   * same file filed under two characters — and "installed ×2" is the honest thing to say. */
  countByModId: Map<number, number>;
  /** The library rows holding each GameBanana *file* id. The mod-level count answers "do I have
   * this at all"; a page listing six downloads needs to say which one — and reinstalling needs
   * the row itself, since replacing in place is addressed by mod id, not by file id.
   *
   * A list rather than a single row because the same file can legitimately be installed twice,
   * filed under two different characters. Reinstall has no way to choose between them, so it is
   * offered only when there is exactly one. */
  byFileId: Map<number, Mod[]>;
}

/** What Browse needs in order to stop showing you things you already own as though they were
 * new. Reads the same `allMods` cache the library pages use, so installing something updates
 * Browse without a second source of truth to keep in step. */
export function useInstalledFromGameBanana(): InstalledFromGameBanana {
  const { data: mods } = useAllMods();

  const countByModId = new Map<number, number>();
  const byFileId = new Map<number, Mod[]>();
  for (const mod of mods ?? []) {
    if (mod.gamebanana_mod_id !== null) {
      countByModId.set(mod.gamebanana_mod_id, (countByModId.get(mod.gamebanana_mod_id) ?? 0) + 1);
    }
    if (mod.gamebanana_file_id !== null) {
      const rows = byFileId.get(mod.gamebanana_file_id);
      if (rows) rows.push(mod);
      else byFileId.set(mod.gamebanana_file_id, [mod]);
    }
  }
  return { countByModId, byFileId };
}

/** Queues a reinstall: the same download queue a first install uses, with `targetModId` set so
 * the worker replaces that mod's files where they stand instead of adding a second copy.
 *
 * Going through the queue rather than calling `update_installed_mod` directly is the whole
 * point. It puts the reinstall on the Downloads page, where you would look for it; it survives
 * navigating away, or closing the app; and it can be paused, resumed and cancelled like anything
 * else. The direct command has none of that — its progress exists only while the component that
 * started it stays mounted.
 *
 * Resolves once the row exists, not once the mod is replaced. The outcome is the download's. */
export function useReinstallMod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: EnqueueDownloadInput) => enqueueDownload(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["downloads"] });
    },
  });
}

/** Long enough to notice without watching for it, short enough that it never reads as a
 * permanent badge — it answers a click, it does not describe the mod. */
const CONFIRM_VISIBLE_MS = 2500;

/** `useCheckModUpdate` plus the answer to "did that do anything?".
 *
 * A check that finds an update rewrites the card, which is its own reply. A check that finds
 * nothing — the usual outcome — leaves the card identical to before the button was pressed, so
 * the only sign anything happened is a spinner that stops. `confirmedModId` names the card that
 * should say so, briefly. Shared by every grid of mod cards so the two do not drift.
 *
 * Transient on purpose: this reports a click, not a property of the mod. The lasting version of
 * the same fact is `checked_at` on the cached `UpdateCheck`. */
export function useCheckModUpdateWithConfirmation() {
  const checkUpdate = useCheckModUpdate();
  const [confirmedModId, setConfirmedModId] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => clearTimeout(timer.current ?? undefined), []);

  function runCheck(modId: number) {
    checkUpdate.mutate(modId, {
      onSuccess: (check) => {
        // Anything other than "nothing to do" already shows on the card, and an unavailable mod
        // is not something to congratulate.
        if (check.status !== "UpToDate") return;
        clearTimeout(timer.current ?? undefined);
        setConfirmedModId(modId);
        timer.current = setTimeout(() => setConfirmedModId(null), CONFIRM_VISIBLE_MS);
      },
    });
  }

  return { checkUpdate, confirmedModId, runCheck };
}

export function useUpdateInstalledMod(characterId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ modId, gamebananaFileId }: { modId: number; gamebananaFileId: number }) =>
      updateInstalledMod(modId, gamebananaFileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mods", characterId] });
      queryClient.invalidateQueries({ queryKey: ["updateChecks"] });
      queryClient.invalidateQueries({ queryKey: ["modCounts"] });
    },
  });
}
