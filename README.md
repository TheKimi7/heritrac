# heriTrac

A family tree that works out what everyone is to you, instead of asking you to
type it in.

The file holds primitive facts only: who the parents are, who married whom,
each person's sex and birth year. Every word on screen is derived from the
path between two people, so switching whose view you are in relabels the whole
graph, and no relationship is ever stored anywhere.

It runs entirely in the browser. Nothing is uploaded, there is no account and
there is no server.

**Nothing is stored on your machine either.** The tree lives in the tab and
nowhere else: no local storage, no cookies, no IndexedDB. Every visit starts
from the sample family, and the only copy that outlives the tab is the JSON
file you download yourself. Close the tab and the page has left nothing
behind.

That is a deliberate trade, and the cost is real: a reload loses the family.
The app warns you on the way out, and the limits of that warning are in
**Leaving the page** below.

## The window

The canvas fills the window and everything else floats over it, in the manner
of a whiteboard app: the name and its menu button at the top left, the panel
underneath them, and the zoom controls at the bottom right with the add button
among them. The menu button hides the panel when you want the whole canvas.

## Building it

    npm install
    node build.mjs          # or: npm run build

That writes **`dist/`, which is exactly the website and nothing else**: point
a host at that folder and it serves.

    dist/index.html       the landing page, from src/landing.html
    dist/app/index.html   the app, served at /app

The app is one self-contained file with React, React Flow, the stylesheet and
the engine inlined.

The two pages are split because they need different content policies. The
landing page posts a feedback form to another origin, so it has to allow a
form action; the app must go on refusing to post anywhere at all. Keeping
them apart means the app's `default-src 'none'` is never loosened to suit a
contact form. The landing page runs no script of its own, so it refuses code
outright with `script-src 'none'`.

Two things the build makes that are deliberately **not** in `dist/`, because
neither belongs on a public site: `build/page.html`, the same page without a
content policy, for the Claude artifact viewer which injects a runtime of its
own, and `build/test.html`, six hundred kilobytes that runs the whole suite on
load. `build/` is not published and not committed.

For development:

    node build.mjs --watch
    python3 -m http.server 8744
    # http://127.0.0.1:8744/index.html

`index.html` loads `build/app.js` and `build/app.css`, which the watcher keeps
up to date.

## Hosting it

There is no server and nothing to configure. Any static host works.

**On its own domain.** `vercel.json` already names the build command and the
output directory, so a Vercel project needs no settings: it runs
`node build.mjs` and serves `dist/`. Point a subdomain at it with a CNAME to
`cname.vercel-dns.com`, or an A record to `76.76.21.21` for a bare domain.

**Under a path on a site you already have.** On a Vite site, copy
`dist/app/index.html` to `public/heritrac/index.html`: Vite passes `public/`
through untouched, and a real file beats the SPA fallback, so the page answers
at `/heritrac/`. Nothing in the app uses an absolute path, so it does not care
what it is served under. The landing page does reference `/favicon.svg`, so it
expects to sit at a site root.

**As a file.** `dist/app/index.html` works from a USB stick or an email
attachment, opened with `file://`. It needs no icons beside it: the same SVG
is inlined in its head, so the single file carries its own icon wherever it
goes. It is not offered as a download from the site, so anyone who wants it
builds it. The build still copies `favicon.svg`, `icon-32.png`, `icon-512.png`
and `apple-touch-icon.png` into `dist/` for a host that prefers real files.

The one thing it reaches out for is the two Google fonts, which the content
policy allows and nothing else. Self-host them to make the page work with no
network at all.

## Leaving the page

Because nothing is kept, closing the tab with unsaved work loses it. Three
things try to stop that happening by accident:

1. An **Unsaved** marker next to the name, the moment the family differs from
   the last thing you saved. Changing the viewpoint does not count, so looking
   at the family as somebody else never marks anything unsaved. Loading a set
   of words does count, because it writes words into the file.
2. The browser's own "Leave site?" dialog on close or navigation. **The page
   cannot choose the words in it.** Browsers removed custom text from that
   dialog years ago to stop pages lying in it, so you get the generic wording
   whatever the page would rather say. The handler is attached only while
   something would be lost, which also leaves the page eligible for the
   back/forward cache the rest of the time.
