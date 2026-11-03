import os
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.cache'); os.makedirs(CACHE, exist_ok=True)
import json, re, unicodedata, math, collections, sys, pickle
Q = json.load(open(os.path.join(ROOT, 'src/data/generated/quran.json')))['text']
T = json.load(open(os.path.join(ROOT, 'src/data/generated/translation-en.json')))['text']
def skeleton(w):
    w = unicodedata.normalize('NFKD', w)
    w = ''.join(c for c in w if not unicodedata.category(c).startswith('M') and c not in 'ـۖۗۘۙۚۛۜ۞۩')
    w = re.sub('[آأإٱ]', 'ا', w).replace('ى', 'ي').replace('ؤ','و').replace('ئ','ي')
    return re.sub(r'[^ء-ي]', '', w)
def ar_tokens(word):
    s = skeleton(word); toks = []
    # clitics: و ف as separate tokens when enough letters remain; definite article dropped
    while len(s) > 3 and s[0] in 'وف' and s[1:3] != 'ال' or (len(s) > 3 and s[0] in 'وف'):
        toks.append(s[0]); s = s[1:]
        if len(toks) >= 2: break
    if s.startswith('ال') and len(s) > 3: s = s[2:]
    elif s.startswith('لل') and len(s) > 3: s = 'ل' + s[2:]
    toks.append(s)
    return toks
EN_TOK = re.compile(r"\[|\]|[A-Za-z][A-Za-z'’\-]*|[,;:.?!\"“”‘’()\-–—]")
def en_tokens(text):
    out = []; depth = 0
    for m in EN_TOK.finditer(text):
        t = m.group(0)
        if t == '[': depth += 1; continue
        if t == ']': depth = max(0, depth - 1); continue
        out.append({'t': t.lower(), 'raw': t, 'ins': depth > 0, 'pos': m.start(), 'end': m.end(), 'word': t[0].isalpha()})
    return out
def prep(s, a):
    words = Q[s-1][a-1].split(' ')
    atoks = []; wmap = []
    for i, w in enumerate(words):
        for t in ar_tokens(w): atoks.append(t); wmap.append(i)
    et = en_tokens(T[s-1][a-1])
    return words, atoks, wmap, et
if __name__ == '__main__':
    pairs = []
    for s in range(1, 115):
        for a in range(1, len(Q[s-1]) + 1):
            words, atoks, wmap, et = prep(s, a)
            ew = [e['t'] for e in et if e['word'] and not e['ins']]
            pairs.append((atoks, ew))
    # IBM model 1 with NULL, 8 iterations
    tprob = collections.defaultdict(lambda: 1e-3)
    NULL = '<null>'
    vocab_e = set(e for _, ew in pairs for e in ew)
    # init uniform
    for it in range(8):
        cnt = collections.defaultdict(float); tot = collections.defaultdict(float)
        for atoks, ew in pairs:
            src = [NULL] + atoks
            for e in ew:
                z = sum(tprob[(e, f)] for f in src)
                for f in src:
                    c = tprob[(e, f)] / z
                    cnt[(e, f)] += c; tot[f] += c
        tprob = collections.defaultdict(lambda: 1e-6, {k: v / tot[k[1]] for k, v in cnt.items()})
        print('iter', it, len(tprob), file=sys.stderr)
    pickle.dump(dict(tprob), open(os.path.join(CACHE, 't.pkl'), 'wb'))
