import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  applyPreset,
  createPreset,
  deletePreset,
  listPresets,
  presetModIds,
  renamePreset,
  savePresetFromCurrent,
  setPresetMods,
  type Preset,
  type PresetApplyReport,
} from "@/lib/tauri-commands";

const PRESETS_KEY = ["presets"] as const;

/** The query key for one preset's membership. Separate from the list, because the list is read
 * constantly and a membership only while an editor is open. */
const membersKey = (presetId: number) => ["presets", presetId, "mods"] as const;

export function usePresets() {
  return useQuery({ queryKey: PRESETS_KEY, queryFn: listPresets });
}

/** Which mods a preset asks for. Only fetched while something is asking. */
export function usePresetModIds(presetId: number | null) {
  return useQuery({
    queryKey: membersKey(presetId ?? -1),
    queryFn: () => presetModIds(presetId as number),
    enabled: presetId !== null,
  });
}

/** Every write answers with the whole list, so the cache is set from the result rather than
 * invalidated — the same bargain the creator feed makes, and it keeps the list from flickering
 * through a loading state after an action the user just took. */
function useListWrite<TArgs>(mutationFn: (args: TArgs) => Promise<Preset[]>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (presets: Preset[]) => queryClient.setQueryData(PRESETS_KEY, presets),
  });
}

/** A preset with nothing in it, for curating a set you do not currently wear. */
export function useCreatePreset() {
  return useListWrite((name: string) => createPreset(name, []));
}

export function useSavePresetFromCurrent() {
  return useListWrite((name: string) => savePresetFromCurrent(name));
}

export function useRenamePreset() {
  return useListWrite(({ presetId, name }: { presetId: number; name: string }) =>
    renamePreset(presetId, name),
  );
}

export function useDeletePreset() {
  return useListWrite((presetId: number) => deletePreset(presetId));
}

export function useSetPresetMods() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ presetId, modIds }: { presetId: number; modIds: number[] }) =>
      setPresetMods(presetId, modIds),
    onSuccess: (presets: Preset[], { presetId }) => {
      queryClient.setQueryData(PRESETS_KEY, presets);
      // The membership this just rewrote, so an editor reopened straight away does not show
      // the set it had before.
      void queryClient.invalidateQueries({ queryKey: membersKey(presetId) });
    },
  });
}

/** Applies a preset, then re-reads every surface that shows whether a mod is on.
 *
 * Invalidated rather than patched, and widely: applying renames folders across the entire
 * library, so the character pages, All Mods and the per-character counts are all describing a
 * world that no longer exists. There is no partial update that is honest here — and the report
 * may say some renames did not happen, which makes guessing at the new state actively wrong. */
export function useApplyPreset() {
  const queryClient = useQueryClient();
  return useMutation<PresetApplyReport, Error, number>({
    mutationFn: (presetId: number) => applyPreset(presetId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mods"] });
      void queryClient.invalidateQueries({ queryKey: ["allMods"] });
      void queryClient.invalidateQueries({ queryKey: ["modCounts"] });
    },
  });
}
