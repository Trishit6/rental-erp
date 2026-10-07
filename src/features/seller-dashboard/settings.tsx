import { useState } from "react";
import { Loader2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/client";
import { useOwnSellerProfile, useUpdateSellerProfile } from "./query";

/**
 * Seller settings — `/seller/settings`.
 *
 * The shopfront is the one thing about a seller that a *stranger* reads: their
 * name, their bio, how long they usually take to reply. Everything on this page
 * is therefore a public statement, and the page says so — a seller writing a bio
 * is writing it for buyers, and "this is visible to everyone" is a material fact
 * about where the text goes.
 *
 * ## Why there is no notification or payout section
 *
 * Neither exists. `seller_profiles` has four meaningful columns and there is no
 * payout table in the schema, so a settings page with greyed-out "Payout method —
 * coming soon" rows would be a page describing software that is not here. What
 * is editable is what the seller can actually change.
 *
 * The one field this form deliberately does **not** expose is `verified`. It is an
 * admin fact about an account, not something a seller sets, and a tick that
 * appears when you click something is not a verification.
 */
export function SellerSettingsPage() {
  const { data: profile, isLoading } = useOwnSellerProfile();
  const updateProfile = useUpdateSellerProfile();

  const [bio, setBio] = useState<string | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [responseRateHours, setResponseRateHours] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Seeded from the loaded record, once. Deriving during render rather than in an
  // effect means the first paint already holds the seller's own words, instead of
  // showing an empty form for a frame and then replacing the box they were
  // typing into.
  const [seededFor, setSeededFor] = useState<number | null>(null);
  if (profile && seededFor !== profile.userId) {
    setSeededFor(profile.userId);
    setBio(profile.bio ?? "");
    setLocation(profile.location ?? "");
    setResponseRateHours(
      profile.responseRateHours === null ? "" : String(profile.responseRateHours),
    );
  }

  const hours = (responseRateHours ?? "").trim() === "" ? null : Number(responseRateHours);
  const hoursValid = hours === null || (Number.isInteger(hours) && hours >= 1 && hours <= 168);

  const bioValue = bio ?? "";
  const locationValue = location ?? "";
  const hoursValue = responseRateHours ?? "";

  async function submit() {
    setError(null);
    if (!hoursValid) {
      setError("Reply time should be a whole number of hours between 1 and 168.");
      return;
    }
    try {
      await updateProfile.mutateAsync({
        // Empty is stored as `NULL`, not `""`, so the shopfront can tell "wrote
        // nothing" from "wrote a space".
        bio: bioValue.trim() || null,
        location: locationValue.trim() || null,
        responseRateHours: hours,
      });
    } catch (submitError) {
      setError(
        submitError instanceof ApiError || submitError instanceof Error
          ? submitError.message
          : "Couldn't save your shopfront.",
      );
    }
  }

  if (isLoading) {
    return (
      <div className="page-wrap max-w-2xl space-y-5 pt-8" aria-busy="true">
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="h-9 w-48 animate-pulse rounded bg-muted" />
        <Card className="space-y-4 p-6">
          <div className="h-24 w-full animate-pulse rounded-2xl bg-muted" />
          <div className="h-11 w-full animate-pulse rounded-full bg-muted" />
        </Card>
        <span className="sr-only">Loading your shopfront…</span>
      </div>
    );
  }

  return (
    <div className="page-wrap max-w-2xl space-y-6 pb-10 pt-8">
      <header>
        <p className="eyebrow">How buyers see you</p>
        <h1 className="section-title mt-1 text-3xl sm:text-4xl">Shopfront settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This is public. Anyone who opens one of your listings can read it.
        </p>
      </header>

      <Card className="space-y-5 p-5 sm:p-6">
        <label className="block space-y-1.5">
          <span className="block text-sm font-bold">Your description</span>
          <Textarea
            value={bioValue}
            onChange={(event) => setBio(event.target.value)}
            rows={5}
            maxLength={500}
            placeholder="Furniture and vintage lighting. I pack everything myself and can deliver across the neighbourhood."
          />
          <span className="block text-xs text-muted-foreground">
            {bioValue.trim().length}/500 characters. A sentence about what you sell and how you work
            is more useful than a paragraph.
          </span>
        </label>

        <label className="block space-y-1.5">
          <span className="block text-sm font-bold">Where you're based</span>
          <Input
            value={locationValue}
            onChange={(event) => setLocation(event.target.value)}
            maxLength={120}
            placeholder="Koramangala, Bengaluru"
          />
          <span className="block text-xs text-muted-foreground">
            An area, not a full address. Buyers arrange the handover with you.
          </span>
        </label>

        <label className="block space-y-1.5">
          <span className="block text-sm font-bold">Typical reply time</span>
          <Input
            inputMode="numeric"
            value={hoursValue}
            onChange={(event) => setResponseRateHours(event.target.value)}
            placeholder="6"
            className="max-w-32"
          />
          <span className="block text-xs text-muted-foreground">
            In hours, 1 to 168. Leave it blank to hide it.
          </span>
        </label>

        {error && (
          <p
            role="alert"
            className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive"
          >
            {error}
          </p>
        )}

        <Button type="button" onClick={() => void submit()} disabled={updateProfile.isPending}>
          {updateProfile.isPending ? (
            <Loader2 size={15} aria-hidden className="animate-spin" />
          ) : (
            <Store size={15} aria-hidden />
          )}
          Save shopfront
        </Button>
      </Card>

      {profile?.verified && (
        <Card className="p-5">
          <p className="text-sm font-bold">Your account is verified</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Verification is done by the Revaro team and shown as a badge on your shopfront. It isn't
            something you can set yourself.
          </p>
        </Card>
      )}
    </div>
  );
}