3. A confirmation before anything replaces the whole family: Upload, Paste,
   Clear chart and Load the sample all ask first, and offer to save. Not
   `window.confirm`, which an embedded frame is allowed to suppress.

**Where the warning does not work.** It is unreliable on phones, iOS Safari
especially, and inside an embedded frame such as the artifact viewer. In those
places a family can vanish with no warning at all. Download early.

## Injection

Everything is computed in the page, from a file the reader supplies, so the
file is the attack surface. What is defended, and how:

- **Markup in the data.** Names, dates and your own words for people are
  rendered as text by React, and there is no `innerHTML`,
  `dangerouslySetInnerHTML`, `eval` or `new Function` anywhere in `src/`. A
  person called `<img src=x onerror=...>` draws as that literal string. There
  is a check for exactly this.
- **A crafted family file.** `normalise` in `file.js` is a whitelist: it
  rebuilds the tree field by field and never trusts what arrived. Wrong types
  become empty strings, impossible dates are dropped, ids that point nowhere
  are discarded, and an id naming something on `Object.prototype` is refused
  outright, because the app keys plain objects by id and `moved["__proto__"]`
  would otherwise come back truthy. Upload and paste are capped at 1 MB and
  2000 people, so a huge file cannot hang the tab. Around thirty crafted files
  are run through the whole pipeline in the engine checks.
- **Injected script.** The app page carries a content security policy built
  at build time from the SHA-256 of the exact bundle inlined into it, with
  `default-src 'none'` so nothing is permitted by omission. An injected inline
  script has no matching hash and does not run. The browser checks assert both
  halves of that: an injected script is blocked and reported, and the rest of
  the suite produces no violations at all, so a policy that broke React Flow
  or the fonts would fail the build rather than ship.
- **Exfiltration.** `connect-src 'none'`. The page cannot make a network
  request of any kind, so there is nowhere for a family to be sent even if
  something did run.

What this does **not** cover, and no policy in the page could:

- A compromised dependency at build time. The hash would be computed over the
  bad code and bless it.
- Browser extensions, which run outside the policy.
- Google Fonts. It is the one outside origin the policy still allows, and
  Google sees the IP of everyone who loads the page. Self-hosting the two
  families would let `style-src` and `font-src` drop to nothing.

## Using it

Every card has four plus buttons, and they mean the same thing everywhere:

    up     a parent
    down   a child
    left   a brother or sister
    right  a partner

One tap picks the word and the sex together (Father or Mother, Son or
Daughter), then a name, then Enter. The card appears already named from your
point of view, because the name is worked out rather than typed.

Dragging from one of those controls onto another card links two people who are
already there, with the same four meanings: drag from the right of one card
onto another to say they are married, from the top to say that card is their
parent, and so on.

Selecting a card opens the panel, which is where the rest of the editing
lives: the name, whether they are a man or a woman, when they were born and
died, your own word for them if you disagree with the one worked out, and a
list of everybody they are joined to with an Unlink button beside each. A
wrong link is undone there, without deleting anybody.

Dates take either form. `1974` on its own is enough, and `05-11-1974` records
the whole day; slashes and dots work, and so does `1974-11-05`. A whole date
is used where it matters: the age counts the birthday rather than the year,
and two siblings born in the same year are ranked correctly in systems that
have separate words for elder and younger.

**New card** in the panel makes somebody with no links at all, which is how
most people remember a family: names first, joined up afterwards. A loose card
is drawn on your own row and says "Not linked yet" until you join it up. The
panel also has a picker, "Link to someone already here", which does the same
job as a drag without needing one, and is the sane way to do it on a phone.

## Files

    src/engine/kinship.js   the resolver. No DOM, no language, testable alone
    src/engine/packs.js     the English rules, and the Tamil ones words load from
    src/engine/wordset.js   filling a viewpoint's words in from a set
    src/engine/layout.js    the tidy family walk that positions everyone
    src/engine/mutate.js    every change to a family, as pure functions
    src/engine/file.js      the JSON format, validation, import and export
    brand/favicon.svg       the mark: a squircle and an IBM Plex Mono H
    src/engine/dates.js     whole dates or bare years, in and out
    src/engine/data.js      the sample family: the Chola line, modern dates
    src/ui/App.jsx          canvas, panel, editing
    src/ui/PersonNode.jsx   the card and its four sides
    src/ui/AddForm.jsx      the one-tap add popover
    src/styles.css          tokens and the whole visual system
    build.mjs               esbuild bundle and the single file inliner
    test/engine.test.mjs    147 checks with no browser
    test/browser.js         169 checks, built into build/test.html

