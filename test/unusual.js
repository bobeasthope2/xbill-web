/*
 * Unusual / adversarial moves, one at a time, with the observed outcome
 * printed.  The fuzzing in simulate.js proves nothing crashes; this file
 * documents what each odd action actually DOES, so the behaviour is pinned
 * down rather than just "didn't throw".
 */
'use strict';

const Engine = require('../src/engine.js');

let failed = 0;
const rows = [];

function probe(what, fn, expected) {
	let outcome;
	try {
		outcome = fn();
	} catch (err) {
		outcome = `THREW: ${err.message}`;
	}
	const ok = outcome === expected;
	if (!ok) failed++;
	rows.push({ what, outcome, expected, ok });
}

/* a fresh mid-game state */
function g(level) {
	const game = new Engine({ seed: 20261110 });
	game.start(level || 4);
	return game;
}

/* put a stray OS on the floor that machine `m` could run */
function withStray(game, m) {
	const s = game.billEnter();
	s.state = Engine.BILL_STATE_STRAY;
	s.cargo = m.type < 6 ? m.type : 8;
	s.x = 350; s.y = 350;
	game.strays = [s];
	game.alive = [];
	return s;
}

/* ------------------------------------------------------------- probes */

probe('Click empty space',
	() => {
		const game = g();
		game.alive = [];
		const n = game.buttonPress(199, 199);
		game.buttonRelease(199, 199);
		return `killed ${n}, score ${game.score}`;
	},
	'killed 0, score 0');

probe('Click the same Bill repeatedly',
	() => {
		const game = g();
		game.alive = [];
		const b = game.billEnter();
		b.x = 180; b.y = 180; b.state = Engine.BILL_STATE_IN;
		game.alive = [b];
		let total = 0;
		for (let i = 0; i < 6; i++) total += game.buttonPress(192, 199);
		return `counted ${total} kill(s), score ${game.score}`;
	},
	'counted 1 kill(s), score 5');

probe('Click a Bill that is already melting',
	() => {
		const game = g();
		game.alive = [];
		const b = game.billEnter();
		b.x = 180; b.y = 180;
		Engine.billSetDying(b);
		game.alive = [b];
		return `counted ${game.buttonPress(192, 199)}`;
	},
	'counted 0');

probe('Release with nothing held, over empty space',
	() => {
		const game = g();
		game.buttonRelease(200, 200);
		return `grabbed=${game.grabbed}, bucket=${game.bucketGrabbed}`;
	},
	'grabbed=null, bucket=false');

probe('Release with nothing held, directly on a live spark',
	() => {
		const game = g(6);
		const cable = game.cables[0];
		game.computers[cable.c1].os = Engine.OS_WINGDOWS;
		game.cableUpdate(cable);
		game.cableUpdate(cable);
		const wasLit = cable.active;
		game.buttonRelease(cable.x, cable.y);
		return `was lit ${!!wasLit}, now lit ${!!cable.active}`;
	},
	/* the original routes every empty release through Bucket_release, so
	 * you can douse a spark without picking the bucket up first */
	'was lit true, now lit false');

probe('Press without ever releasing, then press again',
	() => {
		const game = g();
		const m = game.computers[0];
		const s = withStray(game, m);
		game.buttonPress(s.x + 14, s.y + 12);
		const first = game.grabbed === s;
		game.buttonPress(10, 10);	/* press the bucket while holding */
		return `held after first=${first}, held after second=${game.grabbed === s}`;
	},
	'held after first=true, held after second=true');

probe('Grab the bucket, then release far away',
	() => {
		const game = g();
		game.buttonPress(5, 5);
		const grabbed = game.bucketGrabbed;
		game.buttonRelease(390, 390);
		return `bucket grabbed=${grabbed}, released=${!game.bucketGrabbed}`;
	},
	'bucket grabbed=true, released=true');

probe('Click the bucket corner instead of a Bill standing there',
	() => {
		const game = g();
		game.alive = [];
		const b = game.billEnter();
		b.x = 2; b.y = 2; b.state = Engine.BILL_STATE_IN;
		game.alive = [b];
		const n = game.buttonPress(10, 10);
		/* Bucket_clicked is tested first and returns early */
		return `killed ${n}, bucket=${game.bucketGrabbed}`;
	},
	'killed 0, bucket=true');

probe('Drop an OS on a machine that cannot run it',
	() => {
		const game = g();
		const mac = game.computers.find(c => c.type === 1);
		if (!mac) return 'no Mac in this layout';
		mac.os = Engine.OS_OFF;
		const s = withStray(game, mac);
		s.cargo = 8;				/* Linux onto a Mac */
		game.buttonPress(s.x + 14, s.y + 12);
		const ok = game.buttonRelease(mac.x, mac.y);
		return `accepted=${ok}, machine os=${mac.os}, strays=${game.strays.length}`;
	},
	'accepted=false, machine os=-1, strays=1');

probe('Drop an OS on a machine already running fine',
	() => {
		const game = g();
		const m = game.computers.find(c => c.type < 6);
		const s = withStray(game, m);
		game.buttonPress(s.x + 14, s.y + 12);
		const ok = game.buttonRelease(m.x, m.y);
		return `accepted=${ok}, strays=${game.strays.length}`;
	},
	'accepted=false, strays=1');

