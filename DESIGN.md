---
name: RepoLens
description: Answers about code, with checked citations, drawn as a transit line map.
colors:
  signal: "#FFD400"
  signal-soft: "#FFF3B0"
  signal-deep: "#F2C800"
  ground: "#FFFFFF"
  wash: "#F3F4F5"
  sunk: "#E9EBED"
  rule: "#D9DCDF"
  rule-strong: "#9BA1A8"
  ink: "#15171A"
  ink-2: "#2C3036"
  sub: "#555B63"
  faint: "#6B717A"
  line-blue: "#0A5FD9"
  line-red: "#E2231A"
  line-green: "#007A41"
  line-orange: "#B84E00"
  line-violet: "#7A3DB8"
  line-teal: "#00788A"
  line-blue-soft: "#E6EFFC"
  line-red-soft: "#FDEBEA"
  line-green-soft: "#E3F3EA"
  line-orange-soft: "#FBEDE0"
  line-violet-soft: "#F1E9F9"
  line-teal-soft: "#E0F1F3"
typography:
  display:
    fontFamily: "Overpass, Segoe UI, Helvetica Neue, Arial, sans-serif"
    fontSize: "3.25rem"
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Overpass, Segoe UI, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Overpass, Segoe UI, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.5
  body:
    fontFamily: "Overpass, Segoe UI, Helvetica Neue, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Overpass, Segoe UI, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.25
  code:
    fontFamily: "Overpass Mono, Consolas, Menlo, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: "1.5rem"
rounded:
  sm: "2px"
  DEFAULT: "4px"
  full: "9999px"
spacing:
  gutter: "16px"
  gutter-wide: "32px"
  control-gap: "12px"
  row: "12px"
  section: "56px"
components:
  nav-band:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.ink}"
    height: "56px"
  button:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.DEFAULT}"
    padding: "0 16px"
    height: "40px"
  button-hover:
    backgroundColor: "{colors.wash}"
  button-active:
    backgroundColor: "{colors.sunk}"
  button-disabled:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.faint}"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    rounded: "{rounded.DEFAULT}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.ink-2}"
  button-sm:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.DEFAULT}"
    padding: "0 10px"
    height: "32px"
  button-icon:
    textColor: "{colors.sub}"
    rounded: "{rounded.DEFAULT}"
    size: "32px"
  button-icon-hover:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.ink}"
  field:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.DEFAULT}"
    padding: "0 12px"
    height: "40px"
  tab:
    textColor: "{colors.sub}"
    padding: "0 4px"
    height: "40px"
  tab-selected:
    textColor: "{colors.ink}"
  tag:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: "0 6px"
    height: "20px"
  kbd:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: "0 4px"
    height: "20px"
  cite:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "1px 6px 1px 1px"
  cite-hover:
    backgroundColor: "{colors.signal-soft}"
  cite-current:
    backgroundColor: "{colors.signal}"
  roundel:
    backgroundColor: "{colors.line-blue}"
    textColor: "{colors.ground}"
    rounded: "{rounded.full}"
    size: "20px"
  roundel-now:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    size: "20px"
  note-error:
    backgroundColor: "{colors.line-red-soft}"
    rounded: "{rounded.DEFAULT}"
    padding: "8px 12px"
  note-ok:
    backgroundColor: "{colors.line-green-soft}"
    rounded: "{rounded.DEFAULT}"
    padding: "8px 12px"
  note-warn:
    backgroundColor: "{colors.signal-soft}"
    rounded: "{rounded.DEFAULT}"
    padding: "8px 12px"
---

# Design System: RepoLens

## Overview

**Creative North Star: "Line Map"**

RepoLens is drawn as transit wayfinding. An answer is a route, each cited span is a numbered station, and each file is a line with its own colour. The reader rides the route from the sentence to the source. The surface is a white ground with ink type, a signal-yellow band across the top, heavy ink rules above tables, and round station markers; everything else is hairlines and plain text.

The system is light only and flat. Depth is carried by rules and tinted grounds, not by shadow. Density changes by surface: the home and benchmarks pages are open reading pages inside a wide container, the workspace is a full-height three-pane tool. Diagrams are drawn from data: the four-stop indexing line reflects real status, and the bar beside a citation is as long as the span it stands for.