Run the checks:

    node test/engine.test.mjs
    node build.mjs
    google-chrome --headless=new --window-size=1440,900 \
      --user-data-dir=/tmp/heritrac-check --virtual-time-budget=20000 \
      --dump-dom file://$PWD/build/test.html

The suite never writes to your Downloads folder. Headless Chrome saves like
any other Chrome, and a fresh `--user-data-dir` does not change that, so a
suite that presses Download would drop a copy of the family into
`~/Downloads` on every run. `test/browser.js` catches the anchor click and
records the filename instead. The rest of the save still runs, so the blob is
still made and the content policy is still tested.

`build/test.html` is self-contained, so it runs from `file://` and needs no
server. Pass `--window-size`: the drag checks measure where a card's side
control actually is, and the default headless window is too narrow for two
cards to sit side by side. Give it a fresh `--user-data-dir` too, since Chrome
keeps local storage between headless runs that share one, and the suite seeds
a tree under the old storage keys on purpose to prove the app ignores and
clears them.

`--virtual-time-budget` is not optional. The checks are asynchronous, and
without it `--dump-dom` prints the page before any of them has run, which
looks like zero results rather than like a failure.

Count the results rather than eyeballing them, and strip the tags first, or
the literal `"PASS "` in the test source is counted as a result:

    ... --dump-dom file://$PWD/build/test.html \
      | sed -e 's/<[^>]*>/\n/g' | grep -cE '^PASS '

That should print 169, with `grep -cE '^FAIL '` printing 0, which it does in
roughly nine runs in ten. See the note on the drag checks in **Known gaps**. `build/test.html`
carries the production policy plus the test script's own hash, so the checks
run under the same rules as the hosted page.


## Libraries

