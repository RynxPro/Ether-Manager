//! Deciding what counts as news from a creator you follow.
//!
//! The fetching lives in `gamebanana::get_newest_mods` and the storing in
//! `db::creator_feed_repo`; what is here is the judgement between them, kept apart from both so
//! it can be tested without a network or a database.

use std::collections::HashMap;

use crate::db::{CreatorBookmark, NewCreatorFeedItem};
use crate::gamebanana::GbMod;

/// How many pages of the newest-mods feed one check will read.
///
/// One page reaches about five days back at ZZZ's current rate of roughly nine submissions a
/// day (measured 2026-08-25), so three covers a fortnight away from the app. The budget exists
/// because the feed is the whole game's arrivals, not just the people you follow: without it, a
/// first run against a long-dormant install would walk thousands of records to find a handful.
pub const PAGE_BUDGET: u32 = 3;

/// How far back a check will look, however many pages that takes within the budget.
///
/// Anything older is not news. It also bounds the very first check on an install that has been
/// following people for months: they get a fortnight of catch-up, not a year of it.
pub const LOOKBACK_SECS: i64 = 14 * 24 * 60 * 60;

/// The followed creators, as `select_new_from_followed` wants them: member id to the moment you
/// followed them.
pub fn follow_index(bookmarks: &[CreatorBookmark]) -> HashMap<i64, i64> {
    bookmarks
        .iter()
        .map(|b| (b.gamebanana_member_id, b.added_at))
        .collect()
}

/// Picks out the records worth notifying about: posted by someone on the list, and posted after
/// they were added to it.
///
/// That second condition is what stops following a prolific creator from immediately dumping
/// their back catalogue into the bell. You followed them knowing what they had already made;
/// the bell is for what comes next. It also means the watermark needs no column of its own —
/// `creator_bookmarks.added_at` already records exactly the right moment.
///
/// A record whose `date_added` is missing reads as epoch 0 (see `GbMod::date_added`) and is
/// therefore older than any follow date, so it is skipped. That is the safe direction: a missed
/// notification, not an invented one.
///
/// Deduplication against what has already been seen is the database's job, not this function's —
/// `record_creator_feed_items` ignores any mod id already on the list, which is a check this
/// cannot make without one.
pub fn select_new_from_followed(
    records: &[GbMod],
    follows: &HashMap<i64, i64>,
) -> Vec<NewCreatorFeedItem> {
    records
        .iter()
        .filter_map(|record| {
            let followed_at = follows.get(&record.submitter.id)?;
            if record.date_added <= *followed_at {
                return None;
            }
            Some(NewCreatorFeedItem {
                gamebanana_mod_id: record.id,
                gamebanana_member_id: record.submitter.id,
                creator_name: record.submitter.name.clone(),
                creator_avatar_url: record.submitter.avatar_url.clone(),
                mod_name: record.name.clone(),
                // The bell draws these at 76px. See `small_thumbnail_url`.
                thumbnail_url: record.preview_media.small_thumbnail_url(),
                is_mature: record.is_mature,
                date_added: record.date_added,
            })
        })
        .collect()
}

