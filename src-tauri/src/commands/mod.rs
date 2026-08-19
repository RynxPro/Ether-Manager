pub mod characters;
pub mod downloads;
pub mod gamebanana;
pub mod import;
pub mod mods;
pub mod settings;
pub mod updates;

use std::sync::atomic::{AtomicU64, Ordering};

static UNIQUE_TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

/// A value unique within this process's lifetime, for building temp file/dir names that must
/// not collide even when the same GameBanana file id is being downloaded more than once at
/// once (e.g. two tests fetching the same fixture concurrently, or an install and an update
/// racing against the same underlying file) — `gamebanana_file_id` alone is not enough, since
/// it's identical across such calls.
pub(crate) fn unique_temp_id() -> u64 {
    UNIQUE_TEMP_COUNTER.fetch_add(1, Ordering::Relaxed)
}
