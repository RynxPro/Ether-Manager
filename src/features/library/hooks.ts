import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addMod,
  checkAllModUpdates,
  deleteMod,
  getModsFolder,
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

export function useAddMod(characterId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddModInput) => addMod(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mods", characterId] });
    },
  });
}

export function useToggleMod(characterId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ modId, enabled }: { modId: number; enabled: boolean }) =>
      toggleMod(modId, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mods", characterId] });
    },
  });
}

export function useDeleteMod(characterId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (modId: number) => deleteMod(modId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mods", characterId] });
    },
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
