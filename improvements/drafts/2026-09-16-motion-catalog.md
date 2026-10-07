# yui540 CSS Animation Catalog — motion sourcing for the i³ Awards site

**Source:** https://github.com/yui540/css-animations
**License:** MIT © yui540. Code harvested below may ship in our product **with attribution**. Keep a line like
`Motion techniques adapted from yui540/css-animations (MIT).` in the repo LICENSE/NOTICE and near the motion CSS.

**Scope note:** everything here was read from the **MIT GitHub repo only** (`gh api repos/yui540/css-animations/...`).
The `yui540.com/motions` website asks for no reposting and no AI-training use, so nothing was taken from it — no code,
no copy, no screenshots. Where a technique overlaps with something on that site, the description below is written
from the repo source in my own words.

**Corpus:** 12 dated folders, 38 HTML files + 5 animated SVGs → **45 distinct demos** catalogued.
Names are mine (the source is Japanese; folder READMEs are just video links, so there is no English name to translate
except the two 2025 ones).

**Cost legend**
- `cheap` — animates only `transform` / `opacity` (compositor-only, no reflow, no repaint)
- `paint` — animates `clip-path`, `border-radius`, `box-shadow`, `stroke-*`, `background-color` (repaint, no reflow)
- `layout` — animates `width`, `height`, `top`, `left`, `bottom` (reflow every frame; must be rewritten before shipping)

---

## 1. Summary table — all 45 demos

| id | name | effect | cost | loops |
|---|---|---|---|---|
| `2025-02-25/index.html#transition-1` | Two-Tone Wipe | Two full-bleed panels sweep across L→R one behind the other, 0.2s apart, then sweep off the same way | cheap | one-shot |
| `2025-02-25/index.html#transition-2` | Skewed Curtain Wipe | Same two-panel sweep but the leading edge is raked diagonally | paint | one-shot |
| `2025-02-25/index.html#transition-3` | Chevron Wipe | Same sweep with a pointed arrowhead leading edge that spears across the frame | paint | one-shot |
| `2025-02-25/index.html#transition-4` | Shuffled Band Wipe | Frame split into 5 horizontal bands, each wiping on its own out-of-order delay | cheap | one-shot |
| `2025-03-11/loading-1.svg` | Wordmark Squash | Letters of a word squash-and-stretch in a reverse-order ripple; trailing dots slide apart | cheap | infinite |
| `2025-03-11/loading-2.svg` | Double Pulse | Two discs expand from nothing and fade out, offset by half a cycle | cheap | infinite |
| `2025-03-11/loading-3.svg` | Waveform Bars | A row of thin bars scales vertically in a travelling wave, with a fast jitter layered on top, plus a 3-dot ellipsis | cheap | infinite |
| `2025-03-11/loading-4.svg` | Hourglass Turn | A masked hourglass flips a half-turn while the fill drains from the top chamber into the bottom | cheap | infinite |
| `2025-03-11/loading-5.svg` | Pill Loader | A bar slides inside a rounded outline while the label glyphs pop in sequence | cheap | infinite |
| `2026-04-17/tips-1.html` | Overshoot Pop | A disc scales from nothing, overshoots past full size, undershoots, settles | cheap | one-shot |
| `2026-04-17/tips-2.html` | Page Turn | A panel slides up from the lower-left while its top-right corner unrolls flat; the glyph on it grows from a squashed line | paint | one-shot |
| `2026-04-17/tips-3.html` | Tumble | A rounded square tips 90° over its bottom-right corner, lands one cell right, and rocks to rest | cheap | one-shot |
| `2026-04-17/tips-4.html` | Hard Stop | A tile flies in from off-frame, tips forward under braking, then wobbles back upright | cheap | one-shot |
| `2026-04-18/tips-1.html` | Stack Settle | Three stacked shapes each rock through a decaying left-right sway on their own timing | cheap | one-shot |
| `2026-04-18/tips-2.html` | Domino Fall | Four uprights topple in sequence, each overshooting and rocking back | cheap | one-shot |
| `2026-04-18/tips-3.html` | Pendulum Drop | A pill on a stem falls in, swings hard, and settles through a damped arc on three nested axes | cheap | one-shot |
| `2026-04-18/tips-4.html` | Stomp Bounce | A slab lands on a second slab, which compresses under the impact and springs back | layout | one-shot |
| `2026-04-22/tips-1.html` | Shutter Roll | Four slats grow from a closed stack to fill the frame, then retract | layout | one-shot |
| `2026-04-22/tips-2.html` | Stage Curtain | Two halves swing in from the wings, meeting at centre with a cast shadow, then part again | paint | one-shot |
| `2026-04-22/tips-3.html` | Batten Drop | Four tall rounded columns drop in on a left-to-right stagger, hold, then drop out the bottom | cheap | one-shot |
| `2026-04-22/tips-4.html` | Woven Grid | Two crossed 5-bar grids grow from zero height in shuffled order, weaving a lattice, then unweave | cheap | one-shot |
| `2026-04-25/tips-1.html` | Scroll Unfurl | A roller travels left paying out a line while title characters rise into place one by one, then re-rolls | cheap | one-shot |
| `2026-04-25/tips-2.html` | Brick Drop | Five slabs fall in from above in shuffled order, bounce to rest, then drop out of frame and fade | cheap | one-shot |
| `2026-04-25/tips-3.html` | Turn-Over Swap | A tile rotates 90° about its corner and the z-order flips mid-turn, so it lands showing the opposite face | cheap | one-shot |
| `2026-04-25/tips-4.html` | Ripple | Two discs expand outward and fade, offset by a beat | cheap | infinite |
| `2026-04-29/tips-1.html` | Scribble | A zig-zag stroke draws itself on, thickening as it goes, then unwinds off the far end | paint | one-shot |
| `2026-04-29/tips-2.html` | Pull Cord Flip | A hanging cord is tugged, sways, and the panel above flips a half turn with a bounce | cheap | one-shot |
| `2026-04-29/tips-3.html` | Fold to Square | Three nested rounded bars each pivot 90° about a different corner in sequence, folding a single line into a closed square, then unfolding | cheap | one-shot |
| `2026-04-29/tips-4.html` | Hop Chain | Three dots squash, launch in an arc to a new slot, and squash on landing, in a chain | layout | one-shot |
| `2026-05-02/tips-1.html` | Expand / Collapse Arrows | A double-headed arrow stretches past its length and recoils; a facing pair does the inverse | layout | one-shot |
| `2026-05-02/tips-2.html` | Swing and Squash | A bar swings on a pivot, strikes a ball, and the ball flattens and rebounds as it travels | layout | one-shot |
| `2026-05-02/tips-3.html` | Download / Bar Chart | A download glyph's arrow dips into its tray; a 3-bar chart swaps its tallest and shortest bar | layout | one-shot |
| `2026-05-02/tips-4.html` | Orbit | Nested rings rotate at different rates with a body orbiting the outer ring | cheap | infinite |
| `2026-05-14/tips-1.html` | Tissue Pull | A sheet is pulled up out of a box, tears free and flies off as the next sheet rises | layout | infinite |
| `2026-05-14/tips-2.html` | Zipper | A slider runs up a seam; the two panels close behind it via a corner radius collapsing to flat | layout | infinite |
| `2026-05-14/tips-3.html` | Roll and Squash | A rounded square rolls 90° onto its neighbour, which squashes and recovers | layout | infinite |
| `2026-05-14/tips-4.html` | Headphones On | A band lowers onto a rounded head shape, widening and narrowing as it seats | layout | infinite |
| `2026-06-07/tips-1.html` | Burst Particles | A filled heart pops in over an expanding ring while ten dots fire out radially and pop away | cheap | one-shot |
| `2026-06-07/tips-2.html` | Floating Copies | Copies of the mark drift upward and outward on individual vectors, fading, as a ring pulses out | cheap | one-shot |
| `2026-06-07/tips-3.html` | Ray Burst | Two rotated four-arm crosses of masked bars shoot out and past the mark on staggered delays | cheap | one-shot |
| `2026-06-08/tips-1.html` | Card Drop Stack | Three cards fall in flat-to-upright in perspective, stack, then the top one is flicked up out of frame | cheap | one-shot |
| `2026-06-08/tips-2.html` | Panel Stack Sweep | Three panels enter from the left with a rounding corner that flattens, hold, then exit right; a raked highlight sweeps across | paint | one-shot |
| `2026-06-08/tips-3.html` | Pager Swap | The current mark exits left as the next enters from the right, with a squash on landing | layout | one-shot |
| `2026-06-09/tips-1.html` | Walking Cat | A cat walks in over a shadow line, bobs, ears and eyes react, tail wags, then walks back out | layout | one-shot |
| `2026-06-09/tips-2.html` | Cat and Flower | A stem grows, leaves pop, a bloom opens, and a seated cat breathes, stretches and reacts | layout | one-shot |

