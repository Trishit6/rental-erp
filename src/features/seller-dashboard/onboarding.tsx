import { useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, Loader2, ShieldCheck, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/client";
import { useBecomeSeller, useSellerStatus } from "./query";

/**
 * `/dashboard/become-a-seller` — start selling.
 *
 * ## Why this page exists at all
 *
 * `requireSeller` sends a signed-in customer here instead of to `/`. Bouncing
 * them to the home page with no explanation is how a marketplace loses a seller
 * who was one click away; and the alternative — letting every `/dashboard/*` route
 * render for a customer — is what produced panels that 403'd on first load.
 *
 * ## What it asks for, and what it refuses to
 *
 * Three fields, matching the three meaningful columns on `seller_profiles`:
 * bio, location, and a response-time promise. **No** tax id, **no** bank account,
 * **no** identity document, **no** address proof — the marketplace has no use for
 * them, and an onboarding form is the last place to start collecting what nobody
 * asked for. `verified` is an admin fact about the account and is not settable
 * here, so it is not shown either: a tick that could be granted by clicking is
 * not a verification.
 *
 * Everything except the location is optional. Requiring a seller to write a bio
 * before they have sold anything is asking for content they do not yet have; the
 * shopfront renders an empty state instead, and they can fill it in later from
 * settings.
 *
 * ## The redirect is the user's, not ours
 *
 * `?redirect=` comes back from whichever guarded page sent them here, so someone
 * who clicked "List an item" lands on the listing form rather than a dashboard
 * they did not ask for. It is only ever used as a client-side path, and only when
 * it is a same-origin absolute path starting with a single `/` — otherwise it is
 * dropped, so a crafted link cannot bounce a freshly-onboarded seller off-site
 * through our own success screen.
 */
export function BecomeSellerPage() {
  const navigate = useNavigate();
  const { redirect: redirectTo } = useSearch({ from: "/dashboard/become-a-seller" });
  const { data: status } = useSellerStatus();
  const becomeSeller = useBecomeSeller();

  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");
  const [responseRateHours, setResponseRateHours] = useState("");
  const [error, setError] = useState<string | null>(null);

  const hours = responseRateHours.trim() === "" ? null : Number(responseRateHours);
  const hoursValid = hours === null || (Number.isInteger(hours) && hours >= 1 && hours <= 168);

  /**
   * Reported inline against the field, not only in the form-level alert.
   *
   * A seller who types `0` needs to know *which* box is wrong while the cursor is
   * still in it; a single "something went wrong" banner at the bottom of the card
   * makes them hunt. Only shown once something has been typed, so an untouched
   * optional field is never flagged as an error before it has been a field at all.
   */
  const hoursError =
    responseRateHours.trim() !== "" && !hoursValid
      ? "Use a whole number of hours between 1 and 168 — 6 means about a quarter of a day."
      : null;

  async function submit() {
    setError(null);
    if (hoursError) {
      setError(hoursError);
      return;
    }
    try {
      await becomeSeller.mutateAsync({
        location: location.trim() || undefined,
        bio: bio.trim() || undefined,
        responseRateHours: hours,
      });
      void navigate({ to: safeRedirect(redirectTo, "/dashboard") });
    } catch (submitError) {
      setError(
        submitError instanceof ApiError || submitError instanceof Error
          ? submitError.message
          : "Couldn't finish setting up your shop.",
      );
    }
  }

  return (
    <div className="page-wrap max-w-2xl space-y-6 pb-10 pt-8">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="space-y-6"
      >
        <header>
          <p className="eyebrow">Sell on Revaro</p>
          <h1 className="section-title mt-1 text-3xl sm:text-4xl">Sell your product</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A couple of details and you're ready to list your item. You can update them anytime, and
            your listing remains yours.
          </p>
        </header>

        <Card className="space-y-5 p-5 sm:p-6">
          {status && !status.isSeller && status.profile?.bio ? (
            <p className="rounded-2xl bg-primary/10 px-4 py-3 text-sm">
              You've already written a shopfront description — we'll keep it.
            </p>
          ) : null}

          <label className="block space-y-1.5">
            <span className="block text-sm font-bold">Where are you based?</span>
            <Input
              id="seller-location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Koramangala, Bengaluru"
              maxLength={120}
              aria-describedby="seller-location-hint"
            />
            <span id="seller-location-hint" className="block text-xs text-muted-foreground">
              Shown on your shopfront so buyers know roughly how far away you are.
            </span>
          </label>

          <label className="block space-y-1.5">
            <span className="block text-sm font-bold">Tell buyers about your shop</span>
            <Textarea
              id="seller-bio"
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              rows={4}
              maxLength={500}
              placeholder="Furniture and vintage lighting. I pack everything myself and can deliver across the neighbourhood."
              aria-describedby="seller-bio-hint"
            />
            <span id="seller-bio-hint" className="block text-xs text-muted-foreground">
              Optional for now — you can write this after your first listing.
            </span>
          </label>

          <label className="block space-y-1.5">
            <span className="block text-sm font-bold">Typical reply time</span>
            <Input
              id="seller-hours"
              inputMode="numeric"
              value={responseRateHours}
              onChange={(event) => setResponseRateHours(event.target.value)}
              placeholder="6"
              className="max-w-32"
              aria-invalid={hoursError ? true : undefined}
              aria-describedby={hoursError ? "seller-hours-error" : "seller-hours-hint"}
            />
            {hoursError ? (
              <span
                id="seller-hours-error"
                className="block text-xs font-semibold text-destructive"
              >
                {hoursError}
              </span>
            ) : (
              <span id="seller-hours-hint" className="block text-xs text-muted-foreground">
                In hours, 1 to 168 (a week). Leave it blank if you'd rather not say.
              </span>
            )}
          </label>

          {error && (
            <p
              role="alert"
              className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive"
            >
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => void submit()} disabled={becomeSeller.isPending}>
              {becomeSeller.isPending ? (
                <Loader2 size={15} aria-hidden className="animate-spin" />
              ) : (
                <Store size={15} aria-hidden />
              )}
              Start selling
            </Button>
            <Link to="/dashboard" className="nav-link text-sm font-semibold">
              Maybe later
            </Link>
          </div>
        </Card>

        <ul className="grid gap-3 sm:grid-cols-3">
          {[
            {
              icon: Store,
              title: "List anything",
              body: "Buy, rent, or both — from one listing.",
            },
            {
              icon: ShieldCheck,
              title: "Drafts first",
              body: "Nothing is public until you publish it.",
            },
            {
              icon: ArrowRight,
              title: "Set your own prices",
              body: "Deposits and commission are shown up front.",
            },
          ].map((item) => (
            <li key={item.title} className="inset-surface rounded-2xl p-4">
              <item.icon size={16} aria-hidden className="text-primary" />
              <p className="mt-2 text-sm font-bold">{item.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{item.body}</p>
            </li>
          ))}
        </ul>
      </motion.div>
    </div>
  );
}

/**
 * Where to send the seller next.
 *
 * Only a same-origin path is honoured, and only one that stays on this site:
 * `//evil.example` and `/\evil.example` are both *protocol-relative* URLs that
 * navigate off-origin while looking like an absolute path, so the check rejects
 * anything that isn't a single leading slash followed by a non-slash character.
 * Anything else falls back to the dashboard.
 */
export function safeRedirect(candidate: string | undefined, fallback: string): string {
  if (!candidate) return fallback;
  if (!candidate.startsWith("/")) return fallback;
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) return fallback;
  return candidate;
}
