# Design language — "Sixth Street"

The app is a wall with things stuck to it. Paper slapped on concrete, hard offset shadows, one
red accent, and typefaces that each do exactly one job. Two themes — Daylight and Night — which
are the same wall at two times of day, not a light/dark pair bolted together.

Read this before designing a new screen. It records what the app already does and why, so a new
surface inherits the language instead of inventing a second one. Product truth — who this is
for, what must never be fabricated — lives in [PRODUCT.md](PRODUCT.md).

> This replaced "New Eridu" (hazard yellow, cut corners, one dark theme) in the street restyle.
> If you find a surface that still looks like that description, the surface is what is wrong.

---

## The material rule

Everything else follows from one sentence:

> **If you can interact with it, it is paper stuck on the wall. If it is decoration, it is
> sprayed on the wall.**

- **Paper** — `--card`, always carrying `--shadow-slap`. Buttons, cards, chips, inputs, sheets.
- **Spray** — `--primary` at low opacity, directly on `--background`. The wall tag behind a page
  title, the stroke under a heading.

Nothing floats in between, and that single rule is what stops the app reading as two designs
arguing with each other.

**A control sitting on paper inverts**: it takes `--background` rather than `--card`, because
paper on paper of the same shade has no edge at all. The install dialog's close button, the
Downloads hero's Pause and Cancel, and the Settings option slabs all do this.

## Colour

Defined once in `src/styles/global.css`, as one set of names with two sets of values. **Use the
token, never a hand-picked hex.** A component names the role, the theme supplies the value, and
no component ever asks which theme it is in. That is what makes shipping both roughly free
rather than double the work.

| Token | Role |
|---|---|
| `--background` | the wall |
| `--card` | paper stuck to it |
| `--art` | the well behind artwork — must read apart from the *wall*, not just from the card |
| `--secondary` / `--muted` | inset channels, tracks, placeholders |
| `--border` | 2px object edges, 1px internal rules |
| `--muted-foreground` | secondary text |
| `--foreground` / `--card-foreground` | primary text |
| `--primary` | the accent — see below |
| `--destructive` | a problem. Deliberately a *dark* red in **both** themes |
| `--success` | two jobs, neither of them "on" — see below |
| `--sign` / `--sign-foreground` | the LED strip, the one lit object in either theme |

Arbitrary colour values are allowed only where no token could apply — a gradient stop, a mask
stop, a 3%-opacity ghost — and the reason goes in a comment next to it.

### The accent has exactly one meaning

`--primary` means **live**: under the cursor, switched on, selected, or committing. It is never
decoration. The previous look split that job between a yellow and a red, which is precisely why
neither read as anything in particular.

Because the accent is red, `--destructive` cannot be a second bright red. The two are told apart
by **value**, not hue — which also survives colour blindness, where a red/red pair does not. A
destructive fill therefore needs a light foreground: `text-white`, not a token, since neither
`text-card` nor `text-foreground` is legible on it in both themes.

### Chosen looks like chosen

Settled by `FilterChip`, and it holds everywhere: **the surface says you can press it, the
colour says which one is on.** A chosen option is *filled* with the accent; the rest sit there
as plain board. An outline around the chosen one spends the accent on drawing a box and leaves
the live item made of the same material as the dead ones.

The exception is a card whose face is artwork and cannot be filled — the roster's enabled mod,
the mod card's selected state. Those take the accent border plus a ring instead.

### The green has two jobs, and neither is "on"

`--success` marks **a fact where the fact is news**:

1. the sidebar's API signal, whose top step cannot be the accent or a healthy connection would
   look like a lit control (and which is positional as well — one, two or three bars);
2. the "you already have this" tag on a Browse, Bookmarks or mod-detail card, where it answers
   the question you are actually asking while scanning a grid of things you do not own.

The Downloads log deliberately does **not** use green for the same word. There, "Installed" is
how every finished row ends, so a column of green would be noise and would compete with the one
red `Failed` that has to be legible from across the room.

## Type — one job each

