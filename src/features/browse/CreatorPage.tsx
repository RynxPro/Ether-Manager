import { Check, ExternalLink, UserPlus } from "lucide-react";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { SignStrip } from "@/components/SignStrip";
import { useInstalledFromGameBanana } from "@/features/library/hooks";
import { useMatureContentVisibility } from "@/features/settings/hooks";
import { BROWSE_GRID } from "@/lib/layout";
import { shouldBlur } from "@/lib/mature";
import { useExternalLink } from "@/lib/useExternalLink";
import { refreshCreatorBookmark, type GbMod } from "@/lib/tauri-commands";
import { GameBananaModCard } from "./GameBananaModCard";
import {
  useAddBookmark,
  useAddCreatorBookmark,
  useBookmarks,
  useCreatorBookmarks,
  useCreatorProfile,
  useInfiniteCreatorMods,
  useRemoveBookmark,
  useRemoveCreatorBookmark,
} from "./hooks";

interface CreatorPageProps {
  creatorId: number;
  /** The name already known from the mod that led here. Shown as the heading until the profile
   * request answers, so the page opens with the creator's name rather than a blank bar — the
   * one fact we always have before the network does. */
  fallbackName: string;
  onSelectMod: (mod: GbMod) => void;
}

/** Same lead time as the browse feed: about a row and a half. Must stay under the height one
 * batch adds, or coming to rest at the bottom leaves the sentinel inside the margin and the
 * list fetches forever — see the note on `PREFETCH_MARGIN` in BrowseGrid. */
const PREFETCH_MARGIN = "400px";

function thumbnailUrlFor(mod: GbMod): string | null {
  const image = mod.preview_media.images[0];
  return image ? `${image.base_url}/${image.file}` : null;
}

/** A mod author, and everything of theirs that ZZZ players can install.
 *
 * Reached by clicking the avatar on a mod's page. The question it answers is the one that
 * follows liking a mod — "what else have they made?" — which previously meant leaving the app
 * for GameBanana and finding your own way back.
 *
 * Scoped to ZZZ throughout. GameBanana's `Generic_Submitter` filter stacks with the game
 * filter, so a creator who also makes mods for other games shows only the ones this app could
 * install; their profile counters, which do span every game, are labelled as such. */