React and [React Flow](https://reactflow.dev) do the canvas: panning, zoom,
the handles on each side of a card, and drag to connect. React Flow is a
node-editor library, which is exactly the shape of this problem, and it means
there is no hand-written physics and nothing animating in the background.

Layout is not left to the library. A generic graph layout has no idea what a
couple is, so `layout.js` does a tidy family walk instead: a couple and
everyone descended from them are laid out as one block, each block takes
exactly the width it needs, and sibling blocks sit side by side. Parents land
centred over their children by construction, no two blocks share horizontal
space, so nothing can overlap. It runs once per structural change.

## The data format

Plain JSON. Readable ids, so you can edit it by hand.

```json
{
  "format": "heritrac",
  "version": 1,
  "settings": { "ego": "alex" },
  "people": [
    { "id": "alex", "name": "Alex Hale", "sex": "M", "birth": { "year": 1999 } },
    { "id": "paul", "name": "Paul Hale", "sex": "M", "birth": { "year": 1970 } },
    { "id": "edith", "name": "Edith Hale", "sex": "F", "dead": true }
  ],
  "unions": [
    { "id": "u1", "spouses": ["paul", "linda"], "children": ["alex"] }
  ]
}
```

A union is a couple and their children together, the same shape GEDCOM uses
for `FAM`, which is what makes importing from other family tree software a
small job rather than a rewrite. A union with no spouses is how brothers and
sisters hold together before anybody has added their parents. `overrides`
holds any word you typed in yourself, keyed by viewpoint and person, so your
word for someone does not follow you into somebody else's view.

**Living or not.** A `death` says somebody has died and when. Once a family
goes back far enough there is always somebody everybody knows has died with
nobody left who knows the year, so `"dead": true` says the first part without
the second. Their card is drawn with a dashed border and reads **died** where
a living person's reads their age, and no age is worked out for them, because
counting up to today would be wrong and there is no other date to count to.

The two never disagree, because only one of them is ever stored: a year of
death says everything the flag says and more, so saving a year drops the flag.
In the panel, the Died box and the Living box are the same fact entered two
ways, and the box that says more wins.

Nothing else is stored. There is no "relationship" field anywhere, by design.

## How the engine works

Path notation is the usual one: F father, M mother, B brother, Z sister,
S son, D daughter, H husband, W wife, read left to right from the viewer.
`F.Z.S` is father's sister's son.

1. **Enumerate.** Walk every simple path out to the reach limit. A family with
   any cousin or in-law marriage is not a tree, so one person is often
   reachable several ways.
2. **Reduce.** Rewrite each path to a fixed point. A parent's child is a
   sibling, a child's other parent is a partner. A rewrite is refused when the
   next step goes up, because your uncle's son may be your brother but his
   mother is still not your mother.
3. **Name.** An exact rule first, then whatever the pack can compute, then the
   longest prefix that has a rule with the rest chained on. Every language
   chains past a certain distance; nobody has a single word for your mother's
   uncle's daughter's son.
4. **Rank.** Shortest reduced path wins, blood beats marriage at equal length,
   and a marriage step in the middle of a chain counts for less than one at
   the end. Every candidate is kept, because more than one can be right. In
   the sample, Jack is both a brother-in-law and a first cousin.

## Naming

**Everything is named in English, and nothing else.** There is no naming
system to pick. English states very little and computes the rest: grandparents
and grandchildren at any height, uncles, aunts, nephews and nieces at any
depth, and the full cousin grid, so it will tell you "second cousin once
removed" without a table. Past two greats it switches to the multiplier
genealogists use, so a seven-generation tree reads "4× great-grandfather"
rather than a row of greats nobody can count by eye.

A word you disagree with is a word you replace. Click a card, type yours, and
it is kept for that person from the viewpoint you are in. That is the whole
mechanism, and it is stored as plain text in your file.

### Loading a set of words

Typing twenty eight words is a chore, so a set can be loaded in one go. Tamil
ships as one, under **Words of your own** in the panel.

The Tamil rules are a Dravidian system, and they disagree with English about
the shape of a family rather than just the words. A father's brother's child
is not a cousin, it is a sibling, so those paths reduce further. Elder and
younger are separate words, and the comparison is not always against you:
periyappa against chithappa is decided by your father's age. A mother's
brother shares a word with a father-in-law.

That shape is why the set is computed from the Tamil rules rather than
translated off the English labels. In the sample, Gandaradittan is a second
cousin in English and **Annan** in Tamil, and Uttama is a first cousin once
removed in English and **Periyappa** in Tamil. Neither word is reachable by
renaming an English one.

What a load deliberately leaves alone:

- **Anything the rules are unsure of.** A word you type carries no flag, so
  writing a `verify: true` term in would put a guess into your file looking
  exactly like your own word, for good. Those stay in English and are counted
  in the message, so you know to look them up. In the sample that is three
  people, all of them great-uncles and great-aunts.
- **Composed fallbacks** like "father's sister's son", which are English
  descriptions rather than Tamil words.
- **Any word already there**, yours or previously loaded. Clear them first to
  swap one set for another. The romanised and Tamil-script buttons are two
  sets in this sense, not a toggle.

A load is one change, so one undo takes it back, and **Clear my words here**
removes every word for the viewpoint you are in.

What is settled, and what is not. The second list is exactly what a load
leaves in English, and every rule checked on 2026-11-19 carries its source in
a comment above it in `packs.js`; the long-standing ones do not:

- **Confirmed.** The great-grandparents (kollu thatha, kollu paatti) and
  great-grandchildren (kollu peran, kollu pethi), with poottan and pootti
  recorded as the regional variant; the husband's sister (nathanar); the
  husband's brother (kozhunthanar), which the dictionaries give strictly for
  the younger brother although it is used for either.
- **Still a guess.** The wife's sister: the dictionaries make kozhunthi the
  feminine of kozhunthan and gloss it "wife's sister", but the Tirunelveli
  entry gives the same word for a husband's younger sister, and nothing found
  explains the split. The words a woman uses for her own cross cousins, where
  no source states the female-ego forms at all, and reusing a man's word for
  his wife's sister may well be wrong. The great-granduncles (periya thatha,
  chinna thatha). All of these are marked `verify: true`, so they are counted
  and skipped rather than written into anybody's file.

## Writing your own word set

