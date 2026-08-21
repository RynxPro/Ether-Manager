import { ArrowLeft, Check, ExternalLink, UserPlus } from "lucide-react";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useInstalledFromGameBanana } from "@/features/library/hooks";
import { useMatureContentVisibility } from "@/features/settings/hooks";
import { CARD_GRID } from "@/lib/layout";
import { shouldBlur } from "@/lib/mature";
import { refreshCreatorBookmark, type GbCreator, type GbMod } from "@/lib/tauri-commands";
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
  onBack: () => void;
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
  onBack,
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
    <div className="space-y-6">
      <div className="-mt-2 mb-4 flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={onBack}
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="font-heading text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          Creator
        </span>
      </div>

      <CreatorHeader
        creator={creator ?? null}
        name={name}
        isLoading={isProfileLoading}
        zzzCount={zzzCount}
        hasMods={records.length > 0 || areModsLoading}
        isFollowed={isFollowed}
        onToggleFollow={toggleFollow}
      />

      {/* A banned or private profile is not an empty one, and must not look like it. GameBanana
          still serves the mod list in both cases, so the list stays — this only explains why
          there is nothing above it. */}
      {creator?.is_banned && (
        <p className="border-2 border-destructive/40 bg-destructive/5 px-3.5 py-2.5 text-xs text-muted-foreground">
          This account is banned on GameBanana. Their mods may be removed at any time.
        </p>
      )}
      {creator?.is_private && !creator.is_banned && (
        <p className="border-2 border-border px-3.5 py-2.5 text-xs text-muted-foreground">
          This profile is private, so there is little to show beyond their mods.
        </p>
      )}

      {areModsLoading ? (
        <div className={CARD_GRID}>
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="aspect-[4/3] w-full" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">
          Could not load {name}’s mods. {String(error)}
        </p>
      ) : records.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {hiddenCount > 0 ? (
            <>
              All of {name}’s Zenless Zone Zero mods are hidden by your mature-content setting.
            </>
          ) : (
            <>{name} has no Zenless Zone Zero mods on GameBanana.</>
          )}
        </p>
      ) : (
        <>
          <div className={CARD_GRID}>
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
            <p className="text-xs text-muted-foreground">
              {hiddenCount} {hiddenCount === 1 ? "mod is" : "mods are"} hidden by your
              mature-content setting.
            </p>
          )}

          <div ref={sentinelRef} className="h-px" />

          {isFetchingNextPage && (
            <div className={CARD_GRID}>
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="aspect-[4/3] w-full" />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface CreatorHeaderProps {
  creator: GbCreator | null;
  name: string;
  isLoading: boolean;
  zzzCount: number;
  hasMods: boolean;
  isFollowed: boolean;
  onToggleFollow: () => void;
}

/** The identity band: face, name, and the numbers worth knowing before you trust a mod.
 *
 * Built as a bordered panel rather than the character page's art banner — there is no art to
 * lean on here, only a 96px avatar, and stretching that behind a full-width band would just be
 * a blurred square. */
function CreatorHeader({
  creator,
  name,
  isLoading,
  zzzCount,
  hasMods,
  isFollowed,
  onToggleFollow,
}: CreatorHeaderProps) {
  const stats = creator?.core_stats;
  // GameBanana sends "Bananite" for nearly every member — a rank, not a description. It earns a
  // line only when it says something, which an honorary title always does.
  const title = creator?.honorary_title || creator?.user_title || "";

  return (
    <div className="border-2 border-border bg-card">
      <div className="flex items-center gap-4 px-4 py-4">
        {creator?.avatar_url ? (
          <img
            src={creator.avatar_url}
            alt=""
            className="h-24 w-24 shrink-0 border-2 border-border object-cover"
          />
        ) : isLoading ? (
          <Skeleton className="h-24 w-24 shrink-0" />
        ) : (
          <span className="flex h-24 w-24 shrink-0 items-center justify-center border-2 border-border bg-secondary font-heading text-4xl text-muted-foreground">
            {(name || "?").charAt(0).toUpperCase()}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[32px] leading-[1.05]">{name}</h2>
          {title && (
            <p className="mt-1 font-heading text-[11px] uppercase tracking-[0.12em] text-primary">
              {title}
            </p>
          )}
          <p className="mt-1.5 text-xs text-muted-foreground">
            {hasMods ? (
              <>
                <span className="font-semibold tabular-nums text-foreground">{zzzCount}</span>{" "}
                {zzzCount === 1 ? "mod" : "mods"} for Zenless Zone Zero
              </>
            ) : (
              "No Zenless Zone Zero mods"
            )}
            {creator && creator.join_date > 0 && (
              <> · joined {new Date(creator.join_date * 1000).getFullYear()}</>
            )}
          </p>
        </div>

        {creator && (
          // Filled accent while followed, outline while not — the same on/off language the
          // bookmark button on a mod card uses, so the two read as the same kind of switch.
          <Button
            type="button"
            variant={isFollowed ? "default" : "outline"}
            size="sm"
            className="shrink-0"
            onClick={onToggleFollow}
          >
            {isFollowed ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <UserPlus className="h-3.5 w-3.5" />
            )}
            {isFollowed ? "Following" : "Follow"}
          </Button>
        )}

        {creator && (
          // The opener plugin, not an anchor: `target="_blank"` does not navigate inside a
          // WebView2, so a plain link here would silently do nothing.
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => void openUrl(creator.profile_url)}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            GameBanana
          </Button>
        )}
      </div>

      {stats && (
        // Labelled "all games" once, over the row, rather than on each cell. Every counter
        // GameBanana keeps on a profile spans their whole account, and sitting under a ZZZ mod
        // count they would otherwise read as ZZZ figures.
        <div className="border-t-2 border-border">
          <p className="px-4 pt-2.5 font-heading text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
            On GameBanana · all games
          </p>
          <div className="grid grid-cols-2 divide-x divide-border border-t border-border bg-background sm:grid-cols-4">
            <StatCell value={stats.submissions.toLocaleString()} label="submissions" />
            <StatCell value={stats.thanks_received.toLocaleString()} label="thanks" />
            <StatCell value={stats.featured.toLocaleString()} label="featured" />
            <StatCell
              value={(creator?.subscriber_count ?? 0).toLocaleString()}
              label="subscribers"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="px-4 py-2.5">
      <p className="font-heading text-lg leading-tight tabular-nums">{value}</p>
      <p className="text-[10px] uppercase tracking-[0.13em] text-muted-foreground">{label}</p>
    </div>
  );
}