probe('Drop an OS off the edge of the screen',
	() => {
		const game = g();
		const m = game.computers[0];
		const s = withStray(game, m);
		game.buttonPress(s.x + 14, s.y + 12);
		const ok = game.buttonRelease(-9999, -9999);
		return `accepted=${ok}, strays=${game.strays.length}`;
	},
	'accepted=false, strays=1');

probe('Pick an OS up and put it straight back down',
	() => {
		const game = g();
		const m = game.computers[0];
		const s = withStray(game, m);
		game.buttonPress(s.x + 14, s.y + 12);
		game.buttonRelease(s.x + 14, s.y + 12);
		return `strays=${game.strays.length}, held=${game.grabbed}`;
	},
	'strays=1, held=null');

probe('Click at coordinates far outside the window',
	() => {
		const game = g();
		for (const [x, y] of [[-99999, -99999], [99999, 99999],
				      [-1, 200], [400, 400], [0, 0]]) {
			game.buttonPress(x, y);
			game.buttonRelease(x, y);
		}
		game.tick();
		return `survived, score ${game.score}`;
	},
	'survived, score 0');

probe('Input while the game is over',
	() => {
		const game = g(1);
		game.cables = []; game.alive = [];
		game.billsOn = 1; game.billsOff = 0;
		while (game.sysBase > 1) {
			const c = game.computers.find(x => x.os !== Engine.OS_WINGDOWS);
			c.os = Engine.OS_WINGDOWS; game.sysBase--; game.sysWin++;
		}
		game.tick();		/* arms STATE_END */
		game.tick();		/* game over */
		const n = game.buttonPress(200, 200);
		game.buttonRelease(200, 200);
		return `clicks counted ${n}, state ${game.state}`;
	},
	`clicks counted 0, state ${Engine.STATE_WAITING}`);

probe('Warp backwards mid-game',
	() => {
		const game = g(10);
		game.warpToLevel(2);
		return `level ${game.level}`;
	},
	'level 10');

probe('Warp to level 0 before starting',
	() => {
		const game = new Engine({ seed: 1 });
		game.warpToLevel(0);
		return `level ${game.level}, state ${game.state}`;
	},
	`level 0, state ${Engine.STATE_WAITING}`);

probe('Kill a Bill the instant he reaches a machine',
	() => {
		const game = g();
		const m = game.computers[0];
		game.alive = [];
		const b = game.billEnter();
		b.state = Engine.BILL_STATE_AT;
		b.target_c = 0; b.index = 0; b.cels = 'A';
		b.x = m.x; b.y = m.y;
		m.busy = 1;
		game.alive = [b];
		game.buttonPress(m.x + 12, m.y + 19);
		return `machine released=${m.busy === 0}, remembered as stray=${m.stray === b}`;
	},
	'machine released=true, remembered as stray=true');

probe('Let every Bill escape instead of killing them',
	() => {
		const game = g(1);
		const pool = game.billsOn + game.billsOff;
		for (let t = 0; t < 400; t++) game.tick();
		return `pool still ${game.billsOn + game.billsOff === pool}`;
	},
	/* escaping returns a Bill to the off-screen pool, so you can never
	 * clear a level by waiting — only by clicking */
	'pool still true');

probe('Drop an OS onto a machine a Bill is mid-theft on',
	() => {
		const game = g();
		const m = game.computers[0];
		game.alive = [];
		const b = game.billEnter();
		b.state = Engine.BILL_STATE_AT;
		b.target_c = 0; b.index = 0; b.cels = 'A';
		b.cargo = Engine.OS_WINGDOWS;
		game.alive = [b];
		m.busy = 1;
		for (let f = 1; f <= 6; f++) game.billUpdate(b);	/* powers it off */
		const s = withStray(game, m);
		game.alive = [b];
		game.buttonPress(s.x + 14, s.y + 12);
		const ok = game.buttonRelease(m.x, m.y);
		const restored = m.os === s.cargo;
		for (let f = 7; f <= 11; f++) game.billUpdate(b);
		const total = game.sysBase + game.sysOff + game.sysWin;
		return `drop accepted=${ok}, OS restored=${restored}, `
			+ `Bill overwrites it=${m.os === Engine.OS_WINGDOWS}, `
			+ `counters total ok=${total === game.computers.length}`;
	},
	/* The original has no busy check here: the rescue is accepted, then
	 * the Bill overwrites it anyway, so the player wastes the OS.  The
	 * counter split drifts (see Engine.buttonRelease) but the total of
	 * the three counters stays correct. */
	'drop accepted=true, OS restored=true, Bill overwrites it=true, '
		+ 'counters total ok=true');

/* ------------------------------------------------------------- report */

const w = Math.max(...rows.map(r => r.what.length));
console.log('\nUnusual moves — observed behaviour\n');
for (const r of rows) {
	console.log(`  ${r.ok ? '✓' : '✗'} ${r.what.padEnd(w)}  ${r.outcome}`);
	if (!r.ok) console.log(`    ${' '.repeat(w)}  expected: ${r.expected}`);
}
console.log(`\n${rows.length - failed}/${rows.length} behaved as specified.\n`);
process.exit(failed ? 1 : 0);
