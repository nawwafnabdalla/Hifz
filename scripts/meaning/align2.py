import os
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.cache'); os.makedirs(CACHE, exist_ok=True)
# Arabic<->English word alignment learned from the Qur'an + Saheeh pairs themselves (fast_align-style: IBM model 1 with a diagonal prior, both directions, intersection),
# then English clause boundaries are mapped onto Arabic word gaps. Offline tool: its OUTPUT (per-gap evidence) is what the app would ship.
import sys, math, collections, pickle, json, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from proto import prep, Q, T
NULL = '<null>'; LAM = 4.0; P0 = 0.08
def load_pairs():
    pairs = []
    for s in range(1, 115):
        for a in range(1, len(Q[s-1]) + 1):
            words, atoks, wmap, et = prep(s, a)
            ewi = [i for i, e in enumerate(et) if e['word'] and not e['ins']]
            pairs.append(((s, a), atoks, [et[i]['t'] for i in ewi]))
    return pairs
def train(pairs, swap, iters=6):
    # swap=False: p(e|f) (each English token chooses an Arabic token); swap=True: p(f|e)
    t = collections.defaultdict(lambda: 1e-3)
    for it in range(iters):
        cnt = collections.defaultdict(float); tot = collections.defaultdict(float)
        for _, A, E in pairs:
            tgt, src = (A, E) if swap else (E, A)
            I, J = len(src), len(tgt)
            if I == 0 or J == 0: continue
            for j, e in enumerate(tgt):
                ws = []
                for i, f in enumerate(src):
                    h = math.exp(-LAM * abs((i + 0.5) / I - (j + 0.5) / J))
                    ws.append((1 - P0) * t[(e, f)] * h)
                zn = P0 * t[(e, NULL)]
                z = sum(ws) + zn
                for i, f in enumerate(src):
                    c = ws[i] / z; cnt[(e, f)] += c; tot[f] += c
                c = zn / z; cnt[(e, NULL)] += c; tot[NULL] += c
        t = collections.defaultdict(lambda: 1e-6, {k: v / tot[k[1]] for k, v in cnt.items()})
        print('train', 'p(f|e)' if swap else 'p(e|f)', it, file=sys.stderr)
    return t
def viterbi(t, src, tgt):
    I, J = len(src), len(tgt); out = []
    for j, e in enumerate(tgt):
        best, bi = P0 * t[(e, NULL)], None
        for i, f in enumerate(src):
            h = math.exp(-LAM * abs((i + 0.5) / I - (j + 0.5) / J))
            v = (1 - P0) * t[(e, f)] * h
            if v > best: best, bi = v, i
        out.append(bi)
    return out
def lis_monotone(links):
    # links: list of (i, j); keep the largest set that is increasing in both
    links = sorted(links); best = []; 
    n = len(links); dp = [1] * n; prev = [-1] * n
    for x in range(n):
        for y in range(x):
            if links[y][0] <= links[x][0] and links[y][1] < links[x][1] and dp[y] + 1 > dp[x]: dp[x] = dp[y] + 1; prev[x] = y
    if not n: return []
    x = max(range(n), key=lambda k: dp[k]); seq = []
    while x != -1: seq.append(links[x]); x = prev[x]
    return seq[::-1]
if __name__ == '__main__':
    pairs = load_pairs()
    tf = train(pairs, False); tb = train(pairs, True)
    pickle.dump((dict(tf), dict(tb)), open(os.path.join(CACHE, 't2.pkl'), 'wb'))