The earlier dark graphite, all-monospace look is retired and is the one confirmed anti-reference: no near-black screens, no tracked uppercase monospace labels, no grids of bordered cells.

**Key Characteristics:**
- White ground, ink text, one signal-yellow band.
- Yellow marks position: the band, the cited lines, the current station.
- Six line colours, assigned per file in order of first appearance.
- Citations are numbered stations; tables are departure boards.
- Small corners, flat resting surfaces, a shadow only under overlays.
- Monospace for code and data only; labels are sentence case.

## Colors

A signage palette: black on white, one loud yellow, and six saturated line colours that each hold white text.

### Primary
- **Signal Yellow** (`signal`): the sticky top band, text selection, the line-number gutter of cited code lines, the current citation chip, the current station on a route or indexing line, and the centre of the brand mark. It is also the browser theme colour.
- **Highlighter** (`signal-soft`): the stroke behind cited code lines, the hover ground of a citation, the ground of the active route stop, and the ground of warning notes.
- **Signal Deep** (`signal-deep`): defined as a token for a darker step of the band; not yet relied on by a shared component.

### Secondary
- **Line Blue**, **Line Red**, **Line Green**, **Line Orange**, **Line Violet**, **Line Teal** (`line-*`): the six line colours, in that fixed order. In a route each distinct file takes the next colour, so the first file cited is always blue and the second red. All six carry white text at 4.5:1 or better. Outside routes they act as data series, as category tints on language and symbol tags, and as state: green for done and checked, red for failed.
- **Soft line tints** (`line-*-soft`): the ground behind a coloured tag or an error or success note. Line Blue's tint also marks search matches in the code viewer.

### Neutral
- **Ground** (`ground`): every page and pane background.
- **Wash** (`wash`): hover grounds, the file-explorer pane, the workspace status strip, disabled controls.
- **Sunk** (`sunk`): pressed buttons and loading skeletons.
- **Rule** (`rule`): hairlines between rows and panes; the default border colour.
- **Rule Strong** (`rule-strong`): outlines of fields, tags, key hints and citations at rest; disabled outlines.
- **Ink** (`ink`): text, heavy rules, button outlines, the focus outline, the primary button.
- **Ink 2** (`ink-2`): long-form paragraph text and the primary button's hover.
- **Sub** (`sub`): secondary text, table headers, inactive tabs.
- **Faint** (`faint`): placeholders, disabled text, code line numbers.

### Named Rules
**The You Are Here Rule.** Solid Signal Yellow means position: the band you are under, the lines you were sent to, the station being worked on. Do not spend it on decoration or on a call to action; the primary button is ink.

**The First Appearance Rule.** Line colours in a route are never chosen by hand. Each distinct file takes the next colour in the fixed order blue, red, green, orange, violet, teal, wrapping after six.

**The Colour Is Not Alone Rule.** A line colour always travels with a number, a file path, or a word ("checked", "Failed"). State is never told by hue only.

## Typography

**Display Font:** Overpass (with Segoe UI, Helvetica Neue, Arial, sans-serif)
**Body Font:** Overpass (same stack)
**Label/Mono Font:** Overpass Mono (with Consolas, Menlo, monospace)

**Character:** One signage family in two cuts. Overpass carries every word of interface at heavy weights for headings and regular for reading; Overpass Mono appears only where the content is code or data.

### Hierarchy
- **Display** (800, 3.25rem, line-height 1.02, tracking -0.025em; 2.5rem below 640px): the one page heading on home and benchmarks, held to about 18 characters per line.
- **Headline** (800, 1.5rem, tracking -0.01em): section headings such as Workspaces, and the sample question.
- **Title** (700, 1.125rem): empty-state headings, modal titles, the workspace name, the wordmark sits one step up at 1.25rem/800.
- **Body** (400, 1rem, line-height 1.5): reading text in Ink 2, capped at 62ch. The lead paragraph steps up to 1.125rem with relaxed leading. Dense panes use 0.875rem.
- **Label** (600, 0.8125rem, sentence case, no tracking): table headers, captions, small status words. Tags and key hints go down to 0.75rem and 0.6875rem.
- **Code** (Overpass Mono 400, 0.8125rem on a fixed 1.5rem line): source text. Mono at 600 is used for file paths, citation chips and measured figures.

