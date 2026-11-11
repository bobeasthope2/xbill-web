/*
 * Headless stand-ins for UI.c and Scorelist.c so the *unmodified* xbill
 * gameplay sources can be linked into a trace harness.  The only thing that
 * matters here is that UI_picture_width/height report the true .xpm sizes,
 * because the game logic derives its hitboxes from them, and that
 * UI_intersect is the real implementation copied verbatim from UI.c.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "types.h"
#include "UI.h"
#include "Scorelist.h"

/* A Picture is just its dimensions as far as the game logic is concerned. */
struct Picture { int w, h; };
struct MCursor { int dummy; };

static struct Picture pictures[256];
static int npictures;
static struct MCursor dummy_cursor;

int endgame_flag;	/* set when the game-over dialog would have popped */

/* dimensions straight out of the original pixmaps/*.xpm headers */
static void
dims_for(const char *name, int *w, int *h) {
	if (!strcmp(name, "toaster") || !strcmp(name, "maccpu") ||
	    !strcmp(name, "nextcpu") || !strcmp(name, "sgicpu") ||
	    !strcmp(name, "suncpu")  || !strcmp(name, "palmcpu") ||
	    !strcmp(name, "os2cpu")  || !strcmp(name, "bsdcpu")) {
		*w = 55; *h = 45; return;
	}
	if (!strcmp(name, "wingdows") || !strcmp(name, "apple") ||
	    !strcmp(name, "next") || !strcmp(name, "sgi") ||
	    !strcmp(name, "sun") || !strcmp(name, "palm") ||
	    !strcmp(name, "os2") || !strcmp(name, "bsd") ||
	    !strcmp(name, "linux") || !strcmp(name, "redhat") ||
	    !strcmp(name, "hurd")) {
		*w = 28; *h = 24; return;
	}
	if (!strncmp(name, "billA", 5)) { *w = 58; *h = 41; return; }
	if (!strncmp(name, "billL", 5) || !strncmp(name, "billR", 5) ||
	    !strncmp(name, "billD", 5)) { *w = 24; *h = 38; return; }
	if (!strncmp(name, "spark", 5)) { *w = 20; *h = 20; return; }
	if (!strcmp(name, "bucket")) { *w = 24; *h = 24; return; }
	if (!strcmp(name, "logo"))   { *w = 260; *h = 65; return; }
	if (!strcmp(name, "icon"))   { *w = 50; *h = 50; return; }
	if (!strcmp(name, "about"))  { *w = 300; *h = 140; return; }
	fprintf(stderr, "stub: unknown picture '%s'\n", name);
	exit(1);
}

void
UI_load_picture(const char *name, int trans, Picture **pictp) {
	int w, h;
	(void)trans;
	dims_for(name, &w, &h);
	pictures[npictures].w = w;
	pictures[npictures].h = h;
	*pictp = &pictures[npictures++];
}

void
UI_load_picture_indexed(const char *name, int index, int trans,
			Picture **pictp) {
	char buf[64];
	(void)index;
	snprintf(buf, sizeof buf, "%s", name);
	UI_load_picture(buf, trans, pictp);
}

/*
 * NULL-safe: Game.c's logo/icon/about statics are loaded by its main(), which
 * this harness replaces, so draw_logo() sees NULL at game over.  Returning 0
 * keeps that path harmless; no gameplay reads these.
 */
int UI_picture_width(Picture *p)  { return p ? p->w : 0; }
int UI_picture_height(Picture *p) { return p ? p->h : 0; }

void
UI_load_cursor(const char *name, int masked, MCursor **cursorp) {
	(void)name; (void)masked;
	*cursorp = &dummy_cursor;
}

/* verbatim from UI.c */
int
UI_intersect(int x1, int y1, int w1, int h1, int x2, int y2, int w2, int h2) {
	return ((abs(x2 - x1 + (w2 - w1) / 2) < (w1 + w2) / 2) &&
		(abs(y2 - y1 + (h2 - h1) / 2) < (h1 + h2) / 2));
}

void UI_popup_dialog(int index) {
	if (index == DIALOG_ENDGAME) endgame_flag = 1;
}

/* everything below is a no-op: drawing, timers, chrome */
void UI_restart_timer(void) {}
void UI_kill_timer(void) {}
void UI_pause_game(void) {}
void UI_resume_game(void) {}
void UI_initialize(const char *gui, int *argc, char **argv)
	{ (void)gui; (void)argc; (void)argv; }
void UI_make_main_window(int size) { (void)size; }
void UI_graphics_init(void) {}
void UI_make_dialogs(Picture *l, Picture *i, Picture *a)
	{ (void)l; (void)i; (void)a; }
void UI_set_cursor(MCursor *c) { (void)c; }
void UI_set_icon(Picture *p) { (void)p; }
void UI_clear(void) {}
void UI_refresh(void) {}
void UI_draw(Picture *p, int x, int y) { (void)p; (void)x; (void)y; }
void UI_draw_line(int a, int b, int c, int d)
	{ (void)a; (void)b; (void)c; (void)d; }
void UI_draw_str(const char *s, int x, int y) { (void)s; (void)x; (void)y; }
void UI_set_pausebutton(int a) { (void)a; }
void UI_main_loop(void) {}
void UI_update_dialog(int i, const char *s) { (void)i; (void)s; }
const char *UI_dialog_string(int i) { (void)i; return ""; }
const char *UI_menu_string(int i) { (void)i; return ""; }

/* Scorelist: the harness never exercises high scores */
void Scorelist_read(void) {}
void Scorelist_write(void) {}
void Scorelist_recalc(const char *s, int l, int v)
	{ (void)s; (void)l; (void)v; }
void Scorelist_update(void) {}
int Scorelist_ishighscore(int val) { (void)val; return 0; }
