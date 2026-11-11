/*
 * Browser front end.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 *
 * Part of xbill-web, a browser port of XBill 2.1 by Brian Wellington and
 * Matias Duarte, Copyright 1994-2001.  Original is GPL-2.0-or-later;
 * this derivative work is distributed under the same terms.
 *
 * The engine ticks at the original's 5Hz (200ms).  Rendering runs at display
 * rate and interpolates between the last two logic positions, so the motion
 * is smooth without altering a single rule — every decision the game makes
 * still happens on the 200ms boundary, exactly as in xbill 2.1.
 */
(function () {
'use strict';

const Engine = window.XBillEngine;
const Sprites = window.XBillSprites;

const LOGIC = Engine.LOGIC_SIZE;		/* 400x400 play field */
const TICK_MS = Engine.TICK_MS;			/* 200ms */

/* ------------------------------------------------------------- elements */

const canvas = document.getElementById('field');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const overlayEl = document.getElementById('overlay');
const overlayBody = document.getElementById('overlay-body');

/* ----------------------------------------------------------------- state */

let game = null;
let running = false;
let paused = false;
let lastTick = 0;
let scale = 2;
let renderScale = 2;		/* canvas backing-store multiplier */
let mouse = { x: -100, y: -100, inside: false, down: false };

/* ------------------------------------------------------------ high scores */

const SCORE_KEY = 'xbill.highscores.v1';

function loadScores() {
	try {
		const raw = localStorage.getItem(SCORE_KEY);
		const list = raw ? JSON.parse(raw) : [];
		return Array.isArray(list) ? list : [];
	} catch (e) {
		return [];
	}
}

function saveScore(name, level, score) {
	const list = loadScores();
	list.push({ name, level, score });
	list.sort((a, b) => b.score - a.score);
	list.length = Math.min(list.length, 10);
	try {
		localStorage.setItem(SCORE_KEY, JSON.stringify(list));
	} catch (e) {
		/* private browsing — scores just won't persist */
	}
	return list;
}

function isHighScore(score) {
	const list = loadScores();
	return score > 0 && (list.length < 10 || score > list[list.length - 1].score);
}

function scoreTable(list, highlightIdx) {
	if (!list.length) return '<p class="muted">No scores yet.</p>';
	let h = '<table class="scores"><tr><th>#</th><th>Name</th>' +
		'<th>Level</th><th>Score</th></tr>';
	list.forEach((s, i) => {
		const cls = i === highlightIdx ? ' class="hl"' : '';
		h += `<tr${cls}><td>${i + 1}</td><td>${escapeHtml(s.name)}</td>` +
		     `<td>${s.level}</td><td>${s.score}</td></tr>`;
	});
	return h + '</table>';
}

function escapeHtml(s) {
	return String(s).replace(/[&<>"']/g, c => ({
		'&': '&amp;', '<': '&lt;', '>': '&gt;',
		'"': '&quot;', "'": '&#39;',
	}[c]));
}

/* ---------------------------------------------------------------- sizing */

function resize() {
	/*
	 * Measure the viewport, not #field-wrap: the wrap is shrink-to-fit
	 * inside a flex column, so its width is the canvas width and reading
	 * it back would be circular (and would pin the board at its minimum).
	 */
	const availW = Math.min(document.body.clientWidth - 24, 980);
	const availH = window.innerHeight - 190;
	scale = Math.max(1, Math.min(3.2, Math.min(availW, availH) / LOGIC));

	/*
	 * Supersample to at least 2x regardless of devicePixelRatio.  The art
	 * is vector and the scene is small, so the extra fill costs little and
	 * it keeps edges clean on ordinary 1x displays.
	 */
	renderScale = Math.max(window.devicePixelRatio || 1, 2);
	const cssSize = Math.round(LOGIC * scale);
	canvas.style.width = cssSize + 'px';
	canvas.style.height = cssSize + 'px';
	canvas.width = Math.round(cssSize * renderScale);
	canvas.height = Math.round(cssSize * renderScale);
	render(1);
}

/* Convert a pointer event to the engine's 400x400 logical coordinates. */
function toLogical(evt) {
	const r = canvas.getBoundingClientRect();
	const src = evt.touches && evt.touches.length ? evt.touches[0]
		: (evt.changedTouches && evt.changedTouches.length
			? evt.changedTouches[0] : evt);
	return {
		x: Math.round((src.clientX - r.left) / r.width * LOGIC),
		y: Math.round((src.clientY - r.top) / r.height * LOGIC),
	};
}

/* --------------------------------------------------------------- drawing */

/*
 * Interpolate a sprite's position between its previous and current logic
 * positions.  A large jump means it teleported (spawned, retargeted, or was
 * knocked down) so we snap instead of sliding it across the screen.
 */
const SNAP_DIST = 60;

function lerpPos(px, py, x, y, a) {
	if (Math.abs(x - px) > SNAP_DIST || Math.abs(y - py) > SNAP_DIST)
		return { x, y };
	return { x: px + (x - px) * a, y: py + (y - py) * a };
}

function render(alpha) {
	const s = scale * renderScale;
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.setTransform(s, 0, 0, s, 0, 0);
	ctx.imageSmoothingEnabled = true;

	Sprites.drawBackground(ctx, LOGIC, LOGIC);

	if (!game) {
		drawIdleBanner();
		return;
	}

	/* cables and their sparks sit under the machines */
	for (const cable of game.cables) {
		Sprites.drawCable(ctx, cable.x1, cable.y1, cable.x2, cable.y2);
		if (cable.active) {
			const p = lerpPos(cable.px, cable.py,
					  cable.x, cable.y, alpha);
			Sprites.drawSpark(ctx, cable.index,
					  p.x - Engine.SPARK_W / 2,
					  p.y - Engine.SPARK_H / 2);
		}
	}

	for (const c of game.computers) {
		Sprites.drawComputer(ctx, c.type, c.x, c.y);
		if (c.os !== Engine.OS_OFF)
			Sprites.drawOS(ctx, c.os,
				       c.x + Engine.OS_OFFSET,
				       c.y + Engine.OS_OFFSET);
	}

	/* dropped operating systems lying on the floor */
	for (const b of game.strays)
		Sprites.drawOS(ctx, b.cargo, b.x, b.y);

	for (const b of game.alive)
		drawBill(b, alpha);

	if (!game.bucketGrabbed)
		Sprites.drawBucket(ctx, 0, 0);

	drawCursorCargo();
}

function drawBill(b, alpha) {
	const S = Engine;

	if (b.state === S.BILL_STATE_AT) {
		/* Bill.c draw_at: the animation frame is pinned to the machine */
		const comp = game.computers[b.target_c];
		if (!comp) return;
		if (b.index > 6 && b.index < 12)
			Sprites.drawOS(ctx, 0, b.x + b.sx, b.y + b.sy);
		if (b.cargo >= 0)
			Sprites.drawOS(ctx, b.cargo,
				       b.x + b.x_offset, b.y + b.y_offset);
		Sprites.drawBill(ctx, 'A', b.index, comp.x, comp.y);
		return;
	}

	const p = lerpPos(b.px, b.py, b.x, b.y, alpha);
	if (b.cargo >= 0)
		Sprites.drawOS(ctx, b.cargo, p.x + b.x_offset, p.y + b.y_offset);

	const strip = b.state === S.BILL_STATE_DYING ? 'D' : b.cels;
	Sprites.drawBill(ctx, strip, Math.max(0, b.index), p.x, p.y);
}

/* What the pointer is carrying, drawn where the pointer is. */
function drawCursorCargo() {
	if (!mouse.inside) return;
	if (game.grabbed) {
		Sprites.drawOS(ctx, game.grabbed.cargo,
			       mouse.x - Engine.OS_W / 2,
			       mouse.y - Engine.OS_H / 2);
	} else if (game.bucketGrabbed) {
		Sprites.drawBucket(ctx,
				   mouse.x - Engine.BUCKET_W / 2,
				   mouse.y - Engine.BUCKET_H / 2);
	}
}

function drawIdleBanner() {
	ctx.save();
	ctx.fillStyle = 'rgba(0,0,0,0.35)';
	ctx.fillRect(0, 0, LOGIC, LOGIC);
	ctx.fillStyle = '#e8e8f0';
	ctx.font = 'bold 26px Georgia, serif';
	ctx.textAlign = 'center';
	ctx.fillText('XBill', LOGIC / 2, LOGIC / 2 - 14);
	ctx.font = '12px system-ui, sans-serif';
	ctx.fillStyle = '#a8a8c0';
	ctx.fillText('Stop the virus. Save your computers.',
		     LOGIC / 2, LOGIC / 2 + 10);
	ctx.fillText('Press New Game to start.', LOGIC / 2, LOGIC / 2 + 30);
	ctx.restore();
}

/* ----------------------------------------------------------- game control */

function newGame(level) {
	game = new Engine({ screensize: LOGIC });
	game.start(level || 1);
	running = true;
	paused = false;
	lastTick = performance.now();
	hideOverlay();
	updateStatus();
	updatePauseButton();
}

function updateStatus() {
	if (!game) {
		statusEl.textContent =
			'Bill:-/-  System:-/-/-  Level:-  Score:-';
		return;
	}
	statusEl.textContent = game.statusLine();
}

function updatePauseButton() {
	const btn = document.getElementById('btn-pause');
	btn.textContent = paused ? 'Resume' : 'Pause';
	btn.disabled = !running;
}

function doTick() {
	const events = game.tick();
	updateStatus();

	for (const ev of events) {
		if (ev.type === 'levelcomplete') {
			paused = true;
			updatePauseButton();
			showOverlay(
				`Level ${ev.level} cleared`,
				`<p class="big">Score: ${ev.score}</p>
				 <p class="muted">Level ${ev.level + 1} is
				 waiting.</p>`,
				[{ label: 'Continue', action: resume }]);
		} else if (ev.type === 'gameover') {
			endGame(ev);
		}
	}
}

function endGame(ev) {
	running = false;
	paused = false;
	updatePauseButton();
	updateStatus();

	if (isHighScore(ev.score)) {
		showOverlay('Game over',
			`<p class="big">Score: ${ev.score} &middot;
			 Level ${ev.level}</p>
			 <p>That's a high score. Your name:</p>
			 <input id="hs-name" maxlength="16" value="Player"
			  autocomplete="off">`,
			[{ label: 'Save', action: () => {
				const el = document.getElementById('hs-name');
				const name = (el.value || 'Player').slice(0, 16);
				const list = saveScore(name, ev.level, ev.score);
				const idx = list.findIndex(s =>
					s.name === name && s.score === ev.score);
				showOverlay('High scores',
					scoreTable(list, idx),
					[{ label: 'New game',
					   action: () => newGame(1) },
					 { label: 'Close', action: hideOverlay }]);
			} }]);
		const input = document.getElementById('hs-name');
		if (input) { input.focus(); input.select(); }
	} else {
		showOverlay('Game over',
			`<p class="big">Score: ${ev.score} &middot;
			 Level ${ev.level}</p>
			 <p class="muted">Your network is toast.</p>`,
			[{ label: 'New game', action: () => newGame(1) },
			 { label: 'High scores', action: showScores }]);
	}
}

function resume() {
	hideOverlay();
	paused = false;
	lastTick = performance.now();
	updatePauseButton();
}

function togglePause() {
	if (!running) return;
	paused = !paused;
	if (!paused) lastTick = performance.now();
	updatePauseButton();
	if (paused)
		showOverlay('Paused', '<p class="muted">The clock is stopped.</p>',
			    [{ label: 'Resume', action: resume }]);
	else
		hideOverlay();
}

/* ---------------------------------------------------------------- overlay */

function showOverlay(title, bodyHtml, buttons) {
	overlayBody.innerHTML =
		`<h2>${escapeHtml(title)}</h2>${bodyHtml}<div class="row"></div>`;
	const row = overlayBody.querySelector('.row');
	for (const b of (buttons || [])) {
		const el = document.createElement('button');
		el.textContent = b.label;
		el.onclick = b.action;
		row.appendChild(el);
	}
	overlayEl.classList.add('show');
}

function hideOverlay() {
	overlayEl.classList.remove('show');
}

function showScores() {
	showOverlay('High scores', scoreTable(loadScores(), -1),
		    [{ label: 'Close', action: hideOverlay }]);
}

function showHelp() {
	showOverlay('How to play', `
<p>You are the sysadmin. The little men in suits are carrying
<b>Wingdows</b>&nbsp;&mdash; a virus dressed up as an operating system
&mdash; toward your computers.</p>
<ul>
  <li><b>Click a Bill</b> to stop him. Clicking several at once scores
      <i>n&sup2; &times; 5</i>, so catching a cluster is worth far more than
      picking them off one by one.</li>
  <li>If a Bill reaches a machine he <b>steals its OS</b>, installs the virus,
      and runs off the screen with your software.</li>
  <li>A Bill killed while carrying an OS <b>drops it on the floor</b>.
      Drag it back onto any <b>compatible</b> machine that is off or infected.
      Mac OS only fits a Mac; the PC operating systems (OS/2, BSD, Linux,
      Red Hat, Hurd) fit either PC.</li>
  <li>Infected machines send a <b>spark</b> down the network cables. Drag the
      <b>bucket of water</b> from the top-left corner onto a spark to put it
      out before it reaches the far end.</li>
  <li>The game ends when only one productive computer is left.</li>
</ul>
<p class="muted">Status bar: Bills on/off screen &middot; computers
running&nbsp;/&nbsp;off&nbsp;/&nbsp;infected &middot; level &middot; score.</p>
<p class="muted">Keys: <b>N</b> new game, <b>P</b> pause, <b>H</b> help.</p>`,
		[{ label: 'Close', action: hideOverlay }]);
}

function showAbout() {
	showOverlay('About', `
<p><b>XBill</b> &mdash; a browser port of the X11 game by
<b>Brian Wellington</b> and <b>Matias Duarte</b> (Psychosoft, 1994&ndash;2001),
released under the GPL&nbsp;v2.</p>
<p>The rules here are a direct translation of the xbill&nbsp;2.1 C sources:
same 200&nbsp;ms tick, same spawn curve, same hitboxes, same scoring, same
integer arithmetic. It was verified by compiling the original logic headless
and checking that both produce identical state traces, tick for tick, from the
same random stream.</p>
<p>The artwork is redrawn as vector graphics so it stays sharp at any size;
the original shipped tiny bitmaps.</p>`,
		[{ label: 'Close', action: hideOverlay }]);
}

function askLevel() {
	showOverlay('Jump to level', `
<p>Start at a higher level. You cannot warp backwards during a game.</p>
<input id="lvl" type="number" min="1" max="999" value="${game ? game.level + 1 : 1}">
<p class="muted">Fair warning: from level 45 the original has a signedness
bug that makes Bills spawn every single tick. It is preserved here.</p>`,
		[{ label: 'Go', action: () => {
			const v = parseInt(
				document.getElementById('lvl').value, 10);
			if (!isFinite(v) || v < 1) return;
			if (!game || !running) newGame(v);
			else { game.warpToLevel(v); updateStatus(); }
			hideOverlay();
		} },
		 { label: 'Cancel', action: hideOverlay }]);
}

/* ------------------------------------------------------------------ input */

function pressAt(evt) {
	if (!game || !running || paused) return;
	const p = toLogical(evt);
	mouse.x = p.x; mouse.y = p.y; mouse.inside = true; mouse.down = true;
	game.buttonPress(p.x, p.y);
	updateStatus();
	updateCursor();
}

function releaseAt(evt) {
	if (!game || !running || paused) return;
	const p = toLogical(evt);
	mouse.x = p.x; mouse.y = p.y; mouse.down = false;
	game.buttonRelease(p.x, p.y);
	updateStatus();
	updateCursor();
}

function updateCursor() {
	const carrying = game && (game.grabbed || game.bucketGrabbed);
	canvas.style.cursor = carrying ? 'none'
		: (mouse.down ? 'grabbing' : 'crosshair');
}

canvas.addEventListener('mousedown', e => { e.preventDefault(); pressAt(e); });
window.addEventListener('mouseup', e => {
	if (game && running && !paused && mouse.down) releaseAt(e);
	mouse.down = false;
	updateCursor();
});
canvas.addEventListener('mousemove', e => {
	const p = toLogical(e);
	mouse.x = p.x; mouse.y = p.y; mouse.inside = true;
});
canvas.addEventListener('mouseleave', () => { mouse.inside = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('touchstart', e => { e.preventDefault(); pressAt(e); },
			{ passive: false });
canvas.addEventListener('touchmove', e => {
	e.preventDefault();
	const p = toLogical(e);
	mouse.x = p.x; mouse.y = p.y; mouse.inside = true;
}, { passive: false });
canvas.addEventListener('touchend', e => { e.preventDefault(); releaseAt(e); },
			{ passive: false });

window.addEventListener('keydown', e => {
	if (e.target.tagName === 'INPUT') {
		if (e.key === 'Enter') {
			const btn = overlayBody.querySelector('.row button');
			if (btn) btn.click();
		}
		return;
	}
	const k = e.key.toLowerCase();
	if (k === 'n') newGame(1);
	else if (k === 'p') togglePause();
	else if (k === 'h' || k === '?') showHelp();
	else if (k === 'escape') hideOverlay();
});

document.getElementById('btn-new').onclick = () => newGame(1);
document.getElementById('btn-pause').onclick = togglePause;
document.getElementById('btn-level').onclick = askLevel;
document.getElementById('btn-scores').onclick = showScores;
document.getElementById('btn-help').onclick = showHelp;
document.getElementById('btn-about').onclick = showAbout;

window.addEventListener('resize', resize);

/* ------------------------------------------------------------- main loop */

function frame(now) {
	if (running && !paused) {
		/* a backgrounded tab must not fast-forward the whole game */
		if (now - lastTick > 2000) lastTick = now - TICK_MS;
		while (now - lastTick >= TICK_MS) {
			lastTick += TICK_MS;
			doTick();
			if (!running || paused) break;
		}
	}
	const alpha = (running && !paused)
		? Math.max(0, Math.min(1, (now - lastTick) / TICK_MS)) : 1;
	render(alpha);
	requestAnimationFrame(frame);
}

resize();
updateStatus();
updatePauseButton();
requestAnimationFrame(frame);

})();
