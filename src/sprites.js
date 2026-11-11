/*
 * XBill — sprite artwork.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 *
 * Part of xbill-web, a browser port of XBill 2.1 by Brian Wellington and
 * Matias Duarte, Copyright 1994-2001.  Original is GPL-2.0-or-later;
 * this derivative work is distributed under the same terms.
 *
 * The original shipped 1-bit-ish XPM bitmaps at 24x38 (Bill), 55x45
 * (machines) and 28x24 (OS logos).  These are vector redraws of that same
 * artwork: same compositions, same palettes, same silhouettes, but resolution
 * independent so they stay sharp however far the playfield is scaled up.
 *
 * Coordinate contract: the caller has already applied the scale transform.
 * Every function draws in the original's logical units with (x, y) as the
 * sprite's top-left corner, and leaves the context exactly as it found it.
 */
(function (root, factory) {
	if (typeof module === 'object' && module.exports)
		module.exports = factory();
	else
		root.XBillSprites = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/* ---------------------------------------------------------------- palette */

const P = {
	/* Bill — the 1990s Gates: blonde mop, oversized round glasses, smirk */
	hair:      '#d9b45c',
	hairLit:   '#f0d088',
	hairDark:  '#a88234',
	skin:      '#f6e3b0',
	skinShade: '#ddc488',
	suit:      '#f2ecc0',
	suitShade: '#d8cf9c',
	tie:       '#4a4458',
	shoe:      '#6b5a74',
	ink:       '#2a2436',
	lens:      '#ffffff',
	blood:     '#e01010',
	bloodDark: '#9c0000',

	/* machines */
	beige:     '#d7cfb4',
	beigeLit:  '#efe8d2',
	beigeDark: '#9f9880',
	grey:      '#c2c2cc',
	greyLit:   '#e6e6ee',
	greyDark:  '#83838f',
	black:     '#2b2b31',
	blackLit:  '#45454e',
	screen:    '#0b0b10',
	chrome:    '#d8dce2',
	chromeLit: '#f4f6f8',
	chromeDk:  '#9aa0a8',
	led:       '#39e05a',
	ledRed:    '#e0392f',

	/* playfield */
	bg0:       '#1b1b23',
	bg1:       '#15151c',
	cable:     '#0d0d12',
	cableLit:  '#4a4a5e',
};

/* clamp an animation index without throwing */
function clampIdx(i, n) {
	i = Math.floor(Number(i));
	if (!isFinite(i)) return 0;
	return i < 0 ? 0 : (i >= n ? n - 1 : i);
}

/* rounded rect path helper */
function rr(ctx, x, y, w, h, r) {
	r = Math.min(r, w / 2, h / 2);
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

function fillRR(ctx, x, y, w, h, r, fill) {
	rr(ctx, x, y, w, h, r);
	ctx.fillStyle = fill;
	ctx.fill();
}

/* ====================================================== OS logos (28x24) */

const OS_DRAW = [];

/* 0 — Wingdows: a mangled, askew four-pane flag.  The virus. */
OS_DRAW[0] = function (c) {
	c.fillStyle = '#b4b4bc';
	c.fillRect(0, 0, 28, 24);

	/* trailing colour streaks, as in the original */
	const bars = ['#d02020', '#20a020', '#2040d0', '#e0c020'];
	for (let i = 0; i < 4; i++) {
		c.fillStyle = bars[i];
		c.fillRect(1, 4.5 + i * 3.4, 7 - i * 0.8, 1.9);
	}

	/* skewed window */
	c.save();
	c.translate(17, 12);
	c.rotate(-0.22);
	c.transform(1, 0.17, 0, 1, 0, 0);

	c.fillStyle = '#1b1b24';
	c.fillRect(-10.5, -9.5, 21, 19);

	const pane = ['#6fe4ef', '#36b9ce', '#55d2e0', '#2aa0b8'];
	const px = [-9.5, 0.6, -9.5, 0.6], py = [-8.5, -8.5, 0.8, 0.8];
	for (let i = 0; i < 4; i++) {
		c.fillStyle = pane[i];
		c.fillRect(px[i], py[i], 8.9, 7.7);
		c.fillStyle = 'rgba(255,255,255,.34)';
		c.fillRect(px[i], py[i], 8.9, 1.5);
	}
	c.restore();

	/* a crack across it — this thing is malware */
	c.strokeStyle = 'rgba(20,20,28,.85)';
	c.lineWidth = 0.8;
	c.beginPath();
	c.moveTo(11, 3); c.lineTo(16, 11); c.lineTo(13, 14); c.lineTo(19, 21);
	c.stroke();
};

/* 1 — Apple: rainbow stripes, leaf, bite */
OS_DRAW[1] = function (c) {
	c.fillStyle = '#f4a8bc';
	c.fillRect(0, 0, 28, 24);

	c.save();
	/* apple silhouette as the clip, stripes painted through it */
	c.beginPath();
	c.moveTo(14, 5.5);
	c.bezierCurveTo(10.5, 2.6, 5.2, 4.6, 5.0, 10.4);
	c.bezierCurveTo(4.85, 15.2, 8.0, 21.4, 11.2, 21.4);
	c.bezierCurveTo(12.6, 21.4, 13.1, 20.6, 14, 20.6);
	c.bezierCurveTo(14.9, 20.6, 15.4, 21.4, 16.8, 21.4);
	c.bezierCurveTo(20.0, 21.4, 23.15, 15.2, 23.0, 10.4);
	c.bezierCurveTo(22.8, 4.6, 17.5, 2.6, 14, 5.5);
	c.closePath();
	c.clip();

	const stripes = ['#4bb14b', '#e8d02a', '#f09018', '#d83030',
			 '#a03c9c', '#2a6fd0'];
	for (let i = 0; i < 6; i++) {
		c.fillStyle = stripes[i];
		c.fillRect(4, 4.2 + i * 3.0, 20, 3.1);
	}
	c.restore();

	/* bite */
	c.fillStyle = '#f4a8bc';
	c.beginPath();
	c.arc(23.4, 11.0, 3.9, 0, Math.PI * 2);
	c.fill();

	/* leaf */
	c.fillStyle = '#3f9b3f';
	c.beginPath();
	c.ellipse(16.2, 3.4, 3.1, 1.7, -0.68, 0, Math.PI * 2);
	c.fill();
};

/* 2 — NeXT: black cube, coloured lettering */
OS_DRAW[2] = function (c) {
	c.fillStyle = '#b4b4bc';
	c.fillRect(0, 0, 28, 24);

	c.save();
	c.translate(14, 12.5);
	c.rotate(-0.13);

	/* cube body with a touch of 3D */
	c.fillStyle = '#4a4a52';
	c.fillRect(-9.2, -8.0, 18.4, 16.0);
	c.fillStyle = '#17171b';
	c.fillRect(-10.4, -9.2, 18.4, 16.0);
	c.strokeStyle = '#60606a';
	c.lineWidth = 0.5;
	c.strokeRect(-10.4, -9.2, 18.4, 16.0);

	/* "NeXT" in the original's clashing colours */
	c.font = 'bold 7px Helvetica, Arial, sans-serif';
	c.textBaseline = 'middle';
	const letters = [['N', '#e8e8e8'], ['e', '#e03030'],
			 ['X', '#34c034'], ['T', '#e8c830']];
	let lx = -8.6;
	for (const pair of letters) {
		c.fillStyle = pair[1];
		c.fillText(pair[0], lx, -3.4);
		lx += c.measureText(pair[0]).width + 0.3;
	}
	c.font = 'bold 6px Helvetica, Arial, sans-serif';
	c.fillStyle = '#d8d8e0';
	c.fillText('STEP', -8.6, 4.2);
	c.restore();
};

/* 3 — SGI: the interlocking cube.  IRIX. */
OS_DRAW[3] = function (c) {
	c.fillStyle = '#a9c9e9';
	c.fillRect(0, 0, 28, 24);

	c.save();
	c.translate(14, 12);

	/* isometric cube — three visible faces, the SGI identity */
	const R = 9.2, HX = R * 0.866, HY = R * 0.5;
	const T = [0, -R], UR = [HX, -HY], LR = [HX, HY];
	const B = [0, R], LL = [-HX, HY], UL = [-HX, -HY], C = [0, 0];

	const face = (pts, fill) => {
		c.beginPath();
		c.moveTo(pts[0][0], pts[0][1]);
		for (let k = 1; k < pts.length; k++) c.lineTo(pts[k][0], pts[k][1]);
		c.closePath();
		c.fillStyle = fill;
		c.fill();
		c.stroke();
	};

	c.lineWidth = 1.3;
	c.lineJoin = 'round';
	c.strokeStyle = '#223b5e';

	/* top face (lightest), then right, then left */
	face([T, UR, C, UL], '#eaf2fb');
	face([UR, LR, B, C], '#6f8db5');
	face([UL, C, B, LL], '#9fb6d2');
	c.restore();
};

/* 4 — Sun: interlocking lozenge "SUN".  Solaris. */
OS_DRAW[4] = function (c) {
	c.fillStyle = '#e2e0c2';
	c.fillRect(0, 0, 28, 24);

	c.save();
	c.translate(14, 12);
	c.rotate(Math.PI / 4);
	c.fillStyle = '#4a6ba8';
	c.strokeStyle = '#2d4878';
	c.lineWidth = 0.45;

	/* four interlocking bars = the classic woven diamond */
	const BW = 3.3, OFF = 3.5, LEN = 9.6;
	for (let i = 0; i < 2; i++) {
		const o = i ? OFF : -OFF;
		c.fillRect(-LEN, o - BW / 2, LEN * 2, BW);
		c.strokeRect(-LEN, o - BW / 2, LEN * 2, BW);
	}
	for (let i = 0; i < 2; i++) {
		const o = i ? OFF : -OFF;
		c.fillRect(o - BW / 2, -LEN, BW, LEN * 2);
		c.strokeRect(o - BW / 2, -LEN, BW, LEN * 2);
	}
	/* re-lay the horizontals at the crossings so the weave reads */
	c.fillStyle = '#5c7fbe';
	for (let i = 0; i < 2; i++) {
		const o = i ? OFF : -OFF;
		c.fillRect(-LEN, o - BW / 2, LEN - OFF - BW / 2, BW);
		c.fillRect(OFF + BW / 2, o - BW / 2, LEN - OFF - BW / 2, BW);
	}
	c.restore();
};

/* 5 — Palm */
OS_DRAW[5] = function (c) {
	c.fillStyle = '#f2f4f8';
	c.fillRect(0, 0, 28, 24);

	c.strokeStyle = '#4a6fae';
	c.lineWidth = 1.5;
	c.beginPath();
	c.moveTo(2.5, 7); c.lineTo(25.5, 7);
	c.moveTo(2.5, 12); c.lineTo(25.5, 12);
	c.moveTo(2.5, 17); c.lineTo(25.5, 17);
	c.stroke();

	c.fillStyle = '#2d4e86';
	const dots = [[8, 7], [17, 7], [22, 7], [6, 12], [13, 12],
		      [21, 12], [10, 17], [19, 17]];
	for (const d of dots) {
		c.beginPath();
		c.arc(d[0], d[1], 1.7, 0, Math.PI * 2);
		c.fill();
	}
};

/* 6 — OS/2: green ring and lettering on black */
OS_DRAW[6] = function (c) {
	c.fillStyle = '#0a0a0c';
	c.fillRect(0, 0, 28, 24);

	c.strokeStyle = '#3ce04a';
	c.lineWidth = 1.4;
	c.beginPath();
	c.ellipse(14, 12, 11.4, 9.6, 0, 0, Math.PI * 2);
	c.stroke();

	c.fillStyle = '#3ce04a';
	c.font = 'bold 9.5px Helvetica, Arial, sans-serif';
	c.textAlign = 'center';
	c.textBaseline = 'middle';
	c.fillText('OS/2', 14, 12.4);
};

/* 7 — BSD daemon */
OS_DRAW[7] = function (c) {
	c.fillStyle = '#dff2fa';
	c.fillRect(0, 0, 28, 24);

	const red = '#d8483c', redDk = '#a32c22';

	/* tail */
	c.strokeStyle = redDk;
	c.lineWidth = 1.3;
	c.beginPath();
	c.moveTo(19.5, 16);
	c.quadraticCurveTo(25, 15, 24, 9.5);
	c.stroke();
	c.fillStyle = redDk;
	c.beginPath();			/* barbed tip */
	c.moveTo(24, 9.8); c.lineTo(26.2, 7.6); c.lineTo(22.4, 8.1);
	c.closePath(); c.fill();

	/* legs */
	c.fillStyle = red;
	c.fillRect(11.3, 17.4, 2.0, 4.6);
	c.fillRect(15.0, 17.4, 2.0, 4.6);
	c.fillStyle = redDk;
	c.fillRect(10.6, 21.4, 3.2, 1.5);
	c.fillRect(14.5, 21.4, 3.2, 1.5);

	/* body */
	c.fillStyle = red;
	c.beginPath();
	c.ellipse(14.2, 14.2, 4.5, 4.9, 0, 0, Math.PI * 2);
	c.fill();

	/* arms */
	c.strokeStyle = red;
	c.lineWidth = 1.7;
	c.lineCap = 'round';
	c.beginPath();
	c.moveTo(10.4, 12.6); c.lineTo(6.6, 14.6);
	c.moveTo(18.0, 12.6); c.lineTo(21.4, 10.4);
	c.stroke();

	/* head */
	c.fillStyle = red;
	c.beginPath();
	c.arc(14.2, 7.6, 3.9, 0, Math.PI * 2);
	c.fill();

	/* horns */
	c.fillStyle = redDk;
	c.beginPath();
	c.moveTo(11.4, 4.6); c.lineTo(9.9, 1.4); c.lineTo(13.0, 3.4);
	c.closePath(); c.fill();
	c.beginPath();
	c.moveTo(17.0, 4.6); c.lineTo(18.5, 1.4); c.lineTo(15.4, 3.4);
	c.closePath(); c.fill();

	/* face */
	c.fillStyle = '#17171b';
	c.beginPath(); c.arc(12.8, 7.2, 0.75, 0, Math.PI * 2); c.fill();
	c.beginPath(); c.arc(15.6, 7.2, 0.75, 0, Math.PI * 2); c.fill();
	c.strokeStyle = '#17171b';
	c.lineWidth = 0.6;
	c.beginPath();
	c.arc(14.2, 8.6, 1.9, 0.25, Math.PI - 0.25);
	c.stroke();

	/* trident */
	c.strokeStyle = '#3a3a44';
	c.lineWidth = 0.8;
	c.beginPath();
	c.moveTo(6.4, 14.4); c.lineTo(4.0, 4.4);
	c.stroke();
	c.fillStyle = '#3a3a44';
	c.fillRect(2.0, 3.0, 4.2, 0.9);
	c.fillRect(2.0, 1.2, 0.9, 2.4);
	c.fillRect(3.9, 1.2, 0.9, 2.4);
	c.fillRect(5.6, 1.2, 0.9, 2.4);
};

/* 8 — Tux */
OS_DRAW[8] = function (c) {
	c.fillStyle = '#2026b4';
	c.fillRect(0, 0, 28, 24);

	/* feet */
	c.fillStyle = '#f2b61e';
	c.beginPath();
	c.ellipse(10.0, 21.3, 3.5, 1.9, -0.2, 0, Math.PI * 2); c.fill();
	c.beginPath();
	c.ellipse(18.0, 21.3, 3.5, 1.9, 0.2, 0, Math.PI * 2); c.fill();

	/* body */
	c.fillStyle = '#15151a';
	c.beginPath();
	c.ellipse(14, 13.6, 7.0, 8.2, 0, 0, Math.PI * 2);
	c.fill();

	/* flippers */
	c.beginPath();
	c.ellipse(6.6, 14.2, 2.0, 4.4, 0.32, 0, Math.PI * 2); c.fill();
	c.beginPath();
	c.ellipse(21.4, 14.2, 2.0, 4.4, -0.32, 0, Math.PI * 2); c.fill();

	/* belly */
	c.fillStyle = '#f7f7f2';
	c.beginPath();
	c.ellipse(14, 15.0, 4.9, 6.3, 0, 0, Math.PI * 2);
	c.fill();

	/* head */
	c.fillStyle = '#15151a';
	c.beginPath();
	c.ellipse(14, 6.6, 5.0, 5.0, 0, 0, Math.PI * 2);
	c.fill();

	/* face patch */
	c.fillStyle = '#f7f7f2';
	c.beginPath();
	c.ellipse(14, 8.0, 3.7, 3.4, 0, 0, Math.PI * 2);
	c.fill();

	/* eyes */
	c.fillStyle = '#15151a';
	c.beginPath(); c.ellipse(12.3, 6.0, 0.95, 1.25, 0, 0, Math.PI*2); c.fill();
	c.beginPath(); c.ellipse(15.7, 6.0, 0.95, 1.25, 0, 0, Math.PI*2); c.fill();

	/* beak */
	c.fillStyle = '#f2b61e';
	c.beginPath();
	c.ellipse(14, 8.9, 2.3, 1.5, 0, 0, Math.PI * 2);
	c.fill();
	c.strokeStyle = '#c4900f';
	c.lineWidth = 0.4;
	c.beginPath();
	c.moveTo(11.8, 8.9); c.lineTo(16.2, 8.9);
	c.stroke();
};

/* 9 — Red Hat fedora */
OS_DRAW[9] = function (c) {
	c.fillStyle = '#f6b9cc';
	c.fillRect(0, 0, 28, 24);

	c.fillStyle = '#cc1726';
	/* crown */
	c.beginPath();
	c.moveTo(7.2, 17.0);
	c.bezierCurveTo(7.0, 7.4, 10.0, 4.2, 14.0, 4.2);
	c.bezierCurveTo(18.0, 4.2, 21.0, 7.4, 20.8, 17.0);
	c.closePath();
	c.fill();
	/* brim */
	c.beginPath();
	c.ellipse(14, 17.2, 11.4, 3.1, 0, Math.PI, Math.PI * 2);
	c.fill();
	c.fillRect(2.6, 17.0, 22.8, 1.5);
	/* dent */
	c.fillStyle = '#9e0f1c';
	c.beginPath();
	c.ellipse(14, 5.4, 3.6, 1.5, 0, 0, Math.PI * 2);
	c.fill();
};

/* 10 — Hurd: green wordmark over a blue globe */
OS_DRAW[10] = function (c) {
	c.fillStyle = '#b0b0b8';
	c.fillRect(0, 0, 28, 24);

	/* globe */
	const g = c.createRadialGradient(11, 10, 1, 14, 12, 10);
	g.addColorStop(0, '#7fc4ef');
	g.addColorStop(1, '#1d5a9c');
	c.fillStyle = g;
	c.beginPath();
	c.ellipse(14, 12, 9.2, 8.4, 0, 0, Math.PI * 2);
	c.fill();

	c.strokeStyle = 'rgba(255,255,255,.4)';
	c.lineWidth = 0.5;
	c.beginPath();
	c.ellipse(14, 12, 9.2, 3.4, 0, 0, Math.PI * 2);
	c.stroke();
	c.beginPath();
	c.ellipse(14, 12, 3.6, 8.4, 0, 0, Math.PI * 2);
	c.stroke();

	c.fillStyle = '#2ce02c';
	c.font = 'bold 8.5px Helvetica, Arial, sans-serif';
	c.textAlign = 'center';
	c.textBaseline = 'middle';
	c.strokeStyle = '#0d3d0d';
	c.lineWidth = 1.6;
	c.strokeText('HURD', 14, 12.2);
	c.fillText('HURD', 14, 12.2);
};

function drawOS(ctx, os, x, y) {
	const i = clampIdx(os, OS_DRAW.length);
	ctx.save();
	ctx.translate(x, y);
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
	OS_DRAW[i](ctx);
	ctx.restore();
}

/* ================================================== machines (55x45) ==== */

/*
 * Every desktop machine is a monitor whose screen occupies (4,4)-(32,28),
 * because the engine paints the 28x24 OS logo at offset (4,4).  Nothing that
 * identifies the machine may live inside that rectangle.
 */
const SCREEN_X = 4, SCREEN_Y = 4, SCREEN_W = 28, SCREEN_H = 24;

function monitor(c, bezel, bezelLit, bezelDark) {
	/* bezel */
	fillRR(c, 1, 1, 34, 31, 2.4, bezel);
	c.fillStyle = bezelLit;
	c.fillRect(2, 2, 32, 1.4);
	c.fillStyle = bezelDark;
	c.fillRect(2, 30.2, 32, 1.4);

	/* recessed screen */
	c.fillStyle = '#05050a';
	c.fillRect(SCREEN_X - 0.8, SCREEN_Y - 0.8, SCREEN_W + 1.6, SCREEN_H + 1.6);
	c.fillStyle = P.screen;
	c.fillRect(SCREEN_X, SCREEN_Y, SCREEN_W, SCREEN_H);

	/* stand + keyboard */
	c.fillStyle = bezelDark;
	c.fillRect(13, 32, 10, 2.2);
	fillRR(c, 2, 34.4, 32, 6.4, 1.2, bezel);
	c.fillStyle = bezelLit;
	c.fillRect(3, 35.2, 30, 0.9);
	c.fillStyle = bezelDark;
	for (let r = 0; r < 3; r++)
		for (let k = 0; k < 13; k++)
			c.fillRect(3.6 + k * 2.3, 36.5 + r * 1.35, 1.6, 0.85);
}

/* screen glow so a lit machine reads as "on" even before the OS is drawn */
function screenSheen(c) {
	c.save();
	c.globalAlpha = 0.14;
	const g = c.createLinearGradient(SCREEN_X, SCREEN_Y,
					 SCREEN_X + SCREEN_W, SCREEN_Y + SCREEN_H);
	g.addColorStop(0, '#ffffff');
	g.addColorStop(0.5, 'rgba(255,255,255,0)');
	c.fillStyle = g;
	c.fillRect(SCREEN_X, SCREEN_Y, SCREEN_W, SCREEN_H);
	c.restore();
}

const CPU_DRAW = [];

/* 0 — toaster: what your estate becomes when you lose */
CPU_DRAW[0] = function (c) {
	/* toast */
	c.fillStyle = '#d9a344';
	c.fillRect(12, 4, 9, 9);
	c.fillRect(23, 2, 9, 11);
	c.fillStyle = '#b8822c';
	c.fillRect(12, 4, 9, 1.6);
	c.fillRect(23, 2, 9, 1.6);

	/* body */
	const g = c.createLinearGradient(0, 12, 0, 36);
	g.addColorStop(0, P.chromeLit);
	g.addColorStop(0.45, P.chrome);
	g.addColorStop(1, P.chromeDk);
	fillRR(c, 6, 12, 33, 24, 4.5, g);

	/* slots */
	fillRR(c, 11, 13.4, 10, 2.2, 1, '#3a3a44');
	fillRR(c, 23, 13.4, 10, 2.2, 1, '#3a3a44');

	/* highlight band + lever */
	c.fillStyle = 'rgba(255,255,255,.55)';
	c.fillRect(8.5, 18, 2.2, 14);
	fillRR(c, 39, 19, 3.6, 7, 1.2, P.chromeDk);
	c.fillStyle = '#2b2b31';
	c.fillRect(6, 36, 33, 2.2);
	c.fillRect(9, 38.2, 2.6, 2.4);
	c.fillRect(33.4, 38.2, 2.6, 2.4);

	/* the penguin, as in the original */
	c.fillStyle = '#15151a';
	c.beginPath(); c.ellipse(46.5, 30, 5.0, 7.2, 0, 0, Math.PI*2); c.fill();
	c.beginPath(); c.ellipse(46.5, 20.6, 3.8, 3.8, 0, 0, Math.PI*2); c.fill();
	c.fillStyle = '#f7f7f2';
	c.beginPath(); c.ellipse(46.5, 31, 3.3, 5.4, 0, 0, Math.PI*2); c.fill();
	c.beginPath(); c.ellipse(46.5, 21.6, 2.7, 2.5, 0, 0, Math.PI*2); c.fill();
	c.fillStyle = '#15151a';
	c.beginPath(); c.arc(45.2, 20.1, 0.72, 0, Math.PI*2); c.fill();
	c.beginPath(); c.arc(47.8, 20.1, 0.72, 0, Math.PI*2); c.fill();
	c.fillStyle = '#f2b61e';
	c.beginPath(); c.ellipse(46.5, 22.6, 1.7, 1.15, 0, 0, Math.PI*2); c.fill();
	c.beginPath(); c.ellipse(44.2, 37.4, 2.5, 1.4, -0.2, 0, Math.PI*2); c.fill();
	c.beginPath(); c.ellipse(48.8, 37.4, 2.5, 1.4, 0.2, 0, Math.PI*2); c.fill();
};

/* 1 — Mac: beige, slim slotted side box */
CPU_DRAW[1] = function (c) {
	monitor(c, P.beige, P.beigeLit, P.beigeDark);
	screenSheen(c);

	fillRR(c, 38, 6, 15, 30, 1.6, P.beige);
	c.fillStyle = P.beigeLit;
	c.fillRect(38.8, 6.8, 13.4, 1.1);
	c.fillStyle = P.beigeDark;
	for (let i = 0; i < 7; i++)
		c.fillRect(40.5, 10.5 + i * 3.1, 10, 1.5);
	c.fillStyle = '#7c7768';
	c.fillRect(40.5, 32.4, 10, 2.0);

	/* rainbow badge */
	const bar = ['#4bb14b', '#e8d02a', '#f09018', '#d83030'];
	for (let i = 0; i < 4; i++) {
		c.fillStyle = bar[i];
		c.fillRect(5.2 + i * 1.15, 32.4, 1.0, 1.4);
	}
	/* mouse */
	fillRR(c, 44, 38.4, 6, 4.4, 2, P.beigeLit);
};

/* 2 — NeXT: all black, slotted cube tower */
CPU_DRAW[2] = function (c) {
	monitor(c, P.black, P.blackLit, '#191920');
	screenSheen(c);

	fillRR(c, 38, 8, 15, 28, 1.4, '#1f1f26');
	c.fillStyle = '#3a3a44';
	c.fillRect(38.8, 8.8, 13.4, 1.0);
	c.fillStyle = '#0e0e13';
	for (let i = 0; i < 8; i++)
		c.fillRect(40.3, 12 + i * 2.7, 10.4, 1.5);
	c.fillStyle = P.led;
	c.fillRect(40.3, 33.2, 1.6, 1.6);
};

/* 3 — SGI: the colourful one.  IRIX. */
CPU_DRAW[3] = function (c) {
	monitor(c, P.grey, P.greyLit, P.greyDark);
	screenSheen(c);

	fillRR(c, 37, 4, 17, 33, 1.6, '#6a4f9e');
	c.fillStyle = '#8c6cc4';
	c.fillRect(37.8, 4.8, 15.4, 1.2);

	const stripes = ['#38c4d8', '#5a7fe0', '#a060d8', '#38c4d8', '#5a7fe0'];
	for (let i = 0; i < 5; i++) {
		c.fillStyle = stripes[i];
		c.fillRect(39, 8.5 + i * 5.2, 13, 3.4);
	}
	c.fillStyle = P.led;
	c.fillRect(39, 34, 2.0, 1.6);
};

/* 4 — Sun: upright white/blue unit.  Solaris. */
CPU_DRAW[4] = function (c) {
	monitor(c, P.grey, P.greyLit, P.greyDark);
	screenSheen(c);

	fillRR(c, 39, 7, 13, 25, 1.4, '#eef0f4');
	c.fillStyle = '#4a6ba8';
	c.fillRect(39.8, 7.8, 11.4, 2.6);
	c.fillStyle = '#c8cfdb';
	c.fillRect(41, 13, 9, 1.6);
	c.fillRect(41, 16, 9, 1.6);
	c.fillStyle = '#4a6ba8';
	c.fillRect(41, 20, 9, 6.5);
	c.fillStyle = '#eef0f4';
	c.fillRect(42.2, 21.4, 6.6, 3.7);

	/* chequered block from the original */
	for (let r = 0; r < 4; r++)
		for (let k = 0; k < 5; k++) {
			c.fillStyle = ((r + k) % 2) ? '#ffffff' : '#4a6ba8';
			c.fillRect(39 + k * 2.6, 33.5 + r * 2.0, 2.6, 2.0);
		}
};

/* 5 — Palm: a handheld, LCD where the screen goes */
CPU_DRAW[5] = function (c) {
	fillRR(c, 0.5, 0.5, 39, 44, 4.5, '#5f6470');
	fillRR(c, 1.8, 1.8, 36.4, 41.4, 3.6, '#8d93a1');
	c.fillStyle = '#6c7280';
	c.fillRect(2.6, 2.6, 34.8, 1.1);

	/* LCD — this is the OS-icon region */
	c.fillStyle = '#2a3326';
	c.fillRect(SCREEN_X - 1, SCREEN_Y - 1, SCREEN_W + 2, SCREEN_H + 2);
	c.fillStyle = '#4e6b3c';
	c.fillRect(SCREEN_X, SCREEN_Y, SCREEN_W, SCREEN_H);
	screenSheen(c);

	/* graffiti area + buttons */
	c.fillStyle = '#6c7280';
	c.fillRect(4, 30, 28, 7.6);
	c.fillStyle = '#4b505c';
	c.fillRect(5.5, 31.4, 11, 4.8);
	c.fillRect(19, 31.4, 11, 4.8);
	c.fillStyle = '#32363f';
	for (let i = 0; i < 4; i++) {
		c.beginPath();
		c.arc(7.5 + i * 7.2, 40.6, 2.1, 0, Math.PI * 2);
		c.fill();
	}
	/* stylus */
	fillRR(c, 42, 5, 2.6, 34, 1.3, '#3a3f49');
	c.fillStyle = '#9aa0ac';
	c.fillRect(42, 5, 2.6, 4);
};

/* 6 — OS/2 PC: beige mini-tower */
CPU_DRAW[6] = function (c) {
	monitor(c, P.beige, P.beigeLit, P.beigeDark);
	screenSheen(c);

	fillRR(c, 38, 10, 15, 26, 1.4, P.beige);
	c.fillStyle = P.beigeLit;
	c.fillRect(38.8, 10.8, 13.4, 1.1);
	c.fillStyle = '#8d8773';
	c.fillRect(40, 14, 11, 2.6);		/* 5.25" bay */
	c.fillRect(40, 18, 11, 1.9);		/* floppy */
	c.fillStyle = '#5f5a4c';
	c.fillRect(40.6, 18.5, 7, 0.9);
	c.fillStyle = P.led;
	c.fillRect(40, 22.5, 1.8, 1.5);
	c.fillStyle = '#9b9583';
	c.fillRect(40, 26, 11, 7);
	/* mouse */
	fillRR(c, 44, 38.4, 6, 4.4, 2, P.beigeLit);
};

/* 7 — BSD PC: tower with red/green LEDs */
CPU_DRAW[7] = function (c) {
	monitor(c, '#cfc9b2', '#e9e3cd', '#97927c');
	screenSheen(c);

	fillRR(c, 38, 6, 15, 30, 1.4, '#cfc9b2');
	c.fillStyle = '#e9e3cd';
	c.fillRect(38.8, 6.8, 13.4, 1.1);
	c.fillStyle = P.ledRed;
	c.fillRect(40, 10, 2.2, 1.9);
	c.fillStyle = P.led;
	c.fillRect(43.5, 10, 2.2, 1.9);
	c.fillStyle = '#8b8672';
	c.fillRect(40, 14, 11, 2.4);
	c.fillRect(40, 18, 11, 2.4);
	c.fillStyle = '#5f5a4c';
	for (let i = 0; i < 5; i++)
		c.fillRect(40, 23 + i * 2.3, 11, 1.2);
	/* mouse */
	fillRR(c, 44, 38.4, 6, 4.4, 2, '#e9e3cd');
};

function drawComputer(ctx, type, x, y) {
	const i = clampIdx(type, CPU_DRAW.length);
	ctx.save();
	ctx.translate(x, y);
	CPU_DRAW[i](ctx);
	ctx.restore();
}

/* ====================================================== Bill (24x38) ==== */

/*
 * Bill as the original drew him: blonde mop, oversized round glasses, smug
 * grin, pale suit and tie.  Front-facing; the walk cycle swings the legs,
 * and the direction strips mirror him.
 */
function billBody(c, lean, legPhase) {
	c.save();
	c.translate(12, 0);			/* centre line */
	c.scale(lean, 1);
	c.translate(-12, 0);

	/* legs */
	const swing = [0, 1.9, 0, -1.9][legPhase] || 0;
	c.fillStyle = P.suitShade;
	c.fillRect(8.4 + swing * 0.5, 27, 3.0, 7.5);
	c.fillRect(12.8 - swing * 0.5, 27, 3.0, 7.5);
	/* shoes */
	fillRR(c, 7.0 + swing, 33.8, 5.4, 2.9, 1.2, P.shoe);
	fillRR(c, 12.0 - swing, 33.8, 5.4, 2.9, 1.2, P.shoe);

	/* torso */
	c.fillStyle = P.suit;
	c.beginPath();
	c.moveTo(6.6, 27.6);
	c.lineTo(7.6, 17.6);
	c.quadraticCurveTo(12, 15.6, 16.4, 17.6);
	c.lineTo(17.4, 27.6);
	c.closePath();
	c.fill();

	/* lapels */
	c.fillStyle = P.suitShade;
	c.beginPath();
	c.moveTo(9.2, 16.8); c.lineTo(12, 22.4); c.lineTo(11.0, 16.4);
	c.closePath(); c.fill();
	c.beginPath();
	c.moveTo(14.8, 16.8); c.lineTo(12, 22.4); c.lineTo(13.0, 16.4);
	c.closePath(); c.fill();

	/* tie */
	c.fillStyle = P.tie;
	c.beginPath();
	c.moveTo(12, 17.2); c.lineTo(13.2, 19.0); c.lineTo(12, 25.4);
	c.lineTo(10.8, 19.0);
	c.closePath(); c.fill();

	/* arms */
	c.fillStyle = P.suit;
	c.fillRect(5.0 - swing * 0.4, 18.4, 2.6, 8.0);
	c.fillRect(16.4 + swing * 0.4, 18.4, 2.6, 8.0);
	c.fillStyle = P.skin;
	c.beginPath(); c.arc(6.3 - swing * 0.4, 27.0, 1.5, 0, Math.PI*2); c.fill();
	c.beginPath(); c.arc(17.7 + swing * 0.4, 27.0, 1.5, 0, Math.PI*2); c.fill();

	c.restore();
}

function billHead(c, lean) {
	c.save();
	c.translate(12, 0);
	c.scale(lean, 1);
	c.translate(-12, 0);

	/* face */
	c.fillStyle = P.skin;
	c.beginPath();
	c.ellipse(12, 10.2, 6.1, 6.8, 0, 0, Math.PI * 2);
	c.fill();
	c.fillStyle = P.skinShade;
	c.beginPath();
	c.ellipse(12, 15.0, 4.2, 2.2, 0, 0, Math.PI);
	c.fill();

	/* the mop */
	c.fillStyle = P.hair;
	c.beginPath();
	c.moveTo(5.7, 9.4);
	c.bezierCurveTo(5.2, 2.0, 11.0, 0.6, 14.4, 1.6);
	c.bezierCurveTo(18.4, 2.6, 18.8, 5.6, 18.3, 9.2);
	c.bezierCurveTo(17.6, 6.0, 16.2, 5.0, 13.2, 5.2);
	c.bezierCurveTo(9.4, 5.5, 7.0, 6.2, 5.7, 9.4);
	c.closePath();
	c.fill();
	c.fillStyle = P.hairLit;
	c.beginPath();
	c.moveTo(7.4, 4.6);
	c.quadraticCurveTo(11.2, 1.8, 15.0, 3.0);
	c.quadraticCurveTo(11.4, 3.2, 7.4, 4.6);
	c.closePath();
	c.fill();
	/* sideburns */
	c.fillStyle = P.hairDark;
	c.fillRect(5.6, 8.0, 1.5, 3.4);
	c.fillRect(16.9, 8.0, 1.5, 3.4);

	/* the glasses — oversized, the defining feature */
	c.fillStyle = P.lens;
	c.beginPath(); c.arc(9.0, 10.4, 3.25, 0, Math.PI * 2); c.fill();
	c.beginPath(); c.arc(15.0, 10.4, 3.25, 0, Math.PI * 2); c.fill();
	c.strokeStyle = P.ink;
	c.lineWidth = 0.85;
	c.beginPath(); c.arc(9.0, 10.4, 3.25, 0, Math.PI * 2); c.stroke();
	c.beginPath(); c.arc(15.0, 10.4, 3.25, 0, Math.PI * 2); c.stroke();
	c.beginPath();
	c.moveTo(12.25, 10.0); c.lineTo(11.75, 10.0);	/* bridge */
	c.moveTo(5.75, 10.0); c.lineTo(5.0, 9.6);	/* temples */
	c.moveTo(18.25, 10.0); c.lineTo(19.0, 9.6);
	c.stroke();

	/* eyes behind the lenses, narrowed — he is enjoying this */
	c.fillStyle = P.ink;
	c.beginPath(); c.ellipse(9.4, 10.7, 1.2, 0.95, 0, 0, Math.PI*2); c.fill();
	c.beginPath(); c.ellipse(14.6, 10.7, 1.2, 0.95, 0, 0, Math.PI*2); c.fill();

	/* brows, angled in: smug rather than cheerful */
	c.strokeStyle = P.ink;
	c.lineWidth = 0.75;
	c.beginPath();
	c.moveTo(6.6, 6.9); c.lineTo(11.0, 6.3);
	c.moveTo(13.0, 6.3); c.lineTo(17.4, 6.9);
	c.stroke();

	/* the smirk — lopsided, one corner hooked up */
	c.lineWidth = 0.8;
	c.beginPath();
	c.moveTo(9.2, 14.3);
	c.quadraticCurveTo(12.4, 16.5, 15.3, 13.1);
	c.stroke();
	c.lineWidth = 0.6;
	c.beginPath();
	c.moveTo(15.3, 13.1); c.lineTo(16.0, 12.4);
	c.stroke();

	c.restore();
}

function drawBillWalk(c, dir, index) {
	const lean = dir === 'R' ? -1 : 1;
	billBody(c, lean, index);
	billHead(c, lean);
}

/* Dying: glasses fly off, he ruptures, melts into a puddle. */
function drawBillDying(c, index) {
	const stage = clampIdx(index, 5);

	if (stage <= 1) {
		billBody(c, 1, 0);
		billHead(c, 1);
		/* glasses launching off */
		c.save();
		c.strokeStyle = P.ink;
		c.lineWidth = 0.8;
		c.fillStyle = P.lens;
		c.translate(3 + stage * 5, 4 - stage * 2.5);
		c.rotate(0.6 + stage);
		c.beginPath(); c.arc(-2.6, 0, 2.5, 0, Math.PI*2); c.fill(); c.stroke();
		c.beginPath(); c.arc(2.6, 0, 2.5, 0, Math.PI*2); c.fill(); c.stroke();
		c.restore();
	}

	if (stage >= 1) {
		/* arterial spray — id software eat your heart out */
		const spray = [
			[],
			[[12,16,4.5],[8,13,2.4],[16,13,2.4]],
			[[12,20,7.0],[6,15,3.4],[18,15,3.4],[12,11,3.0]],
			[[12,26,8.4],[5,22,3.6],[19,22,3.6]],
			[[12,32,8.0],[6,31,3.0],[18,31,3.0]],
		][stage] || [];
		c.fillStyle = P.blood;
		for (const s of spray) {
			c.beginPath();
			c.arc(s[0], s[1], s[2], 0, Math.PI * 2);
			c.fill();
		}
		/* splatter flecks */
		c.fillStyle = P.bloodDark;
		const n = 5 + stage * 3;
		for (let i = 0; i < n; i++) {
			const a = (i * 2.399) + stage;
			const r = 4 + (i % 5) * 2.2 + stage * 1.5;
			c.beginPath();
			c.arc(12 + Math.cos(a) * r,
			      16 + stage * 3 + Math.sin(a) * r * 0.7,
			      0.75, 0, Math.PI * 2);
			c.fill();
		}
	}

	if (stage >= 3) {
		/* the puddle */
		c.fillStyle = P.blood;
		c.beginPath();
		c.ellipse(12, 35, 5.5 + stage * 2.2, 2.0 + stage * 0.5,
			  0, 0, Math.PI * 2);
		c.fill();
	}
}

/*
 * At a computer: 58x41, feet pinned to a common baseline across all 13
 * frames so he does not jitter.  He reaches toward the machine, takes its
 * OS around frame 6, and installs the virus over frames 7-12.
 */
function drawBillAt(c, index) {
	const i = clampIdx(index, 13);

	/* reach: out at the start, retracting as he works */
	const reach = i <= 5 ? i / 5 : (i >= 7 ? (12 - i) / 5 : 1);
	const crouch = Math.sin(i / 12 * Math.PI) * 1.6;

	c.save();
	/* he stands on the right-hand side of the machine */
	c.translate(30, 3 + crouch);
	drawBillWalk(c, 'L', i % 2 ? 1 : 0);

	/* the reaching arm, over the top of the body */
	c.save();
	c.translate(12, 0);
	c.strokeStyle = P.suit;
	c.lineWidth = 2.6;
	c.lineCap = 'round';
	c.beginPath();
	c.moveTo(-6.0, 19.0);
	c.quadraticCurveTo(-11 - reach * 5, 19.5, -14 - reach * 7, 17.0);
	c.stroke();
	c.fillStyle = P.skin;
	c.beginPath();
	c.arc(-14.6 - reach * 7, 16.8, 1.7, 0, Math.PI * 2);
	c.fill();
	c.restore();
	c.restore();
}

function drawBill(ctx, strip, index, x, y) {
	ctx.save();
	ctx.translate(x, y);
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';

	if (strip === 'A') drawBillAt(ctx, index);
	else if (strip === 'D') drawBillDying(ctx, index);
	else drawBillWalk(ctx, strip === 'R' ? 'R' : 'L', clampIdx(index, 4));

	ctx.restore();
}

/* ================================================= spark / bucket ======= */

function drawSpark(ctx, index, x, y) {
	const i = clampIdx(index, 2);
	ctx.save();
	ctx.translate(x + 10, y + 10);
	ctx.rotate(i ? Math.PI / 5 : 0);

	const g = ctx.createRadialGradient(0, 0, 0.5, 0, 0, 9);
	g.addColorStop(0, '#ffffff');
	g.addColorStop(0.35, '#ffef6a');
	g.addColorStop(0.7, 'rgba(255,150,20,.75)');
	g.addColorStop(1, 'rgba(255,90,0,0)');
	ctx.fillStyle = g;
	ctx.beginPath();
	ctx.arc(0, 0, 9, 0, Math.PI * 2);
	ctx.fill();

	/* spikes */
	ctx.fillStyle = '#fffbe0';
	const spikes = i ? 6 : 5;
	for (let k = 0; k < spikes; k++) {
		ctx.save();
		ctx.rotate((k / spikes) * Math.PI * 2);
		ctx.beginPath();
		ctx.moveTo(0, -1.6);
		ctx.lineTo(8.6, 0);
		ctx.lineTo(0, 1.6);
		ctx.closePath();
		ctx.fill();
		ctx.restore();
	}

	ctx.fillStyle = '#ffffff';
	ctx.beginPath();
	ctx.arc(0, 0, 2.3, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

function drawBucket(ctx, x, y) {
	ctx.save();
	ctx.translate(x, y);

	/* handle */
	ctx.strokeStyle = '#9aa0ac';
	ctx.lineWidth = 1.1;
	ctx.beginPath();
	ctx.arc(12, 7.5, 7.2, Math.PI, Math.PI * 2);
	ctx.stroke();

	/* pail */
	ctx.beginPath();
	ctx.moveTo(3.6, 7.5);
	ctx.lineTo(20.4, 7.5);
	ctx.lineTo(18.2, 22.6);
	ctx.lineTo(5.8, 22.6);
	ctx.closePath();
	const g = ctx.createLinearGradient(3.6, 0, 20.4, 0);
	g.addColorStop(0, '#6f7682');
	g.addColorStop(0.35, '#c3cad6');
	g.addColorStop(1, '#6f7682');
	ctx.fillStyle = g;
	ctx.fill();
	ctx.strokeStyle = '#4b515c';
	ctx.lineWidth = 0.7;
	ctx.stroke();

	/* water */
	ctx.fillStyle = '#3f9fe0';
	ctx.beginPath();
	ctx.ellipse(12, 8.4, 8.0, 2.3, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = 'rgba(255,255,255,.5)';
	ctx.beginPath();
	ctx.ellipse(9.4, 7.9, 3.0, 0.95, -0.2, 0, Math.PI * 2);
	ctx.fill();

	/* rim */
	ctx.strokeStyle = '#dde3ea';
	ctx.lineWidth = 1.0;
	ctx.beginPath();
	ctx.ellipse(12, 7.5, 8.4, 2.5, 0, 0, Math.PI * 2);
	ctx.stroke();
	ctx.restore();
}

/* ==================================================== cable / field ===== */

function drawCable(ctx, x1, y1, x2, y2) {
	ctx.save();
	ctx.lineCap = 'round';
	ctx.strokeStyle = P.cable;
	ctx.lineWidth = 2.1;
	ctx.beginPath();
	ctx.moveTo(x1, y1);
	ctx.lineTo(x2, y2);
	ctx.stroke();

	ctx.strokeStyle = P.cableLit;
	ctx.lineWidth = 0.7;
	ctx.beginPath();
	ctx.moveTo(x1, y1 - 0.5);
	ctx.lineTo(x2, y2 - 0.5);
	ctx.stroke();
	ctx.restore();
}

function drawBackground(ctx, w, h) {
	ctx.save();
	const g = ctx.createLinearGradient(0, 0, 0, h);
	g.addColorStop(0, P.bg0);
	g.addColorStop(1, P.bg1);
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, w, h);

	/* faint grid, like a machine-room floor */
	ctx.strokeStyle = 'rgba(255,255,255,.028)';
	ctx.lineWidth = 0.5;
	ctx.beginPath();
	for (let x = 20; x < w; x += 20) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
	for (let y = 20; y < h; y += 20) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
	ctx.stroke();

	/* vignette keeps the eye on the middle of the field */
	const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.3,
					   w / 2, h / 2, h * 0.78);
	v.addColorStop(0, 'rgba(0,0,0,0)');
	v.addColorStop(1, 'rgba(0,0,0,.42)');
	ctx.fillStyle = v;
	ctx.fillRect(0, 0, w, h);
	ctx.restore();
}

return {
	drawComputer,
	drawOS,
	drawBill,
	drawSpark,
	drawBucket,
	drawCable,
	drawBackground,
	palette: P,
};
});