export function CreatorPage({
  creatorId,
  fallbackName,
  onSelectMod,
}: CreatorPageProps) {
  const { data: creator, isLoading: isProfileLoading } = useCreatorProfile(creatorId);
  const {
    data,
    isLoading: areModsLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteCreatorMods(creatorId);
  const { data: bookmarks } = useBookmarks();
  const { data: followed } = useCreatorBookmarks();
  const addCreatorBookmark = useAddCreatorBookmark();
  const removeCreatorBookmark = useRemoveCreatorBookmark();
  const queryClient = useQueryClient();
  const { data: visibility } = useMatureContentVisibility();
  const installed = useInstalledFromGameBanana();
  const addBookmark = useAddBookmark();
  const removeBookmark = useRemoveBookmark();
  // Moved up from the panel that used to own it. `target="_blank"` does not navigate inside a
  // WebView2, so leaving GameBanana needs the opener plugin rather than an anchor.
  const externalLink = useExternalLink();

  const bookmarkedIds = new Set((bookmarks ?? []).map((bookmark) => bookmark.gamebanana_mod_id));

  const handleToggleBookmark = (mod: GbMod) => {
    if (bookmarkedIds.has(mod.id)) {
      removeBookmark.mutate(mod.id);
      return;
    }
    addBookmark.mutate({
      gamebananaModId: mod.id,
      name: mod.name,
      thumbnailUrl: thumbnailUrlFor(mod),
      // Most specific first, matching the browse grid: a skin's sub-category is the character's
      // own name, which is what resolves to a shelf.
      categoryName: mod.sub_category?.name ?? mod.root_category.name,
    });
  };

  const pages = data?.pages ?? [];
  const records = pages.flatMap((result) => result.records);
  const hiddenCount = pages.reduce((sum, result) => sum + result.hidden_count, 0);
  // GameBanana's own total for this creator in ZZZ. Not the same number as `submissions` in the
  // profile stats, which counts every game — showing them side by side without saying so would
  // read as a contradiction.
  const zzzCount = pages[0]?.record_count ?? records.length;

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) fetchNextPage();
      },
      { rootMargin: PREFETCH_MARGIN },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, records.length]);

  const name = creator?.name ?? fallbackName;

  const isFollowed = (followed ?? []).some(
    (entry) => entry.gamebanana_member_id === creatorId,
  );

  const stats = creator?.core_stats;
  // GameBanana sends "Bananite" for nearly every member — a rank, not a description. It earns a
  // line only when it says something, which an honorary title always does.
  const honorary = creator?.honorary_title || creator?.user_title || "";
  const joinYear =
    creator && creator.join_date > 0
      ? new Date(creator.join_date * 1000).getFullYear()
      : null;
  const hasMods = records.length > 0 || areModsLoading;
  /** The one count that is about this game. Written once because it is said twice: plainly in
   * the line under the header, and again on the sign, which is `aria-hidden` and moving. */
  const zzzLine = hasMods
    ? `${zzzCount} ${zzzCount === 1 ? "mod" : "mods"} for Zenless Zone Zero`
    : "No Zenless Zone Zero mods";

  const toggleFollow = () => {
    if (isFollowed) {
      removeCreatorBookmark.mutate(creatorId);
      return;
    }
    addCreatorBookmark.mutate({
      gamebananaMemberId: creatorId,
      name,
      avatarUrl: creator?.avatar_url ?? null,
      modCount: zzzCount,
    });
  };

  // Keeps a followed creator's cached name, avatar and count current without ever polling:
  // the bar's numbers are only ever as old as your last visit to that creator. Skipped
  // entirely for anyone not followed — there is no row to update, and visiting someone is
  // not a reason to start following them.
  useEffect(() => {
    if (!isFollowed || !creator || areModsLoading) return;
    refreshCreatorBookmark({
      gamebananaMemberId: creatorId,
      name: creator.name,
      avatarUrl: creator.avatar_url,
      modCount: zzzCount,
    })
      .then(() => queryClient.invalidateQueries({ queryKey: ["creatorBookmarks"] }))
      .catch(() => {
        // A stale count in the bar is not worth interrupting anyone over.
      });
  }, [isFollowed, creator, areModsLoading, creatorId, zzzCount, queryClient]);

  return (
    <div className="space-y-5">
      {externalLink.dialog}

      <PageHeader
        // The face goes in the slot a back button would have taken — and the back button is gone
        // rather than moved. The title bar carries back and forward, never scrolls, and this page
        // had its own arrow eight pixels below that one doing the identical thing; Character and
        // Mod both dropped theirs for exactly that reason.
        leading={
          <CreatorFace
            avatarUrl={creator?.avatar_url ?? null}
            name={name}
            isLoading={isProfileLoading}
          />
        }
        title={name}
        // The app's own word for what kind of page this is, never the creator's name — that is
        // somebody else's text, of arbitrary length, and the tag is set at 118px.
        tag="Creator"
        subtitle={honorary || "GameBanana"}
        // Unpinned, like every other page here: pinning forces `overflow-hidden`, and the wall
        // tag is deliberately taller than the band it sits in.
        pinned={false}
      >
        {creator && (
          // Filled accent while followed, paper while not — the same on/off language the
          // bookmark button on a mod card uses, so the two read as the same kind of switch.
          <button
            type="button"
            onClick={toggleFollow}
            className={`flex h-9 shrink-0 items-center gap-1.5 px-4 font-sign text-[17px] uppercase tracking-[0.1em] shadow-slap transition-[translate] duration-200 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-primary ${
              isFollowed
                ? "bg-primary text-primary-foreground"
                : "bg-card text-card-foreground"
            }`}
          >
            {isFollowed ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <UserPlus className="h-3.5 w-3.5" />
            )}
            {isFollowed ? "Following" : "Follow"}
          </button>
        )}

        {creator && (
          <button
            type="button"
            onClick={() => externalLink.requestOpen(creator.profile_url)}
            className="flex h-9 shrink-0 items-center gap-1.5 bg-card px-4 font-sign text-[17px] uppercase tracking-[0.1em] text-card-foreground shadow-slap transition-[translate] duration-200 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            GameBanana
          </button>
        )}
      </PageHeader>

      {/* The numbers, stated once somewhere they can actually be read. The sign below carries the
          same summary, but it scrolls and is `aria-hidden` by design, so it cannot be the only
          place a count exists.

          The two lines are separate because the scopes are: the first is this game, the second is
          the whole account. GameBanana keeps every counter across all games, and sitting them
          under a ZZZ mod count unlabelled would read as ZZZ figures. The old panel said this once
          over a four-cell row; the line says it at the front instead. */}
      <div className="space-y-1">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-foreground">
          {zzzLine}
          {joinYear !== null && (
            <span className="text-muted-foreground"> · joined {joinYear}</span>
          )}
        </p>
        {stats && (
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            All games · {stats.submissions.toLocaleString()} submissions ·{" "}
            {stats.thanks_received.toLocaleString()} thanks ·{" "}
            {stats.featured.toLocaleString()} featured ·{" "}
            {(creator?.subscriber_count ?? 0).toLocaleString()} subscribers
          </p>
        )}
      </div>

      {/* Same sign every other page carries. "On GameBanana · all games" sits immediately before
          the four account-wide counters so the qualifier comes round with them on every pass. */}
      <SignStrip
        items={[
          zzzLine,
          ...(joinYear !== null ? [`Joined ${joinYear}`] : []),
          ...(stats
            ? [
                "On GameBanana · all games",
                `${stats.submissions.toLocaleString()} submissions`,
                `${stats.thanks_received.toLocaleString()} thanks`,
                `${stats.featured.toLocaleString()} featured`,
                `${(creator?.subscriber_count ?? 0).toLocaleString()} subscribers`,
              ]
            : []),
        ]}
      />

      {/* A banned or private profile is not an empty one, and must not look like it. GameBanana
          still serves the mod list in both cases, so the list stays — this only explains why
          there is nothing above it.

          A stamp rather than coloured paper: `--destructive` is deliberately a dark red so it
          never competes with the accent, which makes it a poor text colour on card but a good
          fill. Filled marks are how this app says a fact about an object anyway — Installed,
          NSFW, Missing all work that way. */}
      {creator?.is_banned && (
        <div className="max-w-2xl -rotate-[0.3deg] bg-card px-5 py-4 shadow-slap-lift">
          {/* `text-white`, and deliberately not a token. Every other stamp uses `text-card`,
              which works because `--success` and `--card` swap lightness between the themes —
              dark text on bright green at night, light text on dark green by day. `--destructive`
              does not: it is a dark red in both themes on purpose, so it never competes with the
              accent. A fill that is dark in both themes takes a light foreground in both, which
              is a constant rather than something for a theme variable to answer. */}
          <span className="inline-block rotate-[1.5deg] bg-destructive px-2 py-px font-sign text-[15px] uppercase tracking-[0.09em] text-white shadow-slap">
            Banned
          </span>
          <p className="mt-3 font-mono text-[11px] font-bold uppercase leading-relaxed tracking-[0.06em] text-muted-foreground">
            This account is banned on GameBanana. Their mods may be removed at any time.
          </p>
        </div>
      )}
      {creator?.is_private && !creator.is_banned && (
        <div className="max-w-2xl rotate-[0.25deg] bg-card px-5 py-4 shadow-slap-lift">
          <p className="font-mono text-[11px] font-bold uppercase leading-relaxed tracking-[0.06em] text-muted-foreground">
            This profile is private, so there is little to show beyond their mods.
          </p>
        </div>
      )}

      {areModsLoading ? (
        <div className={BROWSE_GRID}>
          {Array.from({ length: 6 }).map((_, index) => (
            // Card-shaped, not a bare square: a placeholder that is not the shape of the thing
            // it stands in for makes the layout jump the moment the data arrives.
            <div
              key={index}
              className="animate-pulse bg-card p-[5px] pb-0 shadow-slap-lift"
            >
              <div className="aspect-[4/3] w-full bg-art" />
              <div className="px-1 pb-3 pt-2">
                <div className="h-[39px] bg-art" />
                <div className="mt-1.5 h-3 w-2/3 bg-art" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="max-w-2xl -rotate-[0.35deg] bg-card px-7 py-7 shadow-slap-lift">
          <p className="font-heading text-[22px] uppercase leading-none tracking-[0.005em] text-foreground">
            Could not load their mods
          </p>
          <p className="mt-3 font-mono text-[11px] font-bold uppercase leading-relaxed tracking-[0.06em] text-muted-foreground">
            {String(error)}
          </p>
        </div>
      ) : records.length === 0 ? (
        <div className="max-w-2xl rotate-[0.3deg] bg-card px-7 py-9 shadow-slap-lift">
          <p className="font-heading text-[24px] uppercase leading-none tracking-[0.005em] text-foreground">
            {hiddenCount > 0 ? "All hidden" : "Nothing for this game"}
          </p>
          <p className="mt-3 font-mono text-[11px] font-bold uppercase leading-relaxed tracking-[0.06em] text-muted-foreground">
            {hiddenCount > 0
              ? `Every one of ${name}’s Zenless Zone Zero mods is hidden by your mature-content setting.`
              : `${name} has no Zenless Zone Zero mods on GameBanana.`}
          </p>
        </div>
      ) : (
        <>
          <div className={BROWSE_GRID}>
            {records.map((mod) => (
              <GameBananaModCard
                key={mod.id}
                mod={mod}
                isBookmarked={bookmarkedIds.has(mod.id)}
                isBlurred={shouldBlur(visibility, mod.is_mature)}
                installedCount={installed.countByModId.get(mod.id) ?? 0}
                onSelect={() => onSelectMod(mod)}
                onToggleBookmark={() => handleToggleBookmark(mod)}
              />
            ))}
          </div>

          {hiddenCount > 0 && (
            <p className="pt-4 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              {hiddenCount} {hiddenCount === 1 ? "mod is" : "mods are"} hidden by your
              mature-content setting.
            </p>
          )}

          <div ref={sentinelRef} className="h-px" />

          {isFetchingNextPage && (
            <div className={BROWSE_GRID}>
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="animate-pulse bg-card p-[5px] pb-0 shadow-slap-lift"
                >
                  <div className="aspect-[4/3] w-full bg-art" />
                  <div className="px-1 pb-3 pt-2">
                    <div className="h-[39px] bg-art" />
                    <div className="mt-1.5 h-3 w-2/3 bg-art" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface CreatorFaceProps {
  avatarUrl: string | null;
  name: string;
  isLoading: boolean;
}

/** The creator's face, as a print stuck on the wall beside their name.
 *
 * The same object as everything else here: paper margin, hard shadow, a degree of tilt. It is
 * deliberately not a framed panel — the bordered box this replaced held the face, the name, the
 * buttons and a four-cell counter row inside one rectangle, which was the last thing in the app
 * grouping unrelated facts by drawing a line around them.
 *
 * `p-[5px]` on the image itself rather than a wrapper: the padding is what shows as the paper
 * margin, exactly as on a mod card, and one element cannot get out of step with itself. */
function CreatorFace({ avatarUrl, name, isLoading }: CreatorFaceProps) {
  const shell =
    "h-[88px] w-[88px] shrink-0 -rotate-[1.1deg] bg-card p-[5px] shadow-slap-lift";

  if (avatarUrl) {
    return <img src={avatarUrl} alt="" className={`${shell} object-cover`} />;
  }

  if (isLoading) {
    return <div className={`${shell} animate-pulse`} />;
  }

  // No avatar and not loading: the initial, in the display face. A blank square would read as a
  // picture that failed rather than as an account that never set one.
  return (
    <span
      className={`${shell} flex items-center justify-center font-heading text-[38px] uppercase leading-none text-muted-foreground`}
    >
      {(name || "?").charAt(0)}
    </span>
  );
}
