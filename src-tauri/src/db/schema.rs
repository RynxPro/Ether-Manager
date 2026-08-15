pub const SCHEMA_SQL: &str = "
CREATE TABLE IF NOT EXISTS mods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id TEXT NOT NULL,
    slot TEXT NOT NULL,
    display_name TEXT NOT NULL,
    folder_path TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0,
    thumbnail_url TEXT,
    gamebanana_mod_id INTEGER,
    gamebanana_file_id INTEGER,
    gamebanana_md5 TEXT,
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
    created_at INTEGER NOT NULL,
    finished_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_downloads_created ON downloads(created_at DESC);

CREATE TABLE IF NOT EXISTS mod_update_checks (
    mod_id INTEGER PRIMARY KEY,
    status TEXT NOT NULL,
    reason TEXT,
    suggested_file_id INTEGER,
    suggested_file_name TEXT,
    is_ambiguous INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    checked_at INTEGER NOT NULL
);
";
