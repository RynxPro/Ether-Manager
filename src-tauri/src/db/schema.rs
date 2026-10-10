pub const SCHEMA_SQL: &str = "
CREATE TABLE IF NOT EXISTS mods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id TEXT NOT NULL,
    slot TEXT NOT NULL,
    display_name TEXT NOT NULL,
    -- Canonical: never carries the DISABLED_ prefix, even while the folder on disk does.
    -- Whether a mod is enabled is deliberately not a column, because it is not this app's fact
    -- to keep -- it is which spelling of this folder exists, which is what 3DMigoto reads and
    -- what XXMI rewrites on every game launch. See fs_ops::Presence.
    folder_path TEXT NOT NULL,
    thumbnail_url TEXT,
    gamebanana_mod_id INTEGER,
    gamebanana_file_id INTEGER,
    gamebanana_md5 TEXT,
    variant_label TEXT,
    bundled_thumbnail TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mods_character_slot ON mods(character_id, slot);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookmarks (
    gamebanana_mod_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    thumbnail_url TEXT,
    character_id TEXT,
    added_at INTEGER NOT NULL
);

-- Mod authors the user follows, shown as a bar across the top of the Bookmarks page. Its own
-- table rather than a kind column on bookmarks: the two share only the act of saving, and every
-- other column differs. name/avatar_url are copies so the bar renders without a network round
-- trip per creator; mod_count is their ZZZ total as of the last visit to their page, kept for
-- the same reason (see creator_bookmarks_repo).
CREATE TABLE IF NOT EXISTS creator_bookmarks (
    gamebanana_member_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    avatar_url TEXT,
    mod_count INTEGER NOT NULL,
    added_at INTEGER NOT NULL
);

-- One row per install the user has asked for, kept after it finishes so the Downloads page has
-- a history. Everything needed to run the install again lives here (mod id, file id, target
-- character, slot, display name), which is what makes Retry possible without going back to the
-- mod page. `mod_name`/`file_name`/`thumbnail_url` are copies rather than lookups: a download
-- has to stay readable in the list even if the mod is later withdrawn from GameBanana.
-- `downloaded_bytes` and `etag` are what make pause and resume possible: together they say how
-- far the staged file got and which version of the remote file those bytes came from, so a later
-- attempt can ask for the rest with `Range` and `If-Range` instead of starting again.
CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gamebanana_mod_id INTEGER NOT NULL,
    gamebanana_file_id INTEGER NOT NULL,
    mod_name TEXT NOT NULL,
    file_name TEXT NOT NULL,
    thumbnail_url TEXT,
    character_id TEXT NOT NULL,
    slot TEXT NOT NULL,
    display_name TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    total_bytes INTEGER,
    downloaded_bytes INTEGER NOT NULL DEFAULT 0,
    etag TEXT,
    target_mod_id INTEGER,
    created_at INTEGER NOT NULL,
    finished_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_downloads_created ON downloads(created_at DESC);

-- What the notification bell has found: one row per mod a followed creator posted after you
-- started following them. Rows rather than a diff recomputed on demand, so the badge survives a
-- restart without another GameBanana request, and so an entry stays readable after the mod has
-- scrolled off the roughly five-day window one feed request can see.
--
-- creator_name/mod_name/thumbnail_url are copies for the same reason they are on `downloads`:
-- the dropdown has to render without a network round trip per row, and an entry must stay
-- legible even if the mod is later withdrawn. `seen_at` NULL is the unread state and is what the
-- badge counts; it is set for every row at once when the dropdown is opened, because that is
-- what opening a bell means everywhere else. `is_mature` rides along so the list can honour the
-- Hide preference without re-fetching each mod.
CREATE TABLE IF NOT EXISTS creator_feed (
    gamebanana_mod_id INTEGER PRIMARY KEY,
    gamebanana_member_id INTEGER NOT NULL,
    creator_name TEXT NOT NULL,
    creator_avatar_url TEXT,
    mod_name TEXT NOT NULL,
    thumbnail_url TEXT,
    is_mature INTEGER NOT NULL DEFAULT 0,
    date_added INTEGER NOT NULL,
    discovered_at INTEGER NOT NULL,
    seen_at INTEGER,
    -- Set when the list is cleared from the panel. A tombstone rather than a delete, because
    -- `record_creator_feed_items` is an INSERT OR IGNORE keyed on the mod id: a deleted row
    -- would be filed again by the very next GameBanana check and the cleared item would come
    -- straight back. Dismissed rows stay until the retention sweep drops them by age.
    dismissed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_creator_feed_date ON creator_feed(date_added DESC);

-- `is_obsolete` and `is_withdrawn` sit alongside `status` rather than inside it, because they
-- are independent of it: a mod can perfectly well have an update waiting *and* have been retired
-- by its author, and one slot could only report whichever was checked last. Both default to 0,
-- so every row written before these columns existed reads as a mod in good standing — which is
-- the safe direction, and true of nearly every mod either way.
CREATE TABLE IF NOT EXISTS mod_update_checks (
    mod_id INTEGER PRIMARY KEY,
    status TEXT NOT NULL,
    reason TEXT,
    suggested_file_id INTEGER,
    suggested_file_name TEXT,
    is_ambiguous INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    checked_at INTEGER NOT NULL,
    is_obsolete INTEGER NOT NULL DEFAULT 0,
    is_withdrawn INTEGER NOT NULL DEFAULT 0,
    withdrawal_notice TEXT
);
-- A named loadout: the set of mods that should be on when it is applied.
--
-- Stores only what should be ON. Applying is a reconciliation against the whole library, not a
-- list of things to switch on, so the preset describes a complete state rather than a diff --
-- the same preset applied from any starting point lands in the same place, and two mods can
-- never end up fighting over one character because one of them was left on from before.
--
-- Whether a mod is currently enabled is deliberately not stored anywhere: it is which spelling
-- of the folder exists on disk. See fs_ops::Presence. A preset is a wish, the disk is the fact.
CREATE TABLE IF NOT EXISTS presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Which mods a preset wants on. No REFERENCES clause, because nothing else in this database has
-- one and `PRAGMA foreign_keys` is off -- a constraint that is never enforced is worse than no
-- constraint, since it reads as a guarantee. Deletion is handled where mods are deleted, and
-- every read joins `mods`, so a row orphaned by any other path simply stops being listed.
CREATE TABLE IF NOT EXISTS preset_mods (
    preset_id INTEGER NOT NULL,
    mod_id INTEGER NOT NULL,
    PRIMARY KEY (preset_id, mod_id)
);

CREATE INDEX IF NOT EXISTS idx_preset_mods_mod ON preset_mods(mod_id);
";
