import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addMod,
  deleteMod,
  getModsFolder,
  listCharacters,
  listModCounts,
  listModsForCharacter,
  pickModsFolder,
  setModsFolder,
  toggleMod,
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
