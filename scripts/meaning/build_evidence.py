import os
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.cache'); os.makedirs(CACHE, exist_ok=True)
import sys, math, pickle, json, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from proto import prep, Q, T
from align2 import viterbi, lis_monotone, NULL
tf, tb = pickle.load(open(os.path.join(CACHE, 't2.pkl'), 'rb'))
import collections
tf = collections.defaultdict(lambda: 1e-6, tf); tb = collections.defaultdict(lambda: 1e-6, tb)
SPEECH = {'said', 'say', 'says', 'saying', 'call', 'calls', 'called', 'replied', 'reply', 'answered', 'asked', 'ask', 'told', 'tell', 'whispered', 'cried', 'declared', 'command', 'commanded', 'inspired', 'revealed'}
SENT_ADV = {'indeed', 'perhaps', 'surely', 'verily', 'so', 'then', 'but', 'and', 'now', 'thus', 'moreover', 'therefore', 'rather', 'yet', 'still', 'truly', 'certainly'}
HARD_START = {'indeed', 'perhaps', 'then', 'so', 'but', 'when', 'if', 'because', 'until', 'unless', 'lest', 'whoever', 'whenever', 'although', 'while', 'surely', 'verily'}
def strengths(text, et):
    """For each non-inserted English word k: (strength 0..3 of a clause boundary just before it, char offset of the word)."""
    wi = [i for i, e in enumerate(et) if e['word'] and not e['ins']]
    out = []
    for n, i in enumerate(wi):
        e = et[i]; w = e['t']
        if n == 0: out.append((0, e['pos'])); continue
        pe = et[wi[n-1]]; gap = text[pe['end']:e['pos']]
        s = 0
        if re.search(r'[;:.?!]', gap): s = 3
        elif re.search(r'\s[-–—]\s', gap): s = 2
        elif ',' in gap: s = 2
        if re.search(r"""[\"“”]|(?:^|[\s,])'""", gap) or re.search(r"""[?!.,;]['"”’]""", gap):
            opening = re.search(r"""(?:^|[\s,:])["“']\s*$""", gap) is not None
            prev_words = [et[wi[m]]['t'] for m in range(max(0, n - 4), n)]
            if opening and any(p in SPEECH for p in prev_words): s = max(s if s < 3 else 0, 1)      # "said to his family, "Stay…": the speech and its introduction belong together
            else: s = max(s, 3 if re.search(r"""[?!.;]['"”’]""", gap) else 2)
        # A comma straight after a sentence adverb ("Indeed, he …", "Perhaps, …") ends no clause: the clause starts at the adverb.
        if s == 2 and pe['t'] in SENT_ADV and re.fullmatch(r'\s*,\s*', gap): s = 0
        if w in HARD_START: s = max(s, 2)
        elif w in {'and', 'or'}: s = max(s, 2 if ',' in gap else 1)
        elif w == 'that': s = max(s, 1)
        elif w in {'who', 'which', 'whom', 'whose'}: s = max(s, 1 if ',' in gap else 0)         # "those who …" is one unit; ", who …" starts a clause
        out.append((s, e['pos']))
    return wi, out
def evidence(s, a):
    words, atoks, wmap, et = prep(s, a); text = T[s-1][a-1]
    wi, B = strengths(text, et)
    ew = [et[i]['t'] for i in wi]
    I, J = len(atoks), len(ew)
    W = len(words)
    if I == 0 or J == 0: return None
    af = viterbi(tf, atoks, ew)                      # English token j -> Arabic token (or None)
    ab = viterbi(tb, ew, atoks)                      # Arabic token i -> English token (or None)
    links = [(af[j], j) for j in range(J) if af[j] is not None and ab[af[j]] == j]
    anchors = lis_monotone(links)
    # each Arabic gap g can correspond to a RANGE of English cut positions (between its nearest anchors on each side)
    ranges = []
    for g in range(W - 1):
        left = [j for (i, j) in anchors if wmap[i] <= g]; right = [j for (i, j) in anchors if wmap[i] > g]
        lo = (max(left) + 1) if left else 0; hi = (min(right)) if right else J
        ranges.append((max(lo, 1), min(hi, J - 1)))
    # each English clause boundary is shared among the gaps whose range contains it (one gap if unambiguous): evidence B/sqrt(n), cut = that boundary
    res = [[0.0, -1, 0] for _ in range(W - 1)]
    for k in range(1, J):
        if B[k][0] <= 0: continue
        gs = [g for g, (lo, hi) in enumerate(ranges) if lo <= k <= hi]
        if not gs: continue
        share = B[k][0] / math.sqrt(len(gs))
        for g in gs:
            if share > res[g][0]: res[g] = [round(share, 1), B[k][1], len(gs)]
    return res
if __name__ == '__main__':
    gold = json.load(open(os.path.join(ROOT, 'data/validation/meaning-reference.json')))['ayahs']
    THR = float(sys.argv[1]) if len(sys.argv) > 1 else 2.0
    tot = {'tp': 0, 'fp': 0, 'fn': 0}
    for key, g in gold.items():
        s, a = map(int, key.split(':')); ev = evidence(s, a)
        M = set(g['major']); A = set(g['acceptable'])
        pred = {i for i, r in enumerate(ev) if r[0] >= THR}
        tp = len(pred & M); fp = len(pred - M - A); fn = len(M - pred)
        tot['tp'] += tp; tot['fp'] += fp; tot['fn'] += fn
        print(f"{key}: English-only (E>=2) pred={sorted(pred)} major={sorted(M)} tp={tp} fp={fp} fn={fn}")
    p = tot['tp'] / max(1, tot['tp'] + tot['fp']); r = tot['tp'] / max(1, tot['tp'] + tot['fn'])
    print('English-only E>=2 over reference set: precision %.2f recall %.2f' % (p, r))
