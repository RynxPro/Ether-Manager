import { useState } from "react";
import { ChevronDown, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { updatedLabel } from "@/lib/time";
import { parkedHrefFrom, sanitizeUserHtml } from "@/lib/userHtml";
import { useModPosts } from "./hooks";

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
 * needs a session the app does not have. So there is no reply box, and the reply counts say
 * where the thread lives instead of pretending otherwise. */
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
            <article key={post.id} className="border border-border bg-card px-3 py-2.5">
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
                <span className="min-w-0 truncate text-xs text-foreground">
                  {post.poster.name}
                </span>
                {/* Pinned by the author — nearly always the "read this first" post, so it is
                    worth marking even though the list is not reordered around it. */}
                {post.pin_level > 0 && (
                  <span className="shrink-0 border border-primary/40 px-1 py-px font-sign text-[13px] uppercase tracking-[0.12em] text-primary">
                    Pinned
                  </span>
                )}
                <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {updatedLabel(post.date_added)}
                </span>
              </div>

              {/* Same treatment as a mod's description: sanitised, and every link inside stripped
                  of its `href` so none of them can navigate the window. See `sanitizeUserHtml`.
                  The handlers delegate for those links, which carry their own role and tab stop —
                  this container is not itself interactive, which jsx-a11y cannot see from here. */}
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

              {/* The replies are a request each, so they stay on GameBanana. Saying how many
                  there are is honest; pretending the thread is here would not be. */}
              {post.reply_count > 0 && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {post.reply_count} {post.reply_count === 1 ? "reply" : "replies"} on GameBanana
                </p>
              )}
            </article>
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
