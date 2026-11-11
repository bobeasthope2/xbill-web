/*
 * 60 full games played headless, with every state invariant checked on every
 * single tick.
 *
 * Five player profiles are used, including one ("chaos") whose whole job is to
 * send input the game should never see: releases with nothing held, presses
 * that never release, coordinates far outside the window, operating systems
 * dropped on machines that cannot run them, repeated clicks on a Bill that is
 * already dying, and clicks on the exact pixel boundaries of every hitbox.
 *
 *   node test/simulate.js [count]
 */
'use strict';

const Engine = require('../src/engine.js');
const { bots } = require('./bot.js');

const N = parseInt(process.argv[2], 10) || 60;
const MAX_TICKS = 20000;

/* ------------------------------------------------------- invariants --- */

/*
 * Checked after every tick.  Returns an array of violated rules; anything
 * non-empty is a bug.
 */
function invariants(g, ctx) {
	const bad = [];
	const n = g.computers.length;

	/*
	 * Every machine is counted exactly once, so the three Network counters
	 * must always total the machine count.  This holds unconditionally in
	 * both the original and the port.
	 */
	if (g.sysBase + g.sysOff + g.sysWin !== n)
		bad.push(`counters ${g.sysBase}+${g.sysOff}+${g.sysWin} != ${n} machines`);

	/*
	 * The split between the three, however, can drift away from the real
	 * machine states — see the note in Engine.buttonRelease.  Dropping an
	 * OS onto a machine a Bill is mid-theft on makes "running" read high
	 * and "off" read low, and "off" can go negative.  xbill 2.1 does this
	 * too (verified against the C), so it is recorded as a quirk rather
	 * than failed as a bug.
	 */
	const real = { base: 0, off: 0, win: 0 };
	for (const c of g.computers) {
		if (c.os === Engine.OS_OFF) real.off++;
		else if (c.os === Engine.OS_WINGDOWS) real.win++;
		else real.base++;
	}
	if (g.sysBase !== real.base || g.sysOff !== real.off ||
	    g.sysWin !== real.win)
		ctx.drift++;
	if (g.sysOff < 0 || g.sysBase < 0 || g.sysWin < 0) ctx.negative++;

	if (g.billsOn < 0 || g.billsOff < 0)
		bad.push(`negative Bill counter ${g.billsOn}/${g.billsOff}`);

	/* on-screen counter must match the list, excluding strays (which are
	 * decremented out of billsOn when they drop) */
	const counted = g.alive.length + (g.grabbed &&
		g.grabbed.state !== Engine.BILL_STATE_STRAY ? 1 : 0);
	if (counted > g.billsOn + 1)
		bad.push(`alive list ${counted} exceeds billsOn ${g.billsOn}`);

	/*
	 * The Bill pool for a level is fixed at Horde.c's on(level).  Bills
	 * move between on-screen and off-screen freely — escaping off the edge
	 * puts one back in the pool — so the total may only ever shrink, and
	 * only by killing.  Derive the cap from the live level so a level
	 * change doesn't look like growth.
	 */
	const pool = g.billsOn + g.billsOff;
	const cap = g.billsForLevel(g.level);
	if (pool > cap)
		bad.push(`Bill pool ${pool} exceeds level ${g.level} cap ${cap}`);
	if (g.level === ctx.lastLevel && pool > ctx.lastPool)
		bad.push(`Bill pool grew ${ctx.lastPool} -> ${pool} within level ${g.level}`);
	ctx.lastLevel = g.level;
	ctx.lastPool = pool;

	if (!Number.isFinite(g.score) || g.score < 0)
		bad.push(`score is ${g.score}`);
	if (!Number.isInteger(g.score)) bad.push(`score not an integer: ${g.score}`);
	if (!Number.isInteger(g.level) || g.level < 1)
		bad.push(`level is ${g.level}`);

	for (let i = 0; i < n; i++) {
		const c = g.computers[i];
		if (!Number.isFinite(c.x) || !Number.isFinite(c.y))
			bad.push(`machine ${i} at NaN`);
		if (c.os !== Engine.OS_OFF && (c.os < 0 || c.os >= Engine.NUM_OS))
			bad.push(`machine ${i} has OS ${c.os}`);
		if (c.type < 0 || c.type >= Engine.NUM_SYS)
			bad.push(`machine ${i} has type ${c.type}`);
		/* a machine may only ever run Wingdows, nothing, or something
		 * it is actually compatible with */
		if (c.os !== Engine.OS_OFF && c.os !== Engine.OS_WINGDOWS &&
		    !Engine.computerCompatible(c, c.os))
			bad.push(`machine ${i} (type ${c.type}) runs incompatible OS ${c.os}`);
		if (c.stray && c.stray.removed)
			bad.push(`machine ${i} holds a freed stray`);
	}

	for (const b of g.alive) {
		if (!Number.isFinite(b.x) || !Number.isFinite(b.y))
			bad.push(`Bill ${b.id} at NaN`);
		if (b.state < 1 || b.state > 5)
			bad.push(`Bill ${b.id} in state ${b.state}`);
		if (b.state === Engine.BILL_STATE_STRAY)
			bad.push(`stray ${b.id} found in the alive list`);
		if (b.removed) bad.push(`freed Bill ${b.id} still in alive list`);
		if (b.target_c < 0 || b.target_c >= n)
			bad.push(`Bill ${b.id} targets machine ${b.target_c} of ${n}`);
		if (b.cargo < -1 || b.cargo >= Engine.NUM_OS)
			bad.push(`Bill ${b.id} carries ${b.cargo}`);
		if (b.index < -1 || b.index > 13)
			bad.push(`Bill ${b.id} on frame ${b.index}`);
	}

	for (const s of g.strays) {
		if (s.state !== Engine.BILL_STATE_STRAY)
			bad.push(`non-stray ${s.id} in the stray list`);
		if (s.removed) bad.push(`freed stray ${s.id} still listed`);
		/* a stray is a dropped OS; it is never Wingdows or nothing */
		if (s.cargo < 0 || s.cargo === Engine.OS_WINGDOWS)
			bad.push(`stray ${s.id} carries ${s.cargo}`);
	}

	/* duplicate object identity between the two lists would corrupt both */
	for (const b of g.alive)
		if (g.strays.indexOf(b) >= 0)
			bad.push(`Bill ${b.id} is in both lists`);

	for (const c of g.cables) {
		if (c.c1 === c.c2) bad.push('cable connects a machine to itself');
		if (c.c1 < 0 || c.c1 >= n || c.c2 < 0 || c.c2 >= n)
			bad.push(`cable endpoint out of range (${c.c1},${c.c2})`);
		if (c.active && (!Number.isFinite(c.x) || !Number.isFinite(c.y)))
			bad.push('active spark at NaN');
	}

	return bad;
}

