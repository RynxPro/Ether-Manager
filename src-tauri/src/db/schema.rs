pub const SCHEMA_SQL: &str = "
CREATE TABLE IF NOT EXISTS mods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id TEXT NOT NULL,
    slot TEXT NOT NULL,
    display_name TEXT NOT NULL,
    folder_path TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0,
    thumbnail_path TEXT,
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
";