---

## 2. Technique details

Key `@keyframes` reproduced verbatim from the MIT repo. Boilerplate (the demo's `.container` centring wrapper,
`transform: scale(3.4)` zoom wrappers, `@import` of Google Fonts) is demo framing, not part of any effect — drop it.

### 2025-02-25 — four page transitions (one file, four independent overlays)

All four use the same chassis: a full-bleed `position:absolute; inset:0` overlay whose `::before` and `::after` are
two coloured sheets running the *same* pair of keyframes with a **0.2s offset between the two layers** and a second
`animation-delay` for the exit leg. That double-layer offset is what makes a plain wipe read as expensive.

```css
&::before { animation-delay: calc(0s   + var(--delay,0s)), calc(1.4s + var(--delay,0s)); }
&::after  { animation-delay: calc(0.2s + var(--delay,0s)), calc(1.2s + var(--delay,0s)); }
```

**#transition-1 — Two-Tone Wipe** — `translateX` only. The cheapest thing in the whole repo.
```css
@keyframes slideIn  { from { transform: translateX(-101%);} to { transform: translateX(0);} }
@keyframes slideOut { from { transform: translateX(0);}     to { transform: translateX(101%);} }
```
(`101%` not `100%` — deliberate, kills the sub-pixel seam.)

**#transition-2 — Skewed Curtain Wipe** — same motion driven by a 4-point `clip-path` whose top edge leads the bottom
edge by `--skew-x`, so the wipe arrives raked.
```css
@keyframes maskIn {
  from { clip-path: polygon(0 0, 0 0, calc(var(--skew-x,0) * -1) 100%, calc(var(--skew-x,0) * -1) 100%); }
  to   { clip-path: polygon(0 0, calc(100% + var(--skew-x,0)) 0, 100% 100%, calc(var(--skew-x,0) * -1) 100%); }
}
```

