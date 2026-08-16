import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addMod,
  checkAllModUpdates,
  checkModUpdate,
  deleteMod,
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
