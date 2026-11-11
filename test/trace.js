/*
 * Emits the same per-tick trace as the C harness in /tmp/xbilldiff, driven by
 * glibc's rand() so both sides consume an identical random stream.
 *
 *   node test/trace.js <seed> <startlevel> <maxticks> <inputscript>
 *
 * Any difference in output means the port diverged from the original.
 */
'use strict';

const fs = require('fs');
const Engine = require('../src/engine.js');
const glibcRand = require('../src/glibcrand.js');

const seed = parseInt(process.argv[2], 10);
const startLevel = parseInt(process.argv[3], 10);
const maxTicks = parseInt(process.argv[4], 10);
const scriptPath = process.argv[5];

/* input script: "<tick> <p|r> <x> <y>" — must not touch the rng */
const events = [];
if (scriptPath && scriptPath !== '/dev/null' && fs.existsSync(scriptPath)) {
	for (const line of fs.readFileSync(scriptPath, 'utf8').split('\n')) {
		const m = line.trim().split(/\s+/);
		if (m.length !== 4) continue;
		events.push({
			tick: parseInt(m[0], 10),
			kind: m[1][0],
			x: parseInt(m[2], 10),
			y: parseInt(m[3], 10),
		});
	}
}

const game = new Engine({ randInt: glibcRand(seed) });
game.start(startLevel);

const out = [];
let ei = 0;
let over = false;

for (let t = 0; t < maxTicks && !over; t++) {
	while (ei < events.length && events[ei].tick === t) {
		const e = events[ei];
		if (e.kind === 'p') game.buttonPress(e.x, e.y);
		else game.buttonRelease(e.x, e.y);
		ei++;
	}

	const evs = game.tick();

	let s = `t=${t} sc=${game.score} lv=${game.level} ` +
		`b=${game.billsOn}/${game.billsOff} ` +
		`s=${game.sysBase}/${game.sysOff}/${game.sysWin}`;

	s += ' |C';
	for (const c of game.computers)
		s += ` ${c.type},${c.os},${c.x},${c.y},${c.busy}`;

	s += ' |B';
	for (const b of game.alive)
		s += ` ${b.state},${b.x},${b.y},${b.index},${b.cargo},${b.target_c}`;

	s += ' |S';
	for (const b of game.strays)
		s += ` ${b.x},${b.y},${b.cargo}`;

	out.push(s);

	if (evs.some(e => e.type === 'gameover')) over = true;
}

process.stdout.write(out.join('\n') + '\n');
