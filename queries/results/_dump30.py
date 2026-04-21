import json
with open('queries/results/030_status_audit.json') as f:
    d = json.load(f)
print('status:', d['status'])
for r in d['results']:
    sec = r['rows'][0].get('section') if r['rows'] else '?'
    print('---', sec, '---')
    for row in r['rows']:
        print(' ', {k:v for k,v in row.items() if k != 'section'})
