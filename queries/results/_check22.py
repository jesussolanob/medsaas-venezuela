import json
with open('queries/results/022_packages_schema.json') as f:
    d = json.load(f)
print('status:', d['status'])
if d['status'] != 'success':
    print('error:', d.get('error'))
last = d['results'][-1]
for r in last.get('rows', []):
    print(r)
