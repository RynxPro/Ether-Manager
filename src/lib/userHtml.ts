import DOMPurify from "dompurify";

/** Attribute a link's address is parked in once its `href` has been taken away. */
export const EXTERNAL_HREF_ATTR = "data-external-href";

/** Cleans HTML written by somebody else and makes every link in it unable to go anywhere.
 *
 * Two surfaces need this — a mod's description and the comments under it — and they must not
 * drift apart, because the moment one of them is a little more permissive than the other, that
 * is the one that matters.
 *
 * Sanitising alone was not enough, and the gap was not theoretical: a link in a real mod's
 * description navigated the *webview* to x.com. The app was simply replaced by the website, and
 * with the native title bar gone there was no browser chrome, no Back, and no way out short of
 * killing the window.
 *
 * DOMPurify's job is to remove what can execute. It keeps links, correctly: a description
 * without them would be useless. So the second step removes `href` outright and parks the
 * address in a data attribute. An anchor with no `href` is inert — it cannot navigate however it
 * is clicked, middle-clicked or activated — which makes the caller's handler the only way one
 * can be followed, rather than merely the intended way. A handler racing the browser would be a
 * bug waiting for the one case it missed.
 *
 * `form` and `base` go too: a form post navigates, and a `<base>` would silently retarget every
 * relative URL on the page. */
/** What a mod description is allowed to be made of.
 *
 * An allowlist rather than a list of things to forbid, which is the safer shape: a tag nobody
 * thought of is refused by default instead of waved through, and DOMPurify's own defaults
 * change between versions.
 *
 * Drawn from what real descriptions actually contain, not guessed — every tag ten of the most
 * downloaded ZZZ mods used is here, plus the handful of obvious siblings (the rest of the
 * headings, table parts, blockquote). Two observed tags are deliberately absent: `iframe`,
 * because a mod page is not something that gets to embed a document, and showcase videos
 * already arrive separately through `_aEmbeddedMedia`; and `font`, which only carries colour —
 * stripping the tag keeps the words. */
const ALLOWED_TAGS = [
  "a", "b", "blockquote", "br", "code", "del", "div", "em",
  "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "li",
  "ol", "p", "pre", "s", "span", "strong", "sub", "sup",
  "table", "tbody", "td", "th", "thead", "tr", "u", "ul",
];

/** `href` survives sanitising only to be taken away below — the step that parks it has to be
 * able to read it first. GameBanana's editor also litters the markup with `data-path-to-node`
 * and friends, which `ALLOW_DATA_ATTR: false` drops: they are its own bookkeeping and mean
 * nothing here. */
const ALLOWED_ATTR = ["alt", "class", "height", "href", "rel", "src", "target", "title", "width"];

export function sanitizeUserHtml(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
  const doc = new DOMParser().parseFromString(clean, "text/html");

  for (const anchor of doc.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href") ?? "";
    anchor.removeAttribute("href");
    // `target` and `rel` mean nothing without an href, and leaving them invites the next reader
    // to think this is still an ordinary link.
    anchor.removeAttribute("target");
    anchor.removeAttribute("rel");
    anchor.setAttribute(EXTERNAL_HREF_ATTR, href);
    // Keeps it a link to anything reading the page rather than clicking it, since taking the
    // href away also took away what made it one.
    anchor.setAttribute("role", "link");
    anchor.setAttribute("tabindex", "0");
  }

  return doc.body.innerHTML;
}

/** The address behind whatever was clicked, if it was one of the parked links.
 *
 * Written once here because both surfaces delegate from a container — this markup is set as a
 * string, so there are no React elements to bind handlers to — and both need the same "did the
 * click land on or inside a link" walk. */
export function parkedHrefFrom(target: EventTarget | null): string | null {
  if (!(target instanceof HTMLElement)) return null;
  const anchor = target.closest(`[${EXTERNAL_HREF_ATTR}]`);
  return anchor?.getAttribute(EXTERNAL_HREF_ATTR) ?? null;
}
