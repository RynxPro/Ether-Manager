import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  beginImport,
  cancelImport,
  checkAllModUpdates,
  checkModUpdate,
  commitImport,
  deleteMod,
  enqueueDownload,
  getModsFolder,
  listAllMods,
  listCharacters,
  listModCounts,
  listModsForCharacter,
  listUpdateChecks,
  moveMod,
  pickModsFolder,
  readImportPreview,
  renameMod,
  setModsFolder,
  toggleMod,
  updateInstalledMod,
  type EnqueueDownloadInput,
  type ImportSelection,
  type Mod,
  setModThumbnail,
  pickModThumbnail,
  clearModThumbnail,
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

export function useToggleMod() {
  const invalidate = useModMutationInvalidation();
  return useMutation({
    mutationFn: ({ modId, enabled }: { modId: number; enabled: boolean }) =>
      toggleMod(modId, enabled),
    onSuccess: invalidate,
  });
}

/** Renames a mod. Same invalidation as any other mod mutation — the name shows on the card, in
 * search, in "Wearing X" on a character page and under the character in the Library grid, so
 * every one of those caches has to hear about it. */
export function useRenameMod() {
  const invalidate = useModMutationInvalidation();
  return useMutation({
    mutationFn: ({
      modId,
      displayName,
    }: {
      modId: number;
      displayName: string;
    }) => renameMod(modId, displayName),
    onSuccess: invalidate,
  });
}

/** Sets a mod's card picture from image bytes — a paste, usually. */
export function useSetModThumbnail() {
  const invalidate = useModMutationInvalidation();
  return useMutation({
    mutationFn: ({ modId, bytes }: { modId: number; bytes: Uint8Array }) =>
      setModThumbnail(modId, bytes),
    onSuccess: invalidate,
  });
}

/** Picks an image off disk and hands back its bytes. Nothing is invalidated because nothing is
 * written — the dialog stages the result and saves it with everything else. */
export function usePickModThumbnail() {
  return useMutation({
    mutationFn: () => pickModThumbnail(),
  });
}

/** Drops a picture set here, leaving the card on whatever it had before. */
export function useClearModThumbnail() {
  const invalidate = useModMutationInvalidation();
  return useMutation({
    mutationFn: (modId: number) => clearModThumbnail(modId),
    onSuccess: invalidate,
  });
}

/** Moves a mod to another character or bucket. Invalidates the same caches a rename does, plus
 * it changes which character's page the mod appears on — so both the page it left and the one it
 * arrived at have to refetch, which the `["mods"]` prefix covers. */
export function useMoveMod() {
  const invalidate = useModMutationInvalidation();
  return useMutation({
    mutationFn: ({
      modId,
      characterId,
    }: {
      modId: number;
      characterId: string;
    }) => moveMod(modId, characterId),
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

/** Unpacks something the user brought in from outside the app and reports what is inside.
 *
 * Deliberately does not invalidate anything: this writes only to a staging directory, and the
 * library has not changed until the import is committed. Treating "I looked at a zip" as a
 * library mutation would refetch every mod list for nothing. */
export function useBeginImport() {
  return useMutation({
    mutationFn: (path: string) => beginImport(path),
  });
}

/** Installs the chosen mods. The first point in the flow at which anything is filed, so the
 * first at which the caches are stale — a pack can add several mods across the library at once,
 * which is exactly what the shared invalidation covers. */
export function useCommitImport() {
  const invalidate = useModMutationInvalidation();
  return useMutation({
    mutationFn: ({
      sessionId,
      selections,
    }: {
      sessionId: number;
      selections: ImportSelection[];
    }) => commitImport(sessionId, selections),
    onSuccess: invalidate,
  });
}

/** Throws away an unfinished import. Nothing was filed, so nothing needs refetching. */
export function useCancelImport() {
  return useMutation({
    mutationFn: (sessionId: number) => cancelImport(sessionId),
  });
}

/** A candidate's preview picture, as a `data:` URL.
 *
 * `staleTime: Infinity` because a staging directory does not change under us — the bytes are
 * fixed for the life of the session, and a pack of six would otherwise refetch six base64 blobs
 * on every render that remounts the sheet. `retry: false` because the honest failure here is
 * "there is no readable image", which does not get better by asking again. */
export function useImportPreview(sessionId: number, relPath: string | null) {
  return useQuery({
    queryKey: ["importPreview", sessionId, relPath],
    queryFn: () => readImportPreview(sessionId, relPath as string),
    enabled: relPath !== null,
    staleTime: Infinity,
    retry: false,
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
      countByModId.set(
        mod.gamebanana_mod_id,
        (countByModId.get(mod.gamebanana_mod_id) ?? 0) + 1,
      );
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
        timer.current = setTimeout(
          () => setConfirmedModId(null),
          CONFIRM_VISIBLE_MS,
        );
      },
    });
  }

  return { checkUpdate, confirmedModId, runCheck };
}

export function useUpdateInstalledMod(characterId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      modId,
      gamebananaFileId,
    }: {
      modId: number;
      gamebananaFileId: number;
    }) => updateInstalledMod(modId, gamebananaFileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mods", characterId] });
      queryClient.invalidateQueries({ queryKey: ["updateChecks"] });
      queryClient.invalidateQueries({ queryKey: ["modCounts"] });
    },
  });
}
