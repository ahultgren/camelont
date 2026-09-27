#!/usr/bin/env python3
"""Look up key/BPM for Spotify tracks and order them by the Camelot wheel.

Spotify's own audio-features endpoint is closed to new apps (Nov 2024), so key,
mode, tempo and energy come from ReccoBeats, which accepts Spotify track IDs and
needs no API key. Results are cached in `Projects/Music/features.json`; tracks
ReccoBeats doesn't know can be filled in by hand with --set.

Usage:
  camelot.py ID [ID ...]            table of key / Camelot / BPM / energy
  camelot.py --order ID [ID ...]    same, in a suggested harmonic mixing order, with
                                    each transition named by the Camelot chart
                                    (perfect, +, ++, +++, −, −−, −−−, mood)
  camelot.py --order --start ID ... begin the order at a given track
  camelot.py --set ID 8A 124        manual override for a track (Camelot, BPM)
  ... | camelot.py -                read IDs from stdin, one per line

IDs may be bare IDs, spotify:track:… URIs or open.spotify.com URLs. Anything after
a tab on a stdin line is kept as the track's label (e.g. "ID<TAB>Artist – Title").
"""
import argparse
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CACHE = os.path.join(ROOT, "Projects", "Music", "features.json")
API = "https://api.reccobeats.com/v1/audio-features?ids="
BATCH = 40

NOTES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
ID_RE = re.compile(r"(?:track[:/])?([A-Za-z0-9]{22})")


def camelot(key, mode):
    """Pitch class (0=C) + mode (1=major) -> Camelot code, e.g. (9, 0) -> '8A'."""
    n = (key * 7 + (8 if mode else 5)) % 12 or 12
    return f"{n}{'B' if mode else 'A'}"


def key_name(key, mode):
    return NOTES[key] + ("" if mode else "m")


def parse_id(s):
    m = ID_RE.search(s)
    return m.group(1) if m else None


def load_cache():
    try:
        with open(CACHE) as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


def save_cache(cache):
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    with open(CACHE, "w") as f:
        json.dump(cache, f, indent=1, sort_keys=True)
        f.write("\n")


def fetch(ids):
    """Return {spotify_id: features} for the IDs ReccoBeats knows."""
    out = {}
    for i in range(0, len(ids), BATCH):
        req = urllib.request.Request(API + ",".join(ids[i:i + BATCH]),
                                     headers={"Accept": "application/json", "User-Agent": "camelot.py/1.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            for row in json.load(r).get("content", []):
                sid = parse_id(row.get("href", ""))
                if sid and row.get("key", -1) >= 0:
                    out[sid] = {
                        "camelot": camelot(row["key"], row["mode"]),
                        "key": key_name(row["key"], row["mode"]),
                        "bpm": round(row["tempo"], 1),
                        "energy": row.get("energy"),
                        "source": "reccobeats",
                    }
    return out


def split(code):
    return int(code[:-1]), code[-1]


# The Camelot compatibility chart: for a source mode, (target mode, steps up the
# wheel) -> (move, cost). Parenthesised moves are the chart's weaker alternatives.
# Anything missing from the chart is a clash.
CHART = {
    "A": {("A", 0): "perfect", ("B", 11): "perfect", ("B", 0): "+", ("A", 1): "+",
          ("A", 9): "++", ("A", 2): "+++", ("A", 7): "(+++)", ("A", 11): "−",
          ("A", 3): "−−", ("A", 10): "−−−", ("A", 5): "(−−−)", ("B", 3): "mood"},
    "B": {("B", 0): "perfect", ("A", 1): "perfect", ("B", 1): "+", ("B", 9): "++",
          ("B", 2): "+++", ("B", 7): "(+++)", ("A", 0): "−", ("B", 11): "−",
          ("B", 3): "−−", ("B", 10): "−−−", ("B", 5): "(−−−)", ("A", 9): "mood"},
}
COST = {"perfect": 0, "+": 1, "−": 1, "+++": 2, "−−−": 2, "++": 3, "−−": 3,
        "(+++)": 4, "(−−−)": 4, "mood": 4}
CLASH = 10


def move(a, b):
    """The chart's name for the transition a -> b, or None if it's not in the chart."""
    (na, la), (nb, lb) = split(a), split(b)
    return CHART[la].get((lb, (nb - na) % 12))


def key_cost(a, b):
    m = move(a, b)
    return COST[m] if m else CLASH


def bpm_gap(a, b):
    """Relative tempo gap, allowing half/double-time blends."""
    return min(abs(a - b), abs(a * 2 - b), abs(a - b * 2)) / max(a, b)


def order(tracks, start=None):
    """Greedy walk: each next track is the cheapest harmonic + tempo move."""
    pool = list(tracks)
    cur = next((t for t in pool if t["id"] == start), None) or pool[0]
    path = [cur]
    pool.remove(cur)
    while pool:
        nxt = min(pool, key=lambda t: key_cost(cur["camelot"], t["camelot"])
                  + bpm_gap(cur["bpm"], t["bpm"]) * 20)
        path.append(nxt)
        pool.remove(nxt)
        cur = nxt
    return path


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("ids", nargs="*", help="track IDs/URIs/URLs, or - for stdin")
    ap.add_argument("--order", action="store_true", help="suggest a mixing order")
    ap.add_argument("--start", help="track ID to start the order from")
    ap.add_argument("--set", nargs=3, metavar=("ID", "CAMELOT", "BPM"), help="manual override")
    ap.add_argument("--json", action="store_true", help="print JSON instead of a table")
    args = ap.parse_args()

    cache = load_cache()

    if args.set:
        sid, code, bpm = parse_id(args.set[0]), args.set[1].upper(), float(args.set[2])
        if not sid or not re.fullmatch(r"(1[0-2]|[1-9])[AB]", code):
            sys.exit("usage: --set <track id> <1-12><A|B> <bpm>")
        cache[sid] = {"camelot": code, "bpm": bpm, "key": None, "energy": None, "source": "manual"}
        save_cache(cache)
        print(f"{sid}: {code} @ {bpm}")
        return

    labels, ids = {}, []
    raw = sys.stdin.read().splitlines() if args.ids == ["-"] else args.ids
    for line in raw:
        head, _, label = line.partition("\t")
        sid = parse_id(head)
        if sid and sid not in labels:
            ids.append(sid)
            labels[sid] = label.strip()
    if not ids:
        ap.error("no track IDs given")

    missing = [i for i in ids if i not in cache]
    if missing:
        cache.update(fetch(missing))
        save_cache(cache)

    tracks = [dict(cache[i], id=i, label=labels[i]) for i in ids if i in cache]
    unknown = [i for i in ids if i not in cache]
    if args.order and tracks:
        tracks = order(tracks, parse_id(args.start or ""))

    if args.json:
        print(json.dumps({"tracks": tracks, "unknown": unknown}, indent=1))
    else:
        prev = None
        for t in tracks:
            step = f"  {move(prev, t['camelot']) or '✗ not in chart'}" if (args.order and prev) else ""
            print(f"{t['camelot']:>4}  {t['bpm']:>6}  {t['key'] or '':<4}  {t['id']}  {t['label']}{step}")
            prev = t["camelot"]
        for i in unknown:
            print(f"   ?       ?        {i}  {labels[i]}  (not in ReccoBeats — use --set)")


if __name__ == "__main__":
    main()
