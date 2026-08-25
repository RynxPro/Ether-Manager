use std::time::{SystemTime, UNIX_EPOCH};

use tauri::State;

use crate::creator_feed;
use crate::db::CreatorFeedItem;
use crate::AppState;

/// How many entries the dropdown asks for.
///
/// A bell is a glance, not an archive. Anything past the first couple of dozen is history, and
/// history belongs on the creator's own page — which every row links to.
const FEED_PAGE_SIZE: i64 = 30;

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock is before unix epoch")
        .as_secs() as i64
}

/// What the bell shows: the entries, and how many of them are unread.
///
/// One payload rather than two commands, because the badge and the list are a single glance and
/// fetching them separately would let the number disagree with the rows beneath it.
#[derive(Debug, serde::Serialize)]
pub struct CreatorFeed {
    pub items: Vec<CreatorFeedItem>,
    pub unseen: i64,
}

/// Reads the bell from the local table. No network at all — whatever the last check found.
#[tauri::command]
pub fn list_creator_feed(state: State<AppState>) -> Result<CreatorFeed, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    Ok(CreatorFeed {
        items: db
            .list_creator_feed(FEED_PAGE_SIZE)
            .map_err(|e| e.to_string())?,
        unseen: db.count_unseen_creator_feed().map_err(|e| e.to_string())?,
    })
}

/// Marks everything currently in the bell as read, which is what opening the dropdown means.
#[tauri::command]
pub fn mark_creator_feed_seen(state: State<AppState>) -> Result<CreatorFeed, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.mark_creator_feed_seen(now()).map_err(|e| e.to_string())?;
    Ok(CreatorFeed {
        items: db
            .list_creator_feed(FEED_PAGE_SIZE)
            .map_err(|e| e.to_string())?,
        unseen: db.count_unseen_creator_feed().map_err(|e| e.to_string())?,
    })
}

/// Asks GameBanana what is new from the creators the user follows, files anything not already
/// on the list, and answers with the bell's current contents.
///
/// Following nobody returns immediately without a request. That is the common case on a fresh
/// install, and there is nothing a fetch could tell us.
///
/// The lock is taken and dropped around each database step rather than held across the awaits
/// between them — `AppState::db` guards a `!Send` connection, so holding it over an `.await`
/// would not compile, and the code is written to respect that rather than fight it.
///
/// A failed page ends the walk with whatever earlier pages found rather than failing the whole
/// check. The bell is ambient: showing four of five new mods because the fifth page timed out is
/// strictly better than putting an error where a count should be, and the next launch picks up
/// the rest, since nothing has been marked read in the meantime.
#[tauri::command]
pub async fn check_creator_feed(state: State<'_, AppState>) -> Result<CreatorFeed, String> {
    let follows = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        creator_feed::follow_index(&db.list_creator_bookmarks().map_err(|e| e.to_string())?)
    };
    if follows.is_empty() {
        return list_creator_feed(state);
    }

    let checked_at = now();
    let cutoff = checked_at - creator_feed::LOOKBACK_SECS;
    let mut found = Vec::new();
    let mut page = 1u32;

    loop {
        let Ok(records) = state.gamebanana.get_newest_mods(page).await else {
            break;
        };
        found.extend(creator_feed::select_new_from_followed(&records, &follows));

        if !creator_feed::should_read_another_page(&records, page, cutoff) {
            break;
        }
        page += 1;
    }

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.record_creator_feed_items(&found, checked_at)
            .map_err(|e| e.to_string())?;
    }

    list_creator_feed(state)
}
