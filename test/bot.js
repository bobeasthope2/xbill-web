/*
 * Headless players used by the simulation harness and the differential test.
 *
 * A bot never touches the engine's own RNG — it carries a separate stream —
 * so the random draws the game makes are unaffected by who is playing.  That
 * is what lets a recorded input script be replayed against the original C
 * binary and produce an identical trace.
 *
 * Each bot exposes act(game, tick) -> [{kind:'p'|'r', x, y}, ...]
 */
'use strict';

const Engine = require('../src/engine.js');
const mulberry32 = Engine.mulberry32;

const BILL_CX = Engine.BILL_W / 2 | 0;
const BILL_CY = Engine.BILL_H / 2 | 0;
const OS_CX = Engine.OS_W / 2 | 0;
const OS_CY = Engine.OS_H / 2 | 0;

/* Would releasing at (x,y) with this cargo land on a legal machine?
 * Mirrors Game_button_release's first-match-wins loop. */
function releaseWouldLand(game, cargo, x, y) {
	for (const c of game.computers) {
		if (!Engine.computerOn(c, x, y)) continue;
		if (!Engine.computerCompatible(c, cargo)) continue;
		if (c.os !== Engine.OS_WINGDOWS && c.os !== Engine.OS_OFF)
			continue;
		return true;
	}
	return false;
}

/* Pick a drop point that actually restores a stolen OS, or null. */
function findDropPoint(game, cargo) {
	for (const c of game.computers) {
		if (!Engine.computerCompatible(c, cargo)) continue;
		if (c.os !== Engine.OS_WINGDOWS && c.os !== Engine.OS_OFF)
			continue;
		/* verify the first-match loop picks a legal target here */
		if (releaseWouldLand(game, cargo, c.x, c.y))
			return { x: c.x, y: c.y };
	}
	return null;
}

function activeSparks(game) {
	return game.cables.filter(c => c.active);
}

/* Bills worth clicking, most urgent first. */
function threats(game) {
	const list = game.alive.filter(b =>
		b.state !== Engine.BILL_STATE_DYING);
	/* a Bill mid-theft is the most damaging, then inbound, then fleeing */
	const rank = b =>
		b.state === Engine.BILL_STATE_AT ? 0 :
		b.state === Engine.BILL_STATE_IN ? 1 : 2;
	return list.sort((a, b) => rank(a) - rank(b));
}

/*
 * Clicking a point that covers several Bills scores count^2 * 5, so finding
 * overlaps is worth a lot more than picking them off one at a time.
 */
function bestClusterPoint(game) {
	const list = threats(game);
	let best = null, bestN = 0;
	for (const b of list) {
		const x = b.x + BILL_CX, y = b.y + BILL_CY;
		let n = 0;
		for (const o of list)
			if (Engine.billClicked(o, x, y)) n++;
		if (n > bestN) { bestN = n; best = { x, y }; }
	}
	return best ? { point: best, count: bestN } : null;
}

