/*
 * Differential test: the JS port vs the ORIGINAL xbill 2.1 C sources.
 *
 * For each seed we let a bot play the JS engine (driven by a glibc-identical
 * rand stream), record every button event it produced, then replay that exact
 * script through the C logic compiled headless.  Both sides dump a per-tick
 * trace of score, level, counters, every computer and every Bill.  Any
 * difference at all is a port bug.
 *
 *   node test/difftest.js [harnessDir]
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const Engine = require('../src/engine.js');
const glibcRand = require('../src/glibcrand.js');
const { bots } = require('./bot.js');

const HARNESS_DIR = process.argv[2] || '/tmp/xbilldiff';
const HARNESS = path.join(HARNESS_DIR, 'harness');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'xbilldiff-'));

if (!fs.existsSync(HARNESS)) {
	console.error(`No C harness at ${HARNESS} — skipping differential test.`);
	console.error('Build it first (see test/README.md).');
	process.exit(3);
}

const MAX_TICKS = 14000;

/* Run the bot against the JS engine and capture the input script. */
function recordScript(seed, startLevel, botName) {
	const game = new Engine({ randInt: glibcRand(seed) });
	game.start(startLevel);
	const bot = bots[botName](seed ^ 0x5bd1e995);
	const lines = [];
	let over = false;

	for (let t = 0; t < MAX_TICKS && !over; t++) {
		for (const e of bot.act(game, t)) {
			lines.push(`${t} ${e.kind} ${e.x} ${e.y}`);
			if (e.kind === 'p') game.buttonPress(e.x, e.y);
			else game.buttonRelease(e.x, e.y);
		}
		const evs = game.tick();
		if (evs.some(ev => ev.type === 'gameover')) over = true;
	}
	return lines.join('\n') + '\n';
}

function run(seed, startLevel, botName) {
	const script = recordScript(seed, startLevel, botName);
	const scriptPath = path.join(TMP, `s${seed}_${botName}.txt`);
	fs.writeFileSync(scriptPath, script);

	const cOut = execFileSync(HARNESS,
		[String(seed), String(startLevel), String(MAX_TICKS), scriptPath],
		{ maxBuffer: 1 << 28 }).toString();

	const jsOut = execFileSync(process.execPath,
		[path.join(__dirname, 'trace.js'), String(seed),
		 String(startLevel), String(MAX_TICKS), scriptPath],
		{ maxBuffer: 1 << 28 }).toString();

	if (cOut === jsOut)
		return { ok: true, ticks: cOut.trimEnd().split('\n').length };

	const a = cOut.split('\n'), b = jsOut.split('\n');
	let i = 0;
	while (i < a.length && i < b.length && a[i] === b[i]) i++;
	return {
		ok: false,
		line: i + 1,
		c: (a[i] || '<eof>').slice(0, 220),
		js: (b[i] || '<eof>').slice(0, 220),
		scriptPath,
	};
}

/* ------------------------------------------------------------------ main */

const cases = [];
for (let i = 0; i < 12; i++)
	cases.push({ seed: 1000 + i * 7919, level: 1, bot: 'skilled' });
for (let i = 0; i < 12; i++)
	cases.push({ seed: 50000 + i * 104729, level: 1, bot: 'chaos' });
for (let i = 0; i < 6; i++)
	cases.push({ seed: 90000 + i * 31337, level: 1, bot: 'random' });
for (let i = 0; i < 5; i++)
	cases.push({ seed: 7000 + i * 613, level: 1, bot: 'sloppy' });
/* start deep, where more Bills, cables and PC machines are in play */
for (const lv of [3, 7, 12, 20, 40])
	cases.push({ seed: 424242 + lv, level: lv, bot: 'skilled' });
for (const lv of [5, 15, 30])
	cases.push({ seed: 777000 + lv, level: lv, bot: 'chaos' });

let pass = 0, fail = 0, totalTicks = 0;
console.log(`Differential test: JS port vs original xbill 2.1 C logic`);
console.log(`${cases.length} games, identical glibc rand stream\n`);

for (const c of cases) {
	const r = run(c.seed, c.level, c.bot);
	if (r.ok) {
		pass++;
		totalTicks += r.ticks;
		process.stdout.write('.');
	} else {
		fail++;
		console.log(`\n❌ seed=${c.seed} level=${c.level} bot=${c.bot}`);
		console.log(`   first difference at trace line ${r.line}`);
		console.log(`   C  : ${r.c}`);
		console.log(`   JS : ${r.js}`);
		console.log(`   script: ${r.scriptPath}`);
	}
}

console.log(`\n\n${pass}/${cases.length} games matched the original exactly`);
console.log(`${totalTicks} ticks compared`);
if (fail === 0) fs.rmSync(TMP, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