/* ------------------------------------------------------- one game ----- */

function playOne(seed, botName, startLevel) {
	const g = new Engine({ seed });
	g.start(startLevel);

	const bot = bots[botName](seed ^ 0x9e3779b9);
	const ctx = { lastLevel: startLevel,
		      lastPool: g.billsOn + g.billsOff,
		      drift: 0, negative: 0 };

	const stats = {
		seed, bot: botName, startLevel,
		ticks: 0, levels: 0, score: 0, finalLevel: startLevel,
		kills: 0, inputs: 0, strayRescues: 0, sparksDoused: 0,
		maxBillsOnScreen: 0, gameover: false, violations: [], error: null,
		driftTicks: 0, negativeTicks: 0,
	};

	try {
		for (let t = 0; t < MAX_TICKS; t++) {
			let events;
			try {
				for (const e of bot.act(g, t)) {
					stats.inputs++;
					if (e.kind === 'p') {
						const before = g.strays.length;
						stats.kills += g.buttonPress(e.x, e.y);
						if (g.grabbed && g.strays.length < before)
							stats.strayRescues++;
					} else {
						const lit = g.cables.filter(c => c.active).length;
						g.buttonRelease(e.x, e.y);
						const lit2 = g.cables.filter(c => c.active).length;
						if (lit2 < lit) stats.sparksDoused += lit - lit2;
					}
				}
				events = g.tick();
			} catch (err) {
				stats.error = `tick ${t}: ${err.message}`;
				stats.stack = err.stack;
				break;
			}

			stats.ticks++;
			stats.maxBillsOnScreen =
				Math.max(stats.maxBillsOnScreen, g.alive.length);

			const bad = invariants(g, ctx);
			if (bad.length && stats.violations.length < 5)
				for (const v of bad)
					stats.violations.push(`tick ${t}: ${v}`);

			for (const ev of events) {
				if (ev.type === 'levelcomplete') stats.levels++;
				else if (ev.type === 'gameover') stats.gameover = true;
			}
			if (stats.gameover) break;
		}
	} catch (err) {
		stats.error = err.message;
		stats.stack = err.stack;
	}

	stats.score = g.score;
	stats.finalLevel = g.level;
	stats.driftTicks = ctx.drift;
	stats.negativeTicks = ctx.negative;
	return stats;
}