**#transition-3 — Chevron Wipe** — 6-point `clip-path`; `--sharpness` pushes the mid-height vertex out past the edge
to make an arrowhead. Same in/out structure as #2.

**#transition-4 — Shuffled Band Wipe** — `grid-template-rows: repeat(5, 1fr)`, each band gets `--d` and runs
`slideIn/slideOut`. The delays are **deliberately out of DOM order** (`0.1s, 0.3s, 0s, 0.4s, 0.2s`) so it reads as
organic rather than as a sweep. Steal that trick.

### 2025-03-11 — five SVG loaders

**loading-1 — Wordmark Squash** — each glyph is a `<path class="text">` with `transform-box: fill-box;
transform-origin: bottom center`, all running one keyframe, staggered **backwards** (`nth-child(7)` at `0s`,
`nth-child(1)` at `0.36s`) so the ripple travels right-to-left.
```css
@keyframes scale {
  0% { transform: scale(1); }  19.8% { transform: scale(1.45, 0.7); }
  39.6% { transform: scale(0.8, 1.4); }  52.8% { transform: scale(1.2, 0.7); }
  66%, 100% { transform: scale(1); }
}
```
`transform-box: fill-box` is the load-bearing line — without it SVG transform-origin resolves against the viewBox.

**loading-2 — Double Pulse** — the whole loader is one keyframe on two circles, `animation-delay: 0s` / `0.5s`.
```css
@keyframes fadeInOut { from { opacity: 1; transform: scale(0);} to { opacity: 0; transform: scale(1);} }
```

**loading-3 — Waveform Bars** — two nested scales on a wrapper/child pair: a slow 1.1s `outerWave` whose peak height
is per-bar (`--scale-y` from 2.25 to 5 via `nth-child(2n/3n/4n/5n/6n/10n)`) and a fast 0.15s `innerWave` jitter on the
inner element. Compound scaling from two elements is why it looks alive rather than metronomic.
```css
@keyframes outerWave { from, 30%, to { transform: scaleY(1);} 15% { transform: scaleY(var(--scale-y)); } }
@keyframes innerWave { from, to { transform: scaleY(1);} 50% { transform: scaleY(1.5); } }
```
*Source bug:* `.line-wrapper:nth-child(6n) { animation-delay: 1.2; }` — no unit, so that rule is dropped and those
bars run at `0s`. Fix to `1.2s` if adopted.

**loading-4 — Hourglass Turn** — `rotate(0.5turn)` on the wrapper with a back-eased curve, plus two `<mask>`ed rects
translating 9px in opposite directions and a 1.5px rect drawing the falling stream. Orange `#F4AD60` — recolour.
*Source bug:* `transform-box: 12px 12px` is invalid (the property takes keywords).

**loading-5 — Pill Loader** — `translateX` on a bar inside a stroked pill + the loading-1 glyph stagger at
`scale(1.2, 1.6)`.

### 2026-04-17

**tips-1 — Overshoot Pop.** The canonical entrance. Note opacity and transform are declared as *separate keyframe
tracks in one block* — a yui540 habit that appears throughout and keeps the two on independent curves.
```css
@keyframes popup {
  from { opacity: 0; } 20%, to { opacity: 1; }
  from { transform: scale(0, 0); } 50% { transform: scale(1.2, 1.25); }
  75% { transform: scale(0.9, 0.95); } to { transform: scale(1, 1); }
}
```

**tips-2 — Page Turn.** Three animations on two elements: the panel translates up from off-corner while its top-right
`border-radius` unrolls from a full quarter-circle to square, and the glyph grows from a flattened line with
`transform-origin: bottom center`. The radius runs ~2× longer than the slide, so the corner is still settling after
the panel lands.
```css
@keyframes translate      { from { transform: translate(-51%, 101%); opacity: 0; } to { transform: translate(0,0); opacity: 1; } }
@keyframes border-radius  { from { border-radius: 0 100% 0 0; } to { border-radius: 0 0 0 0; } }
@keyframes scale          { from { transform: scale(1.4, 0); } to { transform: scale(1, 1); } }
```

**tips-3 — Tumble.** `transform-origin: right bottom`, rotate to 90°, then a **hard cut at `50.1%`** that swaps the
rotation for a `translateX(100%)` — the element teleports to the landed position at the exact frame the corner-pivot
would have put it there, then rocks.
```css
@keyframes rolling {
  0% { transform: rotate(0deg); } 50% { transform: rotate(90deg); }
  50.1% { transform: translateX(100%); } 75% { transform: translateX(100%) rotate(8deg); }
  100% { transform: translateX(100%); }
}
```

**tips-4 — Hard Stop.** Three chained animations: a decelerating `translate`, a tiny tip-forward, then a 4-stop
damped `rotate` back to zero (`-18 → 0 → -2 → 0 → -1 → 0`). Uses the standalone `translate:` / `rotate:` properties
rather than `transform`, so the three can run concurrently without fighting.

### 2026-04-18

**tips-1 — Stack Settle.** Three elements, each with a two-part chain: a 0.5–0.7s lean *out*, then a 1.2s
`50% / 75% / to` decay back. Durations differ per element (0.7 / 0.6 / 0.5s), so the stack desynchronises on its own.

