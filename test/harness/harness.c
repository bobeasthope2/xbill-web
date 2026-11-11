/*
 * Drives the ORIGINAL xbill 2.1 gameplay sources headlessly and dumps a
 * per-tick state trace.  The JS port runs the same seed and the same scripted
 * input and must produce a byte-identical trace.
 *
 *   ./harness <seed> <startlevel> <maxticks> <inputscript>
 *
 * Input script lines: "<tick> <p|r> <x> <y>", applied before that tick's
 * Game_update().  Reading the script must not touch rand(), or the two
 * implementations would desync.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "types.h"
#include "Bill.h"
#include "Bucket.h"
#include "Computer.h"
#include "Game.h"
#include "Horde.h"
#include "Network.h"
#include "OS.h"
#include "Spark.h"
#include "UI.h"

extern int endgame_flag;
extern Bill *Horde_debug_alive(void);
extern Bill *Horde_debug_strays(void);

#define MAXEV 200000
static struct { int tick; char kind; int x, y; } ev[MAXEV];
static int nev;

static void
load_script(const char *path) {
	FILE *f = fopen(path, "r");
	char kind[8];
	if (f == NULL) return;	/* no input: idle game */
	while (nev < MAXEV &&
	       fscanf(f, "%d %7s %d %d", &ev[nev].tick, kind,
		      &ev[nev].x, &ev[nev].y) == 4) {
		ev[nev].kind = kind[0];
		nev++;
	}
	fclose(f);
}

static void
dump(int t) {
	int i;
	Bill *b;

	printf("t=%d sc=%d lv=%d b=%d/%d s=%d/%d/%d",
	       t, Game_score(), Game_level(),
	       Horde_get_counter(HORDE_COUNTER_ON),
	       Horde_get_counter(HORDE_COUNTER_OFF),
	       Network_get_counter(NETWORK_COUNTER_BASE),
	       Network_get_counter(NETWORK_COUNTER_OFF),
	       Network_get_counter(NETWORK_COUNTER_WIN));

	printf(" |C");
	for (i = 0; i < Network_num_computers(); i++) {
		Computer *c = Network_get_computer(i);
		printf(" %d,%d,%d,%d,%d", c->type, c->os, c->x, c->y, c->busy);
	}

	printf(" |B");
	for (b = Horde_debug_alive(); b != NULL; b = b->next)
		printf(" %d,%d,%d,%d,%d,%d",
		       b->state, b->x, b->y, b->index, b->cargo, b->target_c);

	printf(" |S");
	for (b = Horde_debug_strays(); b != NULL; b = b->next)
		printf(" %d,%d,%d", b->x, b->y, b->cargo);

	printf("\n");
}

int
main(int argc, char **argv) {
	int seed, startlevel, maxticks, t, i = 0;

	if (argc < 5) {
		fprintf(stderr,
			"usage: %s <seed> <level> <maxticks> <script>\n",
			argv[0]);
		return 2;
	}
	seed = atoi(argv[1]);
	startlevel = atoi(argv[2]);
	maxticks = atoi(argv[3]);
	load_script(argv[4]);

	srand(seed);

	/* same graphics-init order as Game.c's main() */
	Bill_load_pix();
	OS_load_pix();
	Computer_load_pix();
	Bucket_load_pix();
	Spark_load_pix();

	Game_start(startlevel);

	for (t = 0; t < maxticks && !endgame_flag; t++) {
		while (i < nev && ev[i].tick == t) {
			if (ev[i].kind == 'p')
				Game_button_press(ev[i].x, ev[i].y);
			else
				Game_button_release(ev[i].x, ev[i].y);
			i++;
		}
		Game_update();
		dump(t);
	}
	return 0;
}