A set is a pack: a set of rewrites plus a set of rules, added to `packs.js`
and listed in `WORD_SETS` in `wordset.js`. Nothing in the engine or the
interface changes. A pack no longer names the tree on screen, so `blurb` and
`label` are only what the buttons read.

```js
{
  id: "yours",
  label: "Shown on the button",
  blurb: "One line explaining what is different about it.",
  script: "Devanagari",
  sides: { paternal: "...", maternal: "...", affinal: "...", direct: "...", self: "..." },
  joiner: "'s ",
  reduce: [ [["F", "S"], ["B"]] ],
  basics: { F: "father", M: "mother" },
  rules: [ { p: "F.B", t: "Uncle" } ],
  fallback(c) { return null; }
}
```

A rule can carry `age: [a, b]` to compare two people on the path and pick
between an elder and a younger word, `half` for a sibling who shares one
parent, `when` for a condition, `ego` to apply only to a viewer of one sex,
`alt` for another word the position goes by, and `verify` to flag a guess.

## How far it reaches

Every word comes from a path, so a person the search cannot reach has no word.
Two numbers decide how far it gets, and **only one of them matters**:

- `MAX_STEPS`, the longest path considered, now 24. Far enough for a cousin on
  the other side of a seven generation family: up to the shared ancestor and
  back down.
- `budget` in `findPaths`, the number of steps the search may take before it
  gives up, now 250000. **This is the real limit.** The search walks simple
  paths rather than shortest ones, so the work grows exponentially with depth
  and the budget runs out long before the length does.

Raising the length without raising the budget does nothing at all. Measured on
branching clans, resolving from one leaf, a length of 100 names exactly the
same people as a length of 14. The budget is what moved it:

| people in the clan | at budget 60000 | at budget 250000 |
| --- | --- | --- |
| 94 | 54 unnameable | 0, in 11ms |
| 382 | 337 unnameable | 0, in 280ms |
| 1457 | 1352 unnameable | 0, in 284ms |

Past this it stops paying. A budget of 1.5 million takes 1.1 seconds and still
leaves 576 of a 1534 person, nine generation clan unnamed. The work is
memoised against the family and the viewpoint, so it runs again only when one
of those changes.

**There is no distance control.** There used to be a slider that dimmed anyone
more than a few steps away, defaulting to five. In a large family that greyed
out almost everybody, which is the opposite of what a large family needs. Only
a person the app genuinely could not work out a word for fades back now.

## Look

**Monochrome, deliberately.** Every colour in `styles.css` is a neutral grey:
hue and saturation are zero, so nothing picks up a cast on a wide-gamut
screen. The palette before this was a blue slate at hue 210 with an olive
warning, and both read as a tint rather than as grey.

Lightness was carried over unchanged from that palette, so the contrast the
layout was built around still holds. Every text pairing that actually occurs
clears 4.5:1 in both themes. Three text tiers, each far enough from the next
to read as a tier:

| token | light | dark | used for |
| --- | --- | --- | --- |
| `--text` | `#242424` | `#ededed` | names, body |
| `--muted` | `#5a5a5a` | `#b8b8b8` | notes, help |
| `--faint` | `#717171` | `#959595` | section labels, hints |

The faint tier was `#999999`, which is 2.85:1 on white. It carries the 10.5px
uppercase section labels, so that was under the line for text that small and
is now 4.88:1.

With no colour left to carry meaning, three things that have to be told apart
are told apart by line instead:

- a word of your own: **dashed ring** around the chip
- a word the app is unsure of: **dotted underline**, the way a spell checker
  queries a word
- an action that undoes something: **dashed border** on the button

All of it survives being printed, dimmed, or read by somebody who cannot see
colour. The one exception is the brain in the credit along the bottom, which
is an emoji and keeps its own colours; greyscaling it turned it into a smudge
at that size, and 30% opacity is what keeps it quiet instead.

React Flow's own corner badge is turned off and replaced by that credit, which
still names the library and still links to it. It takes no pointer events, so
it never swallows a click meant for a card underneath, apart from the link.

### Names on cards

A name wraps onto a second line rather than being cut short with an ellipsis.
Somebody's name is the one thing on a card that should never have to be
guessed at from half of it, so the card is 86px tall to hold two lines, and
past about forty characters the type steps down a size, then down again, so a
long name still arrives whole.

