import { useState } from "react";
import { ChevronDown, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { GbPost } from "@/lib/tauri-commands";
import { updatedLabel } from "@/lib/time";
import { parkedHrefFrom, sanitizeUserHtml } from "@/lib/userHtml";
import { useModPosts, usePostReplies } from "./hooks";

interface ModCommentsProps {
  modId: number;
  /** What the mod page already knows the count to be, so the header can say how many there are
   * before a single one has been fetched. */
  postCount: number;
  /** Follows a link inside a comment. Threaded from the mod page so a GameBanana link in a
   * comment behaves exactly like one in a description — same ZZZ check, same browser
   * confirmation. A second policy here would be a second thing to get wrong. */
  onFollowLink: (url: string) => void;
}

/** What people said under a mod, collapsed until asked for.
 *
 * Closed by default and not fetched until opened. A popular mod carries five hundred comments,
 * nobody opened a mod page to read them, and they are the least important thing on it — the
 * files and the pictures are why you are here.
 *
 * Read-only, and that is the API's doing rather than a choice: every write path on GameBanana
 * needs a session the app does not have. So there is no reply box. */
export function ModComments({ modId, postCount, onFollowLink }: ModCommentsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useModPosts(modId, isOpen);

  const posts = data?.pages.flatMap((page) => page.records) ?? [];

  if (postCount === 0) return null;

  return (
    <section>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="mb-3 flex w-full items-center gap-2 border-b-2 border-border pb-1.5 font-sign text-[15px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <MessageSquare className="h-3.5 w-3.5 shrink-0" />
        <span>Comments</span>
        <span className="tabular-nums">{postCount}</span>
        <ChevronDown
          className={`ml-auto h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {isOpen && (
        <div className="space-y-3">
          {isLoading && (
            <>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </>
          )}

          {isError && (
            <p className="text-sm text-muted-foreground">
              Comments could not be loaded. The mod itself is unaffected.
            </p>
          )}

          {posts.map((post) => (
            <PostCard key={post.id} post={post} onFollowLink={onFollowLink} />
          ))}

          {hasNextPage && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
            >
              {isFetchingNextPage ? "Loading…" : "Load more comments"}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

interface PostCardProps {
  post: GbPost;
  onFollowLink: (url: string) => void;
  /** A reply. Drawn quieter and without a thread of its own — GameBanana nests one level, and
   * so does this. */
  isReply?: boolean;
}

/** One comment, or one reply. The same object either way.
 *
 * Written once and used for both deliberately. A reply drawn by a second copy of this markup
 * would start out identical and drift on a padding or a handler, and the handler is the half
 * that must not: `sanitizeUserHtml` has taken the `href` off every link in here, so the
 * delegated click is the only thing that can follow one. Two copies would eventually mean one
 * surface where links quietly stopped working. */
function PostCard({ post, onFollowLink, isReply = false }: PostCardProps) {
  const [showReplies, setShowReplies] = useState(false);
  // Not fetched until the thread is opened, which is what keeps this affordable: a page of
  // fifteen comments with replies under several of them would otherwise cost a handful of
  // requests for material most readers never unfold.
  const {
    data: replies,
    isLoading: repliesLoading,
    isError: repliesFailed,
  } = usePostReplies(post.id, showReplies);

  return (
    <article
      className={
        isReply
          ? "border border-border/60 bg-background px-3 py-2.5"
          : "border border-border bg-card px-3 py-2.5"
      }
    >
      <div className="mb-1.5 flex items-center gap-2">
        {post.poster.avatar_url ? (
          <img
            src={post.poster.avatar_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-5 w-5 shrink-0 object-cover"
          />
        ) : (
          <span aria-hidden className="h-5 w-5 shrink-0 bg-muted" />
        )}
        <span className="min-w-0 truncate text-xs text-foreground">{post.poster.name}</span>
        {/* Pinned by the author — nearly always the "read this first" post, so it is worth
            marking even though the list is not reordered around it. */}
        {post.pin_level > 0 && (
          <span className="shrink-0 border border-primary/40 px-1 py-px font-sign text-[13px] uppercase tracking-[0.12em] text-primary">
            Pinned
          </span>
        )}
        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {updatedLabel(post.date_added)}
        </span>
      </div>

      {/* Same treatment as a mod's description: sanitised, and every link inside stripped of its
          `href` so none of them can navigate the window. See `sanitizeUserHtml`. The handlers
          delegate for those links, which carry their own role and tab stop — this container is
          not itself interactive, which jsx-a11y cannot see from here. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        onClick={(event) => {
          const href = parkedHrefFrom(event.target);
          if (href === null) return;
          event.preventDefault();
          onFollowLink(href);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          const href = parkedHrefFrom(event.target);
          if (href === null) return;
          event.preventDefault();
          onFollowLink(href);
        }}
        className="overflow-x-hidden break-words text-[13px] leading-relaxed text-foreground/85 [&_a]:cursor-pointer [&_a]:text-primary [&_a]:underline [&_img]:my-2 [&_img]:h-auto [&_img]:max-w-full [&_p]:mb-2 [&_p:last-child]:mb-0"
        dangerouslySetInnerHTML={{ __html: sanitizeUserHtml(post.text_html) }}
      />

      {/* The thread, in place. This used to be a count and a nudge to go and read it on the
          site, on the grounds that every thread is its own request — which is true, and is why
          nothing is fetched until somebody opens one. The replies are where a comments section
          earns its keep: whether a mod works, and what to delete when it does not, is answered
          in them rather than in the question. */}
      {!isReply && post.reply_count > 0 && (
        <div className="mt-1.5">
          <button
            type="button"
            aria-expanded={showReplies}
            onClick={() => setShowReplies((open) => !open)}
            className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {showReplies ? "Hide" : "Show"} {post.reply_count}{" "}
            {post.reply_count === 1 ? "reply" : "replies"}
          </button>

          {showReplies && (
            <div className="mt-2 space-y-2 border-l-2 border-border pl-3">
              {repliesLoading && <Skeleton className="h-12 w-full" />}
              {repliesFailed && (
                <p className="text-[11px] text-muted-foreground">
                  These replies could not be loaded. They are still on GameBanana.
                </p>
              )}
              {replies?.map((reply) => (
                <PostCard key={reply.id} post={reply} onFollowLink={onFollowLink} isReply />
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