/// Whether the check should ask for another page.
///
/// Stops as soon as a page reaches past the lookback window, so the ordinary case — the app was
/// open yesterday — costs exactly one request. An empty page means the feed is exhausted and
/// there is nothing further back to read.
pub fn should_read_another_page(page_just_read: &[GbMod], pages_read: u32, cutoff: i64) -> bool {
    if pages_read >= PAGE_BUDGET || page_just_read.is_empty() {
        return false;
    }
    page_just_read
        .iter()
        .map(|record| record.date_added)
        .min()
        .is_some_and(|oldest| oldest > cutoff)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gamebanana::{GbCategoryRef, GbGameRef, GbPreviewMedia, GbSubmitter};

    const NOW: i64 = 1_787_000_000;
    const DAY: i64 = 24 * 60 * 60;

    fn record(id: i64, member_id: i64, date_added: i64) -> GbMod {
        GbMod {
            id,
            name: format!("Mod {id}"),
            profile_url: String::new(),
            date_added,
            date_modified: date_added,
            has_files: true,
            tags: Vec::new(),
            preview_media: GbPreviewMedia::default(),
            submitter: GbSubmitter {
                id: member_id,
                name: format!("member{member_id}"),
                profile_url: String::new(),
                avatar_url: None,
            },
            game: GbGameRef {
                id: 19567,
                name: "Zenless Zone Zero".to_string(),
            },
            root_category: GbCategoryRef {
                name: "Skins".to_string(),
                profile_url: String::new(),
            },
            sub_category: None,
            like_count: 0,
            view_count: 0,
            post_count: 0,
            download_count: None,
            has_content_ratings: false,
            initial_visibility: "show".to_string(),
            is_mature: false,
        }
    }

    fn follow(member_id: i64, added_at: i64) -> CreatorBookmark {
        CreatorBookmark {
            gamebanana_member_id: member_id,
            name: format!("member{member_id}"),
            avatar_url: None,
            mod_count: 0,
            added_at,
        }
    }

    #[test]
    fn keeps_only_mods_by_followed_creators() {
        let follows = follow_index(&[follow(10, NOW - 30 * DAY)]);
        let picked = select_new_from_followed(
            &[
                record(1, 10, NOW),
                record(2, 11, NOW),
                record(3, 10, NOW - DAY),
            ],
            &follows,
        );

        assert_eq!(
            picked
                .iter()
                .map(|i| i.gamebanana_mod_id)
                .collect::<Vec<_>>(),
            vec![1, 3]
        );
    }

    /// The point of using the follow date as the watermark: following someone must not fire off
    /// a notification for everything they ever made.
    #[test]
    fn ignores_work_posted_before_the_creator_was_followed() {
        let follows = follow_index(&[follow(10, NOW - DAY)]);
        let picked = select_new_from_followed(
            &[record(1, 10, NOW), record(2, 10, NOW - 10 * DAY)],
            &follows,
        );

        assert_eq!(picked.len(), 1);
        assert_eq!(picked[0].gamebanana_mod_id, 1);
    }

    /// Following someone the instant they post is a real race. Strictly-newer is the rule, so a
    /// tie counts as already known — the safe half of the boundary.
    #[test]
    fn a_mod_posted_exactly_when_followed_is_not_news() {
        let follows = follow_index(&[follow(10, NOW)]);
        assert!(select_new_from_followed(&[record(1, 10, NOW)], &follows).is_empty());
    }

    #[test]
    fn a_record_with_no_submission_date_is_skipped() {
        let follows = follow_index(&[follow(10, NOW - 30 * DAY)]);
        assert!(select_new_from_followed(&[record(1, 10, 0)], &follows).is_empty());
    }

    #[test]
    fn following_nobody_selects_nothing() {
        let follows = follow_index(&[]);
        assert!(select_new_from_followed(&[record(1, 10, NOW)], &follows).is_empty());
    }

    #[test]
    fn carries_the_fields_the_dropdown_renders() {
        let follows = follow_index(&[follow(10, NOW - 30 * DAY)]);
        let mut source = record(1, 10, NOW);
        source.name = "Example Skin".to_string();
        source.submitter.name = "examplemodder".to_string();
        source.submitter.avatar_url = Some("https://images.example/av/a.png".to_string());
        source.is_mature = true;

        let picked = select_new_from_followed(&[source], &follows);
        assert_eq!(picked[0].mod_name, "Example Skin");
        assert_eq!(picked[0].creator_name, "examplemodder");
        assert_eq!(
            picked[0].creator_avatar_url.as_deref(),
            Some("https://images.example/av/a.png")
        );
        assert!(picked[0].is_mature);
        assert_eq!(picked[0].date_added, NOW);
    }

    #[test]
    fn stops_reading_once_a_page_reaches_past_the_window() {
        let cutoff = NOW - LOOKBACK_SECS;
        let page = vec![record(1, 10, NOW), record(2, 10, cutoff - 1)];

        assert!(!should_read_another_page(&page, 1, cutoff));
    }

    #[test]
    fn keeps_reading_while_a_page_is_still_inside_the_window() {
        let cutoff = NOW - LOOKBACK_SECS;
        let page = vec![record(1, 10, NOW), record(2, 10, NOW - DAY)];

        assert!(should_read_another_page(&page, 1, cutoff));
    }

    #[test]
    fn never_reads_past_the_page_budget() {
        let cutoff = NOW - LOOKBACK_SECS;
        let page = vec![record(1, 10, NOW)];

        assert!(!should_read_another_page(&page, PAGE_BUDGET, cutoff));
    }

    #[test]
    fn an_empty_page_ends_the_walk() {
        assert!(!should_read_another_page(&[], 1, NOW - LOOKBACK_SECS));
    }
}