**tips-2 — Domino Fall.** `transform-origin: right bottom`, four `fall-down-N` keyframes staggered 0.1s apart. The
detail that sells it: each domino stops at a *different* final angle (`60 / 61 / 66 / 90deg`) because it lands on the
one in front — the last has nothing to lean on and goes flat. Each also backs off at 80% before settling.
```css
@keyframes fall-down-1 { from { transform: rotate(0);} 60% { transform: rotate(60deg);} 80% { transform: rotate(55deg);} to { transform: rotate(60deg);} }
```

**tips-3 — Pendulum Drop.** Three nested elements carrying `translate-x`, `translate-y` and `shake` (rotate) all at
`0.84s ease-in-out` with matching `40% / 70%` inflection points — decomposing one complex arc into three simple
tracks on separate wrappers.

**tips-4 — Stomp Bounce.** `jump` is cheap, but the impact is `@keyframes push { from { height: 0 } 60% { height: 48px } to { height: 40px } }` — **layout**. Rewrite as `scaleY` with `transform-origin: bottom`.

### 2026-04-22

**tips-1 — Shutter Roll.** Four slats with `--delay` 0.2/0.25/0.3/0.35s, each animating `height` 15px → 75px → 73px
and back. Good look, **layout-thrashing** implementation: four simultaneous height animations reflow the column every
frame. Reproduce with `scaleY` + `transform-origin: top`.

**tips-2 — Stage Curtain.** The best "reveal" primitive in the repo. Each half is `height: 150%` (so the rotation
never exposes the bottom edge), pivots about `left top` / `right top` — mirrored via `transform: scaleX(-1)` on the
right half so a single keyframe drives both — and deepens a `box-shadow` as it closes. Halves are offset 0.15s.
```css
@keyframes close {
  from, to { transform-origin: left top; }
  from { box-shadow: -10px -10px 16px rgba(0,0,0,0); }
  50%, to { box-shadow: -60px -15px 16px rgba(0,0,0,0.1); }
  from { transform: translateX(101%) rotate(-25deg); }
  to   { transform: translateX(0%) rotate(0deg); }
}
```
The `rotate(-25deg)` paired with the translate is what makes it read as fabric swinging rather than a panel sliding.

**tips-3 — Batten Drop.** Four full-height rounded columns, `--delay` 0.2/0.36/0.52/0.68s, pure `translateY(-101%) → 0`
then `→ 101%`. Every other column is `scaleY(-1)` so the rounded caps alternate. Cheap, precise, monochrome-native.
This same masked-column translate is the **rolling-digit mechanism** — see §3.8.
```css
@keyframes slide-in  { from { transform: translateY(-101%);} to { transform: translateY(0);} }
@keyframes slide-out { from { transform: translateY(0);}     to { transform: translateY(101%);} }
```

**tips-4 — Woven Grid.** Two 5-row grids, the second `rotate(90deg)`, each bar `scaleY(0) → 1` then back, on **shuffled**
per-child delays (grid A: 2nd,4th,1st,5th,3rd at 0/0.2/0.4/0.6/0.8s; grid B interleaved at 0.1/0.3/0.5/0.7/0.9s) so
the lattice appears to weave itself. `scale-out` fires at `calc(var(--delay) + 1.5s)`.
*(Markup note: the second `.yarns__inner` sits outside `.yarns` in the source — fix when adapting.)*

### 2026-04-25

**tips-1 — Scroll Unfurl.** Four coordinated parts: a line whose `::before` translates out of an `overflow:hidden`
mask; a roller that simultaneously `rotate`s and `translateX(-420%)` so rotation and travel read as rolling; and
per-character title spans on *descending* start delays (0.65 / 0.55 / 0.45 / 0.35s) and *ascending* exit delays, so
letters rise in one direction and leave in the other. Note the exit squash.
```css
@keyframes slide-in  { from { transform: translateY(100%);} 60% { transform: translateY(-8%) scale(0.95,1.15);} to { transform: translateY(0);} }
@keyframes slide-out { from { transform: translateY(0);} to { transform: translateY(100%) scale(1.2,0.6);} }
@keyframes rotate    { from { transform: translateX(0) rotate(180deg);} to { transform: translateX(-420%) rotate(-180deg);} }
```
Also: the whole exit leg is just `animation: draw-line 1s ease-in-out 1.7s reverse forwards` — **`reverse` instead of
a second keyframe block.** Halves the CSS on any in/out pair.

**tips-2 — Brick Drop.** Falls from `translateY(-400%) rotate(30deg)` through a 4-stop settle, shuffled `--delay`.
```css
@keyframes bounce {
  from { opacity: 0; } 20%, to { opacity: 1; }
  0% { transform: translateY(-400%) rotate(30deg); } 60% { transform: rotate(-4deg); }
  70% { transform: translateY(-10%) rotate(2deg); } 80% { transform: rotate(0); }
  90% { transform: translateY(-5%) rotate(-1deg); } 100% { transform: rotate(0); }
}
```

**tips-3 — Turn-Over Swap.** Two stacked tiles; the front one rotates 90° about `right bottom` and **swaps `z-index`
at the midpoint**, so it passes behind its partner and the back face is what lands. One keyframe, run forward then
`reverse` to toggle back. The cleanest state-toggle in the repo and the one that works best without colour.
```css
@keyframes change {
  from, 50%   { z-index: 2; }
  50.1%, to   { z-index: 0; }
  from, to    { transform: rotate(0deg); }
  50%         { transform: rotate(90deg); }
}
/* .plus { animation: change .6s ease-in-out .2s both, change .6s ease-in-out 1.4s reverse forwards; } */
```

