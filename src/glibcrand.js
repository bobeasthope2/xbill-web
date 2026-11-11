/*
 * A bit-exact reimplementation of glibc's rand() / srand() (the TYPE_3
 * additive-feedback generator, degree 31, separation 3).
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 *
 * Part of xbill-web, a browser port of XBill 2.1 by Brian Wellington and
 * Matias Duarte, Copyright 1994-2001.  Original is GPL-2.0-or-later;
 * this derivative work is distributed under the same terms.
 *
 * This exists purely so the JS engine can be driven by the *same* random
 * stream as the original C binary, which makes a tick-for-tick differential
 * test against the real xbill logic possible.  The shipped game uses
 * mulberry32 instead; nothing in normal play depends on this file.
 */
(function (root, factory) {
	if (typeof module === 'object' && module.exports)
		module.exports = factory();
	else
		root.glibcRand = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

function glibcRandom(seed) {
	const r = new Int32Array(344);

	/* glibc maps a zero seed to 1 */
	if (seed === 0) seed = 1;
	r[0] = seed | 0;

	for (let i = 1; i < 31; i++) {
		/*
		 * r[i] = (16807 * r[i-1]) % 2147483647 computed via Schrage's
		 * method, exactly as glibc does it to avoid 64-bit overflow.
		 */
		const prev = r[i - 1];
		const hi = Math.trunc(prev / 127773);
		const lo = prev % 127773;
		let word = 16807 * lo - 2836 * hi;
		if (word < 0) word += 2147483647;
		r[i] = word;
	}
	for (let i = 31; i < 34; i++) r[i] = r[i - 31];
	for (let i = 34; i < 344; i++) r[i] = (r[i - 31] + r[i - 3]) | 0;

	/*
	 * Steady state keeps a 31-entry window: next = x[n-31] + x[n-3],
	 * held in a circular buffer seeded from the tail of the warm-up.
	 */
	const buf = new Int32Array(31);
	for (let i = 0; i < 31; i++) buf[i] = r[344 - 31 + i];
	let p = 0;	/* points at x[n-31] */

	return function rand() {
		/* buf[p] is x[n-31]; x[n-3] is buf[(p + 28) % 31] */
		const val = (buf[p] + buf[(p + 28) % 31]) | 0;
		buf[p] = val;
		p = (p + 1) % 31;
		return (val >>> 1);
	};
}

return glibcRandom;
});