const bots = {
	/* Does nothing — the game should still run to a loss cleanly. */
	idle() {
		return { name: 'idle', act: () => [] };
	},

	/*
	 * Plays properly: restores stolen OSes, puts out sparks, and swats
	 * Bills preferring clusters.
	 */
	skilled(seed) {
		const rnd = mulberry32(seed);
		let holding = null;	/* cargo we picked up last tick */
		return {
			name: 'skilled',
			act(game) {
				const ev = [];

				/* finish a drag started last tick */
				if (holding !== null) {
					const dp = findDropPoint(game, holding);
					const p = dp || { x: 200, y: 200 };
					ev.push({ kind: 'r', x: p.x, y: p.y });
					holding = null;
					return ev;
				}

				/* rescue a dropped OS if somewhere can take it */
				const stray = game.strays.find(s =>
					findDropPoint(game, s.cargo));
				if (stray) {
					const dp = findDropPoint(game, stray.cargo);
					ev.push({ kind: 'p',
						  x: stray.x + OS_CX,
						  y: stray.y + OS_CY });
					ev.push({ kind: 'r', x: dp.x, y: dp.y });
					return ev;
				}

				/* douse a spark before it lands */
				const sparks = activeSparks(game);
				if (sparks.length && rnd() < 0.7) {
					const s = sparks[0];
					ev.push({ kind: 'p', x: s.x, y: s.y });
					ev.push({ kind: 'r', x: s.x, y: s.y });
					return ev;
				}

				/* otherwise swat Bills */
				const cluster = bestClusterPoint(game);
				if (cluster) {
					ev.push({ kind: 'p',
						  x: cluster.point.x,
						  y: cluster.point.y });
					ev.push({ kind: 'r',
						  x: cluster.point.x,
						  y: cluster.point.y });
				}
				return ev;
			},
		};
	},

	/* Clicks at uniformly random points — mostly misses. */
	random(seed) {
		const rnd = mulberry32(seed);
		return {
			name: 'random',
			act(game) {
				const s = game.screensize;
				const x = Math.floor(rnd() * s);
				const y = Math.floor(rnd() * s);
				return [{ kind: 'p', x, y },
					{ kind: 'r', x, y }];
			},
		};
	},

	/*
	 * Deliberately malformed input: releases with no press, presses with
	 * no release, coordinates far outside the window, drops onto
	 * incompatible machines, repeated grabs, clicks on already-dying
	 * Bills.  This is the bot that hunts for crashes.
	 */
	chaos(seed) {
		const rnd = mulberry32(seed);
		const pick = arr => arr[Math.floor(rnd() * arr.length)];
		return {
			name: 'chaos',
			act(game) {
				const s = game.screensize;
				const ev = [];
				const roll = rnd();

				if (roll < 0.12) {
					/* release with nothing held */
					ev.push({ kind: 'r',
						  x: Math.floor(rnd() * s),
						  y: Math.floor(rnd() * s) });
				} else if (roll < 0.24) {
					/* press and never release */
					ev.push({ kind: 'p',
						  x: Math.floor(rnd() * s),
						  y: Math.floor(rnd() * s) });
				} else if (roll < 0.34) {
					/* way outside the playfield */
					const far = [-99999, -1, s + 1, 99999];
					ev.push({ kind: 'p', x: pick(far), y: pick(far) });
					ev.push({ kind: 'r', x: pick(far), y: pick(far) });
				} else if (roll < 0.44) {
					/* grab the bucket, then do something else */
					ev.push({ kind: 'p', x: 5, y: 5 });
					if (rnd() < 0.5)
						ev.push({ kind: 'p', x: 5, y: 5 });
					ev.push({ kind: 'r',
						  x: Math.floor(rnd() * s),
						  y: Math.floor(rnd() * s) });
				} else if (roll < 0.58 && game.strays.length) {
					/* grab a stray and drop it somewhere silly */
					const st = pick(game.strays);
					ev.push({ kind: 'p',
						  x: st.x + OS_CX,
						  y: st.y + OS_CY });
					const where = rnd();
					if (where < 0.4 && game.computers.length) {
						/* likely incompatible machine */
						const c = pick(game.computers);
						ev.push({ kind: 'r', x: c.x, y: c.y });
					} else if (where < 0.7) {
						/* off-screen release */
						ev.push({ kind: 'r', x: -500, y: -500 });
					} else {
						/* straight back down */
						ev.push({ kind: 'r',
							  x: st.x + OS_CX,
							  y: st.y + OS_CY });
					}
				} else if (roll < 0.70 && game.alive.length) {
					/* hammer the same Bill repeatedly */
					const b = pick(game.alive);
					const x = b.x + BILL_CX, y = b.y + BILL_CY;
					const n = 1 + Math.floor(rnd() * 4);
					for (let i = 0; i < n; i++) {
						ev.push({ kind: 'p', x, y });
						ev.push({ kind: 'r', x, y });
					}
				} else if (roll < 0.80) {
					/* exact corners and boundaries */
					const edge = [0, 1, s - 1, s,
						      Engine.BUCKET_W,
						      Engine.BUCKET_W - 1];
					ev.push({ kind: 'p', x: pick(edge), y: pick(edge) });
					ev.push({ kind: 'r', x: pick(edge), y: pick(edge) });
				} else if (roll < 0.88 && game.computers.length) {
					/* mash a machine with no OS held */
					const c = pick(game.computers);
					ev.push({ kind: 'p', x: c.x, y: c.y });
					ev.push({ kind: 'r', x: c.x, y: c.y });
				} else {
					const x = Math.floor(rnd() * s);
					const y = Math.floor(rnd() * s);
					ev.push({ kind: 'p', x, y });
					ev.push({ kind: 'r', x, y });
				}
				return ev;
			},
		};
	},

	/* A sloppy human: right idea, imprecise aim, occasional misses. */
	sloppy(seed) {
		const rnd = mulberry32(seed);
		const jitter = () => Math.floor((rnd() - 0.5) * 30);
		return {
			name: 'sloppy',
			act(game) {
				if (rnd() < 0.3) return [];	/* reaction gap */
				const list = threats(game);
				if (!list.length) return [];
				const b = list[0];
				const x = b.x + BILL_CX + jitter();
				const y = b.y + BILL_CY + jitter();
				return [{ kind: 'p', x, y },
					{ kind: 'r', x, y }];
			},
		};
	},
};

module.exports = { bots, findDropPoint, threats, bestClusterPoint };
