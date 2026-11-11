#!/bin/sh
#
# Builds a headless binary from the ORIGINAL xbill 2.1 C sources so the JS
# port can be diffed against it tick-for-tick (see ../difftest.js).
#
# The gameplay sources are used unmodified except for Horde.c.patch, which
# adds two read-only accessors plus two changes that alter no game logic:
#
#   1. Horde_remove_bill() leaks instead of free()ing, and flags the Bill.
#   2. Horde_update() walks a snapshot and skips flagged Bills.
#
# Upstream caches bill->next before calling Bill_update(), and update_at() can
# remove exactly that Bill when it claims a computer's stray — so the loop then
# dereferences freed memory.  That use-after-free makes the tail of the list
# behave according to whatever the allocator left behind, which cannot be
# compared meaningfully against a memory-safe reimplementation.  The patch
# makes the C do what the code plainly intends; everything else is untouched.
#
# Usage: ./build.sh [outdir]      (default /tmp/xbilldiff)

set -e

HERE=$(cd "$(dirname "$0")" && pwd)
OUT=${1:-/tmp/xbilldiff}
URL=http://archive.ubuntu.com/ubuntu/pool/universe/x/xbill/xbill_2.1.orig.tar.gz

mkdir -p "$OUT"
cd "$OUT"

if [ ! -f xbill_2.1.orig.tar.gz ]; then
	echo "fetching original xbill 2.1 sources..."
	curl -fsSL -o xbill_2.1.orig.tar.gz "$URL"
fi

rm -rf xbill-2.1
tar xzf xbill_2.1.orig.tar.gz

# gameplay sources only — the real UI, scorelist and main() are replaced
for f in Bill Bucket Cable Computer Game Horde Network OS Spark util; do
	cp "xbill-2.1/$f.c" .
done
cp xbill-2.1/*.h .

# The patch carries both memory-safety changes and the read-only
# Horde_debug_alive/strays accessors the harness needs to dump the Bill lists.
patch -s -p0 Horde.c < "$HERE/Horde.c.patch"

cp "$HERE/stub.c" "$HERE/harness.c" .

# Game.c defines main(); rename it so the harness can provide its own
gcc -O1 -w -I. -Dmain=xbill_orig_main_unused -c Game.c -o Game.o
gcc -O1 -w -I. -c Bill.c Bucket.c Cable.c Computer.c Horde.c \
                 Network.c OS.c Spark.c util.c
gcc -O1 -w -I. -c stub.c harness.c
gcc -o harness Game.o Bill.o Bucket.o Cable.o Computer.o Horde.o \
               Network.o OS.o Spark.o util.o stub.o harness.o

echo "built $OUT/harness"
