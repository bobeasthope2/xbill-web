# XBill — browser port

A web port of [XBill](http://www.xbill.org/) 2.1, the X11 game by **Brian
Wellington** and **Matias Duarte** (1994–2001).

You're the sysadmin. Little men in suits are carrying **Wingdows** — a virus
dressed up as an operating system — toward your computers. Click them before
they get there.

### ▶ [Play it](https://bobeasthope2.github.io/xbill-web/)

Or download `dist/xbill.html` and open it. One self-contained file: no server,
no build step, no network.

## How to play

- **Click a Bill** to stop him. Catching several in one click scores *n² × 5*,
  so clusters are worth far more than picking them off.
- A Bill who reaches a machine **steals its OS**, installs the virus, and runs
  off with your software.
- Kill him while he's carrying one and he **drops it**. Drag it back onto any
  *compatible* machine. Mac OS only fits a Mac; the PC systems (OS/2, BSD,
  Linux, Red Hat, Hurd) fit either PC.
- Infected machines send a **spark** down the network cables. Drag the bucket
  of water onto it before it reaches the far end.
- It's over when you're down to one working computer.

## A real port, not a lookalike

The logic is a line-by-line translation of the original C. To prove it, the
original sources are compiled headless, glibc's `rand()` is reproduced
bit-exactly, and both run off the same random stream with the same input —
then every tick of state is diffed.

```
43/43 games matched the original exactly — 333,821 ticks compared
```

That turned up a nice one: **the level 45 difficulty cliff is a signedness
bug.** `between()` takes an *unsigned* level, so past level 44 the subtraction
wraps, and the `int` return comes back as `-1`. Since `n % -1 == 0` always,
Bills start spawning *every tick* instead of every ten. Faithfully preserved —
the test fails without it.

Two more bugs, and why one of them is deliberately *not* reproduced, are in
**[docs/porting-notes.md](docs/porting-notes.md)** along with the project
layout and the full test breakdown.

The artwork is redrawn from the original pixmaps as vector paths, so it stays
sharp at any size.

## Tests

```sh
npm test
```

134 rule assertions, 19 unusual-move probes, and 60 simulated games
(576,201 ticks) with every state invariant checked on every tick.

## Licence

GPL-2.0-or-later. XBill is © 1994–2001 Brian Wellington and Matias Duarte.
This is a derivative work and carries the same terms. The OS logos are parody
renderings in the spirit of the original — "Wingdows" is the authors' joke,
not a Microsoft product.