**tips-4 — Ripple.** Two pseudo-elements, one keyframe, `animation-delay: 0s / 0.4s`, `infinite`.
```css
@keyframes fade-in-out { from { opacity: 1; transform: scale(0);} 80%, to { opacity: 0; transform: scale(1);} }
```

### 2026-04-29

**tips-1 — Scribble.** `stroke-dasharray` grows from `0 L` to `L L` while `stroke-width` grows from 45% to 100%, so
the line thickens as it draws; the erase leg runs `stroke-dashoffset` to `-L`. `L` is held in `--stroke-length: 231px`.
```css
@keyframes draw-line {
  from { opacity: 0; } 10%, to { opacity: 1; }
  from { stroke-dasharray: 0 var(--stroke-length); stroke-width: calc(var(--stroke-width) * 0.45); }
  to   { stroke-dasharray: var(--stroke-length) var(--stroke-length); stroke-width: var(--stroke-width); }
}
```

**tips-2 — Pull Cord Flip.** Cord tug (`translate` 100% → 130% → 92%), cord sway about `top center`, and a
`rotate(-190deg) → -175 → -180` overshoot flip on the panel. The panel's two faces are two children, one pre-rotated
180°, so a half-turn of the parent swaps them — a flip with **no `backface-visibility` and no 3D**.

**tips-3 — Fold to Square.** Three nested elements, each a rounded bar, each pivoting 90° about a *different* corner
(`right bottom` → `right top` → `left top`) on 0.2 / 0.5 / 0.8s delays. The nesting means each rotation carries its
children, so one line folds itself into a closed square. The last segment gets the overshoot variant.
```css
@keyframes rotate      { from { transform: rotate(0deg);} to { transform: rotate(90deg);} }
@keyframes rotate-over { from { transform: rotate(0deg);} 50% { transform: rotate(90deg);} 75% { transform: rotate(84deg);} to { transform: rotate(90deg);} }
```
Unfolds with `rotate ... reverse forwards` in the opposite order. Pure rotate — nothing cheaper for this much effect.

**tips-4 — Hop Chain.** Squash on the wrapper + arc on the child, with per-dot `--x` / `--y` / `--delay`. The arc is
`50% { transform: translateY(var(--y)) }` — fine — but the horizontal travel is `from { left: 0 } to { left: var(--x) }`,
which is **layout**. Swap to `translateX`.

### 2026-05-02

**tips-1 — Expand / Collapse Arrows.** Arrowheads are `::before`/`::after` bars rotated ±45° off a shared origin — an
arrow built from two rounded rects, no SVG. Motion is `height: 100% → 140% → 90% → 100%`: **layout**, and trivially
`scaleY` instead.

**tips-2 — Swing and Squash.** Bar rotates about an offset pivot (`transform-origin: center 8px`) through four chained
keyframes; the ball travels on `transform` but deforms on `width`/`height` (**layout**).
```css
@keyframes ball-squash { from, to { width: 100%; height: 100%; } 50% { width: 120%; height: 45%; } 75% { width: 90%; height: 120%; } }
```

**tips-3 — Download / Bar Chart.** The bar-chart half is the interesting one: two of three bars trade places by
animating `height` past their targets and back (`40% → 110% → 100%` and `100% → 30% → 40%`) — the overshoot is what
makes a bar look like it *lands* on its value. Correct shape, wrong property: **layout**. Do it with
`transform: scaleY()` + `transform-origin: bottom`.
```css
@keyframes chart-up   { from { height: 40%; } 60% { height: 110%; } to { height: 100%; } }
@keyframes chart-down { from { height: 100%; } 60% { height: 30%; } to { height: 40%; } }
```

**tips-4 — Orbit.** Three `spin` instances at 6s / 3.2s / 1.6s, one of them counter-rotating a child to keep it
upright. Cheap, but `infinite` and thematically a planet.

### 2026-05-14 (all four are `infinite` loops driven by percentage-keyed keyframes)

**tips-1 — Tissue Pull.** Two sheets on one 1.4s cycle offset by construction: one runs `pull`, one runs `push`, and
they hand off at the seam. Sheet shape via `clip-path: polygon(0 0, 100% 0, 98% 100%, 2% 100%)` (a slight taper).
Animates `height` and `bottom` — **layout**.

**tips-2 — Zipper.** The seam closes by collapsing a corner radius: `border-radius: 0 0 0 0 → 0 0 85% 0 → 0 0 0 0` on
each half (right half mirrored with `scaleX(-1)`), while the slider travels on `bottom` (**layout**) and the pull sways.
The radius trick is the good part and it's cheap-ish (paint only).

**tips-3 — Roll and Squash.** Two-element roll: an outer rotate to 90° about the corner plus an inner counter-rock,
and the receiving block deforms on `width`/`height` (**layout**) with a 6-stop cycle.

**tips-4 — Headphones On.** Band lowers on `transform` and seats by animating `width` 94 → 72 → 80 → 94px; the head
shape breathes on `width`/`height` in counterpoint. **Layout**, and unmistakably an object.

### 2026-06-07 (heart / "like" set — mechanisms usable, imagery and palette are not)