| Face | Token | Job |
|---|---|---|
| Anton | `--font-heading` | page titles and card names. Nothing else. |
| Bebas Neue | `--font-sign` | **every control, and every caption.** Buttons, chips, stamps, tabs, band labels. |
| Permanent Marker | `--font-hand` | annotation only — a note *about* the interface, never part of it. |
| Courier | `--font-mono` | whatever the machine knows: sizes, counts, dates, paths, file names. |
| Geist | `--font-sans` | body copy. The only job it has. |

All of them are bundled rather than fetched: this is a desktop app, and a typeface that needs
the network is a typeface that is missing when the network is.

If a thing is a control, set it in Bebas before reaching for colour or weight to make it feel
like one. If a thing is a figure the app measured, it is Courier — that contrast is what keeps a
card from reading as one undifferentiated block of display type.

**A band label is a caption, so it is Bebas.** `UP NEXT`, `HISTORY`, `LENS SIZE`, `END OF
RESULTS` — these name a region, they do not name a thing, and a label is closer to signage than
to a title. Caption sizes run 13–16px with tracking of `0.12`–`0.16em`; Bebas is condensed, so a
caption converted from Anton needs roughly four extra pixels to hold the same presence.

Anton still wins wherever the small text is **the name of something** or **a figure in a box**:
the app's wordmark in the title bar, the rail thumb's mod name, the unread count on the bell, a
queue position, an index in a numbered badge.

## Shape and measurement

Everything below is settled. A new surface that wants a different number needs a reason written
next to it.

| Rule | Value |
|---|---|
| Radius | **`--radius: 0`.** Nothing is rounded. The only `rounded-full` in the app is the sign's four screws and the install progress bar. |
| Object edge | `border-2` |
| Internal rule | `border` (1px) — the weight difference separates "this is an object" from "this is a line inside it" |
| Shadow, control | `shadow-slap` |
| Shadow, card or sheet | `shadow-slap-lift` |
| Hover lift, **card** | `hover:-translate-y-0.5` (2px) |
| Hover lift, **control** | `hover:-translate-y-px` (1px) |
| Hover, card | accent border **and** `hover:ring-2 hover:ring-primary` |
| Focus, everything | `focus-visible:ring-2 focus-visible:ring-primary`, plus `ring-inset` where the control fills its own edge |
| Transition | `duration-200`. The one exception is a slow image zoom at `duration-300`. |

**The lift split is deliberate**: 1px on a 500px card is invisible, 2px on a 30px chip looks like
it jumped. Size the movement to the object.

A ring is drawn as a box-shadow, so anything that gains one on hover must list `box-shadow` in
its `transition-[…]`, or the ring snaps on instead of arriving with the lift.

**Every control gets a focus ring.** Ten files once had buttons with none at all, which left the
whole character filter rail and the window controls invisible to a keyboard.

### Tilt

Paper is placed by hand, so it sits slightly off true — but **the tilt is seasoning, not the
dish.** The surface and the hard shadow carry the look; this could go to zero without the style
collapsing.

- Anything in a repeating set takes its angle from `tiltFor(id)` (`src/lib/tilt.ts`): ±1.4° in
  15 steps, hashed from the item's own id, so a card keeps its angle when the list is filtered
  and no two neighbours lean the same way.
- A one-off object may take a hand-picked angle, but keep it under about 3°, and never tilt
  anything page-wide: across a wide element a tilt just drops one end below the other and looks
  broken.
- **Tilt the paper, not the text.** A glyph on a rotated baseline cannot be hinted, so it goes
  soft and then visibly sharpens when a hover straightens it. `PaperTilt` carries the stock at an
  angle and leaves the words upright on the pixel grid.

## State

One vocabulary, used the same way on every screen.

| State | How it reads |
|---|---|
| On / in play | full-colour art, accent fill, paper surface |
| Off / not in play | greyscale art, no fill |
| Under the cursor | accent border + `ring-2`, lifted |
| Needs action | accent + a stamped word (`UPDATE`) |
| Gone wrong | `--destructive` fill, `text-white`, a stamped word (`MISSING`, `FAILED`) |
| Working | the control says what it is doing in place (`Enabling…`), never a spinner elsewhere |

