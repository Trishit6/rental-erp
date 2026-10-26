p='server/index.ts'
s=open(p).read()
if 'adminSettingsRoute' not in s:
    s=s.replace('import { adminRoute } from "./routes/admin";', 'import { adminRoute } from "./routes/admin";\nimport { adminSettingsRoute } from "./routes/admin-settings";')
    s=s.replace('router.route("/api/admin/taxonomy", taxonomyRoutes);', 'router.route("/api/admin/taxonomy", taxonomyRoutes);\nrouter.route("/api/admin", adminSettingsRoute);')
    open(p,'w').write(s)
print('ok')