**tips-1 — Burst Particles.** The reusable part: ten identical `.particle` elements placed **polar-style** by giving
each a `--rotate` (0° to 324° in 36° steps) and animating `rotate(var(--rotate)) translateY(var(--translate-y))`.
No per-particle coordinates, no JS. `nth-child(2n/3n/4n)` vary size, delay and colour.
```css
@keyframes move {
  from { opacity: 0; transform: rotate(var(--rotate,0)) translateY(0); }
  to   { opacity: 1; transform: rotate(var(--rotate,0)) translateY(var(--translate-y,0px)); }
}
```
Each particle's `::before` separately runs `scale-in` then `scale-out` at `calc(0.55s + var(--d))`, so dots pop *and*
vanish at the tips of their travel. Ring: `scale(0) → scale(0.4)` with opacity peaking at `50%–80%` then back to 0.

**tips-2 — Floating Copies.** Copies drift on individual `--x` / `--y` / `--r` vectors under two nested keyframes —
outer handles opacity + vertical lift, inner handles the divergence — with delays 0.4s to 1.1s.

**tips-3 — Ray Burst.** Four bars at 0/90/180/270° inside a rotated wrapper; each bar is `overflow: hidden` with an
`::after` sliding `translateY(101%) → -101%`, so rays appear to shoot *through* and past. Three crosses at 0°/45° on
0 / 0.3 / 0.4s delays. All `currentColor` — recolours to pure white in one declaration. **The best colour-free
celebration burst in the repo.**
```css
@keyframes cross-seg-slide { from { transform: translateY(101%);} to { transform: translateY(-101%);} }
```

### 2026-06-08 (bookmark set — same caveat: mechanism yes, palette no, `#e1c039` is gold)

**tips-1 — Card Drop Stack.** Cards land using `perspective()` inside the transform, tipping from flat-on-its-face to
upright with a scale correction, staggered 0.35 / 0.5 / 0.65s. Then the top card is flicked away with a dip before
the exit — the dip at `50%` is what makes it feel *thrown* rather than *moved*.
```css
@keyframes down { from { transform: perspective(700px) translateY(-40%) rotateX(80deg) rotateY(var(--z)) scale(1.5,1.15); }
                  to   { transform: perspective(700px) translateY(0) rotateX(0deg) rotateY(0) scale(1); } }
@keyframes up   { from { transform: translateY(0);} 50% { transform: translateY(22%);} to { transform: translateY(-101%);} }
```
Card shape is `clip-path: polygon(0 -100%, 100% -100%, 100% 100%, 50% 80%, 0 100%)` — a notched ribbon, no image.

**tips-2 — Panel Stack Sweep.** Three panels, each running four animations: enter from the left, a slow
`border-radius: 0 0 100% 0 → 0` flatten that outlasts the entrance, then a corner *re-round* and an exit right.
Enter delays 0 / 0.15 / 0.3s, exit delays run the stack in reverse order. Plus a highlight sweep that is a **raked
`clip-path` parallelogram**, not a gradient — so it works on any background, including flat dark.
```css
@keyframes shine-sweep {
  from   { clip-path: polygon(calc(var(--shine-width) * -1) 0, 0 0,
                              calc(var(--shine-skew) * -1) 100%,
                              calc((var(--shine-skew) + var(--shine-width)) * -1) 100%); }
  40%, to { clip-path: polygon(calc(100% + var(--shine-skew)) 0,
                               calc(100% + var(--shine-skew) + var(--shine-width)) 0,
                               calc(100% + var(--shine-width)) 100%, 100% 100%); }
}
```

**tips-3 — Pager Swap.** Outgoing item exits while the incoming enters from the right, plus a landing squash using
the standalone `scale:` property (`1 → 1.2 0.7 → 1 1.1 → 1`). Travel is on `left` — **layout**; swap for `translateX`.

### 2026-06-09 (cat set)

**tips-1 — Walking Cat.** Walk in three chained legs; body `bob` with `skewX` for weight; a **permanent
`breathe` loop at 1s infinite** under everything else so the character is never fully still; SVG parts with
`transform-box: fill-box` and iteration-count `2` for the ear twitch and tail wag. The two transferable ideas are the
always-on `breathe` idle and `skewX` in the squash.
```css
@keyframes breathe { from, to { transform: scale(1,1);} 50% { transform: scale(1.04,1.025) skewX(-1deg);} }
```

**tips-2 — Cat and Flower.** Stem grows on `height` (**layout**), leaves and bloom pop with
`scale(0) rotate(...) skewX(...) → overshoot → rest`, cat idles on the same `breathe` loop. Uses raster PNGs.

---

## 3. Recommendations by surface

Target: monochrome warm-dark — bg `#171717`, raised `#1e1e1e`, borders `#2f2f2f`, white as the only ink.
Every pick below survives having its colour stripped to white-on-near-black, because it carries meaning in
**motion and mask**, not in hue.

### 3.1 Empty / "the stage is being set" state

1. **`2026-04-22/tips-4` Woven Grid** — bars growing from zero in shuffled order reads as scaffolding going up, not as
   a spinner; pure `scaleY`, and greyscale is its native palette. Loop it by merging in/out into one keyframe.
2. **`2026-04-22/tips-3` Batten Drop** — four tall columns dropping in on a stagger is stage rigging flying in,
   which is exactly the metaphor, and it is four lines of CSS.
3. **`2025-03-11/loading-2.svg` Double Pulse** — when the empty state needs to be quiet rather than busy: two discs,
   one keyframe, half-cycle offset. Nothing to recolour.

