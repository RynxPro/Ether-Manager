interface PageHeaderProps {
  /** Placed before the title — in practice a back button, on the pages you arrive at from
   * somewhere else rather than from the sidebar. It belongs inside the band rather than above
   * it: a detail page's way out is part of its heading, not a separate row of chrome. */
  leading?: React.ReactNode;
  title: string;
  /** A short line of context beside the title. Optional, but most pages have something worth
   * saying that the title alone cannot carry. */
  subtitle?: string;
  /** Pushed to the right of the rule — a search box, a count, a page-level action. */
  children?: React.ReactNode;
}

/** The band every top-level page starts with: the name in the display face, a quiet line of
 * context, and the accent rule that separates the page from its chrome.
 *
 * Extracted because it had drifted. Browse, Bookmarks and Downloads each carried their own copy
 * of it while Library, All Mods and Settings still had the plain sentence-case heading from
 * before the Eridu pass — so which page you were on changed how the app looked, for no reason
 * anyone chose. One definition means the next page cannot start out different either. */
export function PageHeader({ leading, title, subtitle, children }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2 border-b-2 border-primary pb-3.5">
      {/* `self-center` because the row aligns on the text baseline, which a control with no text
          of its own has no useful answer for. */}
      {leading && <div className="self-center">{leading}</div>}
      {/* `break-words` for the titles that are not page names: a mod's is whatever its author
          typed, and GameBanana names are comma-joined runs the line breaker treats as one
          token — the same trap the featured panel's title hit. */}
      <h2 className="min-w-0 break-words font-heading text-2xl uppercase tracking-[0.06em] text-foreground">
        {title}
      </h2>
      {subtitle && (
        <span className="font-heading text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
          {subtitle}
        </span>
      )}
      {/* `ml-auto` on the wrapper rather than on each caller's control, so a page only has to
          say what goes on the right, not how to get it there. */}
      {children && <div className="ml-auto flex items-center gap-3">{children}</div>}
    </div>
  );
}
