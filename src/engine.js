/*
 * XBill — web port of the engine.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 *
 * Part of xbill-web, a browser port of XBill 2.1 by Brian Wellington and
 * Matias Duarte, Copyright 1994-2001.  Original is GPL-2.0-or-later;
 * this derivative work is distributed under the same terms.
 *
 * This is a deliberately literal translation of XBill 2.1 (Brian Wellington /
 * Matias Duarte, GPLv2).  Every rule, constant, hitbox and arithmetic quirk is
 * carried over from the C.  Where the C relies on integer division or C-style
 * truncation the JS uses Math.trunc / idiv so the numbers match exactly.
 *
 * Source file each section came from is noted in the banner comments.
 *
 * No DOM access anywhere in here: the engine runs headless under Node for the
 * simulation harness, and the browser layer only reads its state to draw.
 */
(function (root, factory) {
	if (typeof module === 'object' && module.exports)
		module.exports = factory();
	else
		root.XBillEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/* ------------------------------------------------------------------ util.h */

/* C integer division truncates toward zero; so does Math.trunc. */
function idiv(a, b) { return Math.trunc(a / b); }

/*
 * mulberry32 — seeded so a simulation can be replayed exactly.  The original
 * used rand(); we only need *a* uniform source, not glibc's specific one.
 */
function mulberry32(a) {
	return function () {
		a |= 0; a = (a + 0x6D2B79F5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/* ------------------------------------------------------------- dimensions */
/*
 * Taken from the .xpm headers in the original pixmaps/ directory.  The engine
 * works in this 400x400 logical space regardless of how large we draw it, so
 * the gameplay balance is identical to stock xbill.
 */
const LOGIC_SIZE   = 400;
const TICK_MS      = 200;	/* UI.c: methods->start_timer(200) */

const COMPUTER_W   = 55,  COMPUTER_H = 45;	/* maccpu.xpm et al */
const OS_W         = 28,  OS_H       = 24;	/* wingdows.xpm et al */
const BILL_W       = 24,  BILL_H     = 38;	/* billD_0.xpm */
const SPARK_W      = 20,  SPARK_H    = 20;	/* spark_0.xpm */
const BUCKET_W     = 24,  BUCKET_H   = 24;	/* bucket.xpm */

/* ------------------------------------------------------------------- OS.c */

const OS_WINGDOWS = 0;
const OS_OFF      = -1;
const OS_MIN_PC   = 6;		/* OS.c: MIN_PC — os index >= 6 is a PC OS */

const OS_NAMES = ['wingdows', 'apple', 'next', 'sgi', 'sun',
                  'palm', 'os2', 'bsd', 'linux', 'redhat', 'hurd'];
const NUM_OS = OS_NAMES.length;				/* 11 */

/* -------------------------------------------------------------- Computer.c */

const COMPUTER_TOASTER = 0;
const CPU_MIN_PC = 6;		/* Computer.c: MIN_PC — type >= 6 is a PC */

const CPU_NAMES = ['toaster', 'maccpu', 'nextcpu', 'sgicpu',
                   'suncpu', 'palmcpu', 'os2cpu', 'bsdcpu'];
const NUM_SYS = CPU_NAMES.length;			/* 8 */

const OS_OFFSET = 4;		/* offset of the OS icon inside the screen */

/* ------------------------------------------------------------------ Bill.c */

const BILL_STATE_IN    = 1;
const BILL_STATE_AT    = 2;
const BILL_STATE_OUT   = 3;
const BILL_STATE_DYING = 4;
const BILL_STATE_STRAY = 5;

const BILL_OFFSET_X = 20;
const BILL_OFFSET_Y = 3;

const GRAVITY = 3;
const SLOW = 0, FAST = 1;
const WCELS = 4, DCELS = 5, ACELS = 13;

/* ----------------------------------------------------------------- Spark.h */

const SPARK_SPEED = 4;

/* ------------------------------------------------------------------ Game.c */

const STATE_PLAYING = 1;
const STATE_BETWEEN = 2;
const STATE_END     = 3;
const STATE_WAITING = 4;

const SCORE_BILLPOINTS = 5;

/* ----------------------------------------------------------------- Horde.c */

const MAX_BILLS = 100;

/* --------------------------------------------------------------- Network.c */

const STD_MAX_COMPUTERS = 20;

/* ======================================================================== */

class Engine {
	/*
	 * opts.seed       — rng seed (defaults to a time seed)
	 * opts.screensize — the original's --size option.  Leave at 400 for
	 *                   stock balance; larger values scale the number of
	 *                   bills and computers by (size/400)^2 exactly as
	 *                   Game_scale(2) does.
	 * opts.randInt    — optional replacement for C's rand(): returns a
	 *                   non-negative 31-bit int.  The differential test
	 *                   passes glibc's generator in here so the JS and the
	 *                   original C consume an identical random stream.
	 */
	constructor(opts) {
		opts = opts || {};
		this.screensize = opts.screensize || LOGIC_SIZE;
		this.seed = (opts.seed === undefined)
			? (Date.now() & 0x7fffffff) : (opts.seed | 0);
		if (opts.randInt) {
			this.randInt = opts.randInt;
		} else {
			const rng = mulberry32(this.seed);
			this.randInt = () => Math.floor(rng() * 2147483648);
		}

		this.state = STATE_WAITING;
		this.score = 0;
		this.level = 0;
		this.iteration = 0;
		this.efficiency = 0;

		this.computers = [];
		this.cables = [];
		this.alive = [];	/* index 0 is the C list head */
		this.strays = [];

		/* Horde counters */
		this.billsOn = 0;
		this.billsOff = 0;
		/* Network counters */
		this.sysBase = 0;	/* running their own OS */
		this.sysOff = 0;	/* powered off */
		this.sysWin = 0;	/* infected */

		this.grabbed = null;	/* stray OS held by the cursor */
		this.bucketGrabbed = false;

		this.events = [];
		this._billSeq = 0;
	}

	/*
	 * util.h: RAND(lb, ub) == rand() % ((ub) - (lb) + 1) + (lb).
	 * Expressed with the same modulo the C uses — including its slight
	 * low-end bias — so a shared integer stream yields identical draws.
	 */
	rand(lb, ub) {
		return (this.randInt() % (ub - lb + 1)) + lb;
	}

	/* Game.c: Game_scale */
	scale(dimensions) {
		const s = this.screensize / LOGIC_SIZE;
		let d = 1;
		for (let i = dimensions; i > 0; i--) d *= s;
		return d;
	}

	/* UI.c: UI_intersect */
	static intersect(x1, y1, w1, h1, x2, y2, w2, h2) {
		return Math.abs(x2 - x1 + idiv(w2 - w1, 2)) < idiv(w1 + w2, 2) &&
		       Math.abs(y2 - y1 + idiv(h2 - h1, 2)) < idiv(h1 + h2, 2);
	}

	/* =============================================== Game.c: lifecycle === */

	/* Game.c: setup_level */
	setupLevel(newlevel) {
		this.level = newlevel;
		this.hordeSetup();
		this.grabbed = null;
		this.bucketGrabbed = false;
		this.networkSetup();
		this.iteration = 0;
		this.efficiency = 0;
	}

	/* Game.c: Game_start */
	start(newlevel) {
		this.state = STATE_PLAYING;
		this.score = 0;
		this.setupLevel(newlevel);
	}

	/* Game.c: Game_warp_to_level */
	warpToLevel(lev) {
		if (this.state === STATE_PLAYING) {
			if (lev <= this.level) return;
			this.setupLevel(lev);
		} else {
			if (lev <= 0) return;
			this.start(lev);
		}
	}

	/* ================================================ Network.c =========== */

	/* Network.c: on() */
	numComputersFor(level) {
		const normal = Math.min(8 + level, STD_MAX_COMPUTERS);
		return Math.trunc(normal * this.scale(2));
	}

	/* Network.c: Network_setup */
	networkSetup() {
		let n = this.numComputersFor(this.level);
		this.computers = [];
		for (let i = 0; i < n; i++) {
			const c = this.computerSetup(i);
			if (!c) {
				/*
				 * Network.c does `ncomputers = i - 1` here,
				 * which drops one more machine than it placed.
				 * Kept, but floored at 0 — the original would
				 * index a negative count.
				 */
				n = Math.max(i - 1, 0);
				this.computers.length = n;
				break;
			}
			this.computers.push(c);
		}
		this.sysOff = 0;
		this.sysBase = this.computers.length;
		this.sysWin = 0;

		const ncables = Math.min(this.level,
					 idiv(this.computers.length, 2));
		this.cables = [];
		for (let i = 0; i < ncables; i++)
			this.cables.push(this.cableSetup());
	}

	/* Network.c: Network_toasters */
	networkToasters() {
		for (const c of this.computers) {
			c.type = COMPUTER_TOASTER;
			c.os = OS_OFF;
		}
		this.cables = [];
	}

	/* Network.c: Network_clear_stray */
	networkClearStray(bill) {
		for (const c of this.computers)
			if (c.stray === bill) c.stray = null;
	}

	/* ================================================ Computer.c ========== */

	/* Computer.c: determineOS */
	determineOS(type) {
		if (type < CPU_MIN_PC) return type;
		return this.rand(OS_MIN_PC, NUM_OS - 1);	/* OS_randpc */
	}

	/* Computer.c: Computer_setup — returns null if placement failed */
	computerSetup(index) {
		const screensize = this.screensize;
		const border = idiv(screensize, 10);	/* BORDER(size) */
		let counter = 0, x, y, flag;
		do {
			if (++counter > 4000) return null;
			x = this.rand(border, screensize - border - COMPUTER_W);
			y = this.rand(border, screensize - border - COMPUTER_H);
			flag = true;
			/* twidth = width - BILL_OFFSET_X + Bill_width() */
			const twidth = COMPUTER_W - BILL_OFFSET_X + BILL_W;
			for (let j = 0; j < index && flag; j++) {
				const c = this.computers[j];
				if (Engine.intersect(x, y, twidth, COMPUTER_H,
						     c.x, c.y, twidth, COMPUTER_H))
					flag = false;
			}
		} while (!flag);

		const type = this.rand(1, NUM_SYS - 1);
		return {
			type,
			os: this.determineOS(type),
			x, y,
			busy: 0,
			stray: null,
		};
	}

	/*
	 * Computer.c: Computer_on.  Note this is NOT a plain bounding box —
	 * it is a +/- width, +/- height test around the top-left corner, so
	 * the drop target extends above and to the left of the machine.  That
	 * generosity is part of how the original plays, so it is preserved.
	 */
	static computerOn(computer, locx, locy) {
		return Math.abs(locx - computer.x) < COMPUTER_W &&
		       Math.abs(locy - computer.y) < COMPUTER_H;
	}

	/* Computer.c: Computer_compatible */
	static computerCompatible(computer, system) {
		return computer.type === system ||
		       (computer.type >= CPU_MIN_PC && system >= OS_MIN_PC);
	}

	/* ================================================ Cable.c ============= */

	/* Cable.c: Cable_setup */
	cableSetup() {
		const n = this.computers.length;
		const c1 = this.rand(0, n - 1);
		let c2;
		do { c2 = this.rand(0, n - 1); } while (c2 === c1);

		const comp1 = this.computers[c1], comp2 = this.computers[c2];
		return {
			c1, c2,
			x1: comp1.x + idiv(COMPUTER_W, 3),
			y1: comp1.y + idiv(COMPUTER_H, 2),
			x2: comp2.x + idiv(COMPUTER_W, 3),
			y2: comp2.y + idiv(COMPUTER_H, 2),
			x: 0, y: 0, fx: 0, fy: 0,
			px: 0, py: 0,	/* render-only: previous spark pos */
			/*
			 * delay is assigned by the original but never read —
			 * SPARK_DELAY is dead code in 2.1 and sparks launch
			 * immediately.  Mirrored so behaviour matches.
			 */
			delay: Math.max(20 - this.level, 0),
			active: 0,
			index: 0,
		};
	}

	static cableReverse(cable) {
		let t;
		t = cable.c1; cable.c1 = cable.c2; cable.c2 = t;
		t = cable.x1; cable.x1 = cable.x2; cable.x2 = t;
		t = cable.y1; cable.y1 = cable.y2; cable.y2 = t;
	}

	/* Cable.c: Cable_update */
	cableUpdate(cable) {
		let comp1 = this.computers[cable.c1];
		let comp2 = this.computers[cable.c2];

		if (cable.active) {
			if ((comp1.os === OS_WINGDOWS) === (comp2.os === OS_WINGDOWS)) {
				cable.active = 0;
			} else if (comp1.os === OS_WINGDOWS || comp2.os === OS_WINGDOWS) {
				if (comp2.os === OS_WINGDOWS) {
					Engine.cableReverse(cable);
					comp1 = this.computers[cable.c1];
					comp2 = this.computers[cable.c2];
				}

				let xdist = cable.x2 - cable.x;
				let ydist = cable.y2 - cable.y;
				const sx = xdist >= 0 ? 1.0 : -1.0;
				const sy = ydist >= 0 ? 1.0 : -1.0;
				xdist = Math.abs(xdist);
				ydist = Math.abs(ydist);

				if (xdist === 0 && ydist === 0) {
					if (!comp2.busy) {
						if (comp2.os === OS_OFF)
							this.sysOff--;
						else
							this.sysBase--;
						this.sysWin++;
						comp2.os = OS_WINGDOWS;
					}
					cable.active = 0;
				} else if (Math.max(xdist, ydist) < SPARK_SPEED) {
					cable.x = cable.x2;
					cable.y = cable.y2;
				} else {
					/* float accumulate, int snapshot */
					cable.fx += (xdist * SPARK_SPEED * sx) / (xdist + ydist);
					cable.fy += (ydist * SPARK_SPEED * sy) / (xdist + ydist);
					cable.x = Math.trunc(cable.fx);
					cable.y = Math.trunc(cable.fy);
				}
				cable.index = 1 - cable.index;
			}
		} else {
			if ((comp1.os === OS_WINGDOWS) === (comp2.os === OS_WINGDOWS)) {
				/* nothing */
			} else if (comp1.os === OS_WINGDOWS || comp2.os === OS_WINGDOWS) {
				cable.active = 1;
				cable.delay = Math.max(20 - this.level, 0);
				if (comp2.os === OS_WINGDOWS)
					Engine.cableReverse(cable);
				cable.x = cable.x1;
				cable.fx = cable.x1;
				cable.y = cable.y1;
				cable.fy = cable.y1;
			}
		}
	}

	/* Cable.c: Cable_onspark */
	static cableOnSpark(cable, locx, locy) {
		if (!cable.active) return false;
		return Math.abs(locx - cable.x) < SPARK_W &&
		       Math.abs(locy - cable.y) < SPARK_H;
	}

	/* ================================================ Bill.c ============== */

	/* Bill.c: get_border — returns a point just off one of the four edges */
	getBorder() {
		const i = this.rand(0, 3);
		const screensize = this.screensize;
		let x = 0, y = 0;

		if (i % 2 === 0) x = this.rand(0, screensize - BILL_W);
		else             y = this.rand(0, screensize - BILL_H);

		switch (i) {
			case 0: y = -BILL_H - 16; break;
			case 1: x = screensize + 1; break;
			case 2: y = screensize + 1; break;
			case 3: x = -BILL_W - 2; break;
		}
		return { x, y };
	}

	/* Bill.c: Bill_enter */
	billEnter() {
		const pos = this.getBorder();
		const target_c = this.rand(0, this.computers.length - 1);
		const computer = this.computers[target_c];

		const bill = {
			id: ++this._billSeq,
			state: BILL_STATE_IN,
			index: 0,
			cels: 'L',		/* which animation strip */
			x: pos.x, y: pos.y,
			target_x: computer.x + COMPUTER_W - BILL_OFFSET_X,
			target_y: computer.y + BILL_OFFSET_Y,
			target_c,
			cargo: OS_WINGDOWS,
			x_offset: -2,
			y_offset: -15,
			sx: 0, sy: 0,
			removed: false,
			/* render-only: previous position for interpolation */
			px: pos.x, py: pos.y,
		};
		this.billsOn++;
		this.billsOff--;
		return bill;
	}

	/* Bill.c: step_size */
	static stepSize(level) { return Math.min(11 + level, 15); }

	/* Bill.c: move — returns whether Bill actually moved */
	move(bill, mode) {
		let xdist = bill.target_x - bill.x;
		let ydist = bill.target_y - bill.y;
		const step = Engine.stepSize(this.level);
		const signx = xdist >= 0 ? 1 : -1;
		const signy = ydist >= 0 ? 1 : -1;
		xdist = Math.abs(xdist);
		ydist = Math.abs(ydist);

		if (!xdist && !ydist) return 0;

		if (xdist < step && ydist < step) {
			bill.x = bill.target_x;
			bill.y = bill.target_y;
		} else {
			/* C: int arithmetic, truncating division */
			let dx = idiv(xdist * step * signx, xdist + ydist);
			let dy = idiv(ydist * step * signy, xdist + ydist);
			if (mode === FAST) {
				/* C: int *= 1.25 — promote, multiply, truncate */
				dx = Math.trunc(dx * 1.25);
				dy = Math.trunc(dy * 1.25);
			}
			bill.x += dx;
			bill.y += dy;
			if (dx < 0) bill.cels = 'L';
			else if (dx > 0) bill.cels = 'R';
		}
		return 1;
	}

	/* Bill.c: update_in */
	updateIn(bill) {
		const moved = this.move(bill, SLOW);
		let computer = this.computers[bill.target_c];

		if (!moved && computer.os !== OS_WINGDOWS && !computer.busy) {
			computer.busy = 1;
			bill.cels = 'A';
			bill.index = 0;
			bill.state = BILL_STATE_AT;
			return;
		} else if (!moved) {
			/*
			 * The original loops until it draws a *different*
			 * computer, which spins forever with only one machine.
			 * Guarded here; behaviour is identical for n >= 2.
			 */
			const n = this.computers.length;
			if (n >= 2) {
				let i;
				do { i = this.rand(0, n - 1); }
				while (i === bill.target_c);
				computer = this.computers[i];
				bill.target_c = i;
				bill.target_x = computer.x + COMPUTER_W - BILL_OFFSET_X;
				bill.target_y = computer.y + BILL_OFFSET_Y;
			}
		}
		bill.index++;
		bill.index %= WCELS;
		bill.y_offset += (8 * (bill.index % 2) - 4);
	}

	/* Bill.c: update_at — the 13-frame OS theft animation */
	updateAt(bill) {
		const computer = this.computers[bill.target_c];

		if (bill.index === 0 && computer.os === OS_OFF) {
			bill.index = 6;
			if (computer.stray === null) {
				bill.cargo = -1;
			} else {
				bill.cargo = computer.stray.cargo;
				this.hordeRemoveBill(computer.stray);
				computer.stray = null;
			}
		} else {
			bill.index++;
		}

		if (bill.index === 13) {
			bill.y_offset = -15;
			bill.x_offset = -2;
			const b = this.getBorder();
			bill.target_x = b.x;
			bill.target_y = b.y;
			bill.index = 0;
			bill.cels = 'L';
			bill.state = BILL_STATE_OUT;
			computer.busy = 0;
			return;
		}

		bill.y_offset = BILL_H - OS_H;		/* 38 - 24 = 14 */

		switch (bill.index) {
		case 1:
		case 2:
			bill.x -= 8; bill.x_offset += 8; break;
		case 3:
			bill.x -= 10; bill.x_offset += 10; break;
		case 4:
			bill.x += 3; bill.x_offset -= 3; break;
		case 5:
			bill.x += 2; bill.x_offset -= 2; break;
		case 6:
			if (computer.os !== OS_OFF) {
				this.sysBase--;
				this.sysOff++;
				bill.cargo = computer.os;
			} else {
				bill.x -= 21; bill.x_offset += 21;
			}
			computer.os = OS_OFF;
			bill.y_offset = -15;
			bill.x += 20; bill.x_offset -= 20;
			break;
		case 7:
			bill.sy = bill.y_offset; bill.sx = -2; break;
		case 8:
			bill.sy = -15; bill.sx = -2; break;
		case 9:
			bill.sy = -7; bill.sx = -7;
			bill.x -= 8; bill.x_offset += 8; break;
		case 10:
			bill.sy = 0; bill.sx = -7;
			bill.x -= 15; bill.x_offset += 15; break;
		case 11:
			bill.sy = 0; bill.sx = -7;
			computer.os = OS_WINGDOWS;
			this.sysOff--;
			this.sysWin++;
			break;
		case 12:
			bill.x += 11; bill.x_offset -= 11; break;
		}
	}

	/* Bill.c: update_out */
	updateOut(bill) {
		const s = this.screensize;
		if (Engine.intersect(bill.x, bill.y, BILL_W, BILL_H, 0, 0, s, s)) {
			this.move(bill, FAST);
			bill.index++;
			bill.index %= WCELS;
			bill.y_offset += (8 * (bill.index % 2) - 4);
		} else {
			/* escaped — goes back into the off-screen pool */
			this.hordeRemoveBill(bill);
			this.billsOn--;
			this.billsOff++;
		}
	}

	/* Bill.c: update_dying */
	updateDying(bill) {
		if (bill.index < DCELS - 1) {
			bill.y_offset += (bill.index * GRAVITY);
			bill.index++;
		} else {
			bill.y += bill.y_offset;
			if (bill.cargo < 0 || bill.cargo === OS_WINGDOWS) {
				this.hordeRemoveBill(bill);
			} else {
				this.hordeMoveBill(bill);
				bill.state = BILL_STATE_STRAY;
			}
			this.billsOn--;
		}
	}

	/* Bill.c: Bill_update */
	billUpdate(bill) {
		switch (bill.state) {
			case BILL_STATE_IN:    this.updateIn(bill); break;
			case BILL_STATE_AT:    this.updateAt(bill); break;
			case BILL_STATE_OUT:   this.updateOut(bill); break;
			case BILL_STATE_DYING: this.updateDying(bill); break;
		}
	}

	/* Bill.c: Bill_set_dying */
	static billSetDying(bill) {
		bill.index = -1;
		bill.cels = 'D';
		bill.x_offset = -2;
		bill.y_offset = -15;
		bill.state = BILL_STATE_DYING;
	}

	/* Bill.c: Bill_clicked */
	static billClicked(bill, locx, locy) {
		return locx > bill.x && locx < bill.x + BILL_W &&
		       locy > bill.y && locy < bill.y + BILL_H;
	}

	/* Bill.c: Bill_clickedstray — stray hitbox is the OS icon, not Bill */
	static billClickedStray(bill, locx, locy) {
		return locx > bill.x && locx < bill.x + OS_W &&
		       locy > bill.y && locy < bill.y + OS_H;
	}

	/* ================================================ Horde.c ============= */

	/* Horde.c: on() */
	billsForLevel(level) {
		const perlevel = Math.trunc((8 + 3 * level) * this.scale(2));
		return Math.min(perlevel, MAX_BILLS);
	}

	/* Horde.c: max_at_once */
	static maxAtOnce(level) { return Math.min(2 + idiv(level, 4), 12); }

	/*
	 * Horde.c: between() — reproduces a signedness bug in the original.
	 *
	 *	static int between(unsigned int lev) {
	 *		return MAX(14 - lev / 3, 10);
	 *	}
	 *
	 * `lev` is unsigned, so once lev/3 exceeds 14 (level >= 45) the
	 * subtraction wraps to ~4.29e9, MAX compares unsigned and picks it,
	 * and the int return reinterprets it as a small negative number.
	 * The caller then does `iteration % between(level) == 0`, and since
	 * n % -1 is 0 for every n, Bills start launching on *every* tick
	 * instead of every 10.  Level 45 is where xbill falls off a cliff.
	 *
	 * Preserved deliberately: the differential test against the C build
	 * fails without it.
	 */
	static between(level) {
		const wrapped = (14 - idiv(level, 3)) >>> 0;	/* unsigned */
		const m = wrapped > 10 ? wrapped : 10;		/* MAX, unsigned */
		return m | 0;					/* back to int */
	}

	/* Horde.c: Horde_setup */
	hordeSetup() {
		this.alive = [];
		this.strays = [];
		this.billsOff = this.billsForLevel(this.level);
		this.billsOn = 0;
	}

	/* Horde.c: launch */
	launch(max) {
		if (max === 0 || this.billsOff === 0) return;
		let n = this.rand(1, Math.min(max, this.billsOff));
		for (; n > 0; n--)
			this.alive.unshift(this.billEnter());	/* PREPEND */
	}

	/* Horde.c: Horde_update */
	hordeUpdate(iteration) {
		const level = this.level;
		if (iteration % Engine.between(level) === 0)
			this.launch(Engine.maxAtOnce(level));

		/*
		 * Horde_update caches bill->next before calling Bill_update.
		 * That is unsafe in the original: update_at() claims a
		 * computer's stray and calls Horde_remove_bill() on it, which
		 * UNLINKs and free()s a Bill that may be exactly the cached
		 * next pointer — so the loop then walks freed memory and the
		 * rest of the list is updated or skipped depending on what the
		 * allocator left behind.
		 *
		 * This is the one place the port deliberately does NOT copy
		 * the original: reproducing a use-after-free is neither
		 * possible nor desirable.  We snapshot the list and skip any
		 * Bill removed mid-pass, which is what the C does whenever the
		 * freed memory happens to survive intact.
		 */
		const snapshot = this.alive.slice();
		for (const bill of snapshot) {
			if (bill.removed) continue;
			bill.px = bill.x; bill.py = bill.y;
			this.billUpdate(bill);
		}
	}

	/* Horde.c: Horde_move_bill — alive -> strays */
	hordeMoveBill(bill) {
		const i = this.alive.indexOf(bill);
		if (i >= 0) this.alive.splice(i, 1);
		this.strays.unshift(bill);
	}

	/* Horde.c: Horde_remove_bill */
	hordeRemoveBill(bill) {
		const list = (bill.state === BILL_STATE_STRAY)
			? this.strays : this.alive;
		const i = list.indexOf(bill);
		if (i >= 0) list.splice(i, 1);
		bill.removed = true;
		this.networkClearStray(bill);
	}

	/* Horde.c: Horde_add_bill — puts a grabbed bill back */
	hordeAddBill(bill) {
		if (bill.state === BILL_STATE_STRAY) this.strays.unshift(bill);
		else this.alive.unshift(bill);
	}

	/* Horde.c: Horde_clicked_stray — unlinks and returns it */
	hordeClickedStray(x, y) {
		for (const bill of this.strays) {
			if (!Engine.billClickedStray(bill, x, y)) continue;
			const i = this.strays.indexOf(bill);
			this.strays.splice(i, 1);
			return bill;
		}
		return null;
	}

	/* Horde.c: Horde_process_click — kills every bill under the point */
	hordeProcessClick(x, y) {
		let counter = 0;
		for (const bill of this.alive) {
			if (bill.state === BILL_STATE_DYING ||
			    !Engine.billClicked(bill, x, y))
				continue;
			if (bill.state === BILL_STATE_AT) {
				const comp = this.computers[bill.target_c];
				comp.busy = 0;
				comp.stray = bill;
			}
			Engine.billSetDying(bill);
			counter++;
		}
		return counter;
	}

	/* ================================================ Bucket.c ============ */

	/* Bucket.c: Bucket_clicked */
	static bucketClicked(x, y) {
		return x > 0 && x < BUCKET_W && y > 0 && y < BUCKET_H;
	}

	/* Bucket.c: Bucket_release */
	bucketRelease(x, y) {
		for (const cable of this.cables)
			if (Engine.cableOnSpark(cable, x, y))
				this._cableReset(cable);
		this.bucketGrabbed = false;
	}

	_cableReset(cable) {
		cable.active = 0;
		cable.delay = Math.max(20 - this.level, 0);
	}

	/* ================================================ Game.c: input ======= */

	/* Game.c: Game_button_press */
	buttonPress(x, y) {
		if (this.state !== STATE_PLAYING) return 0;

		if (Engine.bucketClicked(x, y)) {
			this.bucketGrabbed = true;
			return 0;
		}

		this.grabbed = this.hordeClickedStray(x, y);
		if (this.grabbed !== null) return 0;

		const counter = this.hordeProcessClick(x, y);
		this.score += counter * counter * SCORE_BILLPOINTS;
		return counter;
	}

	/* Game.c: Game_button_release */
	buttonRelease(x, y) {
		if (this.state !== STATE_PLAYING) {
			this.bucketGrabbed = false;
			return false;
		}

		if (this.grabbed === null) {
			/*
			 * Note: the original routes *every* release with no
			 * held OS through Bucket_release, so clicking directly
			 * on a spark extinguishes it whether or not you picked
			 * the bucket up first.  Preserved.
			 */
			this.bucketRelease(x, y);
			return false;
		}

		const grabbed = this.grabbed;
		for (const computer of this.computers) {
			/*
			 * Note there is deliberately no `!computer.busy` test
			 * here, matching Game_button_release.  That means you
			 * may drop an OS onto a machine a Bill has already
			 * powered off mid-theft.  The Bill's animation then
			 * reaches frame 11 and does OFF--/WIN++ on a machine
			 * that is no longer off, so the three system counters
			 * drift from the real machine states: "running" reads
			 * one too high and "off" one too low each time, and
			 * "off" can even go negative on the status line.
			 *
			 * This is an xbill 2.1 bug, not a porting mistake —
			 * the original C drifts in exactly the same way (it
			 * shows up in roughly two thirds of long games).  It
			 * is kept because it is observable: an over-counted
			 * "running" total delays the base + off <= 1 game-over
			 * test, so removing it would make the endgame harder
			 * than the real thing.  The sum of the three counters
			 * always still equals the machine count.
			 */
			if (Engine.computerOn(computer, x, y) &&
			    Engine.computerCompatible(computer, grabbed.cargo) &&
			    (computer.os === OS_WINGDOWS || computer.os === OS_OFF)) {
				this.sysBase++;
				if (computer.os === OS_WINGDOWS) this.sysWin--;
				else this.sysOff--;
				computer.os = grabbed.cargo;
				this.hordeRemoveBill(grabbed);
				this.grabbed = null;
				return true;
			}
		}
		/* no valid target — the OS drops back where it was */
		this.hordeAddBill(grabbed);
		this.grabbed = null;
		return false;
	}

	/* ================================================ Game.c: update ====== */

	/* Game.c: update_info — the efficiency accumulator */
	updateInfo() {
		const units = this.computers.length;
		if (units <= 0) return;
		this.efficiency += idiv(100 * this.sysBase - 10 * this.sysWin,
					units);
	}

	/*
	 * Game.c: Game_update, minus the drawing.  Returns the events raised
	 * this tick so the caller can show dialogs / stop the clock.
	 */
	tick() {
		this.events = [];

		switch (this.state) {
		case STATE_PLAYING: {
			for (const cable of this.cables) {
				cable.px = cable.x; cable.py = cable.y;
				this.cableUpdate(cable);
			}
			this.hordeUpdate(this.iteration);
			this.updateInfo();

			if (this.billsOn + this.billsOff === 0) {
				if (this.iteration > 0)
					this.score += idiv(this.level * this.efficiency,
							   this.iteration);
				this.state = STATE_BETWEEN;
			}
			/*
			 * Checked after the level-clear test, so if both fire
			 * on the same tick the game-over wins — same as the C.
			 */
			if (this.sysBase + this.sysOff <= 1)
				this.state = STATE_END;
			break;
		}
		case STATE_END:
			this.networkToasters();
			this.events.push({ type: 'gameover',
					   level: this.level,
					   score: this.score });
			this.state = STATE_WAITING;
			break;

		case STATE_BETWEEN:
			this.events.push({ type: 'levelcomplete',
					   level: this.level,
					   score: this.score });
			this.state = STATE_PLAYING;
			this.setupLevel(this.level + 1);
			break;
		}

		this.iteration++;
		return this.events;
	}

	/* ------------------------------------------------ status line -------- */

	/* Game.c: update_info's sprintf */
	statusLine() {
		return `Bill:${this.billsOn}/${this.billsOff}  ` +
		       `System:${this.sysBase}/${this.sysOff}/${this.sysWin}  ` +
		       `Level:${this.level}  Score:${this.score}`;
	}
}

/* exported constants, so the renderer and tests share one source of truth */
Engine.LOGIC_SIZE = LOGIC_SIZE;
Engine.TICK_MS = TICK_MS;
Engine.COMPUTER_W = COMPUTER_W; Engine.COMPUTER_H = COMPUTER_H;
Engine.OS_W = OS_W; Engine.OS_H = OS_H;
Engine.BILL_W = BILL_W; Engine.BILL_H = BILL_H;
Engine.SPARK_W = SPARK_W; Engine.SPARK_H = SPARK_H;
Engine.BUCKET_W = BUCKET_W; Engine.BUCKET_H = BUCKET_H;
Engine.OS_OFFSET = OS_OFFSET;
Engine.OS_WINGDOWS = OS_WINGDOWS; Engine.OS_OFF = OS_OFF;
Engine.OS_MIN_PC = OS_MIN_PC; Engine.CPU_MIN_PC = CPU_MIN_PC;
Engine.OS_NAMES = OS_NAMES; Engine.CPU_NAMES = CPU_NAMES;
Engine.NUM_OS = NUM_OS; Engine.NUM_SYS = NUM_SYS;
Engine.BILL_STATE_IN = BILL_STATE_IN;
Engine.BILL_STATE_AT = BILL_STATE_AT;
Engine.BILL_STATE_OUT = BILL_STATE_OUT;
Engine.BILL_STATE_DYING = BILL_STATE_DYING;
Engine.BILL_STATE_STRAY = BILL_STATE_STRAY;
Engine.STATE_PLAYING = STATE_PLAYING;
Engine.STATE_BETWEEN = STATE_BETWEEN;
Engine.STATE_END = STATE_END;
Engine.STATE_WAITING = STATE_WAITING;
Engine.WCELS = WCELS; Engine.DCELS = DCELS; Engine.ACELS = ACELS;
Engine.BILL_OFFSET_X = BILL_OFFSET_X; Engine.BILL_OFFSET_Y = BILL_OFFSET_Y;
Engine.COMPUTER_TOASTER = COMPUTER_TOASTER;
Engine.SCORE_BILLPOINTS = SCORE_BILLPOINTS;
Engine.idiv = idiv;
Engine.mulberry32 = mulberry32;

return Engine;
});
