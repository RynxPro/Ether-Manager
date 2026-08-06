use crate::characters::{self, Character};

#[tauri::command]
pub fn list_characters() -> Vec<Character> {
    characters::all_characters().to_vec()
}
