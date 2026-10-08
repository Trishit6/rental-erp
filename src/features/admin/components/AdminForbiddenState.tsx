import { Link } from "@tanstack/react-router";
import { ArrowLeft, LayoutDashboard, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * The 403 page — what a signed-in non-admin sees at `/admin`.
 *
 * ## Why this exists as a page and not an alert on the dashboard
 *
 * The guard sends a USER or SELLER who opens `/admin` here *instead of* their
 * dashboard, because "you are not allowed in here" is the message, and a redirect
 * that lands somewhere unrelated reads as a broken link. The page is deliberately
 * bare — no sidebar, no admin navigation — and carries only the two ways out.
 *
 * It never prints why in the server's vocabulary and never dumps error details: the
 * failure mode it serves (a customer typed the address) benefits from reassurance,
 * not a stack trace.
 */
export function AdminForbiddenState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md p-8 text-center">
        <span className="soft-button mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ShieldOff size={24} aria-hidden />
        </span>
        <h1 className="section-title mt-4 text-2xl font-extrabold">Access restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to access the Revaro Admin Workspace.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild variant="secondary">
            <Link to="/">
              <ArrowLeft size={15} aria-hidden />
              Back to Revaro
            </Link>
          </Button>
          <Button asChild>
            <Link to="/dashboard">
              <LayoutDashboard size={15} aria-hidden />
              Go to Dashboard
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}