The step is chosen by counting characters, not by measuring text. That matters
more than it looks: **every card is the same size whatever is written on it**,
and React Flow is told those dimensions rather than measuring the card itself.
A card whose real height disagreed with the height it was declared to have
would put its four drag handles in the wrong place. Measuring text would also
need the web font to have loaded first, and would be wrong until it had.

`overflow-wrap: anywhere` covers the name that is one long word with nowhere
to break. The clipping backstop sits on `.card-top` and not on `.card`,
because the handles sit twelve pixels outside the card's edge and clipping
there would cut them off.

### Two shapes for two jobs

A **tray** along the bottom (`.bar`) asks something short, where the whole
question fits on one line and the answer is a button. The confirmation before
anything replaces a family is one.

A **dialog** (`.sheet`, over a `.sheet-back` scrim) is for a document. Copy
and Paste both open one: a whole family as JSON wants room to read in, so the
dialog is a fixed `min(900px, 90vh)` tall by `min(520px, 100%)` wide, with
the text scrolling inside it rather than a box that grows until it runs out of
window. Narrow and tall on purpose: the JSON is deeply indented but its lines
are short, so width past about 40 monospace characters buys nothing and only
costs height. It closes on Escape,
on a click on the backdrop, and on its own button. Nothing behind it can be
clicked while it is up, which is checked rather than assumed.

Two details worth keeping if this is ever rewritten. The middle grid row is
`minmax(0, 1fr)` and not `1fr`, because a grid row will not shrink below the
content it holds, and the textarea would otherwise push the buttons off the
bottom of a short window instead of scrolling. And the backdrop closes on
`mousedown` with a target check, not on `click`, so selecting the JSON and
releasing the mouse outside the box does not dismiss it mid-copy.

Spacing is one scale, `--sp-1` through `--sp-5` in multiples of four. Panel
sections share a single rhythm rule rather than a margin per component: a
label sits `--sp-2` from what it labels, separate things stand `--sp-3` apart,
and two paragraphs in a row stay tight.

## Known gaps

- No GEDCOM import yet. The union model is already the right shape for it.
- A date is a year, or a whole day. Real genealogy also needs ranges and
  qualifiers: about, before, after.
- Edges carry no kind, so adoptive, step and foster read as birth relations,
  although a step-parent by marriage is named correctly.
- Reach runs out in a family deeper than about seven generations. See **How
  far it reaches**: no affordable budget names everybody in a nine generation
  clan, because the search walks simple paths and the work grows
  exponentially with depth. A shortest-path search would not have this limit,
  but it would also not find the several different ways two people can be
  related, which is the thing this app is for.
- The Tamil set has a word of its own only as far as the great-grandparents
  and great-grandchildren. One generation further and it composes, and a
  composed term is never written in, so those people stay in English.
- A loaded word is indistinguishable from one you typed, so clearing takes
  both. That is the cost of keeping words as plain text in the file.
- A set fills one viewpoint. Switch whose view you are in and the English
  words are back until you load again from there.
- Cards can be dragged, but a structural change relays the whole family and
  those nudges are lost.
- Two people on separate islands are drawn on the same row, because there is
  nothing in the data that says how their generations line up.
- Adding a partner to somebody who already has children on their own puts
  that partner in with those children, since that is nearly always who is
  meant. For a step-parent, add the partner first and keep the children in
  their own union.
- Tapping a card's plus on a touch screen has not been tried on real
  hardware, only in a headless browser.
- The exit warning cannot be relied on. See **Leaving the page**.
- The drag-to-link checks fail together in roughly one browser run in ten.
  React Flow never starts the connection: neither `onConnect` nor
  `onConnectEnd` is invoked, so the press is ignored rather than the drop
  misread. It is sticky within a page load, and the same gesture on a fresh
  page passed 20 times out of 20, so it is accumulated state from earlier in
  the run. Never reproduced with a real pointer, and a real pointer cannot
  produce this event shape. The check retries the gesture; the long comment
  beside it records everything ruled out.
- The content security policy is on the standalone page only, not on
  `page.html`, because the artifact viewer injects a runtime of its own that a
  policy built from this bundle's hash would block.