**Greyscale, not opacity.** Fading art washes a whole grid out; desaturation keeps it crisp and
still reads as inactive. Colour returns on hover so a greyed screen stays browsable.

**A control that carries state shows the verb on hover.** An enabled mod reads `ENABLED`; hover
drops the fill and says `DISABLE`, so the result is visible before committing to it.

**Reversible and destructive must never look alike** (PRODUCT principle 4). Enable is the biggest
target on a mod card because it is frequent and always undoable. Delete is pushed to the far edge
and only takes `--destructive` on hover. They differ in size, weight and position — not just
colour.

**An empty state is a designed object, not a sentence.** A line of grey text on bare concrete
reads as something that failed to load. Empty states are a board on the wall: a card or a
`border-2 border-dashed` panel, an Anton headline, a Courier sub-line, and a marker annotation
where there is something worth saying by hand.

## Page furniture

- **`PageHeader` on every top-level page, always `pinned={false}`.** The sprayed wall tag is
  deliberately taller than the band it sits in, so a pinned header has to clip it.
- **The wall tag is a second word, not an echo.** Downloads gets `Queue`; Settings gets `Setup`.
  Never user content — a mod title is arbitrary length, and the tag exists to say which room you
  are standing in, which is always something the app named.
- **`SignStrip` is `aria-hidden` and it moves.** Every number on it must be stated in readable
  form elsewhere on the same page; it is atmosphere carrying a summary, never the only place a
  count exists. Give it at least two readings, or the loop leaves a visible gap.

## Dialogs — the docket

Every dialog is one object: a docket, pinned over the wall. They are built from `ui/dialog.tsx`,
which carries the frame and the vocabulary so that no dialog has to redeclare either.

- **The panel is paper.** Square, `border-2`, `shadow-slap-lift`, `p-0` so each band reaches the
  edges. The shell supplies all of it; a dialog passes only its width.
- **The head is a caption, not a title.** Courier 10px, `tracking-[0.2em]`, muted, naming the
  operation as `Verb · noun` — `Install · consignment`, `Delete · mod`. It is also the dialog's
  accessible name. Never the display face: Anton is for page titles and the names of things, and
  an 11px caption in a coloured bar was what this language replaced.
- **No coloured header bar.** The accent is needed further down, for the thing you press.
- **The way out is a small piece of paper** on `--background`, top right, and it carries
  `isLocked` when the dialog is running something it will not abandon.
- **The footer is a band of `--background`** with `border-t-2`, holding slabs of `--card`. Cancel
  and the action are the same size; the colour is the only difference, so nobody is nudged into
  the committing one by its being the bigger target.
- **Danger is a stamp, not a colour wash.** A `--destructive` stamp hung off the top edge at
  −2°, saying the *consequence* in two or three words — "Deletes files", "Replaces the folder",
  "Leaves the app". Absent on an ordinary confirmation, which is what makes it mean anything.
- **A condition is bordered, never filled** (`DOCKET_NOTICE`): nothing in it is pressable, so it
  must not look like a control.
- **Focus opens on the way out.** Cancel, not the first focusable element. The point of asking is
  that the default answer is no.
- **Inside the panel, the material rule applies as many times as it has to.** A control on the
  panel inverts to `--background`; a control inside a well that is already `--background` comes
  back up to `--card`.
- **Values are the machine's.** Anything typed into or read back — a name, a path, a file name —
  is Courier on its own plate. Labels are the sign face; the sentence under a field is Geist.
- **Grid items do not shrink on their own.** The shell sets `min-w-0` on its children; a panel
  with its own nested grids has to repeat it, or one unbreakable path will size the whole dialog.

## Imagery

The art is the point of this app. Anything laid over it needs to earn its place.

| Surface | Aspect | Source |
|---|---|---|
| Character card | 3:4 | `public/characters/<id>.webp`, 480×640 |
| Character page banner | ~16:9 in a tall band | `public/banners/<id>.webp` |
| Mod card | 16:10 | GameBanana preview URL, or the "no preview" state |

