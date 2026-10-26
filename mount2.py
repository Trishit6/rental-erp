p='server/index.ts'
s=open(p).read()
if 'adminReportsRoute' not in s:
    s=s.replace('import { adminSettingsRoute } from "./routes/admin-settings";', 'import { adminSettingsRoute } from "./routes/admin-settings";\nimport { adminReportsRoute } from "./routes/admin-reports";')
    s=s.replace('router.route("/api/admin", adminSettingsRoute);', 'router.route("/api/admin", adminSettingsRoute);\nrouter.route("/api/admin", adminReportsRoute);')
    open(p,'w').write(s)
print('ok')
