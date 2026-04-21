import json
with open('tests/results/last-run.json') as f:
    d = json.load(f)
def walk(suites):
    for s in suites:
        for spec in s.get('specs', []):
            for t in spec.get('tests', []):
                for r in t.get('results', []):
                    if r.get('status') != 'passed':
                        err = (r.get('error') or {}).get('message','')
                        print('='*80)
                        print('TEST:', spec['title'])
                        print(err[:1500])
                        print()
        walk(s.get('suites', []))
walk(d.get('suites', []))
