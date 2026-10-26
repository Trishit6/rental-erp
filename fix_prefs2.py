p='src/features/notifications/components/NotificationPreferencesSection.tsx'
s=open(p).read()
s=s.replace('import { cn } from "@/lib/utils/cn";\n', '')
open(p,'w').write(s)
print('ok')
