use crate::characters::{self, Character};

/// Real 60-character roster plus the two library-wide pseudo-categories ("UI"/"Misc") appended
/// at the end — every current frontend consumer (Library grid, Browse's character filter, the
/// install flow's character picker) wants the combined list, so this is the one command rather
/// than keeping a separate "real characters only" endpoint no one would call.
#[tauri::command]
pub fn list_characters() -> Vec<Character> {
    let mut all = characters::all_characters().to_vec();
    all.extend(characters::pseudo_categories());
    all
}