/* ------------------------------------------------------------- main --- */

/* 60 games: a spread of player profiles and starting levels, including the
 * level-45 region where the original's spawn bug kicks in. */
const plan = [];
const profiles = ['skilled', 'skilled', 'sloppy', 'random', 'chaos', 'idle'];
const levels = [1, 1, 1, 2, 5, 9, 14, 22, 44, 45];

for (let i = 0; i < N; i++) {
	plan.push({
		seed: 100003 + i * 7919,
		bot: profiles[i % profiles.length],
		level: levels[i % levels.length],
	});
}

console.log(`Running ${plan.length} simulated games `
	+ `(max ${MAX_TICKS} ticks each, invariants checked every tick)\n`);

const results = [];
const t0 = Date.now();

for (const p of plan) {
	const r = playOne(p.seed, p.bot, p.level);
	results.push(r);
	const flag = r.error ? 'E' : (r.violations.length ? 'V' : '.');
	process.stdout.write(flag);
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

console.log('\n');

/* -------------------------------------------------------- reporting --- */

const errored = results.filter(r => r.error);
const violated = results.filter(r => r.violations.length);
const finished = results.filter(r => r.gameover);
const stalled = results.filter(r => !r.gameover && !r.error);

const sum = (f) => results.reduce((a, r) => a + f(r), 0);

console.log('Per-profile summary');
console.log('  profile    games   avg ticks   avg levels   avg score   best score');
for (const name of [...new Set(profiles)]) {
	const rs = results.filter(r => r.bot === name);
	if (!rs.length) continue;
	const avg = f => (rs.reduce((a, r) => a + f(r), 0) / rs.length);
	console.log(
		'  ' + name.padEnd(10) +
		String(rs.length).padStart(5) +
		avg(r => r.ticks).toFixed(0).padStart(12) +
		avg(r => r.levels).toFixed(1).padStart(13) +
		avg(r => r.score).toFixed(0).padStart(12) +
		String(Math.max(...rs.map(r => r.score))).padStart(13));
}

console.log('\nTotals');
console.log(`  ticks simulated     ${sum(r => r.ticks).toLocaleString()}`);
console.log(`  input events sent   ${sum(r => r.inputs).toLocaleString()}`);
console.log(`  Bills clicked       ${sum(r => r.kills).toLocaleString()}`);
console.log(`  OSes restored       ${sum(r => r.strayRescues).toLocaleString()}`);
console.log(`  sparks doused       ${sum(r => r.sparksDoused).toLocaleString()}`);
console.log(`  levels cleared      ${sum(r => r.levels).toLocaleString()}`);
console.log(`  counter-drift ticks ${sum(r => r.driftTicks).toLocaleString()}`
	+ `  (xbill 2.1 quirk, see Engine.buttonRelease)`);
console.log(`  of which negative   ${sum(r => r.negativeTicks).toLocaleString()}`);
console.log(`  games reaching game over  ${finished.length}/${results.length}`);
console.log(`  games hitting the tick cap ${stalled.length}`);
console.log(`  wall clock          ${elapsed}s`);

if (stalled.length) {
	console.log('\n  (tick-cap games are long survivals, not hangs:)');
	for (const r of stalled.slice(0, 5))
		console.log(`    seed ${r.seed} ${r.bot}: reached level `
			+ `${r.finalLevel}, score ${r.score}`);
}

let bad = 0;

if (errored.length) {
	bad = 1;
	console.log(`\n❌ ${errored.length} game(s) threw:`);
	for (const r of errored.slice(0, 5)) {
		console.log(`   seed ${r.seed} bot ${r.bot} level ${r.startLevel}`);
		console.log(`   ${r.error}`);
		if (r.stack) console.log('   ' + r.stack.split('\n')[1]);
	}
}

if (violated.length) {
	bad = 1;
	console.log(`\n❌ ${violated.length} game(s) broke an invariant:`);
	for (const r of violated.slice(0, 5)) {
		console.log(`   seed ${r.seed} bot ${r.bot} level ${r.startLevel}`);
		for (const v of r.violations) console.log(`     ${v}`);
	}
}

if (!bad) {
	console.log('\n✅ No crashes and no invariant violations in '
		+ `${sum(r => r.ticks).toLocaleString()} ticks `
		+ `across ${results.length} games.`);
}

process.exit(bad);