### Named Rules
**The Data Only Rule.** Monospace is for code, file paths, branch names, commit hashes, key hints and numerals in tables. Navigation, buttons, headings and prose are never monospace.

**The Sentence Case Rule.** Labels are written in sentence case at normal tracking. No uppercase, no letter-spaced small caps; hierarchy comes from weight and size.

**The Tabular Rule.** Numbers that are compared sit right-aligned in tabular figures.

## Layout

Reading pages (home, benchmarks) centre a single container (max 84rem) with 16px side gutters, 32px from 640px up. The band uses the same container, so the wordmark aligns with page content. The home page opens as two columns from 1024px: a fluid left column and a fixed 26.5rem right column separated by a 3px ink rule; below that the right column drops under the left and its rule moves to the top edge. Sections are separated by space (about 56 to 64px), not by boxes. Prose is capped at 62ch.

The workspace is a full-viewport tool with no page scroll: the band, a 44px bordered title row, then three panes (a 240px file explorer on Wash, a fluid code viewer, a 410px chat pane) and a 28px status strip. Panes are divided by single hairlines.

Tables collapse to a ruled list below 768px: one item per row, the same heavy top rule, the indexing line kept with its status in words.

Control heights are 40px by default and 32px in toolbars and dense panes; the band's own controls are 36px. Common gaps are 12px between sibling controls and 12px row padding in boards.

## Elevation & Depth

Flat. Resting surfaces have no shadow, no gradient and no blur. Layers are told apart by rules (a hairline between rows and panes, a 3px ink rule above a table or beside a column) and by a tinted ground (Wash, Sunk, a soft line tint).

### Shadow Vocabulary
- **Overlay** (`box-shadow: 0 18px 48px -12px rgba(21, 23, 26, 0.32), 0 2px 6px rgba(21, 23, 26, 0.12)`): modal dialogs only (search, repository import), which also carry a 2px ink outline and sit on a 40% ink scrim.

### Named Rules
**The Only Overlays Float Rule.** A shadow means the surface is above the page and will go away. Nothing that stays on the page gets one.

## Shapes

Corners are small and consistent: 4px on buttons, fields, notes and dialogs; 2px on tags, key hints, citation chips and skeletons. Full circles are reserved for things that are stations or line strokes: the citation roundel, the indexing stops, the brand mark, the connector between stops, and the span-length bar. Outlines do the work that fills do elsewhere: 2px ink on default buttons and dialogs, 1px Rule Strong on fields and small labels. The heavy rule (3px ink) is the signature stroke; it tops every board, marks the selected tab, and divides the home page's two columns.

**The Round Means Station Rule.** A full radius is a station or a line. Labels, buttons and inputs are never pills.

## Components

### Buttons
Signage plates: outlined, heavy type, one shape everywhere.
- **Shape:** small corners (4px), 40px tall, 16px side padding, bold 0.9375rem label. The home page's lead actions are 44px tall.
- **Default:** white ground, 2px ink outline, ink text. Hover Wash, pressed Sunk.
- **Primary:** ink ground, white text. Hover Ink 2, pressed black. One per group.
- **Small:** 32px tall, 1px outline, semibold 0.875rem; for toolbars and dense panes.
- **Icon:** 32px square, no outline at rest, Sub icon; Wash ground and ink on hover; ink outline when pressed-on. Always carries an accessible name.
- **Disabled:** Wash ground, Rule Strong outline, Faint text.
- **Focus:** the global 2px ink outline, offset 2px. Colour transitions run 150ms.

### Tags and key hints
- **Tag:** 20px tall, 2px corners, 1px Rule Strong outline, white ground, semibold 0.75rem. Language and symbol-kind tags swap in a line colour for text, its soft tint for ground, and the same colour at 40% for the outline.
- **Key hint:** the same box in Overpass Mono at 0.6875rem.

### Boards (tables)
A departure board: a 3px ink rule on top, a 1px ink rule under the header row, hairlines between rows, no outer box and no zebra. Headers are semibold 0.8125rem in Sub. Rows are 12px padded and take a Wash ground on hover. Numeric columns are right-aligned mono tabular figures. Loading, empty and error states keep the heavy top rule so the board's position does not jump.

