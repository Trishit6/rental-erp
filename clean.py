p='server/routes/admin-taxonomy-routes.ts'
s=open(p).read()
s=s.replace('import { HttpError } from "../lib/api";\n','')
s=s.replace('import { HttpError } from "../lib/api";\r\n','')
open(p,'w').write(s)
print('ok')
