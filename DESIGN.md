# Design language — "New Eridu"

The look is borrowed from Zenless Zone Zero's own industrial signage: hazard yellow on
near-black, condensed uppercase type, square edges with one corner cut off. It is a single
committed dark theme, not a light/dark pair.

Read this before designing a new screen. It records what the app already does and why, so a new
surface inherits the language instead of inventing a second one. Product truth — who this is
for, what must never be fabricated — lives in [PRODUCT.md](PRODUCT.md).

---

## Colour

Defined once in `src/styles/global.css`. **Use the token, never a hand-picked hex.** The
surfaces form a ladder; pick by depth, not by eye.

| Token | Value | Used for |
|---|---|---|
| `--sidebar` | `#08080a` | nav, and anything recessed *below* the page |
| `--background` | `#0a0a0c` | the page itself |
| `--card` | `#101014` | raised panels, cards |
| `--secondary` / `--muted` | `#16161b` | inset wells, image placeholders |
| `--border` / `--accent` | `#23232a` | borders, dividers |
| `--muted-foreground` | `#8a8a94` | secondary text |
| `--foreground` | `#f0f0f2` | primary text |
| `--primary` | `#ffd400` | see below — scarce |
| `--destructive` | `#e5484d` | delete, and only on hover; plus the `NSFW` badge |

### The accent has exactly three jobs

`--primary` marks **the thing under your cursor**, **the thing that is on**, and **the thing
that needs action**. Nothing else. It stops being findable the moment it becomes decoration.

- hover — border and dividers go yellow
- enabled — the mod card's bar fills solid yellow; the active nav item takes the full accent
- update waiting — card border plus an `UPDATE` badge

Arbitrary colour values are allowed only where no token could apply — a gradient stop, a
3%-opacity ghost — and the reason goes in a comment next to it.

## Type

| Role | Face | Treatment |
|---|---|---|
| Page and section headings (`h1`, `h2`) | `--font-heading` — Bahnschrift | uppercase, `tracking-[0.08em]` |
| Card names, buttons, labels, counts | Bahnschrift | uppercase, tracking `0.04`–`0.12em` |
| Body, descriptions, errors | Geist | sentence case |

Bahnschrift ships with Windows and this app is Windows-only, so it always resolves. Body text
stays on bundled Geist so the running copy never depends on a system font. `h1, h2` get the
heading face from a single base rule — a new screen inherits it without opting in.

Small uppercase Bahnschrift *is* the label style. Reach for it before reaching for colour or
weight to make something feel like a label.

## Shape

- **`--radius: 0`.** Nothing is rounded. Every derived `--radius-*` resolves to zero.
- **The cut corner is the signature.** Cards clip 14px off the bottom-right:
  `clipPath: polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%)`.
  A radius cannot express it, so it is an inline style rather than a utility.
- **2px borders on cards, 1px on internal dividers.** The weight difference is what separates
  "this is an object" from "this is a rule inside it".

## State

One vocabulary, used the same way on every screen.

| State | How it reads |
|---|---|
| On / in play | full colour art, solid yellow bar, lit `--card` surface |
| Off / not in play | greyscale art, hollow bar, recessed `--sidebar` surface |
| Under the cursor | yellow border, colour restored, 2px lift |
| Needs action | yellow border + `UPDATE` badge |
| Working | the control says what it is doing in place (`Enabling…`), never a spinner elsewhere |

**Greyscale, not opacity.** Fading art washes a whole grid out; desaturation keeps it crisp and
still reads as inactive. Colour always returns on hover so a greyed screen stays browsable.

**A control that carries state shows the verb on hover.** An enabled mod reads `ENABLED`; hover
drops the fill and says `DISABLE`, so the result is visible before committing to it.

**Reversible and destructive must never look alike** (PRODUCT principle 4). Enable is the
biggest target on a mod card because it is frequent and always undoable. Delete is pushed to the
far edge, ghosted at 45% opacity, and only turns `--destructive` on hover. They differ in size,
weight and position — not just colour.

## Imagery

The art is the point of this app. Anything laid over it needs to earn its place.

| Surface | Aspect | Source |
|---|---|---|
| Character card | 3:4 | `public/characters/<id>.webp`, 480×640 |
| Character page banner | ~16:9 in a 300px band | `public/banners/<id>.webp` |
| Mod card | 16:10 | GameBanana preview URL, or the "no preview" state |

- **No texture over artwork.** Scanlines and gradients were tried on both card types and removed
  from both: they obscured the thing the user came to look at.
- **Ship art near the size it is drawn.** A >5× browser downscale aliases hair and linework into
  what looks like pixelation. `scripts/scale-portraits.mjs` normalises portraits; run it after
  adding art.
- **Normalise framing, don't crop at render.** Sources vary from 0.44 to 0.85 in aspect. Each
  portrait is trimmed to its figure via alpha, then centred on a transparent 3:4 canvas, so the
  card's `object-cover` has nothing left to cut and every character frames alike.
- **An absent image is a designed state, not a failure.** "No preview" and the character initial
  are drawn deliberately; 7 of 60 characters will never have art, and hand-added mods never have
  a preview.
- Third-party imagery from GameBanana is untrusted and frequently mature — it goes behind
  `MatureContentShield`.

## Layout

- **This is a resizable desktop window, not a phone.** Grids use `auto-fill` + `minmax` so
  columns follow the window; maximising fits more cards rather than stretching the same six.
  Fixed breakpoint column counts are a web habit and do not belong here.
  - `POSTER_GRID` — 3:4 portrait cards (the character roster), 180px floor
  - `CARD_GRID` — every mod card, browsed, saved or installed, 240px floor. Browse, Bookmarks
    and the library take the same room; they differ in what the card holds and in its art ratio
    (4:3 browsing and saved, 16:10 installed), not in size. Bookmarks used the roster's poster
    grid until it was rebuilt, which made saved mods read as a different kind of object from
    the search results they were saved from.
- **No centred max-width page cap.** Content fills the window. Only cap width where line length
  genuinely matters for reading (Settings, a mod description).
- **Full-bleed bands escape the page padding** with `-mx-6`, so a header reaches the window
  edges instead of floating in a gutter.
- **Bound a band on both sides.** Art that ends in open space reads as broken; art cut by a
  border reads as framed. The character banner has a yellow rule above and below for exactly
  this reason.
- **Controls belong next to what they act on.** The mod row was replaced by a card because its
  buttons sat a window's width from the name they applied to.
- **Don't label a category that has no siblings.** The character page dropped its
  `CHARACTER SKIN` heading — one slot per character means the heading named nothing.

## Motion

Restrained and short. `transition-all` at the default duration; a 2px lift on hover
(`hover:-translate-y-0.5`); colour and filter transitions on state change. No entrance
animations, and one loop only.

**The one loop is the featured band**, which advances every 7s so all six ranking windows are
seen without being clicked through. It holds the moment the pointer enters or anything inside
takes focus — a slide that changes under a click opens the wrong mod — and choosing a window by
hand restarts the clock rather than inheriting the tail of the last one. Nothing else on any
screen moves on its own.

> Check an arbitrary Tailwind value actually emits CSS before trusting it —
> `hover:-translate-y-[3px]` generated no rule at all and the lift was dead for days.

## Wide third-party HTML

GameBanana descriptions contain arbitrary markup. Anything wide — tables, `<pre>` — must scroll
inside its own container. A single `<pre>` once pushed the whole window sideways.
