import { ClipboardCopy, KeyRound, Loader2, RefreshCw, ShieldCheck, ShieldOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth/auth-context";
import { PasswordField } from "@/features/auth/components/PasswordField";
import {
  useMfaDisableMutation,
  useMfaRegenerateRecoveryCodesMutation,
  useMfaSetupMutation,
  useMfaStatusQuery,
  useMfaVerifyMutation,
} from "@/features/auth/query";
import type { MfaSetupResult } from "@/features/auth/types";

/**
 * Two-factor authentication, the account page's second security half.
 *
 * ## Why MFA lives on the profile page
 *
 * A second factor is a property of the *account*, not of any one role — but the
 * stakes differ by role, because staff areas are MFA-mandatory (the admin gate
 * refuses a session whose account has no second factor). This card serves both:
 * the buyer who wants one and the staff member who is told to get one.
 *
 * ## What is shown exactly once
 *
 * The TOTP secret at enrolment and the recovery codes are single-display
 * credentials; the server returns them once and never again. This card shows them
 * the moment they arrive and offers a copy button, then keeps them only in local
 * state for this render of the page. There is no "get them again" path — the
 * correct replacement is "regenerate", which invalidates the old set.
 */

type MfaMode = "idle" | "enrolling" | "disable" | "regenerate";

export function MfaCard() {
  const { user } = useAuth();
  const status = useMfaStatusQuery();
  const setupMutation = useMfaSetupMutation();
  const verifyMutation = useMfaVerifyMutation();
  const disableMutation = useMfaDisableMutation();
  const regenerateMutation = useMfaRegenerateRecoveryCodesMutation();

  const [mode, setMode] = useState<MfaMode>("idle");
  const [setup, setSetup] = useState<MfaSetupResult | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [freshCodes, setFreshCodes] = useState<string[] | null>(null);

  const busy = status.isLoading;
  const pending =
    setupMutation.isPending || verifyMutation.isPending || disableMutation.isPending || regenerateMutation.isPending;

  const enabled = status.data?.enabled ?? false;
  const mustEnroll = status.data?.mustEnrollMfa ?? user?.mustEnrollMfa ?? false;

  async function handleVerify() {
    if (!setup) return;
    try {
      const result = await verifyMutation.mutateAsync(code.trim());
      setFreshCodes(result.recoveryCodes);
      setMode("idle");
      setSetup(null);
      setCode("");
      setPassword("");
      toast.success("Two-factor authentication is on.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That code is not valid. Try again.");
    }
  }

  async function handleStartSetup() {
    try {
      setFreshCodes(null);
      const result = await setupMutation.mutateAsync();
      setSetup(result);
      setMode("enrolling");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to start setup. Try again.");
    }
  }

  async function handleDisable() {
    try {
      const result = await disableMutation.mutateAsync({ password, code: code.trim() });
      setMode("idle");
      setPassword("");
      setCode("");
      toast.success(
        result.mustEnrollMfa
          ? "Two-factor authentication is off. Your role requires you to enrol again to use staff areas."
          : "Two-factor authentication is off.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to turn it off. Try again.");
    }
  }

  async function handleRegenerate() {
    try {
      const result = await regenerateMutation.mutateAsync(password);
      setFreshCodes(result.recoveryCodes);
      setMode("idle");
      setPassword("");
      toast.success("New recovery codes generated. The old ones no longer work.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to regenerate codes. Try again.");
    }
  }

  async function copyCodes() {
    if (!freshCodes) return;
    try {
      await navigator.clipboard.writeText(freshCodes.join("\n"));
      toast.success("Recovery codes copied.");
    } catch {
      toast.error("Couldn't copy automatically — select and copy them from the box.");
    }
  }

  return (
    <Card className="space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-heading text-lg font-extrabold">
            <ShieldCheck size={18} aria-hidden />
            Two-factor authentication
          </h2>
          <p className="text-sm text-muted-foreground">
            An app-generated code is required after your password, so a stolen password alone
            is not enough.
          </p>
        </div>
        {!busy && (
          <span
            role="status"
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
              enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            }`}
          >
            {enabled ? "On" : "Off"}
          </span>
        )}
      </div>

      {mustEnroll && !enabled && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700">
          Your role requires a second factor before you can use staff areas. Set it up here.
        </p>
      )}

      {/* Fresh recovery codes — shown exactly once, right after they are created. */}
      {freshCodes && (
        <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-primary">Recovery codes</p>
          <p className="text-xs text-muted-foreground">
            Each works once, in place of your app code. Store them somewhere safe; they are only
            shown now.
          </p>
          <div
            aria-label="Recovery codes"
            className="grid grid-cols-2 gap-1 font-mono text-sm font-bold tracking-wide"
          >
            {freshCodes.map((fresh) => (
              <span key={fresh}>{fresh}</span>
            ))}
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={() => void copyCodes()}>
            <ClipboardCopy size={14} aria-hidden />
            Copy all
          </Button>
        </div>
      )}

      {busy ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 size={15} className="animate-spin" aria-hidden />
          Checking your account…
        </p>
      ) : mode === "enrolling" && setup ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Open your authenticator app and add this account with the secret below (or scan the
            setup link), then confirm with the code it shows.
          </p>
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Setup secret</p>
            <code className="block break-all rounded-md bg-muted px-3 py-2 font-mono text-sm">
              {setup.secret}
            </code>
            <a
              href={setup.otpauthUrl}
              className="mt-1 block break-all text-xs font-semibold text-primary underline"
            >
              Open in authenticator
            </a>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-bold">Code</span>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6 digits"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={pending}
                className="w-40"
              />
            </label>
            <Button type="button" onClick={() => void handleVerify()} disabled={pending || code.length < 6}>
              {pending ? (
                <>
                  <Loader2 size={15} className="animate-spin" aria-hidden />
                  Verifying…
                </>
              ) : (
                <>
                  <KeyRound size={15} aria-hidden />
                  Turn on
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setMode("idle");
                setSetup(null);
                setCode("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : mode === "disable" ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Turning it off needs your password and a current code. Staff accounts are flagged to
            enrol again immediately.
          </p>
          <div className="max-w-md space-y-3">
            <PasswordField
              label="Password"
              value={password}
              onChange={setPassword}
              onBlur={() => undefined}
              disabled={pending}
              autoComplete="current-password"
            />
            <label className="block">
              <span className="mb-1 block text-sm font-bold">Current code</span>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6 digits"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={pending}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="destructive" onClick={() => void handleDisable()} disabled={pending || code.length < 6 || !password}>
              {pending ? (
                <>
                  <Loader2 size={15} className="animate-spin" aria-hidden />
                  Turning off…
                </>
              ) : (
                <>
                  <ShieldOff size={15} aria-hidden />
                  Turn off
                </>
              )}
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </div>
        </div>
      ) : mode === "regenerate" ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Regenerating invalidates your existing recovery codes. Confirm with your password.
          </p>
          <div className="max-w-md">
            <PasswordField
              label="Password"
              value={password}
              onChange={setPassword}
              onBlur={() => undefined}
              disabled={pending}
              autoComplete="current-password"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => void handleRegenerate()} disabled={pending || !password}>
              {pending ? (
                <>
                  <Loader2 size={15} className="animate-spin" aria-hidden />
                  Regenerating…
                </>
              ) : (
                <>
                  <RefreshCw size={15} aria-hidden />
                  Regenerate codes
                </>
              )}
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </div>
        </div>
      ) : enabled ? (
        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            {status.data
              ? `${status.data.recoveryCodesRemaining} unused recovery code${
                  status.data.recoveryCodesRemaining === 1 ? "" : "s"
                } remaining.`
              : ""}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={() => setMode("regenerate")}>
              <RefreshCw size={15} aria-hidden />
              Regenerate recovery codes
            </Button>
            <Button type="button" variant="secondary" onClick={() => setMode("disable")}>
              <ShieldOff size={15} aria-hidden />
              Turn off
            </Button>
          </div>
        </div>
      ) : (
        <div className="border-t border-border pt-4">
          <Button type="button" onClick={() => void handleStartSetup()} disabled={setupMutation.isPending}>
            {setupMutation.isPending ? (
              <>
                <Loader2 size={15} className="animate-spin" aria-hidden />
                Preparing…
              </>
            ) : (
              <>
                <ShieldCheck size={15} aria-hidden />
                Set up two-factor authentication
              </>
            )}
          </Button>
        </div>
      )}
    </Card>
  );
}