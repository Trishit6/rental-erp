p='server/lib/reports/registry.ts'
s=open(p).read()
for key in ['revenue','orders','rentals','users','sellers','products','coupons','refunds','support','payouts']:
    # crude: add if missing
    pass
# just add filterSchema
s2 = s.replace('    pii: true,\n    columns:', '    pii: true,\n    filterSchema: baseFilter,\n    columns:')
s3 = s2.replace('    columns:', '    filterSchema: baseFilter,\n    columns:')
# first replacement affects others? do targeted
open(p,'w').write(s2)
print('ok')