### 3.2 "How it works" explainer modal

1. **`2026-06-08/tips-2` Panel Stack Sweep** — purpose-built for a stepped explainer: panels enter left, corner
   flattens as each settles, exit right in reverse order. Step 1 → 2 → 3 is already the shape of the animation.
2. **`2026-04-17/tips-2` Page Turn** — for the modal's own entrance: the corner unrolling flat after the panel lands
   gives a sheet of paper being laid down, which is the right register for "here are the rules."
3. **`2025-02-25/#transition-2` Skewed Curtain Wipe** — between steps when the panel content changes in place;
   the rake keeps a plain wipe from reading as a slideshow.

### 3.3 Nominee cards + the selected state

1. **`2026-04-25/tips-3` Turn-Over Swap** — *the* monochrome selection primitive: the card rotates about its corner,
   swaps z-order mid-turn and lands on its inverted face. Selection reads as the card physically turning over, so it
   needs no accent colour at all — and deselect is the same keyframe with `reverse`.
2. **`2026-04-17/tips-1` Overshoot Pop** — grid entrance, one keyframe, add `--delay` per card (borrow the shuffled
   delay pattern from `2025-02-25/#transition-4` so the grid doesn't fill like a wave).
3. **`2026-06-08/tips-2` shine-sweep** — a single raked highlight pass over the selected card. It's a `clip-path`
   parallelogram rather than a gradient, so it reads cleanly over `#1e1e1e`.

### 3.4 Mobile category pager

1. **`2025-02-25/#transition-1` Two-Tone Wipe** — two sheets crossing 0.2s apart gives depth to a horizontal page
   change; pure `translateX`, so it holds 60fps on a mid-range phone, which matters more here than anywhere else.
2. **`2026-04-17/tips-3` Tumble** — the category tile tips over its corner into the next one; tactile enough to
   reward a tap, and the mid-frame teleport at `50.1%` keeps it to one transform.
3. **`2026-06-08/tips-3` Pager Swap** — the right choreography (out-left / in-right with a landing squash), but
   **rewrite `left` as `translateX` first** — as written it reflows on a touch gesture.

### 3.5 Ballot submit confirmation

1. **`2026-04-29/tips-3` Fold to Square** — three nested 90° rotations fold a line into a closed square. "Sealed"
   without a checkmark, without a colour, in nothing but `rotate`. Unfold with `reverse` if the user edits.
2. **`2026-06-08/tips-1` `up` keyframe** — the dip-then-flick that sends the card up out of frame; the 22% dip at the
   midpoint is what makes it read as *filed* rather than as *dismissed*.
3. **`2026-04-25/tips-1` Scroll Unfurl** — if the confirmation shows a receipt line: roller pays out a rule while the
   confirmation text rises character by character, then re-rolls on dismiss.

### 3.6 Results reveal (share bars, rankings)

1. **`2026-04-22/tips-4` scaleY stagger + `2026-05-02/tips-3` overshoot curve** — the right combination: take the
   cheap `scaleY` mechanism from the Woven Grid and the `40% → 110% → 100%` overshoot shape from the bar chart. Bars
   land on their value instead of sliding to it, with zero reflow.
2. **`2026-04-25/tips-2` Brick Drop** — ranking rows falling in and settling, shuffled delays so places 1–10 don't
   arrive as a mechanical sweep.
3. **`2026-04-18/tips-2` Domino Fall** — for a compact "everything resolves at once" cascade across rank rows; the
   per-item differing rest angles are what keep it from looking like a loop.

### 3.7 Winner announcement moment

1. **`2026-04-22/tips-2` Stage Curtain** — two halves swinging apart from the wings with a deepening cast shadow.
   It is literally the award-show gesture, it is built from one keyframe mirrored with `scaleX(-1)`, and grey fabric
   on near-black is the whole palette we have.
2. **`2026-04-25/tips-1` Scroll Unfurl** — the winner's name rising character by character with a squash on each
   letter; the only place on the site that earns per-character timing.
3. **`2026-06-07/tips-3` Ray Burst** — masked bars firing out past the mark on staggered delays, all `currentColor`,
   so it becomes a white ray burst with one declaration. Use it *under* the name, briefly, once.

### 3.8 Nominee "highlights" sheet (rolling-digit stats)

1. **`2026-04-22/tips-3` masked-column translate** — this *is* the rolling-digit mechanism: a strip inside an
   `overflow: hidden` box translating by exact multiples of the cell height, one `--delay` per digit. `translateY(-101%)`
   with the `101%` seam trick already solved.
2. **`2026-06-07/tips-3` `cross-seg-slide`** — same mechanism with a longer `101% → -101%` travel, for digits that
   should roll *through* rather than settle from above; the per-element `--delay` is already wired.
3. **`2026-04-25/tips-1` `slide-in`** — for the stat *labels* beside the digits: rise from below with the
   `scale(0.95, 1.15)` squash at 60%, so the label and the number feel like one object.

---

## 4. Do not use

### 4.1 Too cute / wrong register for an award show
- **`2026-06-09/tips-1`, `2026-06-09/tips-2`** (Walking Cat, Cat and Flower) — mascot animation, plus raster PNG
  assets. Nothing here belongs on an awards site. *Salvage only:* the always-on `breathe` idle loop and `skewX` in
  squash keyframes.
- **`2026-05-14/tips-1` Tissue Pull, `tips-2` Zipper, `tips-4` Headphones On** — object mascots; a zipper closing
  reads as a mobile app onboarding, not a ballot. *Salvage only:* the corner-radius collapse from the Zipper.
- **`2026-04-18/tips-3` Pendulum Drop, `2026-04-18/tips-1` Stack Settle** — toy-block physics; the wobble is too
  jolly for a results page.
- **`2026-04-17/tips-4` Hard Stop** — the skid-and-wobble is comic timing. Fine for a marketing page, wrong for a
  ballot. *Salvage:* the 4-stop damped `rotate2` settle curve.
- **`2026-05-02/tips-2` Swing and Squash** — a bat hitting a ball. Sports metaphor, wrong ceremony.
- **`2026-04-29/tips-4` Hop Chain** — bouncing dots; reads as a chat typing indicator.
- **`2026-04-29/tips-1` Scribble** — hand-drawn zig-zag; casual to the point of flippant next to "winner".
- **`2026-05-02/tips-1` Expand/Collapse Arrows, `tips-3` download glyph** — icon-specific semantics we don't need
  (the bar-chart half of tips-3 *is* wanted — see §3.6).

### 4.2 Colour we cannot use
- **`2026-06-07/tips-1`, `tips-2`** — heart imagery plus a four-colour confetti palette (`#fe5064`, `#8eb539`,
  `#3e9be7`, `#f5ce50`). Both the "like" semantics and the colours are out. The **polar `--rotate` particle
  placement** is worth keeping, recoloured to white at varying alpha.
- **`2026-06-08/tips-1`** — card colours are `#e1c039` (**gold — explicitly banned**), `#e9934f`, `#e6508b`, plus a
  `kira.svg` sparkle. Mechanism good, dressing out. Sparkles in general: skip, they're the cheapest possible read of
  "award" and they're what everyone else does.
- **`2026-06-08/tips-2`, `tips-3`** — pink `#e6508b` / blush `#fbe5ee` throughout; recolour to `#1e1e1e` / `#2f2f2f`
  / white before adopting the mechanisms recommended in §3.2 and §3.4.
- **`2025-03-11/loading-4.svg`** — orange `#F4AD60`.

### 4.3 Layout-thrashing as written (mechanism may be fine, implementation is not)
All of these animate `width` / `height` / `top` / `left` / `bottom`, which reflows every frame. On the nominee grid
and the mobile pager that is a visible stutter, not a theoretical one.
- `2026-04-22/tips-1` Shutter Roll — 4 simultaneous `height` animations → use `scaleY` + `transform-origin: top`
- `2026-05-02/tips-3` bar chart — `height` → `scaleY` + `transform-origin: bottom` (keep the overshoot keyframe shape)
- `2026-06-08/tips-3` Pager Swap — `left` → `translateX`
- `2026-04-29/tips-4` Hop Chain — `left` → `translateX`
- `2026-04-18/tips-4` Stomp Bounce — `height` → `scaleY`
- `2026-05-02/tips-1` — `height` → `scaleY`
- `2026-05-14/tips-1` / `tips-3` / `tips-4` — `width`, `height`, `bottom`; all four of these loop *infinitely*, so the
  reflow cost is permanent, not one-shot

### 4.4 `prefers-reduced-motion` traps — read this before adopting anything

**The real hazard is not "too much motion", it's content that never appears.** Several demos park an element in its
final position using a `forwards`-filled keyframe, with the element's own CSS left at the *start* state:

- `2026-06-08/tips-3` — `.marks--1 { animation: leftOut ... both }` moves `left: 50% → -50%`. Kill the animation and
  all three states stack on top of each other at `left: 50%`.
- `2026-06-08/tips-1` — `.mark--1` uses `reset 0.01s ... forwards` as a **teleport**; with animations disabled all
  four cards render stacked.
- `2026-04-25/tips-3` — the z-index swap lives entirely inside the keyframe, so with motion off the toggle has no
  visible state at all.

So: never implement reduced-motion as `animation: none`. Write an explicit
`@media (prefers-reduced-motion: reduce)` branch that sets each element to its **intended end state** (opacity 1,
final transform, final z-index) and, for the digit rollers and masked wipes, renders the final value directly.

Also flag:
- **Everything `infinite`** — `2026-04-25/tips-4`, `2026-05-02/tips-4`, all four `2026-05-14/*`, all five
  `2025-03-11/loading-*.svg`, the `breathe` loops in `2026-06-09/*`. Each needs a static frame under reduced motion,
  and none should sit on screen indefinitely next to a ballot the user is trying to read.
- **Chained delays up to ~3.4s.** These are page-load demos with hardcoded cumulative timelines
  (`2026-06-08/tips-1` runs to 2.6s, `2026-06-09/tips-2` to 3.4s). In product they must become event-driven and be
  cut to roughly a third — a 3-second intro on a nominee card grid is unusable.
- **`2025-03-11/loading-3.svg`** has a unit-less `animation-delay: 1.2;` (rule dropped) and
  **`loading-4.svg`** has an invalid `transform-box: 12px 12px`. Fix on adoption.
- **Demo scaffolding is not part of any effect** — the `position: absolute; top/left: 50%` centring `.container`,
  the `transform: scale(1.3…3.4)` zoom wrappers, and the `@import url(fonts.googleapis.com)` lines all exist to
  frame a 320px demo square. Drop them; the `@import` in particular is a CSP and render-blocking problem.
