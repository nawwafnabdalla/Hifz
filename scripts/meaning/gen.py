import os
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.cache'); os.makedirs(CACHE, exist_ok=True)
import sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_evidence import evidence, Q, T
out = {}; n = 0
for s in range(1, 115):
    for a in range(1, len(Q[s-1]) + 1):
        W = len(Q[s-1][a-1].split(' '))
        if W <= 12: continue
        ev = evidence(s, a)
        if ev is None: continue
        e = {str(g): [int(round(r[0] * 10)), r[1]] for g, r in enumerate(ev) if r[0] > 0}
        out[f'{s}:{a}'] = {'n': W, 't': len(T[s-1][a-1]), 'e': e}; n += len(e)
json.dump({'schema': 1, 'what': 'English clause-boundary evidence mapped onto Arabic word gaps; e[g] = [strength*10, char offset in the translation where the English clause starts]. Derived offline by a learned Arabic-English word alignment of the Qur\'an with the shipped Saheeh translation. Evidence only; never a ruling.', 'ayahs': out}, open(os.path.join(ROOT, 'src/data/generated/meaning-evidence.json'), 'w'), separators=(',', ':'))
print(len(out), 'ayahs', n, 'gap entries')
