import json
with open('queries/results/020_patients_consultations_schema.json') as f:
    d = json.load(f)
for r in d['results']:
    sec = r['rows'][0]['section'] if r['rows'] else None
    print('---', sec, '---')
    for row in r['rows']:
        keys = [k for k in row if k != 'section']
        print(' ', ' | '.join(str(row.get(k, '')) for k in keys))
