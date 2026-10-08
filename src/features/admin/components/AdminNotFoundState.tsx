import { Link } from "@tanstack/react-router";
import { Compass, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * The admin not-found state, rendered inside the workspace shell.
 *
 * An unknown `/admin/*` address (a typo, a stale bookmark) keeps the admin chrome —
 * it *is* the admin workspace, just a page in it that does not exist — so the
 * administrator can see the shape of the place they were trying to get to. "Back to
 * the dashboard" is the only action: a not-found page listing modules would be
 * duplicating the sidebar, which is right there.
 */
export function AdminNotFoundState() {
  return (
    <div className="py-14">
      <Card className="mx-auto w-full max-w-md p-8 text-center">
        <span className="soft-button mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Compass size={24} aria-hidden />
        </span>
        <h1 className="section-title mt-4 text-2xl font-extrabold">Admin page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The address you opened does not match any part of the admin workspace.
        </p>
        <div className="mt-6 flex justify-center">
          <Button asChild>
            <Link to="/admin">
              <LayoutDashboard size={15} aria-hidden />
              Back to Admin Dashboard
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}