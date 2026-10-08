import { Settings as SettingsIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AdminPageHeader } from "../components/AdminLayout";

/**
 * `/admin/settings` — platform settings foundation.
 *
 * ## Why it is a foundation and not a settings form
 *
 * There are no platform-settings rows in the database yet, and this feature does not
 * invent any: a table of meaningless toggles would be fake data wearing a settings
 * page. What the platform *does* configure today — marketplace fee rates, payment
 * provider credentials — lives in server environment variables, and exposing raw
 * environment values (or worse, letting them be edited from a browser) would leak
 * secrets or introduce a second, competing source of truth.
 *
 * So the page states what it is: the home of the settings module, which the next
 * feature builds on top of the server data it adds. Nothing here is a stored toggle.
 */
export function AdminSettingsPage() {
  return (
    <div className="space-y-5 pb-10">
      <AdminPageHeader
        eyebrow="Platform"
        title="Settings"
        description="Platform-level configuration. The settings module is being prepared."
      />

      <Card className="p-8 text-center">
        <span className="soft-button mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <SettingsIcon size={20} aria-hidden />
        </span>
        <h2 className="section-title mt-4 text-xl font-extrabold">
          Platform settings are being prepared
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Marketplace fee rates and payment configuration are currently server-side
          environment settings. The settings module will surface them here once it
          lands — with real values, never invented ones.
        </p>
      </Card>
    </div>
  );
}