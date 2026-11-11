/*
 * Rule-conformance tests.
 *
 * Each assertion is traceable to a specific line of the xbill 2.1 C sources —
 * the comment names the file and function it came from.  These catch rule
 * regressions directly, where the differential test catches them only if the
 * random stream happens to exercise the path.
 */
'use strict';

const Engine = require('../src/engine.js');

let pass = 0, fail = 0;
const failures = [];

function check(name, cond, detail) {
	if (cond) { pass++; return; }
	fail++;
	failures.push(name + (detail ? ` — ${detail}` : ''));
}

function eq(name, got, want) {
	check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

/* a game with a deterministic stream */
function game(level, seed) {
	const g = new Engine({ seed: seed === undefined ? 7 : seed });
	g.start(level || 1);
	return g;
}

/* ---------------------------------------------- spawn curves (Horde.c) */

/* Horde.c on(): MIN((8 + 3*lev) * scale^2, MAX_BILLS) */
for (const [lv, want] of [[1, 11], [2, 14], [10, 38], [30, 98], [31, 100],
			  [50, 100]]) {
	const g = new Engine({ seed: 1 });
	eq(`bills at level ${lv}`, g.billsForLevel(lv), want);
}

/* Horde.c max_at_once(): MIN(2 + lev/4, 12) */
for (const [lv, want] of [[1, 2], [4, 3], [8, 4], [40, 12], [100, 12]])
	eq(`maxAtOnce(${lv})`, Engine.maxAtOnce(lv), want);

/*
 * Horde.c between(): MAX(14 - lev/3, 10) with lev UNSIGNED.  Past level 44
 * the subtraction wraps and the int return goes negative, which makes
 * `iteration % between == 0` true every tick.
 */
for (const [lv, want] of [[1, 14], [3, 13], [12, 10], [42, 10], [44, 10],
			  [45, -1], [48, -2], [60, -6]])
	eq(`between(${lv})`, Engine.between(lv), want);

check('level 45 launches every tick (the unsigned bug)',
      [0, 1, 2, 3, 7, 99].every(i => i % Engine.between(45) === 0));
check('level 44 launches every 10 ticks',
      [0, 10, 20].every(i => i % Engine.between(44) === 0) &&
      ![1, 5, 9].some(i => i % Engine.between(44) === 0));

/* Bill.c step_size(): MIN(11 + level, 15) */
for (const [lv, want] of [[1, 12], [4, 15], [9, 15], [50, 15]])
	eq(`stepSize(${lv})`, Engine.stepSize(lv), want);

/* ------------------------------------------- network layout (Network.c) */

/* Network.c on(): MIN(8 + level, STD_MAX_COMPUTERS) — the target count */
for (const [lv, want] of [[1, 9], [5, 13], [12, 20], [40, 20]]) {
	const g = new Engine({ seed: 1 });
	g.level = lv;
	eq(`target computers at level ${lv}`, g.numComputersFor(lv), want);
}

/*
 * The realised count can be lower.  Computer_setup gives up after 4000
 * attempts at finding a non-overlapping spot, and Network_setup then does
 * `ncomputers = i - 1` — dropping one more than it failed to place.  On a
 * 400x400 field 20 machines genuinely do not always fit, so assert the cap
 * rather than equality.
 */
for (const lv of [1, 5, 12, 20, 40]) {
	const g = game(lv);
	const cap = Math.min(8 + lv, 20);
	check(`level ${lv} places at most the target`,
	      g.computers.length <= cap,
	      `placed ${g.computers.length}, cap ${cap}`);
	check(`level ${lv} still places a playable number`,
	      g.computers.length >= Math.min(cap, 9),
	      `placed ${g.computers.length}`);
	eq(`level ${lv} counters start consistent`,
	   g.sysBase + g.sysOff + g.sysWin, g.computers.length);
}
/* low levels have room to spare, so there placement always succeeds */
for (const [lv, want] of [[1, 9], [5, 13]])
	eq(`computers actually placed at level ${lv}`,
	   game(lv).computers.length, want);

/* Network.c: ncables = MIN(level, ncomputers/2) */
for (const lv of [1, 3, 8, 15, 30]) {
	const g = game(lv);
	eq(`cables at level ${lv}`, g.cables.length,
	   Math.min(lv, Math.floor(g.computers.length / 2)));
}

/* Computer.c: type is RAND(1, NUM_SYS-1) — never the toaster during play */
{
	const g = game(12);
	check('no toaster while playing',
	      g.computers.every(c => c.type >= 1 && c.type <= 7));
	/* Computer.c determineOS(): type < 6 runs its own OS, PCs run a PC OS */
	check('non-PC machines run their matching OS',
	      g.computers.filter(c => c.type < 6).every(c => c.os === c.type));
	check('PC machines run a PC OS (6..10)',
	      g.computers.filter(c => c.type >= 6)
		.every(c => c.os >= 6 && c.os <= 10));
	/* placement respects BORDER(size) = size/10 */
	check('machines placed inside the border',
	      g.computers.every(c => c.x >= 40 && c.y >= 40 &&
				     c.x <= 400 - 40 - 55 &&
				     c.y <= 400 - 40 - 45));
}

/* ------------------------------------------ compatibility (Computer.c) */

/* Computer_compatible(): type == system || (type >= 6 && system >= 6) */
{
	const mac = { type: 1 }, next = { type: 2 }, pc = { type: 6 },
	      pc2 = { type: 7 };
	eq('Apple OS fits a Mac', Engine.computerCompatible(mac, 1), true);
	eq('Linux does not fit a Mac', Engine.computerCompatible(mac, 8), false);
	eq('NeXT OS does not fit a Mac', Engine.computerCompatible(mac, 2), false);
	eq('NeXT OS fits a NeXT', Engine.computerCompatible(next, 2), true);
	eq('Linux fits a PC', Engine.computerCompatible(pc, 8), true);
	eq('Hurd fits a PC', Engine.computerCompatible(pc, 10), true);
	eq('BSD fits the other PC', Engine.computerCompatible(pc2, 7), true);
	eq('Apple OS does not fit a PC', Engine.computerCompatible(pc, 1), false);
	eq('Wingdows is not a PC OS', Engine.computerCompatible(pc, 0), false);
}

/* ------------------------------------------------------- hitboxes ----- */

/*
 * Computer_on() is abs(dx) < w && abs(dy) < h around the TOP-LEFT corner,
 * not a bounding box — the drop zone extends above and left of the machine.
 */
{
	const c = { x: 100, y: 100 };
	eq('drop zone reaches left of the machine',
	   Engine.computerOn(c, 50, 100), true);
	eq('drop zone reaches above the machine',
	   Engine.computerOn(c, 100, 60), true);
	eq('drop zone stops at -55 in x', Engine.computerOn(c, 45, 100), false);
	eq('drop zone stops at -45 in y', Engine.computerOn(c, 100, 55), false);
	eq('drop zone reaches +54 in x', Engine.computerOn(c, 154, 100), true);
	eq('drop zone excludes +55 in x', Engine.computerOn(c, 155, 100), false);
}

/* Bucket_clicked(): x > 0 && x < 24 && y > 0 && y < 24 — strict both ends */
eq('bucket at (1,1)', Engine.bucketClicked(1, 1), true);
eq('bucket excludes (0,0)', Engine.bucketClicked(0, 0), false);
eq('bucket excludes (24,24)', Engine.bucketClicked(24, 24), false);
eq('bucket at (23,23)', Engine.bucketClicked(23, 23), true);

/* Bill_clicked(): strict inequalities on a 24x38 box */
{
	const b = { x: 50, y: 50 };
	eq('bill centre hit', Engine.billClicked(b, 62, 69), true);
	eq('bill excludes left edge', Engine.billClicked(b, 50, 69), false);
	eq('bill excludes right edge', Engine.billClicked(b, 74, 69), false);
	eq('bill inside right edge', Engine.billClicked(b, 73, 69), true);
	eq('bill excludes bottom edge', Engine.billClicked(b, 62, 88), false);
}

/* Bill_clickedstray() uses the OS icon's 28x24, not Bill's box */
{
	const s = { x: 50, y: 50 };
	eq('stray hit uses OS width', Engine.billClickedStray(s, 77, 60), true);
	eq('stray excludes beyond OS width',
	   Engine.billClickedStray(s, 78, 60), false);
	eq('stray excludes beyond OS height',
	   Engine.billClickedStray(s, 60, 74), false);
}

/* ------------------------------------------------------- scoring ------ */

/* Game_button_press(): score += counter^2 * SCORE_BILLPOINTS (5) */
{
	const g = game(1);
	/* park three Bills on the exact same spot so one click takes all 3 */
	g.alive = [];
	for (let i = 0; i < 3; i++) {
		const b = g.billEnter();
		b.x = 200; b.y = 200; b.state = Engine.BILL_STATE_IN;
		g.alive.push(b);
	}
	const n = g.buttonPress(212, 219);
	eq('one click can take three Bills', n, 3);
	eq('three at once scores 3^2 * 5', g.score, 45);

	const g2 = game(1);
	g2.alive = [];
	const b = g2.billEnter();
	b.x = 200; b.y = 200; b.state = Engine.BILL_STATE_IN;
	g2.alive.push(b);
	g2.buttonPress(212, 219);
	eq('one Bill scores 1^2 * 5', g2.score, 5);
}

/* Horde_process_click() skips Bills already dying — no double scoring */
{
	const g = game(1);
	g.alive = [];
	const b = g.billEnter();
	b.x = 200; b.y = 200; b.state = Engine.BILL_STATE_IN;
	g.alive.push(b);
	g.buttonPress(212, 219);
	const after = g.score;
	const n2 = g.buttonPress(212, 219);
	eq('a dying Bill cannot be killed again', n2, 0);
	eq('and scores nothing more', g.score, after);
}

/* ------------------------------------------- the OS theft (Bill.c) ---- */

/*
 * update_at(): frame 6 takes the OS (base--, off++), frame 11 installs
 * Wingdows (off--, win++), frame 13 sends him off screen.
 */
{
	const g = game(1);
	const comp = g.computers[0];
	const originalOS = comp.os;
	g.alive = [];
	const b = g.billEnter();
	b.state = Engine.BILL_STATE_AT;
	b.target_c = 0;
	b.index = 0;
	b.cels = 'A';
	b.cargo = Engine.OS_WINGDOWS;
	g.alive.push(b);
	comp.busy = 1;

	const base0 = g.sysBase, off0 = g.sysOff, win0 = g.sysWin;

	for (let f = 1; f <= 6; f++) g.billUpdate(b);
	eq('frame 6 powers the machine off', comp.os, Engine.OS_OFF);
	eq('frame 6 moves it out of "base"', g.sysBase, base0 - 1);
	eq('frame 6 moves it into "off"', g.sysOff, off0 + 1);
	eq('Bill is now carrying the stolen OS', b.cargo, originalOS);

	for (let f = 7; f <= 11; f++) g.billUpdate(b);
	eq('frame 11 installs Wingdows', comp.os, Engine.OS_WINGDOWS);
	eq('frame 11 clears "off"', g.sysOff, off0);
	eq('frame 11 increments "infected"', g.sysWin, win0 + 1);

	g.billUpdate(b);	/* 12 */
	g.billUpdate(b);	/* 13 -> leaves */
	eq('after frame 13 he flees', b.state, Engine.BILL_STATE_OUT);
	eq('and releases the machine', comp.busy, 0);
}

/* update_dying(): carrying a real OS leaves a stray; Wingdows/none vanishes */
{
	const g = game(1);
	g.alive = []; g.strays = [];
	const b = g.billEnter();
	b.cargo = 8;			/* Linux */
	Engine.billSetDying(b);
	g.alive = [b];
	for (let i = 0; i < 6; i++) g.billUpdate(b);
	eq('a stolen OS is dropped as a stray', g.strays.length, 1);
	eq('the stray keeps the stolen OS', g.strays[0].cargo, 8);

	const g2 = game(1);
	g2.alive = []; g2.strays = [];
	const b2 = g2.billEnter();	/* cargo defaults to Wingdows */
	Engine.billSetDying(b2);
	g2.alive = [b2];
	for (let i = 0; i < 6; i++) g2.billUpdate(b2);
	eq('a Bill carrying only Wingdows leaves nothing', g2.strays.length, 0);
}

/* Game_button_release(): restoring a stray to a compatible machine */
{
	const g = game(1);
	const comp = g.computers.find(c => c.type < 6);
	comp.os = Engine.OS_WINGDOWS;
	g.sysBase--; g.sysWin++;
	const base0 = g.sysBase, win0 = g.sysWin;

	const stray = g.billEnter();
	stray.state = Engine.BILL_STATE_STRAY;
	stray.cargo = comp.type;		/* its own OS */
	stray.x = 300; stray.y = 300;
	g.strays = [stray];
	g.alive = [];

	g.buttonPress(stray.x + 14, stray.y + 12);
	check('the stray was picked up', g.grabbed === stray);
	const ok = g.buttonRelease(comp.x, comp.y);
	eq('drop onto a compatible infected machine succeeds', ok, true);
	eq('the machine runs its OS again', comp.os, comp.type);
	eq('"base" goes back up', g.sysBase, base0 + 1);
	eq('"infected" goes back down', g.sysWin, win0 - 1);
	eq('the stray is consumed', g.strays.length, 0);
}

/* an incompatible drop must bounce back, changing nothing */
{
	const g = game(1);
	const mac = g.computers.find(c => c.type === 1);
	const other = g.computers.find(c => c.type >= 6);
	if (mac && other) {
		mac.os = Engine.OS_OFF;
		const stray = g.billEnter();
		stray.state = Engine.BILL_STATE_STRAY;
		stray.cargo = 8;		/* Linux onto a Mac */
		stray.x = 300; stray.y = 300;
		g.strays = [stray]; g.alive = [];
		g.buttonPress(stray.x + 14, stray.y + 12);
		const base0 = g.sysBase;
		const ok = g.buttonRelease(mac.x, mac.y);
		eq('Linux onto a Mac is refused', ok, false);
		eq('the Mac stays off', mac.os, Engine.OS_OFF);
		eq('counters unchanged', g.sysBase, base0);
		eq('the OS returns to the floor', g.strays.length, 1);
	}
}

/* a machine already running its own OS will not accept a drop */
{
	const g = game(1);
	const comp = g.computers.find(c => c.type < 6);
	const stray = g.billEnter();
	stray.state = Engine.BILL_STATE_STRAY;
	stray.cargo = comp.type;
	stray.x = 300; stray.y = 300;
	g.strays = [stray]; g.alive = [];
	g.buttonPress(stray.x + 14, stray.y + 12);
	const ok = g.buttonRelease(comp.x, comp.y);
	eq('a healthy machine refuses a second OS', ok, false);
}

/* ------------------------------------------------ sparks (Cable.c) ---- */

{
	const g = game(5);
	const cable = g.cables[0];
	const a = g.computers[cable.c1], b = g.computers[cable.c2];

	/* nothing happens while both ends agree */
	g.cableUpdate(cable);
	eq('no spark while neither end is infected', cable.active, 0);

	/* infect one end: the spark launches immediately (SPARK_DELAY is dead
	 * code in 2.1 — assigned but never read) */
	a.os = Engine.OS_WINGDOWS;
	g.cableUpdate(cable);
	eq('infecting one end launches a spark at once', cable.active, 1);

	/* run it to the far end */
	let guard = 0;
	while (cable.active && guard++ < 500) g.cableUpdate(cable);
	eq('the spark infects the far machine', b.os, Engine.OS_WINGDOWS);
	check('the spark stops on arrival', cable.active === 0);
}

/* a busy machine (Bill working on it) is not infected by an arriving spark */
{
	const g = game(5);
	const cable = g.cables[0];
	const a = g.computers[cable.c1], b = g.computers[cable.c2];
	a.os = Engine.OS_WINGDOWS;
	b.busy = 1;
	const bOS = b.os;
	let guard = 0;
	g.cableUpdate(cable);
	while (cable.active && guard++ < 500) g.cableUpdate(cable);
	eq('a busy machine survives the spark', b.os, bOS);
}

/* Bucket_release(): dousing a spark anywhere along the wire */
{
	const g = game(5);
	const cable = g.cables[0];
	g.computers[cable.c1].os = Engine.OS_WINGDOWS;
	g.cableUpdate(cable);
	g.cableUpdate(cable);
	check('spark is travelling', cable.active === 1);
	g.bucketRelease(cable.x, cable.y);
	eq('the bucket puts it out', cable.active, 0);
}

/* ------------------------------------------- end conditions (Game.c) -- */

/*
 * Game_update(): base + off <= 1 ends the game.  The losing tick only sets
 * STATE_END; the original handles that state on the *next* timer tick, which
 * is when the dialog appears and the machines become toasters.
 */
{
	const g = game(1);
	g.cables = [];			/* isolate from spark infections */
	g.alive = [];
	g.billsOn = 1; g.billsOff = 0;	/* no spawns, no level completion */

	const infectOne = () => {
		const c = g.computers.find(x => x.os !== Engine.OS_WINGDOWS);
		c.os = Engine.OS_WINGDOWS;
		g.sysBase--; g.sysWin++;
	};
	while (g.sysBase > 2) infectOne();

	eq('two productive machines keeps it alive',
	   g.tick().some(e => e.type === 'gameover'), false);
	eq('and it is still playing', g.state, Engine.STATE_PLAYING);

	infectOne();			/* down to one */
	const t1 = g.tick();
	eq('the losing tick arms the end state', g.state, Engine.STATE_END);
	eq('but reports nothing yet', t1.some(e => e.type === 'gameover'), false);

	const t2 = g.tick();
	check('the next tick reports game over',
	      t2.some(e => e.type === 'gameover'));
	check('every machine becomes a toaster',
	      g.computers.every(c => c.type === Engine.COMPUTER_TOASTER &&
				     c.os === Engine.OS_OFF));
	eq('and the cables are gone', g.cables.length, 0);
	eq('the game is now idle', g.state, Engine.STATE_WAITING);
}

/*
 * Game_update() checks the level-clear condition BEFORE the game-over one,
 * so when both are true on the same tick, losing wins.
 */
{
	const g = game(1);
	g.cables = [];
	g.alive = [];
	g.billsOn = 0; g.billsOff = 0;		/* level would be complete */
	while (g.sysBase > 1) {
		const c = g.computers.find(x => x.os !== Engine.OS_WINGDOWS);
		c.os = Engine.OS_WINGDOWS;
		g.sysBase--; g.sysWin++;
	}
	g.tick();
	eq('losing beats clearing on the same tick', g.state, Engine.STATE_END);
}

/* clearing every Bill advances the level */
{
	const g = game(3);
	g.billsOn = 0; g.billsOff = 0;
	const evs = g.tick();			/* enters BETWEEN */
	const evs2 = g.tick();			/* emits levelcomplete */
	const all = evs.concat(evs2);
	check('clearing the Bills completes the level',
	      all.some(e => e.type === 'levelcomplete'));
	eq('and the next level is set up', g.level, 4);
	eq('with a fresh Bill pool', g.billsOff, g.billsForLevel(4));
}

/* a fleeing Bill that leaves the screen returns to the off-screen pool */
{
	const g = game(1);
	g.alive = [];
	const b = g.billEnter();
	b.state = Engine.BILL_STATE_OUT;
	b.x = -500; b.y = -500;		/* already clear of the field */
	g.alive = [b];
	const on0 = g.billsOn, off0 = g.billsOff;
	g.billUpdate(b);
	eq('escaping decrements on-screen', g.billsOn, on0 - 1);
	eq('escaping returns him to the pool', g.billsOff, off0 + 1);
	check('so the level cannot be cleared by letting them leave',
	      g.billsOn + g.billsOff === on0 + off0);
}

/* ------------------------------------------------ warp (Game.c) ------- */
{
	const g = game(5);
	g.warpToLevel(3);
	eq('cannot warp backwards mid-game', g.level, 5);
	g.warpToLevel(9);
	eq('can warp forwards', g.level, 9);
}

/* -------------------------------------------------------- summary ----- */

console.log(`\nRule conformance: ${pass} passed, ${fail} failed`);
if (fail) {
	console.log('\nFailures:');
	for (const f of failures) console.log('  ✗ ' + f);
	process.exit(1);
}
console.log('All assertions match the xbill 2.1 C sources.\n');
