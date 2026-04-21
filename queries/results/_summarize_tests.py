import json
with open('tests/results/last-run.json') as f:
    d = json.load(f)
counts = {'passed':0,'failed':0,'skipped':0,'timedOut':0}
fails = []
def walk(suites):
    for s in suites:
        for spec in s.get('specs', []):
            for t in spec.get('tests', []):
                for r in t.get('results', []):
                    st = r.get('status','?')
                    counts[st] = counts.get(st,0)+1
                    if st != 'passed':
                        err = (r.get('error') or {}).get('message','')[:400]
                        fails.append((spec['title'], st, err))
        walk(s.get('suites', []))
walk(d.get('suites', []))
print('SUMMARY:', counts, 'TOTAL:', sum(counts.values()))
print()
print('FAILURES:')
for t, st, e in fails:
    first_line = e[:400].splitlines()[0] if e else ''
    print('  [' + st + ']', t)
    if first_line:
        print('        ->', first_line)
