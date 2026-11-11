# Porting notes

How the port was verified against XBill 2.1, what it found, and how the
project fits together. The short version is in the [README](../README.md).

## Proving it is a translation

The game logic is a line-by-line translation of the original C, and that claim
is tested rather than asserted. The original gameplay sources are compiled
headless and both implementations are driven from a **bit-identical glibc
`rand()` stream** with the same recorded input, then their full per-tick state
is diffed — score, level, counters, every machine, every Bill.

```
43/43 games matched the original exactly
333,821 ticks compared
```

Everything carried over: the 200 ms tick, the spawn curves, `step_size`,
integer-division truncation, the generous `±width/±height` drop zone, the
13-frame theft animation and its exact counter transitions, `n² × 5` scoring,
the end-of-level efficiency bonus, cable sparks, and the game-over test.

## Three findings

### The level 45 cliff is a signedness bug

`Horde.c` has

```c
static int between(unsigned int lev) { return MAX(14 - lev / 3, 10); }
```

`lev` is unsigned, so once `lev/3` passes 14 the subtraction wraps to ~4.29
billion, `MAX` compares unsigned and picks it, and the `int` return
reinterprets it as **-1**. The caller does `iteration % between(level) == 0`,
and `n % -1` is 0 for every `n` — so from level 45 Bills launch *every single
tick* instead of every ten. Reproduced deliberately; the differential test
fails without it.

### The system counters drift, and that is also original

`Game_button_release` never checks `computer->busy`, so you can drop a rescued
OS onto a machine a Bill has already powered off mid-theft. His animation then
reaches frame 11 and does `OFF--/WIN++` on a machine that is no longer off.
"Running" reads one too high and "off" one too low each time, and the status
line can show a negative count.

The original C does this in roughly two thirds of long games — verified by
parsing its own trace output against its own machine list. Kept, because an
over-counted "running" total delays the `base + off <= 1` game-over test, so
removing it would make the endgame harder than the real thing. The sum of the
three counters is always still correct.

### One bug is deliberately *not* reproduced

`Horde_update` caches `bill->next` before calling `Bill_update`, and
`update_at` can `free()` exactly that Bill when it claims a computer's stray —
a use-after-free whose effect depends on what the allocator left behind. This
port iterates a snapshot and skips Bills removed mid-pass. The C harness is
patched the same way so the two stay comparable; see `test/harness/`.

## What is new

- **Vector artwork.** The original shipped tiny bitmaps. Every sprite — Bill's
  walk, melt and theft cycles, eight machines, eleven OS logos, the spark and
  the bucket — is redrawn as Canvas paths following the original compositions
  and palettes, so it stays sharp at any size. Rendered at 2× supersampling.
- **Smooth motion.** The simulation still steps at exactly 200 ms; rendering
  interpolates between the last two logic positions, so nothing about the rules
  changes.
- **Modern shell.** Responsive sizing, touch support, pause, level warp,
  high scores in `localStorage`, in-game rules.

## Layout

```
dist/xbill.html      the deliverable — open this
index.html           dev page, loads src/*.js separately
build.js             inlines src/*.js into dist/xbill.html
src/engine.js        the port: headless, deterministic, no DOM
src/sprites.js       all artwork, pure Canvas paths
src/ui.js            canvas renderer, input, menus
src/glibcrand.js     bit-exact glibc rand(), for the differential test only
devtools/sprites.html  sprite sheet; ?z=<zoom>&g=<group> to inspect one set
test/                see below
```

`src/engine.js` has no DOM references at all, which is what lets the same code
run under Node for the tests.

## Tests

```sh
npm test            # unit + unusual-move probes + 60 simulated games
npm run test:diff   # differential test against the original C (needs the harness)
```

| suite | what it does |
|---|---|
| `test/unit.js` | 134 assertions, each traceable to a named function in the C |
| `test/unusual.js` | 19 adversarial actions, each with its documented outcome |
| `test/simulate.js` | 60 full games, every state invariant checked every tick |
| `test/difftest.js` | replays bot input through the real C and diffs the traces |

Latest run of the 60 games — five player profiles, 20,000-tick cap:

```
profile    games   avg ticks   avg levels   avg score   best score
skilled      20       18078         34.5      117262       590658
sloppy       10       20000         20.1       41413        79183
random       10         120          0.0          49          185
chaos        10        1235          5.4        3753          9882
idle         10         109          0.0           0             0

576,201 ticks · 457,307 input events · 70,516 Bills clicked
170,093 sparks doused · 946 levels cleared
No crashes and no invariant violations.
```

The profiles are meant to disagree with each other: `idle` sends no input and
should always lose quickly, `random` clicks nothing in particular, `chaos`
exists only to send input the game should never see, and `skilled` plays
properly and runs into the level-45 spawn bug.

### Unusual moves

`test/unusual.js` pins down the behaviour rather than just checking nothing
throws. Some of the more interesting answers:

- **Clicking a spark with no bucket puts it out.** The original routes every
  release-with-nothing-held through `Bucket_release`, so the bucket is really
  just a cursor affordance.
- **Clicking a Bill standing in the top-left corner grabs the bucket instead.**
  `Bucket_clicked` is tested first and returns early.
- **Hammering one Bill scores once.** Bills already melting are skipped.
- **Letting Bills escape never clears a level.** An escaped Bill goes back into
  the off-screen pool and returns. Only clicking reduces it.
- **Dropping an OS on the wrong machine, off the edge, or on a healthy
  machine** all bounce it back to the floor, unchanged.
- **Rescuing a machine a Bill is mid-theft on is accepted and then wasted** —
  he overwrites it at frame 11. This is the counter-drift path above.

### Rebuilding the differential harness

```sh
./test/harness/build.sh        # fetches xbill 2.1, patches, builds /tmp/xbilldiff/harness
npm run test:diff
```

`test/harness/` holds the stubbed UI, the trace harness, and the Horde.c patch
with its justification. It needs `curl`, `tar`, `patch` and `gcc`.

## Licence

**GPL-2.0-or-later.**

XBill is Copyright © 1994–2001 Brian Wellington and Matias Duarte. The 2.1
tarball ships no `COPYING` file and its man page says only "distributed under
the GNU General Public License" with no version; Debian's `debian/copyright`
records upstream as **GPL-2+**, and this port follows that reading. `LICENSE`
holds the canonical GPL version 2 text.

This is a derivative work — the game logic is a direct translation of the
original C — so it is distributed under the same terms.

The artwork is redrawn from the original GPL pixmaps. The OS logos are parody
renderings in the spirit of the game, not reproductions of the trademarks they
allude to; "Wingdows" is the original authors' joke, not a Microsoft product.
