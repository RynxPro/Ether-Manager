import { convertFileSrc } from "@tauri-apps/api/core";
import type { Mod } from "./tauri-commands";

/** The picture to show for an installed mod, or null when it has none.
 *
 * Two sources, because mods arrive two ways. A GameBanana install has `thumbnail_url` and a
 * server to fetch it from. A mod brought in from a Patreon post or a Discord attachment has no
 * listing behind it at all — its art is a file the author shipped inside the archive, which the
 * importer copied into the mod's own folder and recorded as `bundled_thumbnail`.
 *
 * The bundled one wins where both somehow exist: it is the picture that came with these exact
 * files, where a remote URL describes the listing they were taken from.
 *
 * `bundled_thumbnail` is stored relative to `folder_path` so that refiling a mod cannot leave it
 * pointing at the old location — which is why the join happens here rather than being baked into
 * the column. `convertFileSrc` turns the absolute path into an `asset:` URL the webview will
 * load; the mods folder is added to the asset protocol's scope at startup and whenever it
 * changes, in `commands::settings::allow_mods_folder_assets`. */
export function modArtSrc(mod: Mod): string | null {
  if (mod.bundled_thumbnail) {
    // Forward slashes throughout: Windows accepts them, and the stored half already uses them.
    return convertFileSrc(`${mod.folder_path.replace(/\\/g, "/")}/${mod.bundled_thumbnail}`);
  }
  return mod.thumbnail_url;
}