### Inputs / Fields
- **Style:** white ground, 1px Rule Strong outline, 4px corners, 40px tall (32px small), Faint placeholder.
- **Hover:** ink outline.
- **Focus:** ink outline plus a 2px Signal Yellow ring.
- **Disabled:** Wash ground, Faint text.

### Tabs
Text tabs, 40px tall, semibold 0.875rem in Sub, with a transparent 3px bottom bar that turns ink when selected. Counts follow the label in regular weight.

### Navigation
A sticky Signal Yellow band, 56px tall, ink text. Left: the brand mark (an ink disc with a yellow centre) and the wordmark, which hides below 640px. Links are bold 0.9375rem; the current page carries a 4px ink bar on the band's bottom edge, hover shows the same bar at 30%. Right: a workspace select (from 768px) and a search button, both white plates with 2px ink outlines, 36px tall; the search label and its key hint hide below 640px.

### Notes
Inline messages with a full 1px outline, a tinted ground and 4px corners: red for errors, green for success, Highlighter with a dark-yellow outline for warnings. Text is a darkened step of the same hue. No side stripe.

### Citation chip
An inline chip in running text: 2px corners, 1px Rule Strong outline, mono semibold 0.75rem, holding a solid roundel and the file with its lines. Hover turns the ground to Highlighter and the outline to ink; the citation currently open in the code viewer sits on solid Signal Yellow.

### Roundel
A 20px circle with an extra-bold 0.6875rem numeral in Overpass. Three states: solid (line-colour fill, white numeral) for citations in text; ring (white fill, 3px line-colour border) for stops on a route; now (Signal Yellow fill, 3px ink border) for the stop in view.

### Route
An ordered list of stops. Each stop is a ring roundel, the file path in mono semibold, and the line range in Sub, followed by a 4px rounded bar whose length is 2px per cited line (minimum 4px, maximum 72px). A 6px rounded connector in the stop's line colour runs down to the next stop. The selected stop becomes the now roundel on a Highlighter ground; other stops take a Wash ground on hover.

### Indexing line
Four stops, Clone, Parse, Embed, Ready, 56px apart on a 4px grey track. Completed stops and the track behind them are solid Line Green; the stop in progress is Signal Yellow with an ink outline and pulses (opacity 1 to 0.35 over 1.6s); pending stops are white with a grey ring. On failure the first stop takes a red ring and the word "Failed" is printed beside it. The stop names are printed once, in the board's header, not on every row.

### Code lines
Mono 0.8125rem on a 1.5rem line with a 3.5rem right-aligned number gutter in Faint. Hover gives the row a Wash ground and the number ink. Cited lines sit on Highlighter with their numbers on solid Signal Yellow in semibold. Search matches sit on the blue soft tint.

### Loading
Skeleton bars in Sunk with 2px corners and a slow pulse, laid out in the shape of the content they stand for. All animation and transition collapses under reduced-motion.

## Do's and Don'ts

### Do:
- **Do** keep the ground white and text ink; let the yellow band be the only large field of colour.
- **Do** assign line colours with the first-appearance order (blue, red, green, orange, violet, teal) and pair every colour with a number or a word.
- **Do** top every table and list-as-table with the 3px ink rule and separate rows with hairlines.
- **Do** show a citation as a numbered roundel, and make its marker length follow the number of lines cited.
- **Do** use 4px corners on controls and containers, 2px on small labels, and full circles only for stations and line strokes.
- **Do** set compared numbers in right-aligned mono tabular figures.
- **Do** keep the 2px ink focus outline visible on every interactive element.

### Don't:
- **Don't** put a shadow on anything that rests on the page; only modal overlays float.
- **Don't** use solid Signal Yellow for buttons, badges or decoration; it means "you are here".
- **Don't** set interface labels, navigation or prose in monospace.
- **Don't** write labels in uppercase or with added letter-spacing.
- **Don't** make tags, buttons or inputs pill-shaped.
- **Don't** mark a note or a card with a coloured stripe down one side; use the full outline and tinted ground.
- **Don't** return to the retired dark graphite, all-monospace look.
- **Don't** pick a line colour by taste for a file in a route, or use hue as the only signal of state.