- **No texture over artwork.** Scanlines and gradients were tried on both card types and removed
  from both: they obscured the thing the user came to look at. The concrete grain lives on the
  wall, not on the paper.
- **Ship art near the size it is drawn.** A >5× browser downscale aliases hair and linework into
  what looks like pixelation. `scripts/scale-portraits.mjs` normalises portraits; run it after
  adding art.
- **Normalise framing, don't crop at render.** Sources vary from 0.44 to 0.85 in aspect. Each
  portrait is trimmed to its figure via alpha, then centred on a transparent 3:4 canvas, so the
  card's `object-cover` has nothing left to cut and every character frames alike.
- **Every row that names a thing shows the thing.** A list read by file name cannot be scanned —
  two archive names are the same shape to the eye, and the picture is the part of a mod anyone
  remembers. This is why the Downloads log carries art on every entry, not only the live one.
- **An absent image is a designed state, not a failure.** "No preview" and the character initial
  are drawn deliberately; 7 of 60 characters will never have art, and hand-added mods never have
  a preview.
- Third-party imagery from GameBanana is untrusted and frequently mature — it goes behind
  `MatureContentShield`.

## Layout

- **This is a resizable desktop window, not a phone.** Grids use `auto-fill` + `minmax` so columns
  follow the window; maximising fits more cards rather than stretching the same six. Fixed
  breakpoint column counts are a web habit and do not belong here.
  - `POSTER_GRID` — 3:4 portrait cards (the character roster), 180px floor
  - `CARD_GRID` / `BROWSE_GRID` — every mod card, browsed, saved or installed, 240px floor.
    Browse, Bookmarks and the library take the same room; they differ in what the card holds and
    in its art ratio, not in size.
- **No centred max-width page cap.** Content fills the window. Settings is two columns for exactly
  this reason: capped at one 672px rail it ran off the bottom of the window while leaving a
  thousand pixels of bare wall beside it.
- **Full-bleed bands escape the page padding** with `-mx-6`, so a header reaches the window edges
  instead of floating in a gutter.
- **Bound a band on both sides.** Art that ends in open space reads as broken; art cut by a border
  reads as framed.
- **Controls belong next to what they act on.** The mod row was replaced by a card because its
  buttons sat a window's width from the name they applied to. The same mistake reappeared on
  Downloads and was fixed the same way.
- **Three densities, not one row repeated.** Where a page holds things in genuinely different
  states — one job running, some waiting, many finished — give each its own size. One row shape
  repeated makes the thing in flight look exactly like one that finished a fortnight ago.
- **Don't label a category that has no siblings.** The character page dropped its `CHARACTER SKIN`
  heading — one slot per character means the heading named nothing.

## Motion

Restrained and short: `duration-200`, a lift on hover, colour and ring on state change. No
entrance animations, and one loop only.

**The one loop is the featured band**, which advances every 7s so all six ranking windows are seen
without being clicked through. It holds the moment the pointer enters or anything inside takes
focus — a slide that changes under a click opens the wrong mod — and choosing a window by hand
restarts the clock rather than inheriting the tail of the last one.

The sign strip also scrolls, which makes it the one permanently moving thing on screen; it stops
entirely under `prefers-reduced-motion`.

> Check an arbitrary Tailwind value actually emits CSS before trusting it —
> `hover:-translate-y-[3px]` generated no rule at all and the lift was dead for days.

> Tailwind v4 applies `rotate-*` through the standalone CSS `rotate` property, not `transform`.
> `getComputedStyle(el).transform` reads `none` on a visibly rotated element, and
> `getBoundingClientRect()` returns the enlarged axis-aligned box. Measure rotated things in
> layout space (`offsetTop` / `offsetHeight`) or the measurement will lie to you.

## Wide third-party HTML

GameBanana descriptions contain arbitrary markup. Anything wide — tables, `<pre>` — must scroll
inside its own container. A single `<pre>` once pushed the whole window sideways.